import {
  PLAYER_STATE_RESULT_STATUS,
  PLAYER_STATE_SNAPSHOT_STATUSES,
  createPlayerStateResult,
  isPlayerStateResultModel,
  isGameOverPlayerStateResult
} from '../js/player-state/player-state-result-model.js';

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

function session(status = 'running', lives = 3, extra = {}) {
  return { status, lives, ...extra };
}

test('01 las exportaciones publicas tienen los cinco nombres exactos', () => {
  sameValue(Object.keys({
    PLAYER_STATE_RESULT_STATUS,
    PLAYER_STATE_SNAPSHOT_STATUSES,
    createPlayerStateResult,
    isPlayerStateResultModel,
    isGameOverPlayerStateResult
  }).sort(), [
    'PLAYER_STATE_RESULT_STATUS',
    'PLAYER_STATE_SNAPSHOT_STATUSES',
    'createPlayerStateResult',
    'isPlayerStateResultModel',
    'isGameOverPlayerStateResult'
  ].sort());
});

test('02 las constantes tienen valores exactos y estan congeladas', () => {
  equal(PLAYER_STATE_RESULT_STATUS, 'PLAYER_STATE_APPLIED');
  sameValue(PLAYER_STATE_SNAPSHOT_STATUSES, {
    RUNNING: 'running',
    GAME_OVER: 'gameOver'
  });
  equal(Object.isFrozen(PLAYER_STATE_SNAPSHOT_STATUSES), true);
});

test('03 running produce wrapper y snapshot canonicos', () => {
  const result = createPlayerStateResult(session('running', 2));
  sameKeys(result, ['status', 'state']);
  sameKeys(result.state, ['status', 'lives']);
  sameValue(result, {
    status: 'PLAYER_STATE_APPLIED',
    state: { status: 'running', lives: 2 }
  });
});

test('04 gameOver produce evidencia historica coherente', () => {
  sameValue(createPlayerStateResult(session('gameOver', 0)), {
    status: 'PLAYER_STATE_APPLIED',
    state: { status: 'gameOver', lives: 0 }
  });
});

test('05 wrapper y snapshot quedan congelados', () => {
  const result = createPlayerStateResult(session());
  equal(Object.isFrozen(result), true);
  equal(Object.isFrozen(result.state), true);
});

test('06 crea referencias nuevas y no expone la sesion recibida', () => {
  const source = session('running', 2, { progress: { preserved: true } });
  const result = createPlayerStateResult(source);
  assert(result !== source);
  assert(result.state !== source);
  sameValue(result.state, { status: 'running', lives: 2 });
});

test('07 no modifica ni congela la sesion recibida', () => {
  const source = session('running', 2, { detail: { preserved: true } });
  const before = JSON.stringify(source);
  createPlayerStateResult(source);
  equal(JSON.stringify(source), before);
  equal(Object.isFrozen(source), false);
  equal(Object.isFrozen(source.detail), false);
});

test('08 el resultado no cambia si la sesion se restaura despues', () => {
  const source = session('gameOver', 0);
  const result = createPlayerStateResult(source);
  source.status = 'running';
  source.lives = 3;
  sameValue(result, {
    status: 'PLAYER_STATE_APPLIED',
    state: { status: 'gameOver', lives: 0 }
  });
});

test('09 la creacion es determinista por valores', () => {
  sameValue(
    createPlayerStateResult(session('running', 2)),
    createPlayerStateResult(session('running', 2))
  );
  sameValue(
    createPlayerStateResult(session('gameOver', 0)),
    createPlayerStateResult(session('gameOver', 0))
  );
});

test('10 acepta una sesion completa e ignora campos ajenos al snapshot', () => {
  sameValue(createPlayerStateResult(session('running', 3, {
    sessionId: 'session-1',
    progress: { currentMissionId: 'mission-1' },
    answers: []
  })), {
    status: 'PLAYER_STATE_APPLIED',
    state: { status: 'running', lives: 3 }
  });
});

