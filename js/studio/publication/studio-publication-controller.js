/* CRIOS Studio — publication controller */
(function(){
  'use strict';

  var STATUS = Object.freeze({
    IDLE: 'IDLE',
    VALIDATING: 'VALIDATING',
    INVALID: 'INVALID',
    READY: 'READY',
    PUBLISHING: 'PUBLISHING',
    PUBLISHED: 'PUBLISHED',
    ERROR: 'ERROR'
  });

  function createControllerError(code, message, metadata) {
    return Object.freeze({
      code: String(code || 'STUDIO_PUBLICATION_ERROR'),
      message: String(message || 'Studio publication error.'),
      metadata: metadata || null
    });
  }

  function cloneStrict(value, seen, path) {
    var kind = typeof value;
    if (value === null) return null;
    if (kind === 'string' || kind === 'boolean') return value;
    if (kind === 'number') {
      if (!Number.isFinite(value)) {
        throw new Error('Non-finite number at ' + path + '.');
      }
      return value;
    }
    if (kind === 'undefined' || kind === 'function' || kind === 'symbol' || kind === 'bigint') {
      throw new Error('Unsupported value at ' + path + '.');
    }

    if (seen.has(value)) {
      throw new Error('Circular reference at ' + path + '.');
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

    var out = {};
    var keys = Object.keys(value);
    for (var j = 0; j < keys.length; j += 1) {
      var key = keys[j];
      out[key] = cloneStrict(value[key], seen, path + '.' + key);
    }
    seen.delete(value);
    return out;
  }

  function freezeDefensive(value) {
    if (value == null) return value;
    function deepFreeze(item) {
      if (!item || typeof item !== 'object' || Object.isFrozen(item)) return item;
      Object.keys(item).forEach(function(key){ deepFreeze(item[key]); });
      return Object.freeze(item);
    }
    return deepFreeze(cloneStrict(value, new Set(), '$'));
  }

  function createStudioPublicationController(options) {
    var core = options && options.core ? options.core : null;
    var adapter = options && options.adapter ? options.adapter : null;
    var missionSpecAdapter = options && options.missionSpecAdapter ? options.missionSpecAdapter : null;
    var publicationStore = options && options.publicationStore ? options.publicationStore : null;
    var hasInjectedPublicationService = Boolean(options && Object.prototype.hasOwnProperty.call(options, 'publicationService'));
    var injectedPublicationService = hasInjectedPublicationService ? options.publicationService : null;
    var onStateChange = options && typeof options.onStateChange === 'function' ? options.onStateChange : function(){};

    var state = {
      status: STATUS.IDLE,
      busy: false,
      lastValidation: null,
      lastResult: null,
      lastError: null,
      currentDraftRevision: '',
      currentCampaignId: ''
    };

    var store = null;
    var service = null;

    function isPublicationService(value) {
      return Boolean(value &&
        typeof value.publishCampaign === 'function' &&
        typeof value.listPublications === 'function' &&
        typeof value.getPublication === 'function' &&
        typeof value.getRecord === 'function');
    }

    if (hasInjectedPublicationService) {
      service = isPublicationService(injectedPublicationService) ? injectedPublicationService : null;
      store = publicationStore;
    } else if (core && typeof core.createInMemoryPublicationStore === 'function' && typeof core.createPublicationService === 'function' && adapter) {
      store = publicationStore || core.createInMemoryPublicationStore();
      service = core.createPublicationService({
        store: store,
        readDraftRevision: function(){
          return adapter.readDraftRevision();
        }
      });
    }

    function emit() {
      onStateChange();
    }

    function setState(patch) {
      state = Object.assign({}, state, patch);
      emit();
    }

    function getState() {
      return freezeDefensive(state);
    }

    function asUnavailableResult() {
      var error = createControllerError('PUBLICATION_CORE_UNAVAILABLE', 'CRIOS Publication Core is not available.');
      return Object.freeze({ ok: false, error: error, validation: null, draftRevision: '', campaignId: '' });
    }

    function asDraftUnavailableResult() {
      var error = createControllerError('STUDIO_DRAFT_UNAVAILABLE', 'Current Studio draft is unavailable.');
      return Object.freeze({ ok: false, error: error, validation: null, draftRevision: '', campaignId: '' });
    }

    function asBusyResult() {
      var error = createControllerError('STUDIO_PUBLICATION_BUSY', 'Another publication operation is in progress.');
      return Object.freeze({ ok: false, error: error, validation: null, draftRevision: state.currentDraftRevision, campaignId: state.currentCampaignId });
    }

    function ensureAdapterDraft() {
      if (!adapter || typeof adapter.getCurrentDraftSnapshot !== 'function') {
        return null;
      }
      return adapter.getCurrentDraftSnapshot();
    }

    function adaptExecutableSnapshot(snapshot) {
      if (!missionSpecAdapter || typeof missionSpecAdapter.adaptSnapshot !== 'function') {
        return { valid: true, snapshot: snapshot, issues: [] };
      }
      return missionSpecAdapter.adaptSnapshot(snapshot);
    }

    function asSpecValidation(adaptation) {
      return Object.freeze({
        valid: false,
        issues: freezeDefensive(adaptation.issues || []),
        normalized: null
      });
    }

    async function validateCurrentDraft() {
      if (!core || !service || !adapter) {
        setState({ status: STATUS.ERROR, lastError: createControllerError('PUBLICATION_CORE_UNAVAILABLE', 'CRIOS Publication Core is not available.') });
        return asUnavailableResult();
      }
      if (state.busy) {
        return asBusyResult();
      }

      setState({ busy: true, status: STATUS.VALIDATING, lastError: null });

      var snapshot = ensureAdapterDraft();
      if (!snapshot) {
        setState({ busy: false, status: STATUS.ERROR, lastError: createControllerError('STUDIO_DRAFT_UNAVAILABLE', 'Current Studio draft is unavailable.') });
        return asDraftUnavailableResult();
      }

      var adaptation = adaptExecutableSnapshot(snapshot);
      if (!adaptation.valid) {
        var specValidation = asSpecValidation(adaptation);
        var specError = adaptation.issues && adaptation.issues[0] ? adaptation.issues[0] : createControllerError('MISSION_SPEC_INVALID', 'Executable mission validation failed.');
        setState({ busy: false, status: STATUS.INVALID, lastValidation: specValidation, lastResult: null, lastError: specError });
        return Object.freeze({ ok: false, error: specError, validation: specValidation, draftRevision: adapter.readDraftRevision(), campaignId: adapter.getCampaignId(snapshot) });
      }
      snapshot = adaptation.snapshot;

      var campaignId = adapter.getCampaignId(snapshot);
      var draftRevision = adapter.readDraftRevision();
      var validation = core.validateDraft(snapshot, {
        campaignId: campaignId,
        draftRevision: draftRevision,
        schemaVersion: '2.0'
      });

      setState({
        busy: false,
        status: validation.valid ? STATUS.READY : STATUS.INVALID,
        lastValidation: validation,
        lastResult: null,
        lastError: null,
        currentDraftRevision: String(draftRevision || ''),
        currentCampaignId: String(
          (validation && validation.normalized && validation.normalized.campaignId) || campaignId || ''
        )
      });

      return Object.freeze({
        ok: Boolean(validation.valid),
        error: null,
        validation: validation,
        draftRevision: String(draftRevision || ''),
        campaignId: String(campaignId || '')
      });
    }

    async function publishCurrentDraft() {
      if (!core || !service || !adapter) {
        setState({ status: STATUS.ERROR, lastError: createControllerError('PUBLICATION_CORE_UNAVAILABLE', 'CRIOS Publication Core is not available.') });
        return core && typeof core.createPublicationResult === 'function'
          ? core.createPublicationResult({ success: false, publication: null, record: null, validation: null, error: createControllerError('PUBLICATION_CORE_UNAVAILABLE', 'CRIOS Publication Core is not available.') })
          : Object.freeze({ success: false, publication: null, record: null, validation: null, error: createControllerError('PUBLICATION_CORE_UNAVAILABLE', 'CRIOS Publication Core is not available.') });
      }

      if (state.busy) {
        return Object.freeze({
          success: false,
          publication: null,
          record: null,
          validation: null,
          error: createControllerError('STUDIO_PUBLICATION_BUSY', 'Another publication operation is in progress.')
        });
      }

      setState({ busy: true, status: STATUS.PUBLISHING, lastError: null });

      var snapshot = ensureAdapterDraft();
      if (!snapshot) {
        var missingDraftError = createControllerError('STUDIO_DRAFT_UNAVAILABLE', 'Current Studio draft is unavailable.');
        setState({ busy: false, status: STATUS.ERROR, lastError: missingDraftError });
        return Object.freeze({ success: false, publication: null, record: null, validation: null, error: missingDraftError });
      }

      var adaptation = adaptExecutableSnapshot(snapshot);
      if (!adaptation.valid) {
        var specValidation = asSpecValidation(adaptation);
        var specError = adaptation.issues && adaptation.issues[0] ? adaptation.issues[0] : createControllerError('MISSION_SPEC_INVALID', 'Executable mission validation failed.');
        setState({ busy: false, status: STATUS.INVALID, lastValidation: specValidation, lastResult: null, lastError: specError });
        return Object.freeze({ success: false, publication: null, record: null, validation: specValidation, error: specError });
      }
      snapshot = adaptation.snapshot;

      var campaignId = adapter.getCampaignId(snapshot);
      var expectedDraftRevision = adapter.readDraftRevision();

      var result = await service.publishCampaign(snapshot, {
        campaignId: campaignId,
        draftRevision: expectedDraftRevision,
        expectedDraftRevision: expectedDraftRevision
      });

      var nextStatus = STATUS.ERROR;
      if (result && result.success) {
        nextStatus = STATUS.PUBLISHED;
      } else if (result && result.validation && result.validation.valid === false) {
        nextStatus = STATUS.INVALID;
      }

      setState({
        busy: false,
        status: nextStatus,
        lastValidation: result ? result.validation : null,
        lastResult: result || null,
        lastError: result && result.error ? result.error : null,
        currentDraftRevision: String(expectedDraftRevision || ''),
        currentCampaignId: String(
          (result && result.publication && result.publication.campaignId) ||
          (result && result.validation && result.validation.normalized && result.validation.normalized.campaignId) ||
          campaignId || ''
        )
      });

      return freezeDefensive(result);
    }

    function listPublications() {
      if (!service) return Object.freeze([]);
      var campaignId = state.currentCampaignId || (state.lastResult && state.lastResult.publication && state.lastResult.publication.campaignId) || '';
      if (!campaignId && adapter) {
        var snapshot = adapter.getCurrentDraftSnapshot();
        campaignId = adapter.getCampaignId(snapshot);
      }
      if (!campaignId) return Object.freeze([]);
      return service.listPublications(campaignId);
    }

    function getPublication(publicationId) {
      if (!service) return null;
      return service.getPublication(publicationId);
    }

    function getRecord(publicationId) {
      if (!service) return null;
      return service.getRecord(publicationId);
    }

    function getLastResult() {
      return freezeDefensive(state.lastResult);
    }

    return Object.freeze({
      validateCurrentDraft: validateCurrentDraft,
      publishCurrentDraft: publishCurrentDraft,
      listPublications: listPublications,
      getPublication: getPublication,
      getRecord: getRecord,
      getLastResult: getLastResult,
      getState: getState
    });
  }

  window.CRIOS_STUDIO_PUBLICATION_CONTROLLER = Object.freeze({
    createStudioPublicationController: createStudioPublicationController,
    status: STATUS
  });
})();
