/* CRIOS Publication Persistence - coordinator */
(function(){
  'use strict';
  var root = window.CRIOS_PUBLICATION_PERSISTENCE_INTERNAL;
  var internals = root && root.internals;
  if (!internals || typeof internals.createPersistentActivationStore !== 'function') throw new Error('Persistent stores must load before coordinator.');

  function createPersistenceCoordinator(options) {
    var opts = options && typeof options === 'object' ? options : {};
    var adapter = opts.adapter || internals.createStorageAdapter(opts);
    var publicationStore = internals.createPersistentPublicationStore({ adapter: adapter });
    var activationStore = internals.createPersistentActivationStore({ adapter: adapter });
    function getStatus() {
      var base = adapter.getStatus();
      var documentValue = null;
      try { documentValue = adapter.read(); } catch (ignore) {}
      return internals.deepFreeze({
        status: base.status, storageKey: base.storageKey, schemaVersion: base.schemaVersion,
        stateRevision: base.stateRevision, updatedAt: base.updatedAt, serializedBytes: base.serializedBytes,
        publicationCount: documentValue ? documentValue.publications.length : 0,
        publicationRecordCount: documentValue ? documentValue.publicationRecords.length : 0,
        activeReferenceCount: documentValue ? documentValue.activeReferences.length : 0,
        activationRecordCount: documentValue ? documentValue.activationRecords.length : 0,
        error: base.error
      });
    }
    function exportDocument() { return adapter.exportDocument(); }
    function clear() { return adapter.clear(); }
    return Object.freeze({ publicationStore:publicationStore,activationStore:activationStore,getStatus:getStatus,exportDocument:exportDocument,clear:clear });
  }
  internals.createPersistenceCoordinator = createPersistenceCoordinator;
})();