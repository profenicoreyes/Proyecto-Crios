import {
  EVALUATION_STATUSES,
  createMissionEvaluation,
  isEvaluationModel
} from '../js/evaluation/evaluation-model.js';

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

function sameKeys(actual, expected) {
  equal(Object.keys(actual).join(','), expected.join(','));
}

function sameValue(actual, expected) {
  equal(JSON.stringify(actual), JSON.stringify(expected));
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

test('01 las exportaciones publicas tienen los tres nombres exactos', () => {
  const publicExports = {
    EVALUATION_STATUSES,
    createMissionEvaluation,
    isEvaluationModel
  };

  sameValue(Object.keys(publicExports).sort(), [
    'EVALUATION_STATUSES',
    'createMissionEvaluation',
    'isEvaluationModel'
  ].sort());
});

test('02 EVALUATION_STATUSES tiene las claves y valores exactos', () => {
  sameKeys(EVALUATION_STATUSES, ['CORRECT', 'INCORRECT']);
  sameValue(EVALUATION_STATUSES, {
    CORRECT: 'CORRECT',
    INCORRECT: 'INCORRECT'
  });
});

test('03 EVALUATION_STATUSES esta congelado', () => {
  equal(Object.isFrozen(EVALUATION_STATUSES), true);
});

test('04 true genera el modelo canonico correcto', () => {
  sameValue(createMissionEvaluation(true), {
    status: 'CORRECT',
    success: true,
    score: 1,
    completed: true
  });
});

test('05 false genera el modelo canonico incorrecto', () => {
  sameValue(createMissionEvaluation(false), {
    status: 'INCORRECT',
    success: false,
    score: 0,
    completed: false
  });
});

test('06 los campos aparecen en el orden status success score completed', () => {
  sameKeys(createMissionEvaluation(true), [
    'status',
    'success',
    'score',
    'completed'
  ]);

  sameKeys(createMissionEvaluation(false), [
    'status',
    'success',
    'score',
    'completed'
  ]);
});

test('07 cada resultado esta congelado', () => {
  equal(Object.isFrozen(createMissionEvaluation(true)), true);
  equal(Object.isFrozen(createMissionEvaluation(false)), true);
});

test('08 dos llamadas devuelven referencias diferentes', () => {
  assert(createMissionEvaluation(true) !== createMissionEvaluation(true));
  assert(createMissionEvaluation(false) !== createMissionEvaluation(false));
});

test('09 la creacion es determinista para true y false', () => {
  sameValue(
    createMissionEvaluation(true),
    createMissionEvaluation(true)
  );

  sameValue(
    createMissionEvaluation(false),
    createMissionEvaluation(false)
  );
});

test('10 rechaza con TypeError tipos distintos de boolean', () => {
  ['true', 1, null, undefined, [], {}].forEach(value => {
    assertTypeError(() => createMissionEvaluation(value));
  });
});

test('11 no realiza coercion de valores truthy o falsy', () => {
  [1, 0, 'true', 'false'].forEach(value => {
    assertTypeError(() => createMissionEvaluation(value));
  });
});

test('12 isEvaluationModel acepta ambos modelos canonicos', () => {
  equal(isEvaluationModel(createMissionEvaluation(true)), true);
  equal(isEvaluationModel(createMissionEvaluation(false)), true);
});

test('13 isEvaluationModel acepta el modelo general admitido por Game Flow', () => {
  equal(isEvaluationModel({
    status: 'EVALUATED',
    success: true,
    score: 10,
    completed: true
  }), true);
});

test('14 isEvaluationModel admite campos adicionales sin alterar el objeto', () => {
  const value = {
    status: 'CUSTOM',
    success: false,
    score: -3,
    completed: true,
    detail: {
      preserved: true
    }
  };

  const before = JSON.stringify(value);
  const beforeKeys = Object.keys(value).join(',');

  equal(isEvaluationModel(value), true);
  equal(JSON.stringify(value), before);
  equal(Object.keys(value).join(','), beforeKeys);
  equal(Object.isFrozen(value), false);
  equal(Object.isFrozen(value.detail), false);
});

test('15 isEvaluationModel rechaza null arrays y valores primitivos', () => {
  [
    null,
    [],
    undefined,
    true,
    false,
    0,
    1,
    '',
    'value',
    Symbol('value')
  ].forEach(value => {
    equal(isEvaluationModel(value), false);
  });
});

test('16 rechaza la ausencia individual de cualquiera de los cuatro campos', () => {
  const valid = {
    status: 'EVALUATED',
    success: true,
    score: 10,
    completed: true
  };

  ['status', 'success', 'score', 'completed'].forEach(key => {
    const candidate = { ...valid };
    delete candidate[key];

    equal(
      isEvaluationModel(candidate),
      false,
      `Missing ${key} must be rejected.`
    );
  });
});

test('17 rechaza tipos y valores estructurales invalidos', () => {
  const invalid = [
    { status: '', success: true, score: 1, completed: true },
    { status: '   ', success: true, score: 1, completed: true },
    { status: 'EVALUATED', success: 1, score: 1, completed: true },
    { status: 'EVALUATED', success: true, score: NaN, completed: true },
    { status: 'EVALUATED', success: true, score: Infinity, completed: true },
    { status: 'EVALUATED', success: true, score: -Infinity, completed: true },
    { status: 'EVALUATED', success: true, score: 1, completed: 1 }
  ];

  invalid.forEach(value => {
    equal(isEvaluationModel(value), false);
  });
});

test('18 el modulo no expone dependencias o efectos secundarios prohibidos', () => {
  const source = [
    Function.prototype.toString.call(createMissionEvaluation),
    Function.prototype.toString.call(isEvaluationModel)
  ].join('\n');

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
    /\bcrios\.js\b/i,
    /\bCRIOS_DOMAIN\b/,
    /\bREGISTRO_MISIONES\b/,
    /\bGame\s+Flow\b/i,
    /\bPlayerState\b/,
    /\bProgress\b/,
    /\bimport\s*(?:\(|[\s{*])/,
    /\bexport\s+[^;]*\sfrom\s+['"]/m
  ];

  forbidden.forEach(pattern => {
    assert(!pattern.test(source), `Forbidden pattern: ${pattern}`);
  });

  equal(Object.getPrototypeOf(EVALUATION_STATUSES), Object.prototype);
  equal(typeof EVALUATION_STATUSES.CORRECT, 'string');
  equal(typeof EVALUATION_STATUSES.INCORRECT, 'string');
});

export { cases as evaluationModelTests };