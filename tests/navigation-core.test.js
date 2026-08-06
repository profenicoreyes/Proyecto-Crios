import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { isDeepStrictEqual } from 'node:util';

const cases = [];
const modulePaths = [
  '../js/release/release-model.js',
  '../js/release/release-validator.js',
  '../js/session/session-model.js',
  '../js/session/session-validator.js',
  '../js/runtime/runtime-core.js',
  '../js/navigation/navigation-core.js'
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
    id: 'release-navigation',
    title: 'Navigation characterization',
    scenario: 'antarctica',
    missions: [
      { id: 'energy', title: 'Energy' },
      { id: 'ice', title: 'Ice' }
    ],
    metadata: {
      createdAt: '2026-08-06T00:00:00.000Z',
      schemaVersion: '2.0',
      missionCount: 2,
      estimatedDuration: 20,
      averageDifficulty: 2
    }
  };

  return Object.assign(value, overrides);
}

function session(currentMissionIndex = 0, currentMissionId = 'energy') {
  return {
    sessionId: 'session-navigation',
    releaseId: 'release-navigation',
    startedAt: '2026-08-06T00:00:00.000Z',
    status: 'running',
    currentMissionIndex,
    lives: 3,
    progress: {
      completedMissionIds: currentMissionIndex === 0 ? [] : ['energy'],
      currentMissionId
    },
    answers: []
  };
}

const loaded = loadDomain();
const runtimeCore = loaded.domain.runtimeCore;
const navigationCore = loaded.domain.navigationCore;

function runtime(sourceRelease = release(), sourceSession = session()) {
  return runtimeCore.createRuntime(sourceRelease, sourceSession);
}

test('01 registra NavigationCore exactamente una vez como navigationCore', () => {
  const registrations = loaded.registrations.filter(entry => entry.name === 'navigationCore');
  equal(registrations.length, 1);
  equal(registrations[0].contract, navigationCore);
});

test('02 expone las seis APIs publicas exactas', () => {
  sameValue(Object.keys(navigationCore).sort(), [
    'createNavigation',
    'validateNavigation',
    'getCurrentMission',
    'hasNextMission',
    'getNextMission',
    'isFinished'
  ].sort());
  Object.values(navigationCore).forEach(value => equal(typeof value, 'function'));
});

test('03 crea la forma canonica para la primera mision sin mutar ni congelar entradas', () => {
  const sourceRelease = release();
  const sourceRuntime = runtime(sourceRelease, session());
  const beforeRelease = plain(sourceRelease);
  const beforeRuntime = plain(sourceRuntime);
  const result = navigationCore.createNavigation(sourceRuntime, sourceRelease);

  sameKeys(result, [
    'currentMissionId',
    'currentMissionIndex',
    'previousMissionId',
    'nextMissionId',
    'hasPrevious',
    'hasNext',
    'isFinished'
  ]);
  sameValue(result, {
    currentMissionId: 'energy',
    currentMissionIndex: 0,
    previousMissionId: null,
    nextMissionId: 'ice',
    hasPrevious: false,
    hasNext: true,
    isFinished: false
  });
  equal(Object.isFrozen(result), true);
  sameValue(sourceRelease, beforeRelease);
  sameValue(sourceRuntime, beforeRuntime);
  equal(Object.isFrozen(sourceRelease), false);
  equal(Object.isFrozen(sourceRelease.missions), false);
  equal(Object.isFrozen(sourceRuntime), false);
  equal(Object.isFrozen(sourceRuntime.session), false);
});

test('04 caracteriza la segunda mision con anterior sin siguiente y finalizada', () => {
  const sourceRelease = release();
  const sourceRuntime = runtime(sourceRelease, session(1, 'ice'));
  sameValue(navigationCore.createNavigation(sourceRuntime, sourceRelease), {
    currentMissionId: 'ice',
    currentMissionIndex: 1,
    previousMissionId: 'energy',
    nextMissionId: null,
    hasPrevious: true,
    hasNext: false,
    isFinished: true
  });
});

