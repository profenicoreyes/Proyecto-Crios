/* CRIOS Runtime LiveRoom player - visible join and player presence */
(function(){
  'use strict';

  var VERSION = '1.1.0';
  var HEARTBEAT_INTERVAL_MS = 2 * 60 * 1000;
  var CONTEXT_KEY = 'crios-live-room-player-context-v1';
  var EXPIRED_MESSAGE = 'Esta sesión finalizó por inactividad.';
  var REALTIME_SIGNAL_TYPE = 'presence-change';

  function clone(value) {
    if (value === null || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map(clone);
    var copy = {};
    Object.keys(value).forEach(function(key){ copy[key] = clone(value[key]); });
    return copy;
  }

  function freeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.keys(value).forEach(function(key){ freeze(value[key]); });
    return Object.freeze(value);
  }

  function frozen(value) { return freeze(clone(value)); }
  function text(value) { return typeof value === 'string' ? value.trim() : ''; }

  function errorValue(code, message) {
    return frozen({code: text(code) || 'LIVE_ROOM_PLAYER_ERROR', message: String(message || code || 'No se pudo conectar con la partida en vivo.')});
  }

  function parseRoomLaunch(search, runtimeLaunch) {
    var raw = typeof search === 'string' ? search : '';
    var params;
    try { params = new URLSearchParams(raw); }
    catch (ignore) { return frozen({requested:false,valid:false,roomId:null,campaignId:null,publicationId:null,error:errorValue('INVALID_ROOM_LINK','El enlace de partida no es válido.')}); }

    var roomValues = typeof params.getAll === 'function' ? params.getAll('roomId') : [];
    if (!roomValues.length) return frozen({requested:false,valid:true,roomId:null,campaignId:null,publicationId:null,error:null});
    if (roomValues.length !== 1) return frozen({requested:true,valid:false,roomId:null,campaignId:null,publicationId:null,error:errorValue('INVALID_ROOM_LINK','El enlace de partida no es válido.')});

    var roomId = text(roomValues[0]);
    var launch = runtimeLaunch && typeof runtimeLaunch === 'object' ? runtimeLaunch : {};
    var campaignId = text(launch.campaignId);
    var publicationId = text(launch.publicationId);
    var published = launch.blocked !== true && launch.sourceMode === 'published';

    if (!roomId || roomId.length > 160 || !published || !campaignId || !publicationId) {
      return frozen({requested:true,valid:false,roomId:roomId || null,campaignId:campaignId || null,publicationId:publicationId || null,error:errorValue('INVALID_ROOM_LINK','El enlace de partida no es válido.')});
    }

    return frozen({requested:true,valid:true,roomId:roomId,campaignId:campaignId,publicationId:publicationId,error:null});
  }

  function defaultStorage() {
    var storage = null;
    try { storage = window.sessionStorage || null; } catch (ignore) { storage = null; }
    return Object.freeze({
      available: function(){
        if (!storage) return false;
        var key = CONTEXT_KEY + ':probe';
        try { storage.setItem(key, '1'); var ok = storage.getItem(key) === '1'; storage.removeItem(key); return ok; } catch (ignore) { return false; }
      },
      get: function(){
        if (!storage) return null;
        try {
          var raw = storage.getItem(CONTEXT_KEY);
          if (!raw) return null;
          var parsed = JSON.parse(raw);
          return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
        } catch (ignore) { return null; }
      },
      set: function(value){
        if (!storage) return false;
        try { storage.setItem(CONTEXT_KEY, JSON.stringify(value)); return true; } catch (ignore) { return false; }
      },
      clear: function(){
        if (!storage) return false;
        try { storage.removeItem(CONTEXT_KEY); return true; } catch (ignore) { return false; }
      }
    });
  }

  function defaultRealtimeTransportFactory() {
    var config = typeof CRIOS_CONFIG !== 'undefined' && CRIOS_CONFIG ? CRIOS_CONFIG.realtime : null;
    var firebaseProvider = window.CRIOS_FIREBASE_LIVE_ROOM_REALTIME_PROVIDER;
    if (firebaseProvider && typeof firebaseProvider.isCompleteConfig === 'function' && firebaseProvider.isCompleteConfig(config) && typeof firebaseProvider.createTransport === 'function') {
      try { return firebaseProvider.createTransport(config); } catch (ignoreFirebaseProviderError) {}
    }
    var api = window.CRIOS_LIVE_ROOM_REALTIME_TRANSPORT;
    if (api && typeof api.createTransport === 'function') {
      try { return api.createTransport(); } catch (ignoreBaseTransportError) {}
    }
    return Object.freeze({
      subscribeRoom:function(){ return true; },
      unsubscribeRoom:function(){ return true; },
      publishSignal:function(){ return true; },
      destroy:function(){}
    });
  }

  function defaultRealtimeEventIdFactory() {
    try {
      if (window.crypto && typeof window.crypto.randomUUID === 'function') return 'presence-' + window.crypto.randomUUID();
      if (window.crypto && typeof window.crypto.getRandomValues === 'function') {
        var bytes = new Uint8Array(16);
        window.crypto.getRandomValues(bytes);
        return 'presence-' + Array.prototype.map.call(bytes, function(byte){ return byte.toString(16).padStart(2, '0'); }).join('');
      }
    } catch (ignore) {}
    return '';
  }

  function defaultParticipantIdFactory() {
    try {
      if (window.crypto && typeof window.crypto.randomUUID === 'function') return 'player-' + window.crypto.randomUUID();
      if (window.crypto && typeof window.crypto.getRandomValues === 'function') {
        var bytes = new Uint8Array(16);
        window.crypto.getRandomValues(bytes);
        return 'player-' + Array.prototype.map.call(bytes, function(byte){ return byte.toString(16).padStart(2, '0'); }).join('');
      }
    } catch (ignore) {}
    return '';
  }

  function baseState(status) {
    return {
      status: status || 'IDLE',
      busy: false,
      launch: null,
      room: null,
      participantId: null,
      lastError: null,
      lastHeartbeatAt: null
    };
  }

  function sameRoom(room, launch) {
    return Boolean(room && launch &&
      text(room.roomId) === text(launch.roomId) &&
      text(room.campaignId) === text(launch.campaignId) &&
      text(room.publicationId) === text(launch.publicationId));
  }

  function sameContext(context, launch) {
    return Boolean(context && launch &&
      Number(context.version) === 1 &&
      text(context.roomId) === text(launch.roomId) &&
      text(context.campaignId) === text(launch.campaignId) &&
      text(context.publicationId) === text(launch.publicationId) &&
      text(context.participantId));
  }

  function createPlayerController(options) {
    var opts = options && typeof options === 'object' ? options : {};
    var client = opts.client || null;
    var storage = opts.storage || defaultStorage();
    var participantIdFactory = typeof opts.participantIdFactory === 'function' ? opts.participantIdFactory : defaultParticipantIdFactory;
    var setIntervalImpl = typeof opts.setIntervalImpl === 'function' ? opts.setIntervalImpl : window.setInterval.bind(window);
    var clearIntervalImpl = typeof opts.clearIntervalImpl === 'function' ? opts.clearIntervalImpl : window.clearInterval.bind(window);
    var now = typeof opts.now === 'function' ? opts.now : function(){ return Date.now(); };
    var onStateChange = typeof opts.onStateChange === 'function' ? opts.onStateChange : function(){};
    var realtimeTransportFactory = typeof opts.realtimeTransportFactory === 'function' ? opts.realtimeTransportFactory : defaultRealtimeTransportFactory;
    var realtimeEventIdFactory = typeof opts.realtimeEventIdFactory === 'function' ? opts.realtimeEventIdFactory : defaultRealtimeEventIdFactory;
    var state = baseState(client && typeof client.available === 'function' && client.available() ? 'IDLE' : 'UNAVAILABLE');
    var timer = null;
    var realtimeTransport = null;
    var destroyed = false;

    function emit(next) {
      state = Object.assign(baseState(next && next.status || state.status), state, next || {});
      var snapshot = frozen(state);
      try { onStateChange(snapshot); } catch (ignore) {}
      return snapshot;
    }

    function stopHeartbeat() {
      if (timer !== null) {
        try { clearIntervalImpl(timer); } catch (ignore) {}
        timer = null;
      }
    }

    function startHeartbeat() {
      stopHeartbeat();
      if (destroyed || state.status !== 'ACTIVE' || !state.launch || !state.participantId) return;
      timer = setIntervalImpl(function(){ heartbeat(); }, HEARTBEAT_INTERVAL_MS);
    }

    function destroyRealtime() {
      if (!realtimeTransport) return;
      if (typeof realtimeTransport.destroy === 'function') {
        try { realtimeTransport.destroy(); } catch (ignoreDestroyRealtime) {}
      }
      realtimeTransport = null;
    }

    function publishRealtimePresence(roomId) {
      if (destroyed) return false;
      var normalizedRoomId = text(roomId);
      if (!normalizedRoomId) return false;
      if (!realtimeTransport) {
        try { realtimeTransport = realtimeTransportFactory(); }
        catch (ignoreRealtimeFactory) { realtimeTransport = null; }
      }
      if (!realtimeTransport || typeof realtimeTransport.publishSignal !== 'function') return false;
      var eventId = text(realtimeEventIdFactory());
      if (!eventId) return false;
      var emittedAt;
      try { emittedAt = new Date(now()).toISOString(); } catch (ignoreDate) { return false; }
      try {
        return realtimeTransport.publishSignal(normalizedRoomId, {type:REALTIME_SIGNAL_TYPE,eventId:eventId,emittedAt:emittedAt}) !== false;
      } catch (ignorePublish) { return false; }
    }

    function clearContext(context) {
      if (storage && typeof storage.clear === 'function') storage.clear();
      if (context && client && typeof client.forgetCapability === 'function') {
        var roomId = text(context.roomId);
        var participantId = text(context.participantId);
        if (roomId && participantId) {
          try { client.forgetCapability(roomId, participantId); } catch (ignore) {}
        }
      }
    }

    function saveContext(launch, participantId) {
      var context = {
        version: 1,
        roomId: text(launch.roomId),
        campaignId: text(launch.campaignId),
        publicationId: text(launch.publicationId),
        participantId: text(participantId)
      };
      if (!context.roomId || !context.campaignId || !context.publicationId || !context.participantId) return false;
      return storage && typeof storage.set === 'function' ? storage.set(context) === true : false;
    }

    function terminalError(error, fallbackCode, fallbackMessage) {
      var value = errorValue(error && error.code || fallbackCode, error && error.message || fallbackMessage);
      var expired = value.code === 'ROOM_EXPIRED';
      stopHeartbeat();
      destroyRealtime();
      if (expired) clearContext(state.launch && {roomId:state.launch.roomId, participantId:state.participantId});
      return emit({status:expired ? 'EXPIRED' : 'ERROR',busy:false,room:null,lastError:expired ? errorValue('ROOM_EXPIRED', EXPIRED_MESSAGE) : value});
    }

    async function start(launchInput) {
      if (destroyed) return getState();
      var launch = launchInput && typeof launchInput === 'object' ? frozen(launchInput) : null;
      if (!launch || launch.requested !== true) return emit({status:'IDLE',busy:false,launch:null,room:null,participantId:null,lastError:null});
      if (launch.valid !== true) return emit({status:'INVALID',busy:false,launch:launch,room:null,participantId:null,lastError:launch.error || errorValue('INVALID_ROOM_LINK','El enlace de partida no es válido.')});
      if (!client || typeof client.available !== 'function' || client.available() !== true) return emit({status:'UNAVAILABLE',busy:false,launch:launch,lastError:errorValue('LIVE_ROOM_CLIENT_UNAVAILABLE','El servicio de partidas en vivo no está disponible.')});
      if (!storage || typeof storage.available !== 'function' || storage.available() !== true) return emit({status:'ERROR',busy:false,launch:launch,lastError:errorValue('PLAYER_CONTEXT_STORAGE_UNAVAILABLE','El navegador no puede guardar la conexión de esta partida en la pestaña actual.')});

      emit({status:'CHECKING',busy:true,launch:launch,room:null,participantId:null,lastError:null});
      var checked = await client.getLiveRoom(launch.roomId);
      if (!checked || checked.success !== true || !checked.data || !checked.data.room) {
        return terminalError(checked && checked.error, 'ROOM_UNAVAILABLE', 'La partida en vivo no está disponible.');
      }
      if (!sameRoom(checked.data.room, launch)) {
        return emit({status:'INVALID',busy:false,launch:launch,room:null,participantId:null,lastError:errorValue('ROOM_PUBLICATION_MISMATCH','Este enlace de partida no coincide con la campaña publicada.')});
      }

      var context = storage && typeof storage.get === 'function' ? storage.get() : null;
      if (context && !sameContext(context, launch)) {
        clearContext(context);
        context = null;
      }

      if (context) {
        var restoredId = text(context.participantId);
        emit({status:'RESTORING',busy:true,launch:launch,room:checked.data.room,participantId:restoredId,lastError:null});
        var restored = await client.heartbeatLiveRoom(launch.roomId, restoredId);
        if (!restored || restored.success !== true || !restored.data || !restored.data.room) {
          return terminalError(restored && restored.error, 'PLAYER_RESTORE_FAILED', 'No se pudo recuperar la conexión del jugador en esta pestaña.');
        }
        if (!sameRoom(restored.data.room, launch)) return emit({status:'INVALID',busy:false,launch:launch,room:null,participantId:restoredId,lastError:errorValue('ROOM_PUBLICATION_MISMATCH','La sala recuperada no coincide con la campaña publicada.')});
        var restoredState = emit({status:'ACTIVE',busy:false,launch:launch,room:restored.data.room,participantId:restoredId,lastError:null,lastHeartbeatAt:now()});
        publishRealtimePresence(launch.roomId);
        startHeartbeat();
        return restoredState;
      }

      var participantId = text(participantIdFactory());
      if (!participantId) return emit({status:'ERROR',busy:false,launch:launch,lastError:errorValue('PLAYER_ID_UNAVAILABLE','No se pudo generar la identidad interna del jugador.')});

      emit({status:'JOINING',busy:true,launch:launch,room:checked.data.room,participantId:participantId,lastError:null});
      var joined = await client.joinLiveRoom(launch.roomId, participantId);
      if (!joined || joined.success !== true || !joined.data || !joined.data.room || !joined.data.presence) {
        return terminalError(joined && joined.error, 'LIVE_ROOM_JOIN_FAILED', 'No se pudo unir el jugador a la partida en vivo.');
      }
      if (!sameRoom(joined.data.room, launch) || text(joined.data.presence.participantId) !== participantId || text(joined.data.presence.role) !== 'player') {
        try { if (typeof client.forgetCapability === 'function') client.forgetCapability(launch.roomId, participantId); } catch (ignore) {}
        return emit({status:'ERROR',busy:false,launch:launch,room:null,participantId:null,lastError:errorValue('PLAYER_JOIN_RESPONSE_INVALID','La respuesta de unión a la partida no es válida.')});
      }
      if (!saveContext(launch, participantId)) {
        try { if (typeof client.forgetCapability === 'function') client.forgetCapability(launch.roomId, participantId); } catch (ignore) {}
        return emit({status:'ERROR',busy:false,launch:launch,room:null,participantId:null,lastError:errorValue('PLAYER_CONTEXT_STORAGE_UNAVAILABLE','La conexión se creó, pero no pudo guardarse en esta pestaña.')});
      }

      var joinedState = emit({status:'ACTIVE',busy:false,launch:launch,room:joined.data.room,participantId:participantId,lastError:null,lastHeartbeatAt:now()});
      publishRealtimePresence(launch.roomId);
      startHeartbeat();
      return joinedState;
    }

    async function heartbeat() {
      if (destroyed || state.status !== 'ACTIVE' || !state.launch || !state.participantId) return getState();
      var launch = state.launch;
      var response = await client.heartbeatLiveRoom(launch.roomId, state.participantId);
      if (!response || response.success !== true || !response.data || !response.data.room) {
        var error = response && response.error ? response.error : {code:'LIVE_ROOM_HEARTBEAT_FAILED',message:'No se pudo actualizar la presencia del jugador.'};
        if (error.code === 'ROOM_EXPIRED' || error.code === 'ROOM_UNAVAILABLE' || error.code === 'PARTICIPANT_UNAVAILABLE' || error.code === 'CAPABILITY_INVALID' || error.code === 'CAPABILITY_STORAGE_UNAVAILABLE') {
          return terminalError(error, 'LIVE_ROOM_HEARTBEAT_FAILED', 'No se pudo actualizar la presencia del jugador.');
        }
        return emit({status:'ACTIVE',busy:false,lastError:errorValue(error.code || 'LIVE_ROOM_HEARTBEAT_FAILED',error.message || 'La conexión está temporalmente inestable.'),lastHeartbeatAt:state.lastHeartbeatAt});
      }
      if (!sameRoom(response.data.room, launch)) return emit({status:'ERROR',busy:false,lastError:errorValue('ROOM_PUBLICATION_MISMATCH','La sala dejó de coincidir con la campaña publicada.')});
      publishRealtimePresence(launch.roomId);
      return emit({status:'ACTIVE',busy:false,room:response.data.room,lastError:null,lastHeartbeatAt:now()});
    }

    function getState() { return frozen(state); }
    function destroy() { destroyed = true; stopHeartbeat(); destroyRealtime(); }

    return Object.freeze({version:VERSION,start:start,heartbeat:heartbeat,getState:getState,destroy:destroy});
  }

  function createStatusPanel() {
    var existing = document.getElementById('runtimeLiveRoomPlayerStatus');
    if (existing) return existing;
    var panel = document.createElement('div');
    panel.id = 'runtimeLiveRoomPlayerStatus';
    panel.setAttribute('role', 'status');
    panel.setAttribute('aria-live', 'polite');
    panel.style.position = 'fixed';
    panel.style.right = '14px';
    panel.style.bottom = '14px';
    panel.style.zIndex = '100000';
    panel.style.maxWidth = 'min(360px, calc(100vw - 28px))';
    panel.style.padding = '9px 12px';
    panel.style.border = '1px solid rgba(91,215,255,.7)';
    panel.style.borderRadius = '10px';
    panel.style.background = 'rgba(4,23,36,.94)';
    panel.style.color = '#dff8ff';
    panel.style.font = '700 13px/1.35 system-ui, sans-serif';
    panel.style.boxShadow = '0 8px 24px rgba(0,0,0,.35)';
    document.body.appendChild(panel);
    return panel;
  }

  function renderStatus(panel, state) {
    if (!panel || !state) return;
    var message;
    if (state.status === 'CHECKING' || state.status === 'JOINING' || state.status === 'RESTORING') message = 'Partida en vivo · conectando…';
    else if (state.status === 'ACTIVE') message = state.lastError ? 'Partida en vivo · conexión inestable' : 'Partida en vivo · conectado';
    else if (state.status === 'EXPIRED') message = EXPIRED_MESSAGE;
    else if (state.status === 'INVALID') message = state.lastError && state.lastError.message || 'El enlace de partida no es válido.';
    else if (state.status === 'UNAVAILABLE') message = 'El servicio de partidas en vivo no está disponible.';
    else if (state.status === 'ERROR') message = state.lastError && state.lastError.message || 'No se pudo conectar con la partida en vivo.';
    else message = 'Partida en vivo';
    panel.textContent = message;
    panel.dataset.status = state.status;
    if (state.room && state.room.roomId) panel.dataset.roomId = String(state.room.roomId);
    else delete panel.dataset.roomId;
  }

  function bootstrapUi() {
    var crios = window.CRIOS || null;
    var launch = parseRoomLaunch(window.location && window.location.search || '', crios && crios.runtimeLaunch);
    if (!launch.requested) return false;

    var panel = createStatusPanel();
    if (!launch.valid) {
      renderStatus(panel, {status:'INVALID',lastError:launch.error});
      return true;
    }

    var live = window.CRIOS_LIVE_ROOM_BROWSER;
    var client = live && live.configured && !live.error ? live.client : null;
    var controller = createPlayerController({client:client,onStateChange:function(state){ renderStatus(panel,state); }});
    window.CRIOS_RUNTIME_LIVE_ROOM_PLAYER_CONTROLLER = controller;
    controller.start(launch);

    document.addEventListener('visibilitychange', function(){
      if (document.visibilityState === 'visible' && controller.getState().status === 'ACTIVE') controller.heartbeat();
    });
    return true;
  }

  window.CRIOS_RUNTIME_LIVE_ROOM_PLAYER = Object.freeze({
    version: VERSION,
    heartbeatIntervalMs: HEARTBEAT_INTERVAL_MS,
    contextKey: CONTEXT_KEY,
    expiredMessage: EXPIRED_MESSAGE,
    realtimeSignalType: REALTIME_SIGNAL_TYPE,
    defaultRealtimeTransportFactory: defaultRealtimeTransportFactory,
    parseRoomLaunch: parseRoomLaunch,
    createPlayerController: createPlayerController,
    createStatusPanel: createStatusPanel,
    renderStatus: renderStatus,
    bootstrapUi: bootstrapUi
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootstrapUi);
  else bootstrapUi();
})();
