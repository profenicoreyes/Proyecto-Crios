/* CRIOS Studio - publication activation controller */
(function(){
  'use strict';

  var STATUS = Object.freeze({
    IDLE: 'IDLE',
    ACTIVATING: 'ACTIVATING',
    ACTIVE: 'ACTIVE',
    DEACTIVATING: 'DEACTIVATING',
    INACTIVE: 'INACTIVE',
    ROLLING_BACK: 'ROLLING_BACK',
    ERROR: 'ERROR'
  });

  function clone(value) {
    if (value === null || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map(clone);
    var copy = {};
    Object.keys(value).forEach(function(key){ copy[key] = clone(value[key]); });
    return copy;
  }

  function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.keys(value).forEach(function(key){ deepFreeze(value[key]); });
    return Object.freeze(value);
  }

  function frozenCopy(value) {
    return value == null ? value : deepFreeze(clone(value));
  }

  function busyResult(reference) {
    return deepFreeze({
      success: false,
      changed: false,
      reference: reference || null,
      publication: null,
      record: null,
      error: { code: 'ACTIVATION_CONFLICT', message: 'Another activation operation is in progress.', metadata: null }
    });
  }

  function unavailableResult() {
    return deepFreeze({
      success: false,
      changed: false,
      reference: null,
      publication: null,
      record: null,
      error: { code: 'ACTIVATION_SERVICE_UNAVAILABLE', message: 'CRIOS activation service is not available.', metadata: null }
    });
  }

  function createStudioActivationController(options) {
    var opts = options && typeof options === 'object' ? options : {};
    var publicationApi = opts.publicationApi;
    var activationApi = opts.activationApi;
    var core = opts.core;
    var activationStore = opts.activationStore || null;
    var hasInjectedActivationService = Object.prototype.hasOwnProperty.call(opts, 'activationService');
    var injectedActivationService = hasInjectedActivationService ? opts.activationService : null;
    var onStateChange = typeof opts.onStateChange === 'function' ? opts.onStateChange : function(){};

    var service = null;

    function isActivationService(value) {
      return Boolean(value &&
        typeof value.activatePublication === 'function' &&
        typeof value.deactivatePublication === 'function' &&
        typeof value.rollbackPublication === 'function' &&
        typeof value.getActiveReference === 'function' &&
        typeof value.resolveActivePublication === 'function' &&
        typeof value.listHistory === 'function');
    }

    if (hasInjectedActivationService) {
      service = isActivationService(injectedActivationService) ? injectedActivationService : null;
    } else if (activationApi && typeof activationApi.createActivationService === 'function' && publicationApi && core) {
      service = activationApi.createActivationService({
        publicationReader: function(publicationId){ return publicationApi.getPublication(publicationId); },
        publicationLister: function(campaignId){ return publicationApi.listPublications(campaignId); },
        canonicalizer: function(publication){ return core.buildCanonicalContent(publication); },
        hashCalculator: function(canonicalContent){ return core.calculateContentHash(canonicalContent); },
        activationStore: activationStore || undefined
      });
    }

    var state = {
      status: STATUS.IDLE,
      busy: false,
      currentCampaignId: '',
      activeReference: null,
      history: [],
      lastResult: null,
      lastError: null
    };

    function emit() {
      onStateChange();
    }

    function refresh(campaignId, patch) {
      var key = String(campaignId || state.currentCampaignId || '').trim();
      var reference = service && key ? service.getActiveReference(key) : null;
      var history = service && key ? service.listHistory(key) : Object.freeze([]);
      state = Object.assign({}, state, patch || {}, {
        currentCampaignId: key,
        activeReference: reference,
        history: history
      });
    }

    function setCurrentCampaign(campaignId) {
      var key = String(campaignId || '').trim();
      refresh(key, {
        status: state.busy
          ? state.status
          : (service && service.getActiveReference(key) ? STATUS.ACTIVE : STATUS.INACTIVE)
      });
    }

    function begin(status, campaignId) {
      refresh(campaignId, { status: status, busy: true, lastError: null });
      emit();
    }

    function finish(campaignId, result) {
      refresh(campaignId, {
        status: result && result.success
          ? (result.reference ? STATUS.ACTIVE : STATUS.INACTIVE)
          : STATUS.ERROR,
        busy: false,
        lastResult: result || null,
        lastError: result && result.error ? result.error : null
      });
      emit();
      return frozenCopy(result);
    }

    function failUnavailable(campaignId) {
      return finish(campaignId, unavailableResult());
    }

    async function activatePublication(campaignId, publicationId, callOptions) {
      if (state.busy) return busyResult(state.activeReference);
      if (!service) return failUnavailable(campaignId);
      begin(STATUS.ACTIVATING, campaignId);
      return finish(campaignId, await service.activatePublication(campaignId, publicationId, callOptions));
    }

    async function deactivatePublication(campaignId, callOptions) {
      if (state.busy) return busyResult(state.activeReference);
      if (!service) return failUnavailable(campaignId);
      begin(STATUS.DEACTIVATING, campaignId);
      return finish(campaignId, await service.deactivatePublication(campaignId, callOptions));
    }

    async function rollbackPublication(campaignId, targetPublicationId, callOptions) {
      if (state.busy) return busyResult(state.activeReference);
      if (!service) return failUnavailable(campaignId);
      begin(STATUS.ROLLING_BACK, campaignId);
      return finish(campaignId, await service.rollbackPublication(campaignId, targetPublicationId, callOptions));
    }

    function getActiveReference(campaignId) {
      return service ? service.getActiveReference(campaignId) : null;
    }

    function resolveActivePublication(campaignId) {
      return service ? service.resolveActivePublication(campaignId) : unavailableResult();
    }

    function listHistory(campaignId) {
      return service ? service.listHistory(campaignId) : Object.freeze([]);
    }

    function getState() {
      return frozenCopy(state);
    }

    function canRollback(publication) {
      if (!service || !publication || !state.activeReference) return false;
      if (publication.campaignId !== state.activeReference.campaignId) return false;
      if (publication.version >= state.activeReference.version) return false;
      return state.history.some(function(record){ return record.nextPublicationId === publication.publicationId; });
    }

    return Object.freeze({
      activatePublication: activatePublication,
      deactivatePublication: deactivatePublication,
      rollbackPublication: rollbackPublication,
      getActiveReference: getActiveReference,
      resolveActivePublication: resolveActivePublication,
      listHistory: listHistory,
      getState: getState,
      setCurrentCampaign: setCurrentCampaign,
      canRollback: canRollback
    });
  }

  window.CRIOS_STUDIO_ACTIVATION_CONTROLLER = Object.freeze({
    createStudioActivationController: createStudioActivationController,
    status: STATUS
  });
})();
