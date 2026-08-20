/* CRIOS LiveRoom Game State — strict session outbox for committed mission events */
(function(){
  'use strict';

  var VERSION = '1.0.0';
  var RECORD_VERSION = 1;
  var KEY_PREFIX = 'crios-live-room-game-state-outbox-v1:';
  var CONTEXT_KEYS = Object.freeze(['roomId', 'campaignId', 'publicationId', 'participantId', 'missionOrder']);
  var STORED_CONTEXT_KEYS = Object.freeze(['roomId', 'campaignId', 'publicationId', 'participantId']);
  var RECORD_KEYS = Object.freeze(['version', 'context', 'items']);
  var ITEM_KEYS = Object.freeze(['requestId', 'missionId', 'createdAt', 'attemptCount', 'lastAttemptAt']);
  var ERROR_CODES = Object.freeze({
    UNAVAILABLE: 'LIVE_ROOM_GAME_STATE_OUTBOX_UNAVAILABLE',
    CONTEXT_INVALID: 'LIVE_ROOM_GAME_STATE_OUTBOX_CONTEXT_INVALID',
    ITEM_INVALID: 'LIVE_ROOM_GAME_STATE_OUTBOX_ITEM_INVALID',
    ITEM_UNAVAILABLE: 'LIVE_ROOM_GAME_STATE_OUTBOX_ITEM_UNAVAILABLE',
    CORRUPTED: 'LIVE_ROOM_GAME_STATE_OUTBOX_CORRUPTED',
    STORAGE_FAILED: 'LIVE_ROOM_GAME_STATE_OUTBOX_STORAGE_FAILED'
  });

  function isPlainObject(value) {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value) &&
      Object.prototype.toString.call(value) === '[object Object]');
  }

  function exactKeys(value, expected) {
    if (!isPlainObject(value)) return false;
    var actual = Object.keys(value).sort();
    var wanted = expected.slice().sort();
    return actual.length === wanted.length && actual.every(function(key, index){
      return key === wanted[index];
    });
  }

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

  function frozenCopy(value) { return freeze(clone(value)); }

  function outcome(success, data, error) {
    return frozenCopy({success: Boolean(success), data: success ? data : null, error: success ? null : error});
  }


  function internalOutcome(success, data, error) {
    return {success: Boolean(success), data: success ? data : null, error: success ? null : error};
  }
  function errorValue(code, message) {
    return frozenCopy({code: String(code), message: String(message || code)});
  }

  function normalizedId(value, maxLength) {
    return typeof value === 'string' && value && value.trim() === value &&
      value.length <= maxLength && !/[\u0000-\u001F\u007F]/.test(value);
  }

  function canonicalIso(value) {
    if (typeof value !== 'string' || !value || value.trim() !== value) return false;
    var timestamp = Date.parse(value);
    return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
  }

  function validateContext(source) {
    if (!exactKeys(source, CONTEXT_KEYS)) throw new Error('LiveRoom game-state outbox context shape is invalid.');
    if (!normalizedId(source.roomId, 160) || !normalizedId(source.campaignId, 160) ||
        !normalizedId(source.publicationId, 200) || !normalizedId(source.participantId, 160)) {
      throw new Error('LiveRoom game-state outbox identity is invalid or not normalized.');
    }
    if (!Array.isArray(source.missionOrder)) throw new Error('missionOrder must be an array.');
    var seen = Object.create(null);
    source.missionOrder.forEach(function(missionId){
      if (!normalizedId(missionId, 160) || seen[missionId]) throw new Error('missionOrder is invalid.');
      seen[missionId] = true;
    });
    return frozenCopy(source);
  }

  function storedContext(context) {
    return {
      roomId: context.roomId,
      campaignId: context.campaignId,
      publicationId: context.publicationId,
      participantId: context.participantId
    };
  }

  function sameStoredContext(value, context) {
    return exactKeys(value, STORED_CONTEXT_KEYS) &&
      value.roomId === context.roomId &&
      value.campaignId === context.campaignId &&
      value.publicationId === context.publicationId &&
      value.participantId === context.participantId;
  }

  function storageKey(context) {
    return KEY_PREFIX + [context.roomId, context.campaignId, context.publicationId, context.participantId]
      .map(encodeURIComponent).join(':');
  }

  function defaultStorage() {
    try { return window.sessionStorage || null; } catch (ignore) { return null; }
  }

  function createOutbox(options) {
    var opts = isPlainObject(options) ? options : {};
    var storage = opts.storage || defaultStorage();
    var context = null;
    var contextError = null;
    var key = '';
    var missionSet = Object.create(null);

    try {
      context = validateContext(opts.context);
      context.missionOrder.forEach(function(missionId){ missionSet[missionId] = true; });
      key = storageKey(context);
    } catch (error) {
      contextError = errorValue(ERROR_CODES.CONTEXT_INVALID, String(error && error.message || error));
    }

    function available() {
      return Boolean(!contextError && context && storage &&
        typeof storage.getItem === 'function' &&
        typeof storage.setItem === 'function' &&
        typeof storage.removeItem === 'function');
    }

    function emptyRecord() {
      return {version: RECORD_VERSION, context: storedContext(context), items: []};
    }

    function validItem(item) {
      if (!exactKeys(item, ITEM_KEYS) || !normalizedId(item.requestId, 160) ||
          !normalizedId(item.missionId, 160) || !missionSet[item.missionId] ||
          !canonicalIso(item.createdAt) || !Number.isInteger(item.attemptCount) ||
          item.attemptCount < 0 || item.attemptCount > 1000000) return false;
      if (item.attemptCount === 0) return item.lastAttemptAt === null;
      return canonicalIso(item.lastAttemptAt) && Date.parse(item.lastAttemptAt) >= Date.parse(item.createdAt);
    }

    function validRecord(record) {
      if (!exactKeys(record, RECORD_KEYS) || record.version !== RECORD_VERSION ||
          !sameStoredContext(record.context, context) || !Array.isArray(record.items) ||
          record.items.length > context.missionOrder.length) return false;
      var requests = Object.create(null);
      var missions = Object.create(null);
      for (var index = 0; index < record.items.length; index += 1) {
        var item = record.items[index];
        if (!validItem(item) || requests[item.requestId] || missions[item.missionId]) return false;
        requests[item.requestId] = true;
        missions[item.missionId] = true;
      }
      return true;
    }

    function readRecord() {
      if (!available()) {
        return internalOutcome(false, null, contextError || errorValue(ERROR_CODES.UNAVAILABLE, 'LiveRoom game-state outbox is unavailable.'));
      }
      var raw;
      try { raw = storage.getItem(key); }
      catch (errorRead) { return internalOutcome(false, null, errorValue(ERROR_CODES.STORAGE_FAILED, 'LiveRoom game-state outbox could not be read.')); }
      if (raw === null) return internalOutcome(true, emptyRecord(), null);
      var parsed;
      try { parsed = JSON.parse(raw); }
      catch (errorParse) { return internalOutcome(false, null, errorValue(ERROR_CODES.CORRUPTED, 'LiveRoom game-state outbox contains invalid JSON.')); }
      if (!validRecord(parsed)) return internalOutcome(false, null, errorValue(ERROR_CODES.CORRUPTED, 'LiveRoom game-state outbox failed validation.'));
      return internalOutcome(true, parsed, null);
    }

    function writeRecord(record) {
      if (!validRecord(record)) return internalOutcome(false, null, errorValue(ERROR_CODES.CORRUPTED, 'LiveRoom game-state outbox write was rejected.'));
      var serialized = JSON.stringify(record);
      try {
        if (record.items.length === 0) {
          storage.removeItem(key);
          if (storage.getItem(key) !== null) throw new Error('remove verification failed');
        } else {
          storage.setItem(key, serialized);
          if (storage.getItem(key) !== serialized) throw new Error('write verification failed');
        }
      } catch (errorWrite) {
        return internalOutcome(false, null, errorValue(ERROR_CODES.STORAGE_FAILED, 'LiveRoom game-state outbox could not be persisted.'));
      }
      return internalOutcome(true, record, null);
    }

    function list() {
      var loaded = readRecord();
      if (!loaded.success) return outcome(false, null, loaded.error);
      return outcome(true, {
        context: storedContext(context),
        items: loaded.data.items,
        pendingCount: loaded.data.items.length
      }, null);
    }

    function enqueue(input) {
      if (!exactKeys(input, ['requestId', 'missionId', 'createdAt']) ||
          !normalizedId(input.requestId, 160) || !normalizedId(input.missionId, 160) ||
          !missionSet[input.missionId] || !canonicalIso(input.createdAt)) {
        return outcome(false, null, errorValue(ERROR_CODES.ITEM_INVALID, 'LiveRoom game-state outbox item is invalid.'));
      }
      var loaded = readRecord();
      if (!loaded.success) return outcome(false, null, loaded.error);
      var existing = loaded.data.items.find(function(item){ return item.missionId === input.missionId; });
      if (existing) {
        return outcome(true, {item: existing, added: false, pendingCount: loaded.data.items.length}, null);
      }
      if (loaded.data.items.some(function(item){ return item.requestId === input.requestId; })) {
        return outcome(false, null, errorValue(ERROR_CODES.ITEM_INVALID, 'LiveRoom game-state outbox requestId is already in use.'));
      }
      var item = {
        requestId: input.requestId,
        missionId: input.missionId,
        createdAt: input.createdAt,
        attemptCount: 0,
        lastAttemptAt: null
      };
      loaded.data.items.push(item);
      var persisted = writeRecord(loaded.data);
      if (!persisted.success) return outcome(false, null, persisted.error);
      return outcome(true, {item: item, added: true, pendingCount: loaded.data.items.length}, null);
    }

    function markAttempt(requestId, attemptedAt) {
      if (!normalizedId(requestId, 160) || !canonicalIso(attemptedAt)) {
        return outcome(false, null, errorValue(ERROR_CODES.ITEM_INVALID, 'LiveRoom game-state outbox attempt is invalid.'));
      }
      var loaded = readRecord();
      if (!loaded.success) return outcome(false, null, loaded.error);
      var item = loaded.data.items.find(function(candidate){ return candidate.requestId === requestId; });
      if (!item) return outcome(false, null, errorValue(ERROR_CODES.ITEM_UNAVAILABLE, 'LiveRoom game-state outbox item is unavailable.'));
      var previousAttemptAt = item.lastAttemptAt || item.createdAt;
      if (Date.parse(attemptedAt) < Date.parse(previousAttemptAt) || item.attemptCount >= 1000000) {
        return outcome(false, null, errorValue(ERROR_CODES.ITEM_INVALID, 'LiveRoom game-state outbox attempt is not monotonic.'));
      }
      item.attemptCount += 1;
      item.lastAttemptAt = attemptedAt;
      var persisted = writeRecord(loaded.data);
      if (!persisted.success) return outcome(false, null, persisted.error);
      return outcome(true, {item: item, pendingCount: loaded.data.items.length}, null);
    }

    function acknowledge(requestId) {
      if (!normalizedId(requestId, 160)) {
        return outcome(false, null, errorValue(ERROR_CODES.ITEM_INVALID, 'LiveRoom game-state outbox requestId is invalid.'));
      }
      var loaded = readRecord();
      if (!loaded.success) return outcome(false, null, loaded.error);
      var originalLength = loaded.data.items.length;
      loaded.data.items = loaded.data.items.filter(function(item){ return item.requestId !== requestId; });
      var removed = loaded.data.items.length !== originalLength;
      if (!removed) return outcome(true, {removed: false, pendingCount: originalLength}, null);
      var persisted = writeRecord(loaded.data);
      if (!persisted.success) return outcome(false, null, persisted.error);
      return outcome(true, {removed: true, pendingCount: loaded.data.items.length}, null);
    }

    function clear() {
      if (!available()) return outcome(false, null, contextError || errorValue(ERROR_CODES.UNAVAILABLE, 'LiveRoom game-state outbox is unavailable.'));
      try {
        storage.removeItem(key);
        if (storage.getItem(key) !== null) throw new Error('remove verification failed');
        return outcome(true, {cleared: true}, null);
      } catch (errorClear) {
        return outcome(false, null, errorValue(ERROR_CODES.STORAGE_FAILED, 'LiveRoom game-state outbox could not be cleared.'));
      }
    }

    function pruneOtherContexts() {
      if (!available()) return outcome(false, null, contextError || errorValue(ERROR_CODES.UNAVAILABLE, 'LiveRoom game-state outbox is unavailable.'));
      if (!Number.isInteger(storage.length) || typeof storage.key !== 'function') {
        return outcome(true, {prunedCount: 0}, null);
      }
      var keys = [];
      try {
        for (var index = 0; index < storage.length; index += 1) {
          var candidate = storage.key(index);
          if (typeof candidate === 'string' && candidate.indexOf(KEY_PREFIX) === 0 && candidate !== key) keys.push(candidate);
        }
        keys.forEach(function(candidate){ storage.removeItem(candidate); });
      } catch (errorPrune) {
        return outcome(false, null, errorValue(ERROR_CODES.STORAGE_FAILED, 'Old LiveRoom game-state outboxes could not be pruned.'));
      }
      return outcome(true, {prunedCount: keys.length}, null);
    }

    return Object.freeze({
      version: VERSION,
      available: available,
      list: list,
      enqueue: enqueue,
      markAttempt: markAttempt,
      acknowledge: acknowledge,
      clear: clear,
      pruneOtherContexts: pruneOtherContexts
    });
  }

  window.CRIOS_LIVE_ROOM_GAME_STATE_OUTBOX = Object.freeze({
    version: VERSION,
    recordVersion: RECORD_VERSION,
    keyPrefix: KEY_PREFIX,
    errorCodes: ERROR_CODES,
    createOutbox: createOutbox
  });
})();
