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

    // Regla 4: metadatos pedagógicos definidos por CRIOS, no por el docente.
    if (Array.isArray(draft.misiones)) {
      draft.misiones.forEach((mission, index) => {
        const dificultad = Number(mission && mission.clasificacion && mission.clasificacion.dificultad);
        if (!Number.isInteger(dificultad) || dificultad < 1 || dificultad > 6) {
          errores.push(`La misión ${index + 1} no tiene una dificultad CRIOS válida.`);
        }

        const duracion = Number(mission && mission.duracionEstimadaMinutos);
        if (!Number.isInteger(duracion) || duracion <= 0) {
          errores.push(`La misión ${index + 1} no tiene una duración estimada válida.`);
        }

        const curriculumApi = window.CRIOS_CURRICULUM;
        const curriculumValidation = curriculumApi && typeof curriculumApi.validateMissionReference === 'function'
          ? curriculumApi.validateMissionReference(mission && mission.curriculum)
          : { valid: false };
        if (!curriculumValidation.valid) {
          errores.push(`La misión ${index + 1} no tiene una referencia curricular ANEP válida.`);
        }

        const nota = mission && mission.notaDocente !== undefined ? String(mission.notaDocente) : '';
        if (nota.length > 500) {
          errores.push(`La nota docente de la misión ${index + 1} supera los 500 caracteres.`);
        }
      });

      const curriculumApi = window.CRIOS_CURRICULUM;
      if (draft.misiones.length > 0 && curriculumApi && typeof curriculumApi.deriveCampaignReference === 'function') {
        const reference = curriculumApi.deriveCampaignReference(draft.misiones);
        if (reference.status === 'mixed') {
          advertencias.push('Las misiones seleccionadas no comparten una única referencia curricular sugerida.');
        }
      }
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
