/* CRIOS Runtime LiveRoom Game State — post-commit outbox coordinator */
(function(){
  'use strict';

  var VERSION = '1.0.0';
  var CONTEXT_KEYS = Object.freeze(['roomId', 'campaignId', 'publicationId', 'participantId', 'missionOrder']);
  var TERMINAL_CODES = Object.freeze([
    'ROOM_EXPIRED',
    'ROOM_UNAVAILABLE',
    'PARTICIPANT_UNAVAILABLE',
    'CAPABILITY_INVALID',
    'PLAYER_REQUIRED',
    'MISSION_UNAVAILABLE',
    'LIVE_ROOM_GAME_STATE_CONTEXT_MISMATCH',
    'LIVE_ROOM_GAME_STATE_SEMANTIC_INVALID'
  ]);
  var RECONCILIATION_CODE = 'LIVE_ROOM_GAME_STATE_RECONCILIATION_REQUIRED';
  var ERROR_CODES = Object.freeze({
    UNAVAILABLE: 'LIVE_ROOM_GAME_STATE_COORDINATOR_UNAVAILABLE',
    CONTEXT_INVALID: 'LIVE_ROOM_GAME_STATE_COORDINATOR_CONTEXT_INVALID',
    MISSION_INVALID: 'LIVE_ROOM_GAME_STATE_COORDINATOR_MISSION_INVALID',
    REQUEST_ID_UNAVAILABLE: 'LIVE_ROOM_GAME_STATE_COORDINATOR_REQUEST_ID_UNAVAILABLE',
    OUTBOX_FAILED: 'LIVE_ROOM_GAME_STATE_COORDINATOR_OUTBOX_FAILED',
    REMOTE_FAILED: 'LIVE_ROOM_GAME_STATE_COORDINATOR_REMOTE_FAILED'
  });

  function isPlainObject(value) {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value) &&
      Object.prototype.toString.call(value) === '[object Object]');
  }

  function exactKeys(value, expected) {
    if (!isPlainObject(value)) return false;
    var actual = Object.keys(value).sort();
    var wanted = expected.slice().sort();
    return actual.length === wanted.length && actual.every(function(key, index){ return key === wanted[index]; });
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
  function text(value) { return typeof value === 'string' ? value.trim() : ''; }

  function errorValue(code, message, retryable) {
    return frozenCopy({
      code: String(code || ERROR_CODES.REMOTE_FAILED),
      message: String(message || code || 'LiveRoom game-state synchronization failed.'),
      retryable: Boolean(retryable)
    });
  }

  function recordResult(accepted, queued, requestId, error) {
    return frozenCopy({
      accepted: Boolean(accepted),
      queued: Boolean(queued),
      requestId: String(requestId || ''),
      error: accepted ? null : error
    });
  }

  function normalizedId(value, maxLength) {
    return typeof value === 'string' && value && value.trim() === value &&
      value.length <= maxLength && !/[\u0000-\u001F\u007F]/.test(value);
  }

  function validateContext(source) {
    if (!exactKeys(source, CONTEXT_KEYS)) throw new Error('LiveRoom game-state coordinator context shape is invalid.');
    if (!normalizedId(source.roomId, 160) || !normalizedId(source.campaignId, 160) ||
        !normalizedId(source.publicationId, 200) || !normalizedId(source.participantId, 160) ||
        !Array.isArray(source.missionOrder)) {
      throw new Error('LiveRoom game-state coordinator context is invalid.');
    }
    var seen = Object.create(null);
    source.missionOrder.forEach(function(missionId){
      if (!normalizedId(missionId, 160) || seen[missionId]) throw new Error('LiveRoom game-state coordinator missionOrder is invalid.');
      seen[missionId] = true;
    });
    return frozenCopy(source);
  }

  function defaultRequestIdFactory() {
    try {
      if (window.crypto && typeof window.crypto.randomUUID === 'function') {
        return 'crios-live-room-game-state-complete-' + window.crypto.randomUUID();
      }
      if (window.crypto && typeof window.crypto.getRandomValues === 'function') {
        var bytes = new Uint8Array(16);
        window.crypto.getRandomValues(bytes);
        return 'crios-live-room-game-state-complete-' + Array.prototype.map.call(bytes, function(byte){
          return byte.toString(16).padStart(2, '0');
        }).join('');
      }
    } catch (ignore) {}
    return '';
  }

  function defaultSchedule(callback) {
    Promise.resolve().then(callback).catch(function(){});
  }

  function createCoordinator(options) {
    var opts = isPlainObject(options) ? options : {};
    var context = null;
    var contextError = null;
    var missionSet = Object.create(null);
    try {
      context = validateContext(opts.context);
      context.missionOrder.forEach(function(missionId){ missionSet[missionId] = true; });
    } catch (errorContext) {
      contextError = errorValue(ERROR_CODES.CONTEXT_INVALID, String(errorContext && errorContext.message || errorContext), false);
    }

    var client = opts.client || null;
    var outboxApi = opts.outboxApi || window.CRIOS_LIVE_ROOM_GAME_STATE_OUTBOX || null;
    var outbox = opts.outbox || null;
    if (!outbox && context && outboxApi && typeof outboxApi.createOutbox === 'function') {
      try { outbox = outboxApi.createOutbox({context: context, storage: opts.storage}); }
      catch (ignoreOutboxCreate) { outbox = null; }
    }
    var now = typeof opts.now === 'function' ? opts.now : function(){ return Date.now(); };
    var requestIdFactory = typeof opts.requestIdFactory === 'function' ? opts.requestIdFactory : defaultRequestIdFactory;
    var schedule = typeof opts.schedule === 'function' ? opts.schedule : defaultSchedule;
    var onGameStateChange = typeof opts.onGameStateChange === 'function' ? opts.onGameStateChange : function(){};
    var onAuthoritativeStateChange = typeof opts.onAuthoritativeStateChange === 'function' ? opts.onAuthoritativeStateChange : function(){};
    var onStateChange = typeof opts.onStateChange === 'function' ? opts.onStateChange : function(){};
    var destroyed = false;
    var terminal = false;
    var started = false;
    var operationTail = Promise.resolve();
    var state = {
      status: contextError ? 'UNAVAILABLE' : 'IDLE',
      pendingCount: 0,
      lastError: contextError,
      lastGameState: null,
      lastFlushAt: null
    };

    function emit(next) {
      state = Object.assign({}, state, next || {});
      var snapshot = frozenCopy(state);
      try { onStateChange(snapshot); } catch (ignoreStateCallback) {}
      return snapshot;
    }

    function available() {
      return Boolean(!contextError && context && !destroyed && !terminal && client &&
        typeof client.available === 'function' && client.available() === true &&
        typeof client.getLiveRoomGameState === 'function' &&
        typeof client.completeLiveRoomMission === 'function' && outbox &&
        typeof outbox.available === 'function' && outbox.available() === true &&
        typeof outbox.list === 'function' && typeof outbox.enqueue === 'function' &&
        typeof outbox.markAttempt === 'function' && typeof outbox.acknowledge === 'function' &&
        typeof outbox.clear === 'function');
    }

    function timestamp() {
      try { return new Date(now()).toISOString(); } catch (ignoreDate) { return ''; }
    }

    function attemptTimestamp(item) {
      var candidate = timestamp();
      if (!candidate) return '';
      var floor = item && item.lastAttemptAt || item && item.createdAt || candidate;
      return Date.parse(candidate) < Date.parse(floor) ? floor : candidate;
    }

    function requestId() {
      try { return text(requestIdFactory()); } catch (ignoreRequestId) { return ''; }
    }

    function pendingCount() {
      if (!outbox || typeof outbox.list !== 'function') return 0;
      var listed = outbox.list();
      return listed && listed.success && listed.data ? listed.data.pendingCount : 0;
    }

    function publishGameState(gameState) {
      if (!gameState || typeof gameState !== 'object') return false;
      var snapshot = frozenCopy(gameState);
      emit({lastGameState: snapshot, lastError: null});
      try { onGameStateChange(snapshot); } catch (ignoreGameStateCallback) {}
      return true;
    }

    function clearGameState() {
      emit({lastGameState: null});
      try { onGameStateChange(null); } catch (ignoreGameStateCallback) {}
    }

    function clientError(response, fallbackCode, fallbackMessage) {
      var remote = response && response.error ? response.error : null;
      return errorValue(
        remote && remote.code || fallbackCode,
        remote && remote.message || fallbackMessage,
        remote && remote.retryable
      );
    }

    function isTerminal(error) {
      return Boolean(error && TERMINAL_CODES.indexOf(error.code) >= 0);
    }

    function outboxFailure(result, fallbackMessage) {
      var source = result && result.error ? result.error : null;
      return errorValue(source && source.code || ERROR_CODES.OUTBOX_FAILED,
        source && source.message || fallbackMessage || 'LiveRoom game-state outbox failed.', false);
    }

    function discardTerminal(error) {
      terminal = true;
      var cleared = outbox && typeof outbox.clear === 'function' ? outbox.clear() : null;
      var finalError = cleared && cleared.success === false ? outboxFailure(cleared) : error;
      clearGameState();
      return emit({status: 'TERMINAL', pendingCount: pendingCount(), lastError: finalError, lastFlushAt: timestamp() || state.lastFlushAt});
    }

    function runExclusive(work) {
      var run = operationTail.then(work, work);
      operationTail = run.then(function(){}, function(){});
      return run;
    }

    async function performRefresh() {
      if (!available()) {
        return emit({status: destroyed ? 'DESTROYED' : 'UNAVAILABLE', lastError: contextError || errorValue(ERROR_CODES.UNAVAILABLE, 'LiveRoom game-state coordinator is unavailable.', false)});
      }
      var response;
      try { response = await client.getLiveRoomGameState(); }
      catch (ignoreRemote) { response = null; }
      if (!response || response.success !== true || !response.data || !response.data.gameState) {
        var error = clientError(response, ERROR_CODES.REMOTE_FAILED, 'LiveRoom game-state read failed.');
        if (isTerminal(error)) return discardTerminal(error);
        return emit({status: 'DEGRADED', pendingCount: pendingCount(), lastError: error});
      }
      publishGameState(response.data.gameState);
      return emit({status: 'READY', pendingCount: pendingCount(), lastError: null});
    }

    async function reconcileCompletion(item) {
      var response;
      try { response = await client.getLiveRoomGameState(); }
      catch (ignoreRemote) { response = null; }
      if (!response || response.success !== true || !response.data || !response.data.gameState) return {acknowledged: false, response: response};
      publishGameState(response.data.gameState);
      if (!response.data.gameState.completedMissionIds.includes(item.missionId)) return {acknowledged: false, response: response};
      var acknowledged = outbox.acknowledge(item.requestId);
      return {acknowledged: Boolean(acknowledged && acknowledged.success), response: response, outboxResult: acknowledged};
    }

    async function performFlush() {
      if (!available()) {
        return emit({status: destroyed ? 'DESTROYED' : 'UNAVAILABLE', lastError: contextError || errorValue(ERROR_CODES.UNAVAILABLE, 'LiveRoom game-state coordinator is unavailable.', false)});
      }
      var listed = outbox.list();
      if (!listed || !listed.success) return emit({status: 'DEGRADED', pendingCount: 0, lastError: outboxFailure(listed)});
      if (!listed.data.items.length) return emit({status: 'READY', pendingCount: 0, lastError: null, lastFlushAt: timestamp() || state.lastFlushAt});

      emit({status: 'FLUSHING', pendingCount: listed.data.pendingCount, lastError: null});
      for (var index = 0; index < listed.data.items.length; index += 1) {
        var item = listed.data.items[index];
        var attemptedAt = attemptTimestamp(item);
        var marked = attemptedAt ? outbox.markAttempt(item.requestId, attemptedAt) : null;
        if (!marked || !marked.success) {
          return emit({status: 'DEGRADED', pendingCount: pendingCount(), lastError: outboxFailure(marked, 'LiveRoom game-state attempt could not be persisted.')});
        }

        var response;
        try { response = await client.completeLiveRoomMission(item.missionId, {requestId: item.requestId}); }
        catch (ignoreRemote) { response = null; }
        if (response && response.success === true && response.data && response.data.gameState) {
          if (response.data.changed === true) {
            try { onAuthoritativeStateChange(); } catch (ignoreAuthoritativeStateChange) {}
          }
          var acknowledged = outbox.acknowledge(item.requestId);
          if (!acknowledged || !acknowledged.success) {
            return emit({status: 'DEGRADED', pendingCount: pendingCount(), lastError: outboxFailure(acknowledged, 'LiveRoom game-state acknowledgement could not be persisted.')});
          }
          publishGameState(response.data.gameState);
          continue;
        }

        var error = clientError(response, ERROR_CODES.REMOTE_FAILED, 'LiveRoom mission completion could not be synchronized.');
        if (error.code === RECONCILIATION_CODE) {
          var reconciled = await reconcileCompletion(item);
          if (reconciled.acknowledged) continue;
          if (reconciled.outboxResult && reconciled.outboxResult.success === false) {
            return emit({status: 'DEGRADED', pendingCount: pendingCount(), lastError: outboxFailure(reconciled.outboxResult)});
          }
          error = clientError(reconciled.response, RECONCILIATION_CODE, 'LiveRoom game-state reconciliation is still required.');
        }
        if (isTerminal(error)) return discardTerminal(error);
        return emit({status: 'DEGRADED', pendingCount: pendingCount(), lastError: error, lastFlushAt: timestamp() || state.lastFlushAt});
      }
      return emit({status: 'READY', pendingCount: pendingCount(), lastError: null, lastFlushAt: timestamp() || state.lastFlushAt});
    }

    function refresh() { return runExclusive(performRefresh); }
    function flush() { return runExclusive(performFlush); }

    async function start() {
      if (started) return flush();
      started = true;
      if (!available()) return emit({status: 'UNAVAILABLE', lastError: contextError || errorValue(ERROR_CODES.UNAVAILABLE, 'LiveRoom game-state coordinator is unavailable.', false)});
      if (typeof outbox.pruneOtherContexts === 'function') {
        var pruned = outbox.pruneOtherContexts();
        if (!pruned || !pruned.success) return emit({status: 'DEGRADED', lastError: outboxFailure(pruned)});
      }
      await refresh();
      if (state.status === 'TERMINAL') return getState();
      return flush();
    }

    function scheduleFlush() {
      try { schedule(function(){ if (!destroyed) return flush(); }); }
      catch (ignoreSchedule) {}
    }

    function recordCommittedMission(missionId) {
      if (!available()) return recordResult(false, false, '', contextError || errorValue(ERROR_CODES.UNAVAILABLE, 'LiveRoom game-state coordinator is unavailable.', false));
      if (!normalizedId(missionId, 160) || !missionSet[missionId]) {
        return recordResult(false, false, '', errorValue(ERROR_CODES.MISSION_INVALID, 'Committed mission does not belong to this room publication.', false));
      }
      var createdAt = timestamp();
      var generated = requestId();
      if (!createdAt || !normalizedId(generated, 160)) {
        return recordResult(false, false, '', errorValue(ERROR_CODES.REQUEST_ID_UNAVAILABLE, 'LiveRoom game-state request identity is unavailable.', false));
      }
      var queued = outbox.enqueue({requestId: generated, missionId: missionId, createdAt: createdAt});
      if (!queued || !queued.success || !queued.data || !queued.data.item) {
        return recordResult(false, false, '', outboxFailure(queued));
      }
      emit({status: state.status === 'IDLE' ? 'READY' : state.status, pendingCount: queued.data.pendingCount});
      scheduleFlush();
      return recordResult(true, true, queued.data.item.requestId, null);
    }

    function discard() {
      terminal = true;
      if (!outbox || typeof outbox.clear !== 'function') return false;
      var cleared = outbox.clear();
      clearGameState();
      emit({status: 'TERMINAL', pendingCount: 0, lastError: null});
      return Boolean(cleared && cleared.success);
    }

    function destroy() {
      destroyed = true;
      emit({status: 'DESTROYED'});
    }

    function getState() { return frozenCopy(state); }

    return Object.freeze({
      version: VERSION,
      available: available,
      start: start,
      refresh: refresh,
      flush: flush,
      recordCommittedMission: recordCommittedMission,
      discard: discard,
      destroy: destroy,
      getState: getState
    });
  }

  window.CRIOS_RUNTIME_LIVE_ROOM_GAME_STATE_COORDINATOR_FACTORY = Object.freeze({
    version: VERSION,
    terminalCodes: TERMINAL_CODES,
    errorCodes: ERROR_CODES,
    createCoordinator: createCoordinator
  });
})();
