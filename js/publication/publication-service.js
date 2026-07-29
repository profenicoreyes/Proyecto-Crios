/* CRIOS Publication Core — publication service */
(function(){
  'use strict';

  var core = window.CRIOS_PUBLICATION_CORE || {};
  var internals = core.__internals;
  if (!internals || typeof internals.createInMemoryPublicationStore !== 'function') {
    throw new Error('CRIOS Publication Core: memory store must be loaded before service.');
  }

  var ERROR_CODES = internals.constants.errorCodes;
  var RECORD_STATUS = internals.constants.recordStatus;

  function defaultClock() {
    return new Date().toISOString();
  }

  function defaultPublicationIdFactory() {
    if (!window.crypto || typeof window.crypto.randomUUID !== 'function') {
      throw internals.createCoreError(ERROR_CODES.PUBLICATION_PERSISTENCE_FAILED, 'crypto.randomUUID is required for publicationIdFactory.');
    }
    return window.crypto.randomUUID();
  }

  function defaultReadDraftRevision(draft) {
    if (!draft || typeof draft !== 'object') return '';
    if (draft.draftRevision != null && String(draft.draftRevision).trim() !== '') {
      return String(draft.draftRevision).trim();
    }
    if (draft.version != null && String(draft.version).trim() !== '') {
      return String(draft.version).trim();
    }
    return '';
  }

  function createErrorPayload(code, message, metadata) {
    return internals.deepFreeze({
      code: code,
      message: String(message || code),
      metadata: metadata || null
    });
  }

  function createFailureResult(code, message, validation, metadata) {
    return internals.createPublicationResultModel({
      success: false,
      publication: null,
      record: null,
      validation: validation || null,
      error: createErrorPayload(code, message, metadata || null)
    });
  }

  function createPublicationService(options) {
    var serviceOptions = options && typeof options === 'object' ? options : {};

    var store = serviceOptions.store && typeof serviceOptions.store.commit === 'function'
      ? serviceOptions.store
      : internals.createInMemoryPublicationStore();

    var clock = typeof serviceOptions.clock === 'function' ? serviceOptions.clock : defaultClock;
    var publicationIdFactory = typeof serviceOptions.publicationIdFactory === 'function'
      ? serviceOptions.publicationIdFactory
      : defaultPublicationIdFactory;
    var digest = typeof serviceOptions.digest === 'function' ? serviceOptions.digest : null;
    var schemaVersion = typeof serviceOptions.schemaVersion === 'string' && serviceOptions.schemaVersion.trim()
      ? serviceOptions.schemaVersion.trim()
      : '2.0';
    var readDraftRevision = typeof serviceOptions.readDraftRevision === 'function'
      ? serviceOptions.readDraftRevision
      : defaultReadDraftRevision;

    async function publishCampaign(draft, callOptions) {
      var opts = callOptions && typeof callOptions === 'object' ? callOptions : {};
      var expectedDraftRevision = opts.expectedDraftRevision != null ? String(opts.expectedDraftRevision).trim() : '';

      var initialRevision = String(readDraftRevision(draft) || '').trim();
      if (expectedDraftRevision && initialRevision !== expectedDraftRevision) {
        return createFailureResult(
          ERROR_CODES.DRAFT_REVISION_CONFLICT,
          'Initial draftRevision does not match expectedDraftRevision.',
          null,
          { expectedDraftRevision: expectedDraftRevision, observedDraftRevision: initialRevision, phase: 'initial' }
        );
      }

      var candidateResult;
      try {
        candidateResult = internals.buildPublicationCandidate(draft, {
          campaignId: opts.campaignId,
          draftRevision: opts.draftRevision,
          schemaVersion: schemaVersion
        });
      } catch (error) {
        return createFailureResult(
          ERROR_CODES.VALIDATION_FAILED,
          'Failed to build publication candidate.',
          null,
          { message: String(error && error.message || error) }
        );
      }

      if (!candidateResult.ok || !candidateResult.candidate) {
        return createFailureResult(
          ERROR_CODES.VALIDATION_FAILED,
          'Draft validation failed.',
          candidateResult.validation,
          candidateResult.error || null
        );
      }

      var candidate = candidateResult.candidate;

      var canonicalContent;
      try {
        canonicalContent = internals.buildCanonicalContent(candidate);
      } catch (errorCanonical) {
        var codeCanonical = errorCanonical && errorCanonical.code ? errorCanonical.code : ERROR_CODES.CANONICALIZATION_FAILED;
        return createFailureResult(codeCanonical, errorCanonical && errorCanonical.message || 'Failed to build canonical content.', candidateResult.validation, null);
      }

      var contentHash;
      try {
        contentHash = await internals.calculateContentHash(canonicalContent, { digest: digest || undefined });
      } catch (errorHash) {
        var codeHash = errorHash && errorHash.code ? errorHash.code : ERROR_CODES.HASH_FAILED;
        return createFailureResult(codeHash, errorHash && errorHash.message || 'Failed to calculate content hash.', candidateResult.validation, null);
      }

      var lateRevision = String(readDraftRevision(draft) || '').trim();
      if (expectedDraftRevision && lateRevision !== expectedDraftRevision) {
        return createFailureResult(
          ERROR_CODES.DRAFT_REVISION_CONFLICT,
          'Draft revision changed after canonicalization/hash and before commit.',
          candidateResult.validation,
          { expectedDraftRevision: expectedDraftRevision, observedDraftRevision: lateRevision, phase: 'pre-commit' }
        );
      }

      var version;
      try {
        version = store.getNextVersion(candidate.campaignId);
      } catch (errorVersion) {
        return createFailureResult(
          ERROR_CODES.PUBLICATION_PERSISTENCE_FAILED,
          errorVersion && errorVersion.message || 'Failed to allocate next version.',
          candidateResult.validation,
          null
        );
      }

      var publicationId;
      try {
        publicationId = String(publicationIdFactory()).trim();
      } catch (errorIdFactory) {
        return createFailureResult(
          ERROR_CODES.PUBLICATION_PERSISTENCE_FAILED,
          errorIdFactory && errorIdFactory.message || 'Failed to create publicationId.',
          candidateResult.validation,
          null
        );
      }

      if (publicationId === '') {
        return createFailureResult(
          ERROR_CODES.PUBLICATION_PERSISTENCE_FAILED,
          'publicationIdFactory returned an empty id.',
          candidateResult.validation,
          null
        );
      }

      var publication = internals.createPublishedCampaignModel({
        campaignId: candidate.campaignId,
        publicationId: publicationId,
        version: version,
        schemaVersion: candidate.schemaVersion,
        contentHash: contentHash,
        content: candidate.content
      });

      var record = internals.createPublicationRecordModel({
        publicationId: publicationId,
        campaignId: candidate.campaignId,
        version: version,
        schemaVersion: candidate.schemaVersion,
        contentHash: contentHash,
        sourceDraftRevision: candidate.draftRevision,
        createdAt: clock(),
        status: RECORD_STATUS.PUBLISHED
      });

      try {
        store.commit(publication, record);
      } catch (errorCommit) {
        var codeCommit = errorCommit && errorCommit.code
          ? errorCommit.code
          : ERROR_CODES.PUBLICATION_PERSISTENCE_FAILED;
        return createFailureResult(
          codeCommit,
          errorCommit && errorCommit.message || 'Atomic commit failed.',
          candidateResult.validation,
          null
        );
      }

      return internals.createPublicationResultModel({
        success: true,
        publication: publication,
        record: record,
        validation: candidateResult.validation,
        error: null
      });
    }

    function getPublication(publicationId) {
      return store.getPublication(publicationId);
    }

    function getRecord(publicationId) {
      return store.getRecord(publicationId);
    }

    function listPublications(campaignId) {
      return store.listPublications(campaignId);
    }

    function listRecords(campaignId) {
      return store.listRecords(campaignId);
    }

    function snapshot() {
      return store.snapshot();
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

  internals.createPublicationService = createPublicationService;
  window.CRIOS_PUBLICATION_CORE = core;
})();
