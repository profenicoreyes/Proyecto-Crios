/* CRIOS Publication Activation - public API */
(function(){
  'use strict';

  var root = window.CRIOS_PUBLICATION_ACTIVATION_INTERNAL;
  var internals = root && root.internals;
  if (!internals || typeof internals.createActivationService !== 'function') {
    throw new Error('CRIOS Publication Activation: service must be loaded before API.');
  }

  var api = internals.deepFreeze({
    version: '1.0.0',
    constants: internals.constants,
    createInMemoryActivationStore: internals.createInMemoryActivationStore,
    createActivationService: internals.createActivationService,
    isActivePublicationReference: internals.isActivePublicationReference,
    isActivationResult: internals.isActivationResult
  });

  window.CRIOS_PUBLICATION_ACTIVATION = api;
  try { delete window.CRIOS_PUBLICATION_ACTIVATION_INTERNAL; } catch (ignore) {}
})();