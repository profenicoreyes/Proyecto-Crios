const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = process.argv[2] || path.resolve(__dirname, '..');
const sourcePath = path.join(root, 'js', 'runtime', 'live-room', 'runtime-live-room-player.js');
const source = fs.readFileSync(sourcePath, 'utf8');

let total = 0;
let failed = 0;
function check(condition, label) {
  total += 1;
  if (!condition) {
    failed += 1;
    console.error('FAIL', label);
  }
}
function eq(actual, expected, label) { check(actual === expected, `${label} expected=${expected} actual=${actual}`); }

const listeners = {};
const documentStub = {
  readyState: 'loading',
  visibilityState: 'visible',
  addEventListener(type, fn) { listeners[type] = fn; },
  getElementById() { return null; },
  createElement() { throw new Error('not expected during module load'); },
  body: { appendChild() {} }
};
const windowStub = {
  document: documentStub,
  location: { search: '', href: 'http://localhost:4173/' },
  setInterval,
  clearInterval,
  sessionStorage: null,
  crypto: { randomUUID: () => 'uuid-test' }
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
  setInterval,
  clearInterval
};
vm.createContext(context);
vm.runInContext(source, context, { filename: sourcePath });
const api = windowStub.CRIOS_RUNTIME_LIVE_ROOM_PLAYER;

check(Boolean(api), 'API exported');
eq(api.version, '1.0.0', 'version');
eq(api.heartbeatIntervalMs, 120000, 'heartbeat interval');
eq(api.contextKey, 'crios-live-room-player-context-v1', 'context key');
eq(api.expiredMessage, 'Esta sesión finalizó por inactividad.', 'expired message');
check(typeof api.parseRoomLaunch === 'function', 'parseRoomLaunch exported');
check(typeof api.createPlayerController === 'function', 'createPlayerController exported');
check(typeof api.createStatusPanel === 'function', 'createStatusPanel exported');
check(typeof api.renderStatus === 'function', 'renderStatus exported');
check(typeof api.bootstrapUi === 'function', 'bootstrapUi exported');
check(typeof listeners.DOMContentLoaded === 'function', 'DOMContentLoaded bootstrap registered');

const published = Object.freeze({ blocked:false, sourceMode:'published', campaignId:'campaign-a', publicationId:'publication-a' });
let parsed = api.parseRoomLaunch('?source=published&campaignId=campaign-a&publicationId=publication-a', published);
eq(parsed.requested, false, 'no room not requested');
eq(parsed.valid, true, 'no room remains valid');
eq(parsed.roomId, null, 'no room id null');
check(Object.isFrozen(parsed), 'parse result frozen');

parsed = api.parseRoomLaunch('?source=published&campaignId=campaign-a&publicationId=publication-a&roomId=room-1', published);
eq(parsed.requested, true, 'room requested');
eq(parsed.valid, true, 'valid room link');
eq(parsed.roomId, 'room-1', 'room id parsed');
eq(parsed.campaignId, 'campaign-a', 'campaign from runtime launch');
eq(parsed.publicationId, 'publication-a', 'publication from runtime launch');
eq(parsed.error, null, 'valid link has no error');

let invalid = api.parseRoomLaunch('?roomId=a&roomId=b', published);
eq(invalid.requested, true, 'duplicate room requested');
eq(invalid.valid, false, 'duplicate room rejected');
eq(invalid.error.code, 'INVALID_ROOM_LINK', 'duplicate error code');
invalid = api.parseRoomLaunch('?roomId=room-1', {blocked:false,sourceMode:'legacy',campaignId:'campaign-a',publicationId:'publication-a'});
eq(invalid.valid, false, 'legacy room link rejected');
invalid = api.parseRoomLaunch('?roomId=room-1', {blocked:true,sourceMode:'published',campaignId:'campaign-a',publicationId:'publication-a'});
eq(invalid.valid, false, 'blocked runtime rejected');
invalid = api.parseRoomLaunch('?roomId=room-1', {blocked:false,sourceMode:'published',campaignId:'',publicationId:'publication-a'});
eq(invalid.valid, false, 'missing campaign rejected');
invalid = api.parseRoomLaunch('?roomId=' + 'x'.repeat(161), published);
eq(invalid.valid, false, 'oversized room rejected');

