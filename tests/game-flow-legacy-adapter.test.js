/* CRIOS A2-011 - Game Flow legacy adapter focal tests */
import { createLegacyGameFlowAdapter } from '../js/game-flow/game-flow-legacy-adapter.js';
import {
  isPlayerStateResultModel,
  isGameOverPlayerStateResult
} from '../js/player-state/player-state-result-model.js';
import { isRuntimeResultModel } from '../js/runtime/runtime-result-model.js';

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
  equal(Object.keys(actual).sort().join(','), expected.slice().sort().join(','));
}

function assertDeepFrozen(value) {
  if (value === null || typeof value !== 'object') return;
  assert(Object.isFrozen(value));
  Object.keys(value).forEach(key => assertDeepFrozen(value[key]));
}

function createCommand() {
  return {
    evaluation: { status: 'EVALUATED', success: true, score: 10, completed: true },
    session: { id: 'session' },
    mission: { id: 'mission' },
    campaign: { id: 'campaign' }
  };
}

function createRuntimeSnapshot() {
  return {
    session: {
      releaseId: 'campaign',
      currentMissionIndex: 0,
      progress: {
        currentMissionId: 'mission',
        completedMissionIds: []
      },
      detail: {
        preserved: true
      }
    },
    mission: {
      id: 'mission',
      detail: {
        preserved: true
      }
    },
    state: {
      status: 'initialized',
      errors: []
    }
  };
}

function createSetup(overrides = {}) {
  const calls = [];
  const values = Object.assign({
    state: { status: 'running', lives: 2, sessionId: 'session-state' },
    progressResult: { progress: { mission: 2 }, campaignCompleted: false },
    runtime: createRuntimeSnapshot(),
    navigation: { action: 'OPEN_MISSION', target: 'next' }
  }, overrides.values || {});
  const dependencies = {
    applyPlayerEvaluation(args) {
      calls.push({ dependency: 'applyPlayerEvaluation', args });
      return values.state;
    },
    updateProgress(args) {
      calls.push({ dependency: 'updateProgress', args });
      return values.progressResult;
    },
    rebuildRuntime(args) {
      calls.push({ dependency: 'rebuildRuntime', args });
      return values.runtime;
    },
    resolveNavigation(args) {
      calls.push({ dependency: 'resolveNavigation', args });
      return values.navigation;
    }
  };

  Object.keys(overrides.throwAt || {}).forEach(name => {
    dependencies[name] = function (args) {
      calls.push({ dependency: name, args });
      throw overrides.throwAt[name];
    };
  });

  return { calls, values, dependencies };
}

function assertDomainArguments(args, command) {
  equal(args.evaluation, command.evaluation);
  equal(args.session, command.session);
  equal(args.mission, command.mission);
  equal(args.campaign, command.campaign);
}

test('01 crea una fábrica válida', () => {
  const adapter = createLegacyGameFlowAdapter(createSetup().dependencies);
  equal(typeof adapter.execute, 'function');
  sameKeys(adapter, ['execute']);
});

test('02 rechaza dependencias inválidas', () => {
  const setup = createSetup();
  const invalid = [
    null,
    [],
    {},
    Object.assign({}, setup.dependencies, { updateProgress: true })
  ];

  invalid.forEach(dependencies => {
    let error = null;
    try {
      createLegacyGameFlowAdapter(dependencies);
    } catch (caught) {
      error = caught;
    }
    assert(error instanceof TypeError);
  });
});

test('03 adapta el flujo completo con snapshots inmutables de PlayerState y Runtime', () => {
  const setup = createSetup();
  const result = createLegacyGameFlowAdapter(setup.dependencies).execute(createCommand());
  equal(result.status, 'FLOW_COMPLETED');
  assert(isPlayerStateResultModel(result.playerState));
  sameKeys(result.playerState, ['status', 'state']);
  sameKeys(result.playerState.state, ['status', 'lives']);
  equal(result.playerState.state.status, 'running');
  equal(result.playerState.state.lives, 2);
  assert(result.playerState.state !== setup.values.state);
  assert(Object.isFrozen(result.playerState));
  assert(Object.isFrozen(result.playerState.state));
  assert(!Object.prototype.hasOwnProperty.call(result.playerState, 'gameOver'));
  equal(result.progress.status, 'PROGRESS_UPDATED');
  equal(result.progress.progress, setup.values.progressResult.progress);
  assert(isRuntimeResultModel(result.runtime));
  sameKeys(result.runtime, ['status', 'runtime']);
  sameValue(result.runtime.runtime, setup.values.runtime);
  assert(result.runtime.runtime !== setup.values.runtime);
  assertDeepFrozen(result.runtime);
  equal(result.navigation.status, 'NAVIGATION_RESOLVED');
});

test('04 pasa argumentos exactos a cada dependencia', () => {
  const command = createCommand();
  const setup = createSetup();
  createLegacyGameFlowAdapter(setup.dependencies).execute(command);

  const playerStateArgs = setup.calls[0].args;
  sameKeys(playerStateArgs, ['evaluation', 'session', 'mission', 'campaign']);
  assertDomainArguments(playerStateArgs, command);

  const progressArgs = setup.calls[1].args;
  sameKeys(progressArgs, ['evaluation', 'playerState', 'session', 'mission', 'campaign']);
  assertDomainArguments(progressArgs, command);
  equal(progressArgs.playerState.state.status, setup.values.state.status);
  equal(progressArgs.playerState.state.lives, setup.values.state.lives);
  assert(progressArgs.playerState.state !== setup.values.state);

  const runtimeArgs = setup.calls[2].args;
  sameKeys(runtimeArgs, ['evaluation', 'playerState', 'progress', 'session', 'mission', 'campaign']);
  assertDomainArguments(runtimeArgs, command);
  equal(runtimeArgs.progress.progress, setup.values.progressResult.progress);

  const navigationArgs = setup.calls[3].args;
  sameKeys(navigationArgs, ['evaluation', 'playerState', 'progress', 'runtime', 'session', 'mission', 'campaign']);
  assertDomainArguments(navigationArgs, command);
  assert(isRuntimeResultModel(navigationArgs.runtime));
  sameValue(navigationArgs.runtime.runtime, setup.values.runtime);
  assert(navigationArgs.runtime.runtime !== setup.values.runtime);
  assertDeepFrozen(navigationArgs.runtime);
});

test('05 conserva el orden de las dependencias', () => {
  const setup = createSetup();
  createLegacyGameFlowAdapter(setup.dependencies).execute(createCommand());
  equal(
    setup.calls.map(call => call.dependency).join(','),
    'applyPlayerEvaluation,updateProgress,rebuildRuntime,resolveNavigation'
  );
});

test('06 GAME_OVER usa evidencia inmutable y detiene dependencias posteriores', () => {
  const setup = createSetup({
    values: { state: { status: 'gameOver', lives: 0, sessionId: 'session-state' } }
  });
  const sourceState = setup.values.state;
  const result = createLegacyGameFlowAdapter(setup.dependencies).execute(createCommand());
  equal(result.status, 'GAME_OVER');
  assert(isGameOverPlayerStateResult(result.playerState));
  assert(!Object.prototype.hasOwnProperty.call(result.playerState, 'gameOver'));
  assert(result.playerState.state !== sourceState);
  equal(setup.calls.length, 1);

  sourceState.status = 'running';
  sourceState.lives = 3;
  equal(result.playerState.state.status, 'gameOver');
  equal(result.playerState.state.lives, 0);
});

test('07 CAMPAIGN_COMPLETED detiene Runtime y Navigation', () => {
  const setup = createSetup({
    values: { progressResult: { progress: { mission: 3 }, campaignCompleted: true } }
  });
  const result = createLegacyGameFlowAdapter(setup.dependencies).execute(createCommand());
  equal(result.status, 'CAMPAIGN_COMPLETED');
  equal(result.progress.campaignCompleted, true);
  equal(setup.calls.length, 2);
});

[
  { dependency: 'applyPlayerEvaluation', stage: 'PLAYER_STATE', callCount: 1 },
  { dependency: 'updateProgress', stage: 'PROGRESS', callCount: 2 },
  { dependency: 'rebuildRuntime', stage: 'RUNTIME', callCount: 3 },
  { dependency: 'resolveNavigation', stage: 'NAVIGATION', callCount: 4 }
].forEach((scenario, index) => {
  test(`${8 + index} convierte excepción de ${scenario.dependency} en PORT_FAILURE`, () => {
    const setup = createSetup({
      throwAt: { [scenario.dependency]: new Error(`${scenario.dependency} failed`) }
    });
    const result = createLegacyGameFlowAdapter(setup.dependencies).execute(createCommand());
    equal(result.status, 'PORT_FAILURE');
    equal(result.stage, scenario.stage);
    equal(result.error, `${scenario.dependency} failed`);
    equal(setup.calls.length, scenario.callCount);
  });
});

test('12 convierte un estado incoherente de PlayerState en PORT_FAILURE', () => {
  const setup = createSetup({ values: { state: { status: 'running', lives: 0 } } });
  const result = createLegacyGameFlowAdapter(setup.dependencies).execute(createCommand());
  equal(result.status, 'PORT_FAILURE');
  equal(result.stage, 'PLAYER_STATE');
  equal(result.error, 'session must contain a coherent PlayerState snapshot.');
  equal(setup.calls.length, 1);
});

test('13 convierte un Runtime incoherente en PORT_FAILURE', () => {
  const invalidRuntime = createRuntimeSnapshot();
  invalidRuntime.mission.id = 'other-mission';
  const setup = createSetup({ values: { runtime: invalidRuntime } });
  const result = createLegacyGameFlowAdapter(setup.dependencies).execute(createCommand());
  equal(result.status, 'PORT_FAILURE');
  equal(result.stage, 'RUNTIME');
  equal(result.error, 'runtime must be a coherent Runtime snapshot.');
  equal(setup.calls.length, 3);
});

test('14 el snapshot Runtime no cambia si la dependencia muta despues', () => {
  const setup = createSetup();
  const sourceRuntime = setup.values.runtime;
  const result = createLegacyGameFlowAdapter(setup.dependencies).execute(createCommand());
  const navigationRuntime = setup.calls[3].args.runtime;
  sourceRuntime.session.progress.currentMissionId = 'changed';
  sourceRuntime.mission.id = 'changed';
  sourceRuntime.state.status = 'error';
  sourceRuntime.state.errors.push('late');
  equal(result.runtime.runtime.session.progress.currentMissionId, 'mission');
  equal(result.runtime.runtime.mission.id, 'mission');
  sameValue(result.runtime.runtime.state, { status: 'initialized', errors: [] });
  equal(navigationRuntime, result.runtime);
});

test('15 admite navegación con target null', () => {
  const setup = createSetup({ values: { navigation: { action: 'STAY', target: null } } });
  const result = createLegacyGameFlowAdapter(setup.dependencies).execute(createCommand());
  equal(result.status, 'FLOW_COMPLETED');
  equal(result.action, 'STAY');
  equal(result.target, null);
});

test('16 no muta command ni objetos recibidos', () => {
  const command = createCommand();
  const setup = createSetup();
  const beforeCommand = JSON.stringify(command);
  const beforeValues = JSON.stringify(setup.values);
  createLegacyGameFlowAdapter(setup.dependencies).execute(command);
  equal(JSON.stringify(command), beforeCommand);
  equal(JSON.stringify(setup.values), beforeValues);
  assert(!Object.isFrozen(command));
  assert(!Object.isFrozen(setup.values.state));
  assert(!Object.isFrozen(setup.values.runtime));
  assert(!Object.isFrozen(setup.values.runtime.session));
});

test('17 devuelve el adapter congelado', () => {
  const adapter = createLegacyGameFlowAdapter(createSetup().dependencies);
  assert(Object.isFrozen(adapter));
});

test('18 construye el RuntimeResult una sola vez', () => {
  const setup = createSetup();
  const result = createLegacyGameFlowAdapter(setup.dependencies).execute(createCommand());
  equal(setup.calls.filter(call => call.dependency === 'rebuildRuntime').length, 1);
  equal(setup.calls.filter(call => call.dependency === 'resolveNavigation').length, 1);
  equal(setup.calls[3].args.runtime, result.runtime);
});

test('19 no accede a fronteras prohibidas', () => {
  const source = createLegacyGameFlowAdapter.toString();
  const forbidden = [
    'win' + 'dow', 'doc' + 'ument', 'global' + 'This', 'local' + 'Storage',
    'session' + 'Storage', 'fet' + 'ch', 'XMLHttp' + 'Request', 'Web' + 'Socket',
    'set' + 'Timeout', 'set' + 'Interval', 'Au' + 'dio', 'Audio' + 'Context',
    'loca' + 'tion', 'REGISTRO_' + 'MISIONES', 'CRIOS_' + 'DOMAIN'
  ];
  forbidden.forEach(name => assert(!source.includes(name)));
});

export { cases as gameFlowLegacyAdapterTests };
