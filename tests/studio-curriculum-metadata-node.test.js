'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const repo = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const read = (rel) => fs.readFileSync(path.join(repo, rel), 'utf8');

let total = 0;
let failed = 0;
function check(condition, message) {
  total += 1;
  if (!condition) {
    failed += 1;
    console.error('FAIL=' + message);
  }
}
function equal(actual, expected, message) {
  check(Object.is(actual, expected), message + ' actual=' + String(actual) + ' expected=' + String(expected));
}
function jsonEqual(actual, expected, message) {
  check(JSON.stringify(actual) === JSON.stringify(expected), message + ' actual=' + JSON.stringify(actual) + ' expected=' + JSON.stringify(expected));
}

function makeContext() {
  const window = {};
  window.window = window;
  const context = vm.createContext({
    window,
    Object,
    String,
    Boolean,
    Number,
    Array,
    RegExp,
    Error,
    Math,
    JSON,
    Map,
    Set,
    Date,
    structuredClone,
    console
  });
  return { window, context };
}

// Catalog contract and ANEP grammar.
{
  const { window, context } = makeContext();
  vm.runInContext(read('js/curriculum/anep-curriculum-catalog.js'), context, { filename: 'anep-curriculum-catalog.js' });
  const api = window.CRIOS_CURRICULUM;
  check(Boolean(api), 'curriculum API exists');
  equal(api.version, '2026.08.08', 'curriculum verification version');
  equal(api.sourceId, 'ANEP_EBI_MATEMATICA_TRAMO5_AJUSTE_2024', 'official source id');
  equal(api.tramos['EBI-5'].nivel, 'Educación Básica Integrada', 'official EBI name');
  jsonEqual(api.tramos['EBI-5'].grados, [7, 8], 'Tramo 5 grades');
  jsonEqual(api.tramos['EBI-6'].grados, [9], 'Tramo 6 grades');
  jsonEqual(api.tramos['EMS-7'].grados, [1], 'Tramo 7 EMS grades');
  jsonEqual(api.tramos['EMS-8'].grados, [2, 3], 'Tramo 8 EMS grades');

  const ref = api.getReference('anep-ebi-matematica-t5-g7-areas');
  check(Boolean(ref), 'areas reference exists');
  equal(ref.organismo, 'ANEP', 'authority ANEP');
  equal(ref.marcoCurricular, 'Marco Curricular Nacional', 'MCN terminology');
  equal(ref.nivelCodigo, 'EBI', 'EBI code');
  equal(ref.nivel, 'Educación Básica Integrada', 'EBI full label');
  equal(ref.tramo, 5, 'Tramo 5');
  jsonEqual(ref.gradosSugeridos, [7], 'current area missions suggest grade 7');
  jsonEqual(ref.subsistemas, ['DGES', 'DGETP'], 'DGES and DGETP compatibility');
  equal(ref.componente, 'Alfabetizaciones fundamentales', 'official component');
  equal(ref.espacioCurricular, 'Científico matemático', 'official space');
  equal(ref.unidadCurricular, 'Matemática', 'official curricular unit');
  equal(ref.eje, 'Figura', 'official axis');
  equal(ref.contenido, 'Perímetros, áreas, volúmenes', 'official content wording');
  equal(ref.tipoContenido, 'Contenido para la profundización', 'official content status');
  check(ref.competenciasEspecificas.includes('CE2'), 'specific competency stored');
  check(ref.criteriosDeLogro.includes('CL2.3'), 'achievement criterion stored');
  equal(ref.fuenteOficial.edicion, 'Ajuste 2024', 'official program edition');
  equal(ref.fuenteOficial.paginaReferencia, 13, 'official 7th-grade area section page');
  equal(ref.fuenteOficial.verificadoComoVigente, '2026-08-08', 'current verification date');
  check(/anep\.edu\.uy/.test(ref.fuenteOficial.url), 'official ANEP URL');
  check(/2024\/ajustes\/3er_ciclo/.test(ref.fuenteOficial.url), 'current 2024 adjustment URL');
  check(api.validateMissionReference(ref).valid, 'canonical reference validates');

  const tampered = JSON.parse(JSON.stringify(ref));
  tampered.tramo = 6;
  check(!api.validateMissionReference(tampered).valid, 'tampered reference rejected');
  equal(api.gradeLabel('EBI', 7), '7.º grado', 'EBI grade grammar');
  equal(api.gradeLabel('EMS', 1), '1.º grado EMS', 'EMS grade grammar');

  const current = api.deriveCampaignReference([{ curriculum: ref }, { curriculum: ref }]);
  equal(current.status, 'compatible', 'same curriculum compatible');
  check(current.compatible, 'same curriculum compatibility boolean');
  equal(current.label, 'EBI · Tramo 5 · 7.º grado · Matemática', 'campaign curriculum label');
  jsonEqual(current.gradosSugeridos, [7], 'campaign grade intersection');
  jsonEqual(current.subsistemas, ['DGES', 'DGETP'], 'campaign subsystem intersection');

  const missing = api.deriveCampaignReference([{}]);
  equal(missing.status, 'incomplete', 'missing metadata is incomplete');
}