function makeStorage(initial) {
  let value = initial || null;
  let available = true;
  return {
    available: () => available,
    get: () => value,
    set(v) { value = JSON.parse(JSON.stringify(v)); return true; },
    clear() { value = null; return true; },
    inspect: () => value,
    setAvailable(v) { available = v; }
  };
}
function room(last='2026-08-13T23:00:00.000Z') {
  return {roomId:'room-1',campaignId:'campaign-a',publicationId:'publication-a',createdAt:'2026-08-13T22:00:00.000Z',lastActivityAt:last,expiresAt:'2026-08-13T23:10:00.000Z',status:'active'};
}
function presence(id, role='player') { return {roomId:'room-1',participantId:id,role,joinedAt:'2026-08-13T23:00:00.000Z',lastSeenAt:'2026-08-13T23:00:00.000Z'}; }
function successRoom(data) { return {success:true,data,error:null,requestId:'r'}; }
function failure(code, message=code) { return {success:false,data:null,error:{code,message,retryable:false},requestId:'r'}; }
function makeTimer() {
  let cb = null; let ms = null; let cleared = 0;
  return {
    set(fn, delay) { cb = fn; ms = delay; return 77; },
    clear(id) { if (id === 77) cleared += 1; cb = null; },
    fire() { if (cb) return cb(); },
    ms: () => ms,
    cleared: () => cleared,
    active: () => Boolean(cb)
  };
}

