const fs = require('fs');
const path = require('path');
const vm = require('vm');

const repo = process.argv[2] || path.resolve(__dirname, '..');
const sourcePath = path.join(repo, 'js', 'studio', 'live-room', 'studio-live-room-host.js');
const source = fs.readFileSync(sourcePath, 'utf8');

let total = 0;
let failed = 0;
function check(condition, message) {
  total += 1;
  if (!condition) {
    failed += 1;
    console.error('FAIL ' + message);
  }
}
function equal(actual, expected, message) { check(actual === expected, `${message} expected=${expected} actual=${actual}`); }

const docListeners = {};
const documentStub = {
  readyState: 'loading',
  addEventListener(name, fn) { docListeners[name] = fn; },
  getElementById() { return null; },
  createElement() { throw new Error('UI not expected in controller focal tests'); },
  visibilityState: 'visible'
};
const windowStub = {
  document: documentStub,
  location: { href: 'https://example.test/studio/index.html' },
  setInterval() { return 1; },
  clearInterval() {},
  crypto: {
    randomUUID() { return '00000000-0000-4000-8000-000000000001'; },
    getRandomValues(bytes) { for (let i = 0; i < bytes.length; i += 1) bytes[i] = i; return bytes; }
  },
  sessionStorage: {
    getItem() { return null; },
    setItem() {},
    removeItem() {}
  },
  localStorage: {
    getItem() { return null; },
    setItem() {},
    removeItem() {}
  }
};
const context = {
  window: windowStub,
  document: documentStub,
  URL,
  URLSearchParams,
  Uint8Array,
  Object,
  Array,
  String,
  Number,
  Boolean,
  JSON,
  Math,
  Date,
  encodeURIComponent,
  console
};
windowStub.window = windowStub;
vm.createContext(context);
vm.runInContext(source, context, { filename: sourcePath });
const api = windowStub.CRIOS_STUDIO_LIVE_ROOM_HOST;

check(Boolean(api), 'host API exported');
equal(api.version, '1.3.0', 'version');
equal(api.heartbeatIntervalMs, 120000, 'heartbeat interval');
equal(api.rosterRefreshIntervalMs, 30000, 'roster refresh interval');
equal(api.foregroundRefreshMinIntervalMs, 30000, 'foreground refresh min interval');
equal(api.contextKey, 'crios-live-room-host-context-v1', 'context key');
check(source.includes('window.localStorage'), 'host context supports persistent browser storage');
check(source.includes('window.sessionStorage'), 'host context keeps session mirror');
check(source.includes('var persisted = write(persistent, value)'), 'host context requires persistent write');
check(!source.includes('asociada a esta pestaña'), 'host context error is not tab scoped');

check(typeof api.createHostController === 'function', 'controller factory exported');
check(typeof api.buildPlayerHref === 'function', 'player href builder exported');
check(typeof api.buildHostConsoleHref === 'function', 'host console href builder exported');
check(typeof api.bootstrapUi === 'function', 'UI bootstrap exported');
check(Boolean(docListeners.DOMContentLoaded), 'DOMContentLoaded bootstrap registered');

const href = api.buildPlayerHref(
  '../index.html?campaignId=camp-1&publicationId=pub-1',
  'room-1',
  'https://example.test/studio/index.html'
);
const hrefUrl = new URL(href);
equal(hrefUrl.origin, 'https://example.test', 'player href origin');
equal(hrefUrl.pathname, '/index.html', 'player href runtime path');
equal(hrefUrl.searchParams.get('campaignId'), 'camp-1', 'player href campaign id');
equal(hrefUrl.searchParams.get('publicationId'), 'pub-1', 'player href publication id');
equal(hrefUrl.searchParams.get('roomId'), 'room-1', 'player href room id');
equal(api.buildPlayerHref('', 'room-1', 'https://example.test/'), '', 'empty runtime href rejected');
equal(api.buildPlayerHref('/index.html', '', 'https://example.test/'), '', 'empty room id rejected');


const consoleHref = api.buildHostConsoleHref(
  { roomId: 'room-1' },
  { campaignId: 'camp-1', publicationId: 'pub-1' },
  'https://example.test/studio/index.html'
);
const consoleUrl = new URL(consoleHref);
equal(consoleUrl.pathname, '/host/', 'host console path');
equal(consoleUrl.searchParams.get('roomId'), 'room-1', 'host console room id');
equal(consoleUrl.searchParams.get('campaignId'), 'camp-1', 'host console campaign id');
equal(consoleUrl.searchParams.get('publicationId'), 'pub-1', 'host console publication id');
check(!/capability|token|participantId/i.test(consoleUrl.search), 'host console URL contains no host secret');