// Mission registry contract and current four missions.
{
  const { window, context } = makeContext();
  vm.runInContext(read('js/curriculum/anep-curriculum-catalog.js'), context, { filename: 'anep-curriculum-catalog.js' });
  context.CRIOS_CURRICULUM = window.CRIOS_CURRICULUM;
  vm.runInContext(read('js/nucleo/registro-misiones.js'), context, { filename: 'registro-misiones.js' });
  ['centro-energia.js', 'invernadero.js', 'banco-hielo.js', 'hangar-perforacion.js'].forEach(file => {
    vm.runInContext(read('js/misiones/matematica/geometria/areas/' + file), context, { filename: file });
  });
  const registry = vm.runInContext('REGISTRO_MISIONES', context);
  const missions = registry.listar();
  equal(missions.length, 4, 'four current missions registered');
  jsonEqual(missions.map(m => m.id), ['energy', 'greenhouse', 'ice', 'hangar'], 'mission order preserved');
  jsonEqual(missions.map(m => m.clasificacion.dificultad), [2, 2, 2, 3], 'mission difficulty stays CRIOS-owned');
  jsonEqual(missions.map(m => m.duracionEstimadaMinutos), [12, 12, 12, 15], 'mission durations stay CRIOS-owned');
  check(missions.every(m => m.curriculum.referenceId === 'anep-ebi-matematica-t5-g7-areas'), 'all current missions use official curriculum reference');
  check(missions.every(m => m.curriculum.gradosSugeridos[0] === 7), 'all current missions suggest 7th grade');
}

// Release metadata: campaign difficulty is the arithmetic mean, duration is the sum.
{
  const { window, context } = makeContext();
  vm.runInContext(read('js/release/release-model.js'), context, { filename: 'release-model.js' });
  const calc = window.CRIOS_DOMAIN.releaseModel.calculateReleaseMetadata;
  const two = calc([
    { clasificacion: { dificultad: 2 }, duracionEstimadaMinutos: 12 },
    { clasificacion: { dificultad: 3 }, duracionEstimadaMinutos: 15 }
  ]);
  equal(two.missionCount, 2, 'release mission count');
  equal(two.estimatedDuration, 27, 'release duration sum');
  equal(two.averageDifficulty, 2.5, 'release difficulty arithmetic mean');

  const three = calc([
    { clasificacion: { dificultad: 2 }, duracionEstimadaMinutos: 10 },
    { clasificacion: { dificultad: 2 }, duracionEstimadaMinutos: 10 },
    { clasificacion: { dificultad: 3 }, duracionEstimadaMinutos: 10 }
  ]);
  equal(three.averageDifficulty, 2.3, 'release difficulty shown at one decimal');
}

// Draft note is campaign-instance metadata, not mutation of catalog mission.
{
  const { window, context } = makeContext();
  vm.runInContext(read('js/studio/modelo/campaign-draft.js'), context, { filename: 'campaign-draft.js' });
  const api = window.CRIOS_CAMPAIGN_DRAFT;
  const sourceMission = { id: 'energy', titulo: 'Centro de Energía', clasificacion: { dificultad: 2 }, duracionEstimadaMinutos: 12, curriculum: { referenceId: 'x' } };
  check(api.agregarMision(sourceMission).ok, 'draft mission added');
  equal(api.obtenerNotaMision('energy'), '', 'new mission note starts empty');
  check(api.establecerNotaMision('energy', 'Priorizar resolución gráfica.').ok, 'teacher note accepted');
  equal(api.obtenerNotaMision('energy'), 'Priorizar resolución gráfica.', 'teacher note persisted');
  equal(sourceMission.notaDocente, undefined, 'catalog/source mission remains untouched');
  equal(api.getMissions()[0].notaDocente, 'Priorizar resolución gráfica.', 'note belongs to draft mission instance');
  check(!api.establecerNotaMision('energy', 'x'.repeat(501)).ok, 'teacher note length bound enforced');
  equal(api.obtenerNotaMision('energy'), 'Priorizar resolución gráfica.', 'rejected long note does not overwrite prior value');
}

