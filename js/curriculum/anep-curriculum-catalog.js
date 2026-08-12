/* CRIOS — ANEP curriculum reference catalog
 * Official terminology and current source mapping verified 2026-08-08.
 */
(function(){
  'use strict';

  const VERSION = '2026.08.08';
  const SOURCE_ID = 'ANEP_EBI_MATEMATICA_TRAMO5_AJUSTE_2024';

  function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.keys(value).forEach(key => deepFreeze(value[key]));
    return Object.freeze(value);
  }

  function safeClone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  const TRAMOS = deepFreeze({
    'EBI-5': { nivelCodigo: 'EBI', nivel: 'Educación Básica Integrada', tramo: 5, grados: [7, 8] },
    'EBI-6': { nivelCodigo: 'EBI', nivel: 'Educación Básica Integrada', tramo: 6, grados: [9] },
    'EMS-7': { nivelCodigo: 'EMS', nivel: 'Educación Media Superior', tramo: 7, grados: [1] },
    'EMS-8': { nivelCodigo: 'EMS', nivel: 'Educación Media Superior', tramo: 8, grados: [2, 3] }
  });

  const REFERENCES = deepFreeze({
    'anep-ebi-matematica-t5-g7-areas': {
      referenceId: 'anep-ebi-matematica-t5-g7-areas',
      organismo: 'ANEP',
      marcoCurricular: 'Marco Curricular Nacional',
      nivelCodigo: 'EBI',
      nivel: 'Educación Básica Integrada',
      tramo: 5,
      gradosSugeridos: [7],
      subsistemas: ['DGES', 'DGETP'],
      componente: 'Alfabetizaciones fundamentales',
      espacioCurricular: 'Científico matemático',
      unidadCurricular: 'Matemática',
      eje: 'Figura',
      contenido: 'Perímetros, áreas, volúmenes',
      tipoContenido: 'Contenido para la profundización',
      competenciasEspecificas: ['CE1', 'CE2', 'CE3', 'CE5', 'CE7'],
      criteriosDeLogro: ['CL1.3', 'CL2.3', 'CL3.2', 'CL5.2', 'CL7.2'],
      fuenteOficial: {
        sourceId: SOURCE_ID,
        documento: 'Programa de Educación Básica Integrada. Matemática. Tramo 5 | Grados 7.º y 8.º',
        edicion: 'Ajuste 2024',
        gradoReferencia: '7.º grado',
        paginaReferencia: 13,
        seccionReferencia: 'Contenidos, criterios de logro de 7.º grado y su contribución al desarrollo de las competencias específicas',
        url: 'https://www.anep.edu.uy/sites/default/files/images/te-programas/2024/ajustes/3er_ciclo/Matem%C3%A1tica%20-%20Tramo%205%20-%202024.pdf',
        verificadoComoVigente: '2026-08-08'
      }
    }
  });

  function getReference(referenceId) {
    const key = String(referenceId || '').trim();
    const reference = REFERENCES[key];
    if (!reference) return null;
    return deepFreeze(safeClone(reference));
  }

  function createMissionReference(referenceId) {
    const reference = getReference(referenceId);
    if (!reference) throw new Error('Referencia curricular ANEP desconocida: ' + String(referenceId || ''));
    return reference;
  }

  function validateMissionReference(value) {
    const issues = [];
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return { valid: false, issues: ['La referencia curricular debe ser un objeto.'] };
    }
    const canonical = getReference(value.referenceId);
    if (!canonical) return { valid: false, issues: ['La referencia curricular no pertenece al catálogo ANEP vigente de CRIOS.'] };
    if (value.organismo !== 'ANEP') issues.push('El organismo curricular debe ser ANEP.');
    if (!['EBI', 'EMS'].includes(value.nivelCodigo)) issues.push('El nivel curricular debe usar la gramática EBI/EMS.');
    if (!Number.isInteger(value.tramo)) issues.push('El tramo curricular debe ser entero.');
    if (!Array.isArray(value.gradosSugeridos) || !value.gradosSugeridos.length || value.gradosSugeridos.some(grado => !Number.isInteger(grado) || grado < 1 || grado > 12)) {
      issues.push('La referencia curricular debe declarar grados sugeridos válidos.');
    }
    if (typeof value.unidadCurricular !== 'string' || !value.unidadCurricular.trim()) issues.push('La referencia curricular debe declarar la unidad curricular.');
    if (JSON.stringify(value) !== JSON.stringify(canonical)) issues.push('La referencia curricular debe coincidir exactamente con la versión catalogada por CRIOS.');
    return { valid: issues.length === 0, issues };
  }

  function intersectArrays(arrays) {
    if (!arrays.length) return [];
    return arrays.slice(1).reduce((common, current) => {
      const set = new Set(current);
      return common.filter(value => set.has(value));
    }, arrays[0].slice());
  }

  function unique(values) { return Array.from(new Set(values)); }

  function gradeLabel(nivelCodigo, grado) {
    const ordinal = String(grado) + '.º';
    return nivelCodigo === 'EMS' ? ordinal + ' grado EMS' : ordinal + ' grado';
  }

  function gradeListLabel(nivelCodigo, grades) {
    const list = grades.slice().sort((a, b) => a - b);
    return list.length === 1 ? gradeLabel(nivelCodigo, list[0]) : list.map(grado => gradeLabel(nivelCodigo, grado)).join(' / ');
  }

  function deriveCampaignReference(missions) {
    const list = Array.isArray(missions) ? missions : [];
    if (!list.length) return deepFreeze({ status: 'empty', compatible: false, label: 'Sin misiones', nivelCodigo: '', nivel: '', tramo: null, gradosSugeridos: [], subsistemas: [], unidadCurricular: '', sourceIds: [] });

    const refs = list.map(mission => mission && mission.curriculum).filter(Boolean);
    if (refs.length !== list.length || refs.some(ref => !validateMissionReference(ref).valid)) {
      return deepFreeze({ status: 'incomplete', compatible: false, label: 'Metadatos curriculares incompletos', nivelCodigo: '', nivel: '', tramo: null, gradosSugeridos: [], subsistemas: [], unidadCurricular: '', sourceIds: unique(refs.map(ref => ref && ref.fuenteOficial && ref.fuenteOficial.sourceId).filter(Boolean)) });
    }

    const niveles = unique(refs.map(ref => ref.nivelCodigo));
    const nombresNivel = unique(refs.map(ref => ref.nivel));
    const tramos = unique(refs.map(ref => ref.tramo));
    const unidades = unique(refs.map(ref => ref.unidadCurricular));
    const grados = intersectArrays(refs.map(ref => ref.gradosSugeridos));
    const subsistemas = intersectArrays(refs.map(ref => ref.subsistemas));
    const sourceIds = unique(refs.map(ref => ref.fuenteOficial.sourceId));
    const compatible = niveles.length === 1 && nombresNivel.length === 1 && tramos.length === 1 && grados.length > 0;

    if (!compatible) return deepFreeze({ status: 'mixed', compatible: false, label: 'Referencia curricular mixta', nivelCodigo: niveles.length === 1 ? niveles[0] : '', nivel: nombresNivel.length === 1 ? nombresNivel[0] : '', tramo: tramos.length === 1 ? tramos[0] : null, gradosSugeridos: grados, subsistemas, unidadCurricular: unidades.length === 1 ? unidades[0] : '', sourceIds });

    const nivelCodigo = niveles[0];
    const tramo = tramos[0];
    const unidadCurricular = unidades.length === 1 ? unidades[0] : 'Interdisciplinaria';
    const label = nivelCodigo + ' · Tramo ' + tramo + ' · ' + gradeListLabel(nivelCodigo, grados) + ' · ' + unidadCurricular;
    return deepFreeze({ status: 'compatible', compatible: true, label, nivelCodigo, nivel: nombresNivel[0], tramo, gradosSugeridos: grados.slice().sort((a, b) => a - b), subsistemas, unidadCurricular, sourceIds });
  }

  window.CRIOS_CURRICULUM = deepFreeze({ version: VERSION, sourceId: SOURCE_ID, tramos: TRAMOS, getReference, createMissionReference, validateMissionReference, deriveCampaignReference, gradeLabel });
})();
