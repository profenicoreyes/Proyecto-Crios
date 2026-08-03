import * as progressModule from '../js/progress/progress-model.js';

const {
  createMissionProgressUpdate,
  isProgressModel
} = progressModule;

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

function sameValue(actual, expected, message) {
  equal(
    JSON.stringify(actual),
    JSON.stringify(expected),
    message
  );
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

function evaluation(success) {
  return {
    status: success ? 'CORRECT' : 'INCORRECT',
    success,
    score: success ? 1 : 0,
    completed: success
  };
}

function baseInput(overrides = {}) {
  return {
    evaluation: evaluation(true),
    missionId: 'm1',
    progress: {
      m1: false,
      m2: true
    },
    sessionStats: {
      m1: {
        attempts: 2,
        hints: 1,
        completed: false,
        timeMs: 40
      },
      m2: {
        attempts: 1,
        completed: true,
        timeMs: 90
      }
    },
    missionRecord: {
      answer: '42',
      answerCorrect: false,
      timeMs: 40
    },
    openedAt: 100,
    now: 160,
    ...overrides
  };
}

test('01 las exportaciones publicas tienen los dos nombres exactos', () => {
  sameValue(Object.keys(progressModule).sort(), [
    'createMissionProgressUpdate',
    'isProgressModel'
  ].sort());
});

test('02 una respuesta correcta genera la actualizacion canonica', () => {
  sameValue(createMissionProgressUpdate(baseInput()), {
    progress: {
      m1: true,
      m2: true
    },
    sessionStats: {
      m1: {
        attempts: 2,
        hints: 1,
        completed: true,
        timeMs: 100
      },
      m2: {
        attempts: 1,
        completed: true,
        timeMs: 90
      }
    },
    missionRecord: {
      answer: '42',
      answerCorrect: true,
      timeMs: 100
    },
    campaignCompleted: false
  });
});

test('03 una respuesta incorrecta solo marca el registro como incorrecto', () => {
  const input = baseInput({
    evaluation: evaluation(false)
  });

  sameValue(createMissionProgressUpdate(input), {
    progress: input.progress,
    sessionStats: input.sessionStats,
    missionRecord: {
      ...input.missionRecord,
      answerCorrect: false
    },
    campaignCompleted: false
  });
});

test('04 una respuesta correcta admite missionRecord nulo', () => {
  const result = createMissionProgressUpdate(baseInput({
    missionRecord: null
  }));

  equal(result.missionRecord, null);
  equal(result.progress.m1, true);
  equal(result.sessionStats.m1.completed, true);
  equal(result.sessionStats.m1.timeMs, 100);
});

test('05 una respuesta incorrecta admite estadistica ausente y registro nulo', () => {
  const input = baseInput({
    evaluation: evaluation(false),
    sessionStats: {},
    missionRecord: null
  });
  const result = createMissionProgressUpdate(input);

  sameValue(result.progress, input.progress);
  sameValue(result.sessionStats, {});
  equal(result.missionRecord, null);
  equal(result.campaignCompleted, false);
});

test('06 el tiempo nuevo acumula el valor previo', () => {
  const result = createMissionProgressUpdate(baseInput({
    openedAt: 100,
    now: 175
  }));

  equal(result.sessionStats.m1.timeMs, 115);
  equal(result.missionRecord.timeMs, 115);
});

test('07 openedAt undefined conserva el fallback temporal legacy', () => {
  const result = createMissionProgressUpdate(baseInput({
    openedAt: undefined,
    now: 175
  }));

  equal(result.sessionStats.m1.timeMs, 40);
  equal(result.missionRecord.timeMs, 40);
});

test('08 openedAt null conserva el fallback temporal legacy', () => {
  const result = createMissionProgressUpdate(baseInput({
    openedAt: null,
    now: 175
  }));

  equal(result.sessionStats.m1.timeMs, 40);
});

test('09 openedAt cero conserva el fallback truthy del flujo legacy', () => {
  const result = createMissionProgressUpdate(baseInput({
    openedAt: 0,
    now: 175
  }));

  equal(result.sessionStats.m1.timeMs, 40);
});

test('10 preserva misiones y estadisticas no relacionadas', () => {
  const input = baseInput();
  const result = createMissionProgressUpdate(input);

  equal(result.progress.m2, input.progress.m2);
  sameValue(result.sessionStats.m2, input.sessionStats.m2);
});

test('11 no muta ningun objeto de entrada', () => {
  const input = baseInput();
  const before = JSON.stringify(input);

  createMissionProgressUpdate(input);

  equal(JSON.stringify(input), before);
});

test('12 devuelve referencias nuevas para los estados calculados', () => {
  const input = baseInput();
  const result = createMissionProgressUpdate(input);

  assert(result.progress !== input.progress);
  assert(result.sessionStats !== input.sessionStats);
  assert(result.sessionStats.m1 !== input.sessionStats.m1);
  assert(result.missionRecord !== input.missionRecord);
});

test('13 es determinista para entradas y tiempo identicos', () => {
  sameValue(
    createMissionProgressUpdate(baseInput()),
    createMissionProgressUpdate(baseInput())
  );
});

test('14 campaignCompleted permanece fijado en false', () => {
  equal(createMissionProgressUpdate(baseInput()).campaignCompleted, false);
  equal(createMissionProgressUpdate(baseInput({
    evaluation: evaluation(false)
  })).campaignCompleted, false);
});

test('15 rechaza modelos Evaluation invalidos', () => {
  [
    null,
    [],
    {},
    { status: '', success: true, score: 1, completed: true },
    { status: 'CORRECT', success: 1, score: 1, completed: true },
    { status: 'CORRECT', success: true, score: Infinity, completed: true },
    { status: 'CORRECT', success: true, score: 1, completed: 1 }
  ].forEach(value => {
    assertTypeError(() => createMissionProgressUpdate(baseInput({
      evaluation: value
    })));
  });
});

test('16 rechaza missionId vacio o de tipo incorrecto', () => {
  [null, undefined, 1, {}, [], '', '   '].forEach(value => {
    assertTypeError(() => createMissionProgressUpdate(baseInput({
      missionId: value
    })));
  });
});

test('17 rechaza contenedores progress invalidos', () => {
  [null, undefined, true, 1, '', []].forEach(value => {
    assertTypeError(() => createMissionProgressUpdate(baseInput({
      progress: value
    })));
  });
});

test('18 rechaza contenedores sessionStats invalidos', () => {
  [null, undefined, true, 1, '', []].forEach(value => {
    assertTypeError(() => createMissionProgressUpdate(baseInput({
      sessionStats: value
    })));
  });
});

test('19 rechaza missionRecord invalido', () => {
  [true, 1, '', []].forEach(value => {
    assertTypeError(() => createMissionProgressUpdate(baseInput({
      missionRecord: value
    })));
  });
});

test('20 una respuesta correcta exige estadisticas de la mision', () => {
  [undefined, null, true, 1, '', []].forEach(value => {
    assertTypeError(() => createMissionProgressUpdate(baseInput({
      sessionStats: {
        m1: value
      }
    })));
  });
});

test('21 rechaza timeMs previo no finito o no numerico', () => {
  [NaN, Infinity, -Infinity, '40', true, {}].forEach(value => {
    assertTypeError(() => createMissionProgressUpdate(baseInput({
      sessionStats: {
        m1: {
          timeMs: value
        }
      }
    })));
  });
});

test('22 rechaza tiempos de entrada invalidos', () => {
  [NaN, Infinity, -Infinity, '100', true, {}, []].forEach(value => {
    assertTypeError(() => createMissionProgressUpdate(baseInput({
      openedAt: value
    })));
  });

  [NaN, Infinity, -Infinity, '160', null, undefined, true, {}, []].forEach(value => {
    assertTypeError(() => createMissionProgressUpdate(baseInput({
      now: value
    })));
  });
});

test('23 isProgressModel acepta el wrapper legacy y campos adicionales', () => {
  const value = {
    status: 'PROGRESS_UPDATED',
    campaignCompleted: false,
    progress: {
      m1: true
    },
    detail: {
      preserved: true
    }
  };
  const before = JSON.stringify(value);

  equal(isProgressModel(value), true);
  equal(isProgressModel({
    status: 'CAMPAIGN_COMPLETED',
    campaignCompleted: true,
    progress: {}
  }), true);
  equal(isProgressModel({
    status: 'CUSTOM',
    campaignCompleted: false,
    progress: {}
  }), true);
  equal(JSON.stringify(value), before);
  equal(Object.isFrozen(value), false);
});

test('24 isProgressModel rechaza estructuras invalidas sin lanzar', () => {
  [
    null,
    [],
    undefined,
    true,
    1,
    '',
    {},
    { status: '', campaignCompleted: false, progress: {} },
    { status: '   ', campaignCompleted: false, progress: {} },
    { status: 'PROGRESS_UPDATED', campaignCompleted: 0, progress: {} },
    { status: 'PROGRESS_UPDATED', campaignCompleted: false },
    { status: 'PROGRESS_UPDATED', campaignCompleted: false, progress: null },
    { status: 'PROGRESS_UPDATED', campaignCompleted: false, progress: [] }
  ].forEach(value => {
    equal(isProgressModel(value), false);
  });
});

export { cases as progressModelTests };
