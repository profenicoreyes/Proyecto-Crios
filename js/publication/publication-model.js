/* CRIOS Publication Core — model and primitives */
(function(){
  'use strict';

  var core = window.CRIOS_PUBLICATION_CORE || {};
  if (Object.isFrozen(core)) {
    throw new Error('CRIOS Publication Core: API already frozen before model initialization.');
  }
  core.__internals = core.__internals || {};
  var internals = core.__internals;

  var SEVERITY = Object.freeze({
    ERROR: 'ERROR',
    WARNING: 'WARNING',
    INFO: 'INFO'
  });

  var RECORD_STATUS = Object.freeze({
    VALIDATING: 'VALIDATING',
    REJECTED: 'REJECTED',
    READY: 'READY',
    PUBLISHING: 'PUBLISHING',
    PUBLISHED: 'PUBLISHED',
    FAILED: 'FAILED'
  });

  var ERROR_CODES = Object.freeze({
    INVALID_DRAFT: 'INVALID_DRAFT',
    VALIDATION_FAILED: 'VALIDATION_FAILED',
    DRAFT_REVISION_CONFLICT: 'DRAFT_REVISION_CONFLICT',
    CAMPAIGN_ID_MISSING: 'CAMPAIGN_ID_MISSING',
    DUPLICATE_ID: 'DUPLICATE_ID',
    MISSING_REFERENCE: 'MISSING_REFERENCE',
    RUNTIME_INCOMPATIBLE: 'RUNTIME_INCOMPATIBLE',
    SERIALIZATION_FAILED: 'SERIALIZATION_FAILED',
    CANONICALIZATION_FAILED: 'CANONICALIZATION_FAILED',
    HASH_FAILED: 'HASH_FAILED',
    PUBLICATION_PERSISTENCE_FAILED: 'PUBLICATION_PERSISTENCE_FAILED',
    RECORD_PERSISTENCE_FAILED: 'RECORD_PERSISTENCE_FAILED',
    SCHEMA_VERSION_UNSUPPORTED: 'SCHEMA_VERSION_UNSUPPORTED'
  });

  var CONSTANTS = Object.freeze({
    severity: SEVERITY,
    recordStatus: RECORD_STATUS,
    errorCodes: ERROR_CODES
  });

  function isPlainObject(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    var proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
  }

  function isDomNode(value) {
    return !!(value && typeof value === 'object' && typeof value.nodeType === 'number' && typeof value.nodeName === 'string');
  }

  function isPromiseLike(value) {
    return !!(value && (typeof value === 'object' || typeof value === 'function') && typeof value.then === 'function');
  }

  function createCoreError(code, message, metadata) {
    var error = new Error(String(message || code || 'Publication core error'));
    error.code = code || ERROR_CODES.INVALID_DRAFT;
    error.metadata = metadata || null;
    return error;
  }

  function cloneStrict(value, seen, path) {
    var valueType = typeof value;
    if (value === null) return null;
    if (valueType === 'string' || valueType === 'boolean') return value;
    if (valueType === 'number') {
      if (!Number.isFinite(value)) {
        throw createCoreError(ERROR_CODES.SERIALIZATION_FAILED, 'Non-finite number at ' + path + '.');
      }
      return value;
    }
    if (valueType === 'undefined') {
      throw createCoreError(ERROR_CODES.SERIALIZATION_FAILED, 'Undefined value at ' + path + '.');
    }
    if (valueType === 'function') {
      throw createCoreError(ERROR_CODES.SERIALIZATION_FAILED, 'Function value is not serializable at ' + path + '.');
    }
    if (valueType === 'symbol') {
      throw createCoreError(ERROR_CODES.SERIALIZATION_FAILED, 'Symbol value is not serializable at ' + path + '.');
    }
    if (valueType === 'bigint') {
      throw createCoreError(ERROR_CODES.SERIALIZATION_FAILED, 'BigInt value is not serializable at ' + path + '.');
    }

    if (isDomNode(value)) {
      throw createCoreError(ERROR_CODES.SERIALIZATION_FAILED, 'DOM node is not serializable at ' + path + '.');
    }
    if (isPromiseLike(value)) {
      throw createCoreError(ERROR_CODES.SERIALIZATION_FAILED, 'Promise-like value is not serializable at ' + path + '.');
    }

    if (seen.has(value)) {
      throw createCoreError(ERROR_CODES.SERIALIZATION_FAILED, 'Circular reference detected at ' + path + '.');
    }
    seen.set(value, true);

    if (Array.isArray(value)) {
      var outArray = new Array(value.length);
      for (var i = 0; i < value.length; i += 1) {
        outArray[i] = cloneStrict(value[i], seen, path + '[' + i + ']');
      }
      seen.delete(value);
      return outArray;
    }

    if (!isPlainObject(value)) {
      throw createCoreError(ERROR_CODES.SERIALIZATION_FAILED, 'Only plain objects are allowed at ' + path + '.');
    }

    var outObject = {};
    var keys = Object.keys(value);
    for (var j = 0; j < keys.length; j += 1) {
      var key = keys[j];
      outObject[key] = cloneStrict(value[key], seen, path + '.' + key);
    }
    seen.delete(value);
    return outObject;
  }

  function deepClone(value) {
    return cloneStrict(value, new Map(), '$');
  }

  function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    var keys = Object.keys(value);
    for (var i = 0; i < keys.length; i += 1) {
      deepFreeze(value[keys[i]]);
    }
    return Object.freeze(value);
  }

  function createValidationIssue(input) {
    var src = isPlainObject(input) ? input : {};
    var issue = {
      code: String(src.code || ERROR_CODES.INVALID_DRAFT),
      severity: String(src.severity || SEVERITY.ERROR),
      level: String(src.level || 'structural'),
      path: src.path == null ? '' : String(src.path),
      message: String(src.message || 'Validation issue.'),
      metadata: src.metadata == null ? null : deepClone(src.metadata)
    };
    return deepFreeze(issue);
  }

  function createPublicationCandidate(input) {
    var src = isPlainObject(input) ? input : {};
    var candidate = {
      campaignId: String(src.campaignId || '').trim(),
      draftRevision: String(src.draftRevision || '').trim(),
      schemaVersion: String(src.schemaVersion || '').trim(),
      content: deepClone(src.content || {})
    };
    return deepFreeze(candidate);
  }

  function createPublishedCampaign(input) {
    var src = isPlainObject(input) ? input : {};
    var publication = {
      campaignId: String(src.campaignId || '').trim(),
      publicationId: String(src.publicationId || '').trim(),
      version: Number(src.version),
      schemaVersion: String(src.schemaVersion || '').trim(),
      contentHash: String(src.contentHash || '').trim(),
      content: deepClone(src.content || {})
    };
    return deepFreeze(publication);
  }

  function createPublicationRecord(input) {
    var src = isPlainObject(input) ? input : {};
    var record = {
      publicationId: String(src.publicationId || '').trim(),
      campaignId: String(src.campaignId || '').trim(),
      version: Number(src.version),
      schemaVersion: String(src.schemaVersion || '').trim(),
      contentHash: String(src.contentHash || '').trim(),
      sourceDraftRevision: String(src.sourceDraftRevision || '').trim(),
      createdAt: String(src.createdAt || '').trim(),
      status: String(src.status || RECORD_STATUS.FAILED)
    };
    return deepFreeze(record);
  }

  function createPublicationResult(input) {
    var src = isPlainObject(input) ? input : {};
    var validation = src.validation == null ? null : deepClone(src.validation);
    var error = src.error == null ? null : deepClone(src.error);
    var result = {
      success: Boolean(src.success),
      publication: src.publication == null ? null : deepClone(src.publication),
      record: src.record == null ? null : deepClone(src.record),
      validation: validation,
      error: error
    };
    return deepFreeze(result);
  }

  function isPublishedCampaign(value) {
    if (!isPlainObject(value)) return false;
    if (typeof value.campaignId !== 'string' || value.campaignId.trim() === '') return false;
    if (typeof value.publicationId !== 'string' || value.publicationId.trim() === '') return false;
    if (!Number.isInteger(value.version) || value.version <= 0) return false;
    if (typeof value.schemaVersion !== 'string' || value.schemaVersion.trim() === '') return false;
    if (typeof value.contentHash !== 'string' || value.contentHash.trim() === '') return false;
    return isPlainObject(value.content);
  }

  function isPublicationResult(value) {
    if (!isPlainObject(value)) return false;
    var keys = Object.keys(value).sort();
    var expected = ['error', 'publication', 'record', 'success', 'validation'];
    if (keys.length !== expected.length) return false;
    for (var i = 0; i < expected.length; i += 1) {
      if (keys[i] !== expected[i]) return false;
    }
    if (typeof value.success !== 'boolean') return false;
    if (value.success === true) {
      return value.publication != null && value.record != null && value.error == null;
    }
    return value.publication == null && value.record == null && value.error != null;
  }

  internals.constants = CONSTANTS;
  internals.isPlainObject = isPlainObject;
  internals.deepClone = deepClone;
  internals.deepFreeze = deepFreeze;
  internals.createCoreError = createCoreError;
  internals.createValidationIssueModel = createValidationIssue;
  internals.createPublicationCandidateModel = createPublicationCandidate;
  internals.createPublishedCampaignModel = createPublishedCampaign;
  internals.createPublicationRecordModel = createPublicationRecord;
  internals.createPublicationResultModel = createPublicationResult;
  internals.isPublishedCampaign = isPublishedCampaign;
  internals.isPublicationResult = isPublicationResult;

  window.CRIOS_PUBLICATION_CORE = core;
})();
