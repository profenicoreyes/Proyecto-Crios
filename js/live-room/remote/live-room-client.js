/* CRIOS LiveRoom Remote - transport client and ephemeral capability holder */
(function(){
  'use strict';

  var VERSION = '1.0.0';
  var ERROR_CODES = Object.freeze({
    CLIENT_UNAVAILABLE: 'LIVE_ROOM_CLIENT_UNAVAILABLE',
    TRANSPORT_FAILED: 'LIVE_ROOM_TRANSPORT_FAILED',
    HTTP_ERROR: 'LIVE_ROOM_HTTP_ERROR',
    RESPONSE_PARSE_FAILED: 'LIVE_ROOM_RESPONSE_PARSE_FAILED',
    CAPABILITY_GENERATION_UNAVAILABLE: 'CAPABILITY_GENERATION_UNAVAILABLE',
    CAPABILITY_STORAGE_UNAVAILABLE: 'CAPABILITY_STORAGE_UNAVAILABLE'
  });
  var STORE_PREFIX = 'crios-live-room-capability-v1:';

  function clone(value) {
    if (value === null || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map(clone);
    var copy = {}; Object.keys(value).forEach(function(key){ copy[key] = clone(value[key]); }); return copy;
  }
  function freeze(value) { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; Object.keys(value).forEach(function(key){ freeze(value[key]); }); return Object.freeze(value); }
  function frozen(value) { return freeze(clone(value)); }
  function text(value) { return typeof value === 'string' ? value.trim() : ''; }
  function errorPayload(code, message, retryable, metadata) { return frozen({code: String(code || ERROR_CODES.TRANSPORT_FAILED), message: String(message || code || 'LiveRoom transport failed.'), retryable: Boolean(retryable), metadata: metadata == null ? null : metadata}); }
  function result(success, requestId, data, error) { return frozen({success: Boolean(success), requestId: String(requestId || ''), data: success ? data : null, error: success ? null : error}); }
  function validEndpoint(value) { var endpoint = text(value); return endpoint && !/[\u0000-\u001F\u007F]/.test(endpoint) ? endpoint : ''; }

  function defaultRequestIdFactory(operation) {
    var suffix = '';
    if (window.crypto && typeof window.crypto.randomUUID === 'function') suffix = window.crypto.randomUUID();
    else suffix = String(Date.now()) + '-' + Math.random().toString(36).slice(2);
    return 'crios-live-room-' + String(operation || 'remote') + '-' + suffix;
  }

  function defaultCapabilityFactory() {
    if (!window.crypto || typeof window.crypto.getRandomValues !== 'function') return '';
    var bytes = new Uint8Array(32); window.crypto.getRandomValues(bytes);
    return Array.prototype.map.call(bytes, function(byte){ return byte.toString(16).padStart(2, '0'); }).join('');
  }

  function storageKey(roomId, participantId) { return STORE_PREFIX + encodeURIComponent(roomId) + ':' + encodeURIComponent(participantId); }

  function defaultCredentialStore() {
    var storage = null;
    try { storage = window.sessionStorage || null; } catch (ignore) { storage = null; }
    return Object.freeze({
      get: function(roomId, participantId) {
        if (!storage) return '';
        try { return text(storage.getItem(storageKey(roomId, participantId))); } catch (ignore) { return ''; }
      },
      set: function(roomId, participantId, token) {
        if (!storage) return false;
        try { storage.setItem(storageKey(roomId, participantId), token); return true; } catch (ignore) { return false; }
      },
      remove: function(roomId, participantId) {
        if (!storage) return false;
        try { storage.removeItem(storageKey(roomId, participantId)); return true; } catch (ignore) { return false; }
      }
    });
  }

  function createClient(options) {
    var opts = options && typeof options === 'object' ? options : {};
    var contract = opts.contract || window.CRIOS_REMOTE_LIVE_ROOM_CONTRACT || null;
    var endpoint = validEndpoint(opts.endpoint);
    var fetchImpl = typeof opts.fetchImpl === 'function' ? opts.fetchImpl : (typeof window.fetch === 'function' ? window.fetch.bind(window) : null);
    var requestIdFactory = typeof opts.requestIdFactory === 'function' ? opts.requestIdFactory : defaultRequestIdFactory;
    var capabilityFactory = typeof opts.capabilityFactory === 'function' ? opts.capabilityFactory : defaultCapabilityFactory;
    var credentials = opts.credentialStore && typeof opts.credentialStore === 'object' ? opts.credentialStore : defaultCredentialStore();
    var timeoutMs = Number.isFinite(Number(opts.timeoutMs)) && Number(opts.timeoutMs) > 0 ? Math.floor(Number(opts.timeoutMs)) : 15000;

    function available() {
      return Boolean(contract && endpoint && fetchImpl &&
        typeof contract.createLiveRoomRequest === 'function' &&
        typeof contract.createJoinLiveRoomRequest === 'function' &&
        typeof contract.createHeartbeatLiveRoomRequest === 'function' &&
        typeof contract.createGetLiveRoomRequest === 'function' &&
        typeof contract.parseResponse === 'function');
    }

    function createRequestId(operation, supplied) {
      var explicit = text(supplied); if (explicit) return explicit;
      var generated = text(requestIdFactory(operation));
      if (!generated) throw new Error('requestIdFactory returned an empty id.');
      return generated;
    }

    function newCapability() {
      var generated = text(capabilityFactory());
      var limits = contract && contract.limits ? contract.limits : {MIN_CAPABILITY_LENGTH: 32, MAX_CAPABILITY_LENGTH: 256};
      if (!generated || generated.length < Number(limits.MIN_CAPABILITY_LENGTH || 32) || generated.length > Number(limits.MAX_CAPABILITY_LENGTH || 256)) return '';
      return generated;
    }

    function clientUnavailable(requestId) { return result(false, requestId, null, errorPayload(ERROR_CODES.CLIENT_UNAVAILABLE, 'LiveRoom client is not configured.', false, null)); }

    async function fetchText(init) {
      var timer = null; var controller = null; var requestInit = Object.assign({}, init || {});
      if (typeof AbortController === 'function' && timeoutMs > 0) {
        controller = new AbortController(); requestInit.signal = controller.signal; timer = setTimeout(function(){ controller.abort(); }, timeoutMs);
      }
      try {
        var response = await fetchImpl(endpoint, requestInit);
        if (!response || typeof response.text !== 'function') return {ok:false,error:errorPayload(ERROR_CODES.TRANSPORT_FAILED,'LiveRoom fetch returned an invalid response object.',true,null)};
        var body = await response.text();
        if (response.ok === false) {
          var status = Number(response.status || 0);
          return {ok:false,error:errorPayload(ERROR_CODES.HTTP_ERROR,'LiveRoom endpoint returned HTTP ' + status + '.',status === 0 || status === 408 || status === 429 || status >= 500,{status:status})};
        }
        return {ok:true,text:body,error:null};
      } catch (error) {
        var aborted = Boolean(error && (error.name === 'AbortError' || error.code === 'ABORT_ERR'));
        return {ok:false,error:errorPayload(ERROR_CODES.TRANSPORT_FAILED,aborted ? 'LiveRoom request timed out.' : String(error && error.message || error || 'LiveRoom transport failed.'),true,{timeout:aborted})};
      } finally { if (timer !== null) clearTimeout(timer); }
    }

    function parseBody(body, request, requestId) {
      var raw;
      try { raw = JSON.parse(String(body || '')); }
      catch (error) { return result(false, requestId, null, errorPayload(ERROR_CODES.RESPONSE_PARSE_FAILED, 'LiveRoom response is not valid JSON.', true, null)); }
      var parsed = contract.parseResponse(raw, request);
      if (!parsed || parsed.accepted !== true || !parsed.response) {
        var rejected = parsed && parsed.error ? parsed.error : null;
        return result(false, requestId, null, errorPayload(rejected && rejected.code || ERROR_CODES.RESPONSE_PARSE_FAILED, rejected && rejected.message || 'LiveRoom response failed contract validation.', false, null));
      }
      if (!parsed.response.success) return result(false, requestId, null, errorPayload(parsed.response.error.code, parsed.response.error.message, parsed.response.error.retryable, null));
      return result(true, requestId, parsed.response.data, null);
    }

    async function execute(request) {
      var requestId = request && request.requestId ? request.requestId : '';
      if (!available()) return clientUnavailable(requestId);
      var transport = await fetchText({method:'POST',credentials:'omit',cache:'no-store',redirect:'follow',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({liveRoomRequest:request})});
      if (!transport.ok) return result(false, requestId, null, transport.error);
      return parseBody(transport.text, request, requestId);
    }

    async function createLiveRoom(campaignId, publicationId, participantId, callOptions) {
      var call = callOptions && typeof callOptions === 'object' ? callOptions : {}; var requestId;
      try { requestId = createRequestId('create', call.requestId); } catch (error) { return clientUnavailable(''); }
      if (!available()) return clientUnavailable(requestId);
      var capability = newCapability();
      if (!capability) return result(false, requestId, null, errorPayload(ERROR_CODES.CAPABILITY_GENERATION_UNAVAILABLE, 'Secure LiveRoom capability generation is unavailable.', false, null));
      var request;
      try { request = contract.createLiveRoomRequest({campaignId:campaignId,publicationId:publicationId,participantId:participantId,capabilityToken:capability}, requestId); }
      catch (errorRequest) { return result(false, requestId, null, errorPayload('INVALID_REQUEST', String(errorRequest && errorRequest.message || errorRequest), false, null)); }
      var response = await execute(request);
      if (!response.success) return response;
      var roomId = response.data && response.data.room ? response.data.room.roomId : '';
      if (!roomId || !credentials || typeof credentials.set !== 'function' || credentials.set(roomId, participantId, capability) !== true) {
        return result(false, requestId, null, errorPayload(ERROR_CODES.CAPABILITY_STORAGE_UNAVAILABLE, 'LiveRoom capability could not be stored for this browser session.', false, {roomCreated:true, roomId:roomId || null}));
      }
      return response;
    }

    async function joinLiveRoom(roomId, participantId, callOptions) {
      var call = callOptions && typeof callOptions === 'object' ? callOptions : {}; var requestId;
      try { requestId = createRequestId('join', call.requestId); } catch (error) { return clientUnavailable(''); }
      if (!available()) return clientUnavailable(requestId);
      var capability = newCapability();
      if (!capability) return result(false, requestId, null, errorPayload(ERROR_CODES.CAPABILITY_GENERATION_UNAVAILABLE, 'Secure LiveRoom capability generation is unavailable.', false, null));
      var request;
      try { request = contract.createJoinLiveRoomRequest({roomId:roomId,participantId:participantId,capabilityToken:capability}, requestId); }
      catch (errorRequest) { return result(false, requestId, null, errorPayload('INVALID_REQUEST', String(errorRequest && errorRequest.message || errorRequest), false, null)); }
      var response = await execute(request);
      if (!response.success) return response;
      if (!credentials || typeof credentials.set !== 'function' || credentials.set(roomId, participantId, capability) !== true) {
        return result(false, requestId, null, errorPayload(ERROR_CODES.CAPABILITY_STORAGE_UNAVAILABLE, 'LiveRoom capability could not be stored for this browser session.', false, {joined:true, roomId:roomId}));
      }
      return response;
    }

    async function heartbeatLiveRoom(roomId, participantId, callOptions) {
      var call = callOptions && typeof callOptions === 'object' ? callOptions : {}; var requestId;
      try { requestId = createRequestId('heartbeat', call.requestId); } catch (error) { return clientUnavailable(''); }
      if (!available()) return clientUnavailable(requestId);
      var capability = credentials && typeof credentials.get === 'function' ? text(credentials.get(roomId, participantId)) : '';
      if (!capability) return result(false, requestId, null, errorPayload(ERROR_CODES.CAPABILITY_STORAGE_UNAVAILABLE, 'LiveRoom capability is unavailable for this browser session.', false, null));
      var request;
      try { request = contract.createHeartbeatLiveRoomRequest({roomId:roomId,participantId:participantId,capabilityToken:capability}, requestId); }
      catch (errorRequest) { return result(false, requestId, null, errorPayload('INVALID_REQUEST', String(errorRequest && errorRequest.message || errorRequest), false, null)); }
      return execute(request);
    }

    async function getLiveRoom(roomId, callOptions) {
      var call = callOptions && typeof callOptions === 'object' ? callOptions : {}; var requestId;
      try { requestId = createRequestId('get', call.requestId); } catch (error) { return clientUnavailable(''); }
      if (!available()) return clientUnavailable(requestId);
      var request;
      try { request = contract.createGetLiveRoomRequest(roomId, requestId); }
      catch (errorRequest) { return result(false, requestId, null, errorPayload('INVALID_REQUEST', String(errorRequest && errorRequest.message || errorRequest), false, null)); }
      return execute(request);
    }

    function forgetCapability(roomId, participantId) {
      return Boolean(credentials && typeof credentials.remove === 'function' && credentials.remove(roomId, participantId));
    }

    return Object.freeze({
      version: VERSION,
      available: available,
      createLiveRoom: createLiveRoom,
      joinLiveRoom: joinLiveRoom,
      heartbeatLiveRoom: heartbeatLiveRoom,
      getLiveRoom: getLiveRoom,
      forgetCapability: forgetCapability
    });
  }

  window.CRIOS_REMOTE_LIVE_ROOM_CLIENT = Object.freeze({version: VERSION, errorCodes: ERROR_CODES, createClient: createClient});
})();
