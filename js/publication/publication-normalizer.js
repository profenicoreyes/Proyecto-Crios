/* CRIOS Publication Core — draft normalization */
(function(){
  'use strict';

  var core = window.CRIOS_PUBLICATION_CORE || {};
  var internals = core.__internals;
  if (!internals) {
    throw new Error('CRIOS Publication Core: model must be loaded before normalizer.');
  }

  var ERROR_CODES = internals.constants.errorCodes;

  var TRANSIENT_KEYS = Object.freeze({
    currentScreen: true,
    pantallas: true,
    progress: true,
    progreso: true,
    lives: true,
    vidas: true,
    sessionId: true,
    session: true,
    runtime: true,
    trace: true,
    traces: true,
    dom: true,
    element: true,
    callback: true,
    callbacks: true,
    promise: true,
    timer: true,
    timeout: true,
    interval: true,
    raf: true,
    uiState: true,
    modalOpen: true,
    searchQuery: true,
    selectedTab: true,
    feedback: true,
    hintUsed: true,
    attempts: true,
    answer: true
  });

  var ENVELOPE_METADATA_KEYS = Object.freeze({
    campaignId: true,
    draftRevision: true,
    version: true,
    schemaVersion: true
  });

  function normalizeString(value) {
    return typeof value === 'string' ? value.trim() : value;
  }

  function resolveCampaignId(content, options) {
    var optId = options && typeof options.campaignId === 'string' ? options.campaignId.trim() : '';
    if (optId) return optId;

    var ownCampaignId = content && typeof content.campaignId === 'string' ? content.campaignId.trim() : '';
    if (ownCampaignId) return ownCampaignId;

    var ownId = content && (typeof content.id === 'string' || typeof content.id === 'number')
      ? String(content.id).trim()
      : '';

    if (ownId) {
      if (typeof CAMPANAS_CRIOS !== 'undefined' && CAMPANAS_CRIOS && CAMPANAS_CRIOS[ownId] && CAMPANAS_CRIOS[ownId].id) {
        return String(CAMPANAS_CRIOS[ownId].id).trim();
      }
      return ownId;
    }

    if (typeof CAMPANA_INICIAL_ID === 'string' && CAMPANA_INICIAL_ID.trim()) {
      return CAMPANA_INICIAL_ID.trim();
    }

    return '';
  }

  function resolveDraftRevision(content, options) {
    if (content && content.draftRevision != null && String(content.draftRevision).trim() !== '') {
      return String(content.draftRevision).trim();
    }

    if (content && content.version != null && String(content.version).trim() !== '') {
      return String(content.version).trim();
    }

    if (options && options.draftRevision != null && String(options.draftRevision).trim() !== '') {
      return String(options.draftRevision).trim();
    }

    return '';
  }

  function sanitizeValue(value) {
    if (Array.isArray(value)) {
      var outputArray = new Array(value.length);
      for (var i = 0; i < value.length; i += 1) {
        outputArray[i] = sanitizeValue(value[i]);
      }
      return outputArray;
    }

    if (!value || typeof value !== 'object') {
      return normalizeString(value);
    }

    if (!internals.isPlainObject(value)) {
      return value;
    }

    var out = {};
    var keys = Object.keys(value);
    for (var j = 0; j < keys.length; j += 1) {
      var key = keys[j];
      if (TRANSIENT_KEYS[key] === true) continue;
      out[key] = sanitizeValue(value[key]);
    }
    return out;
  }

  function stripEnvelopeMetadata(content) {
    if (!internals.isPlainObject(content)) return content;
    var out = {};
    var keys = Object.keys(content);
    for (var i = 0; i < keys.length; i += 1) {
      var key = keys[i];
      if (ENVELOPE_METADATA_KEYS[key] === true) continue;
      out[key] = content[key];
    }
    return out;
  }

  function normalizeDraft(draft, options) {
    if (!internals.isPlainObject(draft)) {
      throw internals.createCoreError(ERROR_CODES.INVALID_DRAFT, 'Draft must be a plain object.');
    }

    var rawClone = internals.deepClone(draft);
    var sourceContent = sanitizeValue(rawClone);
    var content = stripEnvelopeMetadata(sourceContent);

    var normalized = {
      campaignId: resolveCampaignId(sourceContent, options || {}),
      draftRevision: resolveDraftRevision(sourceContent, options || {}),
      schemaVersion: options && typeof options.schemaVersion === 'string' && options.schemaVersion.trim()
        ? options.schemaVersion.trim()
        : '2.0',
      content: content
    };

    return internals.deepFreeze(normalized);
  }

  internals.normalizeDraft = normalizeDraft;
  window.CRIOS_PUBLICATION_CORE = core;
})();
