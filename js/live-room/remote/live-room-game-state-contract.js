/* CRIOS LiveRoom Game State Remote — strict request/response contract */
(function(){
  'use strict';

  var VERSION = '1.0.0';
  var PROTOCOL_VERSION = '1.0';
  var GAME_STATE_SCHEMA_VERSION = '1.0';

  var OPERATIONS = Object.freeze({
    GET: 'getLiveRoomGameState',
    COMPLETE_MISSION: 'completeLiveRoomMission'
  });

  var ERROR_CODES = Object.freeze({
    INVALID_REQUEST: 'INVALID_REQUEST',
    UNSUPPORTED_PROTOCOL: 'UNSUPPORTED_PROTOCOL',
    UNSUPPORTED_OPERATION: 'UNSUPPORTED_OPERATION',
    PUBLICATION_UNAVAILABLE: 'PUBLICATION_UNAVAILABLE',
    ROOM_UNAVAILABLE: 'ROOM_UNAVAILABLE',
    ROOM_EXPIRED: 'ROOM_EXPIRED',
    PARTICIPANT_UNAVAILABLE: 'PARTICIPANT_UNAVAILABLE',
    CAPABILITY_INVALID: 'CAPABILITY_INVALID',
    PLAYER_REQUIRED: 'PLAYER_REQUIRED',
    MISSION_UNAVAILABLE: 'MISSION_UNAVAILABLE',
    REQUEST_CONFLICT: 'REQUEST_CONFLICT',
    SERVER_ERROR: 'SERVER_ERROR'
  });

  var LIMITS = Object.freeze({
    MAX_CAMPAIGN_ID_LENGTH: 160,
    MAX_PUBLICATION_ID_LENGTH: 200,
    MAX_ROOM_ID_LENGTH: 160,
    MAX_PARTICIPANT_ID_LENGTH: 160,
    MAX_MISSION_ID_LENGTH: 160,
    MAX_REQUEST_ID_LENGTH: 160,
    MIN_CAPABILITY_LENGTH: 32,
    MAX_CAPABILITY_LENGTH: 256
  });

  var REQUEST_KEYS = Object.freeze(['protocolVersion', 'operation', 'requestId', 'payload']);
  var PARTICIPANT_KEYS = Object.freeze(['roomId', 'participantId', 'capabilityToken']);
  var COMPLETE_MISSION_KEYS = Object.freeze(['roomId', 'participantId', 'capabilityToken', 'missionId']);
  var RESPONSE_KEYS = Object.freeze(['protocolVersion', 'operation', 'requestId', 'success', 'data', 'error']);
  var ERROR_KEYS = Object.freeze(['code', 'message', 'retryable']);
  var GAME_STATE_KEYS = Object.freeze(['schemaVersion', 'roomId', 'campaignId', 'publicationId', 'revision', 'completedMissionIds', 'updatedAt']);

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

  function issue(code, message, path) {
    return Object.freeze({code: code, message: message, path: path});
  }

  function validation(issues) {
    return Object.freeze({valid: issues.length === 0, issues: Object.freeze(issues.slice())});
  }

  function validateParticipantPayload(payload, keys, operation, issues) {
    if (!exactKeys(payload, keys)) {
      issues.push(issue(ERROR_CODES.INVALID_REQUEST, operation + ' payload shape is invalid.', '$.payload'));
      return;
    }
    if (normalizedString(payload.roomId, LIMITS.MAX_ROOM_ID_LENGTH) !== payload.roomId) {
      issues.push(issue(ERROR_CODES.INVALID_REQUEST, 'roomId is invalid or not normalized.', '$.payload.roomId'));
    }
    if (normalizedString(payload.participantId, LIMITS.MAX_PARTICIPANT_ID_LENGTH) !== payload.participantId) {
      issues.push(issue(ERROR_CODES.INVALID_REQUEST, 'participantId is invalid or not normalized.', '$.payload.participantId'));
    }
    if (!validCapability(payload.capabilityToken)) {
      issues.push(issue(ERROR_CODES.INVALID_REQUEST, 'capabilityToken is invalid.', '$.payload.capabilityToken'));
    }
  }

  function validateRequest(value) {
    var issues = [];
    if (!exactKeys(value, REQUEST_KEYS)) {
      return validation([issue(ERROR_CODES.INVALID_REQUEST, 'LiveRoom game-state request envelope shape is invalid.', '$')]);
    }
    if (value.protocolVersion !== PROTOCOL_VERSION) {
      issues.push(issue(ERROR_CODES.UNSUPPORTED_PROTOCOL, 'LiveRoom protocolVersion is unsupported.', '$.protocolVersion'));
    }
    if (!knownOperation(value.operation)) {
      issues.push(issue(ERROR_CODES.UNSUPPORTED_OPERATION, 'LiveRoom game-state operation is unsupported.', '$.operation'));
    }
    if (normalizedString(value.requestId, LIMITS.MAX_REQUEST_ID_LENGTH) !== value.requestId) {
      issues.push(issue(ERROR_CODES.INVALID_REQUEST, 'requestId is invalid or not normalized.', '$.requestId'));
    }
    if (!isPlainObject(value.payload)) {
      issues.push(issue(ERROR_CODES.INVALID_REQUEST, 'payload must be a plain object.', '$.payload'));
      return validation(issues);
    }

    if (value.operation === OPERATIONS.GET) {
      validateParticipantPayload(value.payload, PARTICIPANT_KEYS, value.operation, issues);
    } else if (value.operation === OPERATIONS.COMPLETE_MISSION) {
      validateParticipantPayload(value.payload, COMPLETE_MISSION_KEYS, value.operation, issues);
      if (exactKeys(value.payload, COMPLETE_MISSION_KEYS) &&
          normalizedString(value.payload.missionId, LIMITS.MAX_MISSION_ID_LENGTH) !== value.payload.missionId) {
        issues.push(issue(ERROR_CODES.INVALID_REQUEST, 'missionId is invalid or not normalized.', '$.payload.missionId'));
      }
    }
    return validation(issues);
  }

  function invalidBuilderInput(result) {
    var first = result.issues[0] || issue(ERROR_CODES.INVALID_REQUEST, 'LiveRoom game-state request is invalid.', '$');
    var error = new Error(first.message);
    error.code = first.code;
    error.path = first.path;
    return error;
  }

  function buildRequest(operation, input, requestId) {
    var source = isPlainObject(input) ? input : {};
    var payload = {
      roomId: String(source.roomId == null ? '' : source.roomId).trim(),
      participantId: String(source.participantId == null ? '' : source.participantId).trim(),
      capabilityToken: String(source.capabilityToken == null ? '' : source.capabilityToken)
    };
    if (operation === OPERATIONS.COMPLETE_MISSION) {
      payload.missionId = String(source.missionId == null ? '' : source.missionId).trim();
    }
    var request = {
      protocolVersion: PROTOCOL_VERSION,
      operation: operation,
      requestId: String(requestId == null ? '' : requestId).trim(),
      payload: payload
    };
    var result = validateRequest(request);
    if (!result.valid) throw invalidBuilderInput(result);
    return frozenCopy(request);
  }

  function createGetLiveRoomGameStateRequest(input, requestId) {
    return buildRequest(OPERATIONS.GET, input, requestId);
  }

  function createCompleteLiveRoomMissionRequest(input, requestId) {
    return buildRequest(OPERATIONS.COMPLETE_MISSION, input, requestId);
  }

  function validGameState(value) {
    if (!exactKeys(value, GAME_STATE_KEYS) || value.schemaVersion !== GAME_STATE_SCHEMA_VERSION) return false;
    if (normalizedString(value.roomId, LIMITS.MAX_ROOM_ID_LENGTH) !== value.roomId) return false;
    if (normalizedString(value.campaignId, LIMITS.MAX_CAMPAIGN_ID_LENGTH) !== value.campaignId) return false;
    if (normalizedString(value.publicationId, LIMITS.MAX_PUBLICATION_ID_LENGTH) !== value.publicationId) return false;
    if (!Number.isInteger(value.revision) || value.revision < 0 || !Array.isArray(value.completedMissionIds)) return false;
    if (value.revision !== value.completedMissionIds.length || !validIsoUtc(value.updatedAt)) return false;
    var seen = Object.create(null);
    for (var index = 0; index < value.completedMissionIds.length; index += 1) {
      var missionId = value.completedMissionIds[index];
      if (normalizedString(missionId, LIMITS.MAX_MISSION_ID_LENGTH) !== missionId || seen[missionId]) return false;
      seen[missionId] = true;
    }
    return true;
  }

  function validError(value) {
    return exactKeys(value, ERROR_KEYS) &&
      knownErrorCode(value.code) &&
      typeof value.message === 'string' &&
      value.message.trim() !== '' &&
      typeof value.retryable === 'boolean';
  }

  function validSuccessData(operation, data) {
    if (operation === OPERATIONS.GET) {
      return exactKeys(data, ['gameState']) && validGameState(data.gameState);
    }
    if (operation === OPERATIONS.COMPLETE_MISSION) {
      return exactKeys(data, ['gameState', 'changed']) && validGameState(data.gameState) && typeof data.changed === 'boolean';
    }
    return false;
  }

  function responseMatchesRequest(value, request) {
    if (!request || !isPlainObject(request) || value.success !== true) return true;
    if (!isPlainObject(request.payload)) return false;
    var gameState = value.data && value.data.gameState;
    if (!gameState || gameState.roomId !== request.payload.roomId) return false;
    if (request.operation === OPERATIONS.COMPLETE_MISSION &&
        !gameState.completedMissionIds.includes(request.payload.missionId)) return false;
    return true;
  }

  function validateResponse(value, request) {
    var issues = [];
    if (!exactKeys(value, RESPONSE_KEYS)) {
      return validation([issue(ERROR_CODES.INVALID_REQUEST, 'LiveRoom game-state response envelope shape is invalid.', '$')]);
    }
    if (value.protocolVersion !== PROTOCOL_VERSION) {
      issues.push(issue(ERROR_CODES.UNSUPPORTED_PROTOCOL, 'LiveRoom response protocolVersion is unsupported.', '$.protocolVersion'));
    }
    if (!knownOperation(value.operation)) {
      issues.push(issue(ERROR_CODES.UNSUPPORTED_OPERATION, 'LiveRoom game-state response operation is unsupported.', '$.operation'));
    }
    if (normalizedString(value.requestId, LIMITS.MAX_REQUEST_ID_LENGTH) !== value.requestId) {
      issues.push(issue(ERROR_CODES.INVALID_REQUEST, 'LiveRoom response requestId is invalid.', '$.requestId'));
    }
    if (typeof value.success !== 'boolean') {
      issues.push(issue(ERROR_CODES.INVALID_REQUEST, 'LiveRoom response success must be boolean.', '$.success'));
    }
    if (request && isPlainObject(request)) {
      if (value.operation !== request.operation) {
        issues.push(issue(ERROR_CODES.INVALID_REQUEST, 'LiveRoom response operation does not match request.', '$.operation'));
      }
      if (value.requestId !== request.requestId) {
        issues.push(issue(ERROR_CODES.INVALID_REQUEST, 'LiveRoom response requestId does not match request.', '$.requestId'));
      }
    }
    if (value.success === true) {
      if (value.error !== null || !validSuccessData(value.operation, value.data) || !responseMatchesRequest(value, request)) {
        issues.push(issue(ERROR_CODES.INVALID_REQUEST, 'LiveRoom game-state success response data is invalid.', '$.data'));
      }
    } else if (value.data !== null || !validError(value.error)) {
      issues.push(issue(ERROR_CODES.INVALID_REQUEST, 'LiveRoom game-state error response is invalid.', '$.error'));
    }
    return validation(issues);
  }

  function parseResponse(value, request) {
    var checked = validateResponse(value, request);
    if (!checked.valid) {
      return Object.freeze({accepted: false, response: null, error: checked.issues[0]});
    }
    return Object.freeze({accepted: true, response: frozenCopy(value), error: null});
  }

  window.CRIOS_REMOTE_LIVE_ROOM_GAME_STATE_CONTRACT = Object.freeze({
    version: VERSION,
    protocolVersion: PROTOCOL_VERSION,
    gameStateSchemaVersion: GAME_STATE_SCHEMA_VERSION,
    operations: OPERATIONS,
    errorCodes: ERROR_CODES,
    limits: LIMITS,
    validateRequest: validateRequest,
    validateResponse: validateResponse,
    createGetLiveRoomGameStateRequest: createGetLiveRoomGameStateRequest,
    createCompleteLiveRoomMissionRequest: createCompleteLiveRoomMissionRequest,
    parseResponse: parseResponse
  });
})();