function makeStorage(initial, setResult = true) {
  let value = initial || null;
  let setCalls = 0;
  let clearCalls = 0;
  return {
    get() { return value; },
    set(v) { setCalls += 1; if (setResult) value = JSON.parse(JSON.stringify(v)); return setResult; },
    clear() { clearCalls += 1; value = null; return true; },
    inspect() { return value; },
    setCalls() { return setCalls; },
    clearCalls() { return clearCalls; }
  };
}

function makeClient(overrides = {}) {
  const calls = { create: [], heartbeat: [], get: [], roster: [], forget: [] };
  const client = {
    available() { return true; },
    async createLiveRoom(campaignId, publicationId, participantId) {
      calls.create.push([campaignId, publicationId, participantId]);
      return { success: true, data: { room: { roomId: 'room-abc', campaignId, publicationId, status: 'active', expiresAt: '2099-01-01T00:10:00.000Z' }, presence: { participantId, role: 'host' } }, error: null };
    },
    async heartbeatLiveRoom(roomId, participantId) {
      calls.heartbeat.push([roomId, participantId]);
      return { success: true, data: { room: { roomId, campaignId: 'camp-1', publicationId: 'pub-1', status: 'active', expiresAt: '2099-01-01T00:10:00.000Z' }, presence: { participantId, role: 'host' } }, error: null };
    },
    async getLiveRoom(roomId) {
      calls.get.push(roomId);
      return { success: true, data: { room: { roomId, campaignId: 'camp-1', publicationId: 'pub-1', status: 'active', expiresAt: '2099-01-01T00:10:00.000Z' } }, error: null };
    },
    async getLiveRoomRoster(roomId, participantId) {
      calls.roster.push([roomId, participantId]);
      return { success: true, data: { room: { roomId, campaignId: 'camp-1', publicationId: 'pub-1', status: 'active', expiresAt: '2099-01-01T00:10:00.000Z' }, roster: { generatedAt: '2099-01-01T00:00:00.000Z', registeredParticipantCount: 2, activeParticipantCount: 2, activePlayerCount: 1, hostConnected: true, participants: [{ participantId, role: 'host', joinedAt: '2099-01-01T00:00:00.000Z', lastSeenAt: '2099-01-01T00:00:00.000Z', connected: true }, { participantId: 'player-1', role: 'player', joinedAt: '2099-01-01T00:00:00.000Z', lastSeenAt: '2099-01-01T00:00:00.000Z', connected: true }] } }, error: null };
    },
    forgetCapability(roomId, participantId) { calls.forget.push([roomId, participantId]); return true; }
  };
  Object.assign(client, overrides);
  client.calls = calls;
  return client;
}

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

const publication = { available: true, campaignId: 'camp-1', publicationId: 'pub-1', href: '../index.html?campaignId=camp-1&publicationId=pub-1', missionOrder: ['energy','greenhouse'] };

