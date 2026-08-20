'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = process.argv[2] || path.resolve(__dirname, '..');
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

function makeContext() {
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
    AbortController: global.AbortController,
    setTimeout,
    clearTimeout,
    encodeURIComponent,
    crypto: {
      randomUUID() { return '11111111-2222-4333-8444-555555555555'; }
    }
  };
  context.window = context;
  vm.createContext(context);
  [
    'js/live-room/live-room-game-state-model.js',
    'js/live-room/remote/live-room-game-state-contract.js',
    'js/live-room/remote/live-room-game-state-client.js'
  ].forEach((relative) => {
    const file = path.join(root, relative);
    vm.runInContext(fs.readFileSync(file, 'utf8'), context, {filename: file});
  });
  return context;
}

const roomId = 'room-1';
const campaignId = 'campaign-1';
const publicationId = 'publication-1';
const participantId = 'player-1';
const missionOrder = ['energy', 'greenhouse', 'ice'];
const capability = 'c'.repeat(64);

function clientContext(overrides) {
  return Object.assign({roomId, campaignId, publicationId, participantId, missionOrder}, overrides || {});
}

function gameState(completedMissionIds, overrides) {
  const ids = completedMissionIds.slice();
  return Object.assign({
    schemaVersion: '1.0',
    roomId,
    campaignId,
    publicationId,
    revision: ids.length,
    completedMissionIds: ids,
    updatedAt: '2026-08-18T12:' + String(ids.length).padStart(2, '0') + ':00.000Z'
  }, overrides || {});
}

function wireResponse(request, data, error) {
  return {
    protocolVersion: '1.0',
    operation: request.operation,
    requestId: request.requestId,
    success: !error,
    data: error ? null : data,
    error: error || null
  };
}

function successData(request, state, changed) {
  if (request.operation === 'completeLiveRoomMission') {
    return {gameState: state, changed: Boolean(changed)};
  }
  return {gameState: state};
}

function makeHarness(context, responder, options) {
  const calls = [];
  const capabilityReads = [];
  let requestCounter = 0;
  let fetchCount = 0;
  const credentialStore = {
    get(actualRoomId, actualParticipantId) {
      capabilityReads.push([actualRoomId, actualParticipantId]);
      return capability;
    }
  };
  const fetchImpl = async (url, init) => {
    fetchCount += 1;
    const envelope = JSON.parse(init.body);
    const request = envelope.liveRoomRequest;
    calls.push({url, init, envelope, request});
    const output = await responder(request, fetchCount - 1);
    if (output && output.__rawResponse) return output.__rawResponse;
    return {ok: true, status: 200, text: async () => JSON.stringify(output)};
  };
  const client = context.CRIOS_REMOTE_LIVE_ROOM_GAME_STATE_CLIENT.createClient(Object.assign({
    context: clientContext(),
    contract: context.CRIOS_REMOTE_LIVE_ROOM_GAME_STATE_CONTRACT,
    model: context.CRIOS_LIVE_ROOM_GAME_STATE_MODEL,
    credentialStore,
    endpoint: 'https://example.test/exec',
    fetchImpl,
    requestIdFactory(operation) {
      requestCounter += 1;
      return 'request-' + operation + '-' + requestCounter;
    }
  }, options || {}));
  return {client, calls, capabilityReads, fetchCount: () => fetchCount};
}

