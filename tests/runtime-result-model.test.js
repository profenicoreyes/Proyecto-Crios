import {
  RUNTIME_RESULT_STATUS,
  RUNTIME_SNAPSHOT_STATUSES,
  createRuntimeResult,
  isRuntimeResultModel
} from '../js/runtime/runtime-result-model.js';

const cases = [];

function test(name, run) {
  cases.push({ name, run });
}

function assert(value, message) {
  if (!value) throw new Error(message || 'Assertion failed.');
}

function equal(actual, expected, message) {
  assert(actual === expected, message || `${actual} !== ${expected}`);
}

function sameValue(actual, expected) {
  equal(JSON.stringify(actual), JSON.stringify(expected));
}

function sameKeys(actual, expected) {
  equal(Object.keys(actual).join(','), expected.join(','));
}

function assertTypeError(run) {
  let thrown = null;
  try {
    run();
  } catch (error) {
    thrown = error;
  }
  assert(thrown instanceof TypeError, 'Expected TypeError.');
}

function runtime(overrides = {}) {
  const value = {
    session: {
      sessionId: 'session-runtime-result',
      releaseId: 'release-runtime-result',
      startedAt: '2026-08-04T00:00:00.000Z',
      status: 'running',
      currentMissionIndex: 0,
      lives: 2,
      progress: {
        completedMissionIds: [],
        currentMissionId: 'energy'
      },
      answers: []
    },
    mission: {
      id: 'energy',
      title: 'Energy',
      payload: {
        values: [1, 2],
        nested: { preserved: true }
      }
    },
    state: {
      status: 'initialized',
      errors: []
    }
  };

  return Object.assign(value, overrides);
}

function assertDeepFrozen(value) {
  if (value === null || typeof value !== 'object') return;
  equal(Object.isFrozen(value), true);
  Object.keys(value).forEach(key => assertDeepFrozen(value[key]));
}

test('01 las exportaciones publicas tienen los cuatro nombres exactos', () => {
  sameValue(Object.keys({
    RUNTIME_RESULT_STATUS,
    RUNTIME_SNAPSHOT_STATUSES,
    createRuntimeResult,
    isRuntimeResultModel
  }).sort(), [
    'RUNTIME_RESULT_STATUS',
    'RUNTIME_SNAPSHOT_STATUSES',
    'createRuntimeResult',
    'isRuntimeResultModel'
  ].sort());
});

test('02 las constantes tienen valores exactos y estan congeladas', () => {
  equal(RUNTIME_RESULT_STATUS, 'RUNTIME_REBUILT');
  sameValue(RUNTIME_SNAPSHOT_STATUSES, {
    INITIALIZED: 'initialized',
    READY: 'ready',
    ERROR: 'error'
  });
  equal(Object.isFrozen(RUNTIME_SNAPSHOT_STATUSES), true);
});

test('03 initialized produce wrapper y snapshot canonicos', () => {
  const result = createRuntimeResult(runtime());
  sameKeys(result, ['status', 'runtime']);
  sameKeys(result.runtime, ['session', 'mission', 'state']);
  sameKeys(result.runtime.state, ['status', 'errors']);
  equal(result.status, 'RUNTIME_REBUILT');
  equal(result.runtime.session.progress.currentMissionId, 'energy');
  equal(result.runtime.mission.id, 'energy');
  sameValue(result.runtime.state, { status: 'initialized', errors: [] });
});

test('04 admite ready y error con su evidencia', () => {
  const ready = runtime({ state: { status: 'ready', errors: [] } });
  const error = runtime({ state: { status: 'error', errors: ['runtime failure'] } });
  equal(createRuntimeResult(ready).runtime.state.status, 'ready');
  sameValue(createRuntimeResult(error).runtime.state, {
    status: 'error',
    errors: ['runtime failure']
  });
});

test('05 wrapper y snapshot completo quedan congelados', () => {
  assertDeepFrozen(createRuntimeResult(runtime()));
});

test('06 crea referencias nuevas para todas las ramas', () => {
  const source = runtime();
  const result = createRuntimeResult(source);
  assert(result !== source);
  assert(result.runtime !== source);
  assert(result.runtime.session !== source.session);
  assert(result.runtime.session.progress !== source.session.progress);
  assert(result.runtime.session.progress.completedMissionIds !== source.session.progress.completedMissionIds);
  assert(result.runtime.session.answers !== source.session.answers);
  assert(result.runtime.mission !== source.mission);
  assert(result.runtime.mission.payload !== source.mission.payload);
  assert(result.runtime.mission.payload.values !== source.mission.payload.values);
  assert(result.runtime.state !== source.state);
  assert(result.runtime.state.errors !== source.state.errors);
});