(async () => {
  {
    const client = makeClient({ available() { return false; } });
    const controller = api.createHostController({ client, storage: makeStorage(), participantIdFactory: () => 'host-1', setIntervalImpl: () => 5, clearIntervalImpl: () => {} });
    equal(controller.getState().status, 'UNAVAILABLE', 'unavailable client initial state');
    controller.setPublication(publication);
    equal(controller.getState().status, 'UNAVAILABLE', 'unavailable client remains unavailable');
    await controller.createRoom();
    equal(client.calls.create.length, 0, 'unavailable client does not create room');
  }

  {
    const client = makeClient();
    const storage = makeStorage();
    const intervals = [];
    const cleared = [];
    const states = [];
    const controller = api.createHostController({
      client,
      storage,
      participantIdFactory: () => 'host-1',
      campaignNameProvider: () => 'Campaña Polar',
      setIntervalImpl(fn, ms) { intervals.push({ fn, ms }); return 77; },
      clearIntervalImpl(id) { cleared.push(id); },
      now: () => 123456,
      baseHref: 'https://example.test/studio/index.html',
      onStateChange(s) { states.push(s); }
    });
    equal(controller.getState().status, 'IDLE', 'available client initial state');
    controller.setPublication(publication);
    equal(controller.getState().status, 'READY', 'publication enables room creation');
    equal(controller.getState().publication.campaignId, 'camp-1', 'publication campaign stored');
    equal(controller.getState().publication.publicationId, 'pub-1', 'publication id stored');
    equal(controller.getState().publication.missionOrder.join(','), 'energy,greenhouse', 'publication mission order stored');
    const result = await controller.createRoom();
    equal(result.status, 'ACTIVE', 'successful create becomes active');
    equal(result.room.roomId, 'room-abc', 'created room stored');
    equal(result.participantId, 'host-1', 'host participant id stored');
    equal(result.lastHeartbeatAt, 123456, 'create records initial host activity time');
    equal(client.calls.create.length, 1, 'create called once');
    equal(client.calls.create[0][0], 'camp-1', 'create campaign argument');
    equal(client.calls.create[0][1], 'pub-1', 'create publication argument');
    equal(client.calls.create[0][2], 'host-1', 'create participant argument');
    equal(storage.setCalls(), 1, 'host context stored once');
    equal(storage.inspect().roomId, 'room-abc', 'stored context room id');
    equal(storage.inspect().participantId, 'host-1', 'stored context participant id');
    equal(storage.inspect().campaignId, 'camp-1', 'stored context campaign id');
    equal(storage.inspect().publicationId, 'pub-1', 'stored context publication id');
    equal(storage.inspect().missionOrder.join(','), 'energy,greenhouse', 'stored context keeps nonsecret publication mission order');
    equal(storage.inspect().campaignName, 'Campaña Polar', 'stored context campaign name');
    check(storage.inspect().playerHref.includes('roomId=room-abc'), 'stored player link carries room id');
    check(!Object.prototype.hasOwnProperty.call(storage.inspect(), 'capabilityToken'), 'host context stores no capabilityToken');
    check(!JSON.stringify(storage.inspect()).includes('secret'), 'host context stores no secret marker');
    equal(intervals.length, 2, 'heartbeat and roster timers started');
    equal(intervals.filter(i => i.ms === 120000).length, 1, 'heartbeat timer uses two minutes');
    equal(intervals.filter(i => i.ms === 30000).length, 1, 'roster timer uses thirty seconds');
    check(result.playerHref.includes('campaignId=camp-1'), 'player href keeps campaign id');
    check(result.playerHref.includes('publicationId=pub-1'), 'player href keeps publication id');
    check(result.playerHref.includes('roomId=room-abc'), 'player href adds room id');
    check(Object.isFrozen(result), 'state snapshot frozen');
    check(states.some(s => s.status === 'CREATING'), 'creating transition emitted');
    check(states.some(s => s.status === 'ACTIVE'), 'active transition emitted');
    await controller.refreshRoster();
    check(client.calls.roster.length >= 1, 'roster requested after room creation');
    equal(client.calls.roster[client.calls.roster.length - 1][0], 'room-abc', 'roster room id');
    equal(client.calls.roster[client.calls.roster.length - 1][1], 'host-1', 'roster host participant id');
    equal(controller.getState().roster.activePlayerCount, 1, 'roster active player count stored');
    equal(controller.getState().lastRosterError, null, 'successful roster clears roster error');

    await controller.heartbeat();
    equal(client.calls.heartbeat.length, 1, 'manual heartbeat called once');
    equal(client.calls.heartbeat[0][0], 'room-abc', 'heartbeat room id');
    equal(client.calls.heartbeat[0][1], 'host-1', 'heartbeat participant id');
    equal(controller.getState().status, 'ACTIVE', 'heartbeat keeps room active');
    equal(controller.getState().lastError, null, 'successful heartbeat clears error');

    controller.setPublication({ available: true, campaignId: 'camp-2', publicationId: 'pub-2', href: '../index.html?campaignId=camp-2&publicationId=pub-2' });
    equal(controller.getState().status, 'ACTIVE', 'new publication does not replace active room');
    equal(controller.getState().room.roomId, 'room-abc', 'active room preserved after new publication');
    controller.destroy();
    check(cleared.filter(id => id === 77).length >= 2, 'destroy clears heartbeat and roster timers');
  }

  {
    const client = makeClient();
    const storage = makeStorage();
    const controller = api.createHostController({ client, storage, participantIdFactory: () => 'host-2', setIntervalImpl: () => 1, clearIntervalImpl: () => {} });
    const response = await controller.createRoom();
    equal(response.status, 'NO_PUBLICATION', 'create without publication is blocked');
    equal(client.calls.create.length, 0, 'create without publication makes no network create');
    equal(response.lastError.code, 'PUBLICATION_REQUIRED', 'missing publication error code');
  }

  {
    const client = makeClient();
    const controller = api.createHostController({ client, storage: makeStorage(), participantIdFactory: () => '', setIntervalImpl: () => 1, clearIntervalImpl: () => {} });
    controller.setPublication(publication);
    const response = await controller.createRoom();
    equal(response.status, 'ERROR', 'empty host id blocks room');
    equal(response.lastError.code, 'HOST_ID_UNAVAILABLE', 'host id failure code');
    equal(client.calls.create.length, 0, 'host id failure makes no create request');
  }

  {
    const client = makeClient({ async createLiveRoom(campaignId, publicationId, participantId) { this.calls.create.push([campaignId, publicationId, participantId]); return { success:false, data:null, error:{code:'SERVER_ERROR',message:'fail',retryable:true} }; } });
    const controller = api.createHostController({ client, storage: makeStorage(), participantIdFactory: () => 'host-3', setIntervalImpl: () => 1, clearIntervalImpl: () => {} });
    controller.setPublication(publication);
    const response = await controller.createRoom();
    equal(response.status, 'ERROR', 'remote create failure becomes error');
    equal(response.lastError.code, 'SERVER_ERROR', 'remote create error preserved');
    equal(response.room, null, 'failed create exposes no room');
  }

  {
    const client = makeClient();
    const storage = makeStorage(null, false);
    const controller = api.createHostController({ client, storage, participantIdFactory: () => 'host-4', setIntervalImpl: () => 1, clearIntervalImpl: () => {} });
    controller.setPublication(publication);
    const response = await controller.createRoom();
    equal(response.status, 'ERROR', 'context storage failure becomes error');
    equal(response.lastError.code, 'HOST_CONTEXT_STORAGE_UNAVAILABLE', 'context storage error code');
    equal(client.calls.forget.length, 1, 'context storage failure forgets capability');
    equal(client.calls.forget[0][0], 'room-abc', 'forgotten capability room id');
    equal(client.calls.forget[0][1], 'host-4', 'forgotten capability participant id');
  }

  {
    const client = makeClient();
    const storage = makeStorage({ version:1, roomId:'room-restored', participantId:'host-restored', campaignId:'camp-1', publicationId:'pub-1', runtimeHref:'../index.html?campaignId=camp-1&publicationId=pub-1', missionOrder:['energy','greenhouse'], playerHref:'https://example.test/index.html?campaignId=camp-1&publicationId=pub-1&roomId=room-restored' });
    let intervalMs = null;
    const controller = api.createHostController({ client, storage, setIntervalImpl(fn, ms){ intervalMs = ms; return 9; }, clearIntervalImpl: () => {}, now: () => 777 });
    const response = await controller.restore();
    equal(client.calls.get.length, 1, 'restore gets room once');
    equal(client.calls.get[0], 'room-restored', 'restore gets saved room id');
    equal(client.calls.create.length, 0, 'restore never creates a replacement room');
    equal(client.calls.heartbeat.length, 1, 'restore immediately heartbeats host');
    equal(client.calls.roster.length, 1, 'restore immediately reads roster');
    equal(client.calls.heartbeat[0][1], 'host-restored', 'restore heartbeat uses saved participant');
    equal(response.status, 'ACTIVE', 'restore returns active');
    equal(response.participantId, 'host-restored', 'restore preserves host participant');
    equal(response.publication.missionOrder.join(','), 'energy,greenhouse', 'restore preserves saved mission order');
    check(intervalMs === 120000 || intervalMs === 30000, 'restore starts live-room intervals');
    equal(response.roster.activePlayerCount, 1, 'restore returns current player count');
  }

  {
    const client = makeClient({ async getLiveRoom(roomId) { this.calls.get.push(roomId); return { success:false, data:null, error:{code:'ROOM_EXPIRED',message:'Esta sesión finalizó por inactividad.',retryable:false} }; } });
    const storage = makeStorage({ version:1, roomId:'room-old', participantId:'host-old', campaignId:'camp-1', publicationId:'pub-1', runtimeHref:'../index.html?campaignId=camp-1&publicationId=pub-1', playerHref:'https://example.test/index.html?roomId=room-old' });
    const controller = api.createHostController({ client, storage, setIntervalImpl: () => 1, clearIntervalImpl: () => {} });
    const response = await controller.restore();
    equal(response.status, 'EXPIRED', 'expired restore stays expired');
    equal(response.lastError.code, 'ROOM_EXPIRED', 'expired restore error code');
    equal(storage.clearCalls(), 1, 'expired restore clears host context');
    equal(client.calls.forget.length, 1, 'expired restore forgets capability');
    equal(client.calls.create.length, 0, 'expired restore does not recreate room');
  }

  {
    const client = makeClient({ async getLiveRoom(roomId) { this.calls.get.push(roomId); return { success:true, data:{room:{roomId,campaignId:'other-campaign',publicationId:'pub-1',status:'active'}}, error:null }; } });
    const storage = makeStorage({ version:1, roomId:'room-mismatch', participantId:'host-mismatch', campaignId:'camp-1', publicationId:'pub-1', runtimeHref:'../index.html?campaignId=camp-1&publicationId=pub-1', playerHref:'https://example.test/index.html?roomId=room-mismatch' });
    const controller = api.createHostController({ client, storage, setIntervalImpl: () => 1, clearIntervalImpl: () => {} });
    const response = await controller.restore();
    equal(response.status, 'ERROR', 'publication mismatch fails restore');
    equal(response.lastError.code, 'ROOM_PUBLICATION_MISMATCH', 'publication mismatch code');
    equal(storage.clearCalls(), 1, 'publication mismatch clears context');
    equal(client.calls.forget.length, 1, 'publication mismatch forgets capability');
  }

  {
    const client = makeClient();
    const storage = makeStorage();
    const controller = api.createHostController({ client, storage, participantIdFactory: () => 'host-single-flight', setIntervalImpl: () => 1, clearIntervalImpl: () => {} });
    controller.setPublication(publication);
    await controller.createRoom();
    let resolveHeartbeat;
    const heartbeatGate = new Promise(resolve => { resolveHeartbeat = resolve; });
    let resolveRoster;
    const rosterGate = new Promise(resolve => { resolveRoster = resolve; });
    client.heartbeatLiveRoom = async function(roomId, participantId) { this.calls.heartbeat.push([roomId, participantId]); return heartbeatGate; };
    client.getLiveRoomRoster = async function(roomId, participantId) { this.calls.roster.push([roomId, participantId]); return rosterGate; };
    const firstHeartbeat = controller.heartbeat();
    const secondHeartbeat = controller.heartbeat();
    const firstRoster = controller.refreshRoster();
    const secondRoster = controller.refreshRoster();
    check(firstHeartbeat === secondHeartbeat, 'Studio concurrent heartbeats share one promise');
    check(firstRoster === secondRoster, 'Studio concurrent roster reads share one promise');
    equal(client.calls.heartbeat.length, 1, 'Studio concurrent heartbeats make one request');
    equal(client.calls.roster.length, 2, 'Studio concurrent roster reads add one request after initial roster');
    resolveHeartbeat({ success:true, data:{room:{roomId:'room-abc',campaignId:'camp-1',publicationId:'pub-1',status:'active'}}, error:null });
    resolveRoster({ success:true, data:{roster:{activePlayerCount:1,participants:[]}}, error:null });
    await Promise.all([firstHeartbeat, secondHeartbeat, firstRoster, secondRoster]);
    const thirdHeartbeat = controller.heartbeat();
    const thirdRoster = controller.refreshRoster();
    equal(client.calls.heartbeat.length, 2, 'Studio heartbeat single-flight releases after completion');
    equal(client.calls.roster.length, 3, 'Studio roster single-flight releases after completion');
    await Promise.all([thirdHeartbeat, thirdRoster]);
    let rejectHeartbeat;
    const rejectedHeartbeatGate = new Promise((resolve, reject) => { rejectHeartbeat = reject; });
    let rejectRoster;
    const rejectedRosterGate = new Promise((resolve, reject) => { rejectRoster = reject; });
    client.heartbeatLiveRoom = async function(roomId, participantId) { this.calls.heartbeat.push([roomId, participantId]); return rejectedHeartbeatGate; };
    client.getLiveRoomRoster = async function(roomId, participantId) { this.calls.roster.push([roomId, participantId]); return rejectedRosterGate; };
    const failedHeartbeatFirst = controller.heartbeat();
    const failedHeartbeatSecond = controller.heartbeat();
    const failedRosterFirst = controller.refreshRoster();
    const failedRosterSecond = controller.refreshRoster();
    check(failedHeartbeatFirst === failedHeartbeatSecond, 'Studio rejected heartbeats share one promise');
    check(failedRosterFirst === failedRosterSecond, 'Studio rejected roster reads share one promise');
    equal(client.calls.heartbeat.length, 3, 'Studio rejected heartbeats make one request');
    equal(client.calls.roster.length, 4, 'Studio rejected roster reads make one request');
    rejectHeartbeat(new Error('heartbeat rejected'));
    rejectRoster(new Error('roster rejected'));
    const failedOutcomes = await Promise.allSettled([failedHeartbeatFirst, failedHeartbeatSecond, failedRosterFirst, failedRosterSecond]);
    check(failedOutcomes.every(outcome => outcome.status === 'rejected'), 'Studio shared rejections reach all callers');
    client.heartbeatLiveRoom = async function(roomId, participantId) { this.calls.heartbeat.push([roomId, participantId]); return {success:true,data:{room:{roomId,status:'active'}},error:null}; };
    client.getLiveRoomRoster = async function(roomId, participantId) { this.calls.roster.push([roomId, participantId]); return {success:true,data:{roster:{activePlayerCount:1,participants:[]}},error:null}; };
    await Promise.all([controller.heartbeat(), controller.refreshRoster()]);
    equal(client.calls.heartbeat.length, 4, 'Studio heartbeat single-flight releases after rejection');
    equal(client.calls.roster.length, 5, 'Studio roster single-flight releases after rejection');
  }

  {
    const client = makeClient();
    const storage = makeStorage();
    let clearedTimer = false;
    const controller = api.createHostController({ client, storage, participantIdFactory: () => 'host-expire', setIntervalImpl: () => 33, clearIntervalImpl(id){ if (id === 33) clearedTimer = true; } });
    controller.setPublication(publication);
    await controller.createRoom();
    client.heartbeatLiveRoom = async function(roomId, participantId) { this.calls.heartbeat.push([roomId, participantId]); return { success:false, data:null, error:{code:'ROOM_EXPIRED',message:'Esta sesión finalizó por inactividad.',retryable:false} }; };
    const response = await controller.heartbeat();
    equal(response.status, 'EXPIRED', 'expired heartbeat transitions to expired');
    equal(response.lastError.message, 'Esta sesión finalizó por inactividad.', 'expired heartbeat keeps UX message');
    equal(storage.clearCalls(), 1, 'expired heartbeat clears host context');
    equal(client.calls.forget.length, 1, 'expired heartbeat forgets capability');
    check(clearedTimer, 'expired heartbeat stops timer');
    equal(response.room, null, 'expired heartbeat removes room from active state');
  }


  {
    const client = makeClient({ async getLiveRoomRoster(roomId, participantId) { this.calls.roster.push([roomId, participantId]); return { success:false, data:null, error:{code:'SERVER_ERROR',message:'temporary',retryable:true} }; } });
    const controller = api.createHostController({ client, storage: makeStorage(), participantIdFactory: () => 'host-roster-transient', setIntervalImpl: () => 12, clearIntervalImpl: () => {}, now: () => 999 });
    controller.setPublication(publication);
    await controller.createRoom();
    const response = await controller.refreshRoster();
    equal(response.status, 'ACTIVE', 'transient roster failure keeps room active');
    equal(response.lastRosterError.code, 'SERVER_ERROR', 'transient roster error preserved separately');
    equal(response.room.roomId, 'room-abc', 'transient roster failure preserves room');
  }

  {
    const client = makeClient({ async getLiveRoomRoster(roomId, participantId) { this.calls.roster.push([roomId, participantId]); return { success:false, data:null, error:{code:'ROOM_EXPIRED',message:'Esta sesión finalizó por inactividad.',retryable:false} }; } });
    const storage = makeStorage();
    const cleared = [];
    const controller = api.createHostController({ client, storage, participantIdFactory: () => 'host-roster-expired', setIntervalImpl: (() => { let id=40; return () => ++id; })(), clearIntervalImpl: id => cleared.push(id) });
    controller.setPublication(publication);
    await controller.createRoom();
    const response = await controller.refreshRoster();
    equal(response.status, 'EXPIRED', 'expired roster transitions room to expired');
    equal(response.lastRosterError.code, 'ROOM_EXPIRED', 'expired roster error preserved');
    equal(response.room, null, 'expired roster clears active room');
    equal(storage.clearCalls(), 1, 'expired roster clears host context');
    equal(client.calls.forget.length, 1, 'expired roster forgets host capability');
    check(cleared.length >= 2, 'expired roster stops live timers');
  }

  {
    const client = makeClient({ async getLiveRoomRoster(roomId, participantId) { this.calls.roster.push([roomId, participantId]); return { success:false, data:null, error:{code:'HOST_REQUIRED',message:'Only the LiveRoom host can read the participant roster.',retryable:false} }; } });
    const storage = makeStorage();
    const controller = api.createHostController({ client, storage, participantIdFactory: () => 'host-roster-denied', setIntervalImpl: () => 8, clearIntervalImpl: () => {} });
    controller.setPublication(publication);
    await controller.createRoom();
    const response = await controller.refreshRoster();
    equal(response.status, 'ERROR', 'host-required roster failure closes invalid host context');
    equal(response.lastError.code, 'HOST_REQUIRED', 'host-required roster error surfaced');
    equal(storage.clearCalls(), 1, 'host-required roster failure clears context');
  }

  {
    const client = makeClient();
    const storage = makeStorage();
    const controller = api.createHostController({ client, storage, participantIdFactory: () => 'host-race', setIntervalImpl: () => 1, clearIntervalImpl: () => {} });
    controller.setPublication(publication);
    await controller.createRoom();
    const delayedRoster = createDeferred();
    client.getLiveRoomRoster = async function(roomId, participantId) { this.calls.roster.push([roomId, participantId]); return delayedRoster.promise; };
    client.heartbeatLiveRoom = async function(roomId, participantId) { this.calls.heartbeat.push([roomId, participantId]); return { success:false, data:null, error:{code:'ROOM_EXPIRED',message:'Esta sesión finalizó por inactividad.',retryable:false} }; };
    const staleRosterPromise = controller.refreshRoster();
    const expired = await controller.heartbeat();
    equal(expired.status, 'EXPIRED', 'terminal heartbeat expires Studio host controller');
    delayedRoster.resolve({ success:true, data:{roster:{activePlayerCount:3,participants:[]}}, error:null });
    await staleRosterPromise;
    equal(controller.getState().status, 'EXPIRED', 'late roster success does not reactivate Studio host controller');
  }

  {
    const states = [];
    const client = makeClient();
    const storage = makeStorage();
    const controller = api.createHostController({ client, storage, participantIdFactory: () => 'host-destroy', setIntervalImpl: () => 1, clearIntervalImpl: () => {}, onStateChange(state) { states.push(state); } });
    controller.setPublication(publication);
    await controller.createRoom();
    const before = states.length;
    const delayedHeartbeat = createDeferred();
    client.heartbeatLiveRoom = async function(roomId, participantId) { this.calls.heartbeat.push([roomId, participantId]); return delayedHeartbeat.promise; };
    const pending = controller.heartbeat();
    controller.destroy();
    delayedHeartbeat.resolve({ success:true, data:{room:{roomId:'room-abc',campaignId:'camp-1',publicationId:'pub-1',status:'active'}}, error:null });
    await pending;
    equal(states.length, before, 'late response after destroy emits no new Studio host state');
    equal(controller.getState().status, 'ACTIVE', 'late response after destroy does not change Studio host state snapshot');
  }

  {
    const client = makeClient();
    const storage = makeStorage();
    const controller = api.createHostController({ client, storage, participantIdFactory: () => 'host-identity', setIntervalImpl: () => 1, clearIntervalImpl: () => {} });
    controller.setPublication(publication);
    await controller.createRoom();
    const firstDeferred = createDeferred();
    const secondDeferred = createDeferred();
    let heartbeatCallIndex = 0;
    client.heartbeatLiveRoom = async function(roomId, participantId) {
      this.calls.heartbeat.push([roomId, participantId]);
      heartbeatCallIndex += 1;
      return heartbeatCallIndex === 1 ? firstDeferred.promise : secondDeferred.promise;
    };
    const first = controller.heartbeat();
    const restorePromise = controller.restore();
    for (let index = 0; index < 8; index += 1) await Promise.resolve();
    check(client.calls.heartbeat.length >= 2, 'Studio restore reached second heartbeat request');
    const second = controller.heartbeat();
    check(first !== second, 'Studio lifecycle reset creates new in-flight heartbeat promise');
    firstDeferred.resolve({ success:true, data:{room:{roomId:'room-abc',campaignId:'camp-1',publicationId:'pub-1',status:'active'}}, error:null });
    await first;
    const shared = controller.heartbeat();
    check(shared === second, 'Studio old heartbeat resolution does not release newer promise');
    secondDeferred.resolve({ success:true, data:{room:{roomId:'room-abc',campaignId:'camp-1',publicationId:'pub-1',status:'active'}}, error:null });
    await Promise.all([second, shared, restorePromise]);
  }

  {
    let currentNow = 1000;
    const client = makeClient();
    const storage = makeStorage();
    const controller = api.createHostController({ client, storage, participantIdFactory: () => 'host-foreground', setIntervalImpl: () => 1, clearIntervalImpl: () => {}, now: () => currentNow });
    controller.setPublication(publication);
    await controller.createRoom();
    equal(controller.getState().status, 'ACTIVE', 'Studio foreground gating starts from active state');
    const heartbeatA = createDeferred();
    const heartbeatB = createDeferred();
    const heartbeatC = createDeferred();
    const rosterA = createDeferred();
    const rosterB = createDeferred();
    const rosterC = createDeferred();
    const heartbeatQueue = [heartbeatA, heartbeatB, heartbeatC];
    const rosterQueue = [rosterA, rosterB, rosterC];
    client.calls.heartbeat = [];
    client.calls.roster = [];
    client.heartbeatLiveRoom = async function(roomId, participantId) {
      this.calls.heartbeat.push([roomId, participantId]);
      const next = heartbeatQueue.shift();
      return next ? next.promise : { success:true, data:{room:{roomId:roomId,campaignId:'camp-1',publicationId:'pub-1',status:'active'}}, error:null };
    };
    client.getLiveRoomRoster = async function(roomId, participantId) {
      this.calls.roster.push([roomId, participantId]);
      const next = rosterQueue.shift();
      return next ? next.promise : { success:true, data:{roster:{activePlayerCount:1,participants:[]}}, error:null };
    };
    equal(controller.refreshAfterForeground(), true, 'Studio foreground first call accepted');
    heartbeatA.resolve({ success:true, data:{room:{roomId:'room-abc',campaignId:'camp-1',publicationId:'pub-1',status:'active'}}, error:null });
    rosterA.resolve({ success:true, data:{roster:{activePlayerCount:1,participants:[]}}, error:null });
    await Promise.all([controller.heartbeat(), controller.refreshRoster()]);
    await Promise.resolve();
    await Promise.resolve();
    equal(client.calls.heartbeat.length, 1, 'Studio foreground first call triggers heartbeat');
    equal(client.calls.roster.length, 1, 'Studio foreground first call triggers roster');
    currentNow = 20000;
    equal(controller.refreshAfterForeground(), false, 'Studio foreground under 30s rejected');
    equal(client.calls.heartbeat.length, 1, 'Studio foreground under 30s does not trigger heartbeat');
    equal(client.calls.roster.length, 1, 'Studio foreground under 30s does not trigger roster');
    currentNow = 31000;
    equal(controller.refreshAfterForeground(), true, 'Studio foreground at 30s accepted');
    heartbeatB.resolve({ success:true, data:{room:{roomId:'room-abc',campaignId:'camp-1',publicationId:'pub-1',status:'active'}}, error:null });
    rosterB.resolve({ success:true, data:{roster:{activePlayerCount:1,participants:[]}}, error:null });
    await Promise.all([controller.heartbeat(), controller.refreshRoster()]);
    await Promise.resolve();
    await Promise.resolve();
    equal(client.calls.heartbeat.length, 2, 'Studio foreground at 30s triggers heartbeat');
    equal(client.calls.roster.length, 2, 'Studio foreground at 30s triggers roster');
    currentNow = 1;
    equal(controller.refreshAfterForeground(), true, 'Studio foreground accepts clock rollback');
    heartbeatC.resolve({ success:true, data:{room:{roomId:'room-abc',campaignId:'camp-1',publicationId:'pub-1',status:'active'}}, error:null });
    rosterC.resolve({ success:true, data:{roster:{activePlayerCount:1,participants:[]}}, error:null });
    await Promise.all([controller.heartbeat(), controller.refreshRoster()]);
    await Promise.resolve();
    await Promise.resolve();
  }

  check(source.includes("start.textContent = 'Iniciar partida'"), 'visible start button label exists');
  check(source.includes("startButton.textContent = active ? 'Abrir consola de mando' : 'Iniciar partida'"), 'active Studio action opens command console');
  check(source.includes("new URL('../host/', base)"), 'Studio builds separate host console route');
  check(source.includes("window.location.assign(consoleHref)"), 'Studio redirects host after room creation');
  check(source.includes('ROSTER_REFRESH_INTERVAL_MS = 30 * 1000'), 'roster refresh interval source present');
  check(source.includes('FOREGROUND_REFRESH_MIN_INTERVAL_MS = 30 * 1000'), 'foreground refresh interval source present');
  check(source.includes('client.getLiveRoomRoster(roomId, participantId)'), 'host controller reads roster with host identity');
  check(source.includes("Esta sesión finalizó por inactividad."), 'expired UX message exists');
  check(!/prompt\s*\(/.test(source), 'host flow never prompts for credentials');
  check(!/password/i.test(source), 'host flow contains no password input concept');
  check(!/deleteLiveRoom|stopLiveRoom|closeLiveRoom/.test(source), 'host flow adds no destructive room operation');
  check(source.includes("url.searchParams.set('roomId', id)"), 'student URL carries roomId');
  check(source.includes('controller.refreshAfterForeground();'), 'visibility and focus listeners route through foreground gate');
  check(!source.includes("controller.heartbeat(); controller.refreshRoster();"), 'visibility/focus listeners avoid direct heartbeat and roster calls');
  check(source.includes('refreshAfterForeground: refreshAfterForeground'), 'Studio controller exposes refreshAfterForeground');
  check(source.includes("campaignName: text(campaignNameProvider())"), 'host context stores display campaign name without secrets');
  check(source.includes("document.getElementById('campaign-name-input')"), 'Studio supplies visible campaign name to host context');
  check(source.includes('publicationApi.getPublication(launch.publicationId)'), 'Studio reads exact cached immutable publication');
  check(source.includes('content.runtimeExecutionManifest'), 'Studio extracts runtime mission order from publication manifest');
  check(source.includes('missionOrder: normalizedMissionOrder'), 'Studio stores only validated mission order in host context');
  check(!source.includes('capabilityToken'), 'Studio host context code handles no capability token');

  console.log('STUDIO_LIVE_ROOM_HOST_TEST_TOTAL=' + total);
  console.log('STUDIO_LIVE_ROOM_HOST_TEST_FAILED=' + failed);
  console.log('STUDIO_LIVE_ROOM_HOST_TEST_STATUS=' + (failed === 0 ? 'PASS' : 'FAIL'));
  process.exitCode = failed === 0 ? 0 : 1;
})().catch((error) => {
  console.error(error && error.stack || error);
  process.exitCode = 1;
});
