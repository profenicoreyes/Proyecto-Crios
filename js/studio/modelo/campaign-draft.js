/* CRIOS Studio — campaign draft model */
(function(){
  'use strict';

  const defaultDraft = {
    id: null,
    nombre: '',
    descripcion: '',
    escenario: 'antartida',
    estado: 'draft',
    version: 1,
    misiones: [],
    finalEvaluation: {
      responseType: 'NUMERIC_WITH_PROCEDURE',
      rngPolicy: 'SEEDED_SEQUENCE_V1',
      adjustments: [
        { name: 'adjustMinus', operation: 'subtract', values: [24, 28, 30, 32, 35] },
        { name: 'adjustPlus', operation: 'add', values: [6, 8, 10, 12] }
      ],
      unit: 'm2',
      instruction: 'Suma los resultados de las misiones, resta {adjustMinus} m2 y agrega {adjustPlus} m2.'
    }
  };

  // Internal private state
  let _draft = createDraft();
  let _missionSpecCatalog = null;

  function safeClone(value) {
    try {
      if (typeof structuredClone === 'function') return structuredClone(value);
    } catch (ignore) {}
    return JSON.parse(JSON.stringify(value));
  }

  function createCampaignId() {
    var suffix;
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      suffix = window.crypto.randomUUID();
    } else {
      suffix = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12);
    }
    return 'campaign-' + suffix;
  }

  function createDraft() {
    var draft = safeClone(defaultDraft);
    draft.id = createCampaignId();
    return draft;
  }

  function normalizeId(value) {
    if (value === null || value === undefined) return null;
    if (typeof value === 'string' || typeof value === 'number') return String(value);
    if (typeof value === 'object' && value.id !== undefined && value.id !== null) return String(value.id);
    return null;
  }

  // Query methods (return safe copies)
  function obtenerCampana() {
    return safeClone(_draft);
  }

  function obtenerNombre() {
    return String(_draft.nombre || '');
  }

  function establecerNombre(nombre) {
    const value = typeof nombre === 'string' ? nombre.trim() : '';
    _draft.nombre = value;
    return { ok: true };
  }

  function obtenerDescripcion() {
    return String(_draft.descripcion || '');
  }

  function establecerDescripcion(descripcion) {
    const value = typeof descripcion === 'string' ? descripcion.trim() : '';
    _draft.descripcion = value;
    return { ok: true };
  }

  function obtenerEscenario() {
    return String(_draft.escenario || 'antartida');
  }

  function establecerEscenario(escenarioId) {
    const value = typeof escenarioId === 'string' ? escenarioId.trim() : 'antartida';
    const normalized = value === '' ? 'antartida' : value;
    _draft.escenario = normalized;
    return { ok: true };
  }

  function obtenerMisiones() {
    return safeClone(_draft.misiones || []);
  }

  function contieneMision(id) {
    const mid = normalizeId(id);
    if (!mid) return false;
    return (_draft.misiones || []).some(item => item && String(item.id) === mid);
  }

  // Controlled mutation methods
  function agregarMision(mision) {
    if (!mision) return { ok: false, motivo: 'mision_invalida' };
    const id = normalizeId(mision);
    if (!id) return { ok: false, motivo: 'mision_sin_id' };
    _draft.misiones = _draft.misiones || [];
    if (_draft.misiones.some(item => item && String(item.id) === id)) return { ok: false, motivo: 'duplicado' };

    var missionCopy;
    if (typeof mision === 'object') {
      missionCopy = safeClone(mision);
    } else {
      missionCopy = { id };
    }
    if (!missionCopy.missionSpec && _missionSpecCatalog) {
      missionCopy.missionSpec = _missionSpecCatalog.get(id);
    }
    missionCopy.notaDocente = '';
    _draft.misiones.push(safeClone(missionCopy));
    return { ok: true };
  }

  function establecerMissionSpec(id, spec) {
    const mid = normalizeId(id);
    const mission = (_draft.misiones || []).find(item => item && String(item.id) === mid);
    if (!mission) return { ok: false, motivo: 'no_encontrado' };
    mission.missionSpec = safeClone(spec);
    return { ok: true };
  }

  function obtenerMissionSpec(id) {
    const mid = normalizeId(id);
    const mission = (_draft.misiones || []).find(item => item && String(item.id) === mid);
    return mission && mission.missionSpec ? safeClone(mission.missionSpec) : null;
  }

  function establecerNotaMision(id, nota) {
    const mid = normalizeId(id);
    const mission = (_draft.misiones || []).find(item => item && String(item.id) === mid);
    if (!mission) return { ok: false, motivo: 'no_encontrado' };

    const value = nota === null || nota === undefined ? '' : String(nota);
    if (value.length > 500) return { ok: false, motivo: 'nota_demasiado_larga' };
    mission.notaDocente = value;
    return { ok: true };
  }

  function obtenerNotaMision(id) {
    const mid = normalizeId(id);
    const mission = (_draft.misiones || []).find(item => item && String(item.id) === mid);
    return mission ? String(mission.notaDocente || '') : '';
  }

  function establecerEvaluacionFinal(value) {
    _draft.finalEvaluation = safeClone(value);
    return { ok: true };
  }

  function obtenerEvaluacionFinal() {
    return safeClone(_draft.finalEvaluation);
  }

  function configurarCatalogoSpecs(catalog) {
    if (!catalog || typeof catalog.get !== 'function') return { ok: false, motivo: 'catalogo_invalido' };
    _missionSpecCatalog = catalog;
    return { ok: true };
  }

  function moverMision(indice, desplazamiento) {
    const from = Number(indice);
    const offset = Number(desplazamiento);
    if (!Number.isInteger(from) || !Number.isInteger(offset)) return { ok: false, motivo: 'parametros_invalidos' };
    _draft.misiones = _draft.misiones || [];
    const to = from + offset;
    if (from < 0 || from >= _draft.misiones.length) return { ok: false, motivo: 'indice_fuera_de_rango' };
    if (to < 0 || to >= _draft.misiones.length) return { ok: false, motivo: 'destino_fuera_de_rango' };
    if (from === to) return { ok: false, motivo: 'sin_cambio' };
    const [item] = _draft.misiones.splice(from, 1);
    _draft.misiones.splice(to, 0, item);
    return { ok: true };
  }

  function quitarMision(id) {
    const mid = normalizeId(id);
    if (!mid) return { ok: false, motivo: 'id_invalido' };
    _draft.misiones = _draft.misiones || [];
    const index = _draft.misiones.findIndex(item => item && String(item.id) === mid);
    if (index < 0) return { ok: false, motivo: 'no_encontrado' };
    _draft.misiones.splice(index, 1);
    return { ok: true };
  }

  // Backwards-compatible aliases (English names kept)
  function getCampaign() { return obtenerCampana(); }
  function getMissions() { return obtenerMisiones(); }
  function hasMission(id) { return contieneMision(id); }

  window.CRIOS_CAMPAIGN_DRAFT = {
    obtenerCampana,
    obtenerMisiones,
    contieneMision,
    agregarMision,
    moverMision,
    quitarMision,
    obtenerNombre,
    establecerNombre,
    obtenerDescripcion,
    establecerDescripcion,
    obtenerEscenario,
    establecerEscenario,
    establecerMissionSpec,
    obtenerMissionSpec,
    establecerNotaMision,
    obtenerNotaMision,
    establecerEvaluacionFinal,
    obtenerEvaluacionFinal,
    configurarCatalogoSpecs,

    // compatibility
    getCampaign,
    getMissions,
    hasMission
  };
})();
