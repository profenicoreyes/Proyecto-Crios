/* CRIOS Publication Remote - pure wire contract */
(function(){
  'use strict';

  var VERSION = '1.0.0';
  var PROTOCOL_VERSION = '1.0';
  var OPERATIONS = Object.freeze({
    PUBLISH: 'publishPublication',
    ACTIVATE: 'activatePublication',
    DEACTIVATE: 'deactivatePublication',
    GET: 'getPublication'
  });
  var ERROR_CODES = Object.freeze({
    INVALID_REQUEST: 'INVALID_REQUEST',
    UNSUPPORTED_PROTOCOL: 'UNSUPPORTED_PROTOCOL',
    UNSUPPORTED_OPERATION: 'UNSUPPORTED_OPERATION',
    CONTENT_TOO_LARGE: 'CONTENT_TOO_LARGE',
    WRITE_UNAUTHORIZED: 'WRITE_UNAUTHORIZED',
    WRITE_CONFLICT: 'WRITE_CONFLICT',
    PUBLICATION_UNAVAILABLE: 'PUBLICATION_UNAVAILABLE',
    SERVER_VALIDATION_FAILED: 'SERVER_VALIDATION_FAILED',
    SERVER_HASH_MISMATCH: 'SERVER_HASH_MISMATCH',
    SERVER_ERROR: 'SERVER_ERROR',
    REMOTE_RESPONSE_INVALID: 'REMOTE_RESPONSE_INVALID',
    REMOTE_IDENTITY_MISMATCH: 'REMOTE_IDENTITY_MISMATCH'
  });
  var LIMITS = Object.freeze({
    MAX_CAMPAIGN_ID_LENGTH: 160,
    MAX_PUBLICATION_ID_LENGTH: 200,
    MAX_REQUEST_ID_LENGTH: 160,
    MAX_DRAFT_REVISION_LENGTH: 200,
    MAX_SCHEMA_VERSION_LENGTH: 40,
    MAX_CONTENT_BYTES: 524288
  });
  var CONSTANTS = Object.freeze({
    protocolVersion: PROTOCOL_VERSION,
    operations: OPERATIONS,
    errorCodes: ERROR_CODES,
    limits: LIMITS
  });

  var REQUEST_KEYS = ['protocolVersion', 'operation', 'requestId', 'payload'];
  var RESPONSE_KEYS = ['protocolVersion', 'operation', 'requestId', 'success', 'data', 'error'];
  var ERROR_KEYS = ['code', 'message', 'retryable'];
  var PUBLISH_REQUEST_KEYS = ['campaignId', 'draftRevision', 'schemaVersion', 'contentHash', 'content'];
  var ACTIVATE_REQUEST_KEYS = ['campaignId', 'publicationId'];
  var DEACTIVATE_REQUEST_KEYS = ['campaignId'];
  var GET_REQUEST_KEYS = ['campaignId', 'publicationId'];
  var PUBLICATION_KEYS = ['campaignId', 'publicationId', 'version', 'schemaVersion', 'contentHash', 'content'];
  var PUBLICATION_RECORD_KEYS = ['publicationId', 'campaignId', 'version', 'schemaVersion', 'contentHash', 'sourceDraftRevision', 'createdAt', 'status'];
  var ACTIVE_REFERENCE_KEYS = ['campaignId', 'publicationId', 'version', 'contentHash', 'activatedAt'];
  var ACTIVATION_RECORD_KEYS = ['activationId', 'action', 'campaignId', 'previousPublicationId', 'nextPublicationId', 'occurredAt'];
  var PUBLISH_DATA_KEYS = ['publication', 'record'];
  var ACTIVATION_DATA_KEYS = ['changed', 'reference', 'record'];
  var GET_DATA_KEYS = ['publication', 'activeReference'];
  var ISSUE_KEYS = ['code', 'message', 'path'];
  var PARSED_RESPONSE_KEYS = ['accepted', 'response', 'error'];
  var DANGEROUS_KEYS = Object.freeze({ '__proto__': true, prototype: true, constructor: true });

  function isPlainObject(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    var prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }

  function exactKeys(value, expected) {
    if (!isPlainObject(value)) return false;
    var actual = Object.keys(value).sort();
    var sorted = expected.slice().sort();
    return actual.length === sorted.length && actual.every(function(key, index){ return key === sorted[index]; });
  }

  function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.keys(value).forEach(function(key){ deepFreeze(value[key]); });
    return Object.freeze(value);
  }

  function cloneStrict(value, seen, path) {
    var type = typeof value;
    if (value === null || type === 'string' || type === 'boolean') return value;
    if (type === 'number') {
      if (!Number.isFinite(value)) throw new Error('Non-finite number at ' + path + '.');
      return value;
    }
    if (type !== 'object') throw new Error('Non-serializable value at ' + path + '.');
    if (seen.indexOf(value) >= 0) throw new Error('Circular value at ' + path + '.');
    if (!Array.isArray(value) && !isPlainObject(value)) throw new Error('Only plain objects and arrays are supported at ' + path + '.');

    seen.push(value);
    var output;
    if (Array.isArray(value)) {
      output = new Array(value.length);
      for (var index = 0; index < value.length; index += 1) {
        if (!Object.prototype.hasOwnProperty.call(value, index)) throw new Error('Sparse arrays are not supported at ' + path + '.');
        output[index] = cloneStrict(value[index], seen, path + '[' + index + ']');
      }
      var extraKeys = Object.keys(value).filter(function(key){ return !/^(0|[1-9]\d*)$/.test(key) || Number(key) >= value.length; });
      if (extraKeys.length) throw new Error('Array properties are not supported at ' + path + '.');
    } else {
      output = {};
      Object.keys(value).forEach(function(key){
        if (DANGEROUS_KEYS[key]) throw new Error('Dangerous key at ' + path + '.' + key + '.');
        var descriptor = Object.getOwnPropertyDescriptor(value, key);
        if (!descriptor || typeof descriptor.get === 'function' || typeof descriptor.set === 'function') {
          throw new Error('Accessor property at ' + path + '.' + key + '.');
        }
        output[key] = cloneStrict(descriptor.value, seen, path + '.' + key);
      });
    }
    seen.pop();
    return output;
  }

  function frozenCopy(value) {
    return deepFreeze(cloneStrict(value, [], '$'));
  }

  function createIssue(code, message, path) {
    return deepFreeze({
      code: String(code || ERROR_CODES.INVALID_REQUEST),
      message: String(message || code || 'Contract validation failed.'),
      path: String(path || '$')
    });
  }

  function validation(issues) {
    var copy = issues.slice();
    return deepFreeze({ valid: copy.length === 0, issues: copy });
  }

  function normalizedString(value, maxLength) {
    if (typeof value !== 'string') return null;
    var normalized = value.trim();
    if (!normalized || normalized.length > maxLength) return null;
    if (/[\u0000-\u001F\u007F]/.test(normalized)) return null;
    return normalized;
  }

  function normalizedCampaignId(value) { return normalizedString(value, LIMITS.MAX_CAMPAIGN_ID_LENGTH); }
  function normalizedPublicationId(value) { return normalizedString(value, LIMITS.MAX_PUBLICATION_ID_LENGTH); }
  function normalizedRequestId(value) { return normalizedString(value, LIMITS.MAX_REQUEST_ID_LENGTH); }
  function normalizedDraftRevision(value) { return normalizedString(value, LIMITS.MAX_DRAFT_REVISION_LENGTH); }
  function normalizedSchemaVersion(value) { return normalizedString(value, LIMITS.MAX_SCHEMA_VERSION_LENGTH); }
  function validContentHash(value) { return typeof value === 'string' && /^[0-9a-f]{64}$/.test(value); }
  function validPositiveVersion(value) { return Number.isSafeInteger(value) && value > 0; }
  function validIsoUtc(value) {
    if (typeof value !== 'string' || !value) return false;
    var timestamp = Date.parse(value);
    return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
  }
  function validNullablePublicationId(value) { return value === null || normalizedPublicationId(value) === value; }

  function operationKnown(value) {
    return value === OPERATIONS.PUBLISH || value === OPERATIONS.ACTIVATE || value === OPERATIONS.DEACTIVATE || value === OPERATIONS.GET;
  }

  function errorCodeKnown(value) {
    return Object.keys(ERROR_CODES).some(function(key){ return ERROR_CODES[key] === value; });
  }

  function utf8ByteLength(text) {
    var value = String(text);
    var bytes = 0;
    for (var index = 0; index < value.length; index += 1) {
      var code = value.charCodeAt(index);
      if (code < 0x80) bytes += 1;
      else if (code < 0x800) bytes += 2;
      else if (code >= 0xD800 && code <= 0xDBFF && index + 1 < value.length) {
        var next = value.charCodeAt(index + 1);
        if (next >= 0xDC00 && next <= 0xDFFF) {
          bytes += 4;
          index += 1;
        } else bytes += 3;
      } else bytes += 3;
    }
    return bytes;
  }

  function measureJsonBytes(value) {
    var copy = cloneStrict(value, [], '$');
    var serialized = JSON.stringify(copy);
    if (typeof serialized !== 'string') throw new Error('Value cannot be serialized as JSON.');
    return utf8ByteLength(serialized);
  }

  function inspectContent(value, issues, path) {
    try {
      var copy = cloneStrict(value, [], path);
      if (!isPlainObject(copy)) {
        issues.push(createIssue(ERROR_CODES.INVALID_REQUEST, 'content must be a plain object.', path));
        return;
      }
      var bytes = measureJsonBytes(copy);
      if (bytes > LIMITS.MAX_CONTENT_BYTES) {
        issues.push(createIssue(ERROR_CODES.CONTENT_TOO_LARGE, 'content exceeds the remote publication size limit.', path));
      }
    } catch (error) {
      issues.push(createIssue(ERROR_CODES.INVALID_REQUEST, String(error && error.message || error), path));
    }
  }

  function validatePublishPayload(payload, issues) {
    if (!exactKeys(payload, PUBLISH_REQUEST_KEYS)) {
      issues.push(createIssue(ERROR_CODES.INVALID_REQUEST, 'publishPublication payload shape is invalid.', '$.payload'));
      return;
    }
    if (normalizedCampaignId(payload.campaignId) !== payload.campaignId) issues.push(createIssue(ERROR_CODES.INVALID_REQUEST, 'campaignId is invalid or not normalized.', '$.payload.campaignId'));
    if (normalizedDraftRevision(payload.draftRevision) !== payload.draftRevision) issues.push(createIssue(ERROR_CODES.INVALID_REQUEST, 'draftRevision is invalid or not normalized.', '$.payload.draftRevision'));
    if (normalizedSchemaVersion(payload.schemaVersion) !== payload.schemaVersion) issues.push(createIssue(ERROR_CODES.INVALID_REQUEST, 'schemaVersion is invalid or not normalized.', '$.payload.schemaVersion'));
    if (!validContentHash(payload.contentHash)) issues.push(createIssue(ERROR_CODES.INVALID_REQUEST, 'contentHash must be 64 lowercase hexadecimal characters.', '$.payload.contentHash'));
    inspectContent(payload.content, issues, '$.payload.content');
  }

  function validateActivatePayload(payload, issues) {
    if (!exactKeys(payload, ACTIVATE_REQUEST_KEYS)) {
      issues.push(createIssue(ERROR_CODES.INVALID_REQUEST, 'activatePublication payload shape is invalid.', '$.payload'));
      return;
    }
    if (normalizedCampaignId(payload.campaignId) !== payload.campaignId) issues.push(createIssue(ERROR_CODES.INVALID_REQUEST, 'campaignId is invalid or not normalized.', '$.payload.campaignId'));
    if (normalizedPublicationId(payload.publicationId) !== payload.publicationId) issues.push(createIssue(ERROR_CODES.INVALID_REQUEST, 'publicationId is invalid or not normalized.', '$.payload.publicationId'));
  }

  function validateDeactivatePayload(payload, issues) {
    if (!exactKeys(payload, DEACTIVATE_REQUEST_KEYS)) {
      issues.push(createIssue(ERROR_CODES.INVALID_REQUEST, 'deactivatePublication payload shape is invalid.', '$.payload'));
      return;
    }
    if (normalizedCampaignId(payload.campaignId) !== payload.campaignId) issues.push(createIssue(ERROR_CODES.INVALID_REQUEST, 'campaignId is invalid or not normalized.', '$.payload.campaignId'));
  }

  function validateGetPayload(payload, issues) {
    if (!exactKeys(payload, GET_REQUEST_KEYS)) {
      issues.push(createIssue(ERROR_CODES.INVALID_REQUEST, 'getPublication payload shape is invalid.', '$.payload'));
      return;
    }
    if (normalizedCampaignId(payload.campaignId) !== payload.campaignId) issues.push(createIssue(ERROR_CODES.INVALID_REQUEST, 'campaignId is invalid or not normalized.', '$.payload.campaignId'));
    if (normalizedPublicationId(payload.publicationId) !== payload.publicationId) issues.push(createIssue(ERROR_CODES.INVALID_REQUEST, 'publicationId is invalid or not normalized.', '$.payload.publicationId'));
  }

  function validateRequest(value) {
    var issues = [];
    if (!exactKeys(value, REQUEST_KEYS)) {
      return validation([createIssue(ERROR_CODES.INVALID_REQUEST, 'Remote request envelope shape is invalid.', '$')]);
    }
    if (value.protocolVersion !== PROTOCOL_VERSION) issues.push(createIssue(ERROR_CODES.UNSUPPORTED_PROTOCOL, 'Remote protocolVersion is unsupported.', '$.protocolVersion'));
    if (!operationKnown(value.operation)) issues.push(createIssue(ERROR_CODES.UNSUPPORTED_OPERATION, 'Remote operation is unsupported.', '$.operation'));
    if (normalizedRequestId(value.requestId) !== value.requestId) issues.push(createIssue(ERROR_CODES.INVALID_REQUEST, 'requestId is invalid or not normalized.', '$.requestId'));
    if (!isPlainObject(value.payload)) {
      issues.push(createIssue(ERROR_CODES.INVALID_REQUEST, 'payload must be a plain object.', '$.payload'));
      return validation(issues);
    }
    if (value.operation === OPERATIONS.PUBLISH) validatePublishPayload(value.payload, issues);
    else if (value.operation === OPERATIONS.ACTIVATE) validateActivatePayload(value.payload, issues);
    else if (value.operation === OPERATIONS.DEACTIVATE) validateDeactivatePayload(value.payload, issues);
    else if (value.operation === OPERATIONS.GET) validateGetPayload(value.payload, issues);
    return validation(issues);
  }

  function invalidBuilderInput(validationResult) {
    var first = validationResult.issues[0] || createIssue(ERROR_CODES.INVALID_REQUEST, 'Remote request is invalid.', '$');
    var error = new Error(first.message);
    error.code = first.code;
    error.path = first.path;
    return error;
  }

  function buildRequest(operation, requestId, payload) {
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

  function createPublishRequest(input, requestId) {
    var source = isPlainObject(input) ? input : {};
    return buildRequest(OPERATIONS.PUBLISH, requestId, {
      campaignId: String(source.campaignId == null ? '' : source.campaignId).trim(),
      draftRevision: String(source.draftRevision == null ? '' : source.draftRevision).trim(),
      schemaVersion: String(source.schemaVersion == null ? '' : source.schemaVersion).trim(),
      contentHash: String(source.contentHash == null ? '' : source.contentHash).trim(),
      content: source.content
    });
  }

  function createActivateRequest(campaignId, publicationId, requestId) {
    return buildRequest(OPERATIONS.ACTIVATE, requestId, {
      campaignId: String(campaignId == null ? '' : campaignId).trim(),
      publicationId: String(publicationId == null ? '' : publicationId).trim()
    });
  }

  function createDeactivateRequest(campaignId, requestId) {
    return buildRequest(OPERATIONS.DEACTIVATE, requestId, {
      campaignId: String(campaignId == null ? '' : campaignId).trim()
    });
  }

  function createGetPublicationRequest(campaignId, publicationId, requestId) {
    return buildRequest(OPERATIONS.GET, requestId, {
      campaignId: String(campaignId == null ? '' : campaignId).trim(),
      publicationId: String(publicationId == null ? '' : publicationId).trim()
    });
  }

  function validPublication(value) {
    if (!exactKeys(value, PUBLICATION_KEYS)) return false;
    if (normalizedCampaignId(value.campaignId) !== value.campaignId || normalizedPublicationId(value.publicationId) !== value.publicationId) return false;
    if (!validPositiveVersion(value.version) || normalizedSchemaVersion(value.schemaVersion) !== value.schemaVersion || !validContentHash(value.contentHash)) return false;
    try {
      var copy = cloneStrict(value.content, [], '$.data.publication.content');
      return isPlainObject(copy) && measureJsonBytes(copy) <= LIMITS.MAX_CONTENT_BYTES;
    } catch (ignore) { return false; }
  }

  function validPublicationRecord(value) {
    return exactKeys(value, PUBLICATION_RECORD_KEYS) &&
      normalizedPublicationId(value.publicationId) === value.publicationId &&
      normalizedCampaignId(value.campaignId) === value.campaignId &&
      validPositiveVersion(value.version) &&
      normalizedSchemaVersion(value.schemaVersion) === value.schemaVersion &&
      validContentHash(value.contentHash) &&
      normalizedDraftRevision(value.sourceDraftRevision) === value.sourceDraftRevision &&
      validIsoUtc(value.createdAt) && value.status === 'PUBLISHED';
  }

  function validActiveReference(value) {
    return exactKeys(value, ACTIVE_REFERENCE_KEYS) &&
      normalizedCampaignId(value.campaignId) === value.campaignId &&
      normalizedPublicationId(value.publicationId) === value.publicationId &&
      validPositiveVersion(value.version) && validContentHash(value.contentHash) && validIsoUtc(value.activatedAt);
  }

  function validActivationRecord(value) {
    return exactKeys(value, ACTIVATION_RECORD_KEYS) &&
      normalizedRequestId(value.activationId) === value.activationId &&
      (value.action === 'ACTIVATE' || value.action === 'DEACTIVATE') &&
      normalizedCampaignId(value.campaignId) === value.campaignId &&
      validNullablePublicationId(value.previousPublicationId) && validNullablePublicationId(value.nextPublicationId) &&
      validIsoUtc(value.occurredAt);
  }

  function validRemoteError(value) {
    return exactKeys(value, ERROR_KEYS) && errorCodeKnown(value.code) && typeof value.message === 'string' && value.message.trim() !== '' && typeof value.retryable === 'boolean';
  }

  function pushIdentityIssue(issues, message, path) {
    issues.push(createIssue(ERROR_CODES.REMOTE_IDENTITY_MISMATCH, message, path));
  }

  function validatePublishData(data, request, issues) {
    if (!exactKeys(data, PUBLISH_DATA_KEYS) || !validPublication(data.publication) || !validPublicationRecord(data.record)) {
      issues.push(createIssue(ERROR_CODES.REMOTE_RESPONSE_INVALID, 'publishPublication response data is invalid.', '$.data'));
      return;
    }
    var publication = data.publication;
    var record = data.record;
    if (record.publicationId !== publication.publicationId || record.campaignId !== publication.campaignId || record.version !== publication.version || record.schemaVersion !== publication.schemaVersion || record.contentHash !== publication.contentHash) {
      pushIdentityIssue(issues, 'PublicationRecord does not match PublishedCampaign.', '$.data.record');
    }
    if (request) {
      if (publication.campaignId !== request.payload.campaignId) pushIdentityIssue(issues, 'Published campaignId does not match request.', '$.data.publication.campaignId');
      if (publication.schemaVersion !== request.payload.schemaVersion) pushIdentityIssue(issues, 'Published schemaVersion does not match request.', '$.data.publication.schemaVersion');
      if (publication.contentHash !== request.payload.contentHash) pushIdentityIssue(issues, 'Published contentHash does not match request.', '$.data.publication.contentHash');
      if (record.sourceDraftRevision !== request.payload.draftRevision) pushIdentityIssue(issues, 'PublicationRecord sourceDraftRevision does not match request.', '$.data.record.sourceDraftRevision');
    }
  }

  function validateActivationData(data, request, operation, issues) {
    if (!exactKeys(data, ACTIVATION_DATA_KEYS) || typeof data.changed !== 'boolean' || data.reference !== null && !validActiveReference(data.reference) || data.record !== null && !validActivationRecord(data.record)) {
      issues.push(createIssue(ERROR_CODES.REMOTE_RESPONSE_INVALID, operation + ' response data is invalid.', '$.data'));
      return;
    }
    if (data.changed && data.record === null) {
      issues.push(createIssue(ERROR_CODES.REMOTE_RESPONSE_INVALID, 'Changed activation response requires a record.', '$.data.record'));
      return;
    }
    if (!data.changed && data.record !== null) {
      issues.push(createIssue(ERROR_CODES.REMOTE_RESPONSE_INVALID, 'Unchanged activation response must not contain a record.', '$.data.record'));
      return;
    }
    if (operation === OPERATIONS.ACTIVATE) {
      if (data.reference === null) {
        issues.push(createIssue(ERROR_CODES.REMOTE_RESPONSE_INVALID, 'activatePublication success requires an active reference.', '$.data.reference'));
        return;
      }
      if (request && (data.reference.campaignId !== request.payload.campaignId || data.reference.publicationId !== request.payload.publicationId)) {
        pushIdentityIssue(issues, 'Active reference does not match activation request.', '$.data.reference');
      }
      if (data.record) {
        if (data.record.action !== 'ACTIVATE' || data.record.campaignId !== data.reference.campaignId || data.record.nextPublicationId !== data.reference.publicationId) {
          pushIdentityIssue(issues, 'ActivationRecord does not match active reference.', '$.data.record');
        }
      }
    } else {
      if (data.reference !== null) {
        issues.push(createIssue(ERROR_CODES.REMOTE_RESPONSE_INVALID, 'deactivatePublication success must return a null active reference.', '$.data.reference'));
        return;
      }
      if (data.record) {
        if (data.record.action !== 'DEACTIVATE' || request && data.record.campaignId !== request.payload.campaignId || data.record.nextPublicationId !== null) {
          pushIdentityIssue(issues, 'DeactivationRecord does not match deactivation request.', '$.data.record');
        }
      }
    }
  }

  function validateGetData(data, request, issues) {
    if (!exactKeys(data, GET_DATA_KEYS) || !validPublication(data.publication) || !validActiveReference(data.activeReference)) {
      issues.push(createIssue(ERROR_CODES.REMOTE_RESPONSE_INVALID, 'getPublication response data is invalid.', '$.data'));
      return;
    }
    var publication = data.publication;
    var reference = data.activeReference;
    if (reference.campaignId !== publication.campaignId || reference.publicationId !== publication.publicationId || reference.version !== publication.version || reference.contentHash !== publication.contentHash) {
      pushIdentityIssue(issues, 'Active reference does not match publication.', '$.data.activeReference');
    }
    if (request && (publication.campaignId !== request.payload.campaignId || publication.publicationId !== request.payload.publicationId)) {
      pushIdentityIssue(issues, 'Publication does not match getPublication request.', '$.data.publication');
    }
  }

  function validateResponse(value, request) {
    var issues = [];
    var expectedRequest = request == null ? null : request;
    if (expectedRequest) {
      var requestValidation = validateRequest(expectedRequest);
      if (!requestValidation.valid) return validation([createIssue(ERROR_CODES.INVALID_REQUEST, 'Expected request is invalid.', '$request')]);
    }
    if (!exactKeys(value, RESPONSE_KEYS)) return validation([createIssue(ERROR_CODES.REMOTE_RESPONSE_INVALID, 'Remote response envelope shape is invalid.', '$')]);
    if (value.protocolVersion !== PROTOCOL_VERSION) issues.push(createIssue(ERROR_CODES.UNSUPPORTED_PROTOCOL, 'Remote response protocolVersion is unsupported.', '$.protocolVersion'));
    if (!operationKnown(value.operation)) issues.push(createIssue(ERROR_CODES.UNSUPPORTED_OPERATION, 'Remote response operation is unsupported.', '$.operation'));
    if (normalizedRequestId(value.requestId) !== value.requestId) issues.push(createIssue(ERROR_CODES.REMOTE_RESPONSE_INVALID, 'Remote response requestId is invalid.', '$.requestId'));
    if (typeof value.success !== 'boolean') issues.push(createIssue(ERROR_CODES.REMOTE_RESPONSE_INVALID, 'Remote response success must be boolean.', '$.success'));
    if (expectedRequest) {
      if (value.operation !== expectedRequest.operation) pushIdentityIssue(issues, 'Response operation does not match request.', '$.operation');
      if (value.requestId !== expectedRequest.requestId) pushIdentityIssue(issues, 'Response requestId does not match request.', '$.requestId');
    }
    if (value.success === true) {
      if (value.error !== null || !isPlainObject(value.data)) {
        issues.push(createIssue(ERROR_CODES.REMOTE_RESPONSE_INVALID, 'Successful response requires data and null error.', '$'));
      } else if (value.operation === OPERATIONS.PUBLISH) validatePublishData(value.data, expectedRequest && expectedRequest.operation === OPERATIONS.PUBLISH ? expectedRequest : null, issues);
      else if (value.operation === OPERATIONS.ACTIVATE) validateActivationData(value.data, expectedRequest && expectedRequest.operation === OPERATIONS.ACTIVATE ? expectedRequest : null, OPERATIONS.ACTIVATE, issues);
      else if (value.operation === OPERATIONS.DEACTIVATE) validateActivationData(value.data, expectedRequest && expectedRequest.operation === OPERATIONS.DEACTIVATE ? expectedRequest : null, OPERATIONS.DEACTIVATE, issues);
      else if (value.operation === OPERATIONS.GET) validateGetData(value.data, expectedRequest && expectedRequest.operation === OPERATIONS.GET ? expectedRequest : null, issues);
    } else if (value.success === false) {
      if (value.data !== null || !validRemoteError(value.error)) issues.push(createIssue(ERROR_CODES.REMOTE_RESPONSE_INVALID, 'Failed response requires null data and a valid error.', '$'));
    }
    return validation(issues);
  }

  function createLocalResponseError(code, message) {
    return deepFreeze({ code: code, message: String(message || code), retryable: false });
  }

  function parseResponse(value, request) {
    var result = validateResponse(value, request);
    if (!result.valid) {
      var first = result.issues[0];
      return deepFreeze({
        accepted: false,
        response: null,
        error: createLocalResponseError(first.code === ERROR_CODES.REMOTE_IDENTITY_MISMATCH ? ERROR_CODES.REMOTE_IDENTITY_MISMATCH : ERROR_CODES.REMOTE_RESPONSE_INVALID, first.message)
      });
    }
    return deepFreeze({ accepted: true, response: frozenCopy(value), error: null });
  }

  function isRequest(value) { return validateRequest(value).valid && Object.isFrozen(value); }
  function isResponse(value, request) { return validateResponse(value, request).valid && Object.isFrozen(value); }
  function isParsedResponse(value) {
    if (!exactKeys(value, PARSED_RESPONSE_KEYS) || !Object.isFrozen(value) || typeof value.accepted !== 'boolean') return false;
    if (value.accepted) return value.error === null && value.response !== null && isResponse(value.response);
    return value.response === null && validRemoteError(value.error) && (value.error.code === ERROR_CODES.REMOTE_RESPONSE_INVALID || value.error.code === ERROR_CODES.REMOTE_IDENTITY_MISMATCH);
  }

  window.CRIOS_REMOTE_PUBLICATION_CONTRACT = Object.freeze({
    version: VERSION,
    constants: CONSTANTS,
    createPublishRequest: createPublishRequest,
    createActivateRequest: createActivateRequest,
    createDeactivateRequest: createDeactivateRequest,
    createGetPublicationRequest: createGetPublicationRequest,
    validateRequest: validateRequest,
    validateResponse: validateResponse,
    parseResponse: parseResponse,
    isRequest: isRequest,
    isResponse: isResponse,
    isParsedResponse: isParsedResponse,
    measureJsonBytes: measureJsonBytes
  });
})();
