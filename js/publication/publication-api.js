/* CRIOS Publication Core — public API */
(function(){
  'use strict';

  var root = window.CRIOS_PUBLICATION_CORE || {};
  var internals = root.__internals;
  if (!internals || typeof internals.createPublicationService !== 'function') {
    throw new Error('CRIOS Publication Core: service must be loaded before API.');
  }

  function createValidationIssue(input) {
    return internals.createValidationIssueModel(input || {});
  }

  var api = {
    version: '1.0.0',
    constants: internals.constants,
    createValidationIssue: createValidationIssue,
    normalizeDraft: internals.normalizeDraft,
    validateDraft: internals.validateDraft,
    buildPublicationCandidate: internals.buildPublicationCandidate,
    buildCanonicalContent: internals.buildCanonicalContent,
    calculateContentHash: internals.calculateContentHash,
    createInMemoryPublicationStore: internals.createInMemoryPublicationStore,
    createPublicationService: internals.createPublicationService,
    isPublishedCampaign: internals.isPublishedCampaign,
    isPublicationResult: internals.isPublicationResult
  };

  window.CRIOS_PUBLICATION_CORE = Object.freeze(api);
})();
