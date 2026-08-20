(function(){
  'use strict';

  var total = 0;
  var failed = 0;
  var messages = [];
  var output = document.getElementById('output');
  var status = document.getElementById('status');

  function render() { output.textContent = messages.join('\n'); }

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

  function waitFor(check, timeout, label) {
    var deadline = Date.now() + (timeout || 20000);
    return new Promise(function(resolve, reject){
      (function poll(){
        var value;
        try { value = check(); }
        catch (error) { reject(error); return; }
        if (value) { resolve(value); return; }
        if (Date.now() > deadline) { reject(new Error('Timed out: ' + label)); return; }
        setTimeout(poll, 25);
      })();
    });
  }

  function controlledConfig() {
    var storage = {
      progress: 'game-state-browser-progress',
      complete: 'game-state-browser-complete',
      realName: 'game-state-browser-real-name',
      characterName: 'game-state-browser-character-name',
      groupName: 'game-state-browser-group-name',
      sessionStats: 'game-state-browser-session-stats',
      sessionData: 'game-state-browser-session-data',
      pendingResult: 'game-state-browser-pending-result',
      campaignId: 'game-state-browser-campaign-id',
      campaignProgress: 'game-state-browser-campaign-progress'
    };
    return '<script>const CRIOS_CONFIG=Object.freeze({version:"1.25",runtimeCampaignMode:"published",resultsEndpoint:"controlled://game-state-browser-smoke",variantCount:36,progressSendDelayMs:0,missionReturnDelayMs:0,finalTransitionDelayMs:0,designViewport:Object.freeze({width:1366,height:768}),storage:Object.freeze(' + JSON.stringify(storage) + ')});<\/script>';
  }

  async function buildHarness() {
    var target = new URL('../index.html?source=published&campaignId=reactivacion-base-antartica&publicationId=a2-006g-controlled-publication', location.href);
    var response = await fetch('../index.html?game-state-projection-source=browser-smoke', {cache: 'no-store'});
    if (!response.ok) throw new Error('INDEX_FETCH_FAILED: ' + response.status);
    var html = await response.text();
    var base = '<base href="' + new URL('../', location.href).href + '">';
    var launchBootstrap = '<script>history.replaceState(null,"",' + JSON.stringify(target.pathname + target.search + target.hash) + ');<\/script>';
    html = html.replace('<head>', '<head>' + base + launchBootstrap);
    html = html.replace('<script src="js/config.js"></script>', controlledConfig());
    var injection = '<script src="tests/fixtures/publishable-mission-spec-fixtures.js"></script>' +
      '<script src="tests/fixtures/runtime-local-state-coherence-fixtures.js"></script>' +
      '<script>CRIOS_RUNTIME_LOCAL_STATE_COHERENCE_FIXTURES.installChildHarness(CRIOS_RUNTIME_LOCAL_STATE_COHERENCE_FIXTURES.configurations.off);<\/script>';
    html = html.replace('<script src="js/crios.js"></script>', injection + '<script src="js/crios.js"></script>');
    var frame = document.createElement('iframe');
    frame.title = 'CRIOS game-state projection harness';
    document.getElementById('harnesses').appendChild(frame);
    frame.src = './runtime-live-room-game-state-browser-shell.html?token=' + Math.random().toString(36).slice(2);
    await waitFor(function(){
      return frame.contentWindow && frame.contentWindow.location.pathname.endsWith('/tests/runtime-live-room-game-state-browser-shell.html');
    }, 20000, 'same-origin shell');
    var child = frame.contentWindow;
    child.document.open();
    child.document.write(html);
    child.document.close();
    await waitFor(function(){
      return child.CRIOS && child.__CRIOS_LOCAL_COHERENCE_STATE__;
    }, 20000, 'CRIOS bootstrap');
    var fixtureState = child.__CRIOS_LOCAL_COHERENCE_STATE__;
    await fixtureState.ready;
    await waitFor(function(){
      return child.CRIOS_DOMAIN && child.CRIOS_DOMAIN.runtimeBootstrapAdapter &&
        child.document.getElementById('groupInput') && !child.document.getElementById('groupInput').disabled;
    }, 20000, 'published campaign selector');
    child.document.getElementById('userNameInput').value = 'Persona Falsa';
    child.document.getElementById('characterNameInput').value = 'Operador Sintético';
    child.document.getElementById('groupInput').value = 'GRUPO_FALSO';
    await child.identifyUser();
    try {
      await waitFor(function(){
        return child.CRIOS.obtenerMisionesActivas().length === 4 && child.document.getElementById('mission-energy');
      }, 20000, 'published missions');
    } catch (error) {
      var activeScreen = child.document.querySelector('.screen.active');
      var diagnostics = {
        missionIds: child.CRIOS.obtenerMisionesActivas(),
        runtimeLaunch: child.CRIOS.runtimeLaunch || null,
        activeScreenId: activeScreen && activeScreen.id || null,
        groupDisabled: child.document.getElementById('groupInput').disabled,
        groupValue: child.document.getElementById('groupInput').value,
        publicationReady: Boolean(fixtureState.publication),
        referenceReady: Boolean(fixtureState.reference),
        calls: fixtureState.calls.slice(-12),
        pageerrors: fixtureState.pageerrors.slice(),
        consoleErrors: fixtureState.consoleErrors.slice(),
        warnings: fixtureState.warnings.slice(),
        storage: fixtureState.sessionStorage.snapshot()
      };
      throw new Error(error.message + ' diagnostics=' + JSON.stringify(diagnostics));
    }
    child.go('map');
    await waitFor(function(){
      return child.document.getElementById('card-energy');
    }, 5000, 'published map cards');
    return {frame: frame, child: child, fixtureState: fixtureState};
  }

  function sharedState(completedMissionIds, publicationId) {
    return {
      schemaVersion: '1.0',
      roomId: 'room-browser-smoke',
      campaignId: 'reactivacion-base-antartica',
      publicationId: publicationId || 'a2-006g-controlled-publication',
      revision: completedMissionIds.length,
      completedMissionIds: completedMissionIds.slice(),
      updatedAt: new Date(Date.parse('2026-08-18T12:00:00.000Z') + completedMissionIds.length * 60000).toISOString()
    };
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
    var harness = await buildHarness();
    var child = harness.child;
    var fixtureState = harness.fixtureState;
    var api = child.CRIOS && child.CRIOS.api;
    var doneCount = child.document.getElementById('doneCount');
    var finalButton = child.document.getElementById('finalBtn');
    var energyCard = child.document.getElementById('card-energy');
    var hangarCard = child.document.getElementById('card-hangar');

    ok(Boolean(api && typeof api.applyLiveRoomSharedGameState === 'function'), 'real game exposes narrow shared-state projection port');
    eq(child.CRIOS.obtenerMisionesActivas(), ['energy', 'greenhouse', 'ice', 'hangar'], 'real published mission order prepared');
    eq(doneCount.textContent, '0/4', 'personal game starts with zero completed missions');
    eq(finalButton.disabled, true, 'final protocol starts locked');
    ok(!energyCard.classList.contains('done'), 'energy card starts incomplete');

    var initialStorage = fixtureState.sessionStorage.snapshot();
    var crossed = api.applyLiveRoomSharedGameState(sharedState(['energy'], 'foreign-publication'));
    eq(crossed, false, 'cross-publication snapshot is rejected');
    eq(doneCount.textContent, '0/4', 'rejected snapshot does not change visible progress');

    var partial = api.applyLiveRoomSharedGameState(sharedState(['energy', 'greenhouse', 'ice']));
    eq(partial, true, 'valid shared snapshot is accepted by the real game');
    eq(doneCount.textContent, '3/4', 'map displays union of three shared completions');
    ok(energyCard.classList.contains('done'), 'shared energy completion marks its real map card');
    ok(!hangarCard.classList.contains('done'), 'unfinished hangar card remains incomplete');
    eq(finalButton.disabled, true, 'partial shared progress keeps final protocol locked');
    eq(fixtureState.sessionStorage.snapshot(), initialStorage, 'shared projection writes nothing into personal session storage');

    var complete = api.applyLiveRoomSharedGameState(sharedState(['energy', 'greenhouse', 'ice', 'hangar']));
    eq(complete, true, 'complete shared snapshot is accepted');
    eq(doneCount.textContent, '4/4', 'real map displays full shared completion');
    eq(finalButton.disabled, false, 'full shared completion unlocks final protocol');
    eq(fixtureState.sessionStorage.snapshot(), initialStorage, 'full shared projection still leaves personal storage unchanged');

    var cleared = api.applyLiveRoomSharedGameState(null);
    eq(cleared, true, 'terminal clear is accepted');
    eq(doneCount.textContent, '0/4', 'terminal clear restores personal-only visible progress');
    eq(finalButton.disabled, true, 'terminal clear relocks final protocol without personal progress');
    ok(!energyCard.classList.contains('done'), 'terminal clear removes shared card projection');
    eq(fixtureState.sessionStorage.snapshot(), initialStorage, 'terminal clear leaves personal storage unchanged');
    eq(fixtureState.pageerrors.length, 0, 'real game produced no page errors');
    eq(fixtureState.consoleErrors.length, 0, 'real game produced no console errors');
    eq(fixtureState.warnings.length, 0, 'real game produced no warnings');
    harness.frame.remove();
  }

  run().then(function(){
    var result = Object.freeze({status: failed === 0 ? 'PASS' : 'FAIL', total: total, failed: failed, messages: messages.slice()});
    window.CRIOS_RUNTIME_LIVE_ROOM_GAME_STATE_GAME_PROJECTION_BROWSER_SMOKE_RESULTS = result;
    status.dataset.state = result.status;
    status.textContent = result.status + ' · ' + (result.total - result.failed) + '/' + result.total;
    document.title = result.status + ' · CRIOS game-state projection browser smoke';
    messages.push('RUNTIME_LIVE_ROOM_GAME_STATE_GAME_PROJECTION_BROWSER_SMOKE_STATUS=' + result.status);
    messages.push('RUNTIME_LIVE_ROOM_GAME_STATE_GAME_PROJECTION_BROWSER_SMOKE_TOTAL=' + result.total);
    messages.push('RUNTIME_LIVE_ROOM_GAME_STATE_GAME_PROJECTION_BROWSER_SMOKE_FAILED=' + result.failed);
    render();
    report(result);
  }).catch(function(error){
    failed += 1;
    messages.push('FAIL uncaught ' + String(error && error.stack || error));
    var result = Object.freeze({status: 'FAIL', total: total + 1, failed: failed, messages: messages.slice()});
    window.CRIOS_RUNTIME_LIVE_ROOM_GAME_STATE_GAME_PROJECTION_BROWSER_SMOKE_RESULTS = result;
    status.dataset.state = 'FAIL';
    status.textContent = 'FAIL · excepción no controlada';
    document.title = 'FAIL · CRIOS game-state projection browser smoke';
    render();
    report(result);
  });
})();
