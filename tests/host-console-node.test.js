const fs = require('fs');
const path = require('path');
const vm = require('vm');

const repo = process.argv[2] || path.resolve(__dirname, '..');
const sourcePath = path.join(repo, 'js', 'host', 'host-console.js');
const htmlPath = path.join(repo, 'host', 'index.html');
const cssPath = path.join(repo, 'css', 'host-console.css');
const gameCssPath = path.join(repo, 'css', 'host-game-state.css');
const source = fs.readFileSync(sourcePath, 'utf8');
const html = fs.readFileSync(htmlPath, 'utf8');
const css = fs.readFileSync(cssPath, 'utf8');
const gameCss = fs.readFileSync(gameCssPath, 'utf8');

let total = 0;
let failed = 0;
function check(condition, message){ total += 1; if(!condition){ failed += 1; console.error('FAIL ' + message); } }
function equal(actual, expected, message){ check(actual === expected, `${message} expected=${expected} actual=${actual}`); }

const docListeners = {};
const documentStub = { readyState:'loading', addEventListener(name,fn){ docListeners[name]=fn; } };
function storageFrom(map){return {getItem(key){return map.has(key)?map.get(key):null;},setItem(key,value){map.set(key,String(value));},removeItem(key){map.delete(key);}};}
const sessionData = new Map();
const localData = new Map();
const storageStub = storageFrom(sessionData);
const localStorageStub = storageFrom(localData);
const windowStub = {
  document: documentStub,
  location: { href:'https://example.test/host/?roomId=room-1&campaignId=camp-1&publicationId=pub-1' },
  sessionStorage: storageStub,
  localStorage: localStorageStub,
  setInterval(){ return 1; }, clearInterval(){}, addEventListener(){}
};
const context = { window:windowStub, document:documentStub, URL, URLSearchParams, Object, Array, String, Number, Boolean, JSON, Math, Date, console };
windowStub.window = windowStub;
vm.createContext(context);
vm.runInContext(source, context, {filename:sourcePath});
const api = windowStub.CRIOS_HOST_CONSOLE;

check(Boolean(api), 'host console API exported');
equal(api.version, '1.5.0', 'version');
equal(api.heartbeatIntervalMs, 120000, 'heartbeat interval');
equal(api.rosterRefreshIntervalMs, 30000, 'roster interval bounded');
equal(api.foregroundRefreshMinIntervalMs, 30000, 'foreground refresh min interval');
equal(api.realtimeSignalDebounceMs, 300, 'realtime signal debounce interval');
equal(api.presenceSignalType, 'presence-change', 'presence signal type explicit');
equal(api.gameStateSignalType, 'game-state-change', 'game-state signal type explicit');
equal(api.contextKey, 'crios-live-room-host-context-v1', 'shared host context key');
check(typeof api.readContext === 'function', 'readContext exported');
check(typeof api.defaultContextStorage === 'function', 'persistent default context storage exported');
check(typeof api.defaultRealtimeTransportFactory === 'function', 'realtime transport factory exported');
check(source.includes('window.localStorage'), 'host console supports persistent browser storage');

check(typeof api.validateUrlContext === 'function', 'validateUrlContext exported');
check(typeof api.createController === 'function', 'controller exported');
check(Boolean(docListeners.DOMContentLoaded), 'DOMContentLoaded registered');

const stored = {version:1,roomId:'room-1',participantId:'host-1',campaignId:'camp-1',publicationId:'pub-1',campaignName:'Campaña Polar',runtimeHref:'https://example.test/index.html?campaignId=camp-1&publicationId=pub-1',missionOrder:['energy','greenhouse'],playerHref:'https://example.test/index.html?campaignId=camp-1&publicationId=pub-1&roomId=room-1'};
storageStub.setItem(api.contextKey, JSON.stringify(stored));
const read = api.readContext(storageStub);
equal(read.roomId, 'room-1', 'context room id');
equal(read.participantId, 'host-1', 'context participant id');
equal(read.campaignId, 'camp-1', 'context campaign id');
equal(read.publicationId, 'pub-1', 'context publication id');
equal(read.missionOrder.join(','), 'energy,greenhouse', 'context mission order');
equal(read.campaignName, 'Campaña Polar', 'context campaign display name');
equal(read.playerHref, stored.playerHref, 'context player href');
check(api.validateUrlContext(read, windowStub.location.href), 'matching URL accepted');
check(!api.validateUrlContext(read, 'https://example.test/host/?roomId=other&campaignId=camp-1&publicationId=pub-1'), 'room mismatch rejected');
check(!api.validateUrlContext(read, 'https://example.test/host/?roomId=room-1&campaignId=other&publicationId=pub-1'), 'campaign mismatch rejected');
check(!api.validateUrlContext(read, 'https://example.test/host/?roomId=room-1&campaignId=camp-1&publicationId=other'), 'publication mismatch rejected');

sessionData.delete(api.contextKey);
const persistentOnly = {version:1,roomId:'room-local',participantId:'host-local',campaignId:'camp-local',publicationId:'pub-local',campaignName:'Persistida',runtimeHref:'https://example.test/index.html?campaignId=camp-local&publicationId=pub-local',playerHref:'https://example.test/index.html?campaignId=camp-local&publicationId=pub-local&roomId=room-local'};
localStorageStub.setItem(api.contextKey, JSON.stringify(persistentOnly));
const persistentDefault = api.defaultContextStorage();
const recoveredPersistent = api.readContext(persistentDefault);
equal(recoveredPersistent.roomId,'room-local','new tab recovers host context from localStorage');
check(sessionData.has(api.contextKey),'recovered context rehydrated into sessionStorage');
localStorageStub.removeItem(api.contextKey);
sessionData.delete(api.contextKey);

