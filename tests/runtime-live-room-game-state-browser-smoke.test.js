(function(){
  'use strict';

  var total = 0;
  var failed = 0;
  var messages = [];
  var physicalPrefix = 'crios-live-room-browser-smoke:' + Date.now() + ':';
  var output = document.getElementById('output');
  var status = document.getElementById('status');

  function render() {
    output.textContent = messages.join('\n');
  }

  function ok(condition, label) {
    total += 1;
    if (condition) messages.push('PASS ' + label);
    else {
      failed += 1;
      messages.push('FAIL ' + label);
    }
    render();
  }

  function eq(actual, expected, label) {
    ok(JSON.stringify(actual) === JSON.stringify(expected), label +
      ' expected=' + JSON.stringify(expected) + ' actual=' + JSON.stringify(actual));
  }

  function success(gameState, changed) {
    return {
      success: true,
      requestId: 'remote-response',
      data: {gameState: gameState, stateAdvanced: true, changed: Boolean(changed)},
      error: null
    };
  }

  function failure(code, retryable) {
    return {
      success: false,
      requestId: 'remote-response',
      data: null,
      error: {code: code, message: code, retryable: Boolean(retryable)}
    };
  }

  function storageNamespace(name) {
    var prefix = physicalPrefix + name + ':';

    function keys() {
      var matches = [];
      for (var index = 0; index < sessionStorage.length; index += 1) {
        var candidate = sessionStorage.key(index);
        if (typeof candidate === 'string' && candidate.indexOf(prefix) === 0) {
          matches.push(candidate.slice(prefix.length));
        }
      }
      return matches.sort();
    }

    return {
      get length() { return keys().length; },
      key: function(index) { return keys()[index] || null; },
      getItem: function(key) { return sessionStorage.getItem(prefix + String(key)); },
      setItem: function(key, value) { sessionStorage.setItem(prefix + String(key), String(value)); },
      removeItem: function(key) { sessionStorage.removeItem(prefix + String(key)); },
      snapshot: function() {
        return keys().map(function(key){ return {key: key, value: sessionStorage.getItem(prefix + key)}; });
      },
      clear: function() { keys().forEach(function(key){ sessionStorage.removeItem(prefix + key); }); }
    };
  }

  function authority(missionOrder) {
    var completed = [];
    var expired = false;

    function snapshot() {
      return {
        schemaVersion: '1.0',
        roomId: 'room-browser-smoke',
        campaignId: 'campaign-browser-smoke',
        publicationId: 'publication-browser-smoke',
        revision: completed.length,
        completedMissionIds: completed.slice(),
        updatedAt: new Date(Date.parse('2026-08-18T12:00:00.000Z') + completed.length * 60000).toISOString()
      };
    }

    return {
      get expired() { return expired; },
      set expired(value) { expired = Boolean(value); },
      read: snapshot,
      complete: function(missionId) {
        if (completed.indexOf(missionId) < 0) {
          completed.push(missionId);
          completed.sort(function(left, right){ return missionOrder.indexOf(left) - missionOrder.indexOf(right); });
        }
        return snapshot();
      }
    };
  }

  function remoteClient(sharedAuthority, participantId) {
    var nextFailure = null;
    var calls = [];
    return {
      calls: calls,
      available: function(){ return true; },
      failNextComplete: function(code, retryable){ nextFailure = {code: code, retryable: retryable}; },
      getLiveRoomGameState: async function(){
        calls.push(['get', participantId]);
        if (sharedAuthority.expired) return failure('ROOM_EXPIRED', false);
        return success(sharedAuthority.read(), false);
      },
      completeLiveRoomMission: async function(missionId, options){
        calls.push(['complete', participantId, missionId, options && options.requestId]);
        if (sharedAuthority.expired) return failure('ROOM_EXPIRED', false);
        if (nextFailure) {
          var selected = nextFailure;
          nextFailure = null;
          return failure(selected.code, selected.retryable);
        }
        var before = sharedAuthority.read().completedMissionIds.indexOf(missionId) >= 0;
        return success(sharedAuthority.complete(missionId), !before);
      }
    };
  }

  function contextFor(participantId, missionOrder) {
    return {
      roomId: 'room-browser-smoke',
      campaignId: 'campaign-browser-smoke',
      publicationId: 'publication-browser-smoke',
      participantId: participantId,
      missionOrder: missionOrder.slice()
    };
  }

  function coordinatorHarness(context, storage, client, requestPrefix) {
    var scheduled = [];
    var gameStates = [];
    var sequence = 0;
    var clock = Date.parse('2026-08-18T12:00:00.000Z');
    var coordinator = window.CRIOS_RUNTIME_LIVE_ROOM_GAME_STATE_COORDINATOR_FACTORY.createCoordinator({
      context: context,
      client: client,
      storage: storage,
      now: function(){ clock += 1; return clock; },
      requestIdFactory: function(){ sequence += 1; return requestPrefix + '-' + sequence; },
      schedule: function(callback){ scheduled.push(callback); },
      onGameStateChange: function(gameState){ gameStates.push(gameState); }
    });
    return {coordinator: coordinator, scheduled: scheduled, gameStates: gameStates};
  }

  function outboxFor(context, storage) {
    return window.CRIOS_LIVE_ROOM_GAME_STATE_OUTBOX.createOutbox({context: context, storage: storage});
  }

  function cleanup() {
    var keys = [];
    for (var index = 0; index < sessionStorage.length; index += 1) {
      var key = sessionStorage.key(index);
      if (typeof key === 'string' && key.indexOf(physicalPrefix) === 0) keys.push(key);
    }
    keys.forEach(function(key){ sessionStorage.removeItem(key); });
  }

  function report(result) {
    try {
      fetch('/__crios_smoke_result', {
        method: 'POST',
        credentials: 'omit',
        cache: 'no-store',
        headers: {'Content-Type': 'application/json;charset=utf-8'},
        body: JSON.stringify(result)
      }).catch(function(){});
    } catch (ignoreReport) {}
  }

  async function run() {
    cleanup();
    ok(typeof window === 'object' && typeof document === 'object', 'executes in a real browser document');
    ok(window.sessionStorage instanceof Storage, 'uses native browser sessionStorage');
    ok(Boolean(window.CRIOS_LIVE_ROOM_GAME_STATE_OUTBOX), 'production outbox loaded');
    ok(Boolean(window.CRIOS_RUNTIME_LIVE_ROOM_GAME_STATE_COORDINATOR_FACTORY), 'production coordinator loaded');
    ok(Boolean(window.CRIOS_RUNTIME_LIVE_ROOM_PLAYER), 'production Runtime player loaded');

    var missionOrder = ['energy', 'greenhouse', 'ice'];
    var sharedAuthority = authority(missionOrder);
    var storageA = storageNamespace('device-a');
    var storageB = storageNamespace('device-b');
    var contextA = contextFor('player-a', missionOrder);
    var contextB = contextFor('player-b', missionOrder);
    var clientA = remoteClient(sharedAuthority, 'player-a');
    var clientB = remoteClient(sharedAuthority, 'player-b');
    var playerA = coordinatorHarness(contextA, storageA, clientA, 'request-a');
    var playerB = coordinatorHarness(contextB, storageB, clientB, 'request-b');

    var stateA = await playerA.coordinator.start();
    var stateB = await playerB.coordinator.start();
    eq(stateA.status, 'READY', 'device A starts ready');
    eq(stateB.status, 'READY', 'device B starts ready');
    eq(stateA.lastGameState.completedMissionIds, [], 'device A reads initial authority');
    eq(stateB.lastGameState.completedMissionIds, [], 'device B reads initial authority');

    var recordedA = playerA.coordinator.recordCommittedMission('energy');
    ok(recordedA.accepted && recordedA.queued, 'device A queues committed mission');
    eq(clientA.calls.filter(function(call){ return call[0] === 'complete'; }).length, 0, 'post-commit does not execute network inline');
    eq(playerA.scheduled.length, 1, 'device A schedules asynchronous flush');
    await playerA.scheduled.shift()();
    eq(sharedAuthority.read().completedMissionIds, ['energy'], 'authority advances after asynchronous flush');
    eq(playerA.coordinator.getState().pendingCount, 0, 'successful flush acknowledges device A outbox');

    await playerB.coordinator.refresh();
    eq(playerB.coordinator.getState().lastGameState.completedMissionIds, ['energy'], 'device B reconciles teammate completion');

    clientB.failNextComplete('LIVE_ROOM_GAME_STATE_TRANSPORT_FAILED', true);
    var recordedB = playerB.coordinator.recordCommittedMission('greenhouse');
    ok(recordedB.accepted && recordedB.queued, 'device B queues completion before degraded network');
    await playerB.scheduled.shift()();
    eq(playerB.coordinator.getState().status, 'DEGRADED', 'transport failure degrades without losing local play');
    eq(outboxFor(contextB, storageB).list().data.pendingCount, 1, 'transient failure persists one pending event');
    ok(!JSON.stringify(storageB.snapshot()).includes('capabilityToken'), 'physical outbox contains no capability');
    ok(!JSON.stringify(storageB.snapshot()).includes('answer'), 'physical outbox contains no answer data');

    var retainedRequestId = recordedB.requestId;
    playerB.coordinator.destroy();
    eq(outboxFor(contextB, storageB).list().data.pendingCount, 1, 'normal teardown preserves pending event for reload');
    var playerBReloaded = coordinatorHarness(contextB, storageB, clientB, 'request-b-reload');
    var reloadedState = await playerBReloaded.coordinator.start();
    eq(reloadedState.status, 'READY', 'reloaded device recovers ready');
    eq(sharedAuthority.read().completedMissionIds, ['energy', 'greenhouse'], 'reload replays pending mission into authority');
    var greenhouseCalls = clientB.calls.filter(function(call){ return call[0] === 'complete' && call[2] === 'greenhouse'; });
    eq(greenhouseCalls.length, 2, 'transient completion is attempted exactly twice');
    eq(greenhouseCalls[0][3], retainedRequestId, 'first attempt uses persisted logical requestId');
    eq(greenhouseCalls[1][3], retainedRequestId, 'reload preserves exact logical requestId');
    eq(outboxFor(contextB, storageB).list().data.pendingCount, 0, 'replay acknowledgement removes pending event');

    await playerA.coordinator.refresh();
    eq(playerA.coordinator.getState().lastGameState.completedMissionIds, ['energy', 'greenhouse'], 'device A observes recovered teammate progress');

    var terminalRecord = playerA.coordinator.recordCommittedMission('ice');
    ok(terminalRecord.accepted, 'event may queue while room is still active');
    sharedAuthority.expired = true;
    await playerA.scheduled.shift()();
    eq(playerA.coordinator.getState().status, 'TERMINAL', 'expiry closes device A coordinator');
    eq(playerA.gameStates[playerA.gameStates.length - 1], null, 'expiry clears device A shared projection');
    eq(outboxFor(contextA, storageA).list().data.pendingCount, 0, 'expiry discards matching pending outbox');
    ok(!playerA.coordinator.available(), 'terminal coordinator is unavailable');
    var afterExpiry = playerA.coordinator.recordCommittedMission('ice');
    ok(!afterExpiry.accepted, 'terminal coordinator rejects later completions locally');
    eq(playerA.scheduled.length, 0, 'terminal rejection schedules no network');

    var playerApi = window.CRIOS_RUNTIME_LIVE_ROOM_PLAYER;
    var noRoom = playerApi.parseRoomLaunch('', {
      blocked: false,
      sourceMode: 'published',
      campaignId: 'campaign-browser-smoke',
      publicationId: 'publication-browser-smoke'
    });
    var noRoomStateClientCalls = 0;
    var noRoomController = playerApi.createPlayerController({
      client: {
        available: function(){ return true; },
        createGameStateClient: function(){ noRoomStateClientCalls += 1; return null; }
      },
      storage: {available: function(){ return true; }}
    });
    var noRoomState = await noRoomController.start(noRoom);
    eq(noRoom.requested, false, 'launch without roomId stays outside LiveRoom');
    eq(noRoomState.status, 'IDLE', 'mode without room remains idle');
    eq(noRoomStateClientCalls, 0, 'mode without room creates no state client');

    cleanup();
    eq(sessionStorage.length >= 0, true, 'native sessionStorage remains available after cleanup');
  }

  run().then(function(){
    var result = Object.freeze({status: failed === 0 ? 'PASS' : 'FAIL', total: total, failed: failed, messages: messages.slice()});
    window.CRIOS_RUNTIME_LIVE_ROOM_GAME_STATE_BROWSER_SMOKE_RESULTS = result;
    status.dataset.state = result.status;
    status.textContent = result.status + ' · ' + (result.total - result.failed) + '/' + result.total;
    document.title = result.status + ' · CRIOS LiveRoom game-state browser smoke';
    messages.push('RUNTIME_LIVE_ROOM_GAME_STATE_BROWSER_SMOKE_STATUS=' + result.status);
    messages.push('RUNTIME_LIVE_ROOM_GAME_STATE_BROWSER_SMOKE_TOTAL=' + result.total);
    messages.push('RUNTIME_LIVE_ROOM_GAME_STATE_BROWSER_SMOKE_FAILED=' + result.failed);
    render();
    report(result);
  }).catch(function(error){
    failed += 1;
    messages.push('FAIL uncaught ' + String(error && error.stack || error));
    var result = Object.freeze({status: 'FAIL', total: total + 1, failed: failed, messages: messages.slice()});
    window.CRIOS_RUNTIME_LIVE_ROOM_GAME_STATE_BROWSER_SMOKE_RESULTS = result;
    status.dataset.state = 'FAIL';
    status.textContent = 'FAIL · excepción no controlada';
    document.title = 'FAIL · CRIOS LiveRoom game-state browser smoke';
    render();
    cleanup();
    report(result);
  });
})();
