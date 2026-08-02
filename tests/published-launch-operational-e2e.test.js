/* CRIOS published launch - durable operational E2E */
(function(){
  'use strict';

  var startedAt = performance.now();
  var assertions = [];
  var pageErrors = [];
  var consoleErrors = [];
  var unhandledRejections = [];
  var frameDiagnostics = [];
  var frames = [];
  var originalConsoleError = console.error;
  var storageKey = 'crios.publication.persistence.v1';

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
      'window.__CRIOS_OPERATIONAL_E2E_DIAG__={pageErrors:[],consoleErrors:[],unhandledRejections:[],fetchCalls:[]};',
      'window.addEventListener("error",function(event){window.__CRIOS_OPERATIONAL_E2E_DIAG__.pageErrors.push(String(event.error&&event.error.stack||event.message||event.error||"PAGE_ERROR"));});',
      'window.addEventListener("unhandledrejection",function(event){window.__CRIOS_OPERATIONAL_E2E_DIAG__.unhandledRejections.push(String(event.reason&&event.reason.stack||event.reason||"UNHANDLED_REJECTION"));});',
      'var originalError=console.error;console.error=function(){window.__CRIOS_OPERATIONAL_E2E_DIAG__.consoleErrors.push(Array.prototype.map.call(arguments,String).join(" "));return originalError.apply(console,arguments);};',
      '})();'
    ].join('');
  }

  function runtimeStubs() {
    return [
      'window.fetch=async function(input,init){',
      'var url=String(input&&input.url||input||"");',
      'window.__CRIOS_OPERATIONAL_E2E_DIAG__.fetchCalls.push({url:url,method:String(init&&init.method||"GET")});',
      'if(url.indexOf("accion=grupos")>=0){return new Response(JSON.stringify({ok:true,grupos:["ALUMNO_STAGE4"]}),{status:200,headers:{"Content-Type":"application/json"}});}',
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
    frame.title = options.title || 'CRIOS controlled frame';
    frames.push(frame);
    document.body.appendChild(frame);
    frame.src = './published-launch-operational-e2e.test.html?shell=1&token=' + Math.random().toString(36).slice(2);
    await waitFor(function(){
      return frame.contentWindow && frame.contentWindow.location.pathname.endsWith('/tests/published-launch-operational-e2e.test.html');
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
    var injection = '<base href="' + basePath + '">' + scriptTag(bootstrap);
    source = source.replace('<head>', '<head>' + injection);

    var child = frame.contentWindow;
    child.document.open();
    child.document.write(source);
    child.document.close();
    return { frame: frame, child: child, target: target };
  }

  function snapshotDiagnostics(label, child) {
    var diag = child && child.__CRIOS_OPERATIONAL_E2E_DIAG__;
    var snapshot = freeze({
      label: label,
      pageErrors: Array.isArray(diag && diag.pageErrors) ? diag.pageErrors.slice() : [],
      consoleErrors: Array.isArray(diag && diag.consoleErrors) ? diag.consoleErrors.slice() : [],
      unhandledRejections: Array.isArray(diag && diag.unhandledRejections) ? diag.unhandledRejections.slice() : [],
      fetchCalls: Array.isArray(diag && diag.fetchCalls) ? diag.fetchCalls.slice() : []
    });
    frameDiagnostics.push(snapshot);
    return snapshot;
  }

  function persistenceStatus(studio) {
    return studio.CRIOS_STUDIO.persistence.getStatus();
  }

  function linkSnapshot(studio) {
    var link = studio.document.getElementById('studioRuntimeLaunchLink');
    return {
      exists: Boolean(link),
      hidden: Boolean(link && link.hidden),
      text: link ? link.textContent.trim() : '',
      href: link ? link.getAttribute('href') : null,
      target: link ? link.getAttribute('target') : null,
      rel: link ? link.getAttribute('rel') : null,
      campaignId: link && link.dataset ? link.dataset.campaignId || null : null,
      publicationId: link && link.dataset ? link.dataset.publicationId || null : null
    };
  }

  async function prepareStudio() {
    var controlled = await createControlledDocument({
      title: 'CRIOS Studio operational E2E',
      targetUrl: '../studio/index.html',
      sourceUrl: '../studio/index.html',
      runtime: false
    });
    var studio = controlled.child;
    await waitFor(function(){
      return studio.CRIOS_STUDIO && studio.CRIOS_STUDIO_ADAPTER && studio.CRIOS_CAMPAIGN_DRAFT &&
        studio.CRIOS_STUDIO.runtimeLaunch && studio.CRIOS_STUDIO.publication &&
        studio.CRIOS_STUDIO.activation && studio.CRIOS_STUDIO.persistence;
    }, 30000, 'studio-public-api');
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
      return child.CRIOS && child.CRIOS.runtimeLaunch && child.document.getElementById('groupInput');
    }, 30000, label + '-bootstrap');
    return controlled;
  }

  async function waitGroups(child, label) {
    await waitFor(function(){
      var group = child.document.getElementById('groupInput');
      var button = child.document.getElementById('identifyButton');
      return group && button && !group.disabled && !button.disabled;
    }, 30000, label + '-groups');
  }

  async function identify(child, realName, characterName, groupName) {
    child.go('reveal');
    child.document.getElementById('userNameInput').value = realName;
    child.document.getElementById('characterNameInput').value = characterName;
    child.document.getElementById('groupInput').value = groupName;
    await child.identifyUser();
  }

  function getSession(child) {
    var raw = child.sessionStorage.getItem('crios-session-data');
    return raw ? JSON.parse(raw) : null;
  }

  async function solveFirstMission(child) {
    var ids = child.CRIOS.obtenerMisionesActivas();
    var missionId = ids[0];
    child.document.getElementById('campaignEntryButton').click();
    await waitFor(function(){ return child.document.getElementById('map').classList.contains('active'); }, 10000, 'map-active');
    child.openMission(missionId);
    await waitFor(function(){ return child.document.getElementById('mission-' + missionId).classList.contains('active'); }, 10000, 'mission-active');

    var statement = child.document.getElementById('missionText-' + missionId).textContent;
    var numbers = (statement.match(/\d+(?:[.,]\d+)?/g) || []).map(function(value){ return Number(value.replace(',', '.')); });
    if (missionId !== 'energy' || numbers.length < 5) throw new Error('UNEXPECTED_FIRST_MISSION_SHAPE');
    var expected = numbers[0] * numbers[1] - numbers[3] * numbers[4];
    var procedure = numbers[0] + '*' + numbers[1] + '-' + numbers[3] + '*' + numbers[4];
    child.document.getElementById('procedure-' + missionId).value = procedure;
    child.validateProcedure(missionId);
    child.document.getElementById('answer-' + missionId).value = String(expected);
    child.validateMissionResult(missionId);
    await waitFor(function(){
      var session = getSession(child);
      return session && session.misiones && session.misiones[missionId] && session.misiones[missionId].answerCorrect === true;
    }, 10000, 'mission-solved');
    return { missionId: missionId, expected: expected, procedure: procedure, numbers: numbers };
  }

  async function expectOperationalBlock(href, label) {
    sessionStorage.clear();
    var controlled = await launchRuntime(href, label);
    var child = controlled.child;
    await waitGroups(child, label);
    await identify(child, 'Alumno Stage 4', 'Operador Stage 4', 'ALUMNO_STAGE4');
    await waitFor(function(){ return child.document.getElementById('legacyLaunchFallback'); }, 30000, label + '-fallback');
    var fallback = child.document.getElementById('legacyLaunchFallback');
    var feedback = child.document.getElementById('nameFeedback').textContent;
    var result = {
      child: child,
      controlled: controlled,
      fallbackHref: fallback.href,
      fallbackSearch: new URL(fallback.href).search,
      feedback: feedback,
      session: getSession(child),
      missionCount: child.CRIOS.obtenerMisionesActivas().length
    };
    return result;
  }

  async function run() {
    var details = {};
    var studioControlled = null;
    var successfulRuntime = null;
    var deactivatedRuntime = null;
    var legacyRuntime = null;
    var corruptedRuntime = null;

    try {
      localStorage.clear();
      sessionStorage.clear();

      studioControlled = await prepareStudio();
      var studio = studioControlled.child;
      var initialState = studio.CRIOS_STUDIO.runtimeLaunch.getState();
      var initialLink = linkSnapshot(studio);
      details.initialState = initialState;
      assert('STUDIO_API_EXISTS', Boolean(studio.CRIOS_STUDIO), 'CRIOS_STUDIO no disponible.');
      assert('STUDIO_RUNTIME_LAUNCH_VERSION', studio.CRIOS_STUDIO.runtimeLaunch.version === '1.0.0', 'Versión inesperada.');
      assert('STUDIO_RUNTIME_LAUNCH_FROZEN', Object.isFrozen(studio.CRIOS_STUDIO.runtimeLaunch), 'API no congelada.');
      assert('STUDIO_INITIAL_UNAVAILABLE', initialState.available === false, 'Estado inicial debe estar bloqueado.');
      assert('STUDIO_INITIAL_STATUS', initialState.status === 'NO_ACTIVE_PUBLICATION', 'Estado inicial incorrecto.');
      assert('STUDIO_LINK_EXISTS', initialLink.exists, 'Falta enlace de Runtime.');
      assert('STUDIO_LINK_INITIAL_HIDDEN', initialLink.hidden, 'Enlace inicial visible.');
      assert('STUDIO_LINK_INITIAL_NO_HREF', initialLink.href === null, 'Enlace inicial conserva href.');
      assert('STUDIO_LINK_INITIAL_NO_TARGET', initialLink.target === null, 'Enlace inicial conserva target.');
      assert('STUDIO_LINK_INITIAL_NO_REL', initialLink.rel === null, 'Enlace inicial conserva rel.');

      var missions = studio.CRIOS_STUDIO_ADAPTER.getMissions();
      equal('DRAFT_SOURCE_MISSION_COUNT', missions.length, 4);
      missions.forEach(function(mission){
        if (!studio.CRIOS_CAMPAIGN_DRAFT.contieneMision(mission.id)) studio.CRIOS_CAMPAIGN_DRAFT.agregarMision(mission);
      });
      studio.CRIOS_CAMPAIGN_DRAFT.establecerNombre('Campaña Operativa Stage 4');
      studio.CRIOS_CAMPAIGN_DRAFT.establecerDescripcion('Validación durable de Studio a Runtime.');
      equal('DRAFT_MISSION_COUNT', studio.CRIOS_CAMPAIGN_DRAFT.obtenerMisiones().length, 4);
      assert('DRAFT_NAME_SET', studio.CRIOS_CAMPAIGN_DRAFT.obtenerNombre() === 'Campaña Operativa Stage 4', 'Nombre no aplicado.');
      assert('DRAFT_DESCRIPTION_SET', studio.CRIOS_CAMPAIGN_DRAFT.obtenerDescripcion() === 'Validación durable de Studio a Runtime.', 'Descripción no aplicada.');

      var validation = await studio.CRIOS_STUDIO.publication.validateCurrentDraft();
      details.validation = validation;
      assert('PUBLICATION_VALIDATION_OK', validation && validation.ok === true, 'Validación no aprobada.');
      assert('PUBLICATION_VALIDATION_NO_ERROR', validation && validation.error === null, 'Validación devolvió error.');
      assert('PUBLICATION_VALIDATION_RUNTIME_COMPATIBLE', validation && validation.validation && validation.validation.levels.runtimeCompatibility.valid === true, 'Runtime incompatible.');
      assert('PUBLICATION_VALIDATION_PUBLISHABLE', validation && validation.validation && validation.validation.levels.publishability.valid === true, 'Draft no publicable.');

      var published = await studio.CRIOS_STUDIO.publication.publishCurrentDraft();
      var publication = published && published.publication;
      var campaignId = publication && publication.campaignId;
      var publicationId = publication && publication.publicationId;
      var afterPublish = persistenceStatus(studio);
      details.campaignId = campaignId;
      details.publicationId = publicationId;
      assert('PUBLISH_SUCCESS', published && published.success === true, 'Publicación falló.');
      assert('PUBLISH_OBJECT_PRESENT', Boolean(publication), 'Publicación ausente.');
      assert('PUBLISH_CAMPAIGN_ID', typeof campaignId === 'string' && campaignId.length > 0, 'campaignId ausente.');
      assert('PUBLISH_PUBLICATION_ID', typeof publicationId === 'string' && publicationId.length > 0, 'publicationId ausente.');
      equal('PUBLISH_MISSION_SPEC_COUNT', publication.content.missionSpecs.length, 4);
      assert('PERSISTENCE_READY_AFTER_PUBLISH', afterPublish.status === 'READY', 'Persistencia no READY.');
      equal('PERSISTENCE_PUBLICATION_COUNT', afterPublish.publicationCount, 1);
      equal('PERSISTENCE_REVISION_AFTER_PUBLISH', afterPublish.stateRevision, 1);
      assert('PUBLISHED_DOCUMENT_PRESENT', Boolean(localStorage.getItem(storageKey)), 'Documento persistido ausente.');

      var activated = await studio.CRIOS_STUDIO.activation.activatePublication(campaignId, publicationId);
      await waitFor(function(){ return !studio.document.getElementById('studioRuntimeLaunchLink').hidden; }, 20000, 'studio-link-active');
      var activeState = studio.CRIOS_STUDIO.runtimeLaunch.getState();
      var activeLink = linkSnapshot(studio);
      var afterActivate = persistenceStatus(studio);
      var launchHref = activeLink.href;
      details.launchHref = launchHref;
      assert('ACTIVATION_SUCCESS', activated && activated.success === true, 'Activación falló.');
      equal('PERSISTENCE_REVISION_AFTER_ACTIVATE', afterActivate.stateRevision, 2);
      assert('LAUNCH_AVAILABLE', activeState.available === true, 'Launch no disponible.');
      assert('LAUNCH_STATE_FROZEN', Object.isFrozen(activeState), 'Estado launch no congelado.');
      assert('LAUNCH_STATUS_AVAILABLE', activeState.status === 'AVAILABLE', 'Estado launch incorrecto.');
      assert('LAUNCH_CAMPAIGN_ID', activeState.campaignId === campaignId, 'campaignId launch incorrecto.');
      assert('LAUNCH_PUBLICATION_ID', activeState.publicationId === publicationId, 'publicationId launch incorrecto.');
      assert('LAUNCH_LINK_VISIBLE', activeLink.hidden === false, 'Enlace activo oculto.');
      assert('LAUNCH_LINK_TEXT', activeLink.text === 'Abrir campaña en CRIOS', 'Texto incorrecto.');
      assert('LAUNCH_LINK_HREF', activeLink.href === '../index.html?source=published&campaignId=' + encodeURIComponent(campaignId), 'Href incorrecto.');
      assert('LAUNCH_LINK_TARGET', activeLink.target === '_blank', 'Target incorrecto.');
      assert('LAUNCH_LINK_REL', activeLink.rel === 'noopener', 'Rel incorrecto.');
      assert('LAUNCH_LINK_DATA_CAMPAIGN', activeLink.campaignId === campaignId, 'Dataset campaign incorrecto.');
      assert('LAUNCH_LINK_DATA_PUBLICATION', activeLink.publicationId === publicationId, 'Dataset publication incorrecto.');

      sessionStorage.clear();
      successfulRuntime = await launchRuntime(new URL(launchHref, studio.location.href).href, 'Runtime published success');
      var runtime = successfulRuntime.child;
      await waitGroups(runtime, 'runtime-success');
      assert('RUNTIME_URL_SOURCE_PUBLISHED', new URL(runtime.location.href).searchParams.get('source') === 'published', 'source no published.');
      assert('RUNTIME_URL_CAMPAIGN_ID', new URL(runtime.location.href).searchParams.get('campaignId') === campaignId, 'campaignId URL incorrecto.');
      assert('RUNTIME_MODE_PUBLISHED', runtime.CRIOS.runtimeCampaignMode === 'published', 'Modo Runtime incorrecto.');
      assert('RUNTIME_LAUNCH_EXPLICIT', runtime.CRIOS.runtimeLaunch.explicit === true, 'Launch no explícito.');
      assert('RUNTIME_LAUNCH_NOT_BLOCKED', runtime.CRIOS.runtimeLaunch.blocked === false, 'Launch bloqueado.');
      assert('RUNTIME_LAUNCH_CAMPAIGN', runtime.CRIOS.runtimeLaunch.campaignId === campaignId, 'Campaign launch incorrecta.');
      assert('RUNTIME_LAUNCH_FROZEN', Object.isFrozen(runtime.CRIOS.runtimeLaunch), 'Launch Runtime no congelado.');

      await identify(runtime, 'Alumno Stage 4', 'Operador Stage 4', 'ALUMNO_STAGE4');
      await waitFor(function(){ return !runtime.document.getElementById('missionWelcome').classList.contains('hidden'); }, 30000, 'runtime-identified');
      var runtimeSession = getSession(runtime);
      assert('RUNTIME_SESSION_PRESENT', Boolean(runtimeSession), 'Sesión Runtime ausente.');
      assert('RUNTIME_SESSION_CAMPAIGN', runtimeSession.campana.campaignId === campaignId, 'Campaña de sesión incorrecta.');
      assert('RUNTIME_SESSION_PUBLICATION', runtimeSession.campana.publicationId === publicationId, 'Publicación de sesión incorrecta.');
      assert('RUNTIME_SESSION_SOURCE_MODE', runtimeSession.campana.sourceMode === 'published', 'sourceMode de sesión incorrecto.');
      equal('RUNTIME_MISSION_COUNT', runtime.CRIOS.obtenerMisionesActivas().length, 4);
      assert('RUNTIME_ENTRY_BUTTON', runtime.document.getElementById('campaignEntryButton').textContent.trim() === 'Continuar campaña', 'Botón de entrada incorrecto.');
      assert('RUNTIME_ENTRY_PROMPT', /campaña publicada está preparada/i.test(runtime.document.getElementById('campaignEntryPrompt').textContent), 'Prompt publicado incorrecto.');
      assert('RUNTIME_NO_FALLBACK_ON_SUCCESS', !runtime.document.getElementById('legacyLaunchFallback'), 'Fallback inesperado.');

      var solved = await solveFirstMission(runtime);
      var solvedSession = getSession(runtime);
      details.solvedMission = solved;
      assert('MISSION_FIRST_ID_ENERGY', solved.missionId === 'energy', 'Primera misión inesperada.');
      assert('MISSION_PROCEDURE_CORRECT', solvedSession.misiones[solved.missionId].procedureCorrect === true, 'Procedimiento no aprobado.');
      assert('MISSION_ANSWER_CORRECT', solvedSession.misiones[solved.missionId].answerCorrect === true, 'Respuesta no aprobada.');
      equal('MISSION_EXPECTED_RECORDED', solvedSession.misiones[solved.missionId].expected, solved.expected);
      assert('MISSION_PROGRESS_SAVED', runtime.sessionStorage.getItem('crios-progreso-campanas-v1') !== null, 'Progreso no guardado.');
      var successDiag = snapshotDiagnostics('runtime-success', runtime);
      equal('RUNTIME_SUCCESS_PAGE_ERRORS', successDiag.pageErrors.length, 0);
      equal('RUNTIME_SUCCESS_CONSOLE_ERRORS', successDiag.consoleErrors.length, 0);
      equal('RUNTIME_SUCCESS_REJECTIONS', successDiag.unhandledRejections.length, 0);
      assert('RUNTIME_GROUP_FETCH_INTERCEPTED', successDiag.fetchCalls.some(function(call){ return call.url.indexOf('accion=grupos') >= 0; }), 'No se interceptó carga de grupos.');
      successfulRuntime.frame.remove();
      successfulRuntime = null;

      var deactivated = await Promise.resolve(studio.CRIOS_STUDIO.activation.deactivatePublication(campaignId));
      await waitFor(function(){ return studio.document.getElementById('studioRuntimeLaunchLink').hidden; }, 20000, 'studio-link-deactivated');
      var deactivatedState = studio.CRIOS_STUDIO.runtimeLaunch.getState();
      var deactivatedLink = linkSnapshot(studio);
      var afterDeactivate = persistenceStatus(studio);
      assert('DEACTIVATION_SUCCESS', deactivated && deactivated.success === true, 'Desactivación falló.');
      equal('PERSISTENCE_REVISION_AFTER_DEACTIVATE', afterDeactivate.stateRevision, 3);
      assert('DEACTIVATED_UNAVAILABLE', deactivatedState.available === false, 'Estado sigue disponible.');
      assert('DEACTIVATED_LINK_HIDDEN', deactivatedLink.hidden === true, 'Enlace no se ocultó.');
      assert('DEACTIVATED_LINK_NO_HREF', deactivatedLink.href === null, 'Href no se limpió.');
      assert('DEACTIVATED_LINK_NO_TARGET', deactivatedLink.target === null, 'Target no se limpió.');
      assert('DEACTIVATED_LINK_NO_REL', deactivatedLink.rel === null, 'Rel no se limpió.');
      assert('DEACTIVATED_LINK_NO_CAMPAIGN_DATA', deactivatedLink.campaignId === null, 'Dataset campaign no se limpió.');
      assert('DEACTIVATED_LINK_NO_PUBLICATION_DATA', deactivatedLink.publicationId === null, 'Dataset publication no se limpió.');

      deactivatedRuntime = await expectOperationalBlock(new URL(launchHref, studio.location.href).href, 'Runtime deactivated block');
      assert('DEACTIVATED_RUNTIME_STILL_PUBLISHED_REQUEST', deactivatedRuntime.child.CRIOS.runtimeCampaignMode === 'published', 'Solicitud publicada alterada.');
      assert('DEACTIVATED_RUNTIME_BLOCK_MESSAGE', /no está disponible/i.test(deactivatedRuntime.feedback), 'Mensaje de bloqueo ausente.');
      assert('DEACTIVATED_RUNTIME_FALLBACK_PRESENT', Boolean(deactivatedRuntime.child.document.getElementById('legacyLaunchFallback')), 'Fallback ausente.');
      assert('DEACTIVATED_RUNTIME_FALLBACK_SEARCH', deactivatedRuntime.fallbackSearch === '?source=legacy', 'Fallback legacy incorrecto.');
      assert('DEACTIVATED_RUNTIME_NO_SESSION', deactivatedRuntime.session === null, 'Se creó una sesión al bloquear.');
      equal('DEACTIVATED_RUNTIME_NO_MISSIONS', deactivatedRuntime.missionCount, 0);
      var deactivatedDiag = snapshotDiagnostics('runtime-deactivated', deactivatedRuntime.child);
      equal('DEACTIVATED_RUNTIME_PAGE_ERRORS', deactivatedDiag.pageErrors.length, 0);
      equal('DEACTIVATED_RUNTIME_CONSOLE_ERRORS', deactivatedDiag.consoleErrors.length, 0);
      equal('DEACTIVATED_RUNTIME_REJECTIONS', deactivatedDiag.unhandledRejections.length, 0);

      sessionStorage.clear();
      legacyRuntime = await launchRuntime(deactivatedRuntime.fallbackHref, 'Runtime explicit legacy recovery');
      await waitGroups(legacyRuntime.child, 'runtime-legacy');
      assert('LEGACY_RECOVERY_MODE', legacyRuntime.child.CRIOS.runtimeCampaignMode === 'legacy', 'Fallback no abrió legacy.');
      assert('LEGACY_RECOVERY_EXPLICIT', legacyRuntime.child.CRIOS.runtimeLaunch.explicit === true, 'Fallback no explícito.');
      assert('LEGACY_RECOVERY_NOT_BLOCKED', legacyRuntime.child.CRIOS.runtimeLaunch.blocked === false, 'Fallback bloqueado.');
      assert('LEGACY_RECOVERY_NO_CAMPAIGN_ID', legacyRuntime.child.CRIOS.runtimeLaunch.campaignId === null, 'Fallback conserva campaignId.');
      var legacyDiag = snapshotDiagnostics('runtime-legacy', legacyRuntime.child);
      equal('LEGACY_RECOVERY_PAGE_ERRORS', legacyDiag.pageErrors.length, 0);
      equal('LEGACY_RECOVERY_CONSOLE_ERRORS', legacyDiag.consoleErrors.length, 0);
      equal('LEGACY_RECOVERY_REJECTIONS', legacyDiag.unhandledRejections.length, 0);
      legacyRuntime.frame.remove();
      legacyRuntime = null;
      deactivatedRuntime.controlled.frame.remove();
      deactivatedRuntime = null;

      var reactivated = await studio.CRIOS_STUDIO.activation.activatePublication(campaignId, publicationId);
      await waitFor(function(){ return !studio.document.getElementById('studioRuntimeLaunchLink').hidden; }, 20000, 'studio-link-reactivated');
      var reactivatedState = studio.CRIOS_STUDIO.runtimeLaunch.getState();
      var reactivatedLink = linkSnapshot(studio);
      var afterReactivate = persistenceStatus(studio);
      assert('REACTIVATION_SUCCESS', reactivated && reactivated.success === true, 'Reactivación falló.');
      equal('PERSISTENCE_REVISION_AFTER_REACTIVATE', afterReactivate.stateRevision, 4);
      assert('REACTIVATED_AVAILABLE', reactivatedState.available === true, 'Reactivación no disponible.');
      assert('REACTIVATED_LINK_VISIBLE', reactivatedLink.hidden === false, 'Enlace reactivado oculto.');
      assert('REACTIVATED_LINK_HREF_RESTORED', reactivatedLink.href === launchHref, 'Href no restaurado.');
      assert('REACTIVATED_LINK_TARGET_RESTORED', reactivatedLink.target === '_blank', 'Target no restaurado.');
      assert('REACTIVATED_LINK_REL_RESTORED', reactivatedLink.rel === 'noopener', 'Rel no restaurado.');
      assert('REACTIVATED_LINK_CAMPAIGN_DATA', reactivatedLink.campaignId === campaignId, 'Dataset campaign no restaurado.');
      assert('REACTIVATED_LINK_PUBLICATION_DATA', reactivatedLink.publicationId === publicationId, 'Dataset publication no restaurado.');

      var rawDocument = JSON.parse(localStorage.getItem(storageKey));
      var activeReference = rawDocument.activeReferences.find(function(item){ return item.campaignId === campaignId; });
      assert('CORRUPTION_TARGET_REFERENCE_FOUND', Boolean(activeReference), 'Referencia a corromper ausente.');
      activeReference.contentHash = activeReference.contentHash === 'f'.repeat(64) ? 'e'.repeat(64) : 'f'.repeat(64);
      localStorage.setItem(storageKey, JSON.stringify(rawDocument));
      sessionStorage.clear();
      corruptedRuntime = await expectOperationalBlock(new URL(reactivatedLink.href, studio.location.href).href, 'Runtime corrupted persistence block');
      assert('CORRUPTED_RUNTIME_BLOCK_MESSAGE', /no está disponible/i.test(corruptedRuntime.feedback), 'Corrupción no bloqueada.');
      assert('CORRUPTED_RUNTIME_FALLBACK_PRESENT', Boolean(corruptedRuntime.child.document.getElementById('legacyLaunchFallback')), 'Fallback ausente ante corrupción.');
      assert('CORRUPTED_RUNTIME_FALLBACK_SEARCH', corruptedRuntime.fallbackSearch === '?source=legacy', 'Fallback de corrupción incorrecto.');
      assert('CORRUPTED_RUNTIME_NO_SESSION', corruptedRuntime.session === null, 'Corrupción creó sesión.');
      equal('CORRUPTED_RUNTIME_NO_MISSIONS', corruptedRuntime.missionCount, 0);
      var corruptedDiag = snapshotDiagnostics('runtime-corrupted', corruptedRuntime.child);
      equal('CORRUPTED_RUNTIME_PAGE_ERRORS', corruptedDiag.pageErrors.length, 0);
      equal('CORRUPTED_RUNTIME_CONSOLE_ERRORS', corruptedDiag.consoleErrors.length, 0);
      equal('CORRUPTED_RUNTIME_REJECTIONS', corruptedDiag.unhandledRejections.length, 0);
      corruptedRuntime.controlled.frame.remove();
      corruptedRuntime = null;

      var studioDiag = snapshotDiagnostics('studio', studio);
      equal('STUDIO_PAGE_ERRORS', studioDiag.pageErrors.length, 0);
      equal('STUDIO_CONSOLE_ERRORS', studioDiag.consoleErrors.length, 0);
      equal('STUDIO_REJECTIONS', studioDiag.unhandledRejections.length, 0);
      equal('PERSISTENCE_REVISION_SEQUENCE', [afterPublish.stateRevision, afterActivate.stateRevision, afterDeactivate.stateRevision, afterReactivate.stateRevision], [1,2,3,4]);
      details.revisions = [1,2,3,4];
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
        frameDiagnostics: frameDiagnostics.slice(),
        details: details,
        cleanup: {
          localStorageCleared: localStorage.length === 0,
          sessionStorageCleared: sessionStorage.length === 0,
          framesRemoved: document.querySelectorAll('iframe').length === 0
        },
        durationMs: Number((performance.now() - startedAt).toFixed(3))
      });

      Object.defineProperty(window, 'CRIOS_PUBLISHED_LAUNCH_OPERATIONAL_E2E_TEST_RESULTS', {
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