test('07 no modifica ni congela el Runtime recibido', () => {
  const source = runtime();
  const before = JSON.stringify(source);
  createRuntimeResult(source);
  equal(JSON.stringify(source), before);
  equal(Object.isFrozen(source), false);
  equal(Object.isFrozen(source.session), false);
  equal(Object.isFrozen(source.session.progress), false);
  equal(Object.isFrozen(source.mission), false);
  equal(Object.isFrozen(source.mission.payload), false);
  equal(Object.isFrozen(source.state), false);
  equal(Object.isFrozen(source.state.errors), false);
});

test('08 el resultado no cambia si el Runtime fuente se modifica despues', () => {
  const source = runtime();
  const result = createRuntimeResult(source);
  source.session.lives = 0;
  source.session.progress.currentMissionId = 'ice';
  source.mission.id = 'ice';
  source.mission.payload.values.push(3);
  source.state.status = 'error';
  source.state.errors.push('late');
  equal(result.runtime.session.lives, 2);
  equal(result.runtime.session.progress.currentMissionId, 'energy');
  equal(result.runtime.mission.id, 'energy');
  sameValue(result.runtime.mission.payload.values, [1, 2]);
  sameValue(result.runtime.state, { status: 'initialized', errors: [] });
});

test('09 la creacion es determinista por valores', () => {
  sameValue(createRuntimeResult(runtime()), createRuntimeResult(runtime()));
});

test('10 preserva el Runtime completo sin recalcular dominio', () => {
  const source = runtime();
  source.session.detail = { preserved: true };
  source.mission.detail = { preserved: true };
  source.state.errors = [{ code: 'E1', detail: { preserved: true } }];
  const result = createRuntimeResult(source);
  sameValue(result.runtime, source);
  assert(result.runtime !== source);
});

test('11 rechaza entradas no objeto', () => {
  [null, undefined, true, false, 0, 1, '', [], Symbol('value')].forEach(value => {
    assertTypeError(() => createRuntimeResult(value));
  });
});

test('12 rechaza claves faltantes o adicionales en Runtime', () => {
  ['session', 'mission', 'state'].forEach(key => {
    const value = runtime();
    delete value[key];
    assertTypeError(() => createRuntimeResult(value));
  });
  const extra = runtime();
  extra.detail = true;
  assertTypeError(() => createRuntimeResult(extra));
});

test('13 rechaza session y mission no objeto', () => {
  [null, [], true, 1, ''].forEach(value => {
    assertTypeError(() => createRuntimeResult(runtime({ session: value })));
    assertTypeError(() => createRuntimeResult(runtime({ mission: value })));
  });
});

test('14 rechaza releaseId ausente vacio o no string', () => {
  [undefined, null, '', '   ', 1, true].forEach(releaseId => {
    const value = runtime();
    value.session.releaseId = releaseId;
    assertTypeError(() => createRuntimeResult(value));
  });
});

test('15 rechaza currentMissionIndex ausente negativo o no entero', () => {
  [undefined, null, -1, 0.5, '0'].forEach(currentMissionIndex => {
    const value = runtime();
    value.session.currentMissionIndex = currentMissionIndex;
    assertTypeError(() => createRuntimeResult(value));
  });
});

test('16 rechaza progress o currentMissionId invalidos', () => {
  [null, [], true, 1, ''].forEach(progress => {
    const value = runtime();
    value.session.progress = progress;
    assertTypeError(() => createRuntimeResult(value));
  });
  [undefined, null, '', '   ', 1].forEach(currentMissionId => {
    const value = runtime();
    value.session.progress.currentMissionId = currentMissionId;
    assertTypeError(() => createRuntimeResult(value));
  });
});

test('17 rechaza mission id ausente vacio o no string', () => {
  [undefined, null, '', '   ', 1, true].forEach(id => {
    const value = runtime();
    value.mission.id = id;
    assertTypeError(() => createRuntimeResult(value));
  });
});

test('18 rechaza incoherencia entre currentMissionId y mission id', () => {
  const value = runtime();
  value.mission.id = 'ice';
  assertTypeError(() => createRuntimeResult(value));
});

test('19 rechaza state no objeto y claves faltantes o adicionales', () => {
  [null, [], true, 1, ''].forEach(state => {
    assertTypeError(() => createRuntimeResult(runtime({ state })));
  });
  ['status', 'errors'].forEach(key => {
    const value = runtime();
    delete value.state[key];
    assertTypeError(() => createRuntimeResult(value));
  });
  const extra = runtime();
  extra.state.detail = true;
  assertTypeError(() => createRuntimeResult(extra));
});

test('20 rechaza state status desconocido o errors no array', () => {
  [undefined, null, '', 'running', 'INITIALIZED'].forEach(status => {
    const value = runtime();
    value.state.status = status;
    assertTypeError(() => createRuntimeResult(value));
  });
  [undefined, null, true, 1, '', {}].forEach(errors => {
    const value = runtime();
    value.state.errors = errors;
    assertTypeError(() => createRuntimeResult(value));
  });
});

