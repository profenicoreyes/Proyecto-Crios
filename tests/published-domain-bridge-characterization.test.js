/* CRIOS A2-014B - Published-to-domain bridge characterization */
(function(){
  'use strict';

  var startedAt = performance.now();
  var assertions = [];
  var pageErrors = [];
  var consoleErrors = [];
  var unhandledRejections = [];
  var frames = [];
  var originalConsoleError = console.error;
  var storageKey = 'crios.publication.persistence.v1';
  var customScenarioId = 'a2-014-orbital';

  window.addEventListener('error', function(event){
    pageErrors.push(String(event.error && event.error.stack || event.message || event.error || 'PAGE_ERROR'));
  });
  window.addEventListener('unhandledrejection', function(event){
    unhandledRejections.push(String(event.reason && event.reason.stack || event.reason || 'UNHANDLED_REJECTION'));
  });
  console.error = function(){
    consoleErrors.push(Array.prototype.map.call(arguments, String).join(' '));
    originalConsoleError.apply(console, arguments);
  };

  function freeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.keys(value).forEach(function(key){ freeze(value[key]); });
    return Object.freeze(value);
  }

  function clone(value) {
    if (value === undefined) return undefined;
    return JSON.parse(JSON.stringify(value));
  }

  function assert(id, condition, message) {
    assertions.push(freeze({ id: id, passed: Boolean(condition), message: condition ? '' : String(message || id) }));
  }

  function equal(id, actual, expected) {
    var same = JSON.stringify(actual) === JSON.stringify(expected);
    assert(id, same, id + ' actual=' + JSON.stringify(actual) + ' expected=' + JSON.stringify(expected));
  }

  function waitFor(check, timeoutMs, label) {
    var end = Date.now() + (timeoutMs || 30000);
    return new Promise(function(resolve, reject){
      (function poll(){
        var value;
        try { value = check(); }
        catch (error) { reject(error); return; }
        if (value) { resolve(value); return; }
        if (Date.now() > end) { reject(new Error('TIMEOUT: ' + (label || 'condition'))); return; }
        setTimeout(poll, 25);
      })();
    });
  }

  function diagnosticBootstrap() {
    return [
      '(function(){',
      'window.__CRIOS_A2_014B_DIAG__={pageErrors:[],consoleErrors:[],unhandledRejections:[],fetchCalls:[]};',
      'window.addEventListener("error",function(event){window.__CRIOS_A2_014B_DIAG__.pageErrors.push(String(event.error&&event.error.stack||event.message||event.error||"PAGE_ERROR"));});',
      'window.addEventListener("unhandledrejection",function(event){window.__CRIOS_A2_014B_DIAG__.unhandledRejections.push(String(event.reason&&event.reason.stack||event.reason||"UNHANDLED_REJECTION"));});',
      'var originalError=console.error;console.error=function(){window.__CRIOS_A2_014B_DIAG__.consoleErrors.push(Array.prototype.map.call(arguments,String).join(" "));return originalError.apply(console,arguments);};',
      '})();'
    ].join('');
  }

  function runtimeStubs() {
    return [
      'window.fetch=async function(input,init){',
      'var url=String(input&&input.url||input||"");',
      'window.__CRIOS_A2_014B_DIAG__.fetchCalls.push({url:url,method:String(init&&init.method||"GET")});',
      'if(url.indexOf("accion=grupos")>=0){return new Response(JSON.stringify({ok:true,grupos:["A2-014B"]}),{status:200,headers:{"Content-Type":"application/json"}});}',
      'return new Response(JSON.stringify({ok:true}),{status:200,headers:{"Content-Type":"application/json"}});',
      '};',
      'window.AudioContext=window.webkitAudioContext=function(){',
      'this.state="running";this.currentTime=0;this.destination={};',
      'this.createOscillator=function(){return{frequency:{value:0,setValueAtTime:function(){}},detune:{setValueAtTime:function(){}},type:"sine",connect:function(){},start:function(){},stop:function(){}};};',
      'this.createGain=function(){return{gain:{value:0,setValueAtTime:function(){},exponentialRampToValueAtTime:function(){}},connect:function(){},disconnect:function(){}};};',
      'this.createBiquadFilter=function(){return{type:"lowpass",frequency:{setValueAtTime:function(){}},Q:{value:0},connect:function(){}};};',
      'this.createDynamicsCompressor=function(){return{connect:function(){}};};',
      'this.resume=async function(){this.state="running";};',
      '};'
    ].join('');
  }

  function scriptTag(code) {
    return '<script>' + String(code).replace(/<\/script/gi, '<\\/script') + '<\/script>';
  }

  async function createControlledDocument(options) {
    var frame = document.createElement('iframe');
    frame.hidden = true;
    frame.title = options.title || 'CRIOS A2-014B controlled frame';
    frames.push(frame);
    document.body.appendChild(frame);
    frame.src = './published-domain-bridge-characterization.test.html?shell=1&token=' + Math.random().toString(36).slice(2);
    await waitFor(function(){
      return frame.contentWindow && frame.contentWindow.location.pathname.endsWith('/tests/published-domain-bridge-characterization.test.html');
    }, 20000, 'shell-ready');

    var target = new URL(options.targetUrl, window.location.href);
    var source = await fetch(options.sourceUrl, { cache: 'no-store' }).then(function(response){
      if (!response.ok) throw new Error('SOURCE_FETCH_FAILED: ' + response.status);
      return response.text();
    });
    var basePath = target.pathname.slice(0, target.pathname.lastIndexOf('/') + 1) || '/';
    var bootstrap = [
      'history.replaceState(null,"",' + JSON.stringify(target.pathname + target.search + target.hash) + ');',
      diagnosticBootstrap(),
      options.runtime ? runtimeStubs() : ''
    ].join('');
    source = source.replace('<head>', '<head><base href="' + basePath + '">' + scriptTag(bootstrap));

    var child = frame.contentWindow;
    child.document.open();
    child.document.write(source);
    child.document.close();
    return { frame: frame, child: child, target: target };
  }

  async function prepareStudio() {
    var controlled = await createControlledDocument({
      title: 'CRIOS A2-014B Studio',
      targetUrl: '../studio/index.html',
      sourceUrl: '../studio/index.html',
      runtime: false
    });
    var studio = controlled.child;
    await waitFor(function(){
      return studio.CRIOS_STUDIO && studio.CRIOS_STUDIO_ADAPTER && studio.CRIOS_CAMPAIGN_DRAFT &&
        studio.CRIOS_STUDIO.runtimeLaunch && studio.CRIOS_STUDIO.publication &&
        studio.CRIOS_STUDIO.activation && studio.CRIOS_STUDIO.persistence && studio.REGISTRO_ESCENARIOS;
    }, 30000, 'studio-ready');
    return controlled;
  }

  async function launchRuntime(href, label) {
    var controlled = await createControlledDocument({
      title: label,
      targetUrl: href,
      sourceUrl: '../index.html',
      runtime: true
    });
    var child = controlled.child;
    await waitFor(function(){
      return child.CRIOS && child.CRIOS.runtimeLaunch && child.CRIOS_DOMAIN &&
        child.CRIOS_DOMAIN.runtimeBootstrapAdapter && child.CRIOS_DOMAIN.releaseFactory &&
        child.CRIOS_DOMAIN.sessionFactory && child.CRIOS_DOMAIN.runtimeCore &&
        child.CRIOS_DOMAIN.navigationCore && child.document.getElementById('groupInput');
    }, 30000, label + '-bootstrap');
    await waitFor(function(){
      var group = child.document.getElementById('groupInput');
      var button = child.document.getElementById('identifyButton');
      return group && button && !group.disabled && !button.disabled;
    }, 30000, label + '-groups');
    return controlled;
  }

  function installBridgeInstrumentation(child) {
    var domain = child.CRIOS_DOMAIN;
    var originals = {
      bootstrap: domain.runtimeBootstrapAdapter,
      releaseFactory: domain.releaseFactory,
      sessionFactory: domain.sessionFactory,
      runtimeCore: domain.runtimeCore,
      navigationCore: domain.navigationCore
    };
    var captures = {
      prepareCalls: [],
      recoverCalls: [],
      preparedResults: [],
      drafts: [],
      releases: [],
      sessionInputs: [],
      sessions: [],
      runtimeInputs: [],
      runtimes: [],
      navigationInputs: [],
      navigations: []
    };

    domain.runtimeBootstrapAdapter = Object.freeze({
      version: originals.bootstrap.version,
      prepareLegacyCampaign: originals.bootstrap.prepareLegacyCampaign,
      isPreparedRuntimeCampaign: originals.bootstrap.isPreparedRuntimeCampaign,
      preparePublishedCampaign: async function(options){
        captures.prepareCalls.push({ mode: options.mode, campaignId: options.campaignId, identity: options.identity });
        var result = await originals.bootstrap.preparePublishedCampaign(options);
        captures.preparedResults.push(result.success ? result.campaign : null);
        return result;
      },
      recoverPublishedCampaign: async function(options){
        captures.recoverCalls.push(clone(options.pinnedPublication));
        var result = await originals.bootstrap.recoverPublishedCampaign(options);
        captures.preparedResults.push(result.success ? result.campaign : null);
        return result;
      }
    });

    domain.releaseFactory = Object.freeze({
      createCampaignRelease: function(draft){
        captures.drafts.push(clone(draft));
        var release = originals.releaseFactory.createCampaignRelease(draft);
        captures.releases.push(release);
        return release;
      }
    });
    domain.sessionFactory = Object.freeze({
      createStudentSession: function(release){
        captures.sessionInputs.push(release);
        var session = originals.sessionFactory.createStudentSession(release);
        captures.sessions.push(session);
        return session;
      }
    });
    domain.runtimeCore = Object.freeze(Object.assign({}, originals.runtimeCore, {
      createRuntime: function(release, session){
        captures.runtimeInputs.push({ release: release, session: session });
        var runtime = originals.runtimeCore.createRuntime(release, session);
        captures.runtimes.push(runtime);
        return runtime;
      }
    }));
    domain.navigationCore = Object.freeze(Object.assign({}, originals.navigationCore, {
      createNavigation: function(runtime, release){
        captures.navigationInputs.push({ runtime: runtime, release: release });
        var navigation = originals.navigationCore.createNavigation(runtime, release);
        captures.navigations.push(navigation);
        return navigation;
      }
    }));

    return captures;
  }

  async function identify(child) {
    child.go('reveal');
    child.document.getElementById('userNameInput').value = 'Alumno A2-014B';
    child.document.getElementById('characterNameInput').value = 'Operador A2-014B';
    child.document.getElementById('groupInput').value = 'A2-014B';
    await child.identifyUser();
  }

  function getSession(child) {
    var raw = child.sessionStorage.getItem('crios-session-data');
    return raw ? JSON.parse(raw) : null;
  }

  function childDiagnostics(child) {
    var diag = child.__CRIOS_A2_014B_DIAG__ || {};
    return {
      pageErrors: Array.isArray(diag.pageErrors) ? diag.pageErrors.slice() : [],
      consoleErrors: Array.isArray(diag.consoleErrors) ? diag.consoleErrors.slice() : [],
      unhandledRejections: Array.isArray(diag.unhandledRejections) ? diag.unhandledRejections.slice() : []
    };
  }

  async function run() {
    var details = {};
    try {
      localStorage.clear();
      sessionStorage.clear();

      var studioControlled = await prepareStudio();
      var studio = studioControlled.child;
      var registered = studio.REGISTRO_ESCENARIOS.registrar({
        id: customScenarioId,
        nombre: 'Órbita A2-014B',
        descripcion: 'Escenario controlado para caracterizar el puente published-domain.',
        version: '1.0'
      });
      assert('CUSTOM_SCENARIO_REGISTERED', Boolean(registered), 'No se registró el escenario controlado.');

      var missions = studio.CRIOS_STUDIO_ADAPTER.getMissions();
      missions.forEach(function(mission){
        if (!studio.CRIOS_CAMPAIGN_DRAFT.contieneMision(mission.id)) studio.CRIOS_CAMPAIGN_DRAFT.agregarMision(mission);
      });
      studio.CRIOS_CAMPAIGN_DRAFT.establecerNombre('Campaña Puente A2-014B');
      studio.CRIOS_CAMPAIGN_DRAFT.establecerDescripcion('Caracterización de identidad, escenario y orden.');
      studio.CRIOS_CAMPAIGN_DRAFT.establecerEscenario(customScenarioId);
      equal('DRAFT_CUSTOM_SCENARIO', studio.CRIOS_CAMPAIGN_DRAFT.obtenerEscenario(), customScenarioId);

      var validation = await studio.CRIOS_STUDIO.publication.validateCurrentDraft();
      assert('PUBLICATION_VALID', validation && validation.ok === true, 'La publicación controlada no validó.');
      var published = await studio.CRIOS_STUDIO.publication.publishCurrentDraft();
      assert('PUBLICATION_CREATED', published && published.success === true, 'No se creó la publicación.');
      var publication = published.publication;
      var campaignId = publication.campaignId;
      var publicationId = publication.publicationId;
      var contentHash = publication.contentHash;
      equal('PUBLICATION_SCENARIO_PRESERVED', publication.content.escenario, customScenarioId);
      var activated = await studio.CRIOS_STUDIO.activation.activatePublication(campaignId, publicationId);
      assert('PUBLICATION_ACTIVATED', activated && activated.success === true, 'No se activó la publicación.');
      await waitFor(function(){ return !studio.document.getElementById('studioRuntimeLaunchLink').hidden; }, 20000, 'launch-link');
      var launchHref = studio.document.getElementById('studioRuntimeLaunchLink').getAttribute('href');

      sessionStorage.clear();
      var firstControlled = await launchRuntime(new URL(launchHref, studio.location.href).href, 'A2-014B initial runtime');
      var firstRuntime = firstControlled.child;
      var firstCaptures = installBridgeInstrumentation(firstRuntime);
      await identify(firstRuntime);
      await waitFor(function(){ return !firstRuntime.document.getElementById('missionWelcome').classList.contains('hidden'); }, 30000, 'initial-identify');

      var firstSessionData = getSession(firstRuntime);
      var firstPrepared = firstCaptures.preparedResults[0];
      var firstDraft = firstCaptures.drafts[0];
      var firstRelease = firstCaptures.releases[0];
      var firstDomainSession = firstCaptures.sessions[0];
      var firstDomainRuntime = firstCaptures.runtimes[0];
      var firstNavigation = firstCaptures.navigations[0];
      var missionOrder = firstPrepared.data.missionOrder.slice();

      assert('INITIAL_PREPARE_USED', firstCaptures.prepareCalls.length === 1 && firstCaptures.recoverCalls.length === 0, 'No se usó prepare en el primer arranque.');
      equal('PREPARED_SOURCE_MODE', firstPrepared.data.sourceMode, 'published');
      equal('PREPARED_SCENARIO', firstPrepared.data.campaign.escenario, customScenarioId);
      equal('PREPARED_CAMPAIGN_ID', firstPrepared.data.campaign.campaignId, campaignId);
      equal('PREPARED_PUBLICATION_ID', firstPrepared.data.campaign.publicationId, publicationId);
      equal('PREPARED_CONTENT_HASH', firstPrepared.data.campaign.contentHash, contentHash);
      equal('ACTIVE_CAMPAIGN_SCENARIO', firstRuntime.CRIOS.obtenerCampanaActiva().escenario, customScenarioId);
      equal('ACTIVE_MISSION_ORDER', firstRuntime.CRIOS.obtenerMisionesActivas(), missionOrder);

      equal('BRIDGE_DRAFT_PUBLICATION_ID', firstDraft.id, publicationId);
      equal('BRIDGE_DRAFT_STATE_CURRENT', firstDraft.estado, 'draft');
      equal('BRIDGE_DRAFT_VERSION_CURRENT', firstDraft.version, 1);
      equal('BRIDGE_DRAFT_PUBLISHED_SCENARIO', firstDraft.escenario, customScenarioId);
      equal('BRIDGE_DRAFT_MISSION_ORDER', firstDraft.misiones.map(function(item){ return item.id; }), missionOrder);

      equal('DOMAIN_RELEASE_PUBLICATION_ID', firstRelease.id, publicationId);
      assert('DOMAIN_RELEASE_NOT_CAMPAIGN_ID', firstRelease.id !== campaignId, 'Release reutilizó campaignId.');
      equal('DOMAIN_RELEASE_PUBLISHED_SCENARIO', firstRelease.scenario, customScenarioId);
      equal('DOMAIN_RELEASE_MISSION_ORDER', firstRelease.missions.map(function(item){ return item.id; }), missionOrder);
      assert('DOMAIN_RELEASE_FROZEN', Object.isFrozen(firstRelease), 'Release no congelado.');

      equal('DOMAIN_SESSION_RELEASE_LINK', firstDomainSession.releaseId, firstRelease.id);
      equal('DOMAIN_SESSION_FIRST_MISSION', firstDomainSession.progress.currentMissionId, missionOrder[0]);
      equal('DOMAIN_RUNTIME_RELEASE_LINK', firstDomainRuntime.session.releaseId, firstRelease.id);
      equal('DOMAIN_RUNTIME_FIRST_MISSION', firstDomainRuntime.mission.id, missionOrder[0]);
      equal('DOMAIN_NAVIGATION_FIRST_MISSION', firstNavigation.currentMissionId, missionOrder[0]);
      equal('DOMAIN_NAVIGATION_RELEASE_REFERENCE', firstCaptures.navigationInputs[0].release.id, firstRelease.id);

      equal('SESSION_PIN_SOURCE', firstSessionData.campana.sourceMode, 'published');
      equal('SESSION_PIN_CAMPAIGN', firstSessionData.campana.campaignId, campaignId);
      equal('SESSION_PIN_PUBLICATION', firstSessionData.campana.publicationId, publicationId);
      equal('SESSION_PIN_CONTENT_HASH', firstSessionData.campana.contentHash, contentHash);
      equal('SESSION_PIN_SCENARIO', firstSessionData.campana.escenario, customScenarioId);
      assert('INITIAL_NO_SILENT_FALLBACK', !firstRuntime.document.getElementById('legacyLaunchFallback'), 'Apareció fallback durante el arranque válido.');

      var firstDiag = childDiagnostics(firstRuntime);
      equal('INITIAL_PAGE_ERRORS', firstDiag.pageErrors.length, 0);
      equal('INITIAL_CONSOLE_ERRORS', firstDiag.consoleErrors.length, 0);
      equal('INITIAL_REJECTIONS', firstDiag.unhandledRejections.length, 0);
      firstControlled.frame.remove();

      var recoveryControlled = await launchRuntime(new URL(launchHref, studio.location.href).href, 'A2-014B recovery runtime');
      var recoveryRuntime = recoveryControlled.child;
      var recoveryCaptures = installBridgeInstrumentation(recoveryRuntime);
      await identify(recoveryRuntime);
      await waitFor(function(){ return !recoveryRuntime.document.getElementById('missionWelcome').classList.contains('hidden'); }, 30000, 'recovery-identify');

      var recoveredSessionData = getSession(recoveryRuntime);
      var recoveredPrepared = recoveryCaptures.preparedResults[0];
      var recoveredDraft = recoveryCaptures.drafts[0];
      var recoveredRelease = recoveryCaptures.releases[0];
      assert('RECOVERY_API_USED', recoveryCaptures.prepareCalls.length === 0 && recoveryCaptures.recoverCalls.length === 1, 'No se usó recoverPublishedCampaign.');
      equal('RECOVERY_PIN_PUBLICATION', recoveryCaptures.recoverCalls[0].publicationId, publicationId);
      equal('RECOVERY_PIN_HASH', recoveryCaptures.recoverCalls[0].contentHash, contentHash);
      equal('RECOVERY_PREPARED_SCENARIO', recoveredPrepared.data.campaign.escenario, customScenarioId);
      equal('RECOVERY_SESSION_PUBLICATION', recoveredSessionData.campana.publicationId, publicationId);
      equal('RECOVERY_SESSION_HASH', recoveredSessionData.campana.contentHash, contentHash);
      equal('RECOVERY_DRAFT_PUBLICATION_ID', recoveredDraft.id, publicationId);
      equal('RECOVERY_DRAFT_PUBLISHED_SCENARIO', recoveredDraft.escenario, customScenarioId);
      equal('RECOVERY_RELEASE_PUBLISHED_SCENARIO', recoveredRelease.scenario, customScenarioId);
      equal('RECOVERY_RELEASE_PUBLICATION_ID', recoveredRelease.id, publicationId);
      assert('RECOVERY_NO_SILENT_FALLBACK', !recoveryRuntime.document.getElementById('legacyLaunchFallback'), 'Apareció fallback durante recuperación válida.');
      var recoveryDiag = childDiagnostics(recoveryRuntime);
      equal('RECOVERY_PAGE_ERRORS', recoveryDiag.pageErrors.length, 0);
      equal('RECOVERY_CONSOLE_ERRORS', recoveryDiag.consoleErrors.length, 0);
      equal('RECOVERY_REJECTIONS', recoveryDiag.unhandledRejections.length, 0);
      recoveryControlled.frame.remove();

      var persisted = JSON.parse(localStorage.getItem(storageKey));
      var activeReference = persisted.activeReferences.find(function(item){ return item.campaignId === campaignId; });
      assert('CORRUPTION_REFERENCE_FOUND', Boolean(activeReference), 'No se encontró referencia activa.');
      activeReference.contentHash = activeReference.contentHash === 'f'.repeat(64) ? 'e'.repeat(64) : 'f'.repeat(64);
      localStorage.setItem(storageKey, JSON.stringify(persisted));
      sessionStorage.clear();

      var blockedControlled = await launchRuntime(new URL(launchHref, studio.location.href).href, 'A2-014B blocked runtime');
      var blockedRuntime = blockedControlled.child;
      var blockedCaptures = installBridgeInstrumentation(blockedRuntime);
      await identify(blockedRuntime);
      await waitFor(function(){
        var feedback = blockedRuntime.document.getElementById('nameFeedback');
        return feedback && feedback.classList.contains('show') && feedback.classList.contains('bad');
      }, 30000, 'blocked-feedback');
      assert('BLOCKED_NO_LEGACY_FALLBACK', !blockedRuntime.document.getElementById('legacyLaunchFallback'), 'No debe ofrecerse acceso legacy.');
      equal('BLOCKED_NO_DOMAIN_DRAFT', blockedCaptures.drafts.length, 0);
      equal('BLOCKED_NO_DOMAIN_RELEASE', blockedCaptures.releases.length, 0);
      equal('BLOCKED_NO_SESSION', getSession(blockedRuntime), null);
      equal('BLOCKED_NO_ACTIVE_MISSIONS', blockedRuntime.CRIOS.obtenerMisionesActivas().length, 0);
      var blockedDiag = childDiagnostics(blockedRuntime);
      equal('BLOCKED_PAGE_ERRORS', blockedDiag.pageErrors.length, 0);
      equal('BLOCKED_CONSOLE_ERRORS', blockedDiag.consoleErrors.length, 0);
      equal('BLOCKED_REJECTIONS', blockedDiag.unhandledRejections.length, 0);

      details = {
        campaignId: campaignId,
        publicationId: publicationId,
        contentHash: contentHash,
        customScenarioId: customScenarioId,
        missionOrder: missionOrder,
        currentBridge: {
          draft: firstDraft,
          releaseId: firstRelease.id,
          releaseScenario: firstRelease.scenario
        },
        recoveryBridge: {
          draft: recoveredDraft,
          releaseId: recoveredRelease.id,
          releaseScenario: recoveredRelease.scenario
        }
      };
    } catch (error) {
      pageErrors.push(String(error && error.stack || error));
    } finally {
      try { localStorage.clear(); } catch (ignoreLocal) {}
      try { sessionStorage.clear(); } catch (ignoreSession) {}
      frames.forEach(function(frame){ try { frame.remove(); } catch (ignoreFrame) {} });
      console.error = originalConsoleError;

      var failed = assertions.filter(function(item){ return !item.passed; });
      var result = freeze({
        status: failed.length === 0 && pageErrors.length === 0 && consoleErrors.length === 0 && unhandledRejections.length === 0 ? 'PASS' : 'FAIL',
        total: assertions.length,
        passed: assertions.length - failed.length,
        failed: failed.length,
        assertions: assertions.slice(),
        failedAssertions: failed.slice(),
        pageErrors: pageErrors.slice(),
        consoleErrors: consoleErrors.slice(),
        unhandledRejections: unhandledRejections.slice(),
        details: details,
        cleanup: {
          localStorageCleared: localStorage.length === 0,
          sessionStorageCleared: sessionStorage.length === 0,
          framesRemoved: document.querySelectorAll('iframe').length === 0
        },
        durationMs: Number((performance.now() - startedAt).toFixed(3))
      });

      Object.defineProperty(window, 'CRIOS_PUBLISHED_DOMAIN_BRIDGE_CHARACTERIZATION_RESULTS', {
        value: result,
        enumerable: true,
        configurable: false,
        writable: false
      });
      document.getElementById('results').textContent = JSON.stringify(result, null, 2);
    }
  }

  run();
})();