async function run() {
  const context = makeContext();
  const api = context.CRIOS_REMOTE_LIVE_ROOM_GAME_STATE_CLIENT;
  ok(Boolean(api), 'client API exists');
  eq(api.version, '1.0.0', 'client API version');
  ok(Object.isFrozen(api), 'client API frozen');
  ok(Object.isFrozen(api.errorCodes), 'client error codes frozen');

  const sequence = [
    gameState([]),
    gameState(['energy']),
    gameState(['energy', 'greenhouse']),
    gameState(['energy']),
    gameState(['energy', 'greenhouse']),
    gameState(['energy'])
  ];
  const main = makeHarness(context, (request, index) => wireResponse(
    request,
    successData(request, sequence[index], request.operation === 'completeLiveRoomMission'),
    null
  ));
  const client = main.client;
  ok(client.available(), 'configured client available');
  ok(Object.isFrozen(client), 'client frozen');
  eq(Object.keys(client).sort(), [
    'available',
    'completeLiveRoomMission',
    'getLiveRoomGameState',
    'version'
  ], 'client exposes narrow API');

  let response = await client.getLiveRoomGameState();
  ok(response.success, 'initial authenticated read succeeds');
  eq(response.data.gameState.revision, 0, 'initial revision accepted');
  eq(response.data.stateAdvanced, true, 'first snapshot initializes cache');
  ok(Object.isFrozen(response), 'read result frozen');
  ok(Object.isFrozen(response.data.gameState.completedMissionIds), 'state deeply frozen');
  ok(!JSON.stringify(response).includes(capability), 'read result contains no capability');

  response = await client.completeLiveRoomMission('energy', {requestId: 'completion-fixed'});
  ok(response.success, 'completion succeeds');
  eq(response.requestId, 'completion-fixed', 'explicit completion requestId preserved');
  eq(response.data.gameState.revision, 1, 'completion advances revision');
  eq(response.data.changed, true, 'backend changed flag preserved');
  eq(response.data.stateAdvanced, true, 'completion advances local snapshot');
  ok(!JSON.stringify(response).includes(capability), 'completion result contains no capability');

  response = await client.getLiveRoomGameState();
  eq(response.data.gameState.revision, 2, 'later read accepts higher revision');
  eq(response.data.gameState.completedMissionIds, ['energy', 'greenhouse'], 'later read keeps canonical order');
  eq(response.data.stateAdvanced, true, 'later read reports local advance');

  response = await client.completeLiveRoomMission('energy', {requestId: 'completion-fixed'});
  ok(response.success, 'exact replay succeeds');
  eq(response.requestId, 'completion-fixed', 'replay reuses caller requestId');
  eq(response.data.gameState.revision, 2, 'old replay cannot regress public snapshot');
  eq(response.data.gameState.completedMissionIds, ['energy', 'greenhouse'], 'old replay returns effective cached state');
  eq(response.data.changed, true, 'replay preserves original backend changed flag');
  eq(response.data.stateAdvanced, false, 'old replay does not advance local snapshot');

  response = await client.getLiveRoomGameState();
  eq(response.data.gameState.revision, 2, 'identical revision remains current');
  eq(response.data.stateAdvanced, false, 'identical snapshot is not an advance');
  response = await client.getLiveRoomGameState();
  eq(response.data.gameState.revision, 2, 'lower read cannot regress public snapshot');
  eq(response.data.stateAdvanced, false, 'lower read is ignored monotonically');

  eq(main.calls.length, 6, 'six operations reached transport');
  main.calls.forEach((call, index) => {
    eq(call.url, 'https://example.test/exec', 'endpoint used for call ' + index);
    eq(call.init.method, 'POST', 'POST used for call ' + index);
    eq(call.init.credentials, 'omit', 'credentials omitted for call ' + index);
    eq(call.init.cache, 'no-store', 'cache disabled for call ' + index);
    eq(call.init.redirect, 'follow', 'redirect policy for call ' + index);
    eq(call.init.headers, {'Content-Type': 'text/plain;charset=utf-8'}, 'simple content type for call ' + index);
    eq(Object.keys(call.envelope), ['liveRoomRequest'], 'dedicated envelope for call ' + index);
    eq(call.request.payload.roomId, roomId, 'room bound for call ' + index);
    eq(call.request.payload.participantId, participantId, 'participant bound for call ' + index);
    eq(call.request.payload.capabilityToken, capability, 'capability read internally for call ' + index);
    ok(!Object.prototype.hasOwnProperty.call(call.request.payload, 'campaignId'), 'campaign not caller-authored for call ' + index);
    ok(!Object.prototype.hasOwnProperty.call(call.request.payload, 'publicationId'), 'publication not caller-authored for call ' + index);
    ok(!Object.prototype.hasOwnProperty.call(call.request.payload, 'expectedRevision'), 'expectedRevision absent for call ' + index);
  });
  eq(main.capabilityReads.length, 6, 'capability read once per operation');
  main.capabilityReads.forEach((read, index) => eq(read, [roomId, participantId], 'capability lookup identity ' + index));
  eq(main.calls[1].request.requestId, 'completion-fixed', 'first completion wire requestId fixed');
  eq(main.calls[3].request.requestId, 'completion-fixed', 'replay wire requestId fixed');

  const divergentStates = [
    gameState(['energy']),
    gameState(['greenhouse']),
    gameState(['greenhouse', 'ice']),
    gameState([]),
    gameState(['energy', 'greenhouse'])
  ];
  const divergent = makeHarness(context, (request, index) => wireResponse(
    request,
    {gameState: divergentStates[index]},
    null
  ));
  response = await divergent.client.getLiveRoomGameState();
  ok(response.success, 'reconciliation fixture initializes');
  response = await divergent.client.getLiveRoomGameState();
  ok(!response.success, 'same revision divergence rejected');
  eq(response.error.code, api.errorCodes.RECONCILIATION_REQUIRED, 'same revision requests reconciliation');
  eq(response.error.retryable, true, 'reconciliation error retryable through authoritative read');
  eq(response.error.metadata, {requiresAuthoritativeRead: true}, 'reconciliation metadata explicit');
  response = await divergent.client.getLiveRoomGameState();
  ok(!response.success, 'higher non-superset rejected');
  eq(response.error.code, api.errorCodes.RECONCILIATION_REQUIRED, 'lost completion requests reconciliation');
  response = await divergent.client.getLiveRoomGameState();
  ok(response.success, 'lower snapshot remains safe after rejection');
  eq(response.data.gameState.completedMissionIds, ['energy'], 'rejected snapshots did not corrupt cache');
  response = await divergent.client.getLiveRoomGameState();
  ok(response.success, 'valid higher superset accepted after rejection');
  eq(response.data.gameState.completedMissionIds, ['energy', 'greenhouse'], 'valid recovery advances cache');

  const mismatch = makeHarness(context, (request, index) => wireResponse(
    request,
    {gameState: index === 0
      ? gameState([], {campaignId: 'campaign-other'})
      : gameState([], {publicationId: 'publication-other'})},
    null
  ));
  response = await mismatch.client.getLiveRoomGameState();
  ok(!response.success, 'foreign campaign rejected');
  eq(response.error.code, api.errorCodes.CONTEXT_MISMATCH, 'foreign campaign context error');
  response = await mismatch.client.getLiveRoomGameState();
  ok(!response.success, 'foreign publication rejected');
  eq(response.error.code, api.errorCodes.CONTEXT_MISMATCH, 'foreign publication context error');

  const semanticStates = [
    gameState(['greenhouse', 'energy']),
    gameState(['foreign'])
  ];
  const semantic = makeHarness(context, (request, index) => wireResponse(
    request,
    {gameState: semanticStates[index]},
    null
  ));
  response = await semantic.client.getLiveRoomGameState();
  ok(!response.success, 'noncanonical mission order rejected by model');
  eq(response.error.code, api.errorCodes.SEMANTIC_INVALID, 'noncanonical order semantic error');
  response = await semantic.client.getLiveRoomGameState();
  ok(!response.success, 'foreign mission rejected by model');
  eq(response.error.code, api.errorCodes.SEMANTIC_INVALID, 'foreign mission semantic error');

  let guardedFetches = 0;
  const guardedBase = {
    context: clientContext(),
    contract: context.CRIOS_REMOTE_LIVE_ROOM_GAME_STATE_CONTRACT,
    model: context.CRIOS_LIVE_ROOM_GAME_STATE_MODEL,
    endpoint: 'https://example.test/exec',
    fetchImpl: async () => { guardedFetches += 1; throw new Error('must not fetch'); },
    requestIdFactory: () => 'guarded-request'
  };
  let guardedClient = api.createClient(Object.assign({}, guardedBase, {credentialStore: {get: () => ''}}));
  ok(guardedClient.available(), 'empty credential store is structurally configured');
  response = await guardedClient.getLiveRoomGameState();
  eq(response.error.code, api.errorCodes.CAPABILITY_UNAVAILABLE, 'missing capability rejected locally');
  eq(guardedFetches, 0, 'missing capability performs no fetch');
  guardedClient = api.createClient(Object.assign({}, guardedBase, {credentialStore: {get() { throw new Error(capability); }}}));
  response = await guardedClient.getLiveRoomGameState();
  eq(response.error.code, api.errorCodes.CAPABILITY_UNAVAILABLE, 'credential read failure rejected safely');
  ok(!JSON.stringify(response).includes(capability), 'credential read error leaks no capability');
  eq(guardedFetches, 0, 'credential read failure performs no fetch');
  guardedClient = api.createClient(Object.assign({}, guardedBase, {credentialStore: {get: () => capability}}));
  response = await guardedClient.completeLiveRoomMission('', {requestId: 'bad-mission'});
  eq(response.error.code, 'INVALID_REQUEST', 'invalid mission rejected by contract builder');
  eq(guardedFetches, 0, 'invalid mission performs no fetch');

  const invalidContext = api.createClient(Object.assign({}, guardedBase, {
    context: Object.assign(clientContext(), {capabilityToken: capability}),
    credentialStore: {get: () => capability}
  }));
  ok(!invalidContext.available(), 'context with secret field unavailable');
  response = await invalidContext.getLiveRoomGameState({requestId: 'invalid-context'});
  eq(response.error.code, api.errorCodes.CONTEXT_INVALID, 'extra context field fails closed');
  ok(!JSON.stringify(response).includes(capability), 'invalid context result leaks no capability');

  const wrongOrderContext = api.createClient(Object.assign({}, guardedBase, {
    context: clientContext({missionOrder: ['energy', 'energy']}),
    credentialStore: {get: () => capability}
  }));
  ok(!wrongOrderContext.available(), 'duplicate mission order unavailable');
  response = await wrongOrderContext.getLiveRoomGameState();
  eq(response.error.code, api.errorCodes.CONTEXT_INVALID, 'duplicate mission order fails closed');

  const missingStore = api.createClient(Object.assign({}, guardedBase));
  ok(!missingStore.available(), 'credential store is mandatory');
  response = await missingStore.getLiveRoomGameState();
  eq(response.error.code, api.errorCodes.CLIENT_UNAVAILABLE, 'missing credential store is configuration failure');
  const incompleteContract = api.createClient(Object.assign({}, guardedBase, {
    contract: {limits: context.CRIOS_REMOTE_LIVE_ROOM_GAME_STATE_CONTRACT.limits},
    credentialStore: {get: () => capability}
  }));
  ok(!incompleteContract.available(), 'incomplete contract unavailable');
  response = await incompleteContract.getLiveRoomGameState();
  eq(response.error.code, api.errorCodes.CLIENT_UNAVAILABLE, 'incomplete contract fails closed');

  const noRequestId = makeHarness(context, () => { throw new Error('must not fetch'); }, {
    requestIdFactory: () => ''
  });
  response = await noRequestId.client.getLiveRoomGameState();
  eq(response.error.code, api.errorCodes.REQUEST_ID_UNAVAILABLE, 'empty generated requestId rejected locally');
  eq(noRequestId.fetchCount(), 0, 'empty requestId performs no fetch');

  const brokenJson = makeHarness(context, () => ({
    __rawResponse: {ok: true, status: 200, text: async () => '{broken'}
  }));
  response = await brokenJson.client.getLiveRoomGameState();
  eq(response.error.code, api.errorCodes.RESPONSE_PARSE_FAILED, 'invalid JSON rejected');
  eq(response.error.retryable, true, 'invalid JSON considered retryable');

  const http = makeHarness(context, () => ({
    __rawResponse: {ok: false, status: 429, text: async () => ''}
  }));
  response = await http.client.getLiveRoomGameState();
  eq(response.error.code, api.errorCodes.HTTP_ERROR, 'HTTP failure normalized');
  eq(response.error.retryable, true, 'HTTP 429 retryable');
  eq(response.error.metadata, {status: 429}, 'HTTP status retained without body');

  const transport = makeHarness(context, () => { throw new Error(capability); });
  response = await transport.client.getLiveRoomGameState();
  eq(response.error.code, api.errorCodes.TRANSPORT_FAILED, 'transport exception normalized');
  ok(!JSON.stringify(response).includes(capability), 'transport exception leaks no capability');

  const backendError = makeHarness(context, (request) => wireResponse(request, null, {
    code: 'ROOM_EXPIRED',
    message: 'Esta sesión finalizó por inactividad.',
    retryable: false
  }));
  response = await backendError.client.getLiveRoomGameState();
  eq(response.error.code, 'ROOM_EXPIRED', 'backend error code preserved');
  eq(response.error.message, 'Esta sesión finalizó por inactividad.', 'backend message preserved');

  const mismatchedResponse = makeHarness(context, (request) => Object.assign(
    wireResponse(request, {gameState: gameState([])}, null),
    {requestId: 'another-request'}
  ));
  response = await mismatchedResponse.client.getLiveRoomGameState();
  ok(!response.success, 'response for another request rejected');
  eq(response.error.code, 'INVALID_REQUEST', 'contract rejection propagated');

  ok(!Object.keys(client).includes('putLiveRoomGameState'), 'no generic state replacement');
  ok(!Object.keys(client).includes('resetLiveRoomGameState'), 'no remote reset');
  ok(!Object.keys(client).includes('getCapability'), 'no capability accessor');
  ok(!Object.keys(client).includes('setCapability'), 'no capability mutator');

  console.log('LIVE_ROOM_GAME_STATE_REMOTE_CLIENT_TEST_STATUS=' + (failed === 0 ? 'PASS' : 'FAIL'));
  console.log('LIVE_ROOM_GAME_STATE_REMOTE_CLIENT_TEST_TOTAL=' + total);
  console.log('LIVE_ROOM_GAME_STATE_REMOTE_CLIENT_TEST_FAILED=' + failed);
  process.exit(failed === 0 ? 0 : 1);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
