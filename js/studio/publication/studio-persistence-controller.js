/* CRIOS Studio - persistence controller */
(function(){
  'use strict';

  function clone(value) {
    if (value === null || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map(clone);
    var copy = {}; Object.keys(value).forEach(function(key){ copy[key] = clone(value[key]); }); return copy;
  }
  function freeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.keys(value).forEach(function(key){ freeze(value[key]); }); return Object.freeze(value);
  }
  function frozen(value) { return value == null ? value : freeze(clone(value)); }

  function createStudioPersistenceController(options) {
    var opts = options && typeof options === 'object' ? options : {};
    var coordinator = opts.coordinator;
    var onStateChange = typeof opts.onStateChange === 'function' ? opts.onStateChange : function(){};
    var reloadStudio = typeof opts.reloadStudio === 'function' ? opts.reloadStudio : function(){ window.location.reload(); };
    var busy = false;
    var lastError = null;

    function getStatus() {
      var status = coordinator.getStatus();
      return frozen({
        status: status.status, busy: busy, storageKey: status.storageKey,
        schemaVersion: status.schemaVersion, stateRevision: status.stateRevision,
        updatedAt: status.updatedAt, serializedBytes: status.serializedBytes,
        publicationCount: status.publicationCount, activeReferenceCount: status.activeReferenceCount,
        activationRecordCount: status.activationRecordCount, lastError: lastError || status.error
      });
    }
    function exportLocalData() {
      try { return JSON.stringify(coordinator.exportDocument()); }
      catch (error) { lastError = frozen({ code:error.code || 'PERSISTENCE_READ_FAILED',message:String(error.message || error),metadata:error.metadata || null }); return null; }
    }
    function clearLocalData() {
      if (busy) return frozen({ success:false,error:{code:'PERSISTENCE_CONFLICT',message:'Persistence operation is busy.',metadata:null} });
      busy = true; onStateChange();
      var result = coordinator.clear();
      busy = false; lastError = result.success ? null : result.error; onStateChange();
      if (result.success) reloadStudio();
      return frozen(result);
    }
    return Object.freeze({ getStatus:getStatus,exportLocalData:exportLocalData,clearLocalData:clearLocalData });
  }
  window.CRIOS_STUDIO_PERSISTENCE_CONTROLLER = Object.freeze({ createStudioPersistenceController:createStudioPersistenceController });
})();