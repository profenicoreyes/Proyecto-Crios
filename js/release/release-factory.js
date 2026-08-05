/* CRIOS Domain — release factory */
(function(){
  'use strict';

  function createCampaignRelease(draftSnapshot) {
    const domain = window.CRIOS_DOMAIN || {};
    const model = domain.releaseModel;
    const validator = domain.releaseValidator;

    if (!model || !validator) {
      throw new Error('No se puede crear Campaign Release: módulos de dominio no disponibles.');
    }

    if (!draftSnapshot || typeof draftSnapshot !== 'object') {
      throw new Error('No se puede crear Campaign Release: el Draft debe ser un objeto válido.');
    }

    if (draftSnapshot.nombre === null || draftSnapshot.nombre === undefined || String(draftSnapshot.nombre).trim() === '') {
      throw new Error('No se puede crear Campaign Release: el Draft no tiene nombre.');
    }

    if (draftSnapshot.escenario === null || draftSnapshot.escenario === undefined || String(draftSnapshot.escenario).trim() === '') {
      throw new Error('No se puede crear Campaign Release: el Draft no tiene escenario.');
    }

    if (!Array.isArray(draftSnapshot.misiones)) {
      throw new Error('No se puede crear Campaign Release: el Draft no tiene misiones válidas.');
    }

    const missions = model.safeClone(draftSnapshot.misiones);
    const draftId = draftSnapshot.id === null || draftSnapshot.id === undefined
      ? ''
      : String(draftSnapshot.id).trim();

    const release = {
      id: draftId || model.createReleaseId(),
      title: String(draftSnapshot.nombre).trim(),
      scenario: String(draftSnapshot.escenario).trim(),
      description: String(draftSnapshot.descripcion || '').trim(),
      missions,
      metadata: model.calculateReleaseMetadata(missions)
    };

    validator.validateReleaseStructure(release);
    return model.deepFreeze(release);
  }

  window.CRIOS_DOMAIN = window.CRIOS_DOMAIN || {};
  window.CRIOS_DOMAIN.releaseFactory = {
    createCampaignRelease
  };
})();
