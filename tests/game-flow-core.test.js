/* CRIOS A2-011 - Game Flow pure core focal tests */
import { executeGameFlow } from '../js/game-flow/game-flow-core.js';
import { createPlayerStateResult } from '../js/player-state/player-state-result-model.js';
import { createRuntimeResult } from '../js/runtime/runtime-result-model.js';

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
  equal(Object.keys(actual).sort().join(','), expected.slice().sort().join(','));
}

function assertDomainArguments(args, command) {
  equal(args.evaluation, command.evaluation);
  equal(args.session, command.session);
  equal(args.mission, command.mission);
  equal(args.campaign, command.campaign);
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
      }
    },
    mission: {
      id: 'mission'
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
    playerState: createPlayerStateResult({ status: 'running', lives: 2 }),
    progress: { status: 'UPDATED', campaignCompleted: false, progress: { mission: 2 } },
    runtime: createRuntimeResult(createRuntimeSnapshot()),
    navigation: { status: 'RESOLVED', action: 'OPEN_MISSION', target: 'next' }
  }, overrides.values || {});
  const ports = {
    playerState: {
      applyEvaluation(args) {
        calls.push({ port: 'playerState', args });
        return values.playerState;
      }
    },
    progress: {
      update(args) {
        calls.push({ port: 'progress', args });
        return values.progress;
      }
    },
    runtime: {
      rebuild(args) {
        calls.push({ port: 'runtime', args });
        return values.runtime;
      }
    },
    navigation: {
      resolve(args) {
        calls.push({ port: 'navigation', args });
        return values.navigation;
      }
    }
  };
  const methods = {
    playerState: 'applyEvaluation',
    progress: 'update',
    runtime: 'rebuild',
    navigation: 'resolve'
  };

  Object.keys(overrides.throwAt || {}).forEach(port => {
    ports[port][methods[port]] = function (args) {
      calls.push({ port, args });
      throw overrides.throwAt[port];
    };
  });

  return { calls, values, ports };
}

function assertLaterStagesNull(result, stage) {
  const stages = ['playerState', 'progress', 'runtime', 'navigation'];
  const start = stages.indexOf(stage);
  stages.slice(start).forEach(name => equal(result[name], null, `${name} must be null`));
}

test('01 flujo completo devuelve resultado declarativo', () => {
  const setup = createSetup();
  const result = executeGameFlow(createCommand(), setup.ports);
  equal(result.status, 'FLOW_COMPLETED');
  equal(result.success, true);
  equal(result.stage, 'COMPLETED');
  equal(result.action, setup.values.navigation.action);
  equal(result.target, setup.values.navigation.target);
  equal(result.navigation, setup.values.navigation);
});

test('02 conserva el orden exacto de llamadas', () => {
  const setup = createSetup();
  executeGameFlow(createCommand(), setup.ports);
  equal(setup.calls.map(call => call.port).join(','), 'playerState,progress,runtime,navigation');
});

test('03 ejecuta cada puerto exactamente una vez', () => {
  const setup = createSetup();
  executeGameFlow(createCommand(), setup.ports);
  ['playerState', 'progress', 'runtime', 'navigation'].forEach(port => {
    equal(setup.calls.filter(call => call.port === port).length, 1);
  });
});

test('04 construye argumentos explícitos y exactos para cada puerto', () => {
  const command = createCommand();
  const setup = createSetup();
  executeGameFlow(command, setup.ports);

  const playerStateArgs = setup.calls[0].args;
  sameKeys(playerStateArgs, ['evaluation', 'session', 'mission', 'campaign']);
  assertDomainArguments(playerStateArgs, command);

  const progressArgs = setup.calls[1].args;
  sameKeys(progressArgs, ['evaluation', 'playerState', 'session', 'mission', 'campaign']);
  assertDomainArguments(progressArgs, command);
  equal(progressArgs.playerState, setup.values.playerState);

  const runtimeArgs = setup.calls[2].args;
  sameKeys(runtimeArgs, ['evaluation', 'playerState', 'progress', 'session', 'mission', 'campaign']);
  assertDomainArguments(runtimeArgs, command);
  equal(runtimeArgs.playerState, setup.values.playerState);
  equal(runtimeArgs.progress, setup.values.progress);

  const navigationArgs = setup.calls[3].args;
  sameKeys(navigationArgs, ['evaluation', 'playerState', 'progress', 'runtime', 'session', 'mission', 'campaign']);
  assertDomainArguments(navigationArgs, command);
  equal(navigationArgs.playerState, setup.values.playerState);
  equal(navigationArgs.progress, setup.values.progress);
  equal(navigationArgs.runtime, setup.values.runtime);
  setup.calls.forEach(call => assert(call.args !== setup.ports));
});

