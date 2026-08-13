/* CRIOS LiveRoom Remote - strict request/response contract */
(function(){
  'use strict';

  var VERSION = '1.0.0';
  var PROTOCOL_VERSION = '1.0';
  var IDLE_TIMEOUT_MS = 10 * 60 * 1000;
  var MAX_PARTICIPANTS = 64;

  var OPERATIONS = Object.freeze({
    CREATE: 'createLiveRoom',
    JOIN: 'joinLiveRoom',
    HEARTBEAT: 'heartbeatLiveRoom',
    GET: 'getLiveRoom'
  });

  var ERROR_CODES = Object.freeze({
    INVALID_REQUEST: 'INVALID_REQUEST',
    UNSUPPORTED_PROTOCOL: 'UNSUPPORTED_PROTOCOL',
    UNSUPPORTED_OPERATION: 'UNSUPPORTED_OPERATION',
    PUBLICATION_UNAVAILABLE: 'PUBLICATION_UNAVAILABLE',
    ROOM_UNAVAILABLE: 'ROOM_UNAVAILABLE',
    ROOM_EXPIRED: 'ROOM_EXPIRED',
    ROOM_FULL: 'ROOM_FULL',
    PARTICIPANT_UNAVAILABLE: 'PARTICIPANT_UNAVAILABLE',
    PARTICIPANT_CONFLICT: 'PARTICIPANT_CONFLICT',
    CAPABILITY_INVALID: 'CAPABILITY_INVALID',
    REQUEST_CONFLICT: 'REQUEST_CONFLICT',
    SERVER_ERROR: 'SERVER_ERROR'
  });

  var LIMITS = Object.freeze({
    MAX_CAMPAIGN_ID_LENGTH: 160,
    MAX_PUBLICATION_ID_LENGTH: 200,
    MAX_ROOM_ID_LENGTH: 160,
    MAX_PARTICIPANT_ID_LENGTH: 160,
    MAX_REQUEST_ID_LENGTH: 160,
    MIN_CAPABILITY_LENGTH: 32,
    MAX_CAPABILITY_LENGTH: 256
  });

  var REQUEST_KEYS = Object.freeze(['protocolVersion', 'operation', 'requestId', 'payload']);
  var CREATE_KEYS = Object.freeze(['campaignId', 'publicationId', 'participantId', 'capabilityToken']);
  var PARTICIPANT_KEYS = Object.freeze(['roomId', 'participantId', 'capabilityToken']);
  var GET_KEYS = Object.freeze(['roomId']);
  var RESPONSE_KEYS = Object.freeze(['protocolVersion', 'operation', 'requestId', 'success', 'data', 'error']);
  var ERROR_KEYS = Object.freeze(['code', 'message', 'retryable']);
  var ROOM_KEYS = Object.freeze(['roomId', 'campaignId', 'publicationId', 'createdAt', 'lastActivityAt', 'expiresAt', 'status']);
  var PRESENCE_KEYS = Object.freeze(['roomId', 'participantId', 'role', 'joinedAt', 'lastSeenAt']);

  function isPlainObject(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    return Object.prototype.toString.call(value) === '[object Object]';
  }

  function exactKeys(value, expected) {
    if (!isPlainObject(value)) return false;
    var actual = Object.keys(value).sort();
    var wanted = expected.slice().sort();
    return actual.length === wanted.length && actual.every(function(key, index){ return key === wanted[index]; });
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

  function normalizedString(value, maxLength) {
    if (typeof value !== 'string') return null;
    var clean = value.trim();
    if (!clean || clean !== value || clean.length > maxLength || /[\u0000-\u001F\u007F]/.test(clean)) return null;
    return clean;
  }

  function validCapability(value) {
    return typeof value === 'string' &&
      value.length >= LIMITS.MIN_CAPABILITY_LENGTH &&
      value.length <= LIMITS.MAX_CAPABILITY_LENGTH &&
      value.trim() === value &&
      !/[\u0000-\u001F\u007F]/.test(value);
  }

  function validIsoUtc(value) {
    if (typeof value !== 'string' || !value) return false;
    var timestamp = Date.parse(value);
    return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
  }

  function knownOperation(value) {
    return Object.keys(OPERATIONS).some(function(key){ return OPERATIONS[key] === value; });
  }

  function knownErrorCode(value) {
    return Object.keys(ERROR_CODES).some(function(key){ return ERROR_CODES[key] === value; });
  }

  function issue(code, message, path) { return Object.freeze({code: code, message: message, path: path}); }
  function validation(issues) { return Object.freeze({valid: issues.length === 0, issues: Object.freeze(issues.slice())}); }

  function validateRequest(value) {
    var issues = [];
    if (!exactKeys(value, REQUEST_KEYS)) return validation([issue(ERROR_CODES.INVALID_REQUEST, 'LiveRoom request envelope shape is invalid.', '$')]);
    if (value.protocolVersion !== PROTOCOL_VERSION) issues.push(issue(ERROR_CODES.UNSUPPORTED_PROTOCOL, 'LiveRoom protocolVersion is unsupported.', '$.protocolVersion'));
    if (!knownOperation(value.operation)) issues.push(issue(ERROR_CODES.UNSUPPORTED_OPERATION, 'LiveRoom operation is unsupported.', '$.operation'));
    if (normalizedString(value.requestId, LIMITS.MAX_REQUEST_ID_LENGTH) !== value.requestId) issues.push(issue(ERROR_CODES.INVALID_REQUEST, 'requestId is invalid or not normalized.', '$.requestId'));
    if (!isPlainObject(value.payload)) {
      issues.push(issue(ERROR_CODES.INVALID_REQUEST, 'payload must be a plain object.', '$.payload'));
      return validation(issues);
    }

    if (value.operation === OPERATIONS.CREATE) {
      if (!exactKeys(value.payload, CREATE_KEYS)) issues.push(issue(ERROR_CODES.INVALID_REQUEST, 'createLiveRoom payload shape is invalid.', '$.payload'));
      else {
        if (normalizedString(value.payload.campaignId, LIMITS.MAX_CAMPAIGN_ID_LENGTH) !== value.payload.campaignId) issues.push(issue(ERROR_CODES.INVALID_REQUEST, 'campaignId is invalid or not normalized.', '$.payload.campaignId'));
        if (normalizedString(value.payload.publicationId, LIMITS.MAX_PUBLICATION_ID_LENGTH) !== value.payload.publicationId) issues.push(issue(ERROR_CODES.INVALID_REQUEST, 'publicationId is invalid or not normalized.', '$.payload.publicationId'));
        if (normalizedString(value.payload.participantId, LIMITS.MAX_PARTICIPANT_ID_LENGTH) !== value.payload.participantId) issues.push(issue(ERROR_CODES.INVALID_REQUEST, 'participantId is invalid or not normalized.', '$.payload.participantId'));
        if (!validCapability(value.payload.capabilityToken)) issues.push(issue(ERROR_CODES.INVALID_REQUEST, 'capabilityToken is invalid.', '$.payload.capabilityToken'));
      }
    } else if (value.operation === OPERATIONS.JOIN || value.operation === OPERATIONS.HEARTBEAT) {
      if (!exactKeys(value.payload, PARTICIPANT_KEYS)) issues.push(issue(ERROR_CODES.INVALID_REQUEST, value.operation + ' payload shape is invalid.', '$.payload'));
      else {
        if (normalizedString(value.payload.roomId, LIMITS.MAX_ROOM_ID_LENGTH) !== value.payload.roomId) issues.push(issue(ERROR_CODES.INVALID_REQUEST, 'roomId is invalid or not normalized.', '$.payload.roomId'));
        if (normalizedString(value.payload.participantId, LIMITS.MAX_PARTICIPANT_ID_LENGTH) !== value.payload.participantId) issues.push(issue(ERROR_CODES.INVALID_REQUEST, 'participantId is invalid or not normalized.', '$.payload.participantId'));
        if (!validCapability(value.payload.capabilityToken)) issues.push(issue(ERROR_CODES.INVALID_REQUEST, 'capabilityToken is invalid.', '$.payload.capabilityToken'));
      }
    } else if (value.operation === OPERATIONS.GET) {
      if (!exactKeys(value.payload, GET_KEYS)) issues.push(issue(ERROR_CODES.INVALID_REQUEST, 'getLiveRoom payload shape is invalid.', '$.payload'));
      else if (normalizedString(value.payload.roomId, LIMITS.MAX_ROOM_ID_LENGTH) !== value.payload.roomId) issues.push(issue(ERROR_CODES.INVALID_REQUEST, 'roomId is invalid or not normalized.', '$.payload.roomId'));
    }
    return validation(issues);
  }

  function invalidBuilderInput(result) {
    var first = result.issues[0] || issue(ERROR_CODES.INVALID_REQUEST, 'LiveRoom request is invalid.', '$');
    var error = new Error(first.message); error.code = first.code; error.path = first.path; return error;
  }

  function buildRequest(operation, requestId, payload) {
    var request = {protocolVersion: PROTOCOL_VERSION, operation: operation, requestId: String(requestId == null ? '' : requestId).trim(), payload: payload};
    var result = validateRequest(request);
    if (!result.valid) throw invalidBuilderInput(result);
    return frozenCopy(request);
  }

  function createLiveRoomRequest(input, requestId) {
    var source = isPlainObject(input) ? input : {};
    return buildRequest(OPERATIONS.CREATE, requestId, {
      campaignId: String(source.campaignId == null ? '' : source.campaignId).trim(),
      publicationId: String(source.publicationId == null ? '' : source.publicationId).trim(),
      participantId: String(source.participantId == null ? '' : source.participantId).trim(),
      capabilityToken: String(source.capabilityToken == null ? '' : source.capabilityToken)
    });
  }

  function createJoinLiveRoomRequest(input, requestId) {
    var source = isPlainObject(input) ? input : {};
    return buildRequest(OPERATIONS.JOIN, requestId, {
      roomId: String(source.roomId == null ? '' : source.roomId).trim(),
      participantId: String(source.participantId == null ? '' : source.participantId).trim(),
      capabilityToken: String(source.capabilityToken == null ? '' : source.capabilityToken)
    });
  }

  function createHeartbeatLiveRoomRequest(input, requestId) {
    var source = isPlainObject(input) ? input : {};
    return buildRequest(OPERATIONS.HEARTBEAT, requestId, {
      roomId: String(source.roomId == null ? '' : source.roomId).trim(),
      participantId: String(source.participantId == null ? '' : source.participantId).trim(),
      capabilityToken: String(source.capabilityToken == null ? '' : source.capabilityToken)
    });
  }

  function createGetLiveRoomRequest(roomId, requestId) {
    return buildRequest(OPERATIONS.GET, requestId, {roomId: String(roomId == null ? '' : roomId).trim()});
  }

  function validRoom(value) {
    return exactKeys(value, ROOM_KEYS) &&
      normalizedString(value.roomId, LIMITS.MAX_ROOM_ID_LENGTH) === value.roomId &&
      normalizedString(value.campaignId, LIMITS.MAX_CAMPAIGN_ID_LENGTH) === value.campaignId &&
      normalizedString(value.publicationId, LIMITS.MAX_PUBLICATION_ID_LENGTH) === value.publicationId &&
      validIsoUtc(value.createdAt) && validIsoUtc(value.lastActivityAt) && validIsoUtc(value.expiresAt) &&
      (value.status === 'active' || value.status === 'expired') &&
      Date.parse(value.expiresAt) === Date.parse(value.lastActivityAt) + IDLE_TIMEOUT_MS;
  }

  function validPresence(value) {
    return exactKeys(value, PRESENCE_KEYS) &&
      normalizedString(value.roomId, LIMITS.MAX_ROOM_ID_LENGTH) === value.roomId &&
      normalizedString(value.participantId, LIMITS.MAX_PARTICIPANT_ID_LENGTH) === value.participantId &&
      (value.role === 'host' || value.role === 'player') &&
      validIsoUtc(value.joinedAt) && validIsoUtc(value.lastSeenAt);
  }

  function validError(value) {
    return exactKeys(value, ERROR_KEYS) && knownErrorCode(value.code) && typeof value.message === 'string' && value.message.trim() !== '' && typeof value.retryable === 'boolean';
  }

  function validSuccessData(operation, data) {
    if (operation === OPERATIONS.GET) return exactKeys(data, ['room']) && validRoom(data.room);
    if (operation === OPERATIONS.CREATE || operation === OPERATIONS.JOIN || operation === OPERATIONS.HEARTBEAT) {
      return exactKeys(data, ['room', 'presence']) && validRoom(data.room) && validPresence(data.presence) && data.room.roomId === data.presence.roomId;
    }
    return false;
  }

  function validateResponse(value, request) {
    var issues = [];
    if (!exactKeys(value, RESPONSE_KEYS)) return validation([issue(ERROR_CODES.INVALID_REQUEST, 'LiveRoom response envelope shape is invalid.', '$')]);
    if (value.protocolVersion !== PROTOCOL_VERSION) issues.push(issue(ERROR_CODES.UNSUPPORTED_PROTOCOL, 'LiveRoom response protocolVersion is unsupported.', '$.protocolVersion'));
    if (!knownOperation(value.operation)) issues.push(issue(ERROR_CODES.UNSUPPORTED_OPERATION, 'LiveRoom response operation is unsupported.', '$.operation'));
    if (normalizedString(value.requestId, LIMITS.MAX_REQUEST_ID_LENGTH) !== value.requestId) issues.push(issue(ERROR_CODES.INVALID_REQUEST, 'LiveRoom response requestId is invalid.', '$.requestId'));
    if (typeof value.success !== 'boolean') issues.push(issue(ERROR_CODES.INVALID_REQUEST, 'LiveRoom response success must be boolean.', '$.success'));
    if (request && isPlainObject(request)) {
      if (value.operation !== request.operation) issues.push(issue(ERROR_CODES.INVALID_REQUEST, 'LiveRoom response operation does not match request.', '$.operation'));
      if (value.requestId !== request.requestId) issues.push(issue(ERROR_CODES.INVALID_REQUEST, 'LiveRoom response requestId does not match request.', '$.requestId'));
    }
    if (value.success === true) {
      if (value.error !== null || !validSuccessData(value.operation, value.data)) issues.push(issue(ERROR_CODES.INVALID_REQUEST, 'LiveRoom success response data is invalid.', '$.data'));
    } else {
      if (value.data !== null || !validError(value.error)) issues.push(issue(ERROR_CODES.INVALID_REQUEST, 'LiveRoom error response is invalid.', '$.error'));
    }
    return validation(issues);
  }

  function parseResponse(value, request) {
    var checked = validateResponse(value, request);
    if (!checked.valid) {
      var first = checked.issues[0];
      return Object.freeze({accepted: false, response: null, error: first});
    }
    return Object.freeze({accepted: true, response: frozenCopy(value), error: null});
  }

  window.CRIOS_REMOTE_LIVE_ROOM_CONTRACT = Object.freeze({
    version: VERSION,
    protocolVersion: PROTOCOL_VERSION,
    idleTimeoutMs: IDLE_TIMEOUT_MS,
    maxParticipants: MAX_PARTICIPANTS,
    operations: OPERATIONS,
    errorCodes: ERROR_CODES,
    limits: LIMITS,
    validateRequest: validateRequest,
    validateResponse: validateResponse,
    createLiveRoomRequest: createLiveRoomRequest,
    createJoinLiveRoomRequest: createJoinLiveRoomRequest,
    createHeartbeatLiveRoomRequest: createHeartbeatLiveRoomRequest,
    createGetLiveRoomRequest: createGetLiveRoomRequest,
    parseResponse: parseResponse
  });
})();
