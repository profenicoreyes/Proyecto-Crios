/* CRIOS Domain — share model */
(function(){
  'use strict';

  function createSharePayloadFromRelease(release) {
    const domain = window.CRIOS_DOMAIN || {};
    const validator = domain.shareValidator;

    if (!validator || typeof validator.validateReleaseForShare !== 'function') {
      throw new Error('No se puede construir SharePayload: ShareValidator no disponible.');
    }

    validator.validateReleaseForShare(release);
    return {
      releaseId: String(release.id).trim(),
      title: String(release.title).trim(),
      scenario: String(release.scenario).trim(),
      estimatedDuration: Number(release.metadata.estimatedDuration) || 0,
      missionCount: Number(release.metadata.missionCount) || 0
    };
  }

  function createInternalShareUrl(releaseId) {
    const id = String(releaseId || '').trim();
    if (id === '') {
      throw new Error('No se puede construir ShareModel: releaseId invalido.');
    }
    return '/share/' + encodeURIComponent(id);
  }

  function createShareModelFromPayload(payload) {
    const domain = window.CRIOS_DOMAIN || {};
    const validator = domain.shareValidator;
    const releaseModel = domain.releaseModel;

    if (!validator || !releaseModel) {
      throw new Error('No se puede construir ShareModel: módulos de dominio no disponibles.');
    }

    validator.validateShareModelPayload(payload);

    const shareModel = {
      releaseId: String(payload.releaseId).trim(),
      title: String(payload.title).trim(),
      scenario: String(payload.scenario).trim(),
      estimatedDuration: Number(payload.estimatedDuration) || 0,
      missionCount: Number(payload.missionCount) || 0,
      shareUrl: createInternalShareUrl(payload.releaseId)
    };

    return releaseModel.deepFreeze(shareModel);
  }

  window.CRIOS_DOMAIN = window.CRIOS_DOMAIN || {};
  window.CRIOS_DOMAIN.shareModel = {
    createSharePayloadFromRelease,
    createShareModelFromPayload
  };
})();
