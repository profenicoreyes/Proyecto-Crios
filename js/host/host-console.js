/* CRIOS host command console - dedicated host monitoring surface */
(function(){
  'use strict';

  var VERSION = '1.5.0';
  var HEARTBEAT_INTERVAL_MS = 2 * 60 * 1000;
  var ROSTER_REFRESH_INTERVAL_MS = 30 * 1000;
  var FOREGROUND_REFRESH_MIN_INTERVAL_MS = 30 * 1000;
  var REALTIME_SIGNAL_DEBOUNCE_MS = 300;
  var CLOCK_REFRESH_INTERVAL_MS = 1000;
  var CONTEXT_KEY = 'crios-live-room-host-context-v1';
  var MAX_TREND_SAMPLES = 40;
  var PRESENCE_SIGNAL_TYPE = 'presence-change';
  var GAME_STATE_SIGNAL_TYPE = 'game-state-change';

  function text(value){ return typeof value === 'string' ? value.trim() : ''; }

  function normalizedMissionOrder(value){
    if(!Array.isArray(value)||!value.length)return [];
    var order=[];
    var seen=Object.create(null);
    for(var index=0;index<value.length;index+=1){
      var raw=value[index];
      var missionId=text(raw);
      if(typeof raw!=='string'||raw!==missionId||!missionId||missionId.length>160)return [];
      if(/[\u0000-\u001F\u007F]/.test(missionId)||seen[missionId])return [];
      seen[missionId]=true;
      order.push(missionId);
    }
    var model=window.CRIOS_LIVE_ROOM_GAME_STATE_MODEL;
    if(model&&typeof model.validateMissionOrder==='function'){
      try{model.validateMissionOrder(order);}catch(ignoreMissionOrder){return [];}
    }
    return order;
  }
  function now(){ return Date.now(); }

  function defaultContextStorage(){
    var session = null;
    var persistent = null;
    try { session = window.sessionStorage || null; } catch (ignoreSession) { session = null; }
    try { persistent = window.localStorage || null; } catch (ignorePersistent) { persistent = null; }

    function getFrom(store, key){
      if (!store) return null;
      try { return store.getItem(key); } catch (ignore) { return null; }
    }
    function setTo(store, key, value){
      if (!store) return false;
      try { store.setItem(key, value); return true; } catch (ignore) { return false; }
    }
    function removeFrom(store, key){
      if (!store) return false;
      try { store.removeItem(key); return true; } catch (ignore) { return false; }
    }

    return Object.freeze({
      getItem: function(key){
        var value = getFrom(session, key);
        if (value) return value;
        value = getFrom(persistent, key);
        if (value && session) setTo(session, key, value);
        return value;
      },
      setItem: function(key, value){
        var persisted = setTo(persistent, key, value);
        if (session) setTo(session, key, value);
        return persisted;
      },
      removeItem: function(key){
        var a = removeFrom(session, key);
        var b = removeFrom(persistent, key);
        return a || b;
      }
    });
  }

  function readContext(storage){
    try {
      var raw = storage && storage.getItem(CONTEXT_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
      var context = {
        roomId: text(parsed.roomId),
        participantId: text(parsed.participantId),
        campaignId: text(parsed.campaignId),
        publicationId: text(parsed.publicationId),
        campaignName: text(parsed.campaignName),
        runtimeHref: text(parsed.runtimeHref),
        missionOrder: normalizedMissionOrder(parsed.missionOrder),
        playerHref: text(parsed.playerHref)
      };
      return context.roomId && context.participantId && context.campaignId && context.publicationId && context.playerHref ? context : null;
    } catch (ignore) { return null; }
  }

  function buildConsoleHref(context, baseHref){
    if (!context) return '';
    try {
      var url = new URL('./', text(baseHref) || window.location.href);
      url.searchParams.set('roomId', context.roomId);
      url.searchParams.set('campaignId', context.campaignId);
      url.searchParams.set('publicationId', context.publicationId);
      return url.href;
    } catch (ignore) { return ''; }
  }

  function validateUrlContext(context, href){
    try {
      var url = new URL(href || window.location.href);
      var roomId = text(url.searchParams.get('roomId'));
      var campaignId = text(url.searchParams.get('campaignId'));
      var publicationId = text(url.searchParams.get('publicationId'));
      if (roomId && roomId !== context.roomId) return false;
      if (campaignId && campaignId !== context.campaignId) return false;
      if (publicationId && publicationId !== context.publicationId) return false;
      return true;
    } catch (ignore) { return false; }
  }

  function shortId(value){
    var v = text(value);
    return v.length > 18 ? v.slice(0,8) + '…' + v.slice(-6) : v;
  }

  function humanAge(ms){
    if (!Number.isFinite(ms) || ms < 0) return '—';
    if (ms < 1500) return 'ahora';
    var sec = Math.floor(ms / 1000);
    if (sec < 60) return 'hace ' + sec + ' s';
    var min = Math.floor(sec / 60);
    return 'hace ' + min + ' min';
  }

  function defaultRealtimeTransportFactory(){
    var config = typeof CRIOS_CONFIG !== 'undefined' && CRIOS_CONFIG ? CRIOS_CONFIG.realtime : null;
    var firebaseProvider = window.CRIOS_FIREBASE_LIVE_ROOM_REALTIME_PROVIDER;
    if (firebaseProvider && typeof firebaseProvider.isCompleteConfig === 'function' && firebaseProvider.isCompleteConfig(config) && typeof firebaseProvider.createTransport === 'function') {
      try { return firebaseProvider.createTransport(config); } catch (ignoreFirebaseProviderError) {}
    }
    var api = window.CRIOS_LIVE_ROOM_REALTIME_TRANSPORT;
    if (api && typeof api.createTransport === 'function') {
      return api.createTransport();
    }
    return Object.freeze({
      subscribeRoom: function(){ return true; },
      unsubscribeRoom: function(){ return true; },
      publishSignal: function(){ return true; },
      destroy: function(){}
    });
  }

  function defaultGameStateReconciliationFactory(){
    return window.CRIOS_LIVE_ROOM_GAME_STATE_RECONCILIATION || null;
  }

  function createController(options){
    var opts = options && typeof options === 'object' ? options : {};
    var client = opts.client || null;
    var storage = opts.storage || defaultContextStorage();
    var href = text(opts.href) || window.location.href;
    var setIntervalImpl = opts.setIntervalImpl || window.setInterval.bind(window);
    var clearIntervalImpl = opts.clearIntervalImpl || window.clearInterval.bind(window);
    var nowImpl = typeof opts.now === 'function' ? opts.now : now;
    var setTimeoutImpl = opts.setTimeoutImpl || (typeof window.setTimeout === 'function'
      ? window.setTimeout.bind(window)
      : function(callback){ if (typeof callback === 'function') callback(); return 0; });
    var clearTimeoutImpl = opts.clearTimeoutImpl || (typeof window.clearTimeout === 'function' ? window.clearTimeout.bind(window) : function(){});
    var onStateChange = typeof opts.onStateChange === 'function' ? opts.onStateChange : function(){};
    var realtimeTransportFactory = typeof opts.realtimeTransportFactory === 'function'
      ? opts.realtimeTransportFactory
      : defaultRealtimeTransportFactory;
    var gameStateReconciliationFactory = opts.gameStateReconciliationFactory || defaultGameStateReconciliationFactory();
    var state = {status:'LOADING',context:null,room:null,roster:null,lastSyncAt:null,lastError:null,trend:[],gameState:null,lastGameStateSyncAt:null,lastGameStateError:null};
    var heartbeatTimer = null;
    var rosterTimer = null;
    var heartbeatInFlight = null;
    var rosterInFlight = null;
    var presenceRequestGeneration = 0;
    var lastForegroundRefreshAt = null;
    var signalRefreshTimer = null;
    var realtimeTransport = null;
    var realtimeSubscribedRoomId = '';
    var gameStateClient = null;
    var gameStateReconciliation = null;
    var gameStateVisible = opts.gameStateVisible !== false;
    var destroyed = false;

    function emit(patch){
      state = Object.assign({}, state, patch || {});
      try { onStateChange(Object.freeze(Object.assign({}, state, {trend:Object.freeze(state.trend.slice())}))); } catch (ignore) {}
      return state;
    }

    function resetPresenceRequests(){
      presenceRequestGeneration += 1;
      heartbeatInFlight = null;
      rosterInFlight = null;
      lastForegroundRefreshAt = null;
      return presenceRequestGeneration;
    }

    function activePresenceRequest(generation, roomId, participantId){
      return !destroyed && generation === presenceRequestGeneration && state.status === 'ACTIVE' && state.context &&
        text(state.context.roomId) === roomId && text(state.context.participantId) === participantId;
    }

    function stopTimers(){
      if (heartbeatTimer !== null) { try { clearIntervalImpl(heartbeatTimer); } catch (ignore) {} heartbeatTimer = null; }
      if (rosterTimer !== null) { try { clearIntervalImpl(rosterTimer); } catch (ignore) {} rosterTimer = null; }
      if (signalRefreshTimer !== null) { try { clearTimeoutImpl(signalRefreshTimer); } catch (ignore) {} signalRefreshTimer = null; }
    }

    function stopGameStateReconciliation(){
      if(gameStateReconciliation&&typeof gameStateReconciliation.stop==='function'){
        try{gameStateReconciliation.stop();}catch(ignoreGameStateStop){}
      }
      gameStateReconciliation=null;
      gameStateClient=null;
    }

    function detachRealtime(){
      if (!realtimeTransport) return;
      if (realtimeSubscribedRoomId && typeof realtimeTransport.unsubscribeRoom === 'function') {
        try { realtimeTransport.unsubscribeRoom(realtimeSubscribedRoomId); } catch (ignoreUnsubscribe) {}
      }
      realtimeSubscribedRoomId = '';
      if (typeof realtimeTransport.destroy === 'function') {
        try { realtimeTransport.destroy(); } catch (ignoreDestroy) {}
      }
      realtimeTransport = null;
    }

    function clearHostContext(){
      var context = state.context;
      try { storage.removeItem(CONTEXT_KEY); } catch (ignore) {}
      if (context && client && typeof client.forgetCapability === 'function') {
        try { client.forgetCapability(context.roomId, context.participantId); } catch (ignore) {}
      }
    }

    function fatal(error){
      resetPresenceRequests();
      stopTimers();
      stopGameStateReconciliation();
      detachRealtime();
      clearHostContext();
      return emit({status:error && error.code === 'ROOM_EXPIRED' ? 'EXPIRED' : 'ERROR',room:null,roster:null,gameState:null,lastError:error || {code:'HOST_CONSOLE_FAILED',message:'No se pudo recuperar la consola de mando.'}});
    }

    function recordTrend(roster){
      if (!roster || !Number.isInteger(roster.activePlayerCount)) return;
      var samples = state.trend.slice();
      samples.push({at:nowImpl(),count:roster.activePlayerCount});
      if (samples.length > MAX_TREND_SAMPLES) samples = samples.slice(samples.length - MAX_TREND_SAMPLES);
      state.trend = samples;
    }

    function refreshRoster(){
      if(rosterInFlight)return rosterInFlight;
      var request=performRosterRefresh();
      rosterInFlight=request;
      request.then(function(){ clearRosterInFlight(request); },function(){ clearRosterInFlight(request); });
      return request;
    }
    function clearRosterInFlight(request){ if (rosterInFlight === request) rosterInFlight = null; }

    async function performRosterRefresh(){
      if (destroyed || state.status !== 'ACTIVE' || !state.context) return state;
      var roomId = text(state.context.roomId);
      var participantId = text(state.context.participantId);
      var requestGeneration = presenceRequestGeneration;
      var response = await client.getLiveRoomRoster(roomId, participantId);
      if (!activePresenceRequest(requestGeneration, roomId, participantId)) return state;
      if (!response || response.success !== true || !response.data || !response.data.roster) {
        var error = response && response.error || {code:'LIVE_ROOM_ROSTER_FAILED',message:'No se pudo actualizar la presencia.'};
        if (['ROOM_EXPIRED','ROOM_UNAVAILABLE','PARTICIPANT_UNAVAILABLE','CAPABILITY_INVALID','CAPABILITY_STORAGE_UNAVAILABLE','HOST_REQUIRED'].indexOf(error.code) >= 0) return fatal(error);
        return emit({status:'ACTIVE',lastError:error});
      }
      recordTrend(response.data.roster);
      return emit({status:'ACTIVE',roster:response.data.roster,lastSyncAt:nowImpl(),lastError:null,trend:state.trend});
    }

    function gameStateError(code,message,retryable){
      return {code:code||'LIVE_ROOM_GAME_STATE_FAILED',message:message||'No se pudo actualizar el progreso compartido.',retryable:retryable!==false};
    }

    function isFatalGameStateError(error){
      return Boolean(error&&['ROOM_EXPIRED','ROOM_UNAVAILABLE','PARTICIPANT_UNAVAILABLE','CAPABILITY_INVALID','CAPABILITY_STORAGE_UNAVAILABLE','HOST_REQUIRED'].indexOf(error.code)>=0);
    }

    function isSchedulerRefreshMetadata(value, expectedRoomId, expectedParticipantId){
      if(!value||typeof value!=='object'||Array.isArray(value))return false;
      if(typeof expectedRoomId!=='undefined'||typeof expectedParticipantId!=='undefined')return false;
      return ['signal','visibility','manual','periodic','retry'].indexOf(text(value.reason))>=0&&
        Number.isInteger(value.attempt)&&value.attempt>=1&&
        Number.isInteger(value.requestedAt);
    }

    async function performGameStateRefresh(expectedGeneration, expectedRoomId, expectedParticipantId){
      if(destroyed||state.status!=='ACTIVE'||!state.context||!gameStateClient){
        return {success:false,retryable:false,terminal:true};
      }
      var schedulerRefresh = isSchedulerRefreshMetadata(expectedGeneration, expectedRoomId, expectedParticipantId);
      var usesExpectedContext = !schedulerRefresh && (
        typeof expectedGeneration !== 'undefined' ||
        typeof expectedRoomId !== 'undefined' ||
        typeof expectedParticipantId !== 'undefined');
      var normalizedExpectedRoomId = text(expectedRoomId);
      var normalizedExpectedParticipantId = text(expectedParticipantId);
      if (usesExpectedContext && (!Number.isInteger(expectedGeneration) || !normalizedExpectedRoomId || !normalizedExpectedParticipantId)) {
        return {success:false,retryable:false,terminal:true};
      }
      var requestGeneration=usesExpectedContext?expectedGeneration:presenceRequestGeneration;
      var requestRoomId=usesExpectedContext?normalizedExpectedRoomId:text(state.context.roomId);
      var requestParticipantId=usesExpectedContext?normalizedExpectedParticipantId:text(state.context.participantId);
      if(!activePresenceRequest(requestGeneration,requestRoomId,requestParticipantId)){
        return {success:false,retryable:false,terminal:true};
      }
      var response;
      try{response=await gameStateClient.getLiveRoomGameState();}catch(ignoreGameStateRead){response=null;}
      if(!activePresenceRequest(requestGeneration,requestRoomId,requestParticipantId)){
        return {success:false,retryable:false,terminal:true};
      }
      if(!response||response.success!==true||!response.data||!response.data.gameState){
        var error=response&&response.error||gameStateError('LIVE_ROOM_GAME_STATE_READ_FAILED','No se pudo actualizar el progreso compartido.',true);
        if(isFatalGameStateError(error)){
          fatal(error);
          return {success:false,retryable:false,terminal:true};
        }
        var retryable=error.retryable!==false;
        emit({status:'ACTIVE',lastGameStateError:error});
        return {success:false,retryable:retryable,terminal:!retryable};
      }
      emit({status:'ACTIVE',gameState:response.data.gameState,lastGameStateSyncAt:nowImpl(),lastGameStateError:null});
      return {success:true,retryable:true,terminal:false};
    }

    async function initializeGameState(context, lifecycleGeneration){
      stopGameStateReconciliation();
      if(!context||!Array.isArray(context.missionOrder)||!context.missionOrder.length){
        emit({status:'ACTIVE',lastGameStateError:gameStateError('LIVE_ROOM_GAME_STATE_CONTEXT_UNAVAILABLE','El progreso compartido no está disponible para esta sala.',false)});
        return false;
      }
      if(!client||typeof client.createGameStateClient!=='function'){
        emit({status:'ACTIVE',lastGameStateError:gameStateError('LIVE_ROOM_GAME_STATE_CLIENT_UNAVAILABLE','El progreso compartido no está disponible en esta consola.',false)});
        return false;
      }
      var gameContext={
        roomId:context.roomId,
        campaignId:context.campaignId,
        publicationId:context.publicationId,
        participantId:context.participantId,
        missionOrder:context.missionOrder.slice()
      };
      try{gameStateClient=client.createGameStateClient(gameContext);}catch(ignoreGameStateClient){gameStateClient=null;}
      if(!gameStateClient||typeof gameStateClient.available!=='function'||gameStateClient.available()!==true||typeof gameStateClient.getLiveRoomGameState!=='function'){
        gameStateClient=null;
        emit({status:'ACTIVE',lastGameStateError:gameStateError('LIVE_ROOM_GAME_STATE_CLIENT_UNAVAILABLE','El progreso compartido no está disponible en esta consola.',false)});
        return false;
      }
      var initialOutcome=await performGameStateRefresh(
        Number.isInteger(lifecycleGeneration) ? lifecycleGeneration : null,
        context.roomId,
        context.participantId
      );
      if(destroyed||state.status!=='ACTIVE'||initialOutcome.terminal)return false;
      if(!gameStateReconciliationFactory||typeof gameStateReconciliationFactory.createScheduler!=='function')return true;
      var created;
      try{created=gameStateReconciliationFactory.createScheduler({visible:gameStateVisible,refresh:performGameStateRefresh});}
      catch(ignoreGameStateScheduler){created=null;}
      if(!created||typeof created.available!=='function'||created.available()!==true)return true;
      gameStateReconciliation=created;
      if(typeof created.start==='function'){try{created.start();}catch(ignoreGameStateStart){}}
      return true;
    }

    function refreshGameState(){
      if(!gameStateReconciliation||typeof gameStateReconciliation.request!=='function')return Promise.resolve(false);
      try{return Promise.resolve(gameStateReconciliation.request('manual'));}catch(ignoreGameStateManual){return Promise.resolve(false);}
    }

    function setGameStateVisibility(visible){
      gameStateVisible=visible===true;
      if(!gameStateReconciliation||typeof gameStateReconciliation.setVisible!=='function')return false;
      try{gameStateReconciliation.setVisible(gameStateVisible);return true;}catch(ignoreGameStateVisibility){return false;}
    }
    function scheduleRealtimeRefresh(){
      if (destroyed || state.status !== 'ACTIVE' || !state.context) return;
      if (signalRefreshTimer !== null) return;
      signalRefreshTimer = setTimeoutImpl(function(){
        signalRefreshTimer = null;
        refreshRoster();
      }, REALTIME_SIGNAL_DEBOUNCE_MS);
    }

    function attachRealtime(roomId){
      if (destroyed) return;
      var normalizedRoomId = text(roomId);
      if (!normalizedRoomId) return;
      detachRealtime();
      try {
        realtimeTransport = realtimeTransportFactory();
      } catch (ignoreFactoryError) {
        realtimeTransport = null;
        return;
      }
      if (!realtimeTransport || typeof realtimeTransport.subscribeRoom !== 'function') {
        realtimeTransport = null;
        return;
      }
      try {
        var subscribed = realtimeTransport.subscribeRoom(normalizedRoomId, function(signal){
          if(signal&&signal.type===PRESENCE_SIGNAL_TYPE){
            scheduleRealtimeRefresh();
            return;
          }
          if(signal&&signal.type===GAME_STATE_SIGNAL_TYPE&&gameStateReconciliation&&typeof gameStateReconciliation.request==='function'){
            try{gameStateReconciliation.request('signal');}catch(ignoreGameStateSignal){}
          }
        });
        if (subscribed === false) {
          detachRealtime();
          return;
        }
        realtimeSubscribedRoomId = normalizedRoomId;
      } catch (ignoreSubscribeError) {
        detachRealtime();
      }
    }

    function heartbeat(){
      if(heartbeatInFlight)return heartbeatInFlight;
      var request=performHeartbeat();
      heartbeatInFlight=request;
      request.then(function(){ clearHeartbeatInFlight(request); },function(){ clearHeartbeatInFlight(request); });
      return request;
    }
    function clearHeartbeatInFlight(request){ if (heartbeatInFlight === request) heartbeatInFlight = null; }

    async function performHeartbeat(){
      if (destroyed || state.status !== 'ACTIVE' || !state.context) return state;
      var roomId = text(state.context.roomId);
      var participantId = text(state.context.participantId);
      var requestGeneration = presenceRequestGeneration;
      var response = await client.heartbeatLiveRoom(roomId, participantId);
      if (!activePresenceRequest(requestGeneration, roomId, participantId)) return state;
      if (!response || response.success !== true) {
        var error = response && response.error || {code:'LIVE_ROOM_HEARTBEAT_FAILED',message:'No se pudo actualizar la presencia del anfitrión.'};
        if (['ROOM_EXPIRED','ROOM_UNAVAILABLE','PARTICIPANT_UNAVAILABLE','CAPABILITY_STORAGE_UNAVAILABLE'].indexOf(error.code) >= 0) return fatal(error);
        return emit({status:'ACTIVE',lastError:error});
      }
      return emit({status:'ACTIVE',room:response.data && response.data.room || state.room,lastError:null});
    }

    function refreshAfterForeground(){
      if (destroyed || state.status !== 'ACTIVE') return false;
      var current = Number(nowImpl());
      if (!Number.isFinite(current)) current = Date.now();
      if (lastForegroundRefreshAt !== null) {
        var elapsed = current - lastForegroundRefreshAt;
        if (elapsed >= 0 && elapsed < FOREGROUND_REFRESH_MIN_INTERVAL_MS) return false;
      }
      lastForegroundRefreshAt = current;
      heartbeat();
      refreshRoster();
      return true;
    }

    async function start(){
      if (destroyed) return state;
      if (!client || typeof client.available !== 'function' || client.available() !== true) return fatal({code:'LIVE_ROOM_CLIENT_UNAVAILABLE',message:'El servicio de partidas en vivo no está disponible.'});
      var context = readContext(storage);
      if (!context) return emit({status:'NO_CONTEXT',lastError:{code:'HOST_CONTEXT_MISSING',message:'No hay una partida activa guardada en este navegador.'}});
      state.context = context;
      if (!validateUrlContext(context, href)) return fatal({code:'HOST_CONTEXT_URL_MISMATCH',message:'La URL de la consola no coincide con la sala guardada.'});

      var lifecycleGeneration = resetPresenceRequests();
      var response = await client.getLiveRoom(context.roomId);
      if (destroyed || lifecycleGeneration !== presenceRequestGeneration || !state.context || text(state.context.roomId) !== text(context.roomId) || text(state.context.participantId) !== text(context.participantId)) return state;
      if (!response || response.success !== true || !response.data || !response.data.room) {
        var error = response && response.error || {code:'ROOM_UNAVAILABLE',message:'La sala ya no está disponible.'};
        return fatal(error);
      }
      var room = response.data.room;
      if (text(room.campaignId) !== context.campaignId || text(room.publicationId) !== context.publicationId) {
        return fatal({code:'ROOM_PUBLICATION_MISMATCH',message:'La sala no coincide con la publicación esperada.'});
      }
      emit({status:'ACTIVE',room:room,lastError:null});
      attachRealtime(context.roomId);
      await heartbeat();
      if (destroyed || lifecycleGeneration !== presenceRequestGeneration || !state.context || text(state.context.roomId) !== text(context.roomId) || text(state.context.participantId) !== text(context.participantId)) return state;
      await refreshRoster();
      if (destroyed || lifecycleGeneration !== presenceRequestGeneration || !state.context || text(state.context.roomId) !== text(context.roomId) || text(state.context.participantId) !== text(context.participantId)) return state;
      await initializeGameState(context, lifecycleGeneration);
      if (!activePresenceRequest(lifecycleGeneration, text(context.roomId), text(context.participantId))) return state;
      heartbeatTimer = setIntervalImpl(function(){ heartbeat(); }, HEARTBEAT_INTERVAL_MS);
      rosterTimer = setIntervalImpl(function(){ refreshRoster(); }, ROSTER_REFRESH_INTERVAL_MS);
      return state;
    }

    function getState(){ return Object.assign({}, state, {trend:state.trend.slice()}); }
    function destroy(){ destroyed = true; resetPresenceRequests(); stopTimers(); stopGameStateReconciliation(); detachRealtime(); }

    return Object.freeze({start:start,heartbeat:heartbeat,refreshRoster:refreshRoster,refreshAfterForeground:refreshAfterForeground,refreshGameState:refreshGameState,setGameStateVisibility:setGameStateVisibility,getState:getState,destroy:destroy});
  }

  function renderTrend(samples){
    var line = document.getElementById('hostConsolePresenceTrendLine');
    var dots = document.getElementById('hostConsolePresenceTrendDots');
    var label = document.getElementById('hostConsoleTrendLabel');
    var events = document.getElementById('hostConsolePresenceEvents');
    if (!line || !label) return;
    var list = Array.isArray(samples) ? samples : [];
    if (!list.length) {
      line.setAttribute('points','');
      label.textContent='sin muestras';
      if(dots)dots.innerHTML='';
      if(events)events.innerHTML='<div class="host-console__empty host-console__empty--compact">Sin cambios de presencia todavía.</div>';
      return;
    }
    var max = Math.max(1, list.reduce(function(acc,item){ return Math.max(acc,Number(item.count)||0); },0));
    var width = 296, height = 86, left = 12, bottom = 106;
    var coords=list.map(function(item,index){
      var x = left + (list.length === 1 ? width : width * index / (list.length - 1));
      var y = bottom - (height * (Number(item.count)||0) / max);
      return {x:x,y:y,count:Number(item.count)||0,at:Number(item.at)||0};
    });
    line.setAttribute('points',coords.map(function(item){return item.x.toFixed(1)+','+item.y.toFixed(1);}).join(' '));
    label.textContent = list.length + (list.length === 1 ? ' muestra' : ' muestras');

    if(dots){
      dots.innerHTML='';
      coords.forEach(function(item,index){
        var previous=index>0?coords[index-1].count:item.count;
        var changed=index>0&&previous!==item.count;
        var circle=document.createElementNS('http://www.w3.org/2000/svg','circle');
        circle.setAttribute('cx',item.x.toFixed(1));
        circle.setAttribute('cy',item.y.toFixed(1));
        circle.setAttribute('r',changed?'4.5':'2.5');
        circle.setAttribute('class',changed?'host-trend__dot host-trend__dot--event':'host-trend__dot');
        dots.appendChild(circle);
      });
    }

    if(events){
      var changes=[];
      for(var i=1;i<coords.length;i+=1){
        var delta=coords[i].count-coords[i-1].count;
        if(delta!==0)changes.push({delta:delta,at:coords[i].at,count:coords[i].count});
      }
      changes=changes.slice(-4).reverse();
      if(!changes.length){
        events.innerHTML='<div class="host-console__empty host-console__empty--compact">Sin entradas o salidas desde que se abrió la consola.</div>';
      }else{
        events.innerHTML=changes.map(function(change){
          var entering=change.delta>0;
          var amount=Math.abs(change.delta);
          var labelText=entering
            ? ('+'+amount+' '+(amount===1?'jugador conectado':'jugadores conectados'))
            : ('-'+amount+' '+(amount===1?'jugador desconectado':'jugadores desconectados'));
          return '<div class="host-presence-event" data-kind="'+(entering?'join':'leave')+'"><span class="host-presence-event__mark">'+(entering?'+':'−')+'</span><span><strong>'+labelText+'</strong><small>'+humanAge(now()-change.at)+' · total '+change.count+'</small></span></div>';
        }).join('');
      }
    }
  }

  function renderRoster(roster){
    var count = document.getElementById('hostConsolePlayerCount');
    var hint = document.getElementById('hostConsolePlayerHint');
    var registered = document.getElementById('hostConsoleRegisteredCount');
    var list = document.getElementById('hostConsoleParticipantList');
    var map = document.getElementById('hostConsolePresenceMap');
    if (!roster) {
      count.textContent='—'; hint.textContent='Esperando datos de presencia'; registered.textContent='0 registrados';
      list.innerHTML='<div class="host-console__empty">Aún no hay datos de participantes.</div>'; map.innerHTML=''; return;
    }
    count.textContent=String(Number.isInteger(roster.activePlayerCount)?roster.activePlayerCount:0);
    hint.textContent=roster.activePlayerCount === 1 ? '1 estudiante activo' : String(roster.activePlayerCount||0) + ' estudiantes activos';
    registered.textContent=String(roster.registeredParticipantCount||0) + ' registrados';
    var participants = Array.isArray(roster.participants) ? roster.participants : [];
    map.innerHTML=''; list.innerHTML='';
    participants.forEach(function(p,index){
      var node=document.createElement('span'); node.className='host-presence-node'; node.dataset.connected=String(p.connected===true); node.dataset.role=text(p.role)||'player'; node.title=(p.role==='host'?'Anfitrión':'Jugador')+' · '+(p.connected?'conectado':'sin actividad'); node.textContent=p.role==='host'?'H':String(index+1); map.appendChild(node);
      var row=document.createElement('div'); row.className='host-participant'; row.dataset.connected=String(p.connected===true);
      var dot=document.createElement('span'); dot.className='host-participant__dot';
      var main=document.createElement('div');
      var name=document.createElement('div'); name.className='host-participant__name'; name.textContent=p.role==='host'?'Anfitrión':'Jugador '+shortId(p.participantId);
      var meta=document.createElement('div'); meta.className='host-participant__meta'; meta.textContent=(p.connected?'Conectado':'Sin actividad')+(p.role==='host'?' · host':'');
      main.appendChild(name);main.appendChild(meta);
      var role=document.createElement('span');role.className='host-console__chip';role.textContent=p.role==='host'?'HOST':'PLAYER';
      row.appendChild(dot);row.appendChild(main);row.appendChild(role);list.appendChild(row);
    });
    if (!participants.length) list.innerHTML='<div class="host-console__empty">No hay participantes registrados.</div>';
  }

  function renderGameState(gameState,missionOrder,error){
    var value=document.getElementById('hostConsoleProgressValue');
    var hint=document.getElementById('hostConsoleProgressHint');
    var label=document.getElementById('hostConsoleProgressLabel');
    var list=document.getElementById('hostConsoleMissionProgressList');
    if(!value||!hint||!label||!list)return;
    var order=normalizedMissionOrder(missionOrder);
    if(!order.length){
      value.textContent='—';
      hint.textContent='No disponible para esta sala';
      label.textContent='sin secuencia';
      list.innerHTML='<div class="host-console__empty host-console__empty--compact">La sala no conserva la secuencia pública de misiones.</div>';
      return;
    }
    var completed=gameState&&Array.isArray(gameState.completedMissionIds)?gameState.completedMissionIds:[];
    var completedSet=Object.create(null);
    completed.forEach(function(missionId){completedSet[missionId]=true;});
    value.textContent=String(completed.length)+' / '+String(order.length);
    hint.textContent=error?(gameState?'Último progreso válido conservado':'Progreso temporalmente no disponible'):(gameState?'Progreso compartido actualizado':'Esperando primera lectura');
    label.textContent=completed.length===order.length?'completo':(completed.length+' de '+order.length);
    list.innerHTML='';
    order.forEach(function(missionId,index){
      var done=completedSet[missionId]===true;
      var row=document.createElement('div');
      row.className='host-mission-progress';
      row.dataset.completed=String(done);
      var marker=document.createElement('span');
      marker.className='host-mission-progress__marker';
      marker.textContent=done?'✓':String(index+1);
      var copy=document.createElement('span');
      var title=document.createElement('strong');
      title.textContent='Misión '+String(index+1);
      var status=document.createElement('small');
      status.textContent=done?'Completada por el equipo':'Pendiente';
      copy.appendChild(title);
      copy.appendChild(status);
      row.appendChild(marker);
      row.appendChild(copy);
      list.appendChild(row);
    });
  }
  function bootstrap(){
    var live = window.CRIOS_LIVE_ROOM_BROWSER;
    var client = live && live.configured && !live.error ? live.client : null;
    var statusNode=document.getElementById('hostConsoleRoomStatus');
    var campaignLabel=document.getElementById('hostConsoleCampaignLabel');
    var roomState=document.getElementById('hostConsoleRoomState');
    var roomId=document.getElementById('hostConsoleRoomId');
    var syncAge=document.getElementById('hostConsoleSyncAge');
    var syncHint=document.getElementById('hostConsoleSyncHint');
    var notice=document.getElementById('hostConsoleNotice');
    var playerLink=document.getElementById('hostConsolePlayerLink');
    var publicationRef=document.getElementById('hostConsolePublicationRef');
    var shareButton=document.getElementById('hostConsoleShareButton');
    var lastState=null;

    function render(state){
      lastState=state;
      var context=state.context;
      var active=state.status==='ACTIVE';
      statusNode.dataset.state=active?'active':(state.status==='EXPIRED'?'expired':(state.status==='LOADING'?'loading':'error'));
      statusNode.textContent=active?'Partida activa':(state.status==='EXPIRED'?'Sesión finalizada':(state.status==='NO_CONTEXT'?'Sin contexto':'Conectando…'));
      campaignLabel.textContent=context
        ? (context.campaignName || 'Campaña publicada')+' · sala '+shortId(context.roomId)
        : 'Sin partida activa asociada';
      roomState.textContent=active?'ACTIVA':(state.status==='EXPIRED'?'EXPIRADA':'NO DISPONIBLE');
      roomId.textContent='Sala: '+(context?context.roomId:'—');
      playerLink.value=context?context.playerHref:'';
      publicationRef.textContent=context?('Publicación: '+context.campaignId+' / '+context.publicationId):'Publicación: —';
      if(shareButton)shareButton.disabled=!(active&&context&&context.playerHref);
      renderRoster(state.roster);
      renderTrend(state.trend);
      renderGameState(state.gameState,context&&context.missionOrder,state.lastGameStateError);
      if (state.lastError) { notice.hidden=false; notice.textContent=state.status==='EXPIRED'?'Esta sesión finalizó por inactividad.':state.lastError.message; }
      else { notice.hidden=true; notice.textContent=''; }
      updateClock();
    }

    function updateClock(){
      if (!lastState || !lastState.lastSyncAt) { syncAge.textContent='—'; syncHint.textContent='Esperando primera actualización'; return; }
      syncAge.textContent=humanAge(now()-lastState.lastSyncAt);
      syncHint.textContent=lastState.lastError?'Último dato válido conservado':'Presencia actualizada';
    }

    var controller=createController({client:client,onStateChange:render});
    controller.setGameStateVisibility(document.visibilityState!=='hidden');
    controller.start();
    var clockTimer=window.setInterval(updateClock,CLOCK_REFRESH_INTERVAL_MS);
    document.addEventListener('visibilitychange',function(){
      controller.setGameStateVisibility(document.visibilityState!=='hidden');
      if(document.visibilityState==='visible')controller.refreshAfterForeground();
    });
    if(typeof window.addEventListener==='function')window.addEventListener('focus',function(){controller.refreshAfterForeground();});
    window.addEventListener('beforeunload',function(){window.clearInterval(clockTimer);controller.destroy();});
    window.CRIOS_HOST_CONSOLE_CONTROLLER=controller;
  }

  window.CRIOS_HOST_CONSOLE=Object.freeze({
    version:VERSION,
    heartbeatIntervalMs:HEARTBEAT_INTERVAL_MS,
    rosterRefreshIntervalMs:ROSTER_REFRESH_INTERVAL_MS,
    foregroundRefreshMinIntervalMs:FOREGROUND_REFRESH_MIN_INTERVAL_MS,
    realtimeSignalDebounceMs:REALTIME_SIGNAL_DEBOUNCE_MS,
    contextKey:CONTEXT_KEY,
    presenceSignalType:PRESENCE_SIGNAL_TYPE,
    gameStateSignalType:GAME_STATE_SIGNAL_TYPE,
    defaultContextStorage:defaultContextStorage,
    defaultRealtimeTransportFactory:defaultRealtimeTransportFactory,
    defaultGameStateReconciliationFactory:defaultGameStateReconciliationFactory,
    readContext:readContext,
    buildConsoleHref:buildConsoleHref,
    validateUrlContext:validateUrlContext,
    createController:createController
  });

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bootstrap);else bootstrap();
})();
