import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { isDeepStrictEqual } from 'node:util';

const cases = [];
const modulePaths = [
  '../js/session/session-model.js',
  '../js/session/session-validator.js',
  '../js/player-state/player-state-validator.js',
  '../js/player-state/player-state-service.js'
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

function sameValue(actual, expected, message) {
  assert(isDeepStrictEqual(actual, expected), message || 'Values are not deeply equal.');
}

function assertThrows(run, matcher) {
  const validMatcher = matcher instanceof RegExp ||
    (typeof matcher === 'string' && matcher.length > 0);
  assert(validMatcher, 'Expected a non-empty string or RegExp error matcher.');

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

function cloneExact(value, ancestors = new Set()) {
  if (value === null || typeof value !== 'object') return value;
  if (ancestors.has(value)) throw new Error('Cannot clone cyclic fixture.');

  ancestors.add(value);
  const clone = Array.isArray(value)
    ? []
    : Object.create(Object.getPrototypeOf(value));

  if (Array.isArray(value)) {
    Object.setPrototypeOf(clone, Object.getPrototypeOf(value));
  }

  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
      descriptor.value = cloneExact(descriptor.value, ancestors);
    }
    Object.defineProperty(clone, key, descriptor);
  }

  ancestors.delete(value);
  return clone;
}

function loadDomain() {
  const context = vm.createContext({ console });
  context.window = context;
  context.CRIOS_DOMAIN = {};

  modulePaths.forEach(relativePath => {
    const file = new URL(relativePath, import.meta.url);
    vm.runInContext(readFileSync(file, 'utf8'), context, { filename: file.pathname });
  });

  return context.CRIOS_DOMAIN;
}

function session(overrides = {}) {
  const value = {
    sessionId: 'session-player-state',
    releaseId: 'release-player-state',
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

function evaluation(isCorrect, missionId = 'energy') {
  return { missionId, isCorrect };
}

function withoutPlayerState(value) {
  const copy = cloneExact(value);
  delete copy.lives;
  delete copy.status;
  return copy;
}

const domain = loadDomain();
const service = domain.playerStateService;

test('01 registra las APIs publicas exactas', () => {
  sameValue(Object.keys(service).sort(), [
    'applyEvaluation',
    'restorePlayerState',
    'canContinue'
  ].sort());
  Object.values(service).forEach(value => equal(typeof value, 'function'));
});

test('02 evaluacion correcta conserva vidas y running en la misma referencia', () => {
  const value = session();
  const returned = service.applyEvaluation(value, evaluation(true));
  equal(returned, value);
  equal(value.lives, 3);
  equal(value.status, 'running');
});

test('03 evaluacion incorrecta descuenta una vida y conserva running', () => {
  const value = session({ lives: 3 });
  const returned = service.applyEvaluation(value, evaluation(false));
  equal(returned, value);
  equal(value.lives, 2);
  equal(value.status, 'running');
});

test('04 evaluacion incorrecta con una vida establece gameOver', () => {
  const value = session({ lives: 1 });
  const returned = service.applyEvaluation(value, evaluation(false));
  equal(returned, value);
  equal(value.lives, 0);
  equal(value.status, 'gameOver');
});

test('05 missionId incoherente lanza sin modificar la sesion', () => {
  const value = session();
  const before = cloneExact(value);
  assertThrows(
    () => service.applyEvaluation(value, evaluation(false, 'ice')),
    'missionId incoherente con la sesión actual'
  );
  sameValue(value, before);
});

test('06 isCorrect invalido lanza sin modificar la sesion', () => {
  const value = session();
  const before = cloneExact(value);
  assertThrows(
    () => service.applyEvaluation(value, { missionId: 'energy', isCorrect: 1 }),
    'isCorrect debe ser booleano'
  );
  sameValue(value, before);
});

test('07 status distinto de running lanza sin modificar la sesion', () => {
  const value = session({ status: 'finished' });
  const before = cloneExact(value);
  assertThrows(
    () => service.applyEvaluation(value, evaluation(true)),
    'session.status debe ser running'
  );
  sameValue(value, before);
});

test('08 sesion estructuralmente invalida lanza sin cambiar sus campos', () => {
  const value = session();
  delete value.answers;
  const before = cloneExact(value);
  assertThrows(
    () => service.applyEvaluation(value, evaluation(true)),
    'falta(n) campo(s) obligatorio(s): answers'
  );
  sameValue(value, before);
});

test('09 restore desde gameOver restaura maximo y running en la misma referencia', () => {
  const value = session({ status: 'gameOver', lives: 0 });
  const returned = service.restorePlayerState(value);
  equal(returned, value);
  equal(value.lives, domain.sessionModel.INITIAL_SESSION_LIVES);
  equal(value.status, 'running');
});

test('10 restore desde running restaura maximo y conserva status', () => {
  const value = session({ status: 'running', lives: 1 });
  const returned = service.restorePlayerState(value);
  equal(returned, value);
  equal(value.lives, domain.sessionModel.INITIAL_SESSION_LIVES);
  equal(value.status, 'running');
});

test('11 canContinue distingue running de gameOver', () => {
  equal(service.canContinue(session({ status: 'running', lives: 2 })), true);
  equal(service.canContinue(session({ status: 'gameOver', lives: 0 })), false);
});

test('12 sesiones equivalentes producen valores deterministas y referencias independientes', () => {
  const first = session();
  const second = session();
  const firstResult = service.applyEvaluation(first, evaluation(false));
  const secondResult = service.applyEvaluation(second, evaluation(false));
  sameValue(firstResult, secondResult);
  assert(firstResult !== secondResult);
  assert(first.progress !== second.progress);
  assert(first.answers !== second.answers);
});

test('13 apply y restore solo cambian lives y status', () => {
  const applied = session({ lives: 2 });
  const appliedBefore = cloneExact(applied);
  const appliedReturned = service.applyEvaluation(applied, evaluation(false));
  const appliedAfter = cloneExact(applied);
  equal(appliedReturned, applied);
  equal(applied.lives, 1);
  equal(applied.status, 'running');
  sameValue(withoutPlayerState(appliedAfter), withoutPlayerState(appliedBefore));

  const restored = session({ status: 'gameOver', lives: 0 });
  const restoredBefore = cloneExact(restored);
  const restoredReturned = service.restorePlayerState(restored);
  const restoredAfter = cloneExact(restored);
  equal(restoredReturned, restored);
  equal(restored.lives, domain.sessionModel.INITIAL_SESSION_LIVES);
  equal(restored.status, 'running');
  sameValue(withoutPlayerState(restoredAfter), withoutPlayerState(restoredBefore));
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
  status: passed === 13 ? 'PASS' : 'FAIL',
  total: 13,
  passed,
  failed: 13 - passed,
  results
};

console.log(JSON.stringify(summary));
process.exitCode = summary.status === 'PASS' ? 0 : 1;