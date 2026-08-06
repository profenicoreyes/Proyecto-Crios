import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { isDeepStrictEqual } from 'node:util';

const cases = [];
const modulePaths = [
  '../js/release/release-model.js',
  '../js/release/release-validator.js',
  '../js/session/session-model.js',
  '../js/session/session-validator.js',
  '../js/runtime/runtime-core.js'
];

function test(name, run) {
  cases.push({ name, run });
}

function assert(value, message) {
  if (!value) throw new Error(message || 'Assertion failed.');
}

function equal(actual, expected, message) {
  assert(actual === expected, message || `${actual} !== ${expected}`);
}

function plain(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function sameValue(actual, expected, message) {
  assert(isDeepStrictEqual(plain(actual), plain(expected)), message || 'Values are not deeply equal.');
}

function sameKeys(actual, expected) {
  sameValue(Object.keys(actual), expected);
}

function assertThrows(run, matcher) {
  let thrown = null;
  try {
    run();
  } catch (error) {
    thrown = error;
  }

  assert(thrown && typeof thrown.message === 'string', 'Expected an error with a message.');
  const matches = matcher instanceof RegExp
    ? matcher.test(thrown.message)
    : thrown.message.includes(matcher);
  assert(matches, `Unexpected error message: ${thrown.message}`);
  return thrown;
}

function loadDomain() {
  const registrations = [];
  const context = vm.createContext({ console, structuredClone });
  context.window = context;
  context.CRIOS_DOMAIN = {};
  context.__CRIOS_REGISTER_DOMAIN_MODULE__ = function (name, contract) {
    registrations.push({ name, contract });
    context.CRIOS_DOMAIN[name] = contract;
  };

  modulePaths.forEach(relativePath => {
    const file = new URL(relativePath, import.meta.url);
    vm.runInContext(readFileSync(file, 'utf8'), context, { filename: file.pathname });
  });

  return { domain: context.CRIOS_DOMAIN, registrations };
}

function release(overrides = {}) {
  const value = {
    id: 'release-runtime',
    title: 'Runtime characterization',
    scenario: 'antarctica',
    missions: [
      {
        id: 'energy',
        title: 'Energy',
        payload: {
          values: [1, 2],
          nested: { preserved: true }
        }
      },
      {
        id: 'ice',
        title: 'Ice',
        payload: {
          values: [3, 4]
        }
      }
    ],
    metadata: {
      createdAt: '2026-08-04T00:00:00.000Z',
      schemaVersion: '2.0',
      missionCount: 2,
      estimatedDuration: 20,
      averageDifficulty: 2
    }
  };

  return Object.assign(value, overrides);
}

function session(overrides = {}) {
  const value = {
    sessionId: 'session-runtime',
    releaseId: 'release-runtime',
    startedAt: '2026-08-04T00:00:00.000Z',
    status: 'running',
    currentMissionIndex: 0,
    lives: 3,
    progress: {
      completedMissionIds: [],
      currentMissionId: 'energy'
    },
    answers: []
  };

  return Object.assign(value, overrides);
}

const loaded = loadDomain();
const runtimeCore = loaded.domain.runtimeCore;

function runtime(overrides = {}) {
  const value = runtimeCore.createRuntime(release(), session());
  return Object.assign(value, overrides);
}

test('01 registra RuntimeCore exactamente una vez', () => {
  equal(loaded.registrations.length, 1);
  equal(loaded.registrations[0].name, 'runtimeCore');
  equal(loaded.registrations[0].contract, runtimeCore);
});

test('02 expone las dos APIs publicas exactas', () => {
  sameValue(Object.keys(runtimeCore).sort(), ['createRuntime', 'validateRuntime'].sort());
  equal(typeof runtimeCore.createRuntime, 'function');
  equal(typeof runtimeCore.validateRuntime, 'function');
});

test('03 createRuntime produce la forma canonica exacta', () => {
  const result = runtimeCore.createRuntime(release(), session());
  sameKeys(result, ['session', 'mission', 'state']);
  sameKeys(result.state, ['status', 'errors']);
  sameValue(result.state, { status: 'initialized', errors: [] });
  equal(result.session.sessionId, 'session-runtime');
  equal(result.mission.id, 'energy');
});

test('04 selecciona la mision mediante indice e id coherentes', () => {
  const sourceRelease = release();
  const sourceSession = session({
    currentMissionIndex: 1,
    progress: {
      completedMissionIds: ['energy'],
      currentMissionId: 'ice'
    }
  });
  const result = runtimeCore.createRuntime(sourceRelease, sourceSession);
  equal(result.mission.id, 'ice');
  equal(result.session.currentMissionIndex, 1);
  equal(result.session.progress.currentMissionId, 'ice');
});

test('05 crea snapshots nuevos de session mission state y ramas anidadas', () => {
  const sourceRelease = release();
  const sourceSession = session();
  const result = runtimeCore.createRuntime(sourceRelease, sourceSession);
  assert(result.session !== sourceSession);
  assert(result.session.progress !== sourceSession.progress);
  assert(result.session.answers !== sourceSession.answers);
  assert(result.mission !== sourceRelease.missions[0]);
  assert(result.mission.payload !== sourceRelease.missions[0].payload);
  assert(result.mission.payload.values !== sourceRelease.missions[0].payload.values);
  assert(result.state !== sourceSession);
  assert(result.state.errors !== sourceSession.answers);
});

test('06 no muta ni congela release o session', () => {
  const sourceRelease = release();
  const sourceSession = session();
  const beforeRelease = plain(sourceRelease);
  const beforeSession = plain(sourceSession);
  runtimeCore.createRuntime(sourceRelease, sourceSession);
  sameValue(sourceRelease, beforeRelease);
  sameValue(sourceSession, beforeSession);
  equal(Object.isFrozen(sourceRelease), false);
  equal(Object.isFrozen(sourceRelease.missions[0]), false);
  equal(Object.isFrozen(sourceSession), false);
  equal(Object.isFrozen(sourceSession.progress), false);
});

test('07 cambios posteriores en las entradas no alteran el Runtime', () => {
  const sourceRelease = release();
  const sourceSession = session();
  const result = runtimeCore.createRuntime(sourceRelease, sourceSession);
  sourceSession.status = 'gameOver';
  sourceSession.lives = 0;
  sourceSession.progress.currentMissionId = 'ice';
  sourceRelease.missions[0].title = 'Changed';
  sourceRelease.missions[0].payload.values.push(99);
  equal(result.session.status, 'running');
  equal(result.session.lives, 3);
  equal(result.session.progress.currentMissionId, 'energy');
  equal(result.mission.title, 'Energy');
  sameValue(result.mission.payload.values, [1, 2]);
});

test('08 cambios en el Runtime no alteran las entradas', () => {
  const sourceRelease = release();
  const sourceSession = session();
  const result = runtimeCore.createRuntime(sourceRelease, sourceSession);
  result.session.lives = 1;
  result.session.progress.completedMissionIds.push('energy');
  result.mission.title = 'Runtime-only';
  result.mission.payload.values.push(9);
  equal(sourceSession.lives, 3);
  sameValue(sourceSession.progress.completedMissionIds, []);
  equal(sourceRelease.missions[0].title, 'Energy');
  sameValue(sourceRelease.missions[0].payload.values, [1, 2]);
});

test('09 el Runtime y todas sus ramas permanecen mutables', () => {
  const result = runtimeCore.createRuntime(release(), session());
  equal(Object.isFrozen(result), false);
  equal(Object.isFrozen(result.session), false);
  equal(Object.isFrozen(result.session.progress), false);
  equal(Object.isFrozen(result.mission), false);
  equal(Object.isFrozen(result.mission.payload), false);
  equal(Object.isFrozen(result.state), false);
  equal(Object.isFrozen(result.state.errors), false);
  result.state.status = 'ready';
  result.state.errors.push('mutable');
  equal(result.state.status, 'ready');
  sameValue(result.state.errors, ['mutable']);
});

test('10 la creacion es determinista por valor', () => {
  sameValue(
    runtimeCore.createRuntime(release(), session()),
    runtimeCore.createRuntime(release(), session())
  );
});

test('11 validateRuntime acepta initialized ready y error', () => {
  ['initialized', 'ready', 'error'].forEach(status => {
    const value = runtime();
    value.state.status = status;
    value.state.errors = status === 'error' ? ['failure'] : [];
    equal(runtimeCore.validateRuntime(value), undefined);
  });
});

test('12 validateRuntime acepta incoherencia entre session y mission', () => {
  const value = runtime();
  value.mission.id = 'ice';
  equal(runtimeCore.validateRuntime(value), undefined);
});

test('13 rechaza releaseId distinto sin mutar entradas', () => {
  const sourceRelease = release();
  const sourceSession = session({ releaseId: 'other-release' });
  const beforeRelease = plain(sourceRelease);
  const beforeSession = plain(sourceSession);
  assertThrows(
    () => runtimeCore.createRuntime(sourceRelease, sourceSession),
    'session.releaseId no coincide con release.id'
  );
  sameValue(sourceRelease, beforeRelease);
  sameValue(sourceSession, beforeSession);
});

test('14 rechaza Release sin misiones', () => {
  assertThrows(
    () => runtimeCore.createRuntime(release({ missions: [] }), session()),
    'el Release no contiene misiones'
  );
});

test('15 rechaza currentMissionIndex negativo no entero o fuera de rango', () => {
  [-1, 0.5, 2].forEach(currentMissionIndex => {
    assertThrows(
      () => runtimeCore.createRuntime(release(), session({ currentMissionIndex })),
      /currentMissionIndex/
    );
  });
});

test('16 rechaza mision del indice invalida o sin id', () => {
  [null, [], {}, { id: '' }, { id: '   ' }].forEach(missionValue => {
    const sourceRelease = release();
    sourceRelease.missions[0] = missionValue;
    assertThrows(
      () => runtimeCore.createRuntime(sourceRelease, session()),
      /misión indicada por currentMissionIndex/
    );
  });
});

test('17 rechaza currentMissionId ausente desconocido o incoherente con el indice', () => {
  [
    session({ progress: { completedMissionIds: [], currentMissionId: '' } }),
    session({ progress: { completedMissionIds: [], currentMissionId: 'unknown' } }),
    session({ progress: { completedMissionIds: [], currentMissionId: 'ice' } })
  ].forEach(value => {
    assertThrows(
      () => runtimeCore.createRuntime(release(), value),
      /currentMissionId|misma misión/
    );
  });
});

test('18 rechaza entradas estructuralmente invalidas mediante validadores reales', () => {
  assertThrows(
    () => runtimeCore.createRuntime({}, session()),
    'Campaign Release invalida'
  );
  const invalidSession = session();
  delete invalidSession.answers;
  assertThrows(
    () => runtimeCore.createRuntime(release(), invalidSession),
    'Student Session inválida'
  );
});

test('19 validateRuntime rechaza claves faltantes o adicionales en raiz', () => {
  const missing = runtime();
  delete missing.state;
  assertThrows(() => runtimeCore.validateRuntime(missing), 'falta(n) campo(s) obligatorio(s): state');

  const extra = runtime();
  extra.detail = true;
  assertThrows(() => runtimeCore.validateRuntime(extra), 'campo(s) no permitido(s): detail');
});

test('20 validateRuntime rechaza mission invalida o sin id', () => {
  [null, [], {}, { id: '' }].forEach(missionValue => {
    const value = runtime();
    value.mission = missionValue;
    assertThrows(() => runtimeCore.validateRuntime(value), /mission/);
  });
});

test('21 validateRuntime rechaza state invalido claves extra status o errors', () => {
  const invalidStates = [
    null,
    [],
    {},
    { status: 'initialized' },
    { status: 'initialized', errors: [], detail: true },
    { status: 'unknown', errors: [] },
    { status: 'ready', errors: null }
  ];
  invalidStates.forEach(state => {
    const value = runtime();
    value.state = state;
    assertThrows(() => runtimeCore.validateRuntime(value), /state/);
  });
});

test('22 cada llamada devuelve referencias totalmente independientes', () => {
  const first = runtimeCore.createRuntime(release(), session());
  const second = runtimeCore.createRuntime(release(), session());
  assert(first !== second);
  assert(first.session !== second.session);
  assert(first.session.progress !== second.session.progress);
  assert(first.mission !== second.mission);
  assert(first.mission.payload !== second.mission.payload);
  assert(first.state !== second.state);
  assert(first.state.errors !== second.state.errors);
});

test('23 createRuntime no agrega campos ajenos al contrato', () => {
  const result = runtimeCore.createRuntime(release(), session());
  sameKeys(result, ['session', 'mission', 'state']);
  sameKeys(result.state, ['status', 'errors']);
  assert(!Object.prototype.hasOwnProperty.call(result, 'status'));
  assert(!Object.prototype.hasOwnProperty.call(result, 'runtime'));
});

test('24 la implementacion depende de CRIOS_DOMAIN y registro global', () => {
  const source = [runtimeCore.createRuntime, runtimeCore.validateRuntime]
    .map(value => Function.prototype.toString.call(value))
    .join('\n');
  assert(source.includes('getReleaseValidator'));
  assert(source.includes('getSessionValidator'));
  const moduleSource = readFileSync(new URL('../js/runtime/runtime-core.js', import.meta.url), 'utf8');
  assert(moduleSource.includes('window.__CRIOS_REGISTER_DOMAIN_MODULE__'));
  assert(moduleSource.includes('window.CRIOS_DOMAIN'));
});

test('25 no contiene efectos de DOM storage red audio navegacion ni timers', () => {
  const source = readFileSync(new URL('../js/runtime/runtime-core.js', import.meta.url), 'utf8');
  const forbidden = [
    /\bdocument\b/,
    /\blocalStorage\b/,
    /\bsessionStorage\b/,
    /\bfetch\b/,
    /\bXMLHttpRequest\b/,
    /\bWebSocket\b/,
    /\b(?:setTimeout|setInterval|requestAnimationFrame|queueMicrotask)\b/,
    /\b(?:Audio|AudioContext|webkitAudioContext)\b/,
    /\blocation\b/
  ];
  forbidden.forEach(pattern => assert(!pattern.test(source), `Forbidden pattern: ${pattern}`));
});

test('26 conserva las dependencias de composicion aunque CRIOS_DOMAIN se reemplace despues del registro', () => {
  const sourceRuntime = runtimeCore.createRuntime(release(), session());
  const originals = {
    releaseValidator: loaded.domain.releaseValidator,
    sessionValidator: loaded.domain.sessionValidator,
    releaseModel: loaded.domain.releaseModel
  };

  try {
    loaded.domain.releaseValidator = {
      validateReleaseStructure() {
        throw new Error('late release validator replacement');
      }
    };
    loaded.domain.sessionValidator = {
      validateStudentSession() {
        throw new Error('late session validator replacement');
      }
    };
    loaded.domain.releaseModel = {
      safeClone() {
        throw new Error('late release model replacement');
      }
    };

    const result = runtimeCore.createRuntime(release(), session());
    equal(result.mission.id, 'energy');
    equal(runtimeCore.validateRuntime(sourceRuntime), undefined);
  } finally {
    loaded.domain.releaseValidator = originals.releaseValidator;
    loaded.domain.sessionValidator = originals.sessionValidator;
    loaded.domain.releaseModel = originals.releaseModel;
  }
});

const results = [];
for (const entry of cases) {
  try {
    await entry.run();
    results.push({ name: entry.name, passed: true, error: null });
  } catch (error) {
    results.push({
      name: entry.name,
      passed: false,
      error: {
        name: error && error.name ? error.name : 'Error',
        message: String(error && error.message ? error.message : error)
      }
    });
  }
}

const passed = results.filter(result => result.passed).length;
const summary = {
  status: passed === cases.length ? 'PASS' : 'FAIL',
  total: cases.length,
  passed,
  failed: cases.length - passed,
  results
};

console.log(JSON.stringify(summary));
process.exitCode = summary.status === 'PASS' ? 0 : 1;
