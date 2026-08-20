'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = process.argv[2] || path.resolve(__dirname, '..');
const relative = 'js/runtime/live-room/runtime-live-room-player.js';
const sourcePath = path.join(root, relative);
const source = fs.readFileSync(sourcePath, 'utf8');
let total = 0;
let failed = 0;

function ok(condition, label) {
  total += 1;
  if (!condition) {
    failed += 1;
    console.error('FAIL ' + label);
  }
}

function eq(actual, expected, label) {
  ok(JSON.stringify(actual) === JSON.stringify(expected), label +
    ' expected=' + JSON.stringify(expected) + ' actual=' + JSON.stringify(actual));
}

function storage() {
  let value = null;
  return {
    available: () => true,
    get: () => value,
    set(next) { value = JSON.parse(JSON.stringify(next)); return true; },
    clear() { value = null; return true; }
  };
}

function room() {
  return {
    roomId: 'room-1',
    campaignId: 'campaign-1',
    publicationId: 'publication-1',
    createdAt: '2026-08-18T12:00:00.000Z',
    lastActivityAt: '2026-08-18T12:00:00.000Z',
    expiresAt: '2026-08-18T12:10:00.000Z',
    status: 'active'
  };
}

function presence(participantId) {
  return {
    roomId: 'room-1',
    participantId,
    role: 'player',
    joinedAt: '2026-08-18T12:00:00.000Z',
    lastSeenAt: '2026-08-18T12:00:00.000Z'
  };
}

function success(data) { return {success: true, requestId: 'request', data, error: null}; }
function failure(code) { return {success: false, requestId: 'request', data: null, error: {code, message: code, retryable: false}}; }

const documentStub = {
  readyState: 'loading',
  visibilityState: 'visible',
  addEventListener() {},
  getElementById() { return null; },
  createElement() { throw new Error('not used'); },
  body: {appendChild() {}}
};
const windowStub = {
  document: documentStub,
  location: {search: ''},
  setInterval: () => 1,
  clearInterval() {},
  crypto: {randomUUID: () => 'uuid'}
};
windowStub.window = windowStub;
const context = {
  window: windowStub,
  document: documentStub,
  URLSearchParams,
  URL,
  Uint8Array,
  Object,
  Array,
  String,
  Number,
  Boolean,
  Date,
  JSON,
  Math,
  Promise,
  console,
  setInterval: windowStub.setInterval,
  clearInterval: windowStub.clearInterval
};
vm.createContext(context);
vm.runInContext(source, context, {filename: sourcePath});
const api = windowStub.CRIOS_RUNTIME_LIVE_ROOM_PLAYER;