function makeStorage(value){
  let raw = value ? JSON.stringify(value) : null;
  let removes = 0;
  return { getItem(){return raw;}, setItem(k,v){raw=String(v);}, removeItem(){removes += 1; raw=null;}, removes(){return removes;} };
}
function makeClient(overrides={}){
  const calls={get:[],heartbeat:[],roster:[],forget:[],gameContext:[],gameRead:[]};
  const client={
    available(){return true;},
    async getLiveRoom(roomId){calls.get.push(roomId);return {success:true,data:{room:{roomId,campaignId:'camp-1',publicationId:'pub-1',status:'active'}},error:null};},
    async heartbeatLiveRoom(roomId,participantId){calls.heartbeat.push([roomId,participantId]);return {success:true,data:{room:{roomId,campaignId:'camp-1',publicationId:'pub-1',status:'active'}},error:null};},
    async getLiveRoomRoster(roomId,participantId){calls.roster.push([roomId,participantId]);return {success:true,data:{roster:{registeredParticipantCount:2,activeParticipantCount:2,activePlayerCount:1,hostConnected:true,participants:[{participantId:'host-1',role:'host',connected:true},{participantId:'player-1',role:'player',connected:true}]}},error:null};},
    createGameStateClient(gameContext){
      calls.gameContext.push(JSON.parse(JSON.stringify(gameContext)));
      return {
        available(){return true;},
        async getLiveRoomGameState(){
          calls.gameRead.push(true);
          return client.gameResponse || {success:true,data:{gameState:{schemaVersion:'1.0.0',roomId:gameContext.roomId,campaignId:gameContext.campaignId,publicationId:gameContext.publicationId,revision:1,completedMissionIds:['energy'],updatedAt:'2026-08-19T12:00:00.000Z'}},error:null};
        }
      };
    },
    forgetCapability(roomId,participantId){calls.forget.push([roomId,participantId]);return true;},
    calls
  };
  Object.assign(client,overrides);
  return client;
}

function makeRealtimeTransport(){
  const listeners = new Map();
  const calls = {subscribe:[],unsubscribe:[],publish:[],destroy:0};
  const transport = {
    subscribeRoom(roomId, callback){
      calls.subscribe.push(roomId);
      listeners.set(roomId, callback);
      return true;
    },
    unsubscribeRoom(roomId){
      calls.unsubscribe.push(roomId);
      listeners.delete(roomId);
      return true;
    },
    publishSignal(roomId, signal){
      calls.publish.push([roomId, signal]);
      const callback = listeners.get(roomId);
      if (callback) callback(signal);
      return true;
    },
    destroy(){ calls.destroy += 1; listeners.clear(); },
    calls
  };
  return transport;
}

