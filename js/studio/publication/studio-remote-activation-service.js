/* CRIOS Studio - remote publication activation service */
(function(){
  'use strict';

  var VERSION = '1.0.0';

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

  function frozen(value) {
    return value == null ? value : deepFreeze(clone(value));
  }

  function text(value) {
    return value == null ? '' : String(value).trim();
  }

  function sameReference(a, b) {
    if (a === null || b === null) return a === b;
    return Boolean(a && b &&
      a.campaignId === b.campaignId &&
      a.publicationId === b.publicationId &&
      a.version === b.version &&
      a.contentHash === b.contentHash &&
      a.activatedAt === b.activatedAt);
  }

  function sameRecord(a, b) {
    return Boolean(a && b &&
      a.activationId === b.activationId &&
      a.action === b.action &&
      a.campaignId === b.campaignId &&
      a.previousPublicationId === b.previousPublicationId &&
      a.nextPublicationId === b.nextPublicationId &&
      a.occurredAt === b.occurredAt);
  }

  function createRemoteActivationService(options) {
    var opts = options && typeof options === 'object' ? options : {};
    var activationApi = opts.activationApi || window.CRIOS_PUBLICATION_ACTIVATION || null;
    var publicationApi = opts.publicationApi || null;
    var remoteClient = opts.remoteClient || null;
    var store = opts.store || null;
    var campaignState = Object.create(null);

    function available() {
      return Boolean(activationApi &&
        typeof activationApi.isActivationResult === 'function' &&
        typeof activationApi.isActivePublicationReference === 'function' &&
        publicationApi && typeof publicationApi.getPublication === 'function' &&
        remoteClient &&
        typeof remoteClient.activatePublication === 'function' &&
        typeof remoteClient.deactivatePublication === 'function' &&
        typeof remoteClient.getPublication === 'function');
    }

    function result(value) {
      var copy = deepFreeze(clone(value));
      return activationApi && typeof activationApi.isActivationResult === 'function' && activationApi.isActivationResult(copy)
        ? copy
        : null;
    }

    function failure(code, message, metadata, reference) {
      var value = result({
        success: false,
        changed: false,
        reference: reference || null,
        publication: null,
        record: null,
        error: {
          code: text(code) || 'REMOTE_ACTIVATION_FAILED',
          message: text(message) || text(code) || 'Remote activation failed.',
          metadata: metadata && typeof metadata === 'object' ? clone(metadata) : null
        }
      });
      if (value) return value;
      return deepFreeze({
        success: false,
        changed: false,
        reference: null,
        publication: null,
        record: null,
        error: { code: 'REMOTE_ACTIVATION_FAILED', message: 'Remote activation result could not be represented safely.', metadata: null }
      });
    }

    function success(changed, reference, publication, record) {
      return result({
        success: true,
        changed: Boolean(changed),
        reference: reference == null ? null : reference,
        publication: publication == null ? null : publication,
        record: record == null ? null : record,
        error: null
      });
    }

    function stateFor(campaignId) {
      var key = text(campaignId);
      if (!key) return { reference: null, history: [] };
      if (!Object.prototype.hasOwnProperty.call(campaignState, key)) {
        var reference = null;
        var history = [];
        if (store) {
          try {
            if (typeof store.getActiveReference === 'function') reference = store.getActiveReference(key);
          } catch (ignoreReference) {}
          try {
            if (typeof store.listHistory === 'function') history = store.listHistory(key) || [];
          } catch (ignoreHistory) {}
        }
        campaignState[key] = {
          reference: reference == null ? null : frozen(reference),
          history: Array.isArray(history) ? history.map(frozen) : []
        };
      }
      return campaignState[key];
    }

    function appendRecord(state, record) {
      if (!record) return;
      var existing = state.history.find(function(item){ return item.activationId === record.activationId; });
      if (!existing) state.history.push(frozen(record));
    }

    function cacheIfConsistent(reference, record) {
      if (!store || !record || typeof store.commit !== 'function') return false;
      try {
        if (typeof store.listHistory === 'function') {
          var history = store.listHistory(record.campaignId) || [];
          var sameId = history.find(function(item){ return item.activationId === record.activationId; });
          if (sameId) return sameRecord(sameId, record);
        }
        var current = typeof store.getActiveReference === 'function'
          ? store.getActiveReference(record.campaignId)
          : null;
        var currentId = current ? current.publicationId : null;
        if (currentId !== record.previousPublicationId) return false;
        store.commit(reference, record, { expectedActivePublicationId: currentId });
        return true;
      } catch (ignoreCacheFailure) {
        return false;
      }
    }

    function applyAuthoritative(campaignId, data) {
      var state = stateFor(campaignId);
      state.reference = data.reference == null ? null : frozen(data.reference);
      if (data.changed && data.record) {
        appendRecord(state, data.record);
        cacheIfConsistent(data.reference, data.record);
      }
      return state;
    }

    function localPublication(publicationId, reference) {
      var publication = null;
      try { publication = publicationApi.getPublication(publicationId); } catch (ignore) {}
      if (!publication || !reference) return null;
      if (publication.campaignId !== reference.campaignId ||
          publication.publicationId !== reference.publicationId ||
          publication.version !== reference.version ||
          publication.contentHash !== reference.contentHash) return null;
      return frozen(publication);
    }

    function remoteFailure(remoteResult, fallbackCode, fallbackMessage, reference) {
      var remoteError = remoteResult && remoteResult.error ? remoteResult.error : {};
      return failure(
        remoteError.code || fallbackCode,
        remoteError.message || fallbackMessage,
        {
          requestId: text(remoteResult && remoteResult.requestId),
          retryable: Boolean(remoteError.retryable)
        },
        reference || null
      );
    }

    function remoteCallOptions(callOptions) {
      var call = callOptions && typeof callOptions === 'object' ? callOptions : {};
      return text(call.requestId) ? { requestId: text(call.requestId) } : undefined;
    }

    function validateActivationData(campaignId, publicationId, data) {
      if (!data || typeof data !== 'object' || typeof data.changed !== 'boolean') return false;
      if (!data.reference || !activationApi.isActivePublicationReference(data.reference)) return false;
      if (data.reference.campaignId !== campaignId || data.reference.publicationId !== publicationId) return false;
      var candidate = success(data.changed, data.reference, null, data.record == null ? null : data.record);
      return Boolean(candidate);
    }

    function validateDeactivationData(campaignId, data) {
      if (!data || typeof data !== 'object' || typeof data.changed !== 'boolean' || data.reference !== null) return false;
      var candidate = success(data.changed, null, null, data.record == null ? null : data.record);
      if (!candidate) return false;
      return !data.record || data.record.campaignId === campaignId;
    }

    async function activatePublication(campaignId, publicationId, callOptions) {
      var campaignKey = text(campaignId);
      var publicationKey = text(publicationId);
      var current = campaignKey ? stateFor(campaignKey).reference : null;
      if (!available()) return failure('REMOTE_ACTIVATION_UNAVAILABLE', 'Remote activation service is not configured.', null, current);
      if (!campaignKey) return failure('INVALID_CAMPAIGN_ID', 'campaignId is required.', null, null);
      if (!publicationKey) return failure('INVALID_PUBLICATION_ID', 'publicationId is required.', null, current);

      var remoteResult;
      try {
        remoteResult = await remoteClient.activatePublication(campaignKey, publicationKey, remoteCallOptions(callOptions));
      } catch (errorRemote) {
        return failure('REMOTE_TRANSPORT_FAILED', String(errorRemote && errorRemote.message || errorRemote || 'Remote activation transport failed.'), null, current);
      }
      if (!remoteResult || remoteResult.success !== true) {
        return remoteFailure(remoteResult, 'REMOTE_ACTIVATION_FAILED', 'Remote activation failed.', current);
      }
      if (!validateActivationData(campaignKey, publicationKey, remoteResult.data)) {
        return failure('REMOTE_RESPONSE_INVALID', 'Remote activation response is invalid.', { requestId: text(remoteResult.requestId) }, current);
      }

      var data = remoteResult.data;
      applyAuthoritative(campaignKey, data);
      var publication = localPublication(publicationKey, data.reference);
      return success(data.changed, data.reference, publication, data.record);
    }

    async function deactivatePublication(campaignId, callOptions) {
      var campaignKey = text(campaignId);
      var current = campaignKey ? stateFor(campaignKey).reference : null;
      if (!available()) return failure('REMOTE_ACTIVATION_UNAVAILABLE', 'Remote activation service is not configured.', null, current);
      if (!campaignKey) return failure('INVALID_CAMPAIGN_ID', 'campaignId is required.', null, null);

      var remoteResult;
      try {
        remoteResult = await remoteClient.deactivatePublication(campaignKey, remoteCallOptions(callOptions));
      } catch (errorRemote) {
        return failure('REMOTE_TRANSPORT_FAILED', String(errorRemote && errorRemote.message || errorRemote || 'Remote deactivation transport failed.'), null, current);
      }
      if (!remoteResult || remoteResult.success !== true) {
        return remoteFailure(remoteResult, 'REMOTE_ACTIVATION_FAILED', 'Remote deactivation failed.', current);
      }
      if (!validateDeactivationData(campaignKey, remoteResult.data)) {
        return failure('REMOTE_RESPONSE_INVALID', 'Remote deactivation response is invalid.', { requestId: text(remoteResult.requestId) }, current);
      }

      applyAuthoritative(campaignKey, remoteResult.data);
      return success(remoteResult.data.changed, null, null, remoteResult.data.record);
    }

    async function rollbackPublication(campaignId, targetPublicationId, callOptions) {
      var campaignKey = text(campaignId);
      var targetKey = text(targetPublicationId);
      var state = campaignKey ? stateFor(campaignKey) : { reference: null, history: [] };
      var current = state.reference;
      if (!available()) return failure('REMOTE_ACTIVATION_UNAVAILABLE', 'Remote activation service is not configured.', null, current);
      if (!campaignKey) return failure('INVALID_CAMPAIGN_ID', 'campaignId is required.', null, null);
      if (!targetKey) return failure('INVALID_PUBLICATION_ID', 'targetPublicationId is required.', null, current);
      if (!current) return failure('NO_ACTIVE_PUBLICATION', 'No active publication exists for rollback.', null, null);

      var target = null;
      try { target = publicationApi.getPublication(targetKey); } catch (ignoreTarget) {}
      var previouslyActive = state.history.some(function(record){ return record.nextPublicationId === targetKey; });
      if (!target || target.campaignId !== campaignKey || target.publicationId !== targetKey ||
          !Number.isInteger(target.version) || target.version >= current.version ||
          !previouslyActive || targetKey === current.publicationId) {
        return failure('ROLLBACK_TARGET_INVALID', 'Rollback target must be an older publication that was previously active.', null, current);
      }

      return activatePublication(campaignKey, targetKey, callOptions);
    }

    function getActiveReference(campaignId) {
      var key = text(campaignId);
      if (!key) return null;
      return frozen(stateFor(key).reference);
    }

    async function resolveActivePublication(campaignId, callOptions) {
      var campaignKey = text(campaignId);
      if (!available()) return failure('REMOTE_ACTIVATION_UNAVAILABLE', 'Remote activation service is not configured.', null, null);
      if (!campaignKey) return failure('INVALID_CAMPAIGN_ID', 'campaignId is required.', null, null);
      var current = stateFor(campaignKey).reference;
      if (!current) return failure('NO_ACTIVE_PUBLICATION', 'No active publication exists.', null, null);

      var remoteResult;
      try {
        remoteResult = await remoteClient.getPublication(campaignKey, current.publicationId, remoteCallOptions(callOptions));
      } catch (errorRemote) {
        return failure('REMOTE_TRANSPORT_FAILED', String(errorRemote && errorRemote.message || errorRemote || 'Remote publication resolution failed.'), null, current);
      }
      if (!remoteResult || remoteResult.success !== true) {
        return remoteFailure(remoteResult, 'RESOLUTION_FAILED', 'Remote publication resolution failed.', current);
      }

      var data = remoteResult.data;
      if (!data || !data.publication || !data.activeReference ||
          !activationApi.isActivePublicationReference(data.activeReference) ||
          data.activeReference.campaignId !== campaignKey ||
          data.activeReference.publicationId !== current.publicationId ||
          data.publication.campaignId !== data.activeReference.campaignId ||
          data.publication.publicationId !== data.activeReference.publicationId ||
          data.publication.version !== data.activeReference.version ||
          data.publication.contentHash !== data.activeReference.contentHash) {
        return failure('REMOTE_RESPONSE_INVALID', 'Remote active publication response is invalid.', { requestId: text(remoteResult.requestId) }, current);
      }

      stateFor(campaignKey).reference = frozen(data.activeReference);
      return success(false, data.activeReference, data.publication, null);
    }

    function listHistory(campaignId) {
      var key = text(campaignId);
      if (!key) return Object.freeze([]);
      return deepFreeze(stateFor(key).history.map(clone));
    }

    return Object.freeze({
      activatePublication: activatePublication,
      deactivatePublication: deactivatePublication,
      rollbackPublication: rollbackPublication,
      getActiveReference: getActiveReference,
      resolveActivePublication: resolveActivePublication,
      listHistory: listHistory
    });
  }

  window.CRIOS_STUDIO_REMOTE_ACTIVATION_SERVICE = Object.freeze({
    version: VERSION,
    createRemoteActivationService: createRemoteActivationService
  });
})();
