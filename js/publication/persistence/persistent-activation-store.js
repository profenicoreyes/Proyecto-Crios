/* CRIOS Publication Persistence - activation store */
(function(){
  'use strict';
  var root = window.CRIOS_PUBLICATION_PERSISTENCE_INTERNAL;
  var internals = root && root.internals;
  if (!internals || typeof internals.createPersistentPublicationStore !== 'function') throw new Error('Publication store must load before activation store.');
  var E = internals.constants.errorCodes;

  function createPersistentActivationStore(options) {
    var adapter = options && options.adapter;
    if (!adapter || typeof adapter.transact !== 'function') throw internals.createError(E.PERSISTENCE_UNAVAILABLE, 'Persistence adapter is required.');
    function activeFrom(documentValue, campaignId) {
      return documentValue.activeReferences.find(function(item){ return item.campaignId === campaignId; }) || null;
    }
    function commit(reference, record, options) {
      var opts = options && typeof options === 'object' ? options : {};
      var referenceCopy = reference === null ? null : internals.deepClone(reference);
      var recordCopy = internals.deepClone(record);
      adapter.transact(function(documentValue){
        var current = activeFrom(documentValue, recordCopy.campaignId);
        var currentId = current ? current.publicationId : null;
        if (recordCopy.previousPublicationId !== currentId) throw internals.createError(E.PERSISTENCE_CONFLICT, 'Activation previous state is inconsistent.');
        if (Object.prototype.hasOwnProperty.call(opts, 'expectedActivePublicationId')) {
          var expected = opts.expectedActivePublicationId == null ? null : String(opts.expectedActivePublicationId).trim();
          if (expected !== currentId) throw internals.createError(E.PERSISTENCE_CONFLICT, 'Expected active publication does not match.');
        }
        if (referenceCopy === null) {
          if (recordCopy.action !== 'DEACTIVATE' || recordCopy.nextPublicationId !== null) throw internals.createError(E.PERSISTENCE_INCONSISTENT, 'Null reference requires DEACTIVATE.');
        } else if (referenceCopy.campaignId !== recordCopy.campaignId || referenceCopy.publicationId !== recordCopy.nextPublicationId) {
          throw internals.createError(E.PERSISTENCE_INCONSISTENT, 'Activation reference and record differ.');
        }
        documentValue.activeReferences = documentValue.activeReferences.filter(function(item){ return item.campaignId !== recordCopy.campaignId; });
        if (referenceCopy !== null) documentValue.activeReferences.push(referenceCopy);
        documentValue.activationRecords.push(recordCopy);
      });
      return internals.deepFreeze({ reference: referenceCopy === null ? null : internals.deepClone(referenceCopy), record: internals.deepClone(recordCopy) });
    }
    function getActiveReference(campaignId) {
      var found = activeFrom(adapter.read(), String(campaignId || '').trim());
      return found ? internals.frozenCopy(found) : null;
    }
    function listHistory(campaignId) {
      var key = String(campaignId || '').trim();
      return internals.frozenCopy(adapter.read().activationRecords.filter(function(item){ return item.campaignId === key; }));
    }
    function snapshot() {
      var documentValue = adapter.read();
      return internals.deepFreeze({ activeReferences: internals.deepClone(documentValue.activeReferences), history: internals.deepClone(documentValue.activationRecords) });
    }
    return Object.freeze({ commit:commit,getActiveReference:getActiveReference,listHistory:listHistory,snapshot:snapshot });
  }
  internals.createPersistentActivationStore = createPersistentActivationStore;
})();