function createDeferred(){
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

(async()=>{
  {
    const client=makeClient();
    const storage=makeStorage(stored);
    const intervals=[]; const clears=[]; const states=[];
    const controller=api.createController({client,storage,href:windowStub.location.href,setIntervalImpl(fn,ms){intervals.push(ms);return intervals.length;},clearIntervalImpl(id){clears.push(id);},onStateChange(s){states.push(s);}});
    const state=await controller.start();
    equal(state.status,'ACTIVE','start active');
    equal(client.calls.get.length,1,'start gets room once');
    equal(client.calls.get[0],'room-1','start gets saved room');
    equal(client.calls.heartbeat.length,1,'start heartbeats host');
    equal(client.calls.roster.length,1,'start reads roster');
    equal(client.calls.roster[0][1],'host-1','roster uses host identity');
    equal(client.calls.gameContext.length,1,'start creates one game-state reader');
    equal(client.calls.gameContext[0].missionOrder.join(','),'energy,greenhouse','game-state reader receives exact mission order');
    check(!Object.prototype.hasOwnProperty.call(client.calls.gameContext[0],'capabilityToken'),'game-state context contains no capability');
    equal(client.calls.gameRead.length,1,'start performs one authoritative game-state read');
    equal(state.gameState.revision,1,'shared progress stored separately');
    equal(state.roster.activePlayerCount,1,'active player count stored');
    equal(state.trend.length,1,'first roster creates trend sample');
    equal(state.trend[0].count,1,'trend sample reflects player count');
    check(intervals.includes(120000),'heartbeat timer started');
    check(intervals.includes(30000),'roster timer started');
    check(states.some(s=>s.status==='ACTIVE'),'active state emitted');
    controller.destroy();
    check(clears.length>=2,'destroy stops both network timers');
  }

  {
    const client=makeClient();
    const storage=makeStorage(stored);
    const timeouts=[];
    const states=[];
    const realtime=makeRealtimeTransport();
    const reconciliationOptions=[];
    const reconciliationCalls=[];
    const reconciliationFactory={
      createScheduler(options){
        reconciliationOptions.push(options);
        return {
          available(){return true;},
          start(){reconciliationCalls.push(['start']);return true;},
          request(reason){reconciliationCalls.push(['request',reason]);return true;},
          setVisible(visible){reconciliationCalls.push(['visible',visible]);return true;},
          stop(){reconciliationCalls.push(['stop']);return true;}
        };
      }
    };
    const controller=api.createController({
      client,
      storage,
      href:windowStub.location.href,
      setIntervalImpl:()=>1,
      clearIntervalImpl:()=>{},
      setTimeoutImpl(fn,ms){ timeouts.push({fn,ms}); return timeouts.length; },
      clearTimeoutImpl(){},
      realtimeTransportFactory(){ return realtime; },
      gameStateReconciliationFactory:reconciliationFactory,
      onStateChange(state){ states.push(state); }
    });
    await controller.start();
    equal(realtime.calls.subscribe.length,1,'realtime subscribes once on start');
    equal(realtime.calls.subscribe[0],'room-1','realtime subscribes with room id');
    equal(reconciliationCalls[0][0],'start','game-state scheduler starts after initial read');

    realtime.publishSignal('room-1',{roomId:'room-1',type:'presence-change',eventId:'evt-1',capability:'secret',participants:[{id:'x'}]});
    realtime.publishSignal('room-1',{roomId:'room-1',type:'presence-change',eventId:'evt-2'});
    equal(timeouts.length,1,'burst of realtime signals is coalesced');
    equal(timeouts[0].ms,300,'realtime coalescing uses debounce window');
    equal(client.calls.roster.length,1,'signal does not mutate roster directly');
    realtime.publishSignal('room-1',{roomId:'room-1',type:'game-state-change',eventId:'evt-game'});
    equal(timeouts.length,1,'game-state signal does not schedule roster refresh');
    equal(reconciliationCalls[reconciliationCalls.length-1][1],'signal','game-state signal requests bounded progress refresh');
    timeouts[0].fn();
    equal(client.calls.roster.length,2,'signal path triggers authorized roster refresh');
    await controller.refreshGameState();
    equal(reconciliationCalls[reconciliationCalls.length-1][1],'manual','manual progress refresh stays behind scheduler');
    controller.setGameStateVisibility(false);
    controller.setGameStateVisibility(true);
    check(reconciliationCalls.some(call=>call[0]==='visible'&&call[1]===false),'hidden state pauses progress scheduler');
    check(reconciliationCalls.some(call=>call[0]==='visible'&&call[1]===true),'visible state resumes progress scheduler');

    client.gameResponse={success:false,data:null,error:{code:'SERVER_ERROR',message:'temporary game-state failure',retryable:true}};
    const gameOutcome=await reconciliationOptions[0].refresh({reason:'signal',attempt:1,requestedAt:Date.parse('2026-08-19T12:00:02.000Z')});
    equal(gameOutcome.success,false,'transient progress read maps to scheduler failure');
    equal(gameOutcome.retryable,true,'transient progress read remains retryable');
    equal(controller.getState().status,'ACTIVE','transient progress failure preserves active room');
    equal(controller.getState().gameState.revision,1,'transient progress failure preserves last valid state');
    equal(controller.getState().lastGameStateError.code,'SERVER_ERROR','progress error stays separate from roster error');

    client.gameResponse={success:true,data:{gameState:{schemaVersion:'1.0.0',roomId:'room-1',campaignId:'camp-1',publicationId:'pub-1',revision:2,completedMissionIds:['energy'],updatedAt:'2026-08-19T12:00:01.000Z'}},error:null};
    function assertProtectedFailClosed(args,label){
      return (async function(){
        const readsBefore=client.calls.gameRead.length;
        const statesBefore=states.length;
        const snapshotBefore=JSON.stringify(controller.getState());
        const outcome=await reconciliationOptions[0].refresh.apply(null,args);
        equal(outcome.success,false,label+' returns neutral success=false');
        equal(outcome.retryable,false,label+' returns neutral retryable=false');
        equal(outcome.terminal,true,label+' returns neutral terminal=true');
        equal(client.calls.gameRead.length,readsBefore,label+' performs zero remote reads');
        equal(states.length,statesBefore,label+' emits zero states');
        equal(JSON.stringify(controller.getState()),snapshotBefore,label+' mutates no host state');
      })();
    }

    await assertProtectedFailClosed([1],'protected mode with generation only fails closed');
    await assertProtectedFailClosed([undefined,'room-1','host-1'],'protected mode with only roomId/participantId fails closed');
    await assertProtectedFailClosed([1,'room-1'],'protected mode with missing participantId fails closed');
    await assertProtectedFailClosed([1,undefined,'host-1'],'protected mode with missing roomId fails closed');
    await assertProtectedFailClosed([1.5,'room-1','host-1'],'protected mode with non-integer generation fails closed');
    await assertProtectedFailClosed([1,'   ','host-1'],'protected mode with blank roomId fails closed');
    await assertProtectedFailClosed([1,'room-1','   '],'protected mode with blank participantId fails closed');

    const readsBeforeProtectedSuccess=client.calls.gameRead.length;
    const statesBeforeProtectedSuccess=states.length;
    const protectedSuccessOutcome=await reconciliationOptions[0].refresh(1,'room-1','host-1');
    equal(protectedSuccessOutcome.success,true,'protected mode with valid triplet and active lifecycle performs read');
    equal(client.calls.gameRead.length,readsBeforeProtectedSuccess+1,'protected mode with valid triplet performs exactly one read');
    check(states.length>=statesBeforeProtectedSuccess+1,'protected mode with valid triplet emits authoritative update');

    const restartState=await controller.start();
    equal(restartState.status,'ACTIVE','restart keeps host active while rotating lifecycle generation');
    await assertProtectedFailClosed([1,'room-1','host-1'],'protected mode with stale generation fails closed');

    const readsBeforeNoArgs=client.calls.gameRead.length;
    const noArgsOutcome=await reconciliationOptions[0].refresh();
    equal(noArgsOutcome.success,true,'refresh without expected context keeps normal behavior');
    equal(client.calls.gameRead.length,readsBeforeNoArgs+1,'refresh without expected context performs exactly one read');

    controller.destroy();
    check(reconciliationCalls.some(call=>call[0]==='stop'),'destroy stops game-state scheduler');
    equal(realtime.calls.unsubscribe.length,2,'destroy unsubscribes realtime room listener after lifecycle restart');
    equal(realtime.calls.destroy,2,'destroy tears down realtime transport instance after lifecycle restart');
  }

  {
    const client=makeClient();
    const storage=makeStorage(stored);
    const intervals=[];
    const controller=api.createController({
      client,
      storage,
      href:windowStub.location.href,
      setIntervalImpl(fn,ms){ intervals.push(ms); return intervals.length; },
      clearIntervalImpl:()=>{},
      realtimeTransportFactory(){ throw new Error('transport unavailable'); }
    });
    const state=await controller.start();
    equal(state.status,'ACTIVE','realtime transport failure does not break session');
    check(intervals.includes(30000),'polling fallback remains active when realtime fails');
    equal(storage.removes(),0,'realtime transport failure does not clear host context');
  }

  {
    const client=makeClient();
    const storage=makeStorage(stored);
    const realtime=makeRealtimeTransport();
    const controllerA=api.createController({client,storage,href:windowStub.location.href,setIntervalImpl:()=>1,clearIntervalImpl:()=>{},realtimeTransportFactory(){ return realtime; }});
    await controllerA.start();
    controllerA.destroy();
    const controllerB=api.createController({client,storage,href:windowStub.location.href,setIntervalImpl:()=>1,clearIntervalImpl:()=>{},realtimeTransportFactory(){ return realtime; }});
    await controllerB.start();
    equal(realtime.calls.subscribe.length,2,'reloading console does not duplicate active subscriptions');
    equal(realtime.calls.unsubscribe.length,1,'previous subscription is released before next start');
    controllerB.destroy();
    equal(realtime.calls.unsubscribe.length,2,'second controller also releases subscription');
  }

  {
    const client=makeClient();
    const storage=makeStorage(null);
    const controller=api.createController({client,storage,href:windowStub.location.href,setIntervalImpl:()=>1,clearIntervalImpl:()=>{}});
    const state=await controller.start();
    equal(state.status,'NO_CONTEXT','missing context is non-network state');
    equal(client.calls.get.length,0,'missing context makes no room request');
    equal(client.calls.heartbeat.length,0,'missing context makes no heartbeat');
    equal(client.calls.roster.length,0,'missing context makes no roster read');
  }

  {
    const client=makeClient();
    const legacyContext=Object.assign({},stored);
    delete legacyContext.missionOrder;
    const storage=makeStorage(legacyContext);
    const controller=api.createController({client,storage,href:windowStub.location.href,setIntervalImpl:()=>1,clearIntervalImpl:()=>{}});
    const state=await controller.start();
    equal(state.status,'ACTIVE','legacy context without mission order keeps console active');
    equal(state.roster.activePlayerCount,1,'legacy context keeps roster monitoring');
    equal(client.calls.gameContext.length,0,'legacy context performs no invalid game-state request');
    equal(state.lastGameStateError.code,'LIVE_ROOM_GAME_STATE_CONTEXT_UNAVAILABLE','legacy context degrades only progress pane');
    equal(storage.removes(),0,'legacy progress degradation preserves host context');
    controller.destroy();
  }

  {
    const client=makeClient();
    const storage=makeStorage(stored);
    const controller=api.createController({client,storage,href:'https://example.test/host/?roomId=wrong&campaignId=camp-1&publicationId=pub-1',setIntervalImpl:()=>1,clearIntervalImpl:()=>{}});
    const state=await controller.start();
    equal(state.status,'ERROR','URL mismatch fails closed');
    equal(state.lastError.code,'HOST_CONTEXT_URL_MISMATCH','URL mismatch code');
    equal(storage.removes(),1,'URL mismatch clears host context');
    equal(client.calls.forget.length,1,'URL mismatch forgets capability');
    equal(client.calls.get.length,0,'URL mismatch makes no room request');
  }

  {
    const client=makeClient({async getLiveRoom(roomId){this.calls.get.push(roomId);return {success:false,data:null,error:{code:'ROOM_EXPIRED',message:'Esta sesión finalizó por inactividad.',retryable:false}};}});
    const storage=makeStorage(stored);
    const controller=api.createController({client,storage,href:windowStub.location.href,setIntervalImpl:()=>1,clearIntervalImpl:()=>{}});
    const state=await controller.start();
    equal(state.status,'EXPIRED','expired room stays expired');
    equal(state.lastError.message,'Esta sesión finalizó por inactividad.','expired message exact');
    equal(storage.removes(),1,'expiry clears host context');
    equal(client.calls.forget.length,1,'expiry forgets capability');
  }

  {
    const client=makeClient();
    const storage=makeStorage(stored);
    const controller=api.createController({client,storage,href:windowStub.location.href,setIntervalImpl:()=>1,clearIntervalImpl:()=>{}});
    await controller.start();
    let resolveHeartbeat;
    const heartbeatGate=new Promise(resolve=>{resolveHeartbeat=resolve;});
    let resolveRoster;
    const rosterGate=new Promise(resolve=>{resolveRoster=resolve;});
    client.heartbeatLiveRoom=async function(roomId,participantId){this.calls.heartbeat.push([roomId,participantId]);return heartbeatGate;};
    client.getLiveRoomRoster=async function(roomId,participantId){this.calls.roster.push([roomId,participantId]);return rosterGate;};
    const firstHeartbeat=controller.heartbeat();
    const secondHeartbeat=controller.heartbeat();
    const firstRoster=controller.refreshRoster();
    const secondRoster=controller.refreshRoster();
    check(firstHeartbeat===secondHeartbeat,'host console concurrent heartbeats share one promise');
    check(firstRoster===secondRoster,'host console concurrent roster reads share one promise');
    equal(client.calls.heartbeat.length,2,'host console concurrent heartbeats add one request after startup');
    equal(client.calls.roster.length,2,'host console concurrent roster reads add one request after startup');
    resolveHeartbeat({success:true,data:{room:{roomId:'room-1',campaignId:'camp-1',publicationId:'pub-1',status:'active'}},error:null});
    resolveRoster({success:true,data:{roster:{activePlayerCount:1,participants:[]}},error:null});
    await Promise.all([firstHeartbeat,secondHeartbeat,firstRoster,secondRoster]);
    const thirdHeartbeat=controller.heartbeat();
    const thirdRoster=controller.refreshRoster();
    equal(client.calls.heartbeat.length,3,'host console heartbeat single-flight releases after completion');
    equal(client.calls.roster.length,3,'host console roster single-flight releases after completion');
    await Promise.all([thirdHeartbeat,thirdRoster]);
    let rejectHeartbeat;
    const rejectedHeartbeatGate=new Promise((resolve,reject)=>{rejectHeartbeat=reject;});
    let rejectRoster;
    const rejectedRosterGate=new Promise((resolve,reject)=>{rejectRoster=reject;});
    client.heartbeatLiveRoom=async function(roomId,participantId){this.calls.heartbeat.push([roomId,participantId]);return rejectedHeartbeatGate;};
    client.getLiveRoomRoster=async function(roomId,participantId){this.calls.roster.push([roomId,participantId]);return rejectedRosterGate;};
    const failedHeartbeatFirst=controller.heartbeat();
    const failedHeartbeatSecond=controller.heartbeat();
    const failedRosterFirst=controller.refreshRoster();
    const failedRosterSecond=controller.refreshRoster();
    check(failedHeartbeatFirst===failedHeartbeatSecond,'host console rejected heartbeats share one promise');
    check(failedRosterFirst===failedRosterSecond,'host console rejected roster reads share one promise');
    equal(client.calls.heartbeat.length,4,'host console rejected heartbeats make one request');
    equal(client.calls.roster.length,4,'host console rejected roster reads make one request');
    rejectHeartbeat(new Error('heartbeat rejected'));
    rejectRoster(new Error('roster rejected'));
    const failedOutcomes=await Promise.allSettled([failedHeartbeatFirst,failedHeartbeatSecond,failedRosterFirst,failedRosterSecond]);
    check(failedOutcomes.every(outcome=>outcome.status==='rejected'),'host console shared rejections reach all callers');
    client.heartbeatLiveRoom=async function(roomId,participantId){this.calls.heartbeat.push([roomId,participantId]);return {success:true,data:{room:{roomId,status:'active'}},error:null};};
    client.getLiveRoomRoster=async function(roomId,participantId){this.calls.roster.push([roomId,participantId]);return {success:true,data:{roster:{activePlayerCount:1,participants:[]}},error:null};};
    await Promise.all([controller.heartbeat(),controller.refreshRoster()]);
    equal(client.calls.heartbeat.length,5,'host console heartbeat single-flight releases after rejection');
    equal(client.calls.roster.length,5,'host console roster single-flight releases after rejection');
  }

  {
    const client=makeClient({async getLiveRoomRoster(roomId,participantId){this.calls.roster.push([roomId,participantId]);return {success:false,data:null,error:{code:'SERVER_ERROR',message:'temporary',retryable:true}};}});
    const storage=makeStorage(stored);
    const controller=api.createController({client,storage,href:windowStub.location.href,setIntervalImpl:()=>1,clearIntervalImpl:()=>{}});
    const state=await controller.start();
    equal(state.status,'ACTIVE','transient roster failure keeps console active');
    equal(state.lastError.code,'SERVER_ERROR','transient roster error retained');
    equal(storage.removes(),0,'transient roster failure keeps context');
  }

  {
    const client=makeClient();
    const storage=makeStorage(stored);
    const controller=api.createController({client,storage,href:windowStub.location.href,setIntervalImpl:()=>1,clearIntervalImpl:()=>{}});
    await controller.start();
    const delayedRoster=createDeferred();
    client.getLiveRoomRoster=async function(roomId,participantId){this.calls.roster.push([roomId,participantId]);return delayedRoster.promise;};
    client.heartbeatLiveRoom=async function(roomId,participantId){this.calls.heartbeat.push([roomId,participantId]);return {success:false,data:null,error:{code:'ROOM_EXPIRED',message:'Esta sesión finalizó por inactividad.',retryable:false}};};
    const staleRosterPromise=controller.refreshRoster();
    const expired=await controller.heartbeat();
    equal(expired.status,'EXPIRED','terminal heartbeat expires controller');
    delayedRoster.resolve({success:true,data:{roster:{activePlayerCount:9,participants:[]}},error:null});
    await staleRosterPromise;
    equal(controller.getState().status,'EXPIRED','late roster success cannot reactivate expired after terminal heartbeat');
  }

  {
    const client=makeClient();
    const storage=makeStorage(stored);
    const controller=api.createController({client,storage,href:windowStub.location.href,setIntervalImpl:()=>1,clearIntervalImpl:()=>{}});
    await controller.start();
    const delayedHeartbeat=createDeferred();
    client.heartbeatLiveRoom=async function(roomId,participantId){this.calls.heartbeat.push([roomId,participantId]);return delayedHeartbeat.promise;};
    client.getLiveRoomRoster=async function(roomId,participantId){this.calls.roster.push([roomId,participantId]);return {success:false,data:null,error:{code:'ROOM_EXPIRED',message:'Esta sesión finalizó por inactividad.',retryable:false}};};
    const staleHeartbeatPromise=controller.heartbeat();
    const expired=await controller.refreshRoster();
    equal(expired.status,'EXPIRED','terminal roster expires controller');
    delayedHeartbeat.resolve({success:true,data:{room:{roomId:'room-1',campaignId:'camp-1',publicationId:'pub-1',status:'active'}},error:null});
    await staleHeartbeatPromise;
    equal(controller.getState().status,'EXPIRED','late heartbeat success cannot reactivate expired after terminal roster');
  }

  {
    const states=[];
    const client=makeClient();
    const storage=makeStorage(stored);
    const controller=api.createController({client,storage,href:windowStub.location.href,setIntervalImpl:()=>1,clearIntervalImpl:()=>{},onStateChange(state){states.push(state);}});
    await controller.start();
    const before=states.length;
    const delayedHeartbeat=createDeferred();
    client.heartbeatLiveRoom=async function(roomId,participantId){this.calls.heartbeat.push([roomId,participantId]);return delayedHeartbeat.promise;};
    const pending=controller.heartbeat();
    controller.destroy();
    delayedHeartbeat.resolve({success:true,data:{room:{roomId:'room-1',campaignId:'camp-1',publicationId:'pub-1',status:'active'}},error:null});
    await pending;
    equal(states.length,before,'late response after destroy emits no new state');
    equal(controller.getState().status,'ACTIVE','late response after destroy does not change state snapshot');
  }

  {
    const client=makeClient();
    const storage=makeStorage(stored);
    const controller=api.createController({client,storage,href:windowStub.location.href,setIntervalImpl:()=>1,clearIntervalImpl:()=>{}});
    await controller.start();
    const firstDeferred=createDeferred();
    const secondDeferred=createDeferred();
    let heartbeatCallIndex=0;
    client.heartbeatLiveRoom=async function(roomId,participantId){
      this.calls.heartbeat.push([roomId,participantId]);
      heartbeatCallIndex += 1;
      return heartbeatCallIndex === 1 ? firstDeferred.promise : secondDeferred.promise;
    };
    const first=controller.heartbeat();
    const restart=controller.start();
    for (let index = 0; index < 8; index += 1) await Promise.resolve();
    const second=controller.heartbeat();
    check(first!==second,'restart creates a new in-flight heartbeat promise');
    firstDeferred.resolve({success:true,data:{room:{roomId:'room-1',campaignId:'camp-1',publicationId:'pub-1',status:'active'}},error:null});
    await first;
    const shared=controller.heartbeat();
    check(shared===second,'old heartbeat resolution does not release new in-flight promise');
    secondDeferred.resolve({success:true,data:{room:{roomId:'room-1',campaignId:'camp-1',publicationId:'pub-1',status:'active'}},error:null});
    await Promise.all([second,restart,shared]);
  }

  {
    const client=makeClient();
    let createGameStateCall=0;
    let firstGameStateReadEntered=false;
    const firstLifecycleGameStateDeferred=createDeferred();
    client.createGameStateClient=function(gameContext){
      this.calls.gameContext.push(JSON.parse(JSON.stringify(gameContext)));
      createGameStateCall += 1;
      const callNumber=createGameStateCall;
      return {
        available(){return true;},
        async getLiveRoomGameState(){
          client.calls.gameRead.push(true);
          if (callNumber === 1) {
            firstGameStateReadEntered=true;
            return firstLifecycleGameStateDeferred.promise;
          }
          return {success:true,data:{gameState:{schemaVersion:'1.0.0',roomId:gameContext.roomId,campaignId:gameContext.campaignId,publicationId:gameContext.publicationId,revision:callNumber,completedMissionIds:['energy'],updatedAt:'2026-08-20T00:00:00.000Z'}},error:null};
        }
      };
    };
    const storage=makeStorage(stored);
    const intervals=[];
    const states=[];
    const controller=api.createController({
      client,
      storage,
      href:windowStub.location.href,
      setIntervalImpl(fn,ms){ intervals.push(ms); return intervals.length; },
      clearIntervalImpl:()=>{},
      onStateChange(state){ states.push(state); }
    });
    const firstStart=controller.start();
    let firstStartSettled=false;
    firstStart.then(function(){ firstStartSettled=true; }, function(){ firstStartSettled=true; });
    for (let index = 0; index < 20 && !firstGameStateReadEntered; index += 1) await Promise.resolve();
    check(firstGameStateReadEntered,'first start reaches initializeGameState read and stays suspended');
    check(!firstStartSettled,'first start remains pending while initializeGameState is deferred');

    const secondStart=controller.start();
    const secondState=await secondStart;
    equal(secondState.status,'ACTIVE','second start becomes the active lifecycle');
    equal(intervals.length,2,'only active lifecycle schedules timers before first lifecycle resumes');
    const statesBeforeFirstResume=states.length;
    const snapshotBeforeFirstResume=JSON.stringify(controller.getState());

    firstLifecycleGameStateDeferred.resolve({success:true,data:{gameState:{schemaVersion:'1.0.0',roomId:'room-1',campaignId:'camp-1',publicationId:'pub-1',revision:99,completedMissionIds:['energy'],updatedAt:'2026-08-20T00:00:01.000Z'}},error:null});
    await firstStart;
    equal(intervals.length,2,'obsolete first start does not schedule heartbeat or roster timers');
    equal(states.length,statesBeforeFirstResume,'obsolete first start emits no additional state');
    equal(JSON.stringify(controller.getState()),snapshotBeforeFirstResume,'obsolete first start does not mutate latest lifecycle state');
  }

  {
    let currentNow=1000;
    const client=makeClient();
    const storage=makeStorage(stored);
    const controller=api.createController({client,storage,href:windowStub.location.href,setIntervalImpl:()=>1,clearIntervalImpl:()=>{},now:()=>currentNow});
    await controller.start();
    equal(controller.getState().status,'ACTIVE','foreground gating starts from active host state');
    const heartbeatA=createDeferred();
    const heartbeatB=createDeferred();
    const heartbeatC=createDeferred();
    const rosterA=createDeferred();
    const rosterB=createDeferred();
    const rosterC=createDeferred();
    const heartbeatQueue=[heartbeatA,heartbeatB,heartbeatC];
    const rosterQueue=[rosterA,rosterB,rosterC];
    client.calls.heartbeat=[];
    client.calls.roster=[];
    client.heartbeatLiveRoom=async function(roomId,participantId){
      this.calls.heartbeat.push([roomId,participantId]);
      var next=heartbeatQueue.shift();
      return next ? next.promise : {success:true,data:{room:{roomId:roomId,campaignId:'camp-1',publicationId:'pub-1',status:'active'}},error:null};
    };
    client.getLiveRoomRoster=async function(roomId,participantId){
      this.calls.roster.push([roomId,participantId]);
      var next=rosterQueue.shift();
      return next ? next.promise : {success:true,data:{roster:{activePlayerCount:1,participants:[]}},error:null};
    };
    equal(controller.refreshAfterForeground(),true,'foreground first call accepted');
    heartbeatA.resolve({success:true,data:{room:{roomId:'room-1',campaignId:'camp-1',publicationId:'pub-1',status:'active'}},error:null});
    rosterA.resolve({success:true,data:{roster:{activePlayerCount:1,participants:[]}},error:null});
    await Promise.all([controller.heartbeat(), controller.refreshRoster()]);
    await Promise.resolve();
    await Promise.resolve();
    equal(client.calls.heartbeat.length,1,'foreground first call triggers heartbeat');
    equal(client.calls.roster.length,1,'foreground first call triggers roster refresh');
    currentNow = 20000;
    equal(controller.refreshAfterForeground(),false,'foreground under 30s rejected');
    equal(client.calls.heartbeat.length,1,'foreground under 30s adds no heartbeat');
    equal(client.calls.roster.length,1,'foreground under 30s adds no roster');
    currentNow = 31000;
    equal(controller.refreshAfterForeground(),true,'foreground at 30s accepted');
    heartbeatB.resolve({success:true,data:{room:{roomId:'room-1',campaignId:'camp-1',publicationId:'pub-1',status:'active'}},error:null});
    rosterB.resolve({success:true,data:{roster:{activePlayerCount:1,participants:[]}},error:null});
    await Promise.all([controller.heartbeat(), controller.refreshRoster()]);
    await Promise.resolve();
    await Promise.resolve();
    equal(client.calls.heartbeat.length,2,'foreground at 30s triggers heartbeat');
    equal(client.calls.roster.length,2,'foreground at 30s triggers roster refresh');
    currentNow = 1;
    equal(controller.refreshAfterForeground(),true,'foreground accepts clock rollback');
    heartbeatC.resolve({success:true,data:{room:{roomId:'room-1',campaignId:'camp-1',publicationId:'pub-1',status:'active'}},error:null});
    rosterC.resolve({success:true,data:{roster:{activePlayerCount:1,participants:[]}},error:null});
    await Promise.all([controller.heartbeat(), controller.refreshRoster()]);
    await Promise.resolve();
    await Promise.resolve();
  }

  check(html.includes('<main class="host-console" id="hostConsoleRoot"'),'host root owns dedicated console class');
  check(!html.includes('class="host-console app"'),'host root does not inherit Runtime fixed canvas app class');
  check(css.includes('overflow:auto!important'),'host page overrides Runtime global overflow lock');
  check(css.includes('height:auto!important'),'host page owns document height');
  check(css.includes('position:relative!important'),'host console owns its positioning');
  check(css.includes('transform:none!important'),'host console cannot inherit Runtime viewport transform');
  check(!css.includes('1366px'),'host console CSS has no Runtime fixed design width');
  check(html.includes('Consola de mando'),'visible console title');
  check(html.includes('Jugadores conectados'),'visible player metric');
  check(html.includes('Participantes'),'participant section exists');
  check(html.includes('ACTIVIDAD RECIENTE'),'useful recent-activity visual exists');
  check(html.includes('hostConsolePresenceTrend'),'presence trend SVG exists');
  check(html.includes('id="hostConsoleShareButton"'),'header share action exists');
  check(html.includes('id="hostConsoleShareButton" disabled'),'share action starts disabled until room context is active');
  check(source.includes("shareButton.disabled=!(active&&context&&context.playerHref)"),'share action enables only for active public player link');
  check(html.includes('id="hostShareModal"'),'share modal exists');
  check(html.includes('id="hostShareQr"'),'share modal QR target exists');
  check(html.includes('id="hostShareCopyButton"'),'copy action exists');
  check(html.includes('id="hostShareEmailLink"'),'email share action exists');
  check(html.includes('id="hostShareWhatsAppLink"'),'WhatsApp share action exists');
  check(html.includes('../js/vendor/qrcode-generator/qrcode.js'),'local QR generator loaded');
  check(html.includes('../js/host/host-share.js'),'host share controller loaded');
  check(!html.includes('ACCESO DE ESTUDIANTES'),'redundant access card removed from dashboard');
  check(html.includes('hostConsolePresenceTrendDots'),'trend event dots target exists');
  check(html.includes('hostConsolePresenceEvents'),'presence change event list exists');
  check(css.includes('.host-presence-node'),'presence visual nodes styled');
  check(css.includes('.host-trend__line'),'trend line styled');
  check(css.includes('.host-share__dialog'),'share modal styled');
  check(html.includes('id="hostConsoleProgressValue"'),'aggregate team progress metric exists');
  check(html.includes('id="hostConsoleMissionProgressList"'),'generic mission sequence exists');
  check(html.includes('no atribuye avances a participantes individuales'),'progress UI explicitly avoids participant attribution');
  check(!html.includes('energy')&&!html.includes('greenhouse'),'host markup contains no technical mission ids');
  check(html.includes('../js/live-room/live-room-game-state-model.js'),'host loads game-state model');
  check(html.includes('../js/live-room/live-room-game-state-reconciliation.js'),'host loads bounded reconciliation scheduler');
  check(html.includes('../js/live-room/remote/live-room-game-state-client.js'),'host loads authenticated game-state reader');
  check(html.indexOf('live-room-game-state-contract.js')<html.indexOf('live-room-game-state-client.js'),'host loads game-state contract before client');
  check(gameCss.includes('.host-mission-progress'),'progress sequence styled in isolated stylesheet');
  check(source.includes('gameStateClient.getLiveRoomGameState()'),'host uses authenticated read operation');
  check(!source.includes('completeLiveRoomMission'),'host controller contains no game-state writer call');
  check(source.includes("signal.type===GAME_STATE_SIGNAL_TYPE"),'game-state signal routed separately');
  check(source.includes('MAX_TREND_SAMPLES = 40'),'trend history bounded to roughly ten minutes at transitional cadence');
  check(source.includes('REALTIME_SIGNAL_DEBOUNCE_MS = 300'),'realtime signal path has explicit coalescing window');
  check(source.includes('defaultRealtimeTransportFactory'),'host console depends on realtime transport abstraction');
  check(source.includes('scheduleRealtimeRefresh'),'realtime signal path and polling path are separate');
  check(source.includes('attachRealtime(context.roomId);'),'realtime signal path attaches after room validation');
  check(source.includes("context.campaignName || 'Campaña publicada'"),'campaign name preferred over technical ids in header');
  check(source.includes('ROSTER_REFRESH_INTERVAL_MS = 30 * 1000'),'30s polling remains bounded');
  check(source.includes('FOREGROUND_REFRESH_MIN_INTERVAL_MS = 30 * 1000'),'host foreground refresh interval source present');
  check(source.includes("url.searchParams.get('roomId')"),'console validates public room id');
  check(!source.includes("searchParams.set('participantId'"),'participant id never added to console URL');
  check(!source.includes("searchParams.set('capability'"),'capability never added to console URL');
  check(typeof api.defaultGameStateReconciliationFactory==='function','game-state reconciliation factory exported');
  check(source.includes('controller.refreshAfterForeground();'),'visibility/focus listeners use foreground refresh gate');
  check(!source.includes("controller.heartbeat();controller.refreshRoster();"),'visibility/focus listeners avoid direct heartbeat+roster calls');
  check(source.includes('return Object.freeze({start:start,heartbeat:heartbeat,refreshRoster:refreshRoster,refreshAfterForeground:refreshAfterForeground'),'controller exports refreshAfterForeground');
  check(source.includes('lastGameStateError'),'progress failures remain separate from room and roster failures');
  check(!/prompt\s*\(/.test(source),'console never prompts for credentials');
  check(!/password/i.test(source),'console has no password concept');
  check(!/deleteLiveRoom|stopLiveRoom|closeLiveRoom/.test(source),'console adds no destructive room operation');

  console.log('HOST_CONSOLE_TEST_TOTAL='+total);
  console.log('HOST_CONSOLE_TEST_FAILED='+failed);
  console.log('HOST_CONSOLE_TEST_STATUS='+(failed===0?'PASS':'FAIL'));
  process.exitCode=failed===0?0:1;
})().catch(error=>{console.error(error&&error.stack||error);process.exitCode=1;});