(async () => {
  const calls = [];
  const siblingContexts = [];
  const coordinatorOptions = [];
  const projected = [];
  const realtimeSignals = [];
  const realtimeSubscriptions = [];
  const realtimeUnsubscriptions = [];
  const realtimeCallbacks = [];
  const reconciliationOptions = [];
  const reconciliationSchedulers = [];
  const reconciliationCalls = [];
  let realtimeDestroyCount = 0;
  let missionOrder = [];
  let heartbeatResult = success({room: room()});
  const stateClient = Object.freeze({available: () => true});
  const coordinator = {
    available: () => true,
    start() { calls.push(['coordinator-start']); return Promise.resolve({status: 'READY'}); },
    refresh() { calls.push(['coordinator-refresh']); return Promise.resolve({status: 'READY'}); },
    recordCommittedMission(missionId) { calls.push(['coordinator-record', missionId]); return {accepted: true, queued: true, requestId: 'outbox-1', error: null}; },
    discard() { calls.push(['coordinator-discard']); coordinatorOptions[coordinatorOptions.length - 1].onGameStateChange(null); return true; },
    destroy() { calls.push(['coordinator-destroy']); }
  };
  const coordinatorFactory = {
    createCoordinator(options) {
      coordinatorOptions.push(options);
      return coordinator;
    }
  };
  const realtimeTransport = {
    subscribeRoom(roomId, callback) {
      realtimeSubscriptions.push(roomId);
      realtimeCallbacks.push(callback);
      return true;
    },
    unsubscribeRoom(roomId) { realtimeUnsubscriptions.push(roomId); return true; },
    publishSignal(roomId, signal) { realtimeSignals.push({roomId, signal: JSON.parse(JSON.stringify(signal))}); return true; },
    destroy() { realtimeDestroyCount += 1; }
  };
  const reconciliationFactory = {
    createScheduler(options) {
      const index = reconciliationOptions.length;
      reconciliationOptions.push(options);
      const scheduler = {
        available: () => true,
        start() { reconciliationCalls.push(['start', index]); return {status: 'READY'}; },
        request(reason) { reconciliationCalls.push(['request', index, reason]); return true; },
        setVisible(visible) { reconciliationCalls.push(['visible', index, visible]); return {visible}; },
        stop() { reconciliationCalls.push(['stop', index]); return {status: 'STOPPED'}; }
      };
      reconciliationSchedulers.push(scheduler);
      return scheduler;
    }
  };
  const lifecycleClient = {
    available: () => true,
    async getLiveRoom(roomId) { calls.push(['get', roomId]); return success({room: room()}); },
    async joinLiveRoom(roomId, participantId) { calls.push(['join', roomId, participantId]); return success({room: room(), presence: presence(participantId)}); },
    async heartbeatLiveRoom(roomId, participantId) { calls.push(['heartbeat', roomId, participantId]); return heartbeatResult; },
    createGameStateClient(value) { siblingContexts.push(value); return stateClient; },
    forgetCapability() { return true; }
  };
  const gameStateStorage = {marker: 'outbox-storage'};
  const controller = api.createPlayerController({
    client: lifecycleClient,
    storage: storage(),
    participantIdFactory: () => 'player-1',
    setIntervalImpl: () => 1,
    clearIntervalImpl: () => {},
    realtimeTransportFactory: () => realtimeTransport,
    realtimeEventIdFactory: (signalType) => 'evt-' + signalType,
    now: () => 1000,
    missionOrderProvider: () => missionOrder,
    gameStateCoordinatorFactory: coordinatorFactory,
    gameStateReconciliationFactory: reconciliationFactory,
    gameStateStorage,
    onGameStateChange: (state) => projected.push(state)
  });

  const launch = api.parseRoomLaunch('?roomId=room-1', {
    blocked: false,
    sourceMode: 'published',
    campaignId: 'campaign-1',
    publicationId: 'publication-1'
  });
  let state = await controller.start(launch);
  eq(state.status, 'ACTIVE', 'player becomes active');
  eq(realtimeSubscriptions, ['room-1'], 'active player subscribes to its room once');
  eq(realtimeSignals, [{roomId:'room-1',signal:{type:'presence-change',eventId:'evt-presence-change',emittedAt:'1970-01-01T00:00:01.000Z'}}], 'join emits exact minimal presence signal');
  eq(api.realtimeSignalType, 'presence-change', 'legacy presence signal type remains explicit');
  eq(api.gameStateRealtimeSignalType, 'game-state-change', 'game-state signal type is explicit');
  eq(siblingContexts.length, 0, 'empty missionOrder defers state client creation');
  eq(coordinatorOptions.length, 0, 'empty missionOrder defers coordinator creation');
  ok(typeof controller.synchronizeGameState === 'function', 'controller exposes synchronize method');
  ok(typeof controller.refreshGameState === 'function', 'controller exposes refresh method');
  ok(typeof controller.setGameStateVisibility === 'function', 'controller exposes visibility method');
  ok(typeof controller.recordCommittedMission === 'function', 'controller exposes post-commit method');

  missionOrder = ['energy', 'greenhouse'];
  await controller.synchronizeGameState();
  eq(siblingContexts.length, 1, 'prepared missionOrder creates one sibling client');
  eq(siblingContexts[0], {
    roomId: 'room-1',
    campaignId: 'campaign-1',
    publicationId: 'publication-1',
    participantId: 'player-1',
    missionOrder: ['energy', 'greenhouse']
  }, 'sibling context exact');
  ok(!Object.prototype.hasOwnProperty.call(siblingContexts[0], 'capabilityToken'), 'sibling context contains no capability');
  eq(coordinatorOptions.length, 1, 'one coordinator created');
  ok(coordinatorOptions[0].client === stateClient, 'coordinator receives sibling state client');
  ok(coordinatorOptions[0].storage === gameStateStorage, 'coordinator receives separate outbox storage');
  eq(calls.filter((call) => call[0] === 'coordinator-start').length, 1, 'synchronize starts coordinator');
  eq(reconciliationOptions.length, 1, 'successful initial synchronization creates one scheduler');
  eq(reconciliationSchedulers.length, 1, 'scheduler instance retained');
  eq(reconciliationCalls, [['start', 0]], 'scheduler starts only after initial synchronization');

  const recorded = controller.recordCommittedMission('energy');
  ok(recorded.accepted && recorded.queued, 'controller forwards committed mission');
  eq(calls.filter((call) => call[0] === 'coordinator-record'), [['coordinator-record', 'energy']], 'committed mission forwarded exactly');
  await controller.refreshGameState();
  eq(reconciliationCalls.filter((call) => call[0] === 'request'), [['request', 0, 'manual']], 'manual refresh is routed through scheduler');
  eq(calls.filter((call) => call[0] === 'coordinator-refresh').length, 0, 'manual request does not bypass scheduler bounds');
  const scheduledOutcome = await reconciliationOptions[0].refresh();
  eq(scheduledOutcome, {success:true,retryable:true,terminal:false}, 'scheduler refresh maps ready coordinator state');
  eq(calls.filter((call) => call[0] === 'coordinator-refresh').length, 1, 'scheduler owns authoritative refresh');

  const sharedState = {revision: 1, completedMissionIds: ['energy']};
  coordinatorOptions[0].onGameStateChange(sharedState);
  ok(projected[0] === sharedState, 'shared projection callback preserved');
  const signalsBeforeAuthoritativeChange = realtimeSignals.length;
  coordinatorOptions[0].onAuthoritativeStateChange({revision:999,completedMissionIds:['secret']});
  eq(realtimeSignals.length, signalsBeforeAuthoritativeChange + 1, 'authoritative change publishes one invalidation');
  eq(realtimeSignals[realtimeSignals.length - 1], {roomId:'room-1',signal:{type:'game-state-change',eventId:'evt-game-state-change',emittedAt:'1970-01-01T00:00:01.000Z'}}, 'game-state invalidation contains no state or participant data');
  const requestsBeforePresenceSignal = reconciliationCalls.filter((call) => call[0] === 'request').length;
  realtimeCallbacks[0]({type:'presence-change',eventId:'remote-presence',emittedAt:'2026-08-18T12:00:00.000Z'});
  eq(reconciliationCalls.filter((call) => call[0] === 'request').length, requestsBeforePresenceSignal, 'presence signal does not refresh game state');
  realtimeCallbacks[0]({type:'game-state-change',eventId:'remote-game',emittedAt:'2026-08-18T12:00:01.000Z'});
  eq(reconciliationCalls[reconciliationCalls.length - 1], ['request', 0, 'signal'], 'game-state signal requests bounded reconciliation');
  controller.setGameStateVisibility(false);
  controller.setGameStateVisibility(true);
  eq(reconciliationCalls.filter((call) => call[0] === 'visible'), [['visible',0,false],['visible',0,true]], 'visibility is forwarded to scheduler');

  heartbeatResult = failure('ROOM_EXPIRED');
  state = await controller.heartbeat();
  eq(state.status, 'EXPIRED', 'expiry remains terminal for player');
  eq(calls.filter((call) => call[0] === 'coordinator-discard').length, 1, 'expiry discards exact outbox context');
  eq(calls.filter((call) => call[0] === 'coordinator-destroy').length, 1, 'expiry destroys coordinator memory');
  eq(projected[projected.length - 1], null, 'expiry clears shared projection');
  eq(reconciliationCalls.filter((call) => call[0] === 'stop'), [['stop',0]], 'expiry stops reconciliation scheduler');
  eq(realtimeUnsubscriptions, ['room-1'], 'expiry unsubscribes realtime room');
  eq(realtimeDestroyCount, 1, 'expiry destroys realtime transport once');
  const afterExpiry = controller.recordCommittedMission('greenhouse');
  eq(afterExpiry, false, 'post-expiry completion is not queued');

  heartbeatResult = success({room: room()});
  state = await controller.start(launch);
  eq(state.status, 'ACTIVE', 'player can establish a fresh context after expiry');
  eq(coordinatorOptions.length, 2, 'fresh context creates a new coordinator generation');
  eq(reconciliationOptions.length, 2, 'fresh context creates a new scheduler generation');
  eq(realtimeSubscriptions, ['room-1','room-1'], 'fresh context resubscribes to room');
  const projectionCountAfterRestart = projected.length;
  coordinatorOptions[0].onGameStateChange({revision: 2, completedMissionIds: ['greenhouse']});
  eq(projected.length, projectionCountAfterRestart, 'late callback from old generation is ignored');
  const signalCountAfterRestart = realtimeSignals.length;
  coordinatorOptions[0].onAuthoritativeStateChange();
  eq(realtimeSignals.length, signalCountAfterRestart, 'late authoritative callback from old generation is ignored');
  const reconciliationCallCountAfterRestart = reconciliationCalls.length;
  realtimeCallbacks[0]({type:'game-state-change',eventId:'late-game',emittedAt:'2026-08-18T12:00:02.000Z'});
  eq(reconciliationCalls.length, reconciliationCallCountAfterRestart, 'late realtime callback from old subscription is ignored');
  coordinatorOptions[1].onAuthoritativeStateChange();
  eq(realtimeSignals[realtimeSignals.length - 1].signal.type, 'game-state-change', 'current generation publishes game-state invalidation');
  realtimeCallbacks[1]({type:'game-state-change',eventId:'current-game',emittedAt:'2026-08-18T12:00:03.000Z'});
  eq(reconciliationCalls[reconciliationCalls.length - 1], ['request',1,'signal'], 'current realtime subscription targets current scheduler');
  const restartedSharedState = {revision: 1, completedMissionIds: ['greenhouse']};
  coordinatorOptions[1].onGameStateChange(restartedSharedState);
  ok(projected[projected.length - 1] === restartedSharedState, 'current generation callback is projected');

  const normalCalls = [];
  const normalCoordinator = {
    available: () => true,
    start() { return Promise.resolve({status: 'READY'}); },
    refresh() { return Promise.resolve({status: 'READY'}); },
    recordCommittedMission() { return true; },
    discard() { normalCalls.push('discard'); },
    destroy() { normalCalls.push('destroy'); }
  };
  const normalClient = {
    available: () => true,
    async getLiveRoom() { return success({room: room()}); },
    async joinLiveRoom(_roomId, participantId) { return success({room: room(), presence: presence(participantId)}); },
    createGameStateClient() { return stateClient; }
  };
  const normalController = api.createPlayerController({
    client: normalClient,
    storage: storage(),
    participantIdFactory: () => 'player-2',
    setIntervalImpl: () => 1,
    clearIntervalImpl: () => {},
    missionOrderProvider: () => ['energy'],
    gameStateCoordinatorFactory: {createCoordinator: () => normalCoordinator}
  });
  await normalController.start(launch);
  normalController.destroy();
  eq(normalCalls, ['destroy'], 'normal destroy preserves outbox and destroys memory only');

  ok(!source.includes('capabilityToken'), 'player composition never handles capability token');
  ok(!source.includes('sessionData'), 'player composition remains separate from local session data');
  ok(!source.includes('StudentSession'), 'player composition remains separate from domain session');

  console.log('RUNTIME_LIVE_ROOM_GAME_STATE_PLAYER_COMPOSITION_TEST_STATUS=' + (failed === 0 ? 'PASS' : 'FAIL'));
  console.log('RUNTIME_LIVE_ROOM_GAME_STATE_PLAYER_COMPOSITION_TEST_TOTAL=' + total);
  console.log('RUNTIME_LIVE_ROOM_GAME_STATE_PLAYER_COMPOSITION_TEST_FAILED=' + failed);
  process.exit(failed === 0 ? 0 : 1);
})().catch((error) => {
  console.error(error && error.stack || error);
  process.exit(1);
});
