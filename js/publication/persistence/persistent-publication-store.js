/* CRIOS Publication Persistence - publication store */
(function(){
  'use strict';
  var root = window.CRIOS_PUBLICATION_PERSISTENCE_INTERNAL;
  var internals = root && root.internals;
  if (!internals || typeof internals.createStorageAdapter !== 'function') throw new Error('Storage adapter must load before publication store.');
  var E = internals.constants.errorCodes;

  function createPersistentPublicationStore(options) {
    var adapter = options && options.adapter;
    if (!adapter || typeof adapter.transact !== 'function') throw internals.createError(E.PERSISTENCE_UNAVAILABLE, 'Persistence adapter is required.');

    function commit(publication, record) {
      var publicationCopy = internals.deepClone(publication);
      var recordCopy = internals.deepClone(record);
      adapter.transact(function(documentValue){
        documentValue.publications.push(publicationCopy);
        documentValue.publicationRecords.push(recordCopy);
      });
      return internals.deepFreeze({ publication: internals.deepClone(publicationCopy), record: internals.deepClone(recordCopy) });
    }
    function getPublication(publicationId) {
      var key = String(publicationId || '').trim();
      var found = adapter.read().publications.find(function(item){ return item.publicationId === key; });
      return found ? internals.frozenCopy(found) : null;
    }
    function getRecord(publicationId) {
      var key = String(publicationId || '').trim();
      var found = adapter.read().publicationRecords.find(function(item){ return item.publicationId === key; });
      return found ? internals.frozenCopy(found) : null;
    }
    function listPublications(campaignId) {
      var key = String(campaignId || '').trim();
      return internals.frozenCopy(adapter.read().publications.filter(function(item){ return item.campaignId === key; }).sort(function(a,b){ return a.version-b.version; }));
    }
    function listRecords(campaignId) {
      var key = String(campaignId || '').trim();
      return internals.frozenCopy(adapter.read().publicationRecords.filter(function(item){ return item.campaignId === key; }).sort(function(a,b){ return a.version-b.version; }));
    }
    function getNextVersion(campaignId) {
      var key = String(campaignId || '').trim();
      if (!key) throw internals.createError(E.PERSISTENCE_INCONSISTENT, 'campaignId is required for getNextVersion.');
      var max = 0;
      adapter.read().publications.forEach(function(item){ if (item.campaignId === key && item.version > max) max = item.version; });
      return max + 1;
    }
    function snapshot() {
      var documentValue = adapter.read();
      var versions = {};
      documentValue.publications.forEach(function(item){
        versions[item.campaignId] = versions[item.campaignId] || [];
        versions[item.campaignId].push(item.version);
      });
      Object.keys(versions).forEach(function(key){ versions[key].sort(function(a,b){return a-b;}); });
      return internals.deepFreeze({
        publications: internals.deepClone(documentValue.publications),
        records: internals.deepClone(documentValue.publicationRecords),
        versionsByCampaign: versions
      });
    }
    return Object.freeze({ commit:commit,getPublication:getPublication,getRecord:getRecord,listPublications:listPublications,listRecords:listRecords,getNextVersion:getNextVersion,snapshot:snapshot });
  }
  internals.createPersistentPublicationStore = createPersistentPublicationStore;
})();