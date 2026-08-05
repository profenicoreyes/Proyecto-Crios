/* CRIOS Studio - persisted published runtime launch descriptor */
(function(){
  'use strict';

  var STATUS = Object.freeze({
    AVAILABLE: 'AVAILABLE',
    NO_ACTIVE_PUBLICATION: 'NO_ACTIVE_PUBLICATION',
    PERSISTENCE_UNAVAILABLE: 'PERSISTENCE_UNAVAILABLE',
    ACTIVE_REFERENCE_NOT_PERSISTED: 'ACTIVE_REFERENCE_NOT_PERSISTED',
    ACTIVATION_BUSY: 'ACTIVATION_BUSY',
    INVALID_ACTIVE_REFERENCE: 'INVALID_ACTIVE_REFERENCE'
  });

  function text(value) {
    return typeof value === 'string' ? value.trim() : '';
  }

  function frozen(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.keys(value).forEach(function(key){ frozen(value[key]); });
    return Object.freeze(value);
  }

  function unavailable(status, message, activeReference) {
    return frozen({
      available: false,
      status: status,
      message: message,
      campaignId: text(activeReference && activeReference.campaignId) || null,
      publicationId: text(activeReference && activeReference.publicationId) || null,
      href: null,
      target: null,
      rel: null
    });
  }

  function buildPublishedLaunchSearch(campaignId) {
    var launchContract = window.CRIOS_RUNTIME_LAUNCH;
    if (!launchContract || typeof launchContract.buildPublishedLaunchSearch !== 'function') return null;
    try {
      return launchContract.buildPublishedLaunchSearch(campaignId);
    } catch (error) {
      return null;
    }
  }

  function buildDescriptor(options) {
    var opts = options && typeof options === 'object' ? options : {};
    var activeReference = opts.activeReference && typeof opts.activeReference === 'object'
      ? opts.activeReference
      : null;
    var persistenceState = opts.persistenceState && typeof opts.persistenceState === 'object'
      ? opts.persistenceState
      : {};
    var runtimePath = text(opts.runtimePath) || '../index.html';

    if (Boolean(opts.activationBusy)) {
      return unavailable(
        STATUS.ACTIVATION_BUSY,
        'Esperá a que termine la operación de activación.',
        activeReference
      );
    }

    if (!activeReference) {
      return unavailable(
        STATUS.NO_ACTIVE_PUBLICATION,
        'Activá una publicación para habilitar su acceso en CRIOS.',
        null
      );
    }

    var campaignId = text(activeReference.campaignId);
    var publicationId = text(activeReference.publicationId);
    if (!campaignId || !publicationId) {
      return unavailable(
        STATUS.INVALID_ACTIVE_REFERENCE,
        'La referencia activa no contiene los identificadores necesarios.',
        activeReference
      );
    }

    if (persistenceState.status !== 'READY') {
      return unavailable(
        STATUS.PERSISTENCE_UNAVAILABLE,
        'La publicación activa debe quedar guardada localmente antes de abrirla en CRIOS.',
        activeReference
      );
    }

    var activeReferenceCount = Number(persistenceState.activeReferenceCount);
    if (!Number.isFinite(activeReferenceCount) || activeReferenceCount < 1) {
      return unavailable(
        STATUS.ACTIVE_REFERENCE_NOT_PERSISTED,
        'La referencia activa todavía no figura en la persistencia local.',
        activeReference
      );
    }

    var launchSearch = buildPublishedLaunchSearch(campaignId);
    if (!launchSearch) {
      return unavailable(
        STATUS.INVALID_ACTIVE_REFERENCE,
        'La referencia activa contiene un identificador de campaña inválido.',
        activeReference
      );
    }

    return frozen({
      available: true,
      status: STATUS.AVAILABLE,
      message: 'La campaña está activa y guardada en este navegador.',
      campaignId: campaignId,
      publicationId: publicationId,
      href: runtimePath + launchSearch,
      target: '_blank',
      rel: 'noopener'
    });
  }

  window.CRIOS_STUDIO_RUNTIME_LAUNCH = Object.freeze({
    version: '1.0.0',
    status: STATUS,
    buildDescriptor: buildDescriptor
  });
})();
