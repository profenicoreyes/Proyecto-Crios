/* CRIOS Studio — publication draft adapter */
(function(){
  'use strict';

  var TRANSIENT_KEYS = Object.freeze({
    draftRevision: true,
    publicationId: true,
    contentHash: true,
    createdAt: true,
    updatedAt: true,
    uiState: true,
    modalOpen: true,
    selectedTab: true,
    searchQuery: true,
    feedback: true,
    trace: true,
    traces: true,
    runtime: true,
    currentScreen: true,
    statusMessage: true,
    temporaryMessage: true,
    temporaryError: true,
    lastValidation: true,
    lastResult: true
  });

  function createAdapterError(code, message) {
    var error = new Error(String(message || code));
    error.code = code;
    return error;
  }

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
      if (!Number.isFinite(value)) {
        throw createAdapterError('STUDIO_DRAFT_SERIALIZATION_FAILED', 'Non-finite number at ' + path + '.');
      }
      return value;
    }
    if (kind === 'undefined' || kind === 'function' || kind === 'symbol' || kind === 'bigint') {
      throw createAdapterError('STUDIO_DRAFT_SERIALIZATION_FAILED', 'Unsupported value at ' + path + '.');
    }

    if (value && typeof value.nodeType === 'number') {
      throw createAdapterError('STUDIO_DRAFT_SERIALIZATION_FAILED', 'DOM node is not serializable at ' + path + '.');
    }

    if (seen.has(value)) {
      throw createAdapterError('STUDIO_DRAFT_SERIALIZATION_FAILED', 'Circular reference at ' + path + '.');
    }
    seen.add(value);

    if (Array.isArray(value)) {
      var outArray = new Array(value.length);
      for (var i = 0; i < value.length; i += 1) {
        outArray[i] = cloneStrict(value[i], seen, path + '[' + i + ']');
      }
      seen.delete(value);
      return outArray;
    }

    if (!isPlainObject(value)) {
      throw createAdapterError('STUDIO_DRAFT_SERIALIZATION_FAILED', 'Only plain objects are supported at ' + path + '.');
    }

    var out = {};
    var keys = Object.keys(value);
    for (var j = 0; j < keys.length; j += 1) {
      var key = keys[j];
      if (TRANSIENT_KEYS[key] === true) continue;
      out[key] = cloneStrict(value[key], seen, path + '.' + key);
    }
    seen.delete(value);
    return out;
  }

  function deepClone(value) {
    return cloneStrict(value, new Set(), '$');
  }

  function sortForSignature(value, seen, path) {
    var kind = typeof value;

    if (value === null) return null;
    if (kind === 'string' || kind === 'boolean' || kind === 'number') return value;
    if (kind === 'undefined' || kind === 'function' || kind === 'symbol' || kind === 'bigint') {
      throw createAdapterError('STUDIO_DRAFT_SIGNATURE_FAILED', 'Unsupported value in signature at ' + path + '.');
    }

    if (value && typeof value.nodeType === 'number') {
      throw createAdapterError('STUDIO_DRAFT_SIGNATURE_FAILED', 'DOM node in signature at ' + path + '.');
    }

    if (seen.has(value)) {
      throw createAdapterError('STUDIO_DRAFT_SIGNATURE_FAILED', 'Circular reference in signature at ' + path + '.');
    }
    seen.add(value);

    if (Array.isArray(value)) {
      var outArray = new Array(value.length);
      for (var i = 0; i < value.length; i += 1) {
        outArray[i] = sortForSignature(value[i], seen, path + '[' + i + ']');
      }
      seen.delete(value);
      return outArray;
    }

    if (!isPlainObject(value)) {
      throw createAdapterError('STUDIO_DRAFT_SIGNATURE_FAILED', 'Only plain objects are supported in signature at ' + path + '.');
    }

    var out = {};
    var keys = Object.keys(value).filter(function(key){ return TRANSIENT_KEYS[key] !== true; }).sort();
    for (var j = 0; j < keys.length; j += 1) {
      var key = keys[j];
      out[key] = sortForSignature(value[key], seen, path + '.' + key);
    }
    seen.delete(value);
    return out;
  }

  function createStudioPublicationAdapter(options) {
    var draftApi = options && options.draftApi ? options.draftApi : null;
    if (!draftApi) {
      throw createAdapterError('STUDIO_DRAFT_UNAVAILABLE', 'Draft API is required.');
    }

    var revisionCounter = 0;
    var lastSignature = null;

    function readDraftSource() {
      if (typeof draftApi.getCampaign === 'function') {
        return draftApi.getCampaign();
      }
      if (typeof draftApi.obtenerCampana === 'function') {
        return draftApi.obtenerCampana();
      }
      return null;
    }

    function getCurrentDraftSnapshot() {
      var source = readDraftSource();
      if (!source || typeof source !== 'object') return null;
      return deepClone(source);
    }

    function getCampaignId(snapshot) {
      var draft = snapshot || getCurrentDraftSnapshot();
      if (!draft || typeof draft !== 'object') return '';

      if (draft.campaignId != null && String(draft.campaignId).trim() !== '') {
        return String(draft.campaignId).trim();
      }
      if (draft.id != null && String(draft.id).trim() !== '') {
        return String(draft.id).trim();
      }
      return '';
    }

    function getDraftSignature(snapshot) {
      var draft = snapshot || getCurrentDraftSnapshot();
      if (!draft || typeof draft !== 'object') {
        throw createAdapterError('STUDIO_DRAFT_UNAVAILABLE', 'Draft snapshot is unavailable.');
      }

      var payload = {
        campaignId: getCampaignId(draft),
        content: deepClone(draft)
      };

      if (Object.prototype.hasOwnProperty.call(payload.content, 'draftRevision')) {
        delete payload.content.draftRevision;
      }

      var sorted = sortForSignature(payload, new Set(), '$');
      return JSON.stringify(sorted);
    }

    function readDraftRevision() {
      var snapshot = getCurrentDraftSnapshot();
      if (!snapshot) {
        return '';
      }

      var signature = getDraftSignature(snapshot);
      if (lastSignature === null) {
        lastSignature = signature;
        revisionCounter = 1;
      } else if (signature !== lastSignature) {
        lastSignature = signature;
        revisionCounter += 1;
      }

      return String(revisionCounter);
    }

    function getDraftRevision() {
      if (revisionCounter <= 0) {
        return readDraftRevision();
      }
      return String(revisionCounter);
    }

    return Object.freeze({
      getCurrentDraftSnapshot: getCurrentDraftSnapshot,
      getCampaignId: getCampaignId,
      getDraftRevision: getDraftRevision,
      readDraftRevision: readDraftRevision,
      getDraftSignature: getDraftSignature
    });
  }

  window.CRIOS_STUDIO_PUBLICATION_ADAPTER = Object.freeze({
    createStudioPublicationAdapter: createStudioPublicationAdapter
  });
})();
