/* CRIOS Studio — campaign validator */
(function(){
  'use strict';

  function validar(campaignDraft) {
    const errores = [];
    const advertencias = [];

    if (!campaignDraft || typeof campaignDraft !== 'object') {
      errores.push('La campaña no existe.');
      return { valido: false, errores, advertencias };
    }

    if (!Array.isArray(campaignDraft.misiones)) {
      errores.push('La campaña debe contener un arreglo de misiones.');
      return { valido: false, errores, advertencias };
    }

    if (campaignDraft.misiones.length === 0) {
      errores.push('La campaña debe contener al menos una misión.');
    }

    campaignDraft.misiones.forEach((mission, index) => {
      if (mission === null || mission === undefined) {
        errores.push(`La misión en el índice ${index} es nula.`);
        return;
      }

      if (typeof mission !== 'object') {
        errores.push(`La misión en el índice ${index} no es un objeto válido.`);
        return;
      }

      if (mission.id === null || mission.id === undefined || mission.id === '') {
        errores.push(`La misión en el índice ${index} no tiene id.`);
      }
    });

    return {
      valido: errores.length === 0,
      errores,
      advertencias
    };
  }

  window.CRIOS_CAMPAIGN_VALIDATOR = {
    validar
  };
})();
