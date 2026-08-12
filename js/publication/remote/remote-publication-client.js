/* CRIOS Publication Remote - transport client */
(function(){
  'use strict';

  var VERSION = '1.0.0';
  var ERROR_CODES = Object.freeze({
    CLIENT_UNAVAILABLE: 'REMOTE_CLIENT_UNAVAILABLE',
    TRANSPORT_FAILED: 'REMOTE_TRANSPORT_FAILED',
    HTTP_ERROR: 'REMOTE_HTTP_ERROR',
    RESPONSE_PARSE_FAILED: 'REMOTE_RESPONSE_PARSE_FAILED',
    AUTH_UNAVAILABLE: 'WRITE_UNAUTHORIZED',
    INSECURE_CONTEXT: 'INSECURE_CONTEXT'
  });

  function clone(value) {
    if (value === null || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map(clone);
    var copy = {};
    Object.keys(value).forEach(function(key){ copy[key] = clone(value[key]); });
    return copy;
  }

  function freeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.keys(value).forEach(function(key){ freeze(value[key]); });
    return Object.freeze(value);
  }

  function frozen(value) {
    return freeze(clone(value));
  }

  function text(value) {
    return typeof value === 'string' ? value.trim() : '';
  }

  function errorPayload(code, message, retryable, metadata) {
    return frozen({
      code: String(code || ERROR_CODES.TRANSPORT_FAILED),
      message: String(message || code || 'Remote publication transport failed.'),
      retryable: Boolean(retryable),
      metadata: metadata == null ? null : metadata
    });
  }

  function result(success, requestId, data, error) {
    return frozen({
      success: Boolean(success),
      requestId: String(requestId || ''),
      data: success ? data : null,
      error: success ? null : error
    });
  }

  function validEndpoint(value) {
    var endpoint = text(value);
    return endpoint && !/[\u0000-\u001F\u007F]/.test(endpoint) ? endpoint : '';
  }

  function defaultRequestIdFactory(operation) {
    var suffix = '';
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      suffix = window.crypto.randomUUID();
    } else {
      suffix = String(Date.now()) + '-' + Math.random().toString(36).slice(2);
    }
    return 'crios-' + String(operation || 'remote') + '-' + suffix;
  }

  function createClient(options) {
    var opts = options && typeof options === 'object' ? options : {};
    var contract = opts.contract || window.CRIOS_REMOTE_PUBLICATION_CONTRACT || null;
    var endpoint = validEndpoint(opts.endpoint);
    var fetchImpl = typeof opts.fetchImpl === 'function'
      ? opts.fetchImpl
      : (typeof window.fetch === 'function' ? window.fetch.bind(window) : null);
    var writeTokenProvider = typeof opts.writeTokenProvider === 'function'
      ? opts.writeTokenProvider
      : function(){ return ''; };
    var requestIdFactory = typeof opts.requestIdFactory === 'function'
      ? opts.requestIdFactory
      : defaultRequestIdFactory;
    var timeoutMs = Number.isFinite(Number(opts.timeoutMs)) && Number(opts.timeoutMs) > 0
      ? Math.floor(Number(opts.timeoutMs))
      : 15000;

    function available() {
      return Boolean(contract && endpoint && fetchImpl &&
        typeof contract.createPublishRequest === 'function' &&
        typeof contract.createActivateRequest === 'function' &&
        typeof contract.createDeactivateRequest === 'function' &&
        typeof contract.createGetPublicationRequest === 'function' &&
        typeof contract.parseResponse === 'function');
    }

    function createRequestId(operation, supplied) {
      var explicit = text(supplied);
      if (explicit) return explicit;
      var generated = text(requestIdFactory(operation));
      if (!generated) throw new Error('requestIdFactory returned an empty id.');
      return generated;
    }

    async function token() {
      var value = writeTokenProvider();
      if (value && typeof value.then === 'function') value = await value;
      return text(value);
    }

    function clientUnavailable(requestId) {
      return result(false, requestId, null, errorPayload(
        ERROR_CODES.CLIENT_UNAVAILABLE,
        'Remote publication client is not configured.',
        false,
        null
      ));
    }

    async function fetchText(url, init) {
      var timer = null;
      var controller = null;
      var requestInit = Object.assign({}, init || {});

      if (typeof AbortController === 'function' && timeoutMs > 0) {
        controller = new AbortController();
        requestInit.signal = controller.signal;
        timer = setTimeout(function(){ controller.abort(); }, timeoutMs);
      }

      try {
        var response = await fetchImpl(url, requestInit);
        if (!response || typeof response.text !== 'function') {
          return { ok: false, status: 0, text: '', error: errorPayload(ERROR_CODES.TRANSPORT_FAILED, 'Remote fetch returned an invalid response object.', true, null) };
        }
        var body = await response.text();
        if (response.ok === false) {
          var status = Number(response.status || 0);
          return {
            ok: false,
            status: status,
            text: body,
            error: errorPayload(ERROR_CODES.HTTP_ERROR, 'Remote publication endpoint returned HTTP ' + status + '.', status === 0 || status === 408 || status === 429 || status >= 500, { status: status })
          };
        }
        return { ok: true, status: Number(response.status || 200), text: body, error: null };
      } catch (error) {
        var aborted = Boolean(error && (error.name === 'AbortError' || error.code === 'ABORT_ERR'));
        return {
          ok: false,
          status: 0,
          text: '',
          error: errorPayload(
            ERROR_CODES.TRANSPORT_FAILED,
            aborted ? 'Remote publication request timed out.' : String(error && error.message || error || 'Remote publication transport failed.'),
            true,
            { timeout: aborted }
          )
        };
      } finally {
        if (timer !== null) clearTimeout(timer);
      }
    }

    function parseBody(body, request, requestId) {
      var raw;
      try {
        raw = JSON.parse(String(body || ''));
      } catch (error) {
        return result(false, requestId, null, errorPayload(
          ERROR_CODES.RESPONSE_PARSE_FAILED,
          'Remote publication response is not valid JSON.',
          true,
          { message: String(error && error.message || error) }
        ));
      }

      var parsed = contract.parseResponse(raw, request);
      if (!parsed || parsed.accepted !== true || !parsed.response) {
        var rejected = parsed && parsed.error ? parsed.error : null;
        return result(false, requestId, null, errorPayload(
          rejected && rejected.code || ERROR_CODES.RESPONSE_PARSE_FAILED,
          rejected && rejected.message || 'Remote publication response failed contract validation.',
          false,
          null
        ));
      }

      if (!parsed.response.success) {
        return result(false, requestId, null, errorPayload(
          parsed.response.error.code,
          parsed.response.error.message,
          parsed.response.error.retryable,
          null
        ));
      }

      return result(true, requestId, parsed.response.data, null);
    }

    async function executeWrite(request) {
      var requestId = request && request.requestId ? request.requestId : '';
      if (!available()) return clientUnavailable(requestId);

      var writeToken;
      try {
        writeToken = await token();
      } catch (error) {
        return result(false, requestId, null, errorPayload(
          text(error && error.code) === ERROR_CODES.INSECURE_CONTEXT ? ERROR_CODES.INSECURE_CONTEXT : ERROR_CODES.AUTH_UNAVAILABLE,
          String(error && error.message || 'Teacher write authorization is unavailable.'),
          false,
          null
        ));
      }

      if (!writeToken) {
        return result(false, requestId, null, errorPayload(
          ERROR_CODES.AUTH_UNAVAILABLE,
          'Teacher write authorization is required.',
          false,
          null
        ));
      }

      var transport = await fetchText(endpoint, {
        method: 'POST',
        credentials: 'omit',
        cache: 'no-store',
        redirect: 'follow',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ request: request, writeToken: writeToken })
      });

      if (!transport.ok) return result(false, requestId, null, transport.error);
      return parseBody(transport.text, request, requestId);
    }

    async function executeRead(request) {
      var requestId = request && request.requestId ? request.requestId : '';
      if (!available()) return clientUnavailable(requestId);

      var payload = request.payload || {};
      var separator = endpoint.indexOf('?') >= 0 ? '&' : '?';
      var url = endpoint + separator + [
        'accion=getPublication',
        'protocolVersion=' + encodeURIComponent(request.protocolVersion),
        'operation=' + encodeURIComponent(request.operation),
        'requestId=' + encodeURIComponent(request.requestId),
        'campaignId=' + encodeURIComponent(payload.campaignId || ''),
        'publicationId=' + encodeURIComponent(payload.publicationId || ''),
        '_=' + encodeURIComponent(String(Date.now()))
      ].join('&');

      var transport = await fetchText(url, {
        method: 'GET',
        credentials: 'omit',
        cache: 'no-store',
        redirect: 'follow'
      });

      if (!transport.ok) return result(false, requestId, null, transport.error);
      return parseBody(transport.text, request, requestId);
    }

    async function publishPublication(input, callOptions) {
      var optsCall = callOptions && typeof callOptions === 'object' ? callOptions : {};
      var requestId;
      try {
        requestId = createRequestId('publish', optsCall.requestId);
      } catch (error) {
        return result(false, '', null, errorPayload(ERROR_CODES.CLIENT_UNAVAILABLE, error.message, false, null));
      }
      if (!available()) return clientUnavailable(requestId);
      var request;
      try {
        request = contract.createPublishRequest(input, requestId);
      } catch (errorRequest) {
        return result(false, requestId, null, errorPayload('INVALID_REQUEST', String(errorRequest && errorRequest.message || errorRequest), false, null));
      }
      return executeWrite(request);
    }

    async function activatePublication(campaignId, publicationId, callOptions) {
      var optsCall = callOptions && typeof callOptions === 'object' ? callOptions : {};
      var requestId;
      try {
        requestId = createRequestId('activate', optsCall.requestId);
      } catch (error) {
        return result(false, '', null, errorPayload(ERROR_CODES.CLIENT_UNAVAILABLE, error.message, false, null));
      }
      if (!available()) return clientUnavailable(requestId);
      var request;
      try {
        request = contract.createActivateRequest(campaignId, publicationId, requestId);
      } catch (errorRequest) {
        return result(false, requestId, null, errorPayload('INVALID_REQUEST', String(errorRequest && errorRequest.message || errorRequest), false, null));
      }
      return executeWrite(request);
    }

    async function deactivatePublication(campaignId, callOptions) {
      var optsCall = callOptions && typeof callOptions === 'object' ? callOptions : {};
      var requestId;
      try {
        requestId = createRequestId('deactivate', optsCall.requestId);
      } catch (error) {
        return result(false, '', null, errorPayload(ERROR_CODES.CLIENT_UNAVAILABLE, error.message, false, null));
      }
      if (!available()) return clientUnavailable(requestId);
      var request;
      try {
        request = contract.createDeactivateRequest(campaignId, requestId);
      } catch (errorRequest) {
        return result(false, requestId, null, errorPayload('INVALID_REQUEST', String(errorRequest && errorRequest.message || errorRequest), false, null));
      }
      return executeWrite(request);
    }

    async function getPublication(campaignId, publicationId, callOptions) {
      var optsCall = callOptions && typeof callOptions === 'object' ? callOptions : {};
      var requestId;
      try {
        requestId = createRequestId('get', optsCall.requestId);
      } catch (error) {
        return result(false, '', null, errorPayload(ERROR_CODES.CLIENT_UNAVAILABLE, error.message, false, null));
      }
      if (!available()) return clientUnavailable(requestId);
      var request;
      try {
        request = contract.createGetPublicationRequest(campaignId, publicationId, requestId);
      } catch (errorRequest) {
        return result(false, requestId, null, errorPayload('INVALID_REQUEST', String(errorRequest && errorRequest.message || errorRequest), false, null));
      }
      return executeRead(request);
    }

    return Object.freeze({
      publishPublication: publishPublication,
      activatePublication: activatePublication,
      deactivatePublication: deactivatePublication,
      getPublication: getPublication
    });
  }

  window.CRIOS_REMOTE_PUBLICATION_CLIENT = Object.freeze({
    version: VERSION,
    errorCodes: ERROR_CODES,
    createClient: createClient
  });
})();
