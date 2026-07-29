/* CRIOS Domain — publish service */
(function(){
  'use strict';

  function publishCampaign(draftApi) {
    const domain = window.CRIOS_DOMAIN || {};
    const releaseFactory = domain.releaseFactory;

    if (!releaseFactory || typeof releaseFactory.createCampaignRelease !== 'function') {
      throw new Error('No se puede publicar campaña: ReleaseFactory no disponible.');
    }

    if (!draftApi || typeof draftApi.getCampaign !== 'function') {
      throw new Error('No se puede publicar campaña: Draft API no disponible.');
    }

    const draftSnapshot = draftApi.getCampaign();
    return releaseFactory.createCampaignRelease(draftSnapshot);
  }

  window.CRIOS_DOMAIN = window.CRIOS_DOMAIN || {};
  window.CRIOS_DOMAIN.publishService = {
    publishCampaign
  };
})();
