/* CRIOS LiveRoom Realtime - Firebase RTDB signal-only provider */
(function(){
  'use strict';

  var VERSION = '1.1.0';
  var APP_NAME = 'crios-live-room-realtime';
  var ROOT_PATH = 'liveRoomSignals';
  var SIGNAL_TYPE = 'presence-change';
  var REQUIRED_FIREBASE_CONFIG = ['apiKey','authDomain','databaseURL','projectId','appId'];
  var MAX_TEXT_LENGTH = 160;
  var MAX_SEEN_EVENT_IDS = 512;
  var ATTACH_RETRY_MS = 2000;

  function text(value){
    if (typeof value !== 'string') return '';
    var clean = value.trim();
    if (!clean || clean.length > MAX_TEXT_LENGTH || /[\u0000-\u001F\u007F]/.test(clean)) return '';
    return clean;
  }

  function firebaseKey(value){
    var clean = text(value);
    return clean && !/[.#$\[\]\/]/.test(clean) ? clean : '';
  }

  function isCompleteConfig(config){
    if (!config || config.provider !== 'firebase' || !config.firebase || typeof config.firebase !== 'object') return false;
    return REQUIRED_FIREBASE_CONFIG.every(function(name){ return Boolean(text(config.firebase[name])); });
  }

  function signalPayload(signal){
    var source = signal && typeof signal === 'object' ? signal : {};
    var type = text(source.type);
    var eventId = text(source.eventId);
    var emittedAt = text(source.emittedAt);
    if (type !== SIGNAL_TYPE || !eventId || !emittedAt) return null;
    return Object.freeze({type:type,eventId:eventId,emittedAt:emittedAt});
  }

  function createTransport(config, dependencies){
    var deps = dependencies && typeof dependencies === 'object' ? dependencies : {};
    var rooms = new Map();
    var connectionPromise = null;
    var destroyed = false;
    var setTimeoutImpl = typeof deps.setTimeoutImpl === 'function' ? deps.setTimeoutImpl : (typeof window.setTimeout === 'function' ? window.setTimeout.bind(window) : null);
    var clearTimeoutImpl = typeof deps.clearTimeoutImpl === 'function' ? deps.clearTimeoutImpl : (typeof window.clearTimeout === 'function' ? window.clearTimeout.bind(window) : function(){});

    function firebaseApi(){ return deps.firebase || window.firebase || null; }

    function awaitAnonymous(auth){
      if (!auth || typeof auth.signInAnonymously !== 'function') return Promise.resolve(null);
      try { return Promise.resolve(auth.signInAnonymously()).catch(function(){ return null; }); }
      catch (ignoreAuthError) { return Promise.resolve(null); }
    }

    function connect(){
      if (connectionPromise) return connectionPromise;
      var attempt = Promise.resolve().then(function(){
        var firebase = firebaseApi();
        if (destroyed || !isCompleteConfig(config) || !firebase || typeof firebase.initializeApp !== 'function') return null;
        var app = null;
        if (typeof firebase.app === 'function') {
          try { app = firebase.app(APP_NAME); } catch (ignoreMissingApp) {}
        }
        if (!app) app = firebase.initializeApp(config.firebase, APP_NAME);
        if (!app || typeof app.auth !== 'function' || typeof app.database !== 'function') return null;
        var auth = app.auth();
        var database = app.database();
        if (!auth || !database || typeof database.ref !== 'function') return null;
        var credential = auth.currentUser ? {user:auth.currentUser} : awaitAnonymous(auth);
        return Promise.resolve(credential).then(function(resolved){
          var user = resolved && resolved.user || auth.currentUser;
          var uid = user && firebaseKey(user.uid);
          return uid ? {database:database,uid:uid} : null;
        });
      }).catch(function(){ return null; });
      connectionPromise = attempt;
      attempt.then(function(result){
        if (!result && connectionPromise === attempt) connectionPromise = null;
      }, function(){
        if (connectionPromise === attempt) connectionPromise = null;
      });
      return attempt;
    }

    function rememberEvent(room, eventId){
      if (room.seenEventIds.has(eventId)) return false;
      room.seenEventIds.add(eventId);
      room.seenEventOrder.push(eventId);
      while (room.seenEventOrder.length > MAX_SEEN_EVENT_IDS) {
        room.seenEventIds.delete(room.seenEventOrder.shift());
      }
      return true;
    }

    function dispatch(roomId, room, snapshot){
      var value = null;
      try { value = snapshot && typeof snapshot.val === 'function' ? snapshot.val() : null; } catch (ignoreSnapshot) {}
      var safeSignal = signalPayload(value);
      if (!safeSignal || !rememberEvent(room, safeSignal.eventId)) return;
      var delivered = Object.freeze({roomId:roomId,type:safeSignal.type,eventId:safeSignal.eventId,emittedAt:safeSignal.emittedAt});
      room.callbacks.forEach(function(callback){
        try { callback(delivered); } catch (ignoreCallbackError) {}
      });
    }

    function scheduleAttachRetry(roomId, room){
      if (destroyed || !setTimeoutImpl || rooms.get(roomId) !== room || room.retryTimer !== null) return;
      room.retryTimer = setTimeoutImpl(function(){
        room.retryTimer = null;
        attach(roomId, room);
      }, ATTACH_RETRY_MS);
    }

    function attach(roomId, room){
      connect().then(function(connection){
        if (destroyed || rooms.get(roomId) !== room) return;
        if (!connection) { scheduleAttachRetry(roomId, room); return; }
        var ref = connection.database.ref(ROOT_PATH + '/' + roomId);
        if (!ref || typeof ref.on !== 'function') { scheduleAttachRetry(roomId, room); return; }
        room.ref = ref;
        room.onAdded = function(snapshot){ dispatch(roomId, room, snapshot); };
        room.onChanged = function(snapshot){ dispatch(roomId, room, snapshot); };
        try {
          ref.on('child_added', room.onAdded);
          ref.on('child_changed', room.onChanged);
        } catch (ignoreListenError) {
          detachRef(room);
          scheduleAttachRetry(roomId, room);
        }
      }).catch(function(){ scheduleAttachRetry(roomId, room); });
    }

    function detachRef(room){
      if (!room || !room.ref || typeof room.ref.off !== 'function') return;
      try { room.ref.off('child_added', room.onAdded); } catch (ignoreAddedOff) {}
      try { room.ref.off('child_changed', room.onChanged); } catch (ignoreChangedOff) {}
      room.ref = null;
      room.onAdded = null;
      room.onChanged = null;
    }

    function detach(room){
      if (!room) return;
      if (room.retryTimer !== null) {
        try { clearTimeoutImpl(room.retryTimer); } catch (ignoreRetryClear) {}
        room.retryTimer = null;
      }
      detachRef(room);
    }

    function subscribeRoom(roomId, callback){
      if (destroyed || !isCompleteConfig(config) || typeof callback !== 'function') return false;
      var safeRoomId = firebaseKey(roomId);
      if (!safeRoomId) return false;
      var room = rooms.get(safeRoomId);
      if (!room) {
        room = {callbacks:new Set(),seenEventIds:new Set(),seenEventOrder:[],ref:null,onAdded:null,onChanged:null,retryTimer:null};
        rooms.set(safeRoomId, room);
        attach(safeRoomId, room);
      }
      room.callbacks.add(callback);
      return true;
    }

    function unsubscribeRoom(roomId){
      if (destroyed) return false;
      var safeRoomId = firebaseKey(roomId);
      var room = safeRoomId && rooms.get(safeRoomId);
      if (!room) return false;
      detach(room);
      rooms.delete(safeRoomId);
      return true;
    }

    function publishSignal(roomId, signal){
      if (destroyed || !isCompleteConfig(config)) return false;
      var safeRoomId = firebaseKey(roomId);
      var safeSignal = signalPayload(signal);
      if (!safeRoomId || !safeSignal) return false;
      connect().then(function(connection){
        if (destroyed || !connection) return;
        var ref = connection.database.ref(ROOT_PATH + '/' + safeRoomId + '/' + connection.uid);
        if (ref && typeof ref.set === 'function') {
          try { Promise.resolve(ref.set(safeSignal)).catch(function(){}); } catch (ignoreWriteError) {}
        }
      }).catch(function(){});
      return true;
    }

    function destroy(){
      if (destroyed) return;
      destroyed = true;
      rooms.forEach(detach);
      rooms.clear();
      connectionPromise = null;
    }

    return Object.freeze({
      subscribeRoom:subscribeRoom,
      unsubscribeRoom:unsubscribeRoom,
      publishSignal:publishSignal,
      destroy:destroy
    });
  }

  window.CRIOS_FIREBASE_LIVE_ROOM_REALTIME_PROVIDER = Object.freeze({
    version:VERSION,
    rootPath:ROOT_PATH,
    signalType:SIGNAL_TYPE,
    attachRetryMs:ATTACH_RETRY_MS,
    maxSeenEventIds:MAX_SEEN_EVENT_IDS,
    isCompleteConfig:isCompleteConfig,
    signalPayload:signalPayload,
    createTransport:createTransport
  });
})();
