/* CRIOS — campaign validator service */
(function(){
  'use strict';

  function validarCampaignDraft(draft, escenarios) {
    const errores = [];
    const advertencias = [];

    if (!draft || typeof draft !== 'object') {
      return {
        estado: 'con errores',
        errores: ['El draft debe ser un objeto válido.'],
        advertencias: []
      };
    }

    // Regla 1: Error - No existen misiones
    if (!Array.isArray(draft.misiones) || draft.misiones.length === 0) {
      errores.push('La campaña debe contener al menos una misión.');
    }

    // Regla 2: Advertencia - La campaña no tiene nombre
    const nombre = String(draft.nombre || '').trim();
    if (nombre === '') {
      advertencias.push('La campaña todavía no tiene nombre.');
    }

    // Regla 3: Error - Escenario no válido
    const escenarioSeleccionado = String(draft.escenario || '').trim();
    if (Array.isArray(escenarios) && escenarios.length > 0) {
      const scenarioExists = escenarios.some(e => e && String(e.id) === escenarioSeleccionado);
      if (!scenarioExists) {
        errores.push('Debés seleccionar un escenario válido.');
      }
    }

    // Regla 4: Error - Duración inválida
    const duracion = Number(draft.duracion) || 0;
    if (duracion <= 0) {
      errores.push('La duración debe ser mayor que cero.');
    }

    // Regla 5: Advertencia - Nivel no seleccionado
    const nivel = String(draft.nivel || '').trim();
    if (nivel === '') {
      advertencias.push('Se recomienda indicar el nivel educativo.');
    }

    return {
      estado: errores.length === 0 ? 'correcto' : 'con errores',
      errores,
      advertencias
    };
  }

  // Mantener validar() para compatibilidad hacia atrás si existe otro código que lo usa
  function validar(campaign) {
    const errores = [];
    const advertencias = [];

    if (!campaign || typeof campaign !== 'object') {
      errores.push('La campaña debe existir y ser un objeto.');
      return { valido: false, errores, advertencias };
    }

    if (!Array.isArray(campaign.misiones)) {
      errores.push('La campaña debe contener un arreglo de misiones.');
      return { valido: false, errores, advertencias };
    }

    if (campaign.misiones.length === 0) {
      errores.push('La campaña debe contener al menos una misión.');
    }

    campaign.misiones.forEach((mission, index) => {
      if (mission === null || mission === undefined) {
        errores.push(`La misión en el índice ${index} no puede ser nula.`);
        return;
      }

      if (typeof mission !== 'object') {
        errores.push(`La misión en el índice ${index} debe ser un objeto.`);
        return;
      }

      if (mission.id === null || mission.id === undefined || mission.id === '') {
        errores.push(`La misión en el índice ${index} debe tener un id.`);
      }
    });

    return {
      valido: errores.length === 0,
      errores,
      advertencias
    };
  }

  window.CRIOS_CAMPAIGN_VALIDATOR = {
    validarCampaignDraft,
    validar
  };
})();
