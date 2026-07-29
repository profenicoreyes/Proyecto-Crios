/* CRIOS Publication Activation - model and primitives */
(function(){
  'use strict';

  var root = window.CRIOS_PUBLICATION_ACTIVATION_INTERNAL || {};
  root.internals = root.internals || {};
  var internals = root.internals;

  var ACTIONS = Object.freeze({
    ACTIVATE: 'ACTIVATE',
    DEACTIVATE: 'DEACTIVATE',
    ROLLBACK: 'ROLLBACK'
  });

  var ERROR_CODES = Object.freeze({
    INVALID_CAMPAIGN_ID: 'INVALID_CAMPAIGN_ID',
    INVALID_PUBLICATION_ID: 'INVALID_PUBLICATION_ID',
    PUBLICATION_NOT_FOUND: 'PUBLICATION_NOT_FOUND',
    CAMPAIGN_MISMATCH: 'CAMPAIGN_MISMATCH',
    CONTENT_HASH_MISMATCH: 'CONTENT_HASH_MISMATCH',
    VERSION_MISMATCH: 'VERSION_MISMATCH',
    NO_ACTIVE_PUBLICATION: 'NO_ACTIVE_PUBLICATION',
    ROLLBACK_TARGET_INVALID: 'ROLLBACK_TARGET_INVALID',
    ACTIVATION_CONFLICT: 'ACTIVATION_CONFLICT',
    ACTIVATION_STORE_FAILED: 'ACTIVATION_STORE_FAILED',
    ACTIVATION_ID_FAILED: 'ACTIVATION_ID_FAILED',
    RESOLUTION_FAILED: 'RESOLUTION_FAILED'
  });

  var CONSTANTS = Object.freeze({
    actions: ACTIONS,
    errorCodes: ERROR_CODES
  });

  function isPlainObject(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    var proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
  }

  function cloneStrict(value, seen, path) {
    var kind = typeof value;
    if (value === null) return null;
    if (kind === 'string' || kind === 'boolean') return value;
    if (kind === 'number') {
      if (!Number.isFinite(value)) throw new Error('Non-finite number at ' + path + '.');
      return value;
    }
    if (kind === 'undefined' || kind === 'function' || kind === 'symbol' || kind === 'bigint') {
      throw new Error('Unsupported value at ' + path + '.');
    }
    if (seen.has(value)) throw new Error('Circular reference at ' + path + '.');
    seen.add(value);

    if (Array.isArray(value)) {
      var arrayCopy = new Array(value.length);
      for (var i = 0; i < value.length; i += 1) {
        arrayCopy[i] = cloneStrict(value[i], seen, path + '[' + i + ']');
      }
      seen.delete(value);
      return arrayCopy;
    }

    if (!isPlainObject(value)) throw new Error('Only plain objects are supported at ' + path + '.');
    var objectCopy = {};
    var keys = Object.keys(value);
    for (var j = 0; j < keys.length; j += 1) {
      objectCopy[keys[j]] = cloneStrict(value[keys[j]], seen, path + '.' + keys[j]);
    }
    seen.delete(value);
    return objectCopy;
  }

  function deepClone(value) {
    return cloneStrict(value, new Set(), '$');
  }

  function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    var keys = Object.keys(value);
    for (var i = 0; i < keys.length; i += 1) deepFreeze(value[keys[i]]);
    return Object.freeze(value);
  }

  function frozenCopy(value) {
    if (value == null) return value;
    return deepFreeze(deepClone(value));
  }

  function exactKeys(value, expected) {
    if (!isPlainObject(value)) return false;
    var keys = Object.keys(value).sort();
    var sortedExpected = expected.slice().sort();
    if (keys.length !== sortedExpected.length) return false;
    for (var i = 0; i < keys.length; i += 1) {
      if (keys[i] !== sortedExpected[i]) return false;
    }
    return true;
  }

  function isNonEmptyString(value) {
    return typeof value === 'string' && value.trim() !== '';
  }

  function isNullablePublicationId(value) {
    return value === null || isNonEmptyString(value);
  }

  function isActivePublicationReference(value) {
    if (!exactKeys(value, ['campaignId', 'publicationId', 'version', 'contentHash', 'activatedAt'])) return false;
    return isNonEmptyString(value.campaignId) &&
      isNonEmptyString(value.publicationId) &&
      Number.isInteger(value.version) && value.version > 0 &&
      isNonEmptyString(value.contentHash) &&
      isNonEmptyString(value.activatedAt);
  }

  function isActivationRecord(value) {
    if (!exactKeys(value, ['activationId', 'action', 'campaignId', 'previousPublicationId', 'nextPublicationId', 'occurredAt'])) return false;
    return isNonEmptyString(value.activationId) &&
      Object.prototype.hasOwnProperty.call(ACTIONS, value.action) &&
      isNonEmptyString(value.campaignId) &&
      isNullablePublicationId(value.previousPublicationId) &&
      isNullablePublicationId(value.nextPublicationId) &&
      isNonEmptyString(value.occurredAt);
  }

  function isActivationResult(value) {
    if (!exactKeys(value, ['success', 'changed', 'reference', 'publication', 'record', 'error'])) return false;
    if (typeof value.success !== 'boolean' || typeof value.changed !== 'boolean') return false;
    if (value.reference !== null && !isActivePublicationReference(value.reference)) return false;
    if (value.record !== null && !isActivationRecord(value.record)) return false;
    if (value.success) {
      if (value.error !== null) return false;
      return value.changed ? value.record !== null : value.record === null;
    }
    return value.changed === false && value.record === null && value.error !== null;
  }

  function createActivePublicationReference(input) {
    var source = isPlainObject(input) ? input : {};
    return deepFreeze({
      campaignId: String(source.campaignId || '').trim(),
      publicationId: String(source.publicationId || '').trim(),
      version: Number(source.version),
      contentHash: String(source.contentHash || '').trim(),
      activatedAt: String(source.activatedAt || '').trim()
    });
  }

  function createActivationRecord(input) {
    var source = isPlainObject(input) ? input : {};
    return deepFreeze({
      activationId: String(source.activationId || '').trim(),
      action: String(source.action || ''),
      campaignId: String(source.campaignId || '').trim(),
      previousPublicationId: source.previousPublicationId == null ? null : String(source.previousPublicationId).trim(),
      nextPublicationId: source.nextPublicationId == null ? null : String(source.nextPublicationId).trim(),
      occurredAt: String(source.occurredAt || '').trim()
    });
  }

  function createActivationResult(input) {
    var source = isPlainObject(input) ? input : {};
    return deepFreeze({
      success: Boolean(source.success),
      changed: Boolean(source.changed),
      reference: source.reference == null ? null : deepClone(source.reference),
      publication: source.publication == null ? null : deepClone(source.publication),
      record: source.record == null ? null : deepClone(source.record),
      error: source.error == null ? null : deepClone(source.error)
    });
  }

  function createError(code, message, metadata) {
    var error = new Error(String(message || code));
    error.code = code;
    error.metadata = metadata == null ? null : frozenCopy(metadata);
    return error;
  }

  function createErrorPayload(code, message, metadata) {
    return deepFreeze({
      code: String(code),
      message: String(message || code),
      metadata: metadata == null ? null : deepClone(metadata)
    });
  }

  internals.constants = CONSTANTS;
  internals.deepClone = deepClone;
  internals.deepFreeze = deepFreeze;
  internals.frozenCopy = frozenCopy;
  internals.createError = createError;
  internals.createErrorPayload = createErrorPayload;
  internals.createActivePublicationReference = createActivePublicationReference;
  internals.createActivationRecord = createActivationRecord;
  internals.createActivationResult = createActivationResult;
  internals.isActivePublicationReference = isActivePublicationReference;
  internals.isActivationRecord = isActivationRecord;
  internals.isActivationResult = isActivationResult;

  window.CRIOS_PUBLICATION_ACTIVATION_INTERNAL = root;
})();