/* CRIOS Runtime - remote publication reader adapter */
(function(){
  'use strict';

  var VERSION = '1.0.0';
  var ERROR_CODES = Object.freeze({
    INVALID_OPTIONS: 'RUNTIME_REMOTE_READERS_INVALID_OPTIONS',
    REMOTE_UNAVAILABLE: 'RUNTIME_PUBLICATION_RESOLUTION_ERROR',
    PUBLICATION_UNAVAILABLE: 'PUBLICATION_NOT_FOUND',
    IDENTITY_MISMATCH: 'PUBLICATION_IDENTITY_MISMATCH',
    ACTIVE_REFERENCE_MISMATCH: 'ACTIVE_REFERENCE_MISMATCH'
  });

  function text(value) {
    return value == null ? '' : String(value).trim();
  }

  function isObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }

  function clone(value) {
    if (value === null || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map(clone);
    var output = {};
    Object.keys(value).forEach(function(key){ output[key] = clone(value[key]); });
    return output;
  }

  function freeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.keys(value).forEach(function(key){ freeze(value[key]); });
    return Object.freeze(value);
  }

  function frozen(value) {
    return freeze(clone(value));
  }

  function exactKeys(value, expected) {
    if (!isObject(value)) return false;
    var actual = Object.keys(value).sort();
    var wanted = expected.slice().sort();
    return actual.length === wanted.length && actual.every(function(key, index){ return key === wanted[index]; });
  }

  function validHash(value) {
    return typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
  }

  function validPublication(value) {
    return exactKeys(value, ['campaignId', 'publicationId', 'version', 'schemaVersion', 'contentHash', 'content']) &&
      text(value.campaignId) === value.campaignId &&
      text(value.publicationId) === value.publicationId &&
      Number.isInteger(value.version) && value.version > 0 &&
      text(value.schemaVersion) === value.schemaVersion &&
      validHash(value.contentHash) &&
      isObject(value.content);
  }

  function validReference(value) {
    return exactKeys(value, ['campaignId', 'publicationId', 'version', 'contentHash', 'activatedAt']) &&
      text(value.campaignId) === value.campaignId &&
      text(value.publicationId) === value.publicationId &&
      Number.isInteger(value.version) && value.version > 0 &&
      validHash(value.contentHash) &&
      text(value.activatedAt) === value.activatedAt;
  }

  function readerError(code, message, metadata) {
    var error = new Error(String(message || code || 'Runtime remote publication read failed.'));
    error.code = String(code || ERROR_CODES.REMOTE_UNAVAILABLE);
    error.metadata = metadata && typeof metadata === 'object' ? frozen(metadata) : null;
    return error;
  }

  function mapRemoteFailure(result) {
    var remoteCode = result && result.error && text(result.error.code);
    if (remoteCode === 'PUBLICATION_UNAVAILABLE') {
      return readerError(
        ERROR_CODES.PUBLICATION_UNAVAILABLE,
        'Requested publication is not active or is unavailable.',
        { remoteCode: remoteCode }
      );
    }
    if (remoteCode === 'REMOTE_IDENTITY_MISMATCH' || remoteCode === 'REMOTE_RESPONSE_INVALID') {
      return readerError(
        ERROR_CODES.IDENTITY_MISMATCH,
        'Remote publication identity failed validation.',
        { remoteCode: remoteCode }
      );
    }
    return readerError(
      ERROR_CODES.REMOTE_UNAVAILABLE,
      'Remote publication transport is unavailable.',
      { remoteCode: remoteCode || null }
    );
  }

  function createRemotePublicationReaders(options) {
    var opts = options && typeof options === 'object' ? options : {};
    var remoteClient = opts.remoteClient || null;
    var campaignId = text(opts.campaignId);
    var publicationId = text(opts.publicationId);

    if (!remoteClient || typeof remoteClient.getPublication !== 'function' || !campaignId || !publicationId) {
      throw readerError(ERROR_CODES.INVALID_OPTIONS, 'remoteClient, campaignId and publicationId are required.', null);
    }

    var snapshotPromise = null;

    async function loadSnapshot() {
      if (!snapshotPromise) {
        snapshotPromise = (async function(){
          var result;
          try {
            result = await remoteClient.getPublication(campaignId, publicationId);
          } catch (cause) {
            throw readerError(
              ERROR_CODES.REMOTE_UNAVAILABLE,
              'Remote publication transport threw unexpectedly.',
              { message: String(cause && cause.message || cause || '') }
            );
          }

          if (!result || result.success !== true) throw mapRemoteFailure(result);

          var data = result.data;
          if (!exactKeys(data, ['publication', 'activeReference']) ||
              !validPublication(data.publication) ||
              !validReference(data.activeReference)) {
            throw readerError(ERROR_CODES.IDENTITY_MISMATCH, 'Remote publication response shape is invalid.', null);
          }

          var publication = data.publication;
          var reference = data.activeReference;
          if (publication.campaignId !== campaignId ||
              publication.publicationId !== publicationId ||
              reference.campaignId !== campaignId ||
              reference.publicationId !== publicationId ||
              reference.version !== publication.version ||
              reference.contentHash !== publication.contentHash) {
            throw readerError(
              ERROR_CODES.IDENTITY_MISMATCH,
              'Remote publication response does not match requested launch identity.',
              {
                campaignId: publication.campaignId,
                publicationId: publication.publicationId
              }
            );
          }

          return frozen({ publication: publication, activeReference: reference });
        })();
      }
      return snapshotPromise;
    }

    async function activeReferenceReader(requestedCampaignId) {
      if (text(requestedCampaignId) !== campaignId) {
        throw readerError(
          ERROR_CODES.ACTIVE_REFERENCE_MISMATCH,
          'Requested campaign does not match the remote reader identity.',
          { expected: campaignId, actual: text(requestedCampaignId) }
        );
      }
      var snapshot = await loadSnapshot();
      return frozen(snapshot.activeReference);
    }

    async function publicationReader(requestedPublicationId, requestedCampaignId) {
      if (text(requestedPublicationId) !== publicationId ||
          requestedCampaignId != null && text(requestedCampaignId) !== campaignId) {
        throw readerError(
          ERROR_CODES.IDENTITY_MISMATCH,
          'Requested publication does not match the remote reader identity.',
          {
            expectedCampaignId: campaignId,
            expectedPublicationId: publicationId,
            actualCampaignId: requestedCampaignId == null ? null : text(requestedCampaignId),
            actualPublicationId: text(requestedPublicationId)
          }
        );
      }
      var snapshot = await loadSnapshot();
      return frozen(snapshot.publication);
    }

    return Object.freeze({
      activeReferenceReader: activeReferenceReader,
      publicationReader: publicationReader
    });
  }

  window.CRIOS_RUNTIME_REMOTE_PUBLICATION_READERS = Object.freeze({
    version: VERSION,
    errorCodes: ERROR_CODES,
    createRemotePublicationReaders: createRemotePublicationReaders
  });
})();
