const fs = require('fs');
const path = require('path');
const vm = require('vm');

const repo = process.argv[2] || path.resolve(__dirname, '..');
const sourcePath = path.join(repo, 'js', 'live-room', 'realtime', 'firebase-live-room-realtime-provider.js');
const rulesPath = path.join(repo, 'firebase', 'realtime-database.rules.json');
const configPath = path.join(repo, 'js', 'config.js');
const hostPath = path.join(repo, 'js', 'host', 'host-console.js');
const hostHtmlPath = path.join(repo, 'host', 'index.html');
const runtimeHtmlPath = path.join(repo, 'index.html');
const source = fs.readFileSync(sourcePath, 'utf8');
const rulesSource = fs.readFileSync(rulesPath, 'utf8');
const configSource = fs.readFileSync(configPath, 'utf8');
const hostSource = fs.readFileSync(hostPath, 'utf8');
const hostHtml = fs.readFileSync(hostHtmlPath, 'utf8');
const runtimeHtml = fs.readFileSync(runtimeHtmlPath, 'utf8');

let total = 0;
let failed = 0;
function check(condition, message){ total += 1; if (!condition) { failed += 1; console.error('FAIL ' + message); } }
function equal(actual, expected, message){ check(actual === expected, `${message} expected=${expected} actual=${actual}`); }
function flush(){ return new Promise((resolve) => setImmediate(resolve)); }
function loadHostFactory(realtimeConfig, firebaseProvider, baseTransport){
  const document = {readyState:'loading',addEventListener(){}};
  const window = {
    document,
    location:{href:'https://example.test/host/'},
    CRIOS_FIREBASE_LIVE_ROOM_REALTIME_PROVIDER:firebaseProvider,
    CRIOS_LIVE_ROOM_REALTIME_TRANSPORT:{createTransport(){ return baseTransport; }},
    setInterval(){ return 1; },
    clearInterval(){},
    addEventListener(){}
  };
  window.window = window;
  const hostContext = {window,document,CRIOS_CONFIG:{realtime:realtimeConfig},URL,URLSearchParams,Object,Array,String,Number,Boolean,JSON,Math,Date,Map,Set,console};
  vm.createContext(hostContext);
  vm.runInContext(hostSource, hostContext, {filename:hostPath});
  return window.CRIOS_HOST_CONSOLE.defaultRealtimeTransportFactory;
}

const listeners = new Map();
const writes = [];
const offs = [];
let anonymousSignIns = 0;
const database = {
  ref(refPath){
    return {
      on(event, callback){ listeners.set(refPath + ':' + event, callback); },
      off(event, callback){ offs.push([refPath, event, callback]); listeners.delete(refPath + ':' + event); },
      set(value){ writes.push([refPath, value]); return Promise.resolve(); }
    };
  }
};
const auth = {
  currentUser:null,
  signInAnonymously(){ anonymousSignIns += 1; this.currentUser = {uid:'firebase-uid-1'}; return Promise.resolve({user:this.currentUser}); }
};
const app = {auth(){ return auth; },database(){ return database; }};
const firebase = {initializeApp(){ return app; },app(){ throw new Error('missing'); }};
const windowStub = {};
const context = {window:windowStub,Object,Array,String,Boolean,JSON,Math,Date,Map,Set,Promise,console};
windowStub.window = windowStub;
vm.createContext(context);
vm.runInContext(source, context, {filename:sourcePath});

const api = windowStub.CRIOS_FIREBASE_LIVE_ROOM_REALTIME_PROVIDER;
const completeConfig = {provider:'firebase',firebase:{apiKey:'test-key',authDomain:'test.firebaseapp.com',databaseURL:'https://test.firebaseio.com',projectId:'test',appId:'test-app'}};
check(Boolean(api), 'Firebase provider API exported');
equal(api.rootPath, 'liveRoomSignals', 'signal root is fixed');
equal(api.signalType, 'presence-change', 'signal type fixed');
equal(api.signalTypes.join(','), 'presence-change,game-state-change', 'exact Firebase signal types fixed');
equal(api.attachRetryMs, 2000, 'attach retry cadence bounded');
equal(api.maxSeenEventIds, 512, 'event dedupe memory bounded');
check(api.isCompleteConfig(completeConfig), 'complete Firebase config accepted');
check(!api.isCompleteConfig({provider:'noop',firebase:completeConfig.firebase}), 'noop provider remains disabled');
check(!api.isCompleteConfig({provider:'firebase',firebase:{projectId:'test'}}), 'partial Firebase config rejected');