(async () => {
  const launch = api.parseRoomLaunch('?roomId=room-1', published);
  {
    const calls = [];
    const storage = makeStorage();
    const timer = makeTimer();
    let now = 1000;
    const client = {
      available: () => true,
      async getLiveRoom(id) { calls.push(['get', id]); return successRoom({room:room()}); },
      async joinLiveRoom(id, participantId) { calls.push(['join', id, participantId]); return successRoom({room:room(),presence:presence(participantId)}); },
      async heartbeatLiveRoom(id, participantId) { calls.push(['heartbeat', id, participantId]); return successRoom({room:room('2026-08-13T23:02:00.000Z'),presence:presence(participantId)}); },
      forgetCapability(id, participantId) { calls.push(['forget', id, participantId]); return true; }
    };
    const states = [];
    const controller = api.createPlayerController({client,storage,participantIdFactory:()=> 'player-abc',setIntervalImpl:timer.set,clearIntervalImpl:timer.clear,now:()=>now,onStateChange:s=>states.push(s)});
    check(Object.isFrozen(controller), 'controller frozen');
    eq(controller.getState().status, 'IDLE', 'initial state idle');
    const active = await controller.start(launch);
    eq(active.status, 'ACTIVE', 'fresh join active');
    eq(active.participantId, 'player-abc', 'fresh participant id');
    eq(active.room.roomId, 'room-1', 'fresh room retained');
    eq(active.lastHeartbeatAt, 1000, 'fresh join heartbeat timestamp');
    check(Object.isFrozen(active), 'state snapshot frozen');
    eq(calls.length, 2, 'fresh start two remote calls');
    eq(calls[0][0], 'get', 'get before join');
    eq(calls[1][0], 'join', 'join after get');
    eq(calls[1][2], 'player-abc', 'join internal participant');
    const ctx = storage.inspect();
    eq(ctx.version, 1, 'context version');
    eq(ctx.roomId, 'room-1', 'context room');
    eq(ctx.campaignId, 'campaign-a', 'context campaign');
    eq(ctx.publicationId, 'publication-a', 'context publication');
    eq(ctx.participantId, 'player-abc', 'context participant');
    check(!Object.prototype.hasOwnProperty.call(ctx, 'capabilityToken'), 'context has no capabilityToken');
    check(!JSON.stringify(ctx).includes('secret'), 'context contains no secret literal');
    eq(timer.ms(), 120000, 'heartbeat timer interval');
    eq(timer.active(), true, 'heartbeat timer active');
    now = 2000;
    await controller.heartbeat();
    eq(controller.getState().lastHeartbeatAt, 2000, 'manual heartbeat updates timestamp');
    eq(calls[calls.length-1][0], 'heartbeat', 'manual heartbeat remote call');
    controller.destroy();
    eq(timer.active(), false, 'destroy stops timer');
    check(timer.cleared() >= 1, 'destroy clears interval');
    check(states.some(s=>s.status==='CHECKING'), 'checking state emitted');
    check(states.some(s=>s.status==='JOINING'), 'joining state emitted');
    check(states.some(s=>s.status==='ACTIVE'), 'active state emitted');
  }

  {
    const calls = [];
    const storage = makeStorage({version:1,roomId:'room-1',campaignId:'campaign-a',publicationId:'publication-a',participantId:'player-old'});
    const timer = makeTimer();
    const client = {
      available:()=>true,
      async getLiveRoom(id){ calls.push(['get',id]); return successRoom({room:room()}); },
      async joinLiveRoom(id,p){ calls.push(['join',id,p]); return successRoom({room:room(),presence:presence(p)}); },
      async heartbeatLiveRoom(id,p){ calls.push(['heartbeat',id,p]); return successRoom({room:room(),presence:presence(p)}); },
      forgetCapability(){ calls.push(['forget']); return true; }
    };
    const controller = api.createPlayerController({client,storage,participantIdFactory:()=> 'player-new',setIntervalImpl:timer.set,clearIntervalImpl:timer.clear,now:()=>3000});
    const restored = await controller.start(launch);
    eq(restored.status, 'ACTIVE', 'restore active');
    eq(restored.participantId, 'player-old', 'restore same participant');
    eq(calls.length, 2, 'restore two remote calls');
    eq(calls[0][0], 'get', 'restore get first');
    eq(calls[1][0], 'heartbeat', 'restore heartbeat second');
    check(!calls.some(c=>c[0]==='join'), 'restore does not duplicate join');
    eq(storage.inspect().participantId, 'player-old', 'restore context unchanged');
    eq(timer.active(), true, 'restore starts timer');
    controller.destroy();
  }

  {
    const calls=[];
    const storage=makeStorage();
    const client={available:()=>true,async getLiveRoom(){calls.push('get');return successRoom({room:{...room(),publicationId:'other'}})},async joinLiveRoom(){calls.push('join');return successRoom({})},async heartbeatLiveRoom(){calls.push('heartbeat');return successRoom({})}};
    const controller=api.createPlayerController({client,storage,participantIdFactory:()=> 'player-x',setIntervalImpl:()=>1,clearIntervalImpl:()=>{}});
    const result=await controller.start(launch);
    eq(result.status,'INVALID','room publication mismatch invalid');
    eq(result.lastError.code,'ROOM_PUBLICATION_MISMATCH','room mismatch code');
    eq(calls.join(','),'get','mismatch performs get only');
    eq(storage.inspect(),null,'mismatch does not store context');
  }

  {
    const storage=makeStorage();
    const client={available:()=>true,async getLiveRoom(){return failure('ROOM_EXPIRED','old')},async joinLiveRoom(){throw new Error('must not join')},async heartbeatLiveRoom(){throw new Error('must not heartbeat')}};
    const controller=api.createPlayerController({client,storage,setIntervalImpl:()=>1,clearIntervalImpl:()=>{}});
    const result=await controller.start(launch);
    eq(result.status,'EXPIRED','expired get state');
    eq(result.lastError.code,'ROOM_EXPIRED','expired code');
    eq(result.lastError.message,'Esta sesión finalizó por inactividad.','expired exact UX');
  }

  {
    const storage=makeStorage(); storage.setAvailable(false);
    let calls=0;
    const client={available:()=>true,async getLiveRoom(){calls++;return successRoom({room:room()})}};
    const controller=api.createPlayerController({client,storage});
    const result=await controller.start(launch);
    eq(result.status,'ERROR','storage unavailable blocks player');
    eq(result.lastError.code,'PLAYER_CONTEXT_STORAGE_UNAVAILABLE','storage error code');
    eq(calls,0,'storage unavailable performs zero remote calls');
  }

  {
    const storage=makeStorage();
    let calls=0;
    const client={available:()=>false};
    const controller=api.createPlayerController({client,storage});
    eq(controller.getState().status,'UNAVAILABLE','unavailable client initial state');
    const result=await controller.start(launch);
    eq(result.status,'UNAVAILABLE','unavailable client start');
    eq(calls,0,'unavailable client no calls');
  }

  {
    const storage=makeStorage({version:1,roomId:'old-room',campaignId:'old-c',publicationId:'old-p',participantId:'old-player'});
    const calls=[];
    const client={available:()=>true,async getLiveRoom(){calls.push('get');return successRoom({room:room()})},async joinLiveRoom(id,p){calls.push('join');return successRoom({room:room(),presence:presence(p)})},async heartbeatLiveRoom(){calls.push('heartbeat');return successRoom({})},forgetCapability(id,p){calls.push(`forget:${id}:${p}`);return true}};
    const controller=api.createPlayerController({client,storage,participantIdFactory:()=> 'player-new',setIntervalImpl:()=>1,clearIntervalImpl:()=>{}});
    const result=await controller.start(launch);
    eq(result.status,'ACTIVE','mismatched old context replaced');
    check(calls.includes('forget:old-room:old-player'),'old capability forgotten');
    check(calls.includes('join'),'new context joins');
    eq(storage.inspect().participantId,'player-new','new context stored');
  }

  {
    const storage=makeStorage();
    let heartbeatMode='ok';
    const timer=makeTimer();
    const client={available:()=>true,async getLiveRoom(){return successRoom({room:room()})},async joinLiveRoom(id,p){return successRoom({room:room(),presence:presence(p)})},async heartbeatLiveRoom(){if(heartbeatMode==='transient')return failure('LIVE_ROOM_TRANSPORT_FAILED','network');if(heartbeatMode==='expired')return failure('ROOM_EXPIRED','expired');return successRoom({room:room()})},forgetCapability(){return true}};
    const controller=api.createPlayerController({client,storage,participantIdFactory:()=> 'player-z',setIntervalImpl:timer.set,clearIntervalImpl:timer.clear,now:()=>5000});
    await controller.start(launch);
    heartbeatMode='transient';
    let state=await controller.heartbeat();
    eq(state.status,'ACTIVE','transient heartbeat keeps active');
    eq(state.lastError.code,'LIVE_ROOM_TRANSPORT_FAILED','transient error exposed');
    eq(timer.active(),true,'transient keeps timer');
    heartbeatMode='ok';
    state=await controller.heartbeat();
    eq(state.status,'ACTIVE','heartbeat recovers active');
    eq(state.lastError,null,'successful heartbeat clears transient error');
    heartbeatMode='expired';
    state=await controller.heartbeat();
    eq(state.status,'EXPIRED','heartbeat expiry terminal');
    eq(state.lastError.message,'Esta sesión finalizó por inactividad.','heartbeat expiry exact message');
    eq(timer.active(),false,'expiry stops timer');
    eq(storage.inspect(),null,'expiry clears context');
  }

  {
    const storage=makeStorage();
    const client={available:()=>true,async getLiveRoom(){return successRoom({room:room()})},async joinLiveRoom(id,p){return successRoom({room:room(),presence:presence(p,'host')})},forgetCapability(){return true}};
    const controller=api.createPlayerController({client,storage,participantIdFactory:()=> 'player-bad',setIntervalImpl:()=>1,clearIntervalImpl:()=>{}});
    const result=await controller.start(launch);
    eq(result.status,'ERROR','wrong join role rejected');
    eq(result.lastError.code,'PLAYER_JOIN_RESPONSE_INVALID','wrong join role code');
    eq(storage.inspect(),null,'wrong join role not stored');
  }

  {
    const panel={textContent:'',dataset:{}};
    api.renderStatus(panel,{status:'CHECKING'}); eq(panel.textContent,'Partida en vivo · conectando…','checking visible text'); eq(panel.dataset.status,'CHECKING','checking dataset');
    api.renderStatus(panel,{status:'ACTIVE',room:{roomId:'room-1'},lastError:null}); eq(panel.textContent,'Partida en vivo · conectado','active visible text'); eq(panel.dataset.status,'ACTIVE','active dataset'); eq(panel.dataset.roomId,'room-1','active room dataset');
    api.renderStatus(panel,{status:'ACTIVE',room:{roomId:'room-1'},lastError:{code:'x'}}); eq(panel.textContent,'Partida en vivo · conexión inestable','unstable visible text');
    api.renderStatus(panel,{status:'EXPIRED',lastError:{}}); eq(panel.textContent,'Esta sesión finalizó por inactividad.','expired visible text'); eq(panel.dataset.status,'EXPIRED','expired dataset'); check(!('roomId' in panel.dataset),'expired clears room dataset');
    api.renderStatus(panel,{status:'INVALID',lastError:{message:'mismatch'}}); eq(panel.textContent,'mismatch','invalid message visible');
    api.renderStatus(panel,{status:'UNAVAILABLE'}); eq(panel.textContent,'El servicio de partidas en vivo no está disponible.','unavailable text');
  }

  {
    const controller=api.createPlayerController({client:{available:()=>true},storage:makeStorage()});
    const state=await controller.start({requested:false,valid:true});
    eq(state.status,'IDLE','not requested stays idle');
    eq(state.launch,null,'not requested stores no launch');
  }

  const index = fs.readFileSync(path.join(root,'index.html'),'utf8');
  const playerScript = '<script src="js/runtime/live-room/runtime-live-room-player.js?v=20260813a4002b"></script>';
  check(index.includes(playerScript),'runtime index loads player module');
  check(index.indexOf(playerScript) > index.indexOf('<script src="js/crios.js"></script>'),'player module loads after CRIOS');
  eq((index.match(/runtime-live-room-player\.js/g)||[]).length,1,'player module loaded once');
  check(source.includes("client.getLiveRoom(launch.roomId)"),'source preflights room with GET');
  check(source.indexOf('client.getLiveRoom(launch.roomId)') < source.indexOf('client.joinLiveRoom(launch.roomId, participantId)'),'GET occurs before join in source');
  check(source.includes("parseRoomLaunch(window.location && window.location.search || '', crios && crios.runtimeLaunch)"),'bootstrap uses canonical CRIOS runtime launch object');
  check(!source.includes('StudentSession'),'does not reference StudentSession');
  check(!source.includes('sessionData'),'does not reference legacy sessionData');
  check(!source.includes('idSesion'),'does not reference result idSesion');
  check(!source.includes('deleteLiveRoom'),'no delete operation');
  check(!source.includes('activateLiveRoom'),'no room reactivation');
  check(source.includes('HEARTBEAT_INTERVAL_MS = 2 * 60 * 1000'),'2 minute heartbeat constant');
  check(source.includes("if (!launch.requested) return false"),'no roomId bootstrap exits before UI/client actions');

  const doc = fs.readFileSync(path.join(root,'docs','architecture','A4_RUNTIME_LIVE_ROOM_PLAYER_FLOW.md'),'utf8');
  check(doc.includes('StudentSession'),'architecture documents StudentSession separation');
  check(doc.includes('getLiveRoom'),'architecture documents GET preflight');
  check(doc.includes('120 segundos'),'architecture documents heartbeat cadence');
  check(doc.includes('Esta sesión finalizó por inactividad.'),'architecture documents exact expired UX');
  check(doc.includes('Fuera de alcance'),'architecture defines scope boundary');

  console.log(`RUNTIME_LIVE_ROOM_PLAYER_TEST_STATUS=${failed===0?'PASS':'FAIL'}`);
  console.log(`RUNTIME_LIVE_ROOM_PLAYER_TEST_TOTAL=${total}`);
  console.log(`RUNTIME_LIVE_ROOM_PLAYER_TEST_FAILED=${failed}`);
  process.exitCode = failed === 0 ? 0 : 1;
})().catch(error => {
  console.error(error && error.stack || error);
  console.log('RUNTIME_LIVE_ROOM_PLAYER_TEST_STATUS=FAIL');
  console.log(`RUNTIME_LIVE_ROOM_PLAYER_TEST_TOTAL=${total}`);
  console.log(`RUNTIME_LIVE_ROOM_PLAYER_TEST_FAILED=${failed + 1}`);
  process.exitCode = 1;
});
