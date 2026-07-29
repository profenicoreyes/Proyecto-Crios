/* CRIOS Publication Activation - in-memory store */
(function(){
  'use strict';

  var root = window.CRIOS_PUBLICATION_ACTIVATION_INTERNAL;
  var internals = root && root.internals;
  if (!internals || typeof internals.createActivePublicationReference !== 'function') {
    throw new Error('CRIOS Publication Activation: model must be loaded before store.');
  }

  var ERROR_CODES = internals.constants.errorCodes;

  function currentPublicationId(activeByCampaign, campaignId) {
    var current = activeByCampaign.get(campaignId);
    return current ? current.publicationId : null;
  }

  function createInMemoryActivationStore() {
    var activeByCampaign = new Map();
    var historyByCampaign = new Map();
    var usedActivationIds = new Set();

    function commit(reference, record, options) {
      var opts = options && typeof options === 'object' ? options : {};
      if (reference !== null && !internals.isActivePublicationReference(reference)) {
        throw internals.createError(ERROR_CODES.ACTIVATION_STORE_FAILED, 'Invalid final active publication reference.');
      }
      if (!internals.isActivationRecord(record)) {
        throw internals.createError(ERROR_CODES.ACTIVATION_STORE_FAILED, 'Invalid activation record.');
      }

      var campaignId = record.campaignId;
      if (reference !== null && reference.campaignId !== campaignId) {
        throw internals.createError(ERROR_CODES.ACTIVATION_STORE_FAILED, 'Reference and record campaignId mismatch.');
      }
      if (record.action === internals.constants.actions.DEACTIVATE && reference !== null) {
        throw internals.createError(ERROR_CODES.ACTIVATION_STORE_FAILED, 'Deactivation final reference must be null.');
      }
      if (record.action === internals.constants.actions.DEACTIVATE && record.nextPublicationId !== null) {
        throw internals.createError(ERROR_CODES.ACTIVATION_STORE_FAILED, 'Deactivation nextPublicationId must be null.');
      }
      if (reference !== null && record.nextPublicationId !== reference.publicationId) {
        throw internals.createError(ERROR_CODES.ACTIVATION_STORE_FAILED, 'Reference and record nextPublicationId mismatch.');
      }

      var currentId = currentPublicationId(activeByCampaign, campaignId);
      if (record.previousPublicationId !== currentId) {
        throw internals.createError(ERROR_CODES.ACTIVATION_CONFLICT, 'Activation record does not match current state.', {
          expected: record.previousPublicationId,
          observed: currentId
        });
      }
      if (Object.prototype.hasOwnProperty.call(opts, 'expectedActivePublicationId')) {
        var expectedId = opts.expectedActivePublicationId == null ? null : String(opts.expectedActivePublicationId).trim();
        if (expectedId !== currentId) {
          throw internals.createError(ERROR_CODES.ACTIVATION_CONFLICT, 'Active publication changed before commit.', {
            expected: expectedId,
            observed: currentId
          });
        }
      }
      if (usedActivationIds.has(record.activationId)) {
        throw internals.createError(ERROR_CODES.ACTIVATION_ID_FAILED, 'activationId is already in use.');
      }

      var storedReference = reference === null ? null : internals.frozenCopy(reference);
      var storedRecord = internals.frozenCopy(record);
      var previousHistory = historyByCampaign.get(campaignId) || [];
      var nextHistory = previousHistory.slice();
      nextHistory.push(storedRecord);

      if (storedReference === null) activeByCampaign.delete(campaignId);
      else activeByCampaign.set(campaignId, storedReference);
      historyByCampaign.set(campaignId, nextHistory);
      usedActivationIds.add(storedRecord.activationId);

      return internals.deepFreeze({
        reference: storedReference === null ? null : internals.deepClone(storedReference),
        record: internals.deepClone(storedRecord)
      });
    }

    function getActiveReference(campaignId) {
      var key = String(campaignId || '').trim();
      var reference = activeByCampaign.get(key);
      return reference ? internals.frozenCopy(reference) : null;
    }

    function listHistory(campaignId) {
      var key = String(campaignId || '').trim();
      return internals.frozenCopy(historyByCampaign.get(key) || []);
    }

    function snapshot() {
      var activeReferences = [];
      var history = [];
      activeByCampaign.forEach(function(reference){ activeReferences.push(internals.deepClone(reference)); });
      historyByCampaign.forEach(function(records){
        for (var i = 0; i < records.length; i += 1) history.push(internals.deepClone(records[i]));
      });
      activeReferences.sort(function(a, b){ return a.campaignId < b.campaignId ? -1 : a.campaignId > b.campaignId ? 1 : 0; });
      history.sort(function(a, b){ return a.occurredAt < b.occurredAt ? -1 : a.occurredAt > b.occurredAt ? 1 : 0; });
      return internals.deepFreeze({ activeReferences: activeReferences, history: history });
    }

    return Object.freeze({
      commit: commit,
      getActiveReference: getActiveReference,
      listHistory: listHistory,
      snapshot: snapshot
    });
  }

  internals.createInMemoryActivationStore = createInMemoryActivationStore;
})();