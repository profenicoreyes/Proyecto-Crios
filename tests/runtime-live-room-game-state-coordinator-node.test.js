'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = process.argv[2] || path.resolve(__dirname, '..');
const coordinatorRelative = 'js/runtime/live-room/runtime-live-room-game-state-coordinator.js';
const coordinatorSource = fs.readFileSync(path.join(root, coordinatorRelative), 'utf8');
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

function makeStorage(initial) {
  const values = new Map(initial || []);
  return {
    get length() { return values.size; },
    key(index) { return Array.from(values.keys())[index] ?? null; },
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(String(key), String(value)); },
    removeItem(key) { values.delete(String(key)); },
    values
  };
}

function load(storage) {
  const context = {
    console,
    Object,
    Array,
    String,
    Number,
    Boolean,
    Date,
    Math,
    JSON,
    RegExp,
    Error,
    TypeError,
    Map,
    Set,
    Promise,
    Uint8Array,
    encodeURIComponent,
    sessionStorage: storage,
    crypto: {randomUUID: () => '11111111-2222-4333-8444-555555555555'}
  };
  context.window = context;
  vm.createContext(context);
  [
    'js/live-room/live-room-game-state-outbox.js',
    coordinatorRelative
  ].forEach((relative) => {
    const file = path.join(root, relative);
    vm.runInContext(fs.readFileSync(file, 'utf8'), context, {filename: file});
  });
  return context;
}

const contextValue = {
  roomId: 'room-1',
  campaignId: 'campaign-1',
  publicationId: 'publication-1',
  participantId: 'player-1',
  missionOrder: ['energy', 'greenhouse', 'ice']
};

function gameState(ids) {
  return {
    schemaVersion: '1.0',
    roomId: contextValue.roomId,
    campaignId: contextValue.campaignId,
    publicationId: contextValue.publicationId,
    revision: ids.length,
    completedMissionIds: ids.slice(),
    updatedAt: '2026-08-18T12:' + String(ids.length).padStart(2, '0') + ':00.000Z'
  };
}

function success(state, changed) {
  return {success: true, requestId: 'remote', data: Object.assign({gameState: state, stateAdvanced: true},
    changed === undefined ? {} : {changed}), error: null};
}

function failure(code, retryable) {
  return {success: false, requestId: 'remote', data: null,
    error: {code, message: code, retryable: Boolean(retryable), metadata: null}};
}

function makeClient(options) {
  const opts = options || {};
  const calls = [];
  let getIndex = 0;
  let completeIndex = 0;
  return {
    calls,
    available: () => opts.available !== false,
    async getLiveRoomGameState() {
      calls.push(['get']);
      const value = Array.isArray(opts.getResponses)
        ? opts.getResponses[Math.min(getIndex++, opts.getResponses.length - 1)]
        : success(gameState([]));
      return typeof value === 'function' ? value() : value;
    },
    async completeLiveRoomMission(missionId, callOptions) {
      calls.push(['complete', missionId, callOptions && callOptions.requestId]);
      const value = Array.isArray(opts.completeResponses)
        ? opts.completeResponses[Math.min(completeIndex++, opts.completeResponses.length - 1)]
        : success(gameState([missionId]), true);
      return typeof value === 'function' ? value(missionId, callOptions) : value;
    }
  };
}

function makeCoordinator(api, storage, client, options) {
  const scheduled = [];
  const gameStates = [];
  const stateChanges = [];
  const authoritativeChanges = [];
  let requestNumber = 0;
  let nowMs = Date.parse('2026-08-18T12:10:00.000Z');
  const coordinator = api.createCoordinator(Object.assign({
    context: contextValue,
    client,
    storage,
    now: () => nowMs++,
    requestIdFactory: () => 'outbox-request-' + (++requestNumber),
    schedule: (callback) => { scheduled.push(callback); },
    onGameStateChange: (state) => gameStates.push(state),
    onAuthoritativeStateChange: () => authoritativeChanges.push(true),
    onStateChange: (state) => stateChanges.push(state)
  }, options || {}));
  return {coordinator, scheduled, gameStates, stateChanges, authoritativeChanges};
}

