/* CRIOS Studio - immutable published runtime launch descriptor */
(function(){
  'use strict';

  var STATUS = Object.freeze({
    AVAILABLE: 'AVAILABLE',
    NO_PUBLICATION: 'NO_PUBLICATION',
    INVALID_PUBLICATION: 'INVALID_PUBLICATION'
  });

  function text(value) {
    return typeof value === 'string' ? value.trim() : '';
  }

  function frozen(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.keys(value).forEach(function(key){ frozen(value[key]); });
    return Object.freeze(value);
  }

  function unavailable(status, message, publication) {
    return frozen({
      available: false,
      status: status,
      message: message,
      campaignId: text(publication && publication.campaignId) || null,
      publicationId: text(publication && publication.publicationId) || null,
      href: null,
      target: null,
      rel: null
    });
  }

  function buildPublishedLaunchSearch(campaignId, publicationId) {
    var launchContract = window.CRIOS_RUNTIME_LAUNCH;
    if (!launchContract || typeof launchContract.buildPublishedLaunchSearch !== 'function') return null;
    try {
      return launchContract.buildPublishedLaunchSearch(campaignId, publicationId);
    } catch (error) {
      return null;
    }
  }

  function buildDescriptor(options) {
    var opts = options && typeof options === 'object' ? options : {};
    var publication = opts.publication && typeof opts.publication === 'object'
      ? opts.publication
      : null;
    var runtimePath = text(opts.runtimePath) || '../index.html';

    if (!publication) {
      return unavailable(
        STATUS.NO_PUBLICATION,
        'Publicá una versión para habilitar su enlace en CRIOS.',
        null
      );
    }

    var campaignId = text(publication.campaignId);
    var publicationId = text(publication.publicationId);
    if (!campaignId || !publicationId) {
      return unavailable(
        STATUS.INVALID_PUBLICATION,
        'La publicación no contiene los identificadores necesarios.',
        publication
      );
    }

    var launchSearch = buildPublishedLaunchSearch(campaignId, publicationId);
    if (!launchSearch) {
      return unavailable(
        STATUS.INVALID_PUBLICATION,
        'La publicación contiene identificadores inválidos para Runtime.',
        publication
      );
    }

    return frozen({
      available: true,
      status: STATUS.AVAILABLE,
      message: 'Esta publicación tiene un enlace propio e inmutable para abrirla en CRIOS.',
      campaignId: campaignId,
      publicationId: publicationId,
      href: runtimePath + launchSearch,
      target: '_blank',
      rel: 'noopener'
    });
  }

  window.CRIOS_STUDIO_RUNTIME_LAUNCH = Object.freeze({
    version: '2.0.0',
    status: STATUS,
    buildDescriptor: buildDescriptor
  });
})();
