/* CRIOS LiveRoom Realtime - signal-only boundary transport */
(function(){
  'use strict';

  var VERSION = '1.1.0';
  var SIGNAL_TYPE = 'presence-change';
  var MAX_TEXT_LENGTH = 160;

  function text(value){
    if (typeof value !== 'string') return '';
    var clean = value.trim();
    if (!clean || clean.length > MAX_TEXT_LENGTH || /[\u0000-\u001F\u007F]/.test(clean)) return '';
    return clean;
  }

  function normalizeSignal(roomId, signal){
    var source = signal && typeof signal === 'object' ? signal : {};
    var normalizedRoomId = text(roomId) || text(source.roomId);
    if (!normalizedRoomId) return null;

    var type = text(source.type) || SIGNAL_TYPE;
    if (type !== SIGNAL_TYPE) return null;
    var eventId = text(source.eventId || source.revision);
    if (!eventId) return null;
    var emittedAt = text(source.emittedAt);
    if (!emittedAt) emittedAt = new Date().toISOString();

    return Object.freeze({
      roomId: normalizedRoomId,
      type: type,
      eventId: eventId,
      emittedAt: emittedAt
    });
  }

  function createTransport(){
    var listenersByRoom = new Map();
    var destroyed = false;

    function subscribeRoom(roomId, callback){
      if (destroyed) return false;
      var normalizedRoomId = text(roomId);
      if (!normalizedRoomId || typeof callback !== 'function') return false;
      var roomListeners = listenersByRoom.get(normalizedRoomId);
      if (!roomListeners) {
        roomListeners = new Set();
        listenersByRoom.set(normalizedRoomId, roomListeners);
      }
      roomListeners.add(callback);
      return true;
    }

    function unsubscribeRoom(roomId){
      if (destroyed) return false;
      var normalizedRoomId = text(roomId);
      if (!normalizedRoomId) return false;
      return listenersByRoom.delete(normalizedRoomId);
    }

    function publishSignal(roomId, signal){
      if (destroyed) return false;
      var safeSignal = normalizeSignal(roomId, signal);
      if (!safeSignal) return false;
      var roomListeners = listenersByRoom.get(safeSignal.roomId);
      if (!roomListeners || roomListeners.size === 0) return true;
      roomListeners.forEach(function(listener){
        try { listener(safeSignal); } catch (ignoreListenerError) {}
      });
      return true;
    }

    function destroy(){
      if (destroyed) return;
      destroyed = true;
      listenersByRoom.clear();
    }

    return Object.freeze({
      subscribeRoom: subscribeRoom,
      unsubscribeRoom: unsubscribeRoom,
      publishSignal: publishSignal,
      destroy: destroy
    });
  }

  window.CRIOS_LIVE_ROOM_REALTIME_TRANSPORT = Object.freeze({
    version: VERSION,
    signalType: SIGNAL_TYPE,
    createTransport: createTransport,
    normalizeSignal: normalizeSignal
  });
})();
