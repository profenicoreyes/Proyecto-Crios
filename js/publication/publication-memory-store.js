/* CRIOS Publication Core — in-memory store */
(function(){
  'use strict';

  var core = window.CRIOS_PUBLICATION_CORE || {};
  var internals = core.__internals;
  if (!internals || typeof internals.calculateContentHash !== 'function') {
    throw new Error('CRIOS Publication Core: hash module must be loaded before memory store.');
  }

  var ERROR_CODES = internals.constants.errorCodes;

  function assertPublicationShape(publication) {
    if (!internals.isPublishedCampaign(publication)) {
      throw internals.createCoreError(ERROR_CODES.PUBLICATION_PERSISTENCE_FAILED, 'Invalid publication object.');
    }
  }

  function assertRecordShape(record) {
    if (!record || typeof record !== 'object') {
      throw internals.createCoreError(ERROR_CODES.RECORD_PERSISTENCE_FAILED, 'Record must be an object.');
    }

    var required = ['publicationId', 'campaignId', 'version', 'schemaVersion', 'contentHash', 'sourceDraftRevision', 'createdAt', 'status'];
    for (var i = 0; i < required.length; i += 1) {
      var key = required[i];
      if (!Object.prototype.hasOwnProperty.call(record, key)) {
        throw internals.createCoreError(ERROR_CODES.RECORD_PERSISTENCE_FAILED, 'Record is missing required field: ' + key + '.');
      }
    }

    if (typeof record.publicationId !== 'string' || record.publicationId.trim() === '') {
      throw internals.createCoreError(ERROR_CODES.RECORD_PERSISTENCE_FAILED, 'Record publicationId is invalid.');
    }
    if (typeof record.campaignId !== 'string' || record.campaignId.trim() === '') {
      throw internals.createCoreError(ERROR_CODES.RECORD_PERSISTENCE_FAILED, 'Record campaignId is invalid.');
    }
    if (!Number.isInteger(record.version) || record.version <= 0) {
      throw internals.createCoreError(ERROR_CODES.RECORD_PERSISTENCE_FAILED, 'Record version must be a positive integer.');
    }
  }

  function createInMemoryPublicationStore() {
    var publicationMap = new Map();
    var recordMap = new Map();
    var versionsByCampaign = new Map();

    function getNextVersion(campaignId) {
      var key = String(campaignId || '').trim();
      if (key === '') {
        throw internals.createCoreError(ERROR_CODES.CAMPAIGN_ID_MISSING, 'campaignId is required for getNextVersion.');
      }
      var used = versionsByCampaign.get(key);
      if (!used || used.size === 0) return 1;
      var max = 0;
      used.forEach(function(version){ if (version > max) max = version; });
      return max + 1;
    }

    function commit(publication, record) {
      assertPublicationShape(publication);
      assertRecordShape(record);

      var publicationId = String(publication.publicationId).trim();
      var campaignId = String(publication.campaignId).trim();
      var version = Number(publication.version);

      if (publicationId !== String(record.publicationId).trim()) {
        throw internals.createCoreError(ERROR_CODES.RECORD_PERSISTENCE_FAILED, 'Publication and record publicationId mismatch.');
      }
      if (campaignId !== String(record.campaignId).trim()) {
        throw internals.createCoreError(ERROR_CODES.RECORD_PERSISTENCE_FAILED, 'Publication and record campaignId mismatch.');
      }
      if (version !== Number(record.version)) {
        throw internals.createCoreError(ERROR_CODES.RECORD_PERSISTENCE_FAILED, 'Publication and record version mismatch.');
      }
      if (String(publication.contentHash).trim() !== String(record.contentHash).trim()) {
        throw internals.createCoreError(ERROR_CODES.RECORD_PERSISTENCE_FAILED, 'Publication and record contentHash mismatch.');
      }

      if (publicationMap.has(publicationId) || recordMap.has(publicationId)) {
        throw internals.createCoreError(ERROR_CODES.DUPLICATE_ID, 'publicationId already exists: ' + publicationId + '.');
      }

      var usedVersions = versionsByCampaign.get(campaignId);
      if (!usedVersions) {
        usedVersions = new Set();
      }
      if (usedVersions.has(version)) {
        throw internals.createCoreError(ERROR_CODES.DUPLICATE_ID, 'version already exists for campaignId: ' + campaignId + ' v' + version + '.');
      }

      var storedPublication = internals.deepFreeze(internals.deepClone(publication));
      var storedRecord = internals.deepFreeze(internals.deepClone(record));

      publicationMap.set(publicationId, storedPublication);
      recordMap.set(publicationId, storedRecord);
      usedVersions.add(version);
      versionsByCampaign.set(campaignId, usedVersions);

      return internals.deepFreeze({
        publication: internals.deepClone(storedPublication),
        record: internals.deepClone(storedRecord)
      });
    }

    function getPublication(publicationId) {
      var key = String(publicationId || '').trim();
      if (!publicationMap.has(key)) return null;
      return internals.deepFreeze(internals.deepClone(publicationMap.get(key)));
    }

    function getRecord(publicationId) {
      var key = String(publicationId || '').trim();
      if (!recordMap.has(key)) return null;
      return internals.deepFreeze(internals.deepClone(recordMap.get(key)));
    }

    function listPublications(campaignId) {
      var key = String(campaignId || '').trim();
      var list = [];
      publicationMap.forEach(function(publication){
        if (publication.campaignId === key) list.push(internals.deepClone(publication));
      });
      list.sort(function(a, b){ return a.version - b.version; });
      return internals.deepFreeze(list);
    }

    function listRecords(campaignId) {
      var key = String(campaignId || '').trim();
      var list = [];
      recordMap.forEach(function(record){
        if (record.campaignId === key) list.push(internals.deepClone(record));
      });
      list.sort(function(a, b){ return a.version - b.version; });
      return internals.deepFreeze(list);
    }

    function snapshot() {
      var publications = [];
      var records = [];
      var versions = {};

      publicationMap.forEach(function(value){ publications.push(internals.deepClone(value)); });
      recordMap.forEach(function(value){ records.push(internals.deepClone(value)); });
      versionsByCampaign.forEach(function(set, campaignId){
        versions[campaignId] = Array.from(set.values()).sort(function(a, b){ return a - b; });
      });

      publications.sort(function(a, b){
        if (a.campaignId === b.campaignId) return a.version - b.version;
        return a.campaignId < b.campaignId ? -1 : 1;
      });

      records.sort(function(a, b){
        if (a.campaignId === b.campaignId) return a.version - b.version;
        return a.campaignId < b.campaignId ? -1 : 1;
      });

      return internals.deepFreeze({
        publications: publications,
        records: records,
        versionsByCampaign: versions
      });
    }

    return Object.freeze({
      commit: commit,
      getPublication: getPublication,
      getRecord: getRecord,
      listPublications: listPublications,
      listRecords: listRecords,
      getNextVersion: getNextVersion,
      snapshot: snapshot
    });
  }

  internals.createInMemoryPublicationStore = createInMemoryPublicationStore;
  window.CRIOS_PUBLICATION_CORE = core;
})();
