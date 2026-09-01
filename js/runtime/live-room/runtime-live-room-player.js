/* CRIOS Runtime LiveRoom player - visible join and player presence */
(function(){
  'use strict';

  var VERSION = '1.4.0';
  var HEARTBEAT_INTERVAL_MS = 2 * 60 * 1000;
  var FOREGROUND_REFRESH_MIN_INTERVAL_MS = 30 * 1000;
  var CONTEXT_KEY = 'crios-live-room-player-context-v1';
  var EXPIRED_MESSAGE = 'Esta sesión finalizó por inactividad.';
  var REALTIME_SIGNAL_TYPE = 'presence-change';
  var GAME_STATE_SIGNAL_TYPE = 'game-state-change';

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

  function defaultRealtimeEventIdFactory(signalType) {
    var prefix = signalType === GAME_STATE_SIGNAL_TYPE ? 'game-state-' : 'presence-';
    try {
      if (window.crypto && typeof window.crypto.randomUUID === 'function') return prefix + window.crypto.randomUUID();
      if (window.crypto && typeof window.crypto.getRandomValues === 'function') {
        var bytes = new Uint8Array(16);
        window.crypto.getRandomValues(bytes);
        return prefix + Array.prototype.map.call(bytes, function(byte){ return byte.toString(16).padStart(2, '0'); }).join('');
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

  function defaultMissionOrderProvider() {
    var crios = window.CRIOS || null;
    return crios && typeof crios.obtenerMisionesActivas === 'function' ? crios.obtenerMisionesActivas() : [];
  }

  function defaultGameStateCoordinatorFactory() {
    return window.CRIOS_RUNTIME_LIVE_ROOM_GAME_STATE_COORDINATOR_FACTORY || null;
  }

  function defaultGameStateReconciliationFactory() {
    return window.CRIOS_LIVE_ROOM_GAME_STATE_RECONCILIATION || null;
  }

  function defaultGameStateChange(gameState) {
    var crios = window.CRIOS || null;
    var api = crios && crios.api;
    if (!api || typeof api.applyLiveRoomSharedGameState !== 'function') return false;
    try { return api.applyLiveRoomSharedGameState(gameState) === true; }
    catch (ignore) { return false; }
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
    var missionOrderProvider = typeof opts.missionOrderProvider === 'function' ? opts.missionOrderProvider : defaultMissionOrderProvider;
    var gameStateCoordinatorFactory = opts.gameStateCoordinatorFactory || defaultGameStateCoordinatorFactory();
    var gameStateReconciliationFactory = opts.gameStateReconciliationFactory || defaultGameStateReconciliationFactory();
    var gameStateStorage = opts.gameStateStorage;
    var onGameStateChange = typeof opts.onGameStateChange === 'function' ? opts.onGameStateChange : defaultGameStateChange;
    var state = baseState(client && typeof client.available === 'function' && client.available() ? 'IDLE' : 'UNAVAILABLE');
    var timer = null;
    var heartbeatInFlight = null;
    var presenceRequestGeneration = 0;
    var lastForegroundRefreshAt = null;
    var realtimeTransport = null;
    var realtimeSubscribedRoomId = null;
    var realtimeSubscriptionGeneration = 0;
    var destroyed = false;

    var gameStateCoordinator = null;
    var gameStateCoordinatorGeneration = 0;
    var gameStateReconciliation = null;
    var gameStateVisible = opts.gameStateVisible !== false;
    function emit(next) {
      state = Object.assign(baseState(next && next.status || state.status), state, next || {});
      var snapshot = frozen(state);
      try { onStateChange(snapshot); } catch (ignore) {}
      return snapshot;
    }

    function resetPresenceRequests() {
      presenceRequestGeneration += 1;
      heartbeatInFlight = null;
      lastForegroundRefreshAt = null;
      return presenceRequestGeneration;
    }

    function activePresenceRequest(generation, roomId, participantId) {
      return !destroyed && generation === presenceRequestGeneration && state.status === 'ACTIVE' && state.launch &&
        text(state.launch.roomId) === roomId && text(state.participantId) === participantId;
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

    function ensureRealtimeTransport() {
      if (realtimeTransport) return realtimeTransport;
      try { realtimeTransport = realtimeTransportFactory(); }
      catch (ignoreRealtimeFactory) { realtimeTransport = null; }
      return realtimeTransport;
    }

    function destroyRealtime() {
      realtimeSubscriptionGeneration += 1;
      if (!realtimeTransport) {
        realtimeSubscribedRoomId = null;
        return;
      }
      if (realtimeSubscribedRoomId && typeof realtimeTransport.unsubscribeRoom === 'function') {
        try { realtimeTransport.unsubscribeRoom(realtimeSubscribedRoomId); } catch (ignoreUnsubscribeRealtime) {}
      }
      if (typeof realtimeTransport.destroy === 'function') {
        try { realtimeTransport.destroy(); } catch (ignoreDestroyRealtime) {}
      }
      realtimeTransport = null;
      realtimeSubscribedRoomId = null;
    }

    function attachRealtime(roomId) {
      if (destroyed) return false;
      var normalizedRoomId = text(roomId);
      if (!normalizedRoomId) return false;
      var transport = ensureRealtimeTransport();
      if (!transport || typeof transport.subscribeRoom !== 'function') return false;
      if (realtimeSubscribedRoomId === normalizedRoomId) return true;
      if (realtimeSubscribedRoomId && typeof transport.unsubscribeRoom === 'function') {
        try { transport.unsubscribeRoom(realtimeSubscribedRoomId); } catch (ignorePreviousUnsubscribe) {}
      }
      realtimeSubscribedRoomId = null;
      var subscriptionGeneration = realtimeSubscriptionGeneration + 1;
      realtimeSubscriptionGeneration = subscriptionGeneration;
      var subscribed;
      try {
        subscribed = transport.subscribeRoom(normalizedRoomId, function(signal){
          if (destroyed || realtimeSubscriptionGeneration !== subscriptionGeneration || realtimeSubscribedRoomId !== normalizedRoomId) return;
          if (state.status !== 'ACTIVE' || !state.launch || text(state.launch.roomId) !== normalizedRoomId) return;
          if (!signal || signal.type !== GAME_STATE_SIGNAL_TYPE || !gameStateReconciliation || typeof gameStateReconciliation.request !== 'function') return;
          try { gameStateReconciliation.request('signal'); } catch (ignoreSignalRefresh) {}
        });
      } catch (ignoreSubscribe) { subscribed = false; }
      if (subscribed === false) return false;
      realtimeSubscribedRoomId = normalizedRoomId;
      return true;
    }

    function publishRealtimeSignal(roomId, signalType) {
      if (destroyed) return false;
      var normalizedRoomId = text(roomId);
      if (!normalizedRoomId) return false;
      var transport = ensureRealtimeTransport();
      if (!transport || typeof transport.publishSignal !== 'function') return false;
      var eventId = text(realtimeEventIdFactory(signalType));
      if (!eventId) return false;
      var emittedAt;
      try { emittedAt = new Date(now()).toISOString(); } catch (ignoreDate) { return false; }
      try {
        return transport.publishSignal(normalizedRoomId, {type:signalType,eventId:eventId,emittedAt:emittedAt}) !== false;
      } catch (ignorePublish) { return false; }
    }

    function publishRealtimePresence(roomId) { return publishRealtimeSignal(roomId, REALTIME_SIGNAL_TYPE); }
    function publishRealtimeGameState(roomId) { return publishRealtimeSignal(roomId, GAME_STATE_SIGNAL_TYPE); }

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

    function destroyGameStateReconciliation() {
      if (!gameStateReconciliation) return;
      var activeReconciliation = gameStateReconciliation;
      gameStateReconciliation = null;
      if (typeof activeReconciliation.stop === 'function') {
        try { activeReconciliation.stop(); } catch (ignoreReconciliationStop) {}
      }
    }

    function destroyGameStateCoordinator(discard) {
      destroyGameStateReconciliation();
      if (!gameStateCoordinator) return;
      var activeCoordinator = gameStateCoordinator;
      gameStateCoordinator = null;
      gameStateCoordinatorGeneration += 1;
      if (discard && typeof activeCoordinator.discard === 'function') {
        try { activeCoordinator.discard(); } catch (ignoreDiscard) {}
      }
      if (typeof activeCoordinator.destroy === 'function') {
        try { activeCoordinator.destroy(); } catch (ignoreDestroy) {}
      }
      if (discard) {
        try { onGameStateChange(null); } catch (ignoreGameStateClear) {}
      }
    }

    function ensureGameStateCoordinator() {
      if (gameStateCoordinator) return gameStateCoordinator;
      if (state.status !== 'ACTIVE' || !state.launch || !state.participantId) return null;
      if (!client || typeof client.createGameStateClient !== 'function') return null;
      var missionOrder;
      try { missionOrder = missionOrderProvider(); }
      catch (ignoreMissionOrder) { return null; }
      if (!Array.isArray(missionOrder) || !missionOrder.length) return null;
      var coordinatorContext = {
        roomId: state.launch.roomId,
        campaignId: state.launch.campaignId,
        publicationId: state.launch.publicationId,
        participantId: state.participantId,
        missionOrder: missionOrder.slice()
      };
      var gameStateClient = client.createGameStateClient(coordinatorContext);
      if (!gameStateClient || typeof gameStateClient.available !== 'function' || gameStateClient.available() !== true) return null;
      if (!gameStateCoordinatorFactory || typeof gameStateCoordinatorFactory.createCoordinator !== 'function') return null;
      var created;
      var createdGeneration = gameStateCoordinatorGeneration + 1;
      try {
        created = gameStateCoordinatorFactory.createCoordinator({
          context: coordinatorContext,
          client: gameStateClient,
          storage: gameStateStorage,
          onGameStateChange: function(gameState){
            if (destroyed || gameStateCoordinatorGeneration !== createdGeneration || gameStateCoordinator !== created) return;
            onGameStateChange(gameState);
          },
          onAuthoritativeStateChange: function(){
            if (destroyed || gameStateCoordinatorGeneration !== createdGeneration || gameStateCoordinator !== created) return;
            if (state.status !== 'ACTIVE' || !state.launch) return;
            publishRealtimeGameState(state.launch.roomId);
          }
        });
      } catch (ignoreCoordinatorCreate) { return null; }
      if (!created || typeof created.available !== 'function' || created.available() !== true) return null;
      gameStateCoordinatorGeneration = createdGeneration;
      gameStateCoordinator = created;
      return gameStateCoordinator;
    }

    function reconciliationOutcome(result) {
      var current = result && typeof result === 'object' ? result : {};
      if (current.status === 'READY') return {success:true,retryable:true,terminal:false};
      if (current.status === 'TERMINAL' || current.status === 'DESTROYED') return {success:false,retryable:false,terminal:true};
      return {success:false,retryable:!(current.lastError && current.lastError.retryable === false),terminal:false};
    }

    function ensureGameStateReconciliation(coordinator, generation) {
      if (gameStateReconciliation) return gameStateReconciliation;
      if (!coordinator || gameStateCoordinator !== coordinator || gameStateCoordinatorGeneration !== generation) return null;
      if (!gameStateReconciliationFactory || typeof gameStateReconciliationFactory.createScheduler !== 'function') return null;
      var created;
      try {
        created = gameStateReconciliationFactory.createScheduler({
          visible: gameStateVisible,
          refresh: async function(){
            if (destroyed || gameStateCoordinator !== coordinator || gameStateCoordinatorGeneration !== generation) {
              return {success:false,retryable:false,terminal:true};
            }
            var result;
            try { result = await coordinator.refresh(); }
            catch (ignoreCoordinatorRefresh) { result = null; }
            return reconciliationOutcome(result);
          }
        });
      } catch (ignoreReconciliationCreate) { return null; }
      if (!created || typeof created.available !== 'function' || created.available() !== true) return null;
      gameStateReconciliation = created;
      if (typeof created.start === 'function') {
        try { created.start(); } catch (ignoreReconciliationStart) {}
      }
      return gameStateReconciliation;
    }

    function synchronizeGameState() {
      var coordinator = ensureGameStateCoordinator();
      if (!coordinator || typeof coordinator.start !== 'function') return Promise.resolve(null);
      var generation = gameStateCoordinatorGeneration;
      try {
        return Promise.resolve(coordinator.start()).then(function(result){
          if (destroyed || gameStateCoordinator !== coordinator || gameStateCoordinatorGeneration !== generation) return result;
          if (result && (result.status === 'TERMINAL' || result.status === 'DESTROYED' || result.status === 'UNAVAILABLE')) {
            destroyGameStateReconciliation();
            return result;
          }
          ensureGameStateReconciliation(coordinator, generation);
          return result;
        }).catch(function(){ return null; });
      }
      catch (ignoreStart) { return Promise.resolve(null); }
    }

    function refreshGameState() {
      if (gameStateReconciliation && typeof gameStateReconciliation.request === 'function') {
        try { return Promise.resolve(gameStateReconciliation.request('manual')); }
        catch (ignoreManualRequest) { return Promise.resolve(false); }
      }
      return synchronizeGameState();
    }

    function setGameStateVisibility(visible) {
      gameStateVisible = visible === true;
      if (!gameStateReconciliation || typeof gameStateReconciliation.setVisible !== 'function') return false;
      try { gameStateReconciliation.setVisible(gameStateVisible); return true; }
      catch (ignoreVisibility) { return false; }
    }

    function recordCommittedMission(missionId) {
      var coordinator = ensureGameStateCoordinator();
      if (!coordinator || typeof coordinator.recordCommittedMission !== 'function') return false;
      try { return coordinator.recordCommittedMission(missionId); }
      catch (ignoreRecord) { return false; }
    }


    function terminalError(error, fallbackCode, fallbackMessage) {
      var value = errorValue(error && error.code || fallbackCode, error && error.message || fallbackMessage);
      var expired = value.code === 'ROOM_EXPIRED';
      resetPresenceRequests();
      stopHeartbeat();
      destroyRealtime();
      destroyGameStateReconciliation();
      var discardGameState = expired || value.code === 'ROOM_UNAVAILABLE' || value.code === 'PARTICIPANT_UNAVAILABLE' ||
        value.code === 'CAPABILITY_INVALID' || value.code === 'CAPABILITY_STORAGE_UNAVAILABLE';
      if (discardGameState) destroyGameStateCoordinator(true);
      if (expired) clearContext(state.launch && {roomId:state.launch.roomId, participantId:state.participantId});
      return emit({status:expired ? 'EXPIRED' : 'ERROR',busy:false,room:null,lastError:expired ? errorValue('ROOM_EXPIRED', EXPIRED_MESSAGE) : value});
    }

    async function start(launchInput) {
      if (destroyed) return getState();
      var lifecycleGeneration = resetPresenceRequests();
      stopHeartbeat();
      destroyRealtime();
      if (gameStateCoordinator) {
        destroyGameStateCoordinator(false);
        try { onGameStateChange(null); } catch (ignoreGameStateClear) {}
      }
      var launch = launchInput && typeof launchInput === 'object' ? frozen(launchInput) : null;
      if (!launch || launch.requested !== true) return emit({status:'IDLE',busy:false,launch:null,room:null,participantId:null,lastError:null});
      if (launch.valid !== true) return emit({status:'INVALID',busy:false,launch:launch,room:null,participantId:null,lastError:launch.error || errorValue('INVALID_ROOM_LINK','El enlace de partida no es válido.')});
      if (!client || typeof client.available !== 'function' || client.available() !== true) return emit({status:'UNAVAILABLE',busy:false,launch:launch,lastError:errorValue('LIVE_ROOM_CLIENT_UNAVAILABLE','El servicio de partidas en vivo no está disponible.')});
      if (!storage || typeof storage.available !== 'function' || storage.available() !== true) return emit({status:'ERROR',busy:false,launch:launch,lastError:errorValue('PLAYER_CONTEXT_STORAGE_UNAVAILABLE','El navegador no puede guardar la conexión de esta partida en la pestaña actual.')});

      emit({status:'CHECKING',busy:true,launch:launch,room:null,participantId:null,lastError:null});
      var checked = await client.getLiveRoom(launch.roomId);
      if (destroyed || lifecycleGeneration !== presenceRequestGeneration) return getState();
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
        if (destroyed || lifecycleGeneration !== presenceRequestGeneration) return getState();
        if (!restored || restored.success !== true || !restored.data || !restored.data.room) {
          return terminalError(restored && restored.error, 'PLAYER_RESTORE_FAILED', 'No se pudo recuperar la conexión del jugador en esta pestaña.');
        }
        if (!sameRoom(restored.data.room, launch)) return emit({status:'INVALID',busy:false,launch:launch,room:null,participantId:restoredId,lastError:errorValue('ROOM_PUBLICATION_MISMATCH','La sala recuperada no coincide con la campaña publicada.')});
        var restoredState = emit({status:'ACTIVE',busy:false,launch:launch,room:restored.data.room,participantId:restoredId,lastError:null,lastHeartbeatAt:now()});
        attachRealtime(launch.roomId);
        publishRealtimePresence(launch.roomId);
        startHeartbeat();
        synchronizeGameState();
        return restoredState;
      }

      var participantId = text(participantIdFactory());
      if (!participantId) return emit({status:'ERROR',busy:false,launch:launch,lastError:errorValue('PLAYER_ID_UNAVAILABLE','No se pudo generar la identidad interna del jugador.')});

      emit({status:'JOINING',busy:true,launch:launch,room:checked.data.room,participantId:participantId,lastError:null});
      var joined = await client.joinLiveRoom(launch.roomId, participantId);
      if (destroyed || lifecycleGeneration !== presenceRequestGeneration) return getState();
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
      attachRealtime(launch.roomId);
      publishRealtimePresence(launch.roomId);
      startHeartbeat();
      synchronizeGameState();
      return joinedState;
    }

    function heartbeat() {
      if (heartbeatInFlight) return heartbeatInFlight;
      var request = performHeartbeat();
      heartbeatInFlight = request;
      request.then(function(){ clearHeartbeatInFlight(request); }, function(){ clearHeartbeatInFlight(request); });
      return request;
    }
    function clearHeartbeatInFlight(request) { if (heartbeatInFlight === request) heartbeatInFlight = null; }

    async function performHeartbeat() {
      if (destroyed || state.status !== 'ACTIVE' || !state.launch || !state.participantId) return getState();
      var launch = state.launch;
      var roomId = text(launch.roomId);
      var participantId = text(state.participantId);
      var requestGeneration = presenceRequestGeneration;
      var response = await client.heartbeatLiveRoom(roomId, participantId);
      if (!activePresenceRequest(requestGeneration, roomId, participantId)) return getState();
      if (!response || response.success !== true || !response.data || !response.data.room) {
        var error = response && response.error ? response.error : {code:'LIVE_ROOM_HEARTBEAT_FAILED',message:'No se pudo actualizar la presencia del jugador.'};
        if (error.code === 'ROOM_EXPIRED' || error.code === 'ROOM_UNAVAILABLE' || error.code === 'PARTICIPANT_UNAVAILABLE' || error.code === 'CAPABILITY_INVALID' || error.code === 'CAPABILITY_STORAGE_UNAVAILABLE') {
          return terminalError(error, 'LIVE_ROOM_HEARTBEAT_FAILED', 'No se pudo actualizar la presencia del jugador.');
        }
        return emit({status:'ACTIVE',busy:false,lastError:errorValue(error.code || 'LIVE_ROOM_HEARTBEAT_FAILED',error.message || 'La conexión está temporalmente inestable.'),lastHeartbeatAt:state.lastHeartbeatAt});
      }
      if (!sameRoom(response.data.room, launch)) {
        destroyGameStateCoordinator(true);
        return emit({status:'ERROR',busy:false,lastError:errorValue('ROOM_PUBLICATION_MISMATCH','La sala dejó de coincidir con la campaña publicada.')});
      }
      publishRealtimePresence(launch.roomId);
      return emit({status:'ACTIVE',busy:false,room:response.data.room,lastError:null,lastHeartbeatAt:now()});
    }

    function refreshAfterForeground() {
      if (destroyed || state.status !== 'ACTIVE') return false;
      var current = Number(now());
      if (!Number.isFinite(current)) current = Date.now();
      if (lastForegroundRefreshAt !== null) {
        var elapsed = current - lastForegroundRefreshAt;
        if (elapsed >= 0 && elapsed < FOREGROUND_REFRESH_MIN_INTERVAL_MS) return false;
      }
      lastForegroundRefreshAt = current;
      heartbeat();
      return true;
    }

    function getState() { return frozen(state); }
    function destroy() {
      destroyed = true;
      resetPresenceRequests();
      stopHeartbeat();
      destroyRealtime();
      destroyGameStateCoordinator(false);
    }

    return Object.freeze({version:VERSION,start:start,heartbeat:heartbeat,refreshAfterForeground:refreshAfterForeground,synchronizeGameState:synchronizeGameState,refreshGameState:refreshGameState,setGameStateVisibility:setGameStateVisibility,recordCommittedMission:recordCommittedMission,getState:getState,destroy:destroy});
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
    controller.setGameStateVisibility(document.visibilityState !== 'hidden');
    controller.start(launch);

    document.addEventListener('visibilitychange', function(){
      controller.setGameStateVisibility(document.visibilityState !== 'hidden');
      if (document.visibilityState === 'visible') controller.refreshAfterForeground();
    });
    if (typeof window.addEventListener === 'function') window.addEventListener('focus', function(){ controller.refreshAfterForeground(); });
    return true;
  }

  window.CRIOS_RUNTIME_LIVE_ROOM_PLAYER = Object.freeze({
    version: VERSION,
    heartbeatIntervalMs: HEARTBEAT_INTERVAL_MS,
    contextKey: CONTEXT_KEY,
    foregroundRefreshMinIntervalMs: FOREGROUND_REFRESH_MIN_INTERVAL_MS,
    expiredMessage: EXPIRED_MESSAGE,
    realtimeSignalType: REALTIME_SIGNAL_TYPE,
    gameStateRealtimeSignalType: GAME_STATE_SIGNAL_TYPE,
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
