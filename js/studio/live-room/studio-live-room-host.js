/* CRIOS Studio LiveRoom host - visible room creation and host presence */
(function(){
  'use strict';

  var VERSION = '1.0.0';
  var HEARTBEAT_INTERVAL_MS = 2 * 60 * 1000;
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
    var storage = null;
    try { storage = window.sessionStorage || null; } catch (ignore) { storage = null; }
    return Object.freeze({
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

  function baseState(status) {
    return {
      status: status || 'IDLE',
      busy: false,
      publication: null,
      room: null,
      participantId: null,
      playerHref: null,
      lastError: null,
      lastHeartbeatAt: null
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
    var baseHref = text(opts.baseHref) || (window.location && window.location.href) || '';
    var onStateChange = typeof opts.onStateChange === 'function' ? opts.onStateChange : function(){};
    var state = baseState(client && typeof client.available === 'function' && client.available() ? 'IDLE' : 'UNAVAILABLE');
    var timer = null;
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
      if (destroyed || state.status !== 'ACTIVE' || !state.room || !state.participantId) return;
      timer = setIntervalImpl(function(){ heartbeat(); }, HEARTBEAT_INTERVAL_MS);
    }

    function normalizedPublication(publication) {
      if (!publication || typeof publication !== 'object') return null;
      var campaignId = text(publication.campaignId);
      var publicationId = text(publication.publicationId);
      var href = text(publication.href);
      if (!publication.available || !campaignId || !publicationId || !href) return null;
      return frozen({campaignId: campaignId, publicationId: publicationId, href: href});
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
        runtimeHref: text(publication && publication.href),
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
      emit({status:'CREATING', busy:true, participantId:participantId, lastError:null});
      var response = await client.createLiveRoom(publication.campaignId, publication.publicationId, participantId);
      if (!response || response.success !== true || !response.data || !response.data.room) {
        return emit({status:'ERROR', busy:false, room:null, participantId:null, playerHref:null, lastError:frozen(response && response.error || {code:'LIVE_ROOM_CREATE_FAILED', message:'No se pudo iniciar la partida.'})});
      }

      var room = response.data.room;
      var playerHref = buildPlayerHref(publication.href, room.roomId, baseHref);
      if (!saveContext(room, participantId, publication, playerHref)) {
        clearContext(room.roomId, participantId);
        return emit({status:'ERROR', busy:false, room:null, participantId:null, playerHref:null, lastError:frozen({code:'HOST_CONTEXT_STORAGE_UNAVAILABLE', message:'La sala fue creada, pero Studio no pudo guardar el contexto del anfitrión en esta pestaña.'})});
      }

      var snapshot = emit({status:'ACTIVE', busy:false, room:room, participantId:participantId, playerHref:playerHref, lastError:null, lastHeartbeatAt:now()});
      startHeartbeat();
      return snapshot;
    }

    async function heartbeat() {
      if (destroyed || state.status !== 'ACTIVE' || !state.room || !state.participantId) return getState();
      var roomId = text(state.room.roomId);
      var participantId = text(state.participantId);
      var response = await client.heartbeatLiveRoom(roomId, participantId);
      if (!response || response.success !== true) {
        var error = frozen(response && response.error || {code:'LIVE_ROOM_HEARTBEAT_FAILED', message:'No se pudo actualizar la presencia del anfitrión.'});
        if (error.code === 'ROOM_EXPIRED' || error.code === 'ROOM_UNAVAILABLE' || error.code === 'PARTICIPANT_UNAVAILABLE' || error.code === 'CAPABILITY_STORAGE_UNAVAILABLE') {
          stopHeartbeat();
          clearContext(roomId, participantId);
          return emit({status:error.code === 'ROOM_EXPIRED' ? 'EXPIRED' : 'ERROR', busy:false, room:null, participantId:null, playerHref:null, lastError:error});
        }
        return emit({status:'ACTIVE', busy:false, lastError:error, lastHeartbeatAt:state.lastHeartbeatAt});
      }
      var room = response.data && response.data.room ? response.data.room : state.room;
      return emit({status:'ACTIVE', busy:false, room:room, lastError:null, lastHeartbeatAt:now()});
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
      var playerHref = text(context.playerHref);
      if (!roomId || !participantId || !campaignId || !publicationId || !playerHref) {
        clearContext(roomId, participantId);
        return emit({status:'IDLE', room:null, participantId:null, playerHref:null});
      }
      if (!client || typeof client.available !== 'function' || client.available() !== true) {
        return emit({status:'UNAVAILABLE', room:null, participantId:null, playerHref:null});
      }

      emit({status:'RESTORING', busy:true, publication:frozen({campaignId:campaignId,publicationId:publicationId,href:runtimeHref}), participantId:participantId, playerHref:playerHref, lastError:null});
      var response = await client.getLiveRoom(roomId);
      if (!response || response.success !== true || !response.data || !response.data.room) {
        var error = frozen(response && response.error || {code:'ROOM_UNAVAILABLE',message:'La sala ya no está disponible.'});
        clearContext(roomId, participantId);
        stopHeartbeat();
        return emit({status:error.code === 'ROOM_EXPIRED' ? 'EXPIRED' : 'IDLE', busy:false, room:null, participantId:null, playerHref:null, lastError:error});
      }
      var room = response.data.room;
      if (text(room.campaignId) !== campaignId || text(room.publicationId) !== publicationId) {
        clearContext(roomId, participantId);
        stopHeartbeat();
        return emit({status:'ERROR', busy:false, room:null, participantId:null, playerHref:null, lastError:frozen({code:'ROOM_PUBLICATION_MISMATCH',message:'La sala recuperada no coincide con la publicación guardada.'})});
      }
      emit({status:'ACTIVE', busy:false, room:room, participantId:participantId, playerHref:playerHref, lastError:null});
      startHeartbeat();
      return heartbeat();
    }

    function getState() { return frozen(state); }

    function destroy() {
      destroyed = true;
      stopHeartbeat();
    }

    return Object.freeze({
      version: VERSION,
      setPublication: setPublication,
      createRoom: createRoom,
      heartbeat: heartbeat,
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
      startButton.hidden = active;
      startButton.disabled = state.busy || state.status === 'UNAVAILABLE' || state.status === 'NO_PUBLICATION' || state.status === 'RESTORING';
      roomNode.hidden = !active;
      playerLink.hidden = !active;
      if (active) {
        roomNode.textContent = 'ID de sala: ' + String(state.room.roomId || '');
        playerLink.href = state.playerHref;
        playerLink.dataset.roomId = String(state.room.roomId || '');
        playerLink.dataset.campaignId = String(state.room.campaignId || '');
        playerLink.dataset.publicationId = String(state.room.publicationId || '');
      } else {
        roomNode.textContent = '';
        playerLink.removeAttribute('href');
        delete playerLink.dataset.roomId;
        delete playerLink.dataset.campaignId;
        delete playerLink.dataset.publicationId;
      }
    }

    var controller = createHostController({client:client,onStateChange:renderState});

    function syncPublication() {
      var launch = studio.runtimeLaunch.getState();
      var signature = [launch && launch.available, launch && launch.campaignId, launch && launch.publicationId, launch && launch.href].join('|');
      if (signature === lastPublicationSignature) return;
      lastPublicationSignature = signature;
      controller.setPublication(launch);
    }

    startButton.onclick = function(){
      syncPublication();
      controller.createRoom();
    };

    syncPublication();
    controller.restore();

    if (typeof MutationObserver === 'function') {
      var observer = new MutationObserver(function(){ syncPublication(); });
      var publicationPanel = document.getElementById('studioPublicationPanel') || panel.parentNode;
      if (publicationPanel) observer.observe(publicationPanel, {subtree:true,childList:true,attributes:true,attributeFilter:['href','hidden','data-campaign-id','data-publication-id']});
    }

    document.addEventListener('visibilitychange', function(){
      if (document.visibilityState === 'visible' && controller.getState().status === 'ACTIVE') controller.heartbeat();
    });

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
    contextKey: CONTEXT_KEY,
    buildPlayerHref: buildPlayerHref,
    createHostController: createHostController,
    bootstrapUi: bootstrapUi
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootstrapWhenReady);
  else bootstrapWhenReady();
})();