test('05 rechaza command inválido sin ejecutar puertos', () => {
  const setup = createSetup();
  [null, [], {}, { evaluation: {}, session: {}, mission: {}, campaign: [] }].forEach(command => {
    const result = executeGameFlow(command, setup.ports);
    equal(result.status, 'INVALID_COMMAND');
    equal(result.stage, 'VALIDATION');
  });
  equal(setup.calls.length, 0);
});

test('06 rechaza evaluation inválido sin recalcularlo', () => {
  const invalidEvaluations = [
    {},
    { status: '', success: true, score: 1, completed: true },
    { status: 'EVALUATED', success: 1, score: 1, completed: true },
    { status: 'EVALUATED', success: true, score: Infinity, completed: true },
    { status: 'EVALUATED', success: true, score: 1, completed: 'yes' }
  ];
  invalidEvaluations.forEach(evaluation => {
    const command = createCommand();
    const setup = createSetup();
    command.evaluation = evaluation;
    equal(executeGameFlow(command, setup.ports).status, 'INVALID_COMMAND');
    equal(setup.calls.length, 0);
  });
});

test('07 rechaza ports inválidos sin ejecutar puertos', () => {
  const setup = createSetup();
  const invalidPorts = [null, [], {}, Object.assign({}, setup.ports, { runtime: { rebuild: true } })];
  invalidPorts.forEach(ports => equal(executeGameFlow(createCommand(), ports).status, 'INVALID_PORTS'));
  equal(setup.calls.length, 0);
});

test('08 rechaza PlayerState inválido y corta etapas posteriores', () => {
  const invalidValues = [
    { status: 'PLAYER_STATE_APPLIED', state: { status: 'running', lives: 0 } },
    { status: 'PLAYER_STATE_APPLIED', gameOver: false, state: { status: 'running', lives: 2 } }
  ];

  invalidValues.forEach(playerState => {
    const setup = createSetup({ values: { playerState } });
    const result = executeGameFlow(createCommand(), setup.ports);
    equal(result.status, 'INVALID_PLAYER_STATE_RESULT');
    equal(setup.calls.length, 1);
    assertLaterStagesNull(result, 'playerState');
  });
});

test('09 GAME_OVER se deriva del snapshot y corta las tres etapas posteriores', () => {
  const setup = createSetup({
    values: { playerState: createPlayerStateResult({ status: 'gameOver', lives: 0 }) }
  });
  const result = executeGameFlow(createCommand(), setup.ports);
  equal(result.status, 'GAME_OVER');
  equal(result.success, false);
  equal(result.stage, 'PLAYER_STATE');
  equal(result.action, 'GAME_OVER');
  equal(result.playerState, setup.values.playerState);
  sameKeys(result.playerState, ['status', 'state']);
  sameKeys(result.playerState.state, ['status', 'lives']);
  equal(result.playerState.state.status, 'gameOver');
  equal(result.playerState.state.lives, 0);
  assert(!Object.prototype.hasOwnProperty.call(result.playerState, 'gameOver'));
  equal(setup.calls.length, 1);
  assertLaterStagesNull(result, 'progress');
});

test('10 rechaza Progress inválido y corta etapas posteriores', () => {
  const setup = createSetup({ values: { progress: { status: 'UPDATED', campaignCompleted: false, progress: [] } } });
  const result = executeGameFlow(createCommand(), setup.ports);
  equal(result.status, 'INVALID_PROGRESS_RESULT');
  equal(setup.calls.length, 2);
  equal(result.playerState, setup.values.playerState);
  assertLaterStagesNull(result, 'progress');
});

