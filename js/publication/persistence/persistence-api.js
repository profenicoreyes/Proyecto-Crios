/* CRIOS Publication Persistence - public API */
(function(){
  'use strict';
  var root = window.CRIOS_PUBLICATION_PERSISTENCE_INTERNAL;
  var internals = root && root.internals;
  if (!internals || typeof internals.createPersistenceCoordinator !== 'function') throw new Error('Persistence coordinator must load before API.');
  window.CRIOS_PUBLICATION_PERSISTENCE = internals.deepFreeze({
    version:'1.0.0',constants:internals.constants,
    createStorageAdapter:internals.createStorageAdapter,
    createPersistentPublicationStore:internals.createPersistentPublicationStore,
    createPersistentActivationStore:internals.createPersistentActivationStore,
    createPersistenceCoordinator:internals.createPersistenceCoordinator,
    isPersistenceDocument:internals.isPersistenceDocument,
    calculateSerializedSize:internals.calculateSerializedSize
  });
  try { delete window.CRIOS_PUBLICATION_PERSISTENCE_INTERNAL; } catch (ignore) {}
})();