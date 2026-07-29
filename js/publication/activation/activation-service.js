/* CRIOS Publication Activation - service */
(function(){
  'use strict';

  var root = window.CRIOS_PUBLICATION_ACTIVATION_INTERNAL;
  var internals = root && root.internals;
  if (!internals || typeof internals.createInMemoryActivationStore !== 'function') {
    throw new Error('CRIOS Publication Activation: store must be loaded before service.');
  }

  var ACTIONS = internals.constants.actions;
  var ERROR_CODES = internals.constants.errorCodes;

  function defaultClock() {
    return new Date().toISOString();
  }

  function createDefaultActivationIdFactory() {
    var sequence = 0;
    return function(){
      sequence += 1;
      return 'activation-' + sequence;
    };
  }

  function failure(code, message, metadata, reference) {
    return internals.createActivationResult({
      success: false,
      changed: false,
      reference: reference || null,
      publication: null,
      record: null,
      error: internals.createErrorPayload(code, message, metadata || null)
    });
  }

  function createActivationService(options) {
    var opts = options && typeof options === 'object' ? options : {};
    var publicationReader = typeof opts.publicationReader === 'function' ? opts.publicationReader : function(){ return null; };
    var publicationLister = typeof opts.publicationLister === 'function' ? opts.publicationLister : function(){ return []; };
    var canonicalizer = typeof opts.canonicalizer === 'function' ? opts.canonicalizer : null;
    var hashCalculator = typeof opts.hashCalculator === 'function' ? opts.hashCalculator : null;
    var activationStore = opts.activationStore && typeof opts.activationStore.commit === 'function'
      ? opts.activationStore
      : internals.createInMemoryActivationStore();
    var clock = typeof opts.clock === 'function' ? opts.clock : defaultClock;
    var activationIdFactory = typeof opts.activationIdFactory === 'function'
      ? opts.activationIdFactory
      : createDefaultActivationIdFactory();

    function validCampaignId(campaignId) {
      return typeof campaignId === 'string' && campaignId.trim() !== '';
    }

    function validPublicationId(publicationId) {
      return typeof publicationId === 'string' && publicationId.trim() !== '';
    }

    function expectedFrom(callOptions) {
      if (!callOptions || !Object.prototype.hasOwnProperty.call(callOptions, 'expectedActivePublicationId')) {
        return { supplied: false, value: null };
      }
      return {
        supplied: true,
        value: callOptions.expectedActivePublicationId == null ? null : String(callOptions.expectedActivePublicationId).trim()
      };
    }

    function conflictIfNeeded(expected, reference) {
      var observed = reference ? reference.publicationId : null;
      if (expected.supplied && expected.value !== observed) {
        return failure(ERROR_CODES.ACTIVATION_CONFLICT, 'Active publication does not match expectedActivePublicationId.', {
          expected: expected.value,
          observed: observed
        }, reference);
      }
      return null;
    }

    async function verifyPublication(campaignId, publicationId) {
      var publication;
      try {
        publication = publicationReader(publicationId);
        if (publication && typeof publication.then === 'function') publication = await publication;
      } catch (readError) {
        return { error: failure(ERROR_CODES.RESOLUTION_FAILED, 'Failed to read publication.', { message: String(readError && readError.message || readError) }) };
      }
      if (!publication) return { error: failure(ERROR_CODES.PUBLICATION_NOT_FOUND, 'Publication was not found.') };
      if (publication.campaignId !== campaignId) {
        return { error: failure(ERROR_CODES.CAMPAIGN_MISMATCH, 'Publication belongs to a different campaign.') };
      }
      if (!Number.isInteger(publication.version) || publication.version <= 0) {
        return { error: failure(ERROR_CODES.VERSION_MISMATCH, 'Publication version is invalid.') };
      }
      if (!canonicalizer || !hashCalculator) {
        return { error: failure(ERROR_CODES.RESOLUTION_FAILED, 'Canonicalizer and hash calculator are required.') };
      }
      try {
        var canonicalContent = canonicalizer(publication);
        var calculatedHash = await hashCalculator(canonicalContent);
        if (String(calculatedHash) !== String(publication.contentHash)) {
          return { error: failure(ERROR_CODES.CONTENT_HASH_MISMATCH, 'Publication contentHash verification failed.') };
        }
      } catch (verificationError) {
        return { error: failure(ERROR_CODES.RESOLUTION_FAILED, 'Publication verification failed.', {
          message: String(verificationError && verificationError.message || verificationError)
        }) };
      }
      return { publication: internals.frozenCopy(publication) };
    }

    function createRecord(action, campaignId, previousPublicationId, nextPublicationId) {
      var activationId;
      try {
        activationId = String(activationIdFactory() || '').trim();
      } catch (idError) {
        throw internals.createError(ERROR_CODES.ACTIVATION_ID_FAILED, 'activationIdFactory failed.', {
          message: String(idError && idError.message || idError)
        });
      }
      if (!activationId) throw internals.createError(ERROR_CODES.ACTIVATION_ID_FAILED, 'activationIdFactory returned an empty id.');
      return internals.createActivationRecord({
        activationId: activationId,
        action: action,
        campaignId: campaignId,
        previousPublicationId: previousPublicationId,
        nextPublicationId: nextPublicationId,
        occurredAt: String(clock() || '').trim()
      });
    }

    function commitResult(reference, publication, record, expected) {
      try {
        activationStore.commit(reference, record, expected.supplied ? { expectedActivePublicationId: expected.value } : {});
      } catch (commitError) {
        var code = commitError && commitError.code ? commitError.code : ERROR_CODES.ACTIVATION_STORE_FAILED;
        return failure(code, commitError && commitError.message || 'Activation store commit failed.', commitError && commitError.metadata || null, activationStore.getActiveReference(record.campaignId));
      }
      return internals.createActivationResult({
        success: true,
        changed: true,
        reference: reference,
        publication: publication,
        record: record,
        error: null
      });
    }

    async function activatePublication(campaignId, publicationId, callOptions) {
      if (!validCampaignId(campaignId)) return failure(ERROR_CODES.INVALID_CAMPAIGN_ID, 'campaignId is required.');
      if (!validPublicationId(publicationId)) return failure(ERROR_CODES.INVALID_PUBLICATION_ID, 'publicationId is required.');
      var campaignKey = campaignId.trim();
      var publicationKey = publicationId.trim();
      var verified = await verifyPublication(campaignKey, publicationKey);
      if (verified.error) return verified.error;

      var current = activationStore.getActiveReference(campaignKey);
      var expected = expectedFrom(callOptions);
      var conflict = conflictIfNeeded(expected, current);
      if (conflict) return conflict;
      if (current && current.publicationId === publicationKey) {
        return internals.createActivationResult({ success: true, changed: false, reference: current, publication: verified.publication, record: null, error: null });
      }

      var timestamp = String(clock() || '').trim();
      var reference = internals.createActivePublicationReference({
        campaignId: campaignKey,
        publicationId: publicationKey,
        version: verified.publication.version,
        contentHash: verified.publication.contentHash,
        activatedAt: timestamp
      });
      var record;
      try {
        record = createRecord(ACTIONS.ACTIVATE, campaignKey, current ? current.publicationId : null, publicationKey);
      } catch (recordError) {
        return failure(recordError.code || ERROR_CODES.ACTIVATION_ID_FAILED, recordError.message, recordError.metadata || null, current);
      }
      return commitResult(reference, verified.publication, record, expected);
    }

    function deactivatePublication(campaignId, callOptions) {
      if (!validCampaignId(campaignId)) return failure(ERROR_CODES.INVALID_CAMPAIGN_ID, 'campaignId is required.');
      var campaignKey = campaignId.trim();
      var current = activationStore.getActiveReference(campaignKey);
      var expected = expectedFrom(callOptions);
      var conflict = conflictIfNeeded(expected, current);
      if (conflict) return conflict;
      if (!current) {
        return internals.createActivationResult({ success: true, changed: false, reference: null, publication: null, record: null, error: null });
      }
      var record;
      try {
        record = createRecord(ACTIONS.DEACTIVATE, campaignKey, current.publicationId, null);
      } catch (recordError) {
        return failure(recordError.code || ERROR_CODES.ACTIVATION_ID_FAILED, recordError.message, recordError.metadata || null, current);
      }
      return commitResult(null, null, record, expected);
    }

    async function rollbackPublication(campaignId, targetPublicationId, callOptions) {
      if (!validCampaignId(campaignId)) return failure(ERROR_CODES.INVALID_CAMPAIGN_ID, 'campaignId is required.');
      if (!validPublicationId(targetPublicationId)) return failure(ERROR_CODES.INVALID_PUBLICATION_ID, 'targetPublicationId is required.');
      var campaignKey = campaignId.trim();
      var targetKey = targetPublicationId.trim();
      var current = activationStore.getActiveReference(campaignKey);
      if (!current) return failure(ERROR_CODES.NO_ACTIVE_PUBLICATION, 'No active publication exists for rollback.');
      var expected = expectedFrom(callOptions);
      var conflict = conflictIfNeeded(expected, current);
      if (conflict) return conflict;

      var verified = await verifyPublication(campaignKey, targetKey);
      if (verified.error) return verified.error;
      if (targetKey === current.publicationId || verified.publication.version >= current.version) {
        return failure(ERROR_CODES.ROLLBACK_TARGET_INVALID, 'Rollback target must be an older publication.', null, current);
      }
      var history = activationStore.listHistory(campaignKey);
      var previouslyActive = history.some(function(record){ return record.nextPublicationId === targetKey; });
      if (!previouslyActive) {
        return failure(ERROR_CODES.ROLLBACK_TARGET_INVALID, 'Rollback target was never active.', null, current);
      }

      var reference = internals.createActivePublicationReference({
        campaignId: campaignKey,
        publicationId: targetKey,
        version: verified.publication.version,
        contentHash: verified.publication.contentHash,
        activatedAt: String(clock() || '').trim()
      });
      var record;
      try {
        record = createRecord(ACTIONS.ROLLBACK, campaignKey, current.publicationId, targetKey);
      } catch (recordError) {
        return failure(recordError.code || ERROR_CODES.ACTIVATION_ID_FAILED, recordError.message, recordError.metadata || null, current);
      }
      return commitResult(reference, verified.publication, record, expected);
    }

    function getActiveReference(campaignId) {
      if (!validCampaignId(campaignId)) return null;
      return activationStore.getActiveReference(campaignId.trim());
    }

    async function resolveActivePublication(campaignId) {
      if (!validCampaignId(campaignId)) return failure(ERROR_CODES.INVALID_CAMPAIGN_ID, 'campaignId is required.');
      var campaignKey = campaignId.trim();
      var reference = activationStore.getActiveReference(campaignKey);
      if (!reference) return failure(ERROR_CODES.NO_ACTIVE_PUBLICATION, 'No active publication exists.');
      var verified = await verifyPublication(campaignKey, reference.publicationId);
      if (verified.error) return verified.error;
      if (verified.publication.version !== reference.version) {
        return failure(ERROR_CODES.VERSION_MISMATCH, 'Active reference version does not match publication.', null, reference);
      }
      if (verified.publication.contentHash !== reference.contentHash) {
        return failure(ERROR_CODES.CONTENT_HASH_MISMATCH, 'Active reference contentHash does not match publication.', null, reference);
      }
      return internals.createActivationResult({
        success: true,
        changed: false,
        reference: reference,
        publication: verified.publication,
        record: null,
        error: null
      });
    }

    function listHistory(campaignId) {
      if (!validCampaignId(campaignId)) return Object.freeze([]);
      return activationStore.listHistory(campaignId.trim());
    }

    function snapshot() {
      var storeSnapshot = activationStore.snapshot();
      var publicationsByCampaign = {};
      for (var i = 0; i < storeSnapshot.activeReferences.length; i += 1) {
        var campaignId = storeSnapshot.activeReferences[i].campaignId;
        try {
          publicationsByCampaign[campaignId] = internals.frozenCopy(publicationLister(campaignId) || []);
        } catch (ignore) {
          publicationsByCampaign[campaignId] = Object.freeze([]);
        }
      }
      return internals.deepFreeze({ activation: internals.deepClone(storeSnapshot), publicationsByCampaign: publicationsByCampaign });
    }

    return Object.freeze({
      activatePublication: activatePublication,
      deactivatePublication: deactivatePublication,
      rollbackPublication: rollbackPublication,
      getActiveReference: getActiveReference,
      resolveActivePublication: resolveActivePublication,
      listHistory: listHistory,
      snapshot: snapshot
    });
  }

  internals.createActivationService = createActivationService;
})();