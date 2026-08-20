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
equal(api.version, '1.4.0', 'version');
equal(api.heartbeatIntervalMs, 120000, 'heartbeat interval');
equal(api.rosterRefreshIntervalMs, 15000, 'roster interval transitional');
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
    check(intervals.includes(15000),'roster timer started');
    check(states.some(s=>s.status==='ACTIVE'),'active state emitted');
    controller.destroy();
    check(clears.length>=2,'destroy stops both network timers');
  }

  {
    const client=makeClient();
    const storage=makeStorage(stored);
    const timeouts=[];
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
      gameStateReconciliationFactory:reconciliationFactory
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
    const gameOutcome=await reconciliationOptions[0].refresh();
    equal(gameOutcome.success,false,'transient progress read maps to scheduler failure');
    equal(gameOutcome.retryable,true,'transient progress read remains retryable');
    equal(controller.getState().status,'ACTIVE','transient progress failure preserves active room');
    equal(controller.getState().gameState.revision,1,'transient progress failure preserves last valid state');
    equal(controller.getState().lastGameStateError.code,'SERVER_ERROR','progress error stays separate from roster error');

    controller.destroy();
    check(reconciliationCalls.some(call=>call[0]==='stop'),'destroy stops game-state scheduler');
    equal(realtime.calls.unsubscribe.length,1,'destroy unsubscribes realtime room listener');
    equal(realtime.calls.destroy,1,'destroy tears down realtime transport instance');
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
    check(intervals.includes(15000),'polling fallback remains active when realtime fails');
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
    const client=makeClient({async getLiveRoomRoster(roomId,participantId){this.calls.roster.push([roomId,participantId]);return {success:false,data:null,error:{code:'SERVER_ERROR',message:'temporary',retryable:true}};}});
    const storage=makeStorage(stored);
    const controller=api.createController({client,storage,href:windowStub.location.href,setIntervalImpl:()=>1,clearIntervalImpl:()=>{}});
    const state=await controller.start();
    equal(state.status,'ACTIVE','transient roster failure keeps console active');
    equal(state.lastError.code,'SERVER_ERROR','transient roster error retained');
    equal(storage.removes(),0,'transient roster failure keeps context');
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
  check(source.includes('ROSTER_REFRESH_INTERVAL_MS = 15 * 1000'),'15s polling remains transitional');
  check(source.includes("url.searchParams.get('roomId')"),'console validates public room id');
  check(!source.includes("searchParams.set('participantId'"),'participant id never added to console URL');
  check(!source.includes("searchParams.set('capability'"),'capability never added to console URL');
  check(typeof api.defaultGameStateReconciliationFactory==='function','game-state reconciliation factory exported');
  check(source.includes('lastGameStateError'),'progress failures remain separate from room and roster failures');
  check(!/prompt\s*\(/.test(source),'console never prompts for credentials');
  check(!/password/i.test(source),'console has no password concept');
  check(!/deleteLiveRoom|stopLiveRoom|closeLiveRoom/.test(source),'console adds no destructive room operation');

  console.log('HOST_CONSOLE_TEST_TOTAL='+total);
  console.log('HOST_CONSOLE_TEST_FAILED='+failed);
  console.log('HOST_CONSOLE_TEST_STATUS='+(failed===0?'PASS':'FAIL'));
  process.exitCode=failed===0?0:1;
})().catch(error=>{console.error(error&&error.stack||error);process.exitCode=1;});