const safe = api.signalPayload({type:'presence-change',eventId:'evt-1',emittedAt:'2026-08-17T12:00:00.000Z',roomId:'room-1',capability:'secret',participantId:'host-1',roster:{},progress:{},answers:[],results:{},sessionData:{}});
equal(Object.keys(safe).sort().join(','), 'emittedAt,eventId,type', 'signal payload has only minimum fields');
check(!api.signalPayload({type:'presence-change',eventId:'',emittedAt:'now'}), 'signal requires eventId');
check(!api.signalPayload({type:'unexpected',eventId:'evt-x',emittedAt:'2026-08-17T12:00:00.000Z'}), 'signal rejects unsupported type');
const gameSafe = api.signalPayload({type:'game-state-change',eventId:'game-1',emittedAt:'2026-08-19T12:00:00.000Z',revision:4,completedMissionIds:['energy'],participantId:'player-1'});
equal(Object.keys(gameSafe).sort().join(','), 'emittedAt,eventId,type', 'game-state signal keeps the same minimal payload');
equal(gameSafe.type, 'game-state-change', 'game-state signal type accepted');
check(!JSON.stringify(gameSafe).includes('energy') && !JSON.stringify(gameSafe).includes('player-1'), 'game-state signal strips progress and participant data');

(async()=>{
  const transport = api.createTransport(completeConfig, {firebase});
  let received = null;
  check(transport.subscribeRoom('room-1', (signal) => { received = signal; }), 'complete config subscribes');
  await flush();
  equal(anonymousSignIns, 1, 'anonymous authentication used');
  check(listeners.has('liveRoomSignals/room-1:child_added'), 'room child additions observed');
  check(listeners.has('liveRoomSignals/room-1:child_changed'), 'room child changes observed');

  listeners.get('liveRoomSignals/room-1:child_added')({val(){ return {type:'presence-change',eventId:'evt-2',emittedAt:'2026-08-17T12:01:00.000Z',capability:'must-not-pass'}; }});
  equal(received.eventId, 'evt-2', 'received Firebase signal delivered');
  equal(Object.keys(received).sort().join(','), 'emittedAt,eventId,roomId,type', 'received fields remain signal-only plus bound room id');
  equal(received.roomId, 'room-1', 'received signal is bound to subscribed room');

  check(transport.publishSignal('room-1', safe), 'valid signal accepted for asynchronous write');
  await flush();
  equal(writes.length, 1, 'one Firebase signal written');
  equal(writes[0][0], 'liveRoomSignals/room-1/firebase-uid-1', 'write is scoped to authenticated uid');
  equal(Object.keys(writes[0][1]).sort().join(','), 'emittedAt,eventId,type', 'write excludes CRIOS authoritative data');
  check(!transport.publishSignal('room-1', {type:'presence-change'}), 'incomplete signal rejected');

  transport.destroy();
  equal(offs.length, 2, 'destroy detaches both Firebase listeners');
  check(!transport.subscribeRoom('room-1', ()=>{}), 'destroyed transport rejects subscriptions');

  const disabled = api.createTransport({provider:'noop',firebase:completeConfig.firebase}, {firebase});
  check(!disabled.subscribeRoom('room-1', ()=>{}), 'noop configuration never subscribes to Firebase');
  check(!disabled.publishSignal('room-1', safe), 'noop configuration never writes to Firebase');
  const sdkMissing = api.createTransport(completeConfig, {});
  check(sdkMissing.subscribeRoom('room-2', ()=>{}), 'missing SDK is accepted without throwing');
  await flush();
  check(sdkMissing.publishSignal('room-2', safe), 'missing SDK write degrades without throwing');

  const lateTimers = [];
  const lateWindowFirebase = windowStub.firebase;
  delete windowStub.firebase;
  const lateTransport = api.createTransport(completeConfig, {
    setTimeoutImpl(fn, ms){ lateTimers.push({fn,ms}); return lateTimers.length; },
    clearTimeoutImpl(){}
  });
  check(lateTransport.subscribeRoom('room-late', ()=>{}), 'late SDK transport accepts subscription without throwing');
  await flush();
  equal(lateTimers.length, 1, 'missing SDK schedules attach retry');
  equal(lateTimers[0].ms, 2000, 'missing SDK retry uses bounded delay');
  windowStub.firebase = firebase;
  lateTimers[0].fn();
  await flush();
  check(listeners.has('liveRoomSignals/room-late:child_added'), 'late SDK arrival recovers listener without recreating transport');
  lateTransport.destroy();
  if (lateWindowFirebase) windowStub.firebase = lateWindowFirebase; else delete windowStub.firebase;

  const rules = JSON.parse(rulesSource).rules;
  equal(rules['.read'], false, 'rules deny reads by default');
  equal(rules['.write'], false, 'rules deny writes by default');
  check(rules.liveRoomSignals.$roomId['.read'].includes('auth != null'), 'room reads require authentication');
  check(rules.liveRoomSignals.$roomId['.read'].includes('$roomId.length <= 160'), 'room reads enforce bounded room id');
  check(rules.liveRoomSignals.$roomId.$uid['.write'].includes('auth.uid === $uid'), 'writes are restricted to authenticated uid');
  check(rules.liveRoomSignals.$roomId.$uid['.write'].includes('$roomId.length <= 160'), 'writes enforce bounded room id');
  check(rules.liveRoomSignals.$roomId.$uid['.validate'].includes("['type', 'eventId', 'emittedAt']"), 'rules require minimum signal fields');
  check(rules.liveRoomSignals.$roomId.$uid.type['.validate'].includes("=== 'presence-change'") && rules.liveRoomSignals.$roomId.$uid.type['.validate'].includes("=== 'game-state-change'"), 'rules restrict signal type to the exact two-value enum');
  check(rules.liveRoomSignals.$roomId.$uid.emittedAt['.validate'].includes('.matches('), 'rules require ISO timestamp shape');
  equal(rules.liveRoomSignals.$roomId.$uid.$other['.validate'], false, 'rules reject extra signal fields');
  equal(rules.$other['.validate'], false, 'rules reject extra database roots');

  check(configSource.includes("provider: 'firebase'"), 'versioned realtime provider selects Firebase after live configuration');
  check(configSource.includes("databaseURL: 'https://crios-e1b83-default-rtdb.firebaseio.com'") && configSource.includes("projectId: 'crios-e1b83'"), 'live Firebase RTDB project config is present');
  check(hostSource.includes('firebaseProvider.isCompleteConfig(config)'), 'host selects Firebase only through complete-config guard');
  check(hostHtml.includes('firebase-app-compat.js') && hostHtml.includes('firebase-auth-compat.js') && hostHtml.includes('firebase-database-compat.js') && hostHtml.includes('firebase-live-room-realtime-provider.js') && runtimeHtml.includes('firebase-app-compat.js') && runtimeHtml.includes('firebase-auth-compat.js') && runtimeHtml.includes('firebase-database-compat.js') && runtimeHtml.includes('firebase-live-room-realtime-provider.js'), 'host and runtime load pinned Firebase compat SDK before local provider adapter');
  check(!source.includes('capabilityToken'), 'provider never references CRIOS capability');
  check(!source.includes('participantId'), 'provider never references participant identity');

  const firebaseMarker = {name:'firebase'};
  const baseMarker = {name:'noop'};
  let selectedConfig = null;
  const selectingProvider = {
    isCompleteConfig:api.isCompleteConfig,
    createTransport(config){ selectedConfig = config; return firebaseMarker; }
  };
  equal(loadHostFactory(completeConfig, selectingProvider, baseMarker)(), firebaseMarker, 'complete config selects Firebase transport');
  equal(selectedConfig, completeConfig, 'host passes complete config to Firebase provider');
  equal(loadHostFactory({provider:'noop',firebase:null}, selectingProvider, baseMarker)(), baseMarker, 'noop config selects base transport');
  const failingProvider = {isCompleteConfig(){ return true; },createTransport(){ throw new Error('Firebase unavailable'); }};
  equal(loadHostFactory(completeConfig, failingProvider, baseMarker)(), baseMarker, 'Firebase factory failure falls back without throwing');
  console.log('FIREBASE_LIVE_ROOM_REALTIME_PROVIDER_TEST_TOTAL=' + total);
  console.log('FIREBASE_LIVE_ROOM_REALTIME_PROVIDER_TEST_FAILED=' + failed);
  console.log('FIREBASE_LIVE_ROOM_REALTIME_PROVIDER_TEST_STATUS=' + (failed === 0 ? 'PASS' : 'FAIL'));
  process.exitCode = failed === 0 ? 0 : 1;
})().catch((error)=>{
  failed += 1;
  console.error(error && error.stack || error);
  process.exitCode = 1;
});