test('11 CAMPAIGN_COMPLETED corta Runtime y Navigation', () => {
  const setup = createSetup({ values: { progress: { status: 'UPDATED', campaignCompleted: true, progress: {} } } });
  const result = executeGameFlow(createCommand(), setup.ports);
  equal(result.status, 'CAMPAIGN_COMPLETED');
  equal(result.success, true);
  equal(result.stage, 'PROGRESS');
  equal(result.action, 'CAMPAIGN_COMPLETED');
  equal(result.progress, setup.values.progress);
  equal(setup.calls.length, 2);
  assertLaterStagesNull(result, 'runtime');
});

test('12 rechaza RuntimeResult inválido y no ejecuta Navigation', () => {
  const invalidRuntime = {
    status: 'RUNTIME_REBUILT',
    runtime: createRuntimeSnapshot()
  };
  invalidRuntime.runtime.mission.id = 'other-mission';
  const setup = createSetup({ values: { runtime: invalidRuntime } });
  const result = executeGameFlow(createCommand(), setup.ports);
  equal(result.status, 'INVALID_RUNTIME_RESULT');
  equal(setup.calls.length, 3);
  equal(result.progress, setup.values.progress);
  assertLaterStagesNull(result, 'runtime');
});

test('13 rechaza Navigation inválido declarativamente', () => {
  const setup = createSetup({ values: { navigation: { status: 'RESOLVED', action: 'OPEN_MISSION', target: undefined } } });
  const result = executeGameFlow(createCommand(), setup.ports);
  equal(result.status, 'INVALID_NAVIGATION_RESULT');
  equal(setup.calls.length, 4);
  equal(result.runtime, setup.values.runtime);
  equal(result.navigation, null);
});

[
  { port: 'playerState', stage: 'PLAYER_STATE', preserved: null, absent: 'playerState' },
  { port: 'progress', stage: 'PROGRESS', preserved: 'playerState', absent: 'progress' },
  { port: 'runtime', stage: 'RUNTIME', preserved: 'progress', absent: 'runtime' },
  { port: 'navigation', stage: 'NAVIGATION', preserved: 'runtime', absent: 'navigation' }
].forEach((scenario, index) => {
  test(`${14 + index} convierte excepción de ${scenario.port} en PORT_FAILURE`, () => {
    const setup = createSetup({ throwAt: { [scenario.port]: new Error(`${scenario.port} failed`) } });
    const result = executeGameFlow(createCommand(), setup.ports);
    equal(result.status, 'PORT_FAILURE');
    equal(result.success, false);
    equal(result.stage, scenario.stage);
    equal(result.error, `${scenario.port} failed`);
    assert(typeof result.error === 'string');
    if (scenario.preserved) equal(result[scenario.preserved], setup.values[scenario.preserved]);
    assertLaterStagesNull(result, scenario.absent);
  });
});

test('18 congela todos los resultados públicos y conserva su forma exacta', () => {
  const results = [
    executeGameFlow(null, null),
    executeGameFlow(createCommand(), createSetup().ports)
  ];
  results.forEach(result => {
    assert(Object.isFrozen(result));
    sameKeys(result, [
      'status', 'success', 'action', 'target', 'stage', 'error', 'evaluation',
      'playerState', 'progress', 'runtime', 'navigation'
    ]);
  });
});

test('19 no muta command', () => {
  const command = createCommand();
  const before = JSON.stringify(command);
  executeGameFlow(command, createSetup().ports);
  equal(JSON.stringify(command), before);
  assert(!Object.isFrozen(command));
});

test('20 no muta evaluation ni objetos de dominio', () => {
  const command = createCommand();
  const references = [command.evaluation, command.session, command.mission, command.campaign];
  const before = references.map(value => JSON.stringify(value));
  executeGameFlow(command, createSetup().ports);
  references.forEach((value, index) => {
    equal(JSON.stringify(value), before[index]);
    assert(!Object.isFrozen(value));
  });
});

