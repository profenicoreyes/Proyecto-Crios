/* CRIOS Studio - remote-authoritative publication service */
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

  function defaultReadDraftRevision(draft) {
    if (!draft || typeof draft !== 'object') return '';
    if (draft.draftRevision != null && text(draft.draftRevision)) return text(draft.draftRevision);
    if (draft.version != null && text(draft.version)) return text(draft.version);
    return '';
  }

  function result(success, publication, record, validation, error) {
    return deepFreeze({
      success: Boolean(success),
      publication: success ? clone(publication) : null,
      record: success ? clone(record) : null,
      validation: validation == null ? null : clone(validation),
      error: success ? null : clone(error)
    });
  }

  function failure(code, message, validation, metadata) {
    return result(false, null, null, validation, {
      code: String(code || 'REMOTE_PUBLICATION_FAILED'),
      message: String(message || code || 'Remote publication failed.'),
      metadata: metadata == null ? null : clone(metadata)
    });
  }

  function identityMatchesPublication(a, b) {
    return Boolean(a && b &&
      a.campaignId === b.campaignId &&
      a.publicationId === b.publicationId &&
      a.version === b.version &&
      a.schemaVersion === b.schemaVersion &&
      a.contentHash === b.contentHash);
  }

  function identityMatchesRecord(publication, record, draftRevision) {
    return Boolean(publication && record &&
      record.publicationId === publication.publicationId &&
      record.campaignId === publication.campaignId &&
      record.version === publication.version &&
      record.schemaVersion === publication.schemaVersion &&
      record.contentHash === publication.contentHash &&
      record.sourceDraftRevision === draftRevision &&
      record.status === 'PUBLISHED');
  }

  function createRemotePublicationService(options) {
    var opts = options && typeof options === 'object' ? options : {};
    var core = opts.core || null;
    var remoteClient = opts.remoteClient || null;
    var store = opts.store || (core && typeof core.createInMemoryPublicationStore === 'function'
      ? core.createInMemoryPublicationStore()
      : null);
    var readDraftRevision = typeof opts.readDraftRevision === 'function'
      ? opts.readDraftRevision
      : defaultReadDraftRevision;
    var schemaVersion = text(opts.schemaVersion) || '2.0';

    function available() {
      return Boolean(core && remoteClient && store &&
        typeof core.buildPublicationCandidate === 'function' &&
        typeof core.buildCanonicalContent === 'function' &&
        typeof core.calculateContentHash === 'function' &&
        typeof core.isPublishedCampaign === 'function' &&
        typeof remoteClient.publishPublication === 'function' &&
        typeof store.commit === 'function' &&
        typeof store.getPublication === 'function' &&
        typeof store.getRecord === 'function' &&
        typeof store.listPublications === 'function' &&
        typeof store.listRecords === 'function' &&
        typeof store.snapshot === 'function');
    }

    function cachePublication(publication, record) {
      var existing = store.getPublication(publication.publicationId);
      if (existing) {
        var existingRecord = store.getRecord(publication.publicationId);
        if (!identityMatchesPublication(existing, publication) ||
            !existingRecord ||
            !identityMatchesRecord(existing, existingRecord, record.sourceDraftRevision)) {
          return { ok: false, code: 'REMOTE_CACHE_CONFLICT', message: 'Cached publicationId conflicts with the authoritative remote publication.' };
        }
        return { ok: true, reused: true };
      }

      var sameVersion = store.listPublications(publication.campaignId).find(function(item){
        return item.version === publication.version;
      });
      if (sameVersion && sameVersion.publicationId !== publication.publicationId) {
        return { ok: false, code: 'REMOTE_CACHE_CONFLICT', message: 'Cached campaign version conflicts with the authoritative remote publication.' };
      }

      try {
        store.commit(publication, record);
      } catch (error) {
        return {
          ok: false,
          code: error && error.code ? error.code : 'PUBLICATION_PERSISTENCE_FAILED',
          message: String(error && error.message || error || 'Failed to cache remote publication.')
        };
      }
      return { ok: true, reused: false };
    }

    async function publishCampaign(draft, callOptions) {
      var call = callOptions && typeof callOptions === 'object' ? callOptions : {};
      var expectedRevision = text(call.expectedDraftRevision);

      if (!available()) {
        return failure('REMOTE_PUBLICATION_UNAVAILABLE', 'Remote publication service is not configured.', null, null);
      }

      var initialRevision = text(readDraftRevision(draft));
      if (expectedRevision && initialRevision !== expectedRevision) {
        return failure('DRAFT_REVISION_CONFLICT', 'Initial draftRevision does not match expectedDraftRevision.', null, {
          expectedDraftRevision: expectedRevision,
          observedDraftRevision: initialRevision,
          phase: 'initial'
        });
      }

      var candidateResult;
      try {
        candidateResult = core.buildPublicationCandidate(draft, {
          campaignId: call.campaignId,
          draftRevision: call.draftRevision,
          schemaVersion: schemaVersion
        });
      } catch (errorCandidate) {
        return failure('VALIDATION_FAILED', 'Failed to build remote publication candidate.', null, {
          message: String(errorCandidate && errorCandidate.message || errorCandidate)
        });
      }

      if (!candidateResult || candidateResult.ok !== true || !candidateResult.candidate) {
        return failure(
          'VALIDATION_FAILED',
          'Draft validation failed before remote publication.',
          candidateResult && candidateResult.validation || null,
          candidateResult && candidateResult.error || null
        );
      }

      var candidate = candidateResult.candidate;
      var canonicalContent;
      var contentHash;
      try {
        canonicalContent = core.buildCanonicalContent(candidate);
        contentHash = await core.calculateContentHash(canonicalContent);
      } catch (errorHash) {
        return failure(
          errorHash && errorHash.code || 'HASH_FAILED',
          String(errorHash && errorHash.message || errorHash || 'Failed to calculate content hash.'),
          candidateResult.validation,
          null
        );
      }

      var lateRevision = text(readDraftRevision(draft));
      if (expectedRevision && lateRevision !== expectedRevision) {
        return failure('DRAFT_REVISION_CONFLICT', 'Draft revision changed before remote publication.', candidateResult.validation, {
          expectedDraftRevision: expectedRevision,
          observedDraftRevision: lateRevision,
          phase: 'pre-remote'
        });
      }

      var remoteResult;
      try {
        remoteResult = await remoteClient.publishPublication({
          campaignId: candidate.campaignId,
          draftRevision: candidate.draftRevision,
          schemaVersion: candidate.schemaVersion,
          contentHash: contentHash,
          content: candidate.content
        }, call.requestId ? { requestId: text(call.requestId) } : undefined);
      } catch (errorRemote) {
        return failure('REMOTE_TRANSPORT_FAILED', String(errorRemote && errorRemote.message || errorRemote || 'Remote publication transport failed.'), candidateResult.validation, null);
      }

      if (!remoteResult || remoteResult.success !== true) {
        var remoteError = remoteResult && remoteResult.error ? remoteResult.error : {};
        return failure(
          remoteError.code || 'REMOTE_PUBLICATION_FAILED',
          remoteError.message || 'Remote publication failed.',
          candidateResult.validation,
          {
            requestId: text(remoteResult && remoteResult.requestId),
            retryable: Boolean(remoteError.retryable)
          }
        );
      }

      var data = remoteResult.data;
      var publication = data && data.publication;
      var record = data && data.record;

      if (!publication || !record || !core.isPublishedCampaign(publication)) {
        return failure('REMOTE_RESPONSE_INVALID', 'Remote publication response is incomplete or invalid.', candidateResult.validation, null);
      }

      if (publication.campaignId !== candidate.campaignId ||
          publication.schemaVersion !== candidate.schemaVersion ||
          publication.contentHash !== contentHash) {
        return failure('REMOTE_IDENTITY_MISMATCH', 'Remote publication identity does not match the validated draft.', candidateResult.validation, null);
      }

      if (!identityMatchesRecord(publication, record, candidate.draftRevision)) {
        return failure('REMOTE_IDENTITY_MISMATCH', 'Remote publication record does not match the authoritative publication.', candidateResult.validation, null);
      }

      var cached = cachePublication(publication, record);
      if (!cached.ok) {
        return failure(cached.code, cached.message, candidateResult.validation, null);
      }

      return result(true, publication, record, candidateResult.validation, null);
    }

    function getPublication(publicationId) {
      return available() ? frozen(store.getPublication(publicationId)) : null;
    }

    function getRecord(publicationId) {
      return available() ? frozen(store.getRecord(publicationId)) : null;
    }

    function listPublications(campaignId) {
      return available() ? frozen(store.listPublications(campaignId)) : Object.freeze([]);
    }

    function listRecords(campaignId) {
      return available() ? frozen(store.listRecords(campaignId)) : Object.freeze([]);
    }

    function snapshot() {
      return available() ? frozen(store.snapshot()) : deepFreeze({ publications: [], records: [], versionsByCampaign: {} });
    }

    return Object.freeze({
      publishCampaign: publishCampaign,
      getPublication: getPublication,
      getRecord: getRecord,
      listPublications: listPublications,
      listRecords: listRecords,
      snapshot: snapshot
    });
  }

  window.CRIOS_STUDIO_REMOTE_PUBLICATION_SERVICE = Object.freeze({
    version: VERSION,
    createRemotePublicationService: createRemotePublicationService
  });
})();