test('21 rechaza referencias ciclicas de forma explicita', () => {
  const value = runtime();
  value.mission.self = value.mission;
  assertTypeError(() => createRuntimeResult(value));
});

test('22 rechaza funciones simbolos y objetos no planos anidados', () => {
  const withFunction = runtime();
  withFunction.mission.calculate = function () {};
  assertTypeError(() => createRuntimeResult(withFunction));

  const withSymbol = runtime();
  withSymbol.mission.marker = Symbol('marker');
  assertTypeError(() => createRuntimeResult(withSymbol));

  const withDate = runtime();
  withDate.mission.createdAt = new Date('2026-08-04T00:00:00.000Z');
  assertTypeError(() => createRuntimeResult(withDate));
});

test('23 isRuntimeResultModel acepta wrappers canonicos sin exigir freeze', () => {
  equal(isRuntimeResultModel({ status: 'RUNTIME_REBUILT', runtime: runtime() }), true);
  equal(isRuntimeResultModel(createRuntimeResult(runtime())), true);
});

test('24 isRuntimeResultModel rechaza wrapper faltante adicional o status incorrecto', () => {
  const valid = { status: 'RUNTIME_REBUILT', runtime: runtime() };
  const invalid = [
    null,
    [],
    {},
    { status: 'RUNTIME_REBUILT' },
    { runtime: runtime() },
    { status: 'OTHER', runtime: runtime() },
    { ...valid, detail: true }
  ];
  invalid.forEach(value => equal(isRuntimeResultModel(value), false));
});

test('25 isRuntimeResultModel rechaza snapshots incoherentes sin lanzar', () => {
  const wrongMission = runtime();
  wrongMission.mission.id = 'ice';
  const extraRuntime = runtime();
  extraRuntime.detail = true;
  const extraState = runtime();
  extraState.state.detail = true;
  const cyclic = runtime();
  cyclic.mission.self = cyclic.mission;
  const withFunction = runtime();
  withFunction.mission.calculate = function () {};
  const withDate = runtime();
  withDate.mission.createdAt = new Date('2026-08-04T00:00:00.000Z');
  [
    null,
    {},
    wrongMission,
    extraRuntime,
    extraState,
    cyclic,
    withFunction,
    withDate,
    runtime({ state: { status: 'unknown', errors: [] } })
  ].forEach(snapshot => {
    equal(isRuntimeResultModel({ status: 'RUNTIME_REBUILT', runtime: snapshot }), false);
  });
});

test('26 isRuntimeResultModel no modifica ni congela el objeto recibido', () => {
  const value = { status: 'RUNTIME_REBUILT', runtime: runtime() };
  const before = JSON.stringify(value);
  equal(isRuntimeResultModel(value), true);
  equal(JSON.stringify(value), before);
  equal(Object.isFrozen(value), false);
  equal(Object.isFrozen(value.runtime), false);
  equal(Object.isFrozen(value.runtime.session), false);
});

test('27 errores anidados quedan clonados y congelados', () => {
  const source = runtime({
    state: {
      status: 'error',
      errors: [{ code: 'RUNTIME_FAILURE', detail: { retryable: false } }]
    }
  });
  const result = createRuntimeResult(source);
  assert(result.runtime.state.errors !== source.state.errors);
  assert(result.runtime.state.errors[0] !== source.state.errors[0]);
  assert(result.runtime.state.errors[0].detail !== source.state.errors[0].detail);
  assertDeepFrozen(result.runtime.state.errors);
});

test('28 las funciones exportadas no exponen efectos secundarios prohibidos', () => {
  const source = [createRuntimeResult, isRuntimeResultModel]
    .map(value => Function.prototype.toString.call(value))
    .join('\n');
  const forbidden = [
    /\bwindow\b/,
    /\bdocument\b/,
    /\bglobalThis\b/,
    /\blocalStorage\b/,
    /\bsessionStorage\b/,
    /\bfetch\b/,
    /\bXMLHttpRequest\b/,
    /\bWebSocket\b/,
    /\b(?:setTimeout|setInterval|requestAnimationFrame|queueMicrotask)\b/,
    /\b(?:Audio|AudioContext|webkitAudioContext)\b/,
    /\blocation\b/,
    /\bCRIOS_DOMAIN\b/,
    /\bdomainRuntime\b/,
    /\bcreateRuntime\b/,
    /\bDate\.now\b/
  ];
  forbidden.forEach(pattern => assert(!pattern.test(source), `Forbidden pattern: ${pattern}`));
});

export { cases as runtimeResultModelTests };
