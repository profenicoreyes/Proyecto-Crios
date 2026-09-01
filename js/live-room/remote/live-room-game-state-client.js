/* CRIOS LiveRoom Game State Remote — authenticated transport and monotonic response client */
(function(){
  'use strict';

  var VERSION = '1.0.0';
  var CONTEXT_KEYS = Object.freeze([
    'roomId',
    'campaignId',
    'publicationId',
    'participantId',
    'missionOrder'
  ]);
  var ERROR_CODES = Object.freeze({
    CLIENT_UNAVAILABLE: 'LIVE_ROOM_GAME_STATE_CLIENT_UNAVAILABLE',
    CONTEXT_INVALID: 'LIVE_ROOM_GAME_STATE_CONTEXT_INVALID',
    CONTEXT_MISMATCH: 'LIVE_ROOM_GAME_STATE_CONTEXT_MISMATCH',
    TRANSPORT_FAILED: 'LIVE_ROOM_GAME_STATE_TRANSPORT_FAILED',
    HTTP_ERROR: 'LIVE_ROOM_GAME_STATE_HTTP_ERROR',
    RESPONSE_PARSE_FAILED: 'LIVE_ROOM_GAME_STATE_RESPONSE_PARSE_FAILED',
    CAPABILITY_UNAVAILABLE: 'LIVE_ROOM_GAME_STATE_CAPABILITY_UNAVAILABLE',
    REQUEST_ID_UNAVAILABLE: 'LIVE_ROOM_GAME_STATE_REQUEST_ID_UNAVAILABLE',
    SEMANTIC_INVALID: 'LIVE_ROOM_GAME_STATE_SEMANTIC_INVALID',
    RECONCILIATION_REQUIRED: 'LIVE_ROOM_GAME_STATE_RECONCILIATION_REQUIRED'
  });

  function isPlainObject(value) {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value) &&
      Object.prototype.toString.call(value) === '[object Object]');
  }

  function exactKeys(value, expected) {
    if (!isPlainObject(value)) return false;
    var actual = Object.keys(value).sort();
    var wanted = expected.slice().sort();
    return actual.length === wanted.length && actual.every(function(key, index){
      return key === wanted[index];
    });
  }

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

  function frozenCopy(value) { return freeze(clone(value)); }
  function text(value) { return typeof value === 'string' ? value.trim() : ''; }

  function errorPayload(code, message, retryable, metadata) {
    return frozenCopy({
      code: String(code || ERROR_CODES.CLIENT_UNAVAILABLE),
      message: String(message || code || 'LiveRoom game-state client failed.'),
      retryable: Boolean(retryable),
      metadata: metadata == null ? null : metadata
    });
  }

  function result(success, requestId, data, error) {
    return frozenCopy({
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

  function normalizedId(value, maxLength) {
    return typeof value === 'string' && value && value.trim() === value &&
      value.length <= maxLength && !/[\u0000-\u001F\u007F]/.test(value);
  }

  function defaultRequestIdFactory(operation) {
    var suffix = '';
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      suffix = window.crypto.randomUUID();
    } else {
      suffix = String(Date.now()) + '-' + Math.random().toString(36).slice(2);
    }
    return 'crios-live-room-game-state-' + String(operation || 'remote') + '-' + suffix;
  }

  function createClient(options) {
    var opts = isPlainObject(options) ? options : {};
    var contract = opts.contract || window.CRIOS_REMOTE_LIVE_ROOM_GAME_STATE_CONTRACT || null;
    var model = opts.model || window.CRIOS_LIVE_ROOM_GAME_STATE_MODEL || null;
    var endpoint = validEndpoint(opts.endpoint);
    var fetchImpl = typeof opts.fetchImpl === 'function'
      ? opts.fetchImpl
      : (typeof window.fetch === 'function' ? window.fetch.bind(window) : null);
    var requestIdFactory = typeof opts.requestIdFactory === 'function'
      ? opts.requestIdFactory
      : defaultRequestIdFactory;
    var credentialStore = isPlainObject(opts.credentialStore) ? opts.credentialStore : null;
    var timeoutMs = Number.isFinite(Number(opts.timeoutMs)) && Number(opts.timeoutMs) > 0
      ? Math.floor(Number(opts.timeoutMs))
      : 30000;
    var context = null;
    var contextError = null;
    var currentState = null;

    function validateContext(source) {
      if (!exactKeys(source, CONTEXT_KEYS)) {
        throw new Error('LiveRoom game-state context shape is invalid.');
      }
      var limits = contract && contract.limits ? contract.limits : {};
      if (!normalizedId(source.roomId, Number(limits.MAX_ROOM_ID_LENGTH || 160)) ||
          !normalizedId(source.campaignId, Number(limits.MAX_CAMPAIGN_ID_LENGTH || 160)) ||
          !normalizedId(source.publicationId, Number(limits.MAX_PUBLICATION_ID_LENGTH || 200)) ||
          !normalizedId(source.participantId, Number(limits.MAX_PARTICIPANT_ID_LENGTH || 160))) {
        throw new Error('LiveRoom game-state context identity is invalid or not normalized.');
      }
      if (!model || typeof model.validateMissionOrder !== 'function') {
        throw new Error('LiveRoom game-state model is unavailable.');
      }
      model.validateMissionOrder(source.missionOrder);
      return frozenCopy(source);
    }

    try {
      context = validateContext(opts.context);
    } catch (error) {
      contextError = errorPayload(
        ERROR_CODES.CONTEXT_INVALID,
        String(error && error.message || 'LiveRoom game-state context is invalid.'),
        false,
        null
      );
    }

    function available() {
      return Boolean(!contextError && context && contract && model && endpoint && fetchImpl &&
        credentialStore && typeof credentialStore.get === 'function' &&
        typeof contract.createGetLiveRoomGameStateRequest === 'function' &&
        typeof contract.createCompleteLiveRoomMissionRequest === 'function' &&
        typeof contract.parseResponse === 'function' &&
        typeof model.validateGameState === 'function' &&
        typeof model.reconcileGameState === 'function');
    }

    function configurationFailure(requestId) {
      if (contextError) return result(false, requestId, null, contextError);
      return result(false, requestId, null, errorPayload(
        ERROR_CODES.CLIENT_UNAVAILABLE,
        'LiveRoom game-state client is not configured.',
        false,
        null
      ));
    }

    function createRequestId(operation, supplied) {
      var explicit = text(supplied);
      if (explicit) return explicit;
      var generated = text(requestIdFactory(operation));
      if (!generated) throw new Error('requestIdFactory returned an empty id.');
      return generated;
    }

    function readCapability() {
      try {
        return credentialStore && typeof credentialStore.get === 'function'
          ? text(credentialStore.get(context.roomId, context.participantId))
          : '';
      } catch (ignore) {
        return '';
      }
    }

    async function fetchText(init) {
      var timer = null;
      var controller = null;
      var requestInit = Object.assign({}, init || {});
      if (typeof AbortController === 'function' && timeoutMs > 0) {
        controller = new AbortController();
        requestInit.signal = controller.signal;
        timer = setTimeout(function(){ controller.abort(); }, timeoutMs);
      }
      try {
        var response = await fetchImpl(endpoint, requestInit);
        if (!response || typeof response.text !== 'function') {
          return {
            ok: false,
            error: errorPayload(
              ERROR_CODES.TRANSPORT_FAILED,
              'LiveRoom game-state fetch returned an invalid response object.',
              true,
              null
            )
          };
        }
        var body = await response.text();
        if (response.ok === false) {
          var status = Number(response.status || 0);
          return {
            ok: false,
            error: errorPayload(
              ERROR_CODES.HTTP_ERROR,
              'LiveRoom game-state endpoint returned HTTP ' + status + '.',
              status === 0 || status === 408 || status === 429 || status >= 500,
              {status: status}
            )
          };
        }
        return {ok: true, text: body, error: null};
      } catch (error) {
        var aborted = Boolean(error && (error.name === 'AbortError' || error.code === 'ABORT_ERR'));
        return {
          ok: false,
          error: errorPayload(
            ERROR_CODES.TRANSPORT_FAILED,
            aborted ? 'LiveRoom game-state request timed out.' : 'LiveRoom game-state transport failed.',
            true,
            {timeout: aborted}
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
          'LiveRoom game-state response is not valid JSON.',
          true,
          null
        ));
      }
      var parsed = contract.parseResponse(raw, request);
      if (!parsed || parsed.accepted !== true || !parsed.response) {
        var rejected = parsed && parsed.error ? parsed.error : null;
        return result(false, requestId, null, errorPayload(
          rejected && rejected.code || ERROR_CODES.RESPONSE_PARSE_FAILED,
          rejected && rejected.message || 'LiveRoom game-state response failed contract validation.',
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

    function reconcileIncoming(incoming, requestId) {
      try {
        model.validateGameState(incoming, context.missionOrder);
      } catch (error) {
        return {
          ok: false,
          response: result(false, requestId, null, errorPayload(
            ERROR_CODES.SEMANTIC_INVALID,
            'LiveRoom game-state response failed publication-aware validation.',
            false,
            null
          ))
        };
      }

      if (incoming.roomId !== context.roomId ||
          incoming.campaignId !== context.campaignId ||
          incoming.publicationId !== context.publicationId) {
        return {
          ok: false,
          response: result(false, requestId, null, errorPayload(
            ERROR_CODES.CONTEXT_MISMATCH,
            'LiveRoom game-state response does not match the configured room publication.',
            false,
            null
          ))
        };
      }

      if (!currentState) {
        currentState = frozenCopy(incoming);
        return {ok: true, state: currentState, stateAdvanced: true};
      }

      try {
        var reconciled = model.reconcileGameState(currentState, incoming, context.missionOrder);
        currentState = frozenCopy(reconciled.state);
        return {ok: true, state: currentState, stateAdvanced: Boolean(reconciled.changed)};
      } catch (errorReconcile) {
        return {
          ok: false,
          response: result(false, requestId, null, errorPayload(
            ERROR_CODES.RECONCILIATION_REQUIRED,
            'LiveRoom game-state snapshots are inconsistent; an authoritative read is required.',
            true,
            {requiresAuthoritativeRead: true}
          ))
        };
      }
    }

    async function execute(request, includeChanged) {
      var requestId = request && request.requestId ? request.requestId : '';
      var transport = await fetchText({
        method: 'POST',
        credentials: 'omit',
        cache: 'no-store',
        redirect: 'follow',
        headers: {'Content-Type': 'text/plain;charset=utf-8'},
        body: JSON.stringify({liveRoomRequest: request})
      });
      if (!transport.ok) return result(false, requestId, null, transport.error);
      var parsed = parseBody(transport.text, request, requestId);
      if (!parsed.success) return parsed;
      var accepted = reconcileIncoming(parsed.data.gameState, requestId);
      if (!accepted.ok) return accepted.response;
      var data = {
        gameState: accepted.state,
        stateAdvanced: accepted.stateAdvanced
      };
      if (includeChanged) data.changed = parsed.data.changed;
      return result(true, requestId, data, null);
    }

    function prepareRequest(operation, suppliedRequestId) {
      var requestId;
      try {
        requestId = createRequestId(operation, suppliedRequestId);
      } catch (error) {
        return {
          ok: false,
          response: result(false, '', null, errorPayload(
            ERROR_CODES.REQUEST_ID_UNAVAILABLE,
            'LiveRoom game-state requestId generation is unavailable.',
            false,
            null
          ))
        };
      }
      if (!available()) return {ok: false, response: configurationFailure(requestId)};
      var capability = readCapability();
      if (!capability) {
        return {
          ok: false,
          response: result(false, requestId, null, errorPayload(
            ERROR_CODES.CAPABILITY_UNAVAILABLE,
            'LiveRoom capability is unavailable for this browser context.',
            false,
            null
          ))
        };
      }
      return {ok: true, requestId: requestId, capability: capability};
    }

    async function getLiveRoomGameState(callOptions) {
      var call = isPlainObject(callOptions) ? callOptions : {};
      var prepared = prepareRequest('get', call.requestId);
      if (!prepared.ok) return prepared.response;
      var request;
      try {
        request = contract.createGetLiveRoomGameStateRequest({
          roomId: context.roomId,
          participantId: context.participantId,
          capabilityToken: prepared.capability
        }, prepared.requestId);
      } catch (errorRequest) {
        return result(false, prepared.requestId, null, errorPayload(
          'INVALID_REQUEST',
          String(errorRequest && errorRequest.message || errorRequest),
          false,
          null
        ));
      }
      return execute(request, false);
    }

    async function completeLiveRoomMission(missionId, callOptions) {
      var call = isPlainObject(callOptions) ? callOptions : {};
      var prepared = prepareRequest('complete-mission', call.requestId);
      if (!prepared.ok) return prepared.response;
      var request;
      try {
        request = contract.createCompleteLiveRoomMissionRequest({
          roomId: context.roomId,
          participantId: context.participantId,
          capabilityToken: prepared.capability,
          missionId: missionId
        }, prepared.requestId);
      } catch (errorRequest) {
        return result(false, prepared.requestId, null, errorPayload(
          'INVALID_REQUEST',
          String(errorRequest && errorRequest.message || errorRequest),
          false,
          null
        ));
      }
      return execute(request, true);
    }

    return Object.freeze({
      version: VERSION,
      available: available,
      getLiveRoomGameState: getLiveRoomGameState,
      completeLiveRoomMission: completeLiveRoomMission
    });
  }

  window.CRIOS_REMOTE_LIVE_ROOM_GAME_STATE_CLIENT = Object.freeze({
    version: VERSION,
    errorCodes: ERROR_CODES,
    createClient: createClient
  });
})();