(async () => {
  const storage = makeStorage();
  const context = load(storage);
  const api = context.CRIOS_RUNTIME_LIVE_ROOM_GAME_STATE_COORDINATOR_FACTORY;
  ok(Boolean(api), 'coordinator API exists');
  eq(api.version, '1.0.0', 'coordinator API version');
  ok(Object.isFrozen(api), 'coordinator API frozen');
  ok(Object.isFrozen(api.terminalCodes), 'terminal codes frozen');

  const client = makeClient({
    getResponses: [success(gameState([]))],
    completeResponses: [success(gameState(['energy']), true)]
  });
  const harness = makeCoordinator(api, storage, client);
  const coordinator = harness.coordinator;
  ok(coordinator.available(), 'configured coordinator available');
  ok(Object.isFrozen(coordinator), 'coordinator frozen');
  eq(Object.keys(coordinator).sort(), [
    'available',
    'destroy',
    'discard',
    'flush',
    'getState',
    'recordCommittedMission',
    'refresh',
    'start',
    'version'
  ], 'coordinator API narrow');

  let state = await coordinator.start();
  eq(state.status, 'READY', 'start reads authority and becomes ready');
  eq(state.pendingCount, 0, 'start has empty outbox');
  eq(state.lastGameState.revision, 0, 'start exposes initial shared state');
  eq(client.calls, [['get']], 'start performs one authenticated read');
  eq(harness.gameStates.length, 1, 'initial shared state callback');
  ok(Object.isFrozen(state) && Object.isFrozen(state.lastGameState), 'coordinator state deeply frozen');

  let recorded = coordinator.recordCommittedMission('energy');
  ok(recorded.accepted, 'committed mission accepted');
  ok(recorded.queued, 'committed mission queued');
  eq(recorded.requestId, 'outbox-request-1', 'outbox requestId returned');
  ok(Object.isFrozen(recorded), 'record result frozen');
  eq(client.calls.length, 1, 'record does not execute network synchronously');
  eq(harness.scheduled.length, 1, 'record schedules asynchronous flush');
  eq(coordinator.getState().pendingCount, 1, 'pending count visible before flush');
  ok(!JSON.stringify(recorded).includes('capability'), 'record result contains no capability');
  await harness.scheduled.shift()();
  state = coordinator.getState();
  eq(state.status, 'READY', 'successful flush returns ready');
  eq(state.pendingCount, 0, 'successful flush acknowledges outbox');
  eq(state.lastGameState.completedMissionIds, ['energy'], 'successful completion projects shared state');
  eq(client.calls[1], ['complete', 'energy', 'outbox-request-1'], 'flush preserves requestId');
  eq(harness.authoritativeChanges.length, 1, 'changed completion emits one authoritative invalidation');
  eq(storage.values.size, 0, 'acknowledged outbox removed from storage');

  recorded = coordinator.recordCommittedMission('foreign');
  ok(!recorded.accepted, 'foreign mission rejected locally');
  eq(recorded.error.code, api.errorCodes.MISSION_INVALID, 'foreign mission error code');
  eq(harness.scheduled.length, 0, 'foreign mission schedules no work');
  eq(client.calls.length, 2, 'foreign mission performs no network');

  const retryStorage = makeStorage();
  const retryContext = load(retryStorage);
  const retryApi = retryContext.CRIOS_RUNTIME_LIVE_ROOM_GAME_STATE_COORDINATOR_FACTORY;
  const retryClient = makeClient({
    getResponses: [success(gameState(['energy']))],
    completeResponses: [failure('LIVE_ROOM_GAME_STATE_TRANSPORT_FAILED', true)]
  });
  const retryHarness = makeCoordinator(retryApi, retryStorage, retryClient);
  await retryHarness.coordinator.start();
  recorded = retryHarness.coordinator.recordCommittedMission('greenhouse');
  const retainedRequestId = recorded.requestId;
  await retryHarness.scheduled.shift()();
  state = retryHarness.coordinator.getState();
  eq(state.status, 'DEGRADED', 'transient failure degrades without rollback');
  eq(state.pendingCount, 1, 'transient failure retains pending item');
  eq(state.lastError.code, 'LIVE_ROOM_GAME_STATE_TRANSPORT_FAILED', 'transient error retained');
  eq(retryHarness.authoritativeChanges.length, 0, 'failed completion emits no authoritative invalidation');
  let persistedRecord = JSON.parse(Array.from(retryStorage.values.values())[0]);
  eq(persistedRecord.items[0].requestId, retainedRequestId, 'pending requestId persisted');
  eq(persistedRecord.items[0].attemptCount, 1, 'failed attempt metadata persisted');
  retryHarness.coordinator.destroy();
  eq(retryHarness.coordinator.getState().status, 'DESTROYED', 'destroy changes memory state');
  eq(retryStorage.values.size, 1, 'destroy preserves pending outbox for reload');

  const recoveryClient = makeClient({
    getResponses: [success(gameState(['energy']))],
    completeResponses: [success(gameState(['energy', 'greenhouse']), true)]
  });
  const recoveryHarness = makeCoordinator(retryApi, retryStorage, recoveryClient);
  state = await recoveryHarness.coordinator.start();
  eq(state.status, 'READY', 'reload flush recovers ready');
  eq(state.pendingCount, 0, 'reload flush acknowledges pending item');
  eq(recoveryClient.calls[1], ['complete', 'greenhouse', retainedRequestId], 'reload replays exact requestId');
  eq(recoveryHarness.authoritativeChanges.length, 1, 'successful replay emits one authoritative invalidation');
  eq(retryStorage.values.size, 0, 'reload recovery clears persisted outbox');

  const reconciliationStorage = makeStorage();
  const reconciliationContext = load(reconciliationStorage);
  const reconciliationApi = reconciliationContext.CRIOS_RUNTIME_LIVE_ROOM_GAME_STATE_COORDINATOR_FACTORY;
  const reconciliationClient = makeClient({
    getResponses: [success(gameState(['energy', 'greenhouse'])), success(gameState(['energy', 'greenhouse', 'ice']))],
    completeResponses: [failure('LIVE_ROOM_GAME_STATE_RECONCILIATION_REQUIRED', true)]
  });
  const reconciliationHarness = makeCoordinator(reconciliationApi, reconciliationStorage, reconciliationClient);
  await reconciliationHarness.coordinator.start();
  recorded = reconciliationHarness.coordinator.recordCommittedMission('ice');
  await reconciliationHarness.scheduled.shift()();
  state = reconciliationHarness.coordinator.getState();
  eq(state.status, 'READY', 'authoritative reconciliation recovers ready');
  eq(state.pendingCount, 0, 'authoritative read acknowledges confirmed mission');
  eq(state.lastGameState.completedMissionIds, ['energy', 'greenhouse', 'ice'], 'reconciled state projected');
  eq(reconciliationClient.calls.map((call) => call[0]), ['get', 'complete', 'get'], 'reconciliation performs fresh authenticated read');
  eq(reconciliationHarness.authoritativeChanges.length, 0, 'read reconciliation emits no authoritative invalidation');

  const terminalStorage = makeStorage();
  const terminalContext = load(terminalStorage);
  const terminalApi = terminalContext.CRIOS_RUNTIME_LIVE_ROOM_GAME_STATE_COORDINATOR_FACTORY;
  const terminalClient = makeClient({
    getResponses: [success(gameState([]))],
    completeResponses: [failure('ROOM_EXPIRED', false)]
  });
  const terminalHarness = makeCoordinator(terminalApi, terminalStorage, terminalClient);
  await terminalHarness.coordinator.start();
  terminalHarness.coordinator.recordCommittedMission('energy');
  await terminalHarness.scheduled.shift()();
  state = terminalHarness.coordinator.getState();
  eq(state.status, 'TERMINAL', 'room expiry terminal');
  eq(state.pendingCount, 0, 'room expiry discards pending context');
  eq(state.lastGameState, null, 'room expiry clears shared projection');
  eq(terminalStorage.values.size, 0, 'room expiry removes outbox');
  eq(terminalHarness.gameStates[terminalHarness.gameStates.length - 1], null, 'room expiry notifies projection clear');
  ok(!terminalHarness.coordinator.available(), 'terminal coordinator becomes unavailable');
  recorded = terminalHarness.coordinator.recordCommittedMission('greenhouse');
  ok(!recorded.accepted, 'terminal coordinator rejects later completions');
  eq(recorded.error.code, terminalApi.errorCodes.UNAVAILABLE, 'terminal rejection is local');
  eq(terminalHarness.scheduled.length, 0, 'terminal rejection schedules no retry');

  const pruneStorage = makeStorage();
  const pruneContext = load(pruneStorage);
  const outboxApi = pruneContext.CRIOS_LIVE_ROOM_GAME_STATE_OUTBOX;
  const oldOutbox = outboxApi.createOutbox({
    context: Object.assign({}, contextValue, {participantId: 'player-old'}),
    storage: pruneStorage
  });
  oldOutbox.enqueue({requestId: 'old-request', missionId: 'energy', createdAt: '2026-08-18T12:00:00.000Z'});
  eq(pruneStorage.values.size, 1, 'old context fixture persisted');
  const pruneClient = makeClient({getResponses: [success(gameState([]))]});
  const pruneHarness = makeCoordinator(pruneContext.CRIOS_RUNTIME_LIVE_ROOM_GAME_STATE_COORDINATOR_FACTORY, pruneStorage, pruneClient);
  await pruneHarness.coordinator.start();
  eq(pruneStorage.values.size, 0, 'new active context prunes old outbox');
  ok(!pruneClient.calls.some((call) => call[0] === 'complete'), 'old context event never migrated');

  const corruptStorage = makeStorage();
  const corruptContext = load(corruptStorage);
  const corruptOutbox = corruptContext.CRIOS_LIVE_ROOM_GAME_STATE_OUTBOX.createOutbox({context: contextValue, storage: corruptStorage});
  corruptOutbox.enqueue({requestId: 'corrupt-request', missionId: 'energy', createdAt: '2026-08-18T12:00:00.000Z'});
  const corruptKey = Array.from(corruptStorage.values.keys())[0];
  corruptStorage.values.set(corruptKey, '{broken');
  const corruptClient = makeClient({getResponses: [success(gameState([]))]});
  const corruptHarness = makeCoordinator(corruptContext.CRIOS_RUNTIME_LIVE_ROOM_GAME_STATE_COORDINATOR_FACTORY, corruptStorage, corruptClient);
  state = await corruptHarness.coordinator.start();
  eq(state.status, 'DEGRADED', 'corrupt outbox fails closed');
  eq(state.lastError.code, 'LIVE_ROOM_GAME_STATE_OUTBOX_CORRUPTED', 'corrupt outbox error propagated safely');
  ok(!corruptClient.calls.some((call) => call[0] === 'complete'), 'corrupt outbox sends no completion');
  eq(corruptStorage.values.get(corruptKey), '{broken', 'corrupt outbox not overwritten');

  const unavailableClient = makeClient({available: false});
  const unavailableHarness = makeCoordinator(api, makeStorage(), unavailableClient);
  ok(!unavailableHarness.coordinator.available(), 'unavailable remote client blocks coordinator');
  state = await unavailableHarness.coordinator.start();
  eq(state.status, 'UNAVAILABLE', 'unavailable start fails closed');
  eq(unavailableClient.calls.length, 0, 'unavailable start performs no network');

  const emptyRequestHarness = makeCoordinator(api, makeStorage(), makeClient(), {requestIdFactory: () => ''});
  recorded = emptyRequestHarness.coordinator.recordCommittedMission('energy');
  ok(!recorded.accepted, 'empty requestId rejects local event');
  eq(recorded.error.code, api.errorCodes.REQUEST_ID_UNAVAILABLE, 'empty requestId error code');

  const invalidContextHarness = makeCoordinator(api, makeStorage(), makeClient(), {
    context: Object.assign({}, contextValue, {capabilityToken: 'secret'})
  });
  ok(!invalidContextHarness.coordinator.available(), 'context with capability unavailable');
  recorded = invalidContextHarness.coordinator.recordCommittedMission('energy');
  eq(recorded.error.code, api.errorCodes.CONTEXT_INVALID, 'context with capability rejected');
  ok(!JSON.stringify(recorded).includes('secret'), 'invalid context result leaks no secret');

  ok(!coordinatorSource.includes('capabilityToken'), 'coordinator never handles capability token');
  ok(!coordinatorSource.includes('StudentSession'), 'coordinator excludes StudentSession');
  ok(!coordinatorSource.includes('sessionData'), 'coordinator excludes sessionData');
  ok(!coordinatorSource.includes('answer'), 'coordinator excludes answers');
  ok(!coordinatorSource.includes('setInterval'), 'coordinator has no polling loop');
  ok(!coordinatorSource.includes('Firebase'), 'coordinator has no Firebase dependency');

  console.log('RUNTIME_LIVE_ROOM_GAME_STATE_COORDINATOR_TEST_STATUS=' + (failed === 0 ? 'PASS' : 'FAIL'));
  console.log('RUNTIME_LIVE_ROOM_GAME_STATE_COORDINATOR_TEST_TOTAL=' + total);
  console.log('RUNTIME_LIVE_ROOM_GAME_STATE_COORDINATOR_TEST_FAILED=' + failed);
  process.exit(failed === 0 ? 0 : 1);
})().catch((error) => {
  console.error(error && error.stack || error);
  process.exit(1);
});