// Validator no longer asks teacher for duration/grade and checks CRIOS metadata instead.
{
  const { window, context } = makeContext();
  vm.runInContext(read('js/curriculum/anep-curriculum-catalog.js'), context, { filename: 'anep-curriculum-catalog.js' });
  vm.runInContext(read('js/servicios/campaign-validator.js'), context, { filename: 'campaign-validator.js' });
  const ref = window.CRIOS_CURRICULUM.getReference('anep-ebi-matematica-t5-g7-areas');
  const draft = { nombre: 'B6', escenario: 'antartida', misiones: [{ id: 'energy', clasificacion: { dificultad: 2 }, duracionEstimadaMinutos: 12, curriculum: ref, notaDocente: '' }] };
  const result = window.CRIOS_CAMPAIGN_VALIDATOR.validarCampaignDraft(draft, [{ id: 'antartida' }]);
  equal(result.estado, 'correcto', 'valid campaign needs no manual duration/grade');
  equal(result.errores.length, 0, 'no manual metadata errors');

  const badDifficulty = JSON.parse(JSON.stringify(draft));
  badDifficulty.misiones[0].clasificacion.dificultad = 0;
  check(window.CRIOS_CAMPAIGN_VALIDATOR.validarCampaignDraft(badDifficulty, [{ id: 'antartida' }]).errores.some(x => /dificultad/.test(x)), 'invalid mission difficulty blocks');

  const badDuration = JSON.parse(JSON.stringify(draft));
  badDuration.misiones[0].duracionEstimadaMinutos = 0;
  check(window.CRIOS_CAMPAIGN_VALIDATOR.validarCampaignDraft(badDuration, [{ id: 'antartida' }]).errores.some(x => /duración/.test(x)), 'invalid mission duration blocks');
}

// Static integration checks for Studio UI and loading order.
{
  const renderer = read('js/studio/render/studio-renderer.js');
  const studio = read('js/studio/studio.js');
  const validator = read('js/servicios/campaign-validator.js');
  const mainHtml = read('index.html');
  const studioHtml = read('studio/index.html');

  check(renderer.includes('Estimación automática'), 'Studio renders derived metadata heading');
  check(renderer.includes('Referencia curricular sugerida'), 'Studio renders curriculum reference');
  check(renderer.includes('Nota docente (opcional)'), 'Studio renders optional mission note');
  check(!renderer.includes('campaign-dificultad-input'), 'manual difficulty input removed');
  check(!renderer.includes('campaign-duracion-input'), 'manual duration input removed');
  check(!renderer.includes('campaign-nivel-input'), 'manual grade/level input removed');
  check(!renderer.includes('campaign-modalidad-input'), 'non-functional modality input removed');
  check(studio.includes('deriveCampaignReference'), 'Studio derives campaign curriculum');
  check(studio.includes('onMissionNote'), 'Studio wires mission note');
  check(!validator.includes('draft.duracion'), 'validator no longer reads manual duration');
  check(!validator.includes('draft.nivel'), 'validator no longer reads manual level');

  const mainCurriculum = mainHtml.indexOf('js/curriculum/anep-curriculum-catalog.js');
  const mainRegistry = mainHtml.indexOf('js/nucleo/registro-misiones.js');
  check(mainCurriculum >= 0 && mainCurriculum < mainRegistry, 'main loads curriculum before registry/missions');

  const studioCurriculum = studioHtml.indexOf('../js/curriculum/anep-curriculum-catalog.js');
  const studioRegistry = studioHtml.indexOf('../js/nucleo/registro-misiones.js');
  check(studioCurriculum >= 0 && studioCurriculum < studioRegistry, 'Studio loads curriculum before registry/missions');
}

console.log('STUDIO_CURRICULUM_METADATA_TEST_STATUS=' + (failed ? 'FAIL' : 'PASS'));
console.log('STUDIO_CURRICULUM_METADATA_TEST_TOTAL=' + total);
console.log('STUDIO_CURRICULUM_METADATA_TEST_FAILED=' + failed);
console.log('STUDIO_CURRICULUM_METADATA_ANEP_CURRENT_REFERENCE=true');
console.log('STUDIO_CURRICULUM_METADATA_MANUAL_DURATION_DIFFICULTY_GRADE=false');
console.log('STUDIO_CURRICULUM_METADATA_MISSION_NOTE=true');
if (failed) process.exit(1);
