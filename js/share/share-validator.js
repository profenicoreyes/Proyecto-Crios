/* CRIOS Domain — share validator */
(function(){
  'use strict';

  function validateReleaseForShare(release) {
    const domain = window.CRIOS_DOMAIN || {};
    const releaseValidator = domain.releaseValidator;

    if (!releaseValidator || typeof releaseValidator.validateReleaseStructure !== 'function') {
      throw new Error('No se puede construir SharePayload: ReleaseValidator no disponible.');
    }

    try {
      releaseValidator.validateReleaseStructure(release);
    } catch (error) {
      throw new Error('No se puede construir SharePayload: release invalido. ' + error.message);
    }

    if (release.id === null || release.id === undefined || String(release.id).trim() === '') {
      throw new Error('No se puede construir SharePayload: falta releaseId.');
    }

    if (release.title === null || release.title === undefined || String(release.title).trim() === '') {
      throw new Error('No se puede construir SharePayload: falta title.');
    }

    if (release.scenario === null || release.scenario === undefined || String(release.scenario).trim() === '') {
      throw new Error('No se puede construir SharePayload: falta scenario.');
    }

    if (!release.metadata || typeof release.metadata !== 'object') {
      throw new Error('No se puede construir SharePayload: falta metadata.');
    }
  }

  function validateShareModelPayload(payload) {
    if (!payload || typeof payload !== 'object') {
      throw new Error('No se puede construir ShareModel: payload invalido.');
    }

    if (payload.releaseId === null || payload.releaseId === undefined || String(payload.releaseId).trim() === '') {
      throw new Error('No se puede construir ShareModel: falta releaseId.');
    }

    if (payload.title === null || payload.title === undefined || String(payload.title).trim() === '') {
      throw new Error('No se puede construir ShareModel: falta title.');
    }

    if (payload.scenario === null || payload.scenario === undefined || String(payload.scenario).trim() === '') {
      throw new Error('No se puede construir ShareModel: falta scenario.');
    }
  }

  window.CRIOS_DOMAIN = window.CRIOS_DOMAIN || {};
  window.CRIOS_DOMAIN.shareValidator = {
    validateReleaseForShare,
    validateShareModelPayload
  };
})();