test('05 los helpers publicos son coherentes con createNavigation', () => {
  const sourceRelease = release();
  const firstRuntime = runtime(sourceRelease, session());
  const secondRuntime = runtime(sourceRelease, session(1, 'ice'));

  equal(navigationCore.validateNavigation(
    navigationCore.createNavigation(firstRuntime, sourceRelease)
  ), undefined);
  equal(navigationCore.getCurrentMission(firstRuntime, sourceRelease), sourceRelease.missions[0]);
  equal(navigationCore.hasNextMission(firstRuntime, sourceRelease), true);
  equal(navigationCore.getNextMission(firstRuntime, sourceRelease), sourceRelease.missions[1]);
  equal(navigationCore.isFinished(firstRuntime, sourceRelease), false);
  equal(navigationCore.getCurrentMission(secondRuntime, sourceRelease), sourceRelease.missions[1]);
  equal(navigationCore.hasNextMission(secondRuntime, sourceRelease), false);
  equal(navigationCore.getNextMission(secondRuntime, sourceRelease), null);
  equal(navigationCore.isFinished(secondRuntime, sourceRelease), true);
});

test('06 rechaza Runtime y Release incoherentes en releaseId indice o missionId', () => {
  const sourceRelease = release();

  const wrongRelease = runtime(sourceRelease, session());
  wrongRelease.session.releaseId = 'other-release';
  assertThrows(
    () => navigationCore.createNavigation(wrongRelease, sourceRelease),
    'Runtime no pertenece al Campaign Release recibido'
  );

  const wrongIndex = runtime(sourceRelease, session());
  wrongIndex.session.currentMissionIndex = 1;
  assertThrows(
    () => navigationCore.createNavigation(wrongIndex, sourceRelease),
    'Runtime y Campaign Release no son coherentes en la misión actual'
  );

  const wrongMission = runtime(sourceRelease, session());
  wrongMission.mission.id = 'ice';
  assertThrows(
    () => navigationCore.createNavigation(wrongMission, sourceRelease),
    'Runtime y Campaign Release no son coherentes en la misión actual'
  );
});

test('07 conserva los contratos clasicos de composicion sin efectos de plataforma', () => {
  const source = readFileSync(new URL('../js/navigation/navigation-core.js', import.meta.url), 'utf8');
  assert(source.includes('window.__CRIOS_REGISTER_DOMAIN_MODULE__'));
  assert(source.includes('window.CRIOS_DOMAIN'));

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

test('08 conserva las dependencias de composicion aunque CRIOS_DOMAIN se reemplace despues del registro', () => {
  const sourceRelease = release();
  const sourceRuntime = runtime(sourceRelease, session());
  const sourceNavigation = navigationCore.createNavigation(sourceRuntime, sourceRelease);
  const originals = {
    releaseValidator: loaded.domain.releaseValidator,
    runtimeCore: loaded.domain.runtimeCore,
    releaseModel: loaded.domain.releaseModel
  };

  try {
    loaded.domain.releaseValidator = {
      validateReleaseStructure() {
        throw new Error('late release validator replacement');
      }
    };
    loaded.domain.runtimeCore = {
      validateRuntime() {
        throw new Error('late runtime validator replacement');
      }
    };
    loaded.domain.releaseModel = {
      deepFreeze() {
        throw new Error('late release model replacement');
      }
    };

    sameValue(
      navigationCore.createNavigation(sourceRuntime, sourceRelease),
      sourceNavigation
    );
    equal(navigationCore.getCurrentMission(sourceRuntime, sourceRelease), sourceRelease.missions[0]);
    equal(navigationCore.hasNextMission(sourceRuntime, sourceRelease), true);
    equal(navigationCore.getNextMission(sourceRuntime, sourceRelease), sourceRelease.missions[1]);
    equal(navigationCore.isFinished(sourceRuntime, sourceRelease), false);
  } finally {
    loaded.domain.releaseValidator = originals.releaseValidator;
    loaded.domain.runtimeCore = originals.runtimeCore;
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