test('11 rechaza entradas no objeto', () => {
  [null, undefined, true, false, 0, 1, '', [], Symbol('value')].forEach(value => {
    assertTypeError(() => createPlayerStateResult(value));
  });
});

test('12 rechaza status ausente desconocido finished o no string', () => {
  [
    { lives: 3 },
    session('', 3),
    session('finished', 3),
    session('PLAYING', 3),
    session(null, 3),
    session(true, 3)
  ].forEach(value => assertTypeError(() => createPlayerStateResult(value)));
});

test('13 rechaza lives ausentes no enteras o negativas', () => {
  [
    { status: 'running' },
    { status: 'running', lives: undefined },
    session('running', null),
    session('running', '3'),
    session('running', 2.5),
    session('running', -1),
    session('running', Number.NaN)
  ].forEach(value => assertTypeError(() => createPlayerStateResult(value)));
});

test('14 rechaza incoherencia entre running y cero vidas', () => {
  assertTypeError(() => createPlayerStateResult(session('running', 0)));
});

test('15 rechaza incoherencia entre gameOver y vidas restantes', () => {
  [1, 2, 3].forEach(lives => {
    assertTypeError(() => createPlayerStateResult(session('gameOver', lives)));
  });
});

test('16 isPlayerStateResultModel acepta solo wrappers canonicos', () => {
  equal(isPlayerStateResultModel({
    status: 'PLAYER_STATE_APPLIED',
    state: { status: 'running', lives: 2 }
  }), true);
  equal(isPlayerStateResultModel({
    status: 'PLAYER_STATE_APPLIED',
    state: { status: 'gameOver', lives: 0 }
  }), true);
});

test('17 isPlayerStateResultModel rechaza claves faltantes adicionales o status incorrecto', () => {
  const invalid = [
    null,
    [],
    {},
    { status: 'PLAYER_STATE_APPLIED' },
    { state: { status: 'running', lives: 2 } },
    { status: 'OTHER', state: { status: 'running', lives: 2 } },
    { status: 'PLAYER_STATE_APPLIED', state: { status: 'running', lives: 2 }, gameOver: false },
    { status: 'PLAYER_STATE_APPLIED', state: { status: 'running', lives: 2, extra: true } }
  ];
  invalid.forEach(value => equal(isPlayerStateResultModel(value), false));
});

test('18 isPlayerStateResultModel rechaza snapshots incoherentes', () => {
  [
    { status: 'PLAYER_STATE_APPLIED', state: { status: 'running', lives: 0 } },
    { status: 'PLAYER_STATE_APPLIED', state: { status: 'gameOver', lives: 1 } },
    { status: 'PLAYER_STATE_APPLIED', state: { status: 'finished', lives: 3 } },
    { status: 'PLAYER_STATE_APPLIED', state: { status: 'running', lives: -1 } },
    { status: 'PLAYER_STATE_APPLIED', state: { status: 'running', lives: 1.5 } }
  ].forEach(value => equal(isPlayerStateResultModel(value), false));
});

test('19 isGameOverPlayerStateResult deriva el corte desde el snapshot', () => {
  equal(isGameOverPlayerStateResult(createPlayerStateResult(session('gameOver', 0))), true);
  equal(isGameOverPlayerStateResult(createPlayerStateResult(session('running', 2))), false);
  equal(isGameOverPlayerStateResult({ status: 'PLAYER_STATE_APPLIED', state: { status: 'gameOver', lives: 1 } }), false);
});

test('20 las funciones no exponen efectos secundarios prohibidos', () => {
  const source = [
    createPlayerStateResult,
    isPlayerStateResultModel,
    isGameOverPlayerStateResult
  ].map(value => Function.prototype.toString.call(value)).join('\n');
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
    /\bDate\.now\b/
  ];
  forbidden.forEach(pattern => assert(!pattern.test(source), `Forbidden pattern: ${pattern}`));
});

export { cases as playerStateResultModelTests };
