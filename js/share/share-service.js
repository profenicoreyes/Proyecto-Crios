/* CRIOS Domain — share service */
(function(){
  'use strict';

  function createShareService() {
    return {
      buildShareModel(release) {
        const domain = window.CRIOS_DOMAIN || {};
        const shareModel = domain.shareModel;

        if (!shareModel) {
          throw new Error('No se puede construir ShareModel: ShareModel no disponible.');
        }

        const payload = shareModel.createSharePayloadFromRelease(release);
        return shareModel.createShareModelFromPayload(payload);
      }
    };
  }

  window.CRIOS_DOMAIN = window.CRIOS_DOMAIN || {};
  window.CRIOS_DOMAIN.shareService = {
    createShareService
  };
})();
