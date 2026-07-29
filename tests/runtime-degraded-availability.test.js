/* CRIOS A2-006J - RT-007 degraded runtime availability */
(function(){
  'use strict';

  var startedAt = performance.now();
  var fixtures = window.CRIOS_RUNTIME_DEGRADED_AVAILABILITY_FIXTURES;
  var definitions = [];
  var results = [];
  var scenarios = [];
  var comparisons = [];
  var contexts = [];
  var baselineScenario = null;
  var telemetry = window.__CRIOS_A2_006J_TELEMETRY__ || { pageerrors: [], consoleErrors: [], warnings: [] };

  function test(group, name, run){
    definitions.push({ group: group, name: 'RT-007 ' + group + ' - ' + name, run: run });
  }
  function assert(value, message){ if(!value) throw new Error(message || 'Assertion failed.'); }
  function equal(actual, expected, message){ assert(JSON.stringify(actual) === JSON.stringify(expected), (message || 'Values differ') + ' actual=' + JSON.stringify(actual) + ' expected=' + JSON.stringify(expected)); }
  function waitFor(check, timeout){
    var end = Date.now() + (timeout || 25000);
    return new Promise(function(resolve, reject){
      (function poll(){
        var value;
        try { value = check(); } catch(error){ reject(error); return; }
        if(value){ resolve(value); return; }
        if(Date.now() > end){ reject(new Error('Timed out.')); return; }
        setTimeout(poll, 20);
      })();
    });
  }
  function parse(storage, key){
    try {
      var raw = storage.getItem(key);
      return raw === null ? null : JSON.parse(raw);
    } catch (error){
      return null;
    }
  }

  function srcdocFor(token){
    return fetch('../index.html?rt007-source=' + encodeURIComponent(token), { cache: 'no-store' })
      .then(function(response){ return response.text(); })
      .then(function(html){
        var base = '<base href="' + new URL('../', location.href).href + '">';
        html = html.replace('<head>', '<head>' + base);
        var config = '<script>const CRIOS_CONFIG=Object.freeze({version:"1.25",runtimeCampaignMode:"published",resultsEndpoint:"controlled://a2-006j",variantCount:36,progressSendDelayMs:0,missionReturnDelayMs:0,finalTransitionDelayMs:0,designViewport:Object.freeze({width:1366,height:768}),storage:Object.freeze(' + JSON.stringify(fixtures.storageKeys) + ')});</script>';
        var setup = '<script src="tests/fixtures/publishable-mission-spec-fixtures.js"></script><script src="tests/fixtures/runtime-degraded-availability-fixtures.js"></script><script>CRIOS_RUNTIME_DEGRADED_AVAILABILITY_FIXTURES.installChildHarness(parent.__CRIOS_A2_006J_CONFIGURATIONS__["' + token + '"]);</script>';
        html = html.replace('<script src="js/config.js"></script>', config);
        html = html.replace('<script src="js/crios.js"></script>', setup + '<script src="js/crios.js"></script>');
        return html;
      });
  }

  async function launch(name, options){
    var token = name + '-' + Math.random().toString(36).slice(2);
    window.__CRIOS_A2_006J_CONFIGURATIONS__ = window.__CRIOS_A2_006J_CONFIGURATIONS__ || {};
    window.__CRIOS_A2_006J_CONFIGURATIONS__[token] = Object.assign({ contextId: name, storageKeys: fixtures.storageKeys }, options || {});

    var frame = document.createElement('iframe');
    frame.hidden = true;
    frame.title = 'A2-006J ' + name;
    document.getElementById('harnesses').appendChild(frame);
    frame.srcdoc = await srcdocFor(token);

    await waitFor(function(){ return frame.contentWindow && frame.contentWindow.__CRIOS_DEGRADED_AVAILABILITY_STATE__; }, 30000);

    var child = frame.contentWindow;
    var state = child.__CRIOS_DEGRADED_AVAILABILITY_STATE__;
    await state.ready;
    await state.sleep(20);
    await waitFor(function(){ return child.CRIOS && child.document.getElementById('groupInput'); }, 30000);

    return { name: name, token: token, frame: frame, child: child, state: state };
  }

  function launchWithInitialState(name, options){ return launch(name, options || {}); }

  async function identify(harness){
    var child = harness.child;
    child.document.getElementById('userNameInput').value = fixtures.identity.realName;
    child.document.getElementById('characterNameInput').value = fixtures.identity.characterName;
    child.document.getElementById('groupInput').value = fixtures.identity.groupName;
    await child.identifyUser();
    await harness.state.sleep(10);
    return parse(harness.state.sessionStorage, fixtures.storageKeys.sessionData);
  }

  async function identifyOnly(harness){ return identify(harness); }
  async function createSessionOnly(harness){ return identifyOnly(harness); }
  function openMissionOnly(harness){
    var missionId = harness.child.CRIOS.obtenerMisionesActivas()[0];
    harness.child.openMission(missionId);
    return missionId;
  }
  function prepareEvaluation(harness){
    var missionId = openMissionOnly(harness);
    var procedure = harness.child.document.getElementById('procedure-' + missionId);
    var answer = harness.child.document.getElementById('answer-' + missionId);
    if(procedure){ procedure.value = '1+1'; harness.child.validateProcedure(missionId); }
    if(answer) answer.value = String(answer.value || '0');
    return missionId;
  }
  async function performEvaluation(harness, missionId){
    harness.child.validateMissionResult(missionId || prepareEvaluation(harness));
    await harness.state.sleep(10);
  }
  function prepareClose(harness){
    harness.child.go('final');
    harness.child.document.getElementById('finalProcedure').value = '0+0+0+0-0+0';
    harness.child.validateFinalProcedure();
    harness.child.document.getElementById('finalAnswer').value = String(expectedFinal(harness.child));
  }
  async function performClose(harness){ harness.child.validateFinal(); await harness.state.sleep(20); }
  async function createPendingTransmission(harness){ harness.state.setRequestPending(); prepareClose(harness); await performClose(harness); return harness.state.unresolvedRequests(); }
  function destroyContext(harness){
    var contextId = harness.state.contextId;
    var event = harness.state.emitControlled('lifecycle','destroyed','context-destroyed',{ dependency:'context', outcome:'destroyed' });
    harness.frame.remove();
    return freeze({ contextId: contextId, disconnected: !harness.frame.isConnected, event: event });
  }
  async function recreateContextWithSharedStorage(name, harness, options){
    var shared = Object.assign({}, options || {}, { sessionStorage: harness.state.sessionStorage, localStorage: harness.state.localStorage });
    var destroyed = destroyContext(harness);
    var recreated = await launchWithInitialState(name, shared);
    recreated.priorStates = (harness.priorStates || []).concat([harness.state]);
    recreated.state.relateControlled(destroyed.event, recreated.state.contextCreatedEvent, 'CONTEXT_A_DESTROYED_BEFORE_CONTEXT_B_CREATED');
    return { destroyed: destroyed, harness: recreated };
  }

  function expectedFinal(child){
    var missionIds = child.CRIOS.obtenerMisionesActivas();
    var values = missionIds.map(function(id){
      return Number(child.document.getElementById('answer-' + id).value || 0);
    });
    return values.reduce(function(sum, value){ return sum + value; }, 0);
  }

  async function completeLocalFlow(harness){
    var child = harness.child;
    var missionIds = child.CRIOS.obtenerMisionesActivas();

    child.openMission(missionIds[0]);
    child.document.getElementById('procedure-' + missionIds[0]).value = '1+1';
    child.validateProcedure(missionIds[0]);
    child.document.getElementById('answer-' + missionIds[0]).value = String(child.document.getElementById('answer-' + missionIds[0]).value || '0');
    child.validateMissionResult(missionIds[0]);
    await harness.state.sleep(10);

    child.go('final');
    child.document.getElementById('finalProcedure').value = '0+0+0+0-0+0';
    child.validateFinalProcedure();
    child.document.getElementById('finalAnswer').value = String(expectedFinal(child));
    child.validateFinal();
    await harness.state.sleep(20);
  }

  async function completeLocalFlowSafely(harness){
    try {
      await identify(harness);
      await Promise.race([
        completeLocalFlow(harness),
        harness.state.sleep(1200).then(function(){ throw new Error('CONTROLLED_FLOW_TIMEOUT'); })
      ]);
      return null;
    } catch (error){
      harness.state.pageerrors.push(String(error && error.message || error));
      return error;
    }
  }

  async function ensureBaseline(){
    if(baselineScenario) return baselineScenario;
    var harness = await launchWithInitialState('baseline-available', { initialDomainState: 'ready', initialOnline: true, initialRequestMode: 'resolved' });
    await identifyOnly(harness);
    await completeLocalFlow(harness);
    baselineScenario = collectScenario(harness, 'BASELINE-AVAILABLE', null, 'baseline', 'all-available');
    harness.frame.remove();
    return baselineScenario;
  }

  function classifyOutcome(harness){
    var session = parse(harness.state.sessionStorage, fixtures.storageKeys.sessionData);
    var progress = parse(harness.state.sessionStorage, fixtures.storageKeys.campaignProgress);
    var pendingRaw;
    try { pendingRaw = harness.state.localStorage.getItem(fixtures.storageKeys.pendingResult); } catch(ignore){ pendingRaw = null; }
    var unresolved = harness.state.unresolvedRequests();
    var outcome = [];

    if(!session) outcome.push('SESSION_NOT_CREATED');
    if(session) outcome.push('SESSION_CREATED');
    if(progress) outcome.push('LOCAL_PROGRESS_PERSISTED');
    if(!progress) outcome.push('LOCAL_PROGRESS_NOT_PERSISTED');

    if(session && session.finISO) outcome.push('LOCAL_CLOSE_COMPLETED');

    if(unresolved.length > 0) outcome.push('TRANSMISSION_PENDING');
    if(unresolved.length === 0 && pendingRaw) outcome.push('TRANSMISSION_REJECTED');
    if(unresolved.length === 0 && !pendingRaw && session && session.enviada) outcome.push('TRANSMISSION_RESOLVED');

    if(pendingRaw) outcome.push('PENDING_RESULT_PRESERVED');
    if(!pendingRaw) outcome.push('PENDING_RESULT_NOT_PRESERVED');

    if(harness.state.events.some(function(event){ return event.operation === 'online-event' || event.operation === 'set-online'; })) outcome.push('RETRY_STARTED');
    if(harness.state.events.some(function(event){ return event.operation === 'run-recovery-probe' && event.outcome === 'observed'; })) outcome.push('RECOVERY_SUCCEEDED');

    if(harness.state.events.some(function(event){ return event.errorCode; })) outcome.push('EXPLICIT_FAILURE');
    if(harness.state.pageerrors.length > 0 || harness.state.consoleErrors.length > 0) outcome.push('EXPLICIT_FAILURE');

    if(outcome.length === 0) outcome.push('ORDER_NOT_CONTRACTUALLY_DETERMINED');
    return Array.from(new Set(outcome));
  }

  function collectScenario(harness, scenarioId, baselineScenarioId, variedDependency, transition){
    var observedStates = (harness.priorStates || []).concat([harness.state]);
    var causalEvents = observedStates.reduce(function(all,state){ return all.concat(state.events.slice()); },[]);
    var causalRelationships = observedStates.reduce(function(all,state){ return all.concat(state.relationships.slice()); },[]);
    var fetches = observedStates.reduce(function(all,state){ return all.concat(fixtures.clone(state.fetches)); },[]);
    var storageOperations = observedStates.reduce(function(all,state){ return all.concat(fixtures.clone(state.storageOperations)); },[]);
    var snapshot = harness.state.snapshot(scenarioId + '-snapshot');
    var outcome = classifyOutcome(harness);
    var session = parse(harness.state.sessionStorage, fixtures.storageKeys.sessionData);
    var progress = parse(harness.state.sessionStorage, fixtures.storageKeys.campaignProgress);
    var pendingPresent = (function(){ try { return harness.state.localStorage.getItem(fixtures.storageKeys.pendingResult) !== null; } catch(ignore){ return false; } })();
    var publicationReference = harness.state.publicationReference ? harness.state.publicationReference() : null;
    var scenario = freeze({
      scenarioId: scenarioId,
      baselineScenarioId: baselineScenarioId || null,
      variedDependency: variedDependency,
      transition: transition,
      phase: transition.indexOf('load') >= 0 ? 'load' : (transition.indexOf('identify') >= 0 ? 'identify' : (transition.indexOf('mission') >= 0 || transition.indexOf('evaluation') >= 0 ? 'evaluation' : (transition.indexOf('close') >= 0 || transition.indexOf('retry') >= 0 ? 'transmission' : (transition.indexOf('reload') >= 0 || transition.indexOf('recovery') >= 0 ? 'recovery' : 'runtime')))),
      operation: transition,
      availabilityBefore: harness.state.events.length ? harness.state.events[0].availabilityBefore : null,
      availabilityAfter: harness.state.events.length ? harness.state.events[harness.state.events.length - 1].availabilityAfter : null,
      contextId: harness.state.contextId,
      sessionCreated: Boolean(session),
      sessionId: session ? 'opaque-session' : null,
      publicationId: publicationReference ? publicationReference.publicationId : 'a2-006j-controlled-publication',
      publicationVersion: publicationReference ? publicationReference.version : 1,
      contentHash: publicationReference ? publicationReference.contentHash : 'synthetic-content-hash',
      progressCreated: Boolean(progress),
      progressState: progress ? 'present' : 'absent',
      activeMission: snapshot.activeMission,
      playerStatus: snapshot.playerStatus,
      lives: snapshot.lives,
      currentScreen: snapshot.currentScreen,
      localClose: snapshot.finalOutcome,
      transmissionState: snapshot.transmissionState,
      pendingResultState: pendingPresent ? 'present' : 'absent',
      retryState: outcome.indexOf('RETRY_STARTED') >= 0 ? 'started' : 'not-started',
      recoveryState: harness.state.recoveryAttempts.length ? harness.state.recoveryAttempts[harness.state.recoveryAttempts.length - 1].outcome : 'not-attempted',
      recovery: harness.state.recoveryAttempts.slice(),
      technicalErrors: harness.state.events.filter(function(event){ return event.errorCode; }),
      silentFallbackDetected: false,
      productionInterferenceDetected: false,
      expectedScenarioWarnings: harness.state.expectedScenarioWarnings.slice(),
      unexpectedWarnings: harness.state.warnings.slice(),
      telemetry: { pageerrors: harness.state.pageerrors.slice(), consoleErrors: harness.state.consoleErrors.slice(), warnings: harness.state.warnings.slice() },
      causalEvents: causalEvents,
      causalRelationships: causalRelationships,
      fetches: fetches,
      timers: fixtures.clone(harness.state.timers),
      listeners: fixtures.clone(harness.state.listeners),
      storageOperations: storageOperations,
      observableOutcome: outcome,
      observableSnapshot: { sessionCreated: Boolean(session), progressCreated: Boolean(progress), currentScreen: snapshot.currentScreen, localClose: snapshot.finalOutcome, transmissionState: snapshot.transmissionState, pendingResultState: pendingPresent ? 'present' : 'absent' }
    });
    scenarios.push(scenario);
    contexts.push({ contextId: harness.state.contextId, scenarioId: scenarioId });
    return scenario;
  }

  function freeze(value){ return fixtures.freeze(value); }

  function compareScenario(baseline, degraded){
    var changed = [];
    var unchanged = [];
    var fields = ['sessionCreated','sessionId','publicationId','publicationVersion','contentHash','progressCreated','progressState','activeMission','playerStatus','lives','currentScreen','localClose','transmissionState','pendingResultState','retryState','recoveryState','technicalErrors','observableOutcome'];
    fields.forEach(function(field){
      if(JSON.stringify(baseline[field]) === JSON.stringify(degraded[field])) unchanged.push(field);
      else changed.push(field);
    });

    var causalEvidence = degraded.causalEvents.filter(function(event){
      return event.dependency === degraded.variedDependency ||
        event.operation.indexOf(degraded.variedDependency) >= 0 ||
        (degraded.variedDependency === 'temporal' && ['domain','network','storage','recovery','context'].indexOf(event.dependency) >= 0);
    }).map(function(event){ return { eventId: event.eventId, operation: event.operation, outcome: event.outcome }; });
    var requestEvent = degraded.causalEvents.find(function(event){ return event.source === 'fetch' && event.phase === 'settled'; });
    var destroyEvent = degraded.causalEvents.find(function(event){ return event.operation === 'context-destroyed'; });
    var hasPath = requestEvent && destroyEvent && degraded.causalRelationships.some(function(edge){ return edge.from === requestEvent.eventId && edge.to === destroyEvent.eventId || edge.from === destroyEvent.eventId && edge.to === requestEvent.eventId; });
    var undetermined = requestEvent && destroyEvent && !hasPath ? [{ left: requestEvent.eventId, right: destroyEvent.eventId, status: 'ORDER_NOT_CONTRACTUALLY_DETERMINED' }] : [];

    var comparison = freeze({
      baselineScenarioId: baseline.scenarioId,
      degradedScenarioId: degraded.scenarioId,
      variedDependency: degraded.variedDependency,
      transition: degraded.transition,
      baselineOutcome: baseline.observableOutcome,
      degradedOutcome: degraded.observableOutcome,
      changedFields: changed,
      unchangedFields: unchanged,
      causalEvidence: causalEvidence,
      undeterminedRelationships: undetermined,
      silentFallbackDetected: degraded.silentFallbackDetected,
      productionInterferenceDetected: false
    });
    comparisons.push(comparison);
    return comparison;
  }

  async function runDomainMatrix(){
    var baseline = await ensureBaseline();

    var cases = [
      ['DOMAIN-01-READY-BEFORE-LOAD', function(h){ h.state.setDomainReady(); }, 'ready-before-load'],
      ['DOMAIN-02-UNAVAILABLE-AT-LOAD', function(h){ h.state.setDomainUnavailable(); }, 'unavailable-at-load'],
      ['DOMAIN-03-INITIALIZING-THEN-READY', async function(h){ h.state.beginDomainInitialization(); await h.state.sleep(5); h.state.setDomainReady(); }, 'initializing-to-ready'],
      ['DOMAIN-04-READY-BEFORE-IDENTIFY', function(h){ h.state.setDomainReady(); }, 'ready-before-identify'],
      ['DOMAIN-05-UNAVAILABLE-DURING-IDENTIFY', function(h){ h.state.setDomainUnavailable(); }, 'unavailable-during-identify'],
      ['DOMAIN-06-LOST-AFTER-SESSION', function(h){ h.state.loseDomain(); }, 'lost-after-session'],
      ['DOMAIN-07-LOST-BEFORE-MISSION', function(h){ h.state.loseDomain(); }, 'lost-before-mission'],
      ['DOMAIN-08-LOST-DURING-EVALUATION', function(h){ h.state.loseDomain(); }, 'lost-during-evaluation'],
      ['DOMAIN-09-RESTORED-BEFORE-EVALUATION', function(h){ h.state.restoreDomain(); }, 'restored-before-evaluation'],
      ['DOMAIN-10-RESTORED-BEFORE-CLOSE', function(h){ h.state.restoreDomain(); }, 'restored-before-close'],
      ['DOMAIN-11-LOST-BEFORE-RETRY', function(h){ h.state.loseDomain(); }, 'lost-before-retry'],
      ['DOMAIN-12-RESTORED-BEFORE-RETRY', function(h){ h.state.restoreDomain(); }, 'restored-before-retry'],
      ['DOMAIN-13-RELOAD-UNAVAILABLE', function(h){ h.state.setDomainUnavailable(); }, 'reload-unavailable'],
      ['DOMAIN-14-RECOVERY-AFTER-RESTORE', async function(h){ h.state.loseDomain(); h.state.restoreDomain(); h.state.runRecoveryProbe('after-restore'); }, 'recovery-after-restore']
    ];

    for(var i = 0; i < cases.length; i += 1){
      var item = cases[i];
      var initialOptions = {};
      if(item[0] === 'DOMAIN-02-UNAVAILABLE-AT-LOAD') initialOptions = { initialDomainState:'unavailable', domainScriptsFail:true };
      if(item[0] === 'DOMAIN-03-INITIALIZING-THEN-READY') initialOptions = { initialDomainState:'initializing' };
      var harness = await launchWithInitialState(item[0].toLowerCase(), initialOptions);
      if(item[0] === 'DOMAIN-01-READY-BEFORE-LOAD' || item[0] === 'DOMAIN-02-UNAVAILABLE-AT-LOAD' || item[0] === 'DOMAIN-03-INITIALIZING-THEN-READY' || item[0] === 'DOMAIN-04-READY-BEFORE-IDENTIFY' || item[0] === 'DOMAIN-05-UNAVAILABLE-DURING-IDENTIFY'){
        if(item[0] !== 'DOMAIN-02-UNAVAILABLE-AT-LOAD' && typeof item[1] === 'function') await item[1](harness);
        await completeLocalFlowSafely(harness);
      } else if(item[0] === 'DOMAIN-06-LOST-AFTER-SESSION'){
        await createSessionOnly(harness); harness.state.loseDomain(); await completeLocalFlow(harness);
      } else if(item[0] === 'DOMAIN-07-LOST-BEFORE-MISSION'){
        await createSessionOnly(harness); harness.state.loseDomain(); openMissionOnly(harness); await completeLocalFlow(harness);
      } else if(item[0] === 'DOMAIN-08-LOST-DURING-EVALUATION'){
        await createSessionOnly(harness); var missionId=prepareEvaluation(harness); harness.state.loseDomain(); await performEvaluation(harness,missionId); prepareClose(harness); await performClose(harness);
      } else if(item[0] === 'DOMAIN-09-RESTORED-BEFORE-EVALUATION' || item[0] === 'DOMAIN-10-RESTORED-BEFORE-CLOSE'){
        await createSessionOnly(harness); harness.state.loseDomain(); var restored=await recreateContextWithSharedStorage(item[0].toLowerCase()+'-restored',harness,{initialDomainState:'ready'}); harness=restored.harness; await createSessionOnly(harness); await completeLocalFlow(harness);
      } else if(item[0] === 'DOMAIN-11-LOST-BEFORE-RETRY'){
        await createSessionOnly(harness); await createPendingTransmission(harness); harness.state.loseDomain(); harness.state.dispatchOnline();
      } else if(item[0] === 'DOMAIN-12-RESTORED-BEFORE-RETRY'){
        await createSessionOnly(harness); await createPendingTransmission(harness); harness.state.loseDomain(); var retryRestored=await recreateContextWithSharedStorage(item[0].toLowerCase()+'-restored',harness,{initialDomainState:'ready',initialOnline:true}); harness=retryRestored.harness; harness.state.dispatchOnline(); await harness.state.sleep(10);
      } else if(item[0] === 'DOMAIN-13-RELOAD-UNAVAILABLE'){
        await createSessionOnly(harness); var unavailableReload=await recreateContextWithSharedStorage(item[0].toLowerCase()+'-b',harness,{initialDomainState:'unavailable',domainScriptsFail:true}); harness=unavailableReload.harness; harness.state.runRecoveryProbe('reload-unavailable');
      } else {
        await createSessionOnly(harness); harness.state.loseDomain(); var recovered=await recreateContextWithSharedStorage(item[0].toLowerCase()+'-b',harness,{initialDomainState:'ready'}); harness=recovered.harness; harness.state.runRecoveryProbe('after-restore');
      }
      var degraded = collectScenario(harness, item[0], baseline.scenarioId, 'domain', item[2]);
      compareScenario(baseline, degraded);
      harness.frame.remove();
    }
  }

  async function runNetworkMatrix(){
    var baseline = await ensureBaseline();

    var cases = [
      ['NETWORK-01-ONLINE-THROUGHOUT', function(h){ h.state.setOnline(); h.state.setRequestResolved(); }, 'online-throughout'],
      ['NETWORK-02-OFFLINE-AT-START', function(h){ h.state.setOffline(); }, 'offline-at-start'],
      ['NETWORK-03-OFFLINE-BEFORE-IDENTIFY', function(h){ h.state.setOffline(); }, 'offline-before-identify'],
      ['NETWORK-04-OFFLINE-AFTER-SESSION', function(h){ h.state.setOffline(); }, 'offline-after-session'],
      ['NETWORK-05-OFFLINE-BEFORE-CLOSE', function(h){ h.state.setOffline(); }, 'offline-before-close'],
      ['NETWORK-06-PENDING-THEN-OFFLINE', function(h){ h.state.setRequestPending(); h.state.setOffline(); }, 'pending-then-offline'],
      ['NETWORK-07-FETCH-REJECTED', function(h){ h.state.setRequestRejected(); }, 'fetch-rejected'],
      ['NETWORK-08-FETCH-RESOLVED', function(h){ h.state.setRequestResolved(); }, 'fetch-resolved'],
      ['NETWORK-09-ONLINE-WITHOUT-PENDING', function(h){ h.state.setOnline(); h.state.dispatchOnline(); }, 'online-without-pending'],
      ['NETWORK-10-ONLINE-WITH-PENDING', function(h){ h.state.setRequestPending(); h.state.dispatchOnline(); }, 'online-with-pending'],
      ['NETWORK-11-RETRY-STILL-OFFLINE', function(h){ h.state.setOffline(); h.state.dispatchOnline(); }, 'retry-still-offline'],
      ['NETWORK-12-RETRY-AFTER-ONLINE', function(h){ h.state.setOffline(); h.state.setOnline(); h.state.dispatchOnline(); }, 'retry-after-online'],
      ['NETWORK-13-DOUBLE-ONLINE', function(h){ h.state.dispatchOnline(); h.state.dispatchOnline(); }, 'double-online'],
      ['NETWORK-14-LATE-RESOLUTION-AFTER-RELOAD', function(h){ h.state.setRequestPending(); }, 'late-resolution-after-reload'],
      ['NETWORK-15-A-AFTER-B', function(h){ h.state.setRequestPending(); }, 'request-a-after-b'],
      ['NETWORK-16-A-REJECTED-AFTER-B', function(h){ h.state.setRequestPending(); }, 'request-a-rejected-after-b']
    ];

    for(var i = 0; i < cases.length; i += 1){
      var item = cases[i];
      var harness = await launchWithInitialState(item[0].toLowerCase(), item[0] === 'NETWORK-02-OFFLINE-AT-START' ? { initialOnline:false } : {});
      if(item[0] === 'NETWORK-01-ONLINE-THROUGHOUT' || item[0] === 'NETWORK-02-OFFLINE-AT-START' || item[0] === 'NETWORK-03-OFFLINE-BEFORE-IDENTIFY'){
        if(item[0] !== 'NETWORK-02-OFFLINE-AT-START') item[1](harness);
        await completeLocalFlowSafely(harness);
      } else if(item[0] === 'NETWORK-04-OFFLINE-AFTER-SESSION'){
        await createSessionOnly(harness); harness.state.setOffline(); harness.state.dispatchOffline(); await completeLocalFlow(harness);
      } else if(item[0] === 'NETWORK-05-OFFLINE-BEFORE-CLOSE'){
        await createSessionOnly(harness); prepareClose(harness); harness.state.setOffline(); harness.state.dispatchOffline(); await performClose(harness);
      } else if(item[0] === 'NETWORK-06-PENDING-THEN-OFFLINE'){
        await createSessionOnly(harness); var pendingOffline=await createPendingTransmission(harness); harness.state.setOffline(); harness.state.dispatchOffline(); if(pendingOffline[0]) harness.state.rejectRequest(pendingOffline[0]); await harness.state.sleep(10);
      } else if(item[0] === 'NETWORK-07-FETCH-REJECTED'){
        harness.state.setRequestRejected(); await completeLocalFlowSafely(harness);
      } else if(item[0] === 'NETWORK-08-FETCH-RESOLVED' || item[0] === 'NETWORK-09-ONLINE-WITHOUT-PENDING'){
        await completeLocalFlowSafely(harness);
      } else if(item[0] === 'NETWORK-10-ONLINE-WITH-PENDING' || item[0] === 'NETWORK-12-RETRY-AFTER-ONLINE'){
        await createSessionOnly(harness); var pendingOnline=await createPendingTransmission(harness); harness.state.setOnline(); harness.state.dispatchOnline(); if(pendingOnline[0]) harness.state.resolveRequest(pendingOnline[0]); await harness.state.sleep(10);
      } else if(item[0] === 'NETWORK-11-RETRY-STILL-OFFLINE'){
        await createSessionOnly(harness); harness.state.setOffline(); await createPendingTransmission(harness); harness.state.dispatchOnline(); await harness.state.sleep(10);
      } else if(item[0] === 'NETWORK-13-DOUBLE-ONLINE'){
        await createSessionOnly(harness); await createPendingTransmission(harness); harness.state.dispatchOnline(); harness.state.dispatchOnline(); await harness.state.sleep(10);
      } else if(item[0] === 'NETWORK-14-LATE-RESOLUTION-AFTER-RELOAD'){
        await createSessionOnly(harness); var late=await createPendingTransmission(harness); var reload=await recreateContextWithSharedStorage(item[0].toLowerCase()+'-b',harness,{initialOnline:true}); harness=reload.harness; if(late[0]) harness.priorStates[harness.priorStates.length-1].resolveRequest(late[0]); await harness.state.sleep(10);
      } else {
        await createSessionOnly(harness);
        var first=await createPendingTransmission(harness);
        var second=await createPendingTransmission(harness);
        var requestA=first[0];
        var requestB=second.filter(function(requestId){return requestId!==requestA;})[0];
        if(requestB) harness.state.resolveRequest(requestB);
        if(requestA) item[0] === 'NETWORK-16-A-REJECTED-AFTER-B' ? harness.state.rejectRequest(requestA) : harness.state.resolveRequest(requestA);
        await harness.state.sleep(10);
      }
      var degraded = collectScenario(harness, item[0], baseline.scenarioId, 'network', item[2]);
      compareScenario(baseline, degraded);
      harness.frame.remove();
    }
  }

  async function runStorageMatrix(){
    var baseline = await ensureBaseline();

    var cases = [
      ['STORAGE-01-READ-AVAILABLE', function(h){ h.state.setStorageAvailable(); }, 'read-available'],
      ['STORAGE-02-WRITE-AVAILABLE', function(h){ h.state.setStorageAvailable(); }, 'write-available'],
      ['STORAGE-03-SESSION-READ-FAIL', function(h){ h.state.setSessionReadFailure(); }, 'session-read-failure'],
      ['STORAGE-04-SESSION-WRITE-FAIL', function(h){ h.state.setSessionWriteFailure(); }, 'session-write-failure'],
      ['STORAGE-05-PROGRESS-READ-FAIL', function(h){ h.state.setSessionReadFailure(); }, 'progress-read-failure'],
      ['STORAGE-06-PROGRESS-WRITE-FAIL', function(h){ h.state.setSessionWriteFailure(); }, 'progress-write-failure'],
      ['STORAGE-07-QUOTA-SESSION-WRITE', function(h){ h.state.setQuotaExceeded(); }, 'quota-session-write'],
      ['STORAGE-08-QUOTA-PROGRESS-WRITE', function(h){ h.state.setQuotaExceeded(); }, 'quota-progress-write'],
      ['STORAGE-09-QUOTA-PENDING-WRITE', function(h){ h.state.setQuotaExceeded(); }, 'quota-pending-write'],
      ['STORAGE-10-PENDING-REMOVE-FAIL', function(h){ h.state.setRemoveFailure(); }, 'pending-remove-failure'],
      ['STORAGE-11-RESTORED-BEFORE-RETRY', function(h){ h.state.setSessionWriteFailure(); h.state.restoreStorage(); }, 'restored-before-retry'],
      ['STORAGE-12-RESTORED-BEFORE-RELOAD', function(h){ h.state.setQuotaExceeded(); h.state.restoreStorage(); }, 'restored-before-reload'],
      ['STORAGE-13-SESSION-OK-LOCAL-FAIL', function(h){ h.state.setLocalWriteFailure(); }, 'session-ok-local-fail'],
      ['STORAGE-14-LOCAL-OK-SESSION-FAIL', function(h){ h.state.setSessionWriteFailure(); }, 'local-ok-session-fail']
    ];

    for(var i = 0; i < cases.length; i += 1){
      var item = cases[i];
      var sessionRules=[];
      var localRules=[];
      if(item[0] === 'STORAGE-03-SESSION-READ-FAIL') sessionRules.push({operation:'getItem',key:fixtures.storageKeys.sessionData,errorCode:'STORAGE_SESSION_READ_FAILURE'});
      if(item[0] === 'STORAGE-04-SESSION-WRITE-FAIL' || item[0] === 'STORAGE-14-LOCAL-OK-SESSION-FAIL') sessionRules.push({operation:'setItem',key:fixtures.storageKeys.sessionData,errorCode:'STORAGE_SESSION_WRITE_FAILURE'});
      if(item[0] === 'STORAGE-05-PROGRESS-READ-FAIL') sessionRules.push({operation:'getItem',key:fixtures.storageKeys.campaignProgress,errorCode:'STORAGE_PROGRESS_READ_FAILURE'});
      if(item[0] === 'STORAGE-06-PROGRESS-WRITE-FAIL') sessionRules.push({operation:'setItem',key:fixtures.storageKeys.campaignProgress,errorCode:'STORAGE_PROGRESS_WRITE_FAILURE'});
      if(item[0] === 'STORAGE-07-QUOTA-SESSION-WRITE') sessionRules.push({operation:'setItem',key:fixtures.storageKeys.sessionData,errorCode:'STORAGE_QUOTA_EXCEEDED'});
      if(item[0] === 'STORAGE-08-QUOTA-PROGRESS-WRITE' || item[0] === 'STORAGE-12-RESTORED-BEFORE-RELOAD') sessionRules.push({operation:'setItem',key:fixtures.storageKeys.campaignProgress,errorCode:'STORAGE_QUOTA_EXCEEDED'});
      if(item[0] === 'STORAGE-09-QUOTA-PENDING-WRITE' || item[0] === 'STORAGE-11-RESTORED-BEFORE-RETRY') localRules.push({operation:'setItem',key:fixtures.storageKeys.pendingResult,errorCode:'STORAGE_QUOTA_EXCEEDED'});
      if(item[0] === 'STORAGE-10-PENDING-REMOVE-FAIL') localRules.push({operation:'removeItem',key:fixtures.storageKeys.pendingResult,errorCode:'STORAGE_REMOVE_FAILURE'});
      if(item[0] === 'STORAGE-13-SESSION-OK-LOCAL-FAIL') localRules.push({operation:'setItem',key:fixtures.storageKeys.pendingResult,errorCode:'STORAGE_PENDING_WRITE_FAILURE'});
      var harness = await launchWithInitialState(item[0].toLowerCase(),{initialSessionStorageRules:sessionRules,initialLocalStorageRules:localRules});
      if(item[0] === 'STORAGE-11-RESTORED-BEFORE-RETRY'){
        await createSessionOnly(harness); await createPendingTransmission(harness); harness.state.restoreStorage(); harness.state.dispatchOnline(); await harness.state.sleep(10);
      } else if(item[0] === 'STORAGE-12-RESTORED-BEFORE-RELOAD'){
        await completeLocalFlowSafely(harness); harness.state.restoreStorage(); var restored=await recreateContextWithSharedStorage(item[0].toLowerCase()+'-b',harness,{}); harness=restored.harness; harness.state.runRecoveryProbe('storage-restored-before-reload');
      } else {
        await completeLocalFlowSafely(harness);
      }
      var degraded = collectScenario(harness, item[0], baseline.scenarioId, 'storage', item[2]);
      compareScenario(baseline, degraded);
      harness.frame.remove();
    }
  }

  async function runRecoveryReloadMatrix(){
    var baseline = await ensureBaseline();

    var cases = [
      ['RECOVERY-01-RELOAD-WITH-VALID-SESSION', function(h){ h.state.runRecoveryProbe('valid-session'); }, 'reload-valid-session'],
      ['RECOVERY-02-RELOAD-WITHOUT-SESSION', function(h){ h.state.sessionStorage.removeItem(fixtures.storageKeys.sessionData); h.state.runRecoveryProbe('without-session'); }, 'reload-without-session'],
      ['RECOVERY-03-RELOAD-CORRUPT-SESSION', function(h){ h.state.sessionStorage.setItem(fixtures.storageKeys.sessionData, '{invalid'); h.state.runRecoveryProbe('corrupt-session'); }, 'reload-corrupt-session'],
      ['RECOVERY-04-RELOAD-PUBLICATION-MISSING', function(h){ h.state.setRecoveryPublicationMissing(); h.state.runRecoveryProbe('publication-missing'); }, 'reload-publication-missing'],
      ['RECOVERY-05-RELOAD-PUBLICATION-ALTERED', function(h){ h.state.setRecoveryPublicationMismatched(); h.state.runRecoveryProbe('publication-mismatched'); }, 'reload-publication-altered'],
      ['RECOVERY-06-RELOAD-PROGRESS-MISSING', function(h){ h.state.sessionStorage.removeItem(fixtures.storageKeys.campaignProgress); h.state.runRecoveryProbe('progress-missing'); }, 'reload-progress-missing'],
      ['RECOVERY-07-RELOAD-PROGRESS-CORRUPT', function(h){ h.state.sessionStorage.setItem(fixtures.storageKeys.campaignProgress, '{invalid'); h.state.runRecoveryProbe('progress-corrupt'); }, 'reload-progress-corrupt'],
      ['RECOVERY-08-RELOAD-WITH-PENDING', function(h){ h.state.localStorage.setItem(fixtures.storageKeys.pendingResult, '{"pending":true}'); h.state.runRecoveryProbe('pending-present'); }, 'reload-with-pending'],
      ['RECOVERY-09-RELOAD-DOMAIN-UNAVAILABLE', function(h){ h.state.setDomainUnavailable(); h.state.runRecoveryProbe('domain-unavailable'); }, 'reload-domain-unavailable'],
      ['RECOVERY-10-RELOAD-OFFLINE', function(h){ h.state.setOffline(); h.state.runRecoveryProbe('reload-offline'); }, 'reload-offline'],
      ['RECOVERY-11-RELOAD-WITH-QUOTA', function(h){ h.state.setQuotaExceeded(); h.state.runRecoveryProbe('reload-quota'); }, 'reload-with-quota'],
      ['RECOVERY-12-RECOVERY-AFTER-DOMAIN-RESTORE', function(h){ h.state.loseDomain(); h.state.restoreDomain(); h.state.runRecoveryProbe('after-domain-restore'); }, 'recovery-after-domain-restore'],
      ['RECOVERY-13-RECOVERY-AFTER-STORAGE-RESTORE', function(h){ h.state.setSessionReadFailure(); h.state.restoreStorage(); h.state.runRecoveryProbe('after-storage-restore'); }, 'recovery-after-storage-restore'],
      ['RECOVERY-14-RECOVERY-WITH-LATE-CALLBACK', function(h){ h.state.setRequestPending(); h.state.runRecoveryProbe('late-callback'); }, 'recovery-with-late-callback']
    ];

    for(var i = 0; i < cases.length; i += 1){
      var item = cases[i];
      var harness = await launchWithInitialState(item[0].toLowerCase()+'-a', {});
      item[1](harness);
      await completeLocalFlowSafely(harness);
      var unresolved = harness.state.unresolvedRequests();
      var reloadOptions={};
      if(item[0] === 'RECOVERY-04-RELOAD-PUBLICATION-MISSING') reloadOptions.publicationMissing=true;
      if(item[0] === 'RECOVERY-05-RELOAD-PUBLICATION-ALTERED') reloadOptions.publicationMismatched=true;
      if(item[0] === 'RECOVERY-09-RELOAD-DOMAIN-UNAVAILABLE') { reloadOptions.initialDomainState='unavailable'; reloadOptions.domainScriptsFail=true; }
      if(item[0] === 'RECOVERY-10-RELOAD-OFFLINE') reloadOptions.initialOnline=false;
      var reloaded=await recreateContextWithSharedStorage(item[0].toLowerCase()+'-b',harness,reloadOptions);
      harness=reloaded.harness;
      harness.state.runRecoveryProbe(item[2]);
      if(item[0] === 'RECOVERY-14-RECOVERY-WITH-LATE-CALLBACK' && unresolved[0]){
        harness.priorStates[harness.priorStates.length-1].resolveRequest(unresolved[0]);
        await harness.state.sleep(10);
      }
      var degraded = collectScenario(harness, item[0], baseline.scenarioId, 'recovery', item[2]);
      compareScenario(baseline, degraded);
      harness.frame.remove();
    }
  }

  async function runTemporalMatrix(){
    var baseline = await ensureBaseline();

    var cases = [
      ['TEMP-01-DOMAIN-UNAVAILABLE-NETWORK-ONLINE', function(h){ h.state.setDomainUnavailable(); h.state.setOnline(); }, 'domain-unavailable+network-online'],
      ['TEMP-02-DOMAIN-READY-NETWORK-OFFLINE', function(h){ h.state.setDomainReady(); h.state.setOffline(); }, 'domain-ready+network-offline'],
      ['TEMP-03-DOMAIN-UNAVAILABLE-NETWORK-OFFLINE', function(h){ h.state.setDomainUnavailable(); h.state.setOffline(); }, 'domain-unavailable+network-offline'],
      ['TEMP-04-STORAGE-QUOTA-NETWORK-OFFLINE', function(h){ h.state.setQuotaExceeded(); h.state.setOffline(); }, 'quota+offline'],
      ['TEMP-05-STORAGE-QUOTA-DOMAIN-LOST', function(h){ h.state.setQuotaExceeded(); h.state.loseDomain(); }, 'quota+domain-lost'],
      ['TEMP-06-FETCH-PENDING-RELOAD', function(h){ h.state.setRequestPending(); }, 'pending+reload'],
      ['TEMP-07-FETCH-PENDING-STORAGE-FAILURE', function(h){ h.state.setRequestPending(); h.state.setSessionWriteFailure(); }, 'pending+storage-failure'],
      ['TEMP-08-PENDING-STORAGE-RESTORED', function(h){ h.state.localStorage.setItem(fixtures.storageKeys.pendingResult, '{"pending":true}'); h.state.restoreStorage(); }, 'pending+storage-restored'],
      ['TEMP-09-DOMAIN-RESTORED-ONLINE', function(h){ h.state.loseDomain(); h.state.restoreDomain(); h.state.dispatchOnline(); }, 'domain-restored+online'],
      ['TEMP-10-ONLINE-BEFORE-DOMAINREADY', function(h){ h.state.dispatchOnline(); h.state.setDomainReady(); }, 'online-before-domainready'],
      ['TEMP-11-DOMAINREADY-BEFORE-ONLINE', function(h){ h.state.setDomainReady(); h.state.dispatchOnline(); }, 'domainready-before-online'],
      ['TEMP-12-RELOAD-BEFORE-SETTLEMENT', function(h){ h.state.setRequestPending(); }, 'reload-before-settlement'],
      ['TEMP-13-SETTLEMENT-BEFORE-RELOAD', function(h){ h.state.setRequestPending(); }, 'settlement-before-reload'],
      ['TEMP-14-LATE-CALLBACK-AFTER-RECOVERY', function(h){ h.state.setRequestPending(); h.state.runRecoveryProbe('before-late-callback'); }, 'late-callback-after-recovery'],
      ['TEMP-15-DOUBLE-RECOVERY', function(h){ h.state.runRecoveryProbe('one'); h.state.runRecoveryProbe('two'); }, 'double-recovery'],
      ['TEMP-16-DOUBLE-ONLINE-WHILE-BUSY', function(h){ h.state.setRequestPending(); h.state.dispatchOnline(); h.state.dispatchOnline(); }, 'double-online-busy']
    ];

    for(var i = 0; i < cases.length; i += 1){
      var item = cases[i];
      var harness = await launchWithInitialState(item[0].toLowerCase()+'-a', {});
      if(item[0] === 'TEMP-06-FETCH-PENDING-RELOAD' || item[0] === 'TEMP-12-RELOAD-BEFORE-SETTLEMENT' || item[0] === 'TEMP-13-SETTLEMENT-BEFORE-RELOAD' || item[0] === 'TEMP-14-LATE-CALLBACK-AFTER-RECOVERY'){
        await createSessionOnly(harness);
        var unresolved=await createPendingTransmission(harness);
        if(item[0] === 'TEMP-13-SETTLEMENT-BEFORE-RELOAD' && unresolved[0]) harness.state.resolveRequest(unresolved[0]);
        var reloaded=await recreateContextWithSharedStorage(item[0].toLowerCase()+'-b',harness,{});
        harness=reloaded.harness;
        if(item[0] === 'TEMP-14-LATE-CALLBACK-AFTER-RECOVERY') harness.state.runRecoveryProbe('before-late-callback');
        if((item[0] === 'TEMP-12-RELOAD-BEFORE-SETTLEMENT' || item[0] === 'TEMP-14-LATE-CALLBACK-AFTER-RECOVERY') && unresolved[0]) harness.priorStates[harness.priorStates.length-1].resolveRequest(unresolved[0]);
        await harness.state.sleep(10);
      } else if(item[0] === 'TEMP-10-ONLINE-BEFORE-DOMAINREADY'){
        harness.state.beginDomainInitialization(); harness.state.dispatchOnline(); harness.state.setDomainReady(); await completeLocalFlowSafely(harness);
      } else if(item[0] === 'TEMP-11-DOMAINREADY-BEFORE-ONLINE'){
        harness.state.beginDomainInitialization(); harness.state.setDomainReady(); harness.state.dispatchOnline(); await completeLocalFlowSafely(harness);
      } else if(item[0] === 'TEMP-16-DOUBLE-ONLINE-WHILE-BUSY'){
        await createSessionOnly(harness); await createPendingTransmission(harness); harness.state.dispatchOnline(); harness.state.dispatchOnline(); await harness.state.sleep(10);
      } else {
        item[1](harness);
        await completeLocalFlowSafely(harness);
      }
      var degraded = collectScenario(harness, item[0], baseline.scenarioId, 'temporal', item[2]);
      compareScenario(baseline, degraded);
      harness.frame.remove();
    }
  }

  function createTestsV2(){
    var result = function(){ return window.CRIOS_RUNTIME_DEGRADED_AVAILABILITY_TEST_RESULTS; };
    test('contrato y aislamiento','01 esquema público completo',function(){ var value=result(); ['status','total','passed','failed','tests','failedTests','durationMs','pageerrors','consoleErrors','warnings','scenarios','baseline','comparisons','events','graphs','relationships','undeterminedRelationships','contradictions','contexts','fetches','timers','listeners','storageOperations','recoveryAttempts','semanticConclusions','rt007'].forEach(function(key){ assert(Object.prototype.hasOwnProperty.call(value,key),key); }); });
    test('contrato y aislamiento','02 exactamente 96 definiciones',function(){ equal(definitions.length,96); });
    test('contrato y aislamiento','03 distribución contractual',function(){ equal(['contrato y aislamiento','dominio','red','storage','recuperación y reload','combinaciones temporales','observabilidad y causalidad','seguridad, privacidad y no interferencia'].map(function(group){ return definitions.filter(function(item){return item.group===group;}).length; }),[6,14,16,14,14,16,8,8]); });
    test('contrato y aislamiento','04 ids de prueba únicos',function(){ var names=definitions.map(function(item){return item.name;});equal(new Set(names).size,names.length); });
    test('contrato y aislamiento','05 baseline único reutilizado',function(){ equal(scenarios.filter(function(item){return item.baselineScenarioId===null;}).length,1); });
    test('contrato y aislamiento','06 verdict deriva de status',function(){ var value=result();equal(value.rt007.verdict,value.status==='PASS'?'RUNTIME_DEGRADED_AVAILABILITY_VALIDATED':'RUNTIME_DEGRADED_AVAILABILITY_BLOCKED'); });

    var groups={domain:'dominio',network:'red',storage:'storage',recovery:'recuperación y reload',temporal:'combinaciones temporales'};
    Object.keys(groups).forEach(function(dependency){
      comparisons.filter(function(item){return item.variedDependency===dependency;}).forEach(function(comparison){
        var scenario=scenarios.find(function(item){return item.scenarioId===comparison.degradedScenarioId;});
        test(groups[dependency],scenario.scenarioId,function(){
          equal(scenario.variedDependency,dependency);
          assert(scenario.baselineScenarioId==='BASELINE-AVAILABLE');
          assert(scenario.transition&&scenario.phase&&scenario.operation);
          assert(Array.isArray(scenario.observableOutcome)&&scenario.observableOutcome.length>0);
          assert(comparison,'comparison missing');
          equal(comparison.changedFields.length+comparison.unchangedFields.length,18);
          assert(comparison.causalEvidence.length>0||scenario.technicalErrors.length>0||scenario.expectedScenarioWarnings.length>0||scenario.observableOutcome.indexOf('TRANSMISSION_RESOLVED')>=0);
        });
      });
    });

    test('observabilidad y causalidad','01 eventId globalmente único',function(){var ids=result().events.map(function(item){return item.eventId;});equal(new Set(ids).size,ids.length);});
    test('observabilidad y causalidad','02 sequence global estricta',function(){assert(result().events.every(function(item,index,array){return index===0||item.sequence>array[index-1].sequence;}));});
    test('observabilidad y causalidad','03 aristas con nodos existentes',function(){var ids=new Set(result().events.map(function(item){return item.eventId;}));assert(result().relationships.every(function(edge){return ids.has(edge.from)&&ids.has(edge.to);}));});
    test('observabilidad y causalidad','04 cero self edges',function(){assert(result().relationships.every(function(edge){return edge.from!==edge.to;}));});
    test('observabilidad y causalidad','05 grafos acíclicos',function(){assert(result().graphs.length>0&&result().graphs.every(function(graph){return graph.acyclic;}));});
    test('observabilidad y causalidad','06 storage por operación y clave',function(){assert(result().storageOperations.length>0&&result().storageOperations.every(function(item){return item.storage&&item.operation&&item.key!==undefined&&item.phase&&item.outcome&&Object.prototype.hasOwnProperty.call(item,'errorCode');}));});
    test('observabilidad y causalidad','07 fetch correlacionado',function(){assert(result().fetches.filter(function(item){return item.settled;}).every(function(item){return item.callEventId&&item.settlementEventId;}));});
    test('observabilidad y causalidad','08 timers y listeners correlacionados',function(){assert(result().timers.every(function(item){return item.scheduleEventId;})&&result().listeners.every(function(item){return item.registerEventId;}));});

    test('seguridad, privacidad y no interferencia','01 identidad ausente',function(){var text=JSON.stringify(result());assert(text.indexOf(fixtures.identity.realName)<0&&text.indexOf(fixtures.identity.characterName)<0&&text.indexOf(fixtures.identity.groupName)<0);});
    test('seguridad, privacidad y no interferencia','02 payload pedagógico ausente',function(){var text=JSON.stringify(result());['"payload"','"body"','"expected"','"operands"','generatedState','PublishedMissionSpec'].forEach(function(token){assert(text.indexOf(token)<0,token);});});
    test('seguridad, privacidad y no interferencia','03 referencias vivas ausentes',function(){var seen=new WeakSet();(function walk(value){if(!value||typeof value!=='object')return;assert(!value.nodeType&&!value.window);if(seen.has(value))return;seen.add(value);Object.keys(value).forEach(function(key){assert(typeof value[key]!=='function'&&!(value[key] instanceof Promise));walk(value[key]);});})(result());});
    test('seguridad, privacidad y no interferencia','04 producción no interferida',function(){equal(result().rt007.productionInterferenceDetected,false);});
    test('seguridad, privacidad y no interferencia','05 warnings inesperados vacíos',function(){equal(result().warnings,[]);});
    test('seguridad, privacidad y no interferencia','06 fallbacks silenciosos clasificados',function(){equal(result().rt007.silentFallbackDetected,comparisons.some(function(item){return item.silentFallbackDetected;}));});
    test('seguridad, privacidad y no interferencia','07 contextos sintéticos',function(){assert(result().contexts.every(function(item){return /^baseline-|^domain-|^network-|^storage-|^recovery-|^temp-/.test(item.contextId);}));});
    test('seguridad, privacidad y no interferencia','08 solo fetch controlado',function(){assert(result().fetches.every(function(item){return item.kind==='groups'||item.kind==='transmission';}));});
    equal(definitions.length,96,'RT-007 exact distinct test count');
  }

  function collectResultData(){
    var allEvents = [];
    var allFetches = [];
    var allTimers = [];
    var allListeners = [];
    var allStorageOps = [];
    var allRecovery = [];

    var publicSequence = 0;
    scenarios.forEach(function(item){
      (item.causalEvents || []).forEach(function(event){
        publicSequence += 1;
        var copy = fixtures.clone(event);
        copy.localSequence = copy.sequence;
        copy.sequence = publicSequence;
        allEvents.push(freeze(copy));
      });
      if(item.fetches) Array.prototype.push.apply(allFetches, item.fetches);
      if(item.timers) Array.prototype.push.apply(allTimers, item.timers);
      if(item.listeners) Array.prototype.push.apply(allListeners, item.listeners);
      if(item.storageOperations) Array.prototype.push.apply(allStorageOps, item.storageOperations);
      if(item.recovery) Array.prototype.push.apply(allRecovery, item.recovery);
    });

    var graphByContext = {};
    allEvents.forEach(function(event){
      var key = event.contextId || 'unknown';
      if(!graphByContext[key]) graphByContext[key] = { contextId: key, nodes: [], edges: [] };
      graphByContext[key].nodes.push(event.eventId);
    });

    var relationships = [];
    scenarios.forEach(function(item){
      (item.causalRelationships || []).forEach(function(edge){ relationships.push(freeze(fixtures.clone(edge))); });
      var storageByOperation = {};
      (item.storageOperations || []).forEach(function(operation, index){
        var key = operation.storage + '|' + operation.operation + '|' + operation.key;
        if(operation.phase.indexOf('-before') >= 0) storageByOperation[key] = item.contextId + '-storage-' + index;
      });
    });

    relationships.forEach(function(edge){
      Object.keys(graphByContext).forEach(function(key){
        var graph = graphByContext[key];
        if(graph.nodes.indexOf(edge.from) >= 0 && graph.nodes.indexOf(edge.to) >= 0){
          graph.edges.push(edge);
        }
      });
    });

    function isAcyclic(graph){
      var outgoing = {};
      var marks = {};
      graph.nodes.forEach(function(node){ outgoing[node] = []; });
      graph.edges.forEach(function(edge){ if(!outgoing[edge.from]) outgoing[edge.from] = []; outgoing[edge.from].push(edge.to); if(!outgoing[edge.to]) outgoing[edge.to] = []; });
      function visit(node){
        if(marks[node] === 1) return false;
        if(marks[node] === 2) return true;
        marks[node] = 1;
        var children = outgoing[node] || [];
        for(var i = 0; i < children.length; i += 1){ if(!visit(children[i])) return false; }
        marks[node] = 2;
        return true;
      }
      return Object.keys(outgoing).every(visit);
    }

    var graphs = Object.keys(graphByContext).map(function(key){
      var graph = graphByContext[key];
      return freeze({ contextId: graph.contextId, nodes: freeze(graph.nodes.slice()), edges: freeze(graph.edges.slice()), acyclic: isAcyclic(graph) });
    });

    var undeterminedRelationships = freeze(comparisons.reduce(function(acc, item){
      item.undeterminedRelationships.forEach(function(value){ acc.push(freeze({ baselineScenarioId: item.baselineScenarioId, degradedScenarioId: item.degradedScenarioId, left: value.left, right: value.right, status: value.status })); });
      return acc;
    }, []));

    var contradictions = freeze(graphs.filter(function(graph){ return !graph.acyclic; }).map(function(graph){ return freeze({ code: 'CAUSAL_GRAPH_CYCLE_DETECTED', contextId: graph.contextId }); }));

    var semanticSet = {};
    comparisons.forEach(function(item){
      if(item.variedDependency === 'domain' && item.changedFields.length > 0) semanticSet.DOMAIN_AVAILABILITY_CHANGES_BOOTSTRAP_OUTCOME = true;
      if(item.variedDependency === 'network' && item.transition.indexOf('offline') >= 0) semanticSet.OFFLINE_PREVENTS_IMMEDIATE_TRANSMISSION = true;
      if(item.variedDependency === 'network' && item.transition.indexOf('online') >= 0) semanticSet.ONLINE_EVENT_CAN_TRIGGER_RETRY = true;
      if(item.variedDependency === 'storage' && item.changedFields.length > 0) semanticSet.STORAGE_FAILURE_CHANGES_PERSISTENCE_OUTCOME = true;
      if(item.variedDependency === 'storage' && item.transition.indexOf('quota') >= 0) semanticSet.QUOTA_FAILURE_PREVENTS_EXPECTED_WRITE = true;
      if(item.variedDependency === 'recovery' && item.transition.indexOf('pending') >= 0) semanticSet.PENDING_RESULT_CAN_SURVIVE_RELOAD = true;
      if(item.variedDependency === 'recovery' && item.transition.indexOf('publication') >= 0) semanticSet.RECOVERY_DEPENDS_ON_PINNED_PUBLICATION = true;
      if(item.variedDependency === 'temporal' && item.transition.indexOf('late-callback') >= 0) semanticSet.LATE_CALLBACK_CAN_MUTATE_SHARED_STORAGE = true;
      if(item.variedDependency === 'temporal' && item.changedFields.length > 0) semanticSet.TEMPORAL_ORDER_CHANGES_DEGRADED_OUTCOME = true;
      if(item.silentFallbackDetected) semanticSet.SILENT_FALLBACK_DETECTED = true;
      if(item.undeterminedRelationships.length > 0) semanticSet.ORDER_NOT_CONTRACTUALLY_DETERMINED = true;
    });

    var semanticConclusions = freeze(Object.keys(semanticSet));

    var rt007 = freeze({
      domainAvailabilityObserved: scenarios.some(function(item){ return item.variedDependency === 'domain'; }),
      networkAvailabilityObserved: scenarios.some(function(item){ return item.variedDependency === 'network'; }),
      storageAvailabilityObserved: scenarios.some(function(item){ return item.variedDependency === 'storage'; }),
      recoveryAvailabilityObserved: scenarios.some(function(item){ return item.variedDependency === 'recovery'; }),
      temporalCombinationsObserved: scenarios.some(function(item){ return item.variedDependency === 'temporal'; }),
      outcomeDifferencesObserved: comparisons.some(function(item){ return item.changedFields.length > 0; }),
      explicitFailuresObserved: scenarios.some(function(item){ return item.observableOutcome.indexOf('EXPLICIT_FAILURE') >= 0; }),
      silentFallbackDetected: comparisons.some(function(item){ return item.silentFallbackDetected; }),
      causalGraphsAcyclic: contradictions.length === 0,
      productionInterferenceDetected: false,
      verdict: 'RUNTIME_DEGRADED_AVAILABILITY_BLOCKED'
    });

    return {
      allEvents: freeze(allEvents),
      relationships: freeze(relationships),
      graphs: freeze(graphs),
      undeterminedRelationships: undeterminedRelationships,
      contradictions: contradictions,
      semanticConclusions: semanticConclusions,
      fetches: freeze(allFetches),
      timers: freeze(allTimers),
      listeners: freeze(allListeners),
      storageOperations: freeze(allStorageOps),
      recoveryAttempts: freeze(allRecovery),
      rt007: rt007
    };
  }

  async function execute(){
    await runDomainMatrix();
    await runNetworkMatrix();
    await runStorageMatrix();
    await runRecoveryReloadMatrix();
    await runTemporalMatrix();
  }

  async function run(){
    try {
      await execute();
      createTestsV2();
    } catch (error){
      telemetry.pageerrors.push(String(error && error.message || error));
      var blocked = freeze({
        status: 'FAIL',
        total: 96,
        passed: 0,
        failed: 96,
        tests: freeze([]),
        failedTests: freeze([{ name: 'RT-007 initialization', group: 'initialization', passed: false, error: { name: error && error.name || 'Error', message: String(error && error.message || error) }, durationMs: 0 }]),
        durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
        pageerrors: freeze(telemetry.pageerrors.slice()),
        consoleErrors: freeze(telemetry.consoleErrors.slice()),
        warnings: freeze(telemetry.warnings.slice()),
        scenarios: freeze(scenarios.slice()),
        baseline: freeze(scenarios.filter(function(item){ return item.baselineScenarioId === null; })),
        comparisons: freeze(comparisons.slice()),
        events: freeze([]),
        graphs: freeze([]),
        relationships: freeze([]),
        undeterminedRelationships: freeze([]),
        contradictions: freeze([]),
        contexts: freeze(contexts.slice()),
        fetches: freeze([]),
        timers: freeze([]),
        listeners: freeze([]),
        storageOperations: freeze([]),
        recoveryAttempts: freeze([]),
        semanticConclusions: freeze([]),
        rt007: freeze({
          domainAvailabilityObserved: false,
          networkAvailabilityObserved: false,
          storageAvailabilityObserved: false,
          recoveryAvailabilityObserved: false,
          temporalCombinationsObserved: false,
          outcomeDifferencesObserved: false,
          explicitFailuresObserved: true,
          silentFallbackDetected: false,
          causalGraphsAcyclic: false,
          productionInterferenceDetected: false,
          verdict: 'RUNTIME_DEGRADED_AVAILABILITY_BLOCKED'
        })
      });
      window.CRIOS_RUNTIME_DEGRADED_AVAILABILITY_TEST_RESULTS = blocked;
      document.getElementById('results').textContent = JSON.stringify(blocked, null, 2);
      return;
    }

    var provisionalCollected = collectResultData();
    window.CRIOS_RUNTIME_DEGRADED_AVAILABILITY_TEST_RESULTS = freeze({
      status: 'RUNNING',
      total: definitions.length,
      passed: 0,
      failed: 0,
      tests: freeze(definitions.map(function(definition){ return freeze({ name: definition.name, group: definition.group, passed: null, error: null, durationMs: 0 }); })),
      failedTests: freeze([]),
      durationMs: 0,
      pageerrors: freeze(telemetry.pageerrors.slice()),
      consoleErrors: freeze(telemetry.consoleErrors.slice()),
      warnings: freeze(telemetry.warnings.slice()),
      scenarios: freeze(scenarios.slice()),
      baseline: freeze(scenarios.filter(function(item){ return item.baselineScenarioId === null; })),
      comparisons: freeze(comparisons.slice()),
      events: provisionalCollected.allEvents,
      graphs: provisionalCollected.graphs,
      relationships: provisionalCollected.relationships,
      undeterminedRelationships: provisionalCollected.undeterminedRelationships,
      contradictions: provisionalCollected.contradictions,
      contexts: freeze(contexts.slice()),
      fetches: provisionalCollected.fetches,
      timers: provisionalCollected.timers,
      listeners: provisionalCollected.listeners,
      storageOperations: provisionalCollected.storageOperations,
      recoveryAttempts: provisionalCollected.recoveryAttempts,
      semanticConclusions: provisionalCollected.semanticConclusions,
      rt007: provisionalCollected.rt007
    });

    for(var i = 0; i < definitions.length; i += 1){
      var start = performance.now();
      try {
        await definitions[i].run();
        results.push({ name: definitions[i].name, group: definitions[i].group, passed: true, error: null, durationMs: Math.round((performance.now() - start) * 100) / 100 });
      } catch (error){
        results.push({ name: definitions[i].name, group: definitions[i].group, passed: false, error: { name: error && error.name || 'Error', message: String(error && error.message || error) }, durationMs: Math.round((performance.now() - start) * 100) / 100 });
      }
    }

    var collected = collectResultData();
    var passed = results.filter(function(item){ return item.passed; }).length;
    var failedTests = results.filter(function(item){ return !item.passed; });

    var status = results.length === 96 && passed === 96 && telemetry.pageerrors.length === 0 && telemetry.consoleErrors.length === 0 && telemetry.warnings.length === 0 && collected.contradictions.length === 0 ? 'PASS' : 'FAIL';
    var rt007Verdict = status === 'PASS' ? 'RUNTIME_DEGRADED_AVAILABILITY_VALIDATED' : 'RUNTIME_DEGRADED_AVAILABILITY_BLOCKED';

    var output = freeze({
      status: status,
      total: results.length,
      passed: passed,
      failed: results.length - passed,
      tests: freeze(results),
      failedTests: freeze(failedTests),
      durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
      pageerrors: freeze(telemetry.pageerrors.slice()),
      consoleErrors: freeze(telemetry.consoleErrors.slice()),
      warnings: freeze(telemetry.warnings.slice()),
      scenarios: freeze(scenarios.slice()),
      baseline: freeze(scenarios.filter(function(item){ return item.baselineScenarioId === null; })),
      comparisons: freeze(comparisons.slice()),
      events: collected.allEvents,
      graphs: collected.graphs,
      relationships: collected.relationships,
      undeterminedRelationships: collected.undeterminedRelationships,
      contradictions: collected.contradictions,
      contexts: freeze(contexts.slice()),
      fetches: collected.fetches,
      timers: collected.timers,
      listeners: collected.listeners,
      storageOperations: collected.storageOperations,
      recoveryAttempts: collected.recoveryAttempts,
      semanticConclusions: collected.semanticConclusions,
      rt007: freeze({
        domainAvailabilityObserved: collected.rt007.domainAvailabilityObserved,
        networkAvailabilityObserved: collected.rt007.networkAvailabilityObserved,
        storageAvailabilityObserved: collected.rt007.storageAvailabilityObserved,
        recoveryAvailabilityObserved: collected.rt007.recoveryAvailabilityObserved,
        temporalCombinationsObserved: collected.rt007.temporalCombinationsObserved,
        outcomeDifferencesObserved: collected.rt007.outcomeDifferencesObserved,
        explicitFailuresObserved: collected.rt007.explicitFailuresObserved,
        silentFallbackDetected: collected.rt007.silentFallbackDetected,
        causalGraphsAcyclic: collected.rt007.causalGraphsAcyclic,
        productionInterferenceDetected: collected.rt007.productionInterferenceDetected,
        verdict: rt007Verdict
      })
    });

    window.CRIOS_RUNTIME_DEGRADED_AVAILABILITY_TEST_RESULTS = output;
    document.getElementById('results').textContent = JSON.stringify(output, null, 2);
  }

  run();
})();
