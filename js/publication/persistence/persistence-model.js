/* CRIOS Publication Persistence - model and validation */
(function(){
  'use strict';

  var root = window.CRIOS_PUBLICATION_PERSISTENCE_INTERNAL || {};
  root.internals = root.internals || {};
  var internals = root.internals;

  var STATUS = Object.freeze({
    READY: 'READY', EMPTY: 'EMPTY', DEGRADED: 'DEGRADED', CORRUPTED: 'CORRUPTED',
    UNAVAILABLE: 'UNAVAILABLE', UNSUPPORTED_SCHEMA: 'UNSUPPORTED_SCHEMA'
  });
  var ERROR_CODES = Object.freeze({
    PERSISTENCE_UNAVAILABLE: 'PERSISTENCE_UNAVAILABLE',
    PERSISTENCE_READ_FAILED: 'PERSISTENCE_READ_FAILED',
    PERSISTENCE_WRITE_FAILED: 'PERSISTENCE_WRITE_FAILED',
    PERSISTENCE_CLEAR_FAILED: 'PERSISTENCE_CLEAR_FAILED',
    PERSISTENCE_CORRUPTED: 'PERSISTENCE_CORRUPTED',
    PERSISTENCE_SCHEMA_UNSUPPORTED: 'PERSISTENCE_SCHEMA_UNSUPPORTED',
    PERSISTENCE_CONFLICT: 'PERSISTENCE_CONFLICT',
    PERSISTENCE_QUOTA_EXCEEDED: 'PERSISTENCE_QUOTA_EXCEEDED',
    PERSISTENCE_SIZE_EXCEEDED: 'PERSISTENCE_SIZE_EXCEEDED',
    PERSISTENCE_INCONSISTENT: 'PERSISTENCE_INCONSISTENT',
    PERSISTENCE_VERIFICATION_FAILED: 'PERSISTENCE_VERIFICATION_FAILED'
  });
  var CONSTANTS = Object.freeze({
    STORAGE_KEY: 'crios.publication.persistence.v1',
    SCHEMA_VERSION: 1,
    MAX_BYTES: 3500000,
    status: STATUS,
    errorCodes: ERROR_CODES
  });

  function isPlainObject(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    var proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
  }

  function cloneStrict(value, seen, path) {
    var type = typeof value;
    if (value === null || type === 'string' || type === 'boolean') return value;
    if (type === 'number') {
      if (!Number.isFinite(value)) throw createError(ERROR_CODES.PERSISTENCE_INCONSISTENT, 'Non-finite number at ' + path + '.');
      return value;
    }
    if (type === 'undefined' || type === 'function' || type === 'symbol' || type === 'bigint') {
      throw createError(ERROR_CODES.PERSISTENCE_INCONSISTENT, 'Unsupported value at ' + path + '.');
    }
    if (value && typeof value.nodeType === 'number') {
      throw createError(ERROR_CODES.PERSISTENCE_INCONSISTENT, 'DOM values are not persistable.');
    }
    if (seen.has(value)) throw createError(ERROR_CODES.PERSISTENCE_INCONSISTENT, 'Circular value at ' + path + '.');
    seen.add(value);
    if (Array.isArray(value)) {
      var arrayCopy = value.map(function(item, index){ return cloneStrict(item, seen, path + '[' + index + ']'); });
      seen.delete(value);
      return arrayCopy;
    }
    if (!isPlainObject(value)) throw createError(ERROR_CODES.PERSISTENCE_INCONSISTENT, 'Only plain objects are persistable.');
    var copy = {};
    Object.keys(value).forEach(function(key){ copy[key] = cloneStrict(value[key], seen, path + '.' + key); });
    seen.delete(value);
    return copy;
  }

  function deepClone(value) { return cloneStrict(value, new Set(), '$'); }
  function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.keys(value).forEach(function(key){ deepFreeze(value[key]); });
    return Object.freeze(value);
  }
  function frozenCopy(value) { return value == null ? value : deepFreeze(deepClone(value)); }
  function createError(code, message, metadata) {
    var error = new Error(String(message || code));
    error.code = code;
    error.metadata = metadata == null ? null : frozenCopy(metadata);
    return error;
  }
  function errorPayload(error) {
    return deepFreeze({
      code: String(error && error.code || ERROR_CODES.PERSISTENCE_INCONSISTENT),
      message: String(error && error.message || 'Persistence error.'),
      metadata: error && error.metadata ? deepClone(error.metadata) : null
    });
  }
  function emptyDocument(schemaVersion) {
    return deepFreeze({
      schemaVersion: Number(schemaVersion), stateRevision: 0, updatedAt: null,
      publications: [], publicationRecords: [], activeReferences: [], activationRecords: []
    });
  }
  function exactKeys(value, keys) {
    if (!isPlainObject(value)) return false;
    var actual = Object.keys(value).sort();
    var expected = keys.slice().sort();
    return actual.length === expected.length && actual.every(function(key, index){ return key === expected[index]; });
  }
  function nonEmpty(value) { return typeof value === 'string' && value.trim() !== ''; }
  function validIso(value) { return value === null || (nonEmpty(value) && !Number.isNaN(Date.parse(value))); }
  function validPublication(value) {
    return exactKeys(value, ['campaignId','publicationId','version','schemaVersion','contentHash','content']) &&
      nonEmpty(value.campaignId) && nonEmpty(value.publicationId) && Number.isInteger(value.version) && value.version > 0 &&
      nonEmpty(value.schemaVersion) && nonEmpty(value.contentHash) && isPlainObject(value.content);
  }
  function validPublicationRecord(value) {
    return exactKeys(value, ['publicationId','campaignId','version','schemaVersion','contentHash','sourceDraftRevision','createdAt','status']) &&
      nonEmpty(value.publicationId) && nonEmpty(value.campaignId) && Number.isInteger(value.version) && value.version > 0 &&
      nonEmpty(value.schemaVersion) && nonEmpty(value.contentHash) && validIso(value.createdAt) && value.createdAt !== null;
  }
  function validReference(value) {
    return exactKeys(value, ['campaignId','publicationId','version','contentHash','activatedAt']) &&
      nonEmpty(value.campaignId) && nonEmpty(value.publicationId) && Number.isInteger(value.version) && value.version > 0 &&
      nonEmpty(value.contentHash) && validIso(value.activatedAt) && value.activatedAt !== null;
  }
  function validActivationRecord(value) {
    return exactKeys(value, ['activationId','action','campaignId','previousPublicationId','nextPublicationId','occurredAt']) &&
      nonEmpty(value.activationId) && ['ACTIVATE','DEACTIVATE','ROLLBACK'].indexOf(value.action) >= 0 && nonEmpty(value.campaignId) &&
      (value.previousPublicationId === null || nonEmpty(value.previousPublicationId)) &&
      (value.nextPublicationId === null || nonEmpty(value.nextPublicationId)) && validIso(value.occurredAt) && value.occurredAt !== null;
  }

  function validateDocument(value, expectedSchemaVersion) {
    if (!exactKeys(value, ['schemaVersion','stateRevision','updatedAt','publications','publicationRecords','activeReferences','activationRecords'])) {
      throw createError(ERROR_CODES.PERSISTENCE_INCONSISTENT, 'Persistence document shape is invalid.');
    }
    if (value.schemaVersion !== expectedSchemaVersion) {
      throw createError(ERROR_CODES.PERSISTENCE_SCHEMA_UNSUPPORTED, 'Persistence schema is unsupported.', { observed: value.schemaVersion, expected: expectedSchemaVersion });
    }
    if (!Number.isInteger(value.stateRevision) || value.stateRevision < 0 || !validIso(value.updatedAt)) {
      throw createError(ERROR_CODES.PERSISTENCE_INCONSISTENT, 'Persistence metadata is invalid.');
    }
    if (![value.publications,value.publicationRecords,value.activeReferences,value.activationRecords].every(Array.isArray)) {
      throw createError(ERROR_CODES.PERSISTENCE_INCONSISTENT, 'Persistence collections must be arrays.');
    }

    var publications = new Map();
    var versions = new Set();
    value.publications.forEach(function(publication){
      if (!validPublication(publication)) throw createError(ERROR_CODES.PERSISTENCE_INCONSISTENT, 'PublishedCampaign is invalid.');
      if (publications.has(publication.publicationId)) throw createError(ERROR_CODES.PERSISTENCE_INCONSISTENT, 'Duplicate publicationId.');
      var versionKey = publication.campaignId + '\u0000' + publication.version;
      if (versions.has(versionKey)) throw createError(ERROR_CODES.PERSISTENCE_INCONSISTENT, 'Duplicate campaign version.');
      publications.set(publication.publicationId, publication); versions.add(versionKey);
    });
    var records = new Map();
    value.publicationRecords.forEach(function(record){
      if (!validPublicationRecord(record) || records.has(record.publicationId)) throw createError(ERROR_CODES.PERSISTENCE_INCONSISTENT, 'PublicationRecord is invalid or duplicated.');
      records.set(record.publicationId, record);
    });
    if (publications.size !== records.size) throw createError(ERROR_CODES.PERSISTENCE_INCONSISTENT, 'Publication and record counts differ.');
    publications.forEach(function(publication, id){
      var record = records.get(id);
      if (!record || ['campaignId','version','schemaVersion','contentHash'].some(function(key){ return record[key] !== publication[key]; })) {
        throw createError(ERROR_CODES.PERSISTENCE_INCONSISTENT, 'Publication and record are inconsistent.');
      }
    });
    var referenceCampaigns = new Set();
    value.activeReferences.forEach(function(reference){
      if (!validReference(reference) || referenceCampaigns.has(reference.campaignId)) throw createError(ERROR_CODES.PERSISTENCE_INCONSISTENT, 'Active reference is invalid or duplicated.');
      var publication = publications.get(reference.publicationId);
      if (!publication || publication.campaignId !== reference.campaignId || publication.version !== reference.version || publication.contentHash !== reference.contentHash) {
        throw createError(ERROR_CODES.PERSISTENCE_INCONSISTENT, 'Active reference does not resolve to its publication.');
      }
      referenceCampaigns.add(reference.campaignId);
    });
    var activationIds = new Set();
    var previousTime = '';
    value.activationRecords.forEach(function(record){
      if (!validActivationRecord(record) || activationIds.has(record.activationId)) throw createError(ERROR_CODES.PERSISTENCE_INCONSISTENT, 'ActivationRecord is invalid or duplicated.');
      if (record.previousPublicationId !== null && (!publications.has(record.previousPublicationId) || publications.get(record.previousPublicationId).campaignId !== record.campaignId)) throw createError(ERROR_CODES.PERSISTENCE_INCONSISTENT, 'Activation previous publication is missing or belongs to another campaign.');
      if (record.nextPublicationId !== null && (!publications.has(record.nextPublicationId) || publications.get(record.nextPublicationId).campaignId !== record.campaignId)) throw createError(ERROR_CODES.PERSISTENCE_INCONSISTENT, 'Activation next publication is missing or belongs to another campaign.');
      if (previousTime && record.occurredAt < previousTime) throw createError(ERROR_CODES.PERSISTENCE_INCONSISTENT, 'Activation history is not ordered.');
      previousTime = record.occurredAt; activationIds.add(record.activationId);
    });
    return true;
  }

  function isPersistenceDocument(value) {
    try { validateDocument(value, CONSTANTS.SCHEMA_VERSION); return true; } catch (error) { return false; }
  }
  function serialize(value) {
    var copy = deepClone(value);
    var json;
    try { json = JSON.stringify(copy); } catch (error) { throw createError(ERROR_CODES.PERSISTENCE_INCONSISTENT, 'Value cannot be serialized.'); }
    if (typeof json !== 'string') throw createError(ERROR_CODES.PERSISTENCE_INCONSISTENT, 'Value cannot be serialized.');
    return json;
  }
  function calculateSerializedSize(value) {
    var json = serialize(value);
    if (typeof TextEncoder === 'function') return new TextEncoder().encode(json).byteLength;
    return encodeURIComponent(json).replace(/%[0-9A-F]{2}|./g, 'x').length;
  }

  internals.constants = CONSTANTS;
  internals.deepClone = deepClone;
  internals.deepFreeze = deepFreeze;
  internals.frozenCopy = frozenCopy;
  internals.createError = createError;
  internals.errorPayload = errorPayload;
  internals.emptyDocument = emptyDocument;
  internals.validateDocument = validateDocument;
  internals.isPersistenceDocument = isPersistenceDocument;
  internals.serialize = serialize;
  internals.calculateSerializedSize = calculateSerializedSize;
  window.CRIOS_PUBLICATION_PERSISTENCE_INTERNAL = root;
})();