test('21 no muta ni altera el estado de congelamiento de resultados de puertos', () => {
  const setup = createSetup();
  const before = JSON.stringify(setup.values);
  const frozenBefore = Object.fromEntries(
    Object.keys(setup.values).map(name => [name, Object.isFrozen(setup.values[name])])
  );
  executeGameFlow(createCommand(), setup.ports);
  equal(JSON.stringify(setup.values), before);
  Object.keys(setup.values).forEach(name => {
    equal(Object.isFrozen(setup.values[name]), frozenBefore[name]);
  });
});

test('22 mantiene en null todas las etapas no ejecutadas', () => {
  const setup = createSetup();
  const invalidCommand = executeGameFlow(null, setup.ports);
  equal(invalidCommand.evaluation, null);
  assertLaterStagesNull(invalidCommand, 'playerState');

  const invalidPorts = executeGameFlow(createCommand(), {});
  assert(invalidPorts.evaluation !== null);
  assertLaterStagesNull(invalidPorts, 'playerState');
});

test('23 conserva el RuntimeResult canónico exacto', () => {
  const setup = createSetup();
  const result = executeGameFlow(createCommand(), setup.ports);
  equal(result.runtime, setup.values.runtime);
  equal(result.runtime.status, 'RUNTIME_REBUILT');
  sameKeys(result.runtime, ['status', 'runtime']);
  sameKeys(result.runtime.runtime, ['session', 'mission', 'state']);
  assert(Object.isFrozen(result.runtime));
  assert(Object.isFrozen(result.runtime.runtime));
  assert(Object.isFrozen(result.runtime.runtime.session));
  assert(Object.isFrozen(result.runtime.runtime.mission));
  assert(Object.isFrozen(result.runtime.runtime.state));
});

test('24 rechaza RuntimeResult con claves adicionales o status no canónico', () => {
  const extraWrapper = {
    ...createRuntimeResult(createRuntimeSnapshot()),
    detail: true
  };
  const extraRuntime = createRuntimeSnapshot();
  extraRuntime.detail = true;
  const extraState = createRuntimeSnapshot();
  extraState.state.detail = true;
  const invalidValues = [
    extraWrapper,
    { status: 'REBUILT', runtime: createRuntimeSnapshot() },
    { status: 'RUNTIME_REBUILT', runtime: extraRuntime },
    { status: 'RUNTIME_REBUILT', runtime: extraState }
  ];

  invalidValues.forEach(runtime => {
    const setup = createSetup({ values: { runtime } });
    const result = executeGameFlow(createCommand(), setup.ports);
    equal(result.status, 'INVALID_RUNTIME_RESULT');
    equal(setup.calls.length, 3);
    equal(result.navigation, null);
  });
});

test('25 Navigation recibe exactamente el RuntimeResult validado', () => {
  const setup = createSetup();
  const result = executeGameFlow(createCommand(), setup.ports);
  const navigationCall = setup.calls.find(call => call.port === 'navigation');
  equal(navigationCall.args.runtime, setup.values.runtime);
  equal(navigationCall.args.runtime, result.runtime);
  assert(Object.isFrozen(navigationCall.args.runtime));
});

const source = executeGameFlow.toString();
const runtimeBoundaries = [
  'doc' + 'ument', 'win' + 'dow', 'local' + 'Storage', 'session' + 'Storage',
  'fet' + 'ch', 'XMLHttp' + 'Request', 'Web' + 'Socket', 'set' + 'Timeout',
  'set' + 'Interval', 'Au' + 'dio', 'Audio' + 'Context', 'loca' + 'tion'
];

test('26 no accede a DOM, storage, red, audio ni timers', () => {
  runtimeBoundaries.forEach(name => assert(!source.includes(name)));
});

test('27 no obtiene dependencias mediante globals', () => {
  assert(!source.includes('global' + 'This'));
  assert(!source.includes('CRIOS_' + 'DOMAIN'));
  assert(!source.includes('__CRIOS_' + 'REGISTER_DOMAIN_MODULE__'));
});

test('28 no importa ni conecta Game Flow con crios.js', () => {
  assert(!source.includes('crios' + '.js'));
  assert(!source.includes('REGISTRO_' + 'MISIONES'));
});

export { cases as gameFlowCoreTests };