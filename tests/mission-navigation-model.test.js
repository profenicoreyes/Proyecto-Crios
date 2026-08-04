import {
  MISSION_NAVIGATION_ACTIONS,
  createMissionNavigationDecision,
  isMissionNavigationModel
} from '../js/navigation/mission-navigation-model.js';

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

function evaluation(success, overrides = {}) {
  return {
    status: success ? 'CORRECT' : 'INCORRECT',
    success,
    score: success ? 1 : 0,
    completed: success,
    ...overrides
  };
}

test('01 las exportaciones publicas tienen los tres nombres exactos', () => {
  const publicExports = {
    MISSION_NAVIGATION_ACTIONS,
    createMissionNavigationDecision,
    isMissionNavigationModel
  };

  sameValue(Object.keys(publicExports).sort(), [
    'MISSION_NAVIGATION_ACTIONS',
    'createMissionNavigationDecision',
    'isMissionNavigationModel'
  ].sort());
});

test('02 MISSION_NAVIGATION_ACTIONS tiene claves y valores exactos', () => {
  sameKeys(MISSION_NAVIGATION_ACTIONS, ['RETURN_TO_MAP', 'RETRY_MISSION']);
  sameValue(MISSION_NAVIGATION_ACTIONS, {
    RETURN_TO_MAP: 'RETURN_TO_MAP',
    RETRY_MISSION: 'RETRY_MISSION'
  });
});

test('03 MISSION_NAVIGATION_ACTIONS esta congelado', () => {
  equal(Object.isFrozen(MISSION_NAVIGATION_ACTIONS), true);
});

test('04 una evaluacion correcta produce RETURN_TO_MAP y map', () => {
  sameValue(createMissionNavigationDecision(evaluation(true)), {
    action: 'RETURN_TO_MAP',
    target: 'map'
  });
});

test('05 una evaluacion incorrecta produce RETRY_MISSION y null', () => {
  sameValue(createMissionNavigationDecision(evaluation(false)), {
    action: 'RETRY_MISSION',
    target: null
  });
});

test('06 los campos aparecen exactamente en el orden action target', () => {
  sameKeys(createMissionNavigationDecision(evaluation(true)), ['action', 'target']);
  sameKeys(createMissionNavigationDecision(evaluation(false)), ['action', 'target']);
});

test('07 cada decision esta congelada', () => {
  equal(Object.isFrozen(createMissionNavigationDecision(evaluation(true))), true);
  equal(Object.isFrozen(createMissionNavigationDecision(evaluation(false))), true);
});

test('08 dos llamadas devuelven referencias diferentes', () => {
  const value = evaluation(true);
  assert(createMissionNavigationDecision(value) !== createMissionNavigationDecision(value));
});

test('09 la creacion es determinista', () => {
  sameValue(
    createMissionNavigationDecision(evaluation(true)),
    createMissionNavigationDecision(evaluation(true))
  );
  sameValue(
    createMissionNavigationDecision(evaluation(false)),
    createMissionNavigationDecision(evaluation(false))
  );
});

test('10 acepta EvaluationModel estructural con estados generales', () => {
  sameValue(createMissionNavigationDecision({
    status: 'EVALUATED',
    success: true,
    score: 10,
    completed: false,
    detail: 'preserved'
  }), {
    action: 'RETURN_TO_MAP',
    target: 'map'
  });
});

test('11 la decision depende exclusivamente de evaluation success', () => {
  sameValue(createMissionNavigationDecision(evaluation(true, {
    status: 'CUSTOM',
    score: -50,
    completed: false
  })), {
    action: 'RETURN_TO_MAP',
    target: 'map'
  });
  sameValue(createMissionNavigationDecision(evaluation(false, {
    status: 'CUSTOM',
    score: 500,
    completed: true
  })), {
    action: 'RETRY_MISSION',
    target: null
  });
});

test('12 rechaza EvaluationModel invalidos con TypeError', () => {
  [
    null,
    undefined,
    true,
    false,
    0,
    1,
    '',
    [],
    {},
    { status: 'EVALUATED', success: true, score: 1 }
  ].forEach(value => {
    assertTypeError(() => createMissionNavigationDecision(value));
  });
});

test('13 no realiza coercion de evaluation ni success', () => {
  [
    { status: 'EVALUATED', success: 1, score: 1, completed: true },
    { status: 'EVALUATED', success: 0, score: 0, completed: false },
    { status: 'EVALUATED', success: 'true', score: 1, completed: true },
    { status: 'EVALUATED', success: 'false', score: 0, completed: false }
  ].forEach(value => {
    assertTypeError(() => createMissionNavigationDecision(value));
  });
});

test('14 no altera ni congela la evaluacion recibida', () => {
  const value = evaluation(true, { detail: { preserved: true } });
  const before = JSON.stringify(value);
  const keysBefore = Object.keys(value).join(',');

  createMissionNavigationDecision(value);

  equal(JSON.stringify(value), before);
  equal(Object.keys(value).join(','), keysBefore);
  equal(Object.isFrozen(value), false);
  equal(Object.isFrozen(value.detail), false);
});

test('15 isMissionNavigationModel acepta los wrappers canonicos', () => {
  equal(isMissionNavigationModel({
    status: 'NAVIGATION_RESOLVED',
    action: 'RETURN_TO_MAP',
    target: 'map'
  }), true);
  equal(isMissionNavigationModel({
    status: 'NAVIGATION_RESOLVED',
    action: 'RETRY_MISSION',
    target: null
  }), true);
});

test('16 isMissionNavigationModel conserva acciones generales y campos adicionales', () => {
  equal(isMissionNavigationModel({
    status: 'NAVIGATION_RESOLVED',
    action: 'STAY',
    target: null,
    detail: true
  }), true);
});

test('17 isMissionNavigationModel no altera ni congela el objeto', () => {
  const value = {
    status: 'NAVIGATION_RESOLVED',
    action: 'STAY',
    target: null,
    detail: { preserved: true }
  };
  const before = JSON.stringify(value);

  equal(isMissionNavigationModel(value), true);
  equal(JSON.stringify(value), before);
  equal(Object.isFrozen(value), false);
  equal(Object.isFrozen(value.detail), false);
});

test('18 isMissionNavigationModel rechaza null arrays y primitivos', () => {
  [null, [], undefined, true, false, 0, 1, '', 'value', Symbol('value')].forEach(value => {
    equal(isMissionNavigationModel(value), false);
  });
});

test('19 rechaza la ausencia individual de status action o target', () => {
  const valid = {
    status: 'NAVIGATION_RESOLVED',
    action: 'RETURN_TO_MAP',
    target: 'map'
  };

  ['status', 'action', 'target'].forEach(key => {
    const candidate = { ...valid };
    delete candidate[key];
    equal(isMissionNavigationModel(candidate), false);
  });
});

test('20 rechaza status y action vacios o compuestos solo por espacios', () => {
  [
    { status: '', action: 'RETURN_TO_MAP', target: 'map' },
    { status: '   ', action: 'RETURN_TO_MAP', target: 'map' },
    { status: 'NAVIGATION_RESOLVED', action: '', target: 'map' },
    { status: 'NAVIGATION_RESOLVED', action: '   ', target: 'map' }
  ].forEach(value => {
    equal(isMissionNavigationModel(value), false);
  });
});

test('21 target null es valido y target undefined es invalido', () => {
  equal(isMissionNavigationModel({
    status: 'NAVIGATION_RESOLVED',
    action: 'RETRY_MISSION',
    target: null
  }), true);
  equal(isMissionNavigationModel({
    status: 'NAVIGATION_RESOLVED',
    action: 'RETURN_TO_MAP',
    target: undefined
  }), false);
});

test('22 las funciones exportadas no exponen efectos secundarios prohibidos', () => {
  const source = [
    Function.prototype.toString.call(createMissionNavigationDecision),
    Function.prototype.toString.call(isMissionNavigationModel)
  ].join(String.fromCharCode(10));
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
    /\bdomainNavigation\b/,
    /\bcreateNavigation\b/,
    /\bDate\.now\b/
  ];

  forbidden.forEach(pattern => {
    assert(!pattern.test(source), `Forbidden pattern: ${pattern}`);
  });
});

export { cases as missionNavigationModelTests };