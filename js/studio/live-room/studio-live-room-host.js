/* CRIOS Studio LiveRoom host - visible room creation and host presence */
(function(){
  'use strict';

  var VERSION = '1.3.0';
  var HEARTBEAT_INTERVAL_MS = 2 * 60 * 1000;
  var ROSTER_REFRESH_INTERVAL_MS = 30 * 1000;
  var FOREGROUND_REFRESH_MIN_INTERVAL_MS = 30 * 1000;
  var CONTEXT_KEY = 'crios-live-room-host-context-v1';

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

  function defaultStorage() {
    var session = null;
    var persistent = null;
    try { session = window.sessionStorage || null; } catch (ignoreSession) { session = null; }
    try { persistent = window.localStorage || null; } catch (ignorePersistent) { persistent = null; }

    function parse(raw) {
      if (!raw) return null;
      try {
        var parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
      } catch (ignore) { return null; }
    }
    function read(store) {
      if (!store) return null;
      try { return parse(store.getItem(CONTEXT_KEY)); } catch (ignore) { return null; }
    }
    function write(store, value) {
      if (!store) return false;
      try { store.setItem(CONTEXT_KEY, JSON.stringify(value)); return true; } catch (ignore) { return false; }
    }
    function remove(store) {
      if (!store) return false;
      try { store.removeItem(CONTEXT_KEY); return true; } catch (ignore) { return false; }
    }

    return Object.freeze({
      get: function(){
        var value = read(session);
        if (value) return value;
        value = read(persistent);
        if (value && session) write(session, value);
        return value;
      },
      set: function(value){
        var persisted = write(persistent, value);
        if (session) write(session, value);
        return persisted;
      },
      clear: function(){
        var a = remove(session);
        var b = remove(persistent);
        return a || b;
      }
    });
  }

  function defaultParticipantIdFactory() {
    try {
      if (window.crypto && typeof window.crypto.randomUUID === 'function') {
        return 'host-' + window.crypto.randomUUID();
      }
      if (window.crypto && typeof window.crypto.getRandomValues === 'function') {
        var bytes = new Uint8Array(16);
        window.crypto.getRandomValues(bytes);
        return 'host-' + Array.prototype.map.call(bytes, function(byte){ return byte.toString(16).padStart(2, '0'); }).join('');
      }
    } catch (ignore) {}
    return '';
  }

  function buildPlayerHref(runtimeHref, roomId, baseHref) {
    var source = text(runtimeHref);
    var id = text(roomId);
    if (!source || !id) return '';
    try {
      var url = new URL(source, text(baseHref) || (window.location && window.location.href) || 'http://localhost/');
      url.searchParams.set('roomId', id);
      return url.href;
    } catch (ignore) {
      var separator = source.indexOf('?') >= 0 ? '&' : '?';
      return source + separator + 'roomId=' + encodeURIComponent(id);
    }
  }

  function buildHostConsoleHref(room, publication, baseHref) {
    var roomId = text(room && room.roomId);
    var campaignId = text(publication && publication.campaignId);
    var publicationId = text(publication && publication.publicationId);
    if (!roomId || !campaignId || !publicationId) return '';
    try {
      var base = new URL(text(baseHref) || (window.location && window.location.href) || 'http://localhost/studio/');
      var url = new URL('../host/', base);
      url.searchParams.set('roomId', roomId);
      url.searchParams.set('campaignId', campaignId);
      url.searchParams.set('publicationId', publicationId);
      return url.href;
    } catch (ignore) { return ''; }
  }

  function normalizedMissionOrder(value) {
    if (!Array.isArray(value) || !value.length) return [];
    var order = [];
    var seen = Object.create(null);
    for (var index = 0; index < value.length; index += 1) {
      var raw = value[index];
      var missionId = text(raw);
      if (typeof raw !== 'string' || raw !== missionId || !missionId || missionId.length > 160) return [];
      if (/[\u0000-\u001F\u007F]/.test(missionId) || seen[missionId]) return [];
      seen[missionId] = true;
      order.push(missionId);
    }
    var model = window.CRIOS_LIVE_ROOM_GAME_STATE_MODEL;
    if (model && typeof model.validateMissionOrder === 'function') {
      try { model.validateMissionOrder(order); }
      catch (ignoreMissionOrder) { return []; }
    }
    return order;
  }

  function baseState(status) {
    return {
      status: status || 'IDLE',
      busy: false,
      publication: null,
      room: null,
      participantId: null,
      playerHref: null,
      lastError: null,
      lastHeartbeatAt: null,
      roster: null,
      lastRosterAt: null,
      lastRosterError: null
    };
  }

  function createHostController(options) {
    var opts = options && typeof options === 'object' ? options : {};
    var client = opts.client || null;
    var storage = opts.storage || defaultStorage();
    var participantIdFactory = typeof opts.participantIdFactory === 'function' ? opts.participantIdFactory : defaultParticipantIdFactory;
    var setIntervalImpl = typeof opts.setIntervalImpl === 'function' ? opts.setIntervalImpl : window.setInterval.bind(window);
    var clearIntervalImpl = typeof opts.clearIntervalImpl === 'function' ? opts.clearIntervalImpl : window.clearInterval.bind(window);
    var now = typeof opts.now === 'function' ? opts.now : function(){ return Date.now(); };
    var campaignNameProvider = typeof opts.campaignNameProvider === 'function' ? opts.campaignNameProvider : function(){ return ''; };
    var baseHref = text(opts.baseHref) || (window.location && window.location.href) || '';
    var onStateChange = typeof opts.onStateChange === 'function' ? opts.onStateChange : function(){};
    var state = baseState(client && typeof client.available === 'function' && client.available() ? 'IDLE' : 'UNAVAILABLE');
    var timer = null;
    var rosterTimer = null;
    var heartbeatInFlight = null;
    var rosterInFlight = null;
    var presenceRequestGeneration = 0;
    var lastForegroundRefreshAt = null;
    var destroyed = false;

    function emit(next) {
      state = Object.assign(baseState(next && next.status || state.status), state, next || {});
      var snapshot = frozen(state);
      try { onStateChange(snapshot); } catch (ignore) {}
      return snapshot;
    }


    function resetPresenceRequests() {
      presenceRequestGeneration += 1;
      heartbeatInFlight = null;
      rosterInFlight = null;
      lastForegroundRefreshAt = null;
      return presenceRequestGeneration;
    }

    function activePresenceRequest(generation, roomId, participantId) {
      return !destroyed && generation === presenceRequestGeneration && state.status === 'ACTIVE' && state.room &&
        text(state.room.roomId) === roomId && text(state.participantId) === participantId;
    }
    function stopHeartbeat() {
      if (timer !== null) {
        try { clearIntervalImpl(timer); } catch (ignore) {}
        timer = null;
      }
    }

    function startHeartbeat() {
      stopHeartbeat();
      if (destroyed || state.status !== 'ACTIVE' || !state.room || !state.participantId) return;
      timer = setIntervalImpl(function(){ heartbeat(); }, HEARTBEAT_INTERVAL_MS);
    }

    function stopRosterPolling() {
      if (rosterTimer !== null) {
        try { clearIntervalImpl(rosterTimer); } catch (ignore) {}
        rosterTimer = null;
      }
    }

    function startRosterPolling() {
      stopRosterPolling();
      if (destroyed || state.status !== 'ACTIVE' || !state.room || !state.participantId) return;
      rosterTimer = setIntervalImpl(function(){ refreshRoster(); }, ROSTER_REFRESH_INTERVAL_MS);
    }

    function normalizedPublication(publication) {
      if (!publication || typeof publication !== 'object') return null;
      var campaignId = text(publication.campaignId);
      var publicationId = text(publication.publicationId);
      var href = text(publication.href);
      if (!publication.available || !campaignId || !publicationId || !href) return null;
      var missionOrder = normalizedMissionOrder(publication.missionOrder);
      return frozen({campaignId: campaignId, publicationId: publicationId, href: href, missionOrder: missionOrder});
    }

    function setPublication(publication) {
      var normalized = normalizedPublication(publication);
      if (state.status === 'ACTIVE') {
        return emit({publication: normalized});
      }
      if (!client || typeof client.available !== 'function' || client.available() !== true) {
        return emit({status: 'UNAVAILABLE', publication: normalized, busy: false});
      }
      return emit({status: normalized ? 'READY' : 'NO_PUBLICATION', publication: normalized, busy: false, lastError: null});
    }

    function saveContext(room, participantId, publication, playerHref) {
      var context = {
        version: 1,
        roomId: text(room && room.roomId),
        participantId: text(participantId),
        campaignId: text(publication && publication.campaignId),
        publicationId: text(publication && publication.publicationId),
        campaignName: text(campaignNameProvider()),
        runtimeHref: text(publication && publication.href),
        missionOrder: normalizedMissionOrder(publication && publication.missionOrder),
        playerHref: text(playerHref)
      };
      if (!context.roomId || !context.participantId || !context.campaignId || !context.publicationId || !context.playerHref) return false;
      return storage && typeof storage.set === 'function' ? storage.set(context) === true : false;
    }

    function clearContext(roomId, participantId) {
      if (storage && typeof storage.clear === 'function') storage.clear();
      if (client && typeof client.forgetCapability === 'function' && roomId && participantId) {
        try { client.forgetCapability(roomId, participantId); } catch (ignore) {}
      }
    }

    async function createRoom() {
      if (destroyed) return getState();
      if (!client || typeof client.available !== 'function' || client.available() !== true) {
        return emit({status: 'UNAVAILABLE', busy: false, lastError: frozen({code:'LIVE_ROOM_CLIENT_UNAVAILABLE', message:'El servicio de partidas en vivo no está disponible.'})});
      }
      if (!state.publication) {
        return emit({status: 'NO_PUBLICATION', busy: false, lastError: frozen({code:'PUBLICATION_REQUIRED', message:'Publicá una campaña antes de iniciar una partida.'})});
      }
      if (state.status === 'ACTIVE') return getState();

      var participantId = text(participantIdFactory());
      if (!participantId) {
        return emit({status:'ERROR', busy:false, lastError:frozen({code:'HOST_ID_UNAVAILABLE', message:'No se pudo generar la identidad interna del anfitrión.'})});
      }

      var publication = state.publication;
      var lifecycleGeneration = resetPresenceRequests();
      emit({status:'CREATING', busy:true, participantId:participantId, lastError:null});
      var response = await client.createLiveRoom(publication.campaignId, publication.publicationId, participantId);
      if (destroyed || lifecycleGeneration !== presenceRequestGeneration) return getState();
      if (!response || response.success !== true || !response.data || !response.data.room) {
        return emit({status:'ERROR', busy:false, room:null, participantId:null, playerHref:null, lastError:frozen(response && response.error || {code:'LIVE_ROOM_CREATE_FAILED', message:'No se pudo iniciar la partida.'})});
      }

      var room = response.data.room;
      var playerHref = buildPlayerHref(publication.href, room.roomId, baseHref);
      if (!saveContext(room, participantId, publication, playerHref)) {
        clearContext(room.roomId, participantId);
        return emit({status:'ERROR', busy:false, room:null, participantId:null, playerHref:null, lastError:frozen({code:'HOST_CONTEXT_STORAGE_UNAVAILABLE', message:'La sala fue creada, pero Studio no pudo guardar el contexto recuperable del anfitrión en este navegador.'})});
      }

      emit({status:'ACTIVE', busy:false, room:room, participantId:participantId, playerHref:playerHref, lastError:null, lastHeartbeatAt:now()});
      startHeartbeat();
      startRosterPolling();
      return refreshRoster();
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
      if (destroyed || state.status !== 'ACTIVE' || !state.room || !state.participantId) return getState();
      var roomId = text(state.room.roomId);
      var participantId = text(state.participantId);
      var requestGeneration = presenceRequestGeneration;
      var response = await client.heartbeatLiveRoom(roomId, participantId);
      if (!activePresenceRequest(requestGeneration, roomId, participantId)) return getState();
      if (!response || response.success !== true) {
        var error = frozen(response && response.error || {code:'LIVE_ROOM_HEARTBEAT_FAILED', message:'No se pudo actualizar la presencia del anfitrión.'});
        if (error.code === 'ROOM_EXPIRED' || error.code === 'ROOM_UNAVAILABLE' || error.code === 'PARTICIPANT_UNAVAILABLE' || error.code === 'CAPABILITY_STORAGE_UNAVAILABLE') {
          stopHeartbeat();
          stopRosterPolling();
          resetPresenceRequests();
          clearContext(roomId, participantId);
          return emit({status:error.code === 'ROOM_EXPIRED' ? 'EXPIRED' : 'ERROR', busy:false, room:null, participantId:null, playerHref:null, lastError:error});
        }
        return emit({status:'ACTIVE', busy:false, lastError:error, lastHeartbeatAt:state.lastHeartbeatAt});
      }
      var room = response.data && response.data.room ? response.data.room : state.room;
      return emit({status:'ACTIVE', busy:false, room:room, lastError:null, lastHeartbeatAt:now()});
    }

    function refreshRoster() {
      if (rosterInFlight) return rosterInFlight;
      var request = performRosterRefresh();
      rosterInFlight = request;
      request.then(function(){ clearRosterInFlight(request); }, function(){ clearRosterInFlight(request); });
      return request;
    }
    function clearRosterInFlight(request) { if (rosterInFlight === request) rosterInFlight = null; }

    async function performRosterRefresh() {
      if (destroyed || state.status !== 'ACTIVE' || !state.room || !state.participantId) return getState();
      if (!client || typeof client.getLiveRoomRoster !== 'function') {
        return emit({status:'ACTIVE', lastRosterError:frozen({code:'LIVE_ROOM_ROSTER_UNAVAILABLE', message:'No se pudo consultar la lista de jugadores conectados.'})});
      }
      var roomId = text(state.room.roomId);
      var participantId = text(state.participantId);
      var requestGeneration = presenceRequestGeneration;
      var response = await client.getLiveRoomRoster(roomId, participantId);
      if (!activePresenceRequest(requestGeneration, roomId, participantId)) return getState();
      if (!response || response.success !== true || !response.data || !response.data.roster) {
        var error = frozen(response && response.error || {code:'LIVE_ROOM_ROSTER_FAILED', message:'No se pudo actualizar la lista de jugadores conectados.'});
        if (error.code === 'ROOM_EXPIRED' || error.code === 'ROOM_UNAVAILABLE' || error.code === 'PARTICIPANT_UNAVAILABLE' || error.code === 'CAPABILITY_INVALID' || error.code === 'CAPABILITY_STORAGE_UNAVAILABLE' || error.code === 'HOST_REQUIRED') {
          stopHeartbeat();
          stopRosterPolling();
          resetPresenceRequests();
          clearContext(roomId, participantId);
          return emit({status:error.code === 'ROOM_EXPIRED' ? 'EXPIRED' : 'ERROR', busy:false, room:null, participantId:null, playerHref:null, roster:null, lastRosterError:error, lastError:error});
        }
        return emit({status:'ACTIVE', busy:false, lastRosterError:error});
      }
      return emit({status:'ACTIVE', busy:false, roster:response.data.roster, lastRosterAt:now(), lastRosterError:null});
    }

    async function restore() {
      if (destroyed || !storage || typeof storage.get !== 'function') return getState();
      var context = storage.get();
      if (!context) return getState();
      var roomId = text(context.roomId);
      var participantId = text(context.participantId);
      var campaignId = text(context.campaignId);
      var publicationId = text(context.publicationId);
      var runtimeHref = text(context.runtimeHref);
      var missionOrder = normalizedMissionOrder(context.missionOrder);
      var playerHref = text(context.playerHref);
      if (!roomId || !participantId || !campaignId || !publicationId || !playerHref) {
        clearContext(roomId, participantId);
        return emit({status:'IDLE', room:null, participantId:null, playerHref:null});
      }
      if (!client || typeof client.available !== 'function' || client.available() !== true) {
        return emit({status:'UNAVAILABLE', room:null, participantId:null, playerHref:null});
      }

      var lifecycleGeneration = resetPresenceRequests();
      emit({status:'RESTORING', busy:true, publication:frozen({campaignId:campaignId,publicationId:publicationId,href:runtimeHref,missionOrder:missionOrder}), participantId:participantId, playerHref:playerHref, lastError:null});
      var response = await client.getLiveRoom(roomId);
      if (destroyed || lifecycleGeneration !== presenceRequestGeneration) return getState();
      if (!response || response.success !== true || !response.data || !response.data.room) {
        var error = frozen(response && response.error || {code:'ROOM_UNAVAILABLE',message:'La sala ya no está disponible.'});
        clearContext(roomId, participantId);
        stopHeartbeat();
        stopRosterPolling();
        return emit({status:error.code === 'ROOM_EXPIRED' ? 'EXPIRED' : 'IDLE', busy:false, room:null, participantId:null, playerHref:null, lastError:error});
      }
      var room = response.data.room;
      if (text(room.campaignId) !== campaignId || text(room.publicationId) !== publicationId) {
        clearContext(roomId, participantId);
        stopHeartbeat();
        stopRosterPolling();
        return emit({status:'ERROR', busy:false, room:null, participantId:null, playerHref:null, lastError:frozen({code:'ROOM_PUBLICATION_MISMATCH',message:'La sala recuperada no coincide con la publicación guardada.'})});
      }
      emit({status:'ACTIVE', busy:false, room:room, participantId:participantId, playerHref:playerHref, lastError:null});
      startHeartbeat();
      startRosterPolling();
      await heartbeat();
      return refreshRoster();
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
      refreshRoster();
      return true;
    }

    function getState() { return frozen(state); }

    function destroy() {
      destroyed = true;
      resetPresenceRequests();
      stopHeartbeat();
      stopRosterPolling();
    }

    return Object.freeze({
      version: VERSION,
      setPublication: setPublication,
      createRoom: createRoom,
      heartbeat: heartbeat,
      refreshRoster: refreshRoster,
      refreshAfterForeground: refreshAfterForeground,
      restore: restore,
      getState: getState,
      destroy: destroy
    });
  }

  function createHostPanel() {
    var existing = document.getElementById('studioLiveRoomHostPanel');
    if (existing) return existing;
    var launchLink = document.getElementById('studioRuntimeLaunchLink');
    if (!launchLink || !launchLink.parentNode) return null;

    var panel = document.createElement('div');
    panel.id = 'studioLiveRoomHostPanel';
    panel.className = 'studio-live-room-host';

    var title = document.createElement('h4');
    title.textContent = 'Partida en vivo';
    var status = document.createElement('p');
    status.id = 'studioLiveRoomHostStatus';
    status.className = 'studio-publication-memory-notice';
    var start = document.createElement('button');
    start.id = 'studioLiveRoomStartButton';
    start.type = 'button';
    start.className = 'btn studio-btn';
    start.textContent = 'Iniciar partida';
    var room = document.createElement('p');
    room.id = 'studioLiveRoomRoomId';
    room.className = 'studio-publication-memory-notice';
    room.hidden = true;
    var roster = document.createElement('p');
    roster.id = 'studioLiveRoomRoster';
    roster.className = 'studio-publication-memory-notice';
    roster.hidden = true;
    var playerLink = document.createElement('a');
    playerLink.id = 'studioLiveRoomPlayerLink';
    playerLink.className = 'btn studio-btn';
    playerLink.textContent = 'Abrir enlace para estudiantes';
    playerLink.target = '_blank';
    playerLink.rel = 'noopener';
    playerLink.hidden = true;

    panel.appendChild(title);
    panel.appendChild(status);
    panel.appendChild(start);
    panel.appendChild(room);
    panel.appendChild(roster);
    panel.appendChild(playerLink);
    launchLink.parentNode.insertBefore(panel, launchLink.nextSibling);
    return panel;
  }

  function bootstrapUi() {
    var live = window.CRIOS_LIVE_ROOM_BROWSER;
    var studio = window.CRIOS_STUDIO;
    var panel = createHostPanel();
    if (!panel || !studio || !studio.runtimeLaunch || typeof studio.runtimeLaunch.getState !== 'function') return false;

    var client = live && live.configured && !live.error ? live.client : null;
    var statusNode = panel.querySelector('#studioLiveRoomHostStatus');
    var startButton = panel.querySelector('#studioLiveRoomStartButton');
    var roomNode = panel.querySelector('#studioLiveRoomRoomId');
    var rosterNode = panel.querySelector('#studioLiveRoomRoster');
    var playerLink = panel.querySelector('#studioLiveRoomPlayerLink');
    var lastPublicationSignature = '';

    function renderState(state) {
      var message = '';
      if (state.status === 'UNAVAILABLE') message = 'El servicio de partidas en vivo no está disponible.';
      else if (state.status === 'NO_PUBLICATION' || state.status === 'IDLE') message = 'Publicá una campaña para poder iniciar una partida.';
      else if (state.status === 'READY') message = 'La publicación está lista para iniciar una partida.';
      else if (state.status === 'CREATING') message = 'Creando sala…';
      else if (state.status === 'RESTORING') message = 'Recuperando sala activa…';
      else if (state.status === 'ACTIVE') message = state.lastError ? 'La sala sigue activa, pero hubo un problema al actualizar la presencia.' : 'Sala activa. Mientras haya actividad del anfitrión o de jugadores, la partida se mantiene disponible.';
      else if (state.status === 'EXPIRED') message = 'Esta sesión finalizó por inactividad.';
      else message = state.lastError && state.lastError.message ? state.lastError.message : 'No se pudo iniciar la partida.';
      statusNode.textContent = message;
      statusNode.dataset.status = state.status;

      var active = state.status === 'ACTIVE' && state.room && state.playerHref;
      startButton.hidden = false;
      startButton.textContent = active ? 'Abrir consola de mando' : 'Iniciar partida';
      startButton.disabled = state.busy || state.status === 'UNAVAILABLE' || state.status === 'NO_PUBLICATION' || state.status === 'RESTORING';
      roomNode.hidden = !active;
      rosterNode.hidden = true;
      playerLink.hidden = true;
      if (active) {
        roomNode.textContent = 'Sala activa: ' + String(state.room.roomId || '') + '. El monitoreo continúa en la consola de mando.';
        rosterNode.textContent = '';
        delete rosterNode.dataset.count;
        playerLink.removeAttribute('href');
        delete playerLink.dataset.roomId;
        delete playerLink.dataset.campaignId;
        delete playerLink.dataset.publicationId;
      } else {
        roomNode.textContent = '';
        rosterNode.textContent = '';
        delete rosterNode.dataset.count;
        playerLink.removeAttribute('href');
        delete playerLink.dataset.roomId;
        delete playerLink.dataset.campaignId;
        delete playerLink.dataset.publicationId;
      }
    }

    var controller = createHostController({
      client:client,
      onStateChange:renderState,
      campaignNameProvider:function(){
        var input=document.getElementById('campaign-name-input');
        if(input&&text(input.value))return text(input.value);
        var draft=window.CRIOS_CAMPAIGN_DRAFT;
        if(draft&&typeof draft.obtenerNombre==='function'){try{return text(draft.obtenerNombre());}catch(ignore){}}
        return '';
      }
    });

    function publicationMissionOrder(launch) {
      if (!launch || !launch.available || !launch.publicationId) return [];
      var publicationApi = studio.publication;
      if (!publicationApi || typeof publicationApi.getPublication !== 'function') return [];
      var publication;
      try { publication = publicationApi.getPublication(launch.publicationId); }
      catch (ignorePublicationRead) { return []; }
      if (!publication || text(publication.campaignId) !== text(launch.campaignId) || text(publication.publicationId) !== text(launch.publicationId)) return [];
      var content = publication.content && typeof publication.content === 'object' ? publication.content : {};
      var manifest = content.runtimeExecutionManifest && typeof content.runtimeExecutionManifest === 'object' ? content.runtimeExecutionManifest : {};
      var order = normalizedMissionOrder(manifest.missionOrder);
      var specs = Array.isArray(content.missionSpecs) ? content.missionSpecs : [];
      if (!order.length || specs.length !== order.length) return [];
      for (var index = 0; index < order.length; index += 1) {
        if (!specs[index] || text(specs[index].missionId) !== order[index]) return [];
      }
      return order;
    }

    function syncPublication() {
      var launch = studio.runtimeLaunch.getState();
      var missionOrder = publicationMissionOrder(launch);
      var publication = launch ? Object.assign({}, launch, {missionOrder:missionOrder}) : launch;
      var signature = [launch && launch.available, launch && launch.campaignId, launch && launch.publicationId, launch && launch.href, missionOrder.join(',')].join('|');
      if (signature === lastPublicationSignature) return;
      lastPublicationSignature = signature;
      controller.setPublication(publication);
    }

    startButton.onclick = async function(){
      syncPublication();
      var current = controller.getState();
      var result = current.status === 'ACTIVE' ? current : await controller.createRoom();
      if (result && result.status === 'ACTIVE' && result.room && result.publication) {
        var consoleHref = buildHostConsoleHref(result.room, result.publication, window.location.href);
        if (consoleHref) window.location.assign(consoleHref);
      }
    };

    syncPublication();
    controller.restore();

    if (typeof MutationObserver === 'function') {
      var observer = new MutationObserver(function(){ syncPublication(); });
      var publicationPanel = document.getElementById('studioPublicationPanel') || panel.parentNode;
      if (publicationPanel) observer.observe(publicationPanel, {subtree:true,childList:true,attributes:true,attributeFilter:['href','hidden','data-campaign-id','data-publication-id']});
    }

    document.addEventListener('visibilitychange', function(){
      if (document.visibilityState === 'visible') controller.refreshAfterForeground();
    });
    if (typeof window.addEventListener === 'function') window.addEventListener('focus', function(){ controller.refreshAfterForeground(); });

    window.CRIOS_STUDIO_LIVE_ROOM_HOST_CONTROLLER = controller;
    return true;
  }

  function bootstrapWhenReady() {
    var attempts = 0;
    var timer = window.setInterval(function(){
      attempts += 1;
      if (bootstrapUi() || attempts >= 100) window.clearInterval(timer);
    }, 100);
  }

  window.CRIOS_STUDIO_LIVE_ROOM_HOST = Object.freeze({
    version: VERSION,
    heartbeatIntervalMs: HEARTBEAT_INTERVAL_MS,
    rosterRefreshIntervalMs: ROSTER_REFRESH_INTERVAL_MS,
    foregroundRefreshMinIntervalMs: FOREGROUND_REFRESH_MIN_INTERVAL_MS,
    contextKey: CONTEXT_KEY,
    buildPlayerHref: buildPlayerHref,
    buildHostConsoleHref: buildHostConsoleHref,
    createHostController: createHostController,
    bootstrapUi: bootstrapUi
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootstrapWhenReady);
  else bootstrapWhenReady();
})();
