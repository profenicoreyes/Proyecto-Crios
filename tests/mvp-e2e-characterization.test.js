/* CRIOS MVP 1.0 - published full-flow characterization */
(function(){
  'use strict';

  var startedAt = performance.now();
  var assertions = [];
  var pageErrors = [];
  var consoleErrors = [];
  var warnings = [];
  var unhandledRejections = [];
  var frameDiagnostics = [];
  var frames = [];
  var originalConsoleError = console.error;
  var originalConsoleWarn = console.warn;
  var publicationStorageKey = 'crios.publication.persistence.v1';
  var sessionKey = 'crios-session-data';
  var campaignProgressKey = 'crios-progreso-campanas-v1';
  var completeKey = 'crios-complete-v2';

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
  console.warn = function(){
    warnings.push(Array.prototype.map.call(arguments, String).join(' '));
    originalConsoleWarn.apply(console, arguments);
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
      'window.__CRIOS_MVP_E2E_DIAG__={pageErrors:[],consoleErrors:[],warnings:[],unhandledRejections:[],fetchCalls:[]};',
      'window.addEventListener("error",function(event){window.__CRIOS_MVP_E2E_DIAG__.pageErrors.push(String(event.error&&event.error.stack||event.message||event.error||"PAGE_ERROR"));});',
      'window.addEventListener("unhandledrejection",function(event){window.__CRIOS_MVP_E2E_DIAG__.unhandledRejections.push(String(event.reason&&event.reason.stack||event.reason||"UNHANDLED_REJECTION"));});',
      'var originalError=console.error;console.error=function(){window.__CRIOS_MVP_E2E_DIAG__.consoleErrors.push(Array.prototype.map.call(arguments,String).join(" "));return originalError.apply(console,arguments);};',
      'var originalWarn=console.warn;console.warn=function(){window.__CRIOS_MVP_E2E_DIAG__.warnings.push(Array.prototype.map.call(arguments,String).join(" "));return originalWarn.apply(console,arguments);};',
      '})();'
    ].join('');
  }

  function runtimeStubs() {
    return [
      'window.fetch=async function(input,init){',
      'var url=String(input&&input.url||input||"");',
      'window.__CRIOS_MVP_E2E_DIAG__.fetchCalls.push({url:url,method:String(init&&init.method||"GET")});',
      'if(url.indexOf("accion=grupos")>=0){return new Response(JSON.stringify({ok:true,grupos:["ALUMNO_MVP"]}),{status:200,headers:{"Content-Type":"application/json"}});}',
      'return new Response(JSON.stringify({ok:true}),{status:200,headers:{"Content-Type":"application/json"}});',
      '};',
      'window.confirm=function(){return true;};',
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
    var width = options.width || 1366;
    var height = options.height || 768;
    frame.title = options.title || 'CRIOS controlled frame';
    frame.style.cssText = 'position:fixed;left:-20000px;top:0;border:0;width:' + width + 'px;height:' + height + 'px;';
    frames.push(frame);
    document.body.appendChild(frame);
    frame.src = './mvp-e2e-characterization.test.html?shell=1&token=' + Math.random().toString(36).slice(2);
    await waitFor(function(){
      return frame.contentWindow && frame.contentWindow.location.pathname.endsWith('/tests/mvp-e2e-characterization.test.html');
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
    return { frame: frame, child: child, target: target, width: width, height: height };
  }

  function snapshotDiagnostics(label, child) {
    var diag = child && child.__CRIOS_MVP_E2E_DIAG__;
    var snapshot = freeze({
      label: label,
      pageErrors: Array.isArray(diag && diag.pageErrors) ? diag.pageErrors.slice() : [],
      consoleErrors: Array.isArray(diag && diag.consoleErrors) ? diag.consoleErrors.slice() : [],
      warnings: Array.isArray(diag && diag.warnings) ? diag.warnings.slice() : [],
      unhandledRejections: Array.isArray(diag && diag.unhandledRejections) ? diag.unhandledRejections.slice() : [],
      fetchCalls: Array.isArray(diag && diag.fetchCalls) ? diag.fetchCalls.slice() : []
    });
    frameDiagnostics.push(snapshot);
    return snapshot;
  }

  function assertCleanDiagnostics(prefix, snapshot) {
    equal(prefix + '_PAGE_ERRORS', snapshot.pageErrors.length, 0);
    equal(prefix + '_CONSOLE_ERRORS', snapshot.consoleErrors.length, 0);
    equal(prefix + '_WARNINGS', snapshot.warnings.length, 0);
    equal(prefix + '_REJECTIONS', snapshot.unhandledRejections.length, 0);
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
      title: 'CRIOS Studio MVP E2E',
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

  async function launchRuntime(href, label, width, height) {
    var controlled = await createControlledDocument({
      title: label,
      targetUrl: href,
      sourceUrl: '../index.html',
      runtime: true,
      width: width,
      height: height
    });
    var child = controlled.child;
    await waitFor(function(){
      return child.CRIOS && child.CRIOS.runtimeLaunch && child.document.getElementById('groupInput') && child.document.getElementById('campaignEntryButton');
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

  async function identifyThroughUi(child, realName, characterName, groupName, label) {
    child.go('reveal');
    child.document.getElementById('userNameInput').value = realName;
    child.document.getElementById('characterNameInput').value = characterName;
    child.document.getElementById('groupInput').value = groupName;
    child.document.getElementById('identifyButton').click();
    await waitFor(function(){
      return !child.document.getElementById('missionWelcome').classList.contains('hidden');
    }, 30000, label + '-identified');
  }

  function getSession(child) {
    var raw = child.sessionStorage.getItem(sessionKey);
    return raw ? JSON.parse(raw) : null;
  }

  function getCampaignProgress(child) {
    var raw = child.sessionStorage.getItem(campaignProgressKey);
    return raw ? JSON.parse(raw) : {};
  }

  function number(value) {
    return Number(String(value).replace(',', '.'));
  }

  function matchStatement(statement, pattern, missionId) {
    var match = String(statement || '').match(pattern);
    if (!match) throw new Error('MISSION_STATEMENT_UNEXPECTED: ' + missionId + ' statement=' + statement);
    return match.slice(1).map(number);
  }

  function solutionFor(missionId, statement) {
    var values;
    if (missionId === 'energy') {
      values = matchStatement(statement, /rectangulo de\s+([\d.,]+)\s*m de ancho y\s+([\d.,]+)\s*m de altura.*sector oeste ocupa\s+([\d.,]+)\s*m.*zona danada de\s+([\d.,]+)\s*m por\s+([\d.,]+)\s*m/i, missionId);
      return { expected: values[0] * values[1] - values[3] * values[4], procedure: values[0] + '*' + values[1] + '-' + values[3] + '*' + values[4], values: values };
    }
    if (missionId === 'greenhouse') {
      values = matchStatement(statement, /mide\s+([\d.,]+)\s*m por\s+([\d.,]+)\s*m.*triangular tiene\s+([\d.,]+)\s*m de base y\s+([\d.,]+)\s*m de altura.*perdieron\s+([\d.,]+)\s*m2.*recuperaron\s+([\d.,]+)\s*m2/i, missionId);
      return { expected: values[0] * values[1] - values[2] * values[3] / 2 - values[4] + values[5], procedure: values[0] + '*' + values[1] + '-' + values[2] + '*' + values[3] + '/2-' + values[4] + '+' + values[5], values: values };
    }
    if (missionId === 'ice') {
      values = matchStatement(statement, /mide\s+([\d.,]+)\s*m de lado.*tiene\s+([\d.,]+)\s*m de diametro.*pi igual a\s+([\d.,]+).*recuperaron\s+([\d.,]+)\s*m2.*sellaron\s+([\d.,]+)\s*m2/i, missionId);
      return { expected: values[0] * values[0] - values[2] * (values[1] / 2) * (values[1] / 2) + values[3] - values[4], procedure: values[0] + '*' + values[0] + '-' + values[2] + '*(' + values[1] + '/2)*(' + values[1] + '/2)+' + values[3] + '-' + values[4], values: values };
    }
    if (missionId === 'hangar') {
      values = matchStatement(statement, /mide\s+([\d.,]+)\s*m por\s+([\d.,]+)\s*m.*horizontal mide\s+([\d.,]+)\s*m y el vertical\s+([\d.,]+)\s*m.*zona de\s+([\d.,]+)\s*m por\s+([\d.,]+)\s*m.*recuperaron\s+([\d.,]+)\s*m2/i, missionId);
      return { expected: values[0] * values[1] - values[2] * values[3] - values[4] * values[5] + values[6], procedure: values[0] + '*' + values[1] + '-' + values[2] + '*' + values[3] + '-' + values[4] + '*' + values[5] + '+' + values[6], values: values };
    }
    throw new Error('UNSUPPORTED_MISSION: ' + missionId);
  }

  async function enterCampaign(child, label) {
    child.document.getElementById('campaignEntryButton').click();
    await waitFor(function(){ return child.document.getElementById('map').classList.contains('active'); }, 10000, label + '-map-active');
  }

  async function solveMissionThroughUi(child, missionId, label) {
    var card = child.document.getElementById('card-' + missionId);
    if (!card) throw new Error('MISSION_CARD_MISSING: ' + missionId);
    card.click();
    await waitFor(function(){ return child.document.getElementById('mission-' + missionId).classList.contains('active'); }, 10000, label + '-mission-active-' + missionId);

    var statement = child.document.getElementById('missionText-' + missionId).textContent;
    var solution = solutionFor(missionId, statement);
    var procedureInput = child.document.getElementById('procedure-' + missionId);
    var procedureButton = procedureInput.parentElement.querySelector('button');
    procedureInput.value = solution.procedure;
    procedureButton.click();
    await waitFor(function(){ return !child.document.getElementById('resultStep-' + missionId).classList.contains('locked'); }, 10000, label + '-procedure-' + missionId);

    var answerInput = child.document.getElementById('answer-' + missionId);
    var answerButton = answerInput.parentElement.querySelector('button');
    answerInput.value = String(solution.expected);
    answerButton.click();

    await waitFor(function(){
      var session = getSession(child);
      return session && session.misiones && session.misiones[missionId] && session.misiones[missionId].answerCorrect === true;
    }, 10000, label + '-answer-' + missionId);
    await waitFor(function(){ return child.document.getElementById('map').classList.contains('active'); }, 10000, label + '-return-map-' + missionId);

    var session = getSession(child);
    var record = session.misiones[missionId];
    assert(label + '_' + missionId.toUpperCase() + '_PROCEDURE_CORRECT', record.procedureCorrect === true, 'Procedimiento no aprobado: ' + missionId);
    assert(label + '_' + missionId.toUpperCase() + '_ANSWER_CORRECT', record.answerCorrect === true, 'Respuesta no aprobada: ' + missionId);
    equal(label + '_' + missionId.toUpperCase() + '_EXPECTED', record.expected, solution.expected);
    assert(label + '_' + missionId.toUpperCase() + '_CARD_DONE', child.document.getElementById('card-' + missionId).classList.contains('done'), 'Tarjeta no marcada: ' + missionId);
    return freeze({ missionId: missionId, expected: solution.expected, procedure: solution.procedure, values: solution.values });
  }

  function solvedIds(session, ids) {
    return ids.filter(function(id){ return Boolean(session && session.misiones && session.misiones[id] && session.misiones[id].answerCorrect); });
  }

  function findButtonByText(root, pattern) {
    return Array.prototype.find.call(root.querySelectorAll('button'), function(button){ return pattern.test(button.textContent.trim()); }) || null;
  }

  function inspectNarrowViewport(controlled, label, elementId) {
    var child = controlled.child;
    var app = child.document.querySelector('.app');
    var target = child.document.getElementById(elementId);
    if (!target) throw new Error('NARROW_TARGET_MISSING: ' + elementId);
    var rect = target.getBoundingClientRect();
    var style = child.getComputedStyle(target);
    assert(label + '_VIEWPORT_WIDTH', child.innerWidth === controlled.width, 'Ancho real=' + child.innerWidth);
    assert(label + '_VIEWPORT_HEIGHT', child.innerHeight === controlled.height, 'Alto real=' + child.innerHeight);
    assert(label + '_APP_TRANSFORMED', Boolean(app && app.style.transform && app.style.transform.indexOf('scale(') === 0), 'App sin escala.');
    assert(label + '_TARGET_VISIBLE', style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0, elementId + ' no visible.');
    assert(label + '_TARGET_IN_VIEWPORT', rect.left >= -1 && rect.top >= -1 && rect.right <= child.innerWidth + 1 && rect.bottom <= child.innerHeight + 1, elementId + ' fuera del viewport: ' + JSON.stringify({left:rect.left,top:rect.top,right:rect.right,bottom:rect.bottom,width:child.innerWidth,height:child.innerHeight}));
  }

  function assertExpectedFetches(prefix, snapshot) {
    var unexpected = snapshot.fetchCalls.filter(function(call){
      return call.url.indexOf('accion=grupos') < 0 && call.url.indexOf('script.google.com/macros/s/') < 0;
    });
    equal(prefix + '_UNEXPECTED_FETCHES', unexpected, []);
    assert(prefix + '_GROUP_FETCH', snapshot.fetchCalls.some(function(call){ return call.url.indexOf('accion=grupos') >= 0; }), 'No hubo carga de grupos.');
  }

  async function run() {
    var details = { missionSolutions: [] };
    var studioControlled = null;
    var firstRuntime = null;
    var resumedRuntime = null;
    var completedRuntime = null;

    try {
      localStorage.clear();
      sessionStorage.clear();

      studioControlled = await prepareStudio();
      var studio = studioControlled.child;
      var missions = studio.CRIOS_STUDIO_ADAPTER.getMissions();
      equal('STUDIO_SOURCE_MISSION_COUNT', missions.length, 4);
      missions.forEach(function(mission){
        if (!studio.CRIOS_CAMPAIGN_DRAFT.contieneMision(mission.id)) studio.CRIOS_CAMPAIGN_DRAFT.agregarMision(mission);
      });
      studio.CRIOS_CAMPAIGN_DRAFT.establecerNombre('CRIOS MVP 1.0 - Campaña de aceptación');
      studio.CRIOS_CAMPAIGN_DRAFT.establecerDescripcion('Recorrido published completo de caracterización.');
      equal('STUDIO_DRAFT_MISSION_IDS', studio.CRIOS_CAMPAIGN_DRAFT.obtenerMisiones().map(function(item){ return item.id; }), ['energy','greenhouse','ice','hangar']);

      var validation = await studio.CRIOS_STUDIO.publication.validateCurrentDraft();
      assert('STUDIO_VALIDATION_OK', validation && validation.ok === true, 'Draft inválido.');
      assert('STUDIO_RUNTIME_COMPATIBLE', validation && validation.validation && validation.validation.levels.runtimeCompatibility.valid === true, 'Runtime incompatible.');
      var published = await studio.CRIOS_STUDIO.publication.publishCurrentDraft();
      var publication = published && published.publication;
      assert('STUDIO_PUBLISH_SUCCESS', published && published.success === true && Boolean(publication), 'Publicación falló.');
      var campaignId = publication.campaignId;
      var publicationId = publication.publicationId;
      equal('STUDIO_PUBLISHED_MISSION_COUNT', publication.content.missionSpecs.length, 4);
      assert('STUDIO_PERSISTENCE_DOCUMENT', Boolean(localStorage.getItem(publicationStorageKey)), 'Documento persistido ausente.');
      var activated = await studio.CRIOS_STUDIO.activation.activatePublication(campaignId, publicationId);
      assert('STUDIO_ACTIVATION_SUCCESS', activated && activated.success === true, 'Activación falló.');
      await waitFor(function(){ return !studio.document.getElementById('studioRuntimeLaunchLink').hidden; }, 20000, 'studio-link-active');
      var link = linkSnapshot(studio);
      assert('STUDIO_LAUNCH_LINK_AVAILABLE', link.exists && !link.hidden && Boolean(link.href), 'Enlace no disponible.');
      assert('STUDIO_LAUNCH_LINK_CANONICAL', link.href === '../index.html?source=published&campaignId=' + encodeURIComponent(campaignId), 'Enlace no canónico.');
      assert('STUDIO_LAUNCH_PUBLICATION_PINNED', link.publicationId === publicationId, 'Publicación activa incorrecta.');
      equal('STUDIO_PERSISTENCE_STATUS', persistenceStatus(studio).status, 'READY');
      details.campaignId = campaignId;
      details.publicationId = publicationId;
      details.launchHref = link.href;

      sessionStorage.clear();
      firstRuntime = await launchRuntime(new URL(link.href, studio.location.href).href, 'Runtime MVP first half', 1366, 768);
      var first = firstRuntime.child;
      await waitGroups(first, 'first-runtime');
      assert('FIRST_RUNTIME_MODE_PUBLISHED', first.CRIOS.runtimeCampaignMode === 'published', 'Modo incorrecto.');
      assert('FIRST_RUNTIME_NOT_BLOCKED', first.CRIOS.runtimeLaunch.blocked === false, 'Launch bloqueado.');
      await identifyThroughUi(first, 'Alumno MVP', 'Operador MVP', 'ALUMNO_MVP', 'first-runtime');
      var initialSession = getSession(first);
      assert('FIRST_SESSION_PRESENT', Boolean(initialSession), 'Sesión ausente.');
      assert('FIRST_SESSION_SOURCE_PUBLISHED', initialSession.campana.sourceMode === 'published', 'sourceMode incorrecto.');
      assert('FIRST_SESSION_CAMPAIGN', initialSession.campana.campaignId === campaignId, 'Campaña incorrecta.');
      assert('FIRST_SESSION_PUBLICATION', initialSession.campana.publicationId === publicationId, 'Publicación incorrecta.');
      equal('FIRST_RUNTIME_MISSION_IDS', first.CRIOS.obtenerMisionesActivas(), ['energy','greenhouse','ice','hangar']);
      await enterCampaign(first, 'first-runtime');
      assert('FIRST_FINAL_DISABLED_INITIAL', first.document.getElementById('finalBtn').disabled === true, 'Final habilitado prematuramente.');

      details.missionSolutions.push(await solveMissionThroughUi(first, 'energy', 'FIRST_HALF'));
      details.missionSolutions.push(await solveMissionThroughUi(first, 'greenhouse', 'FIRST_HALF'));
      var firstHalfSession = getSession(first);
      equal('FIRST_HALF_SOLVED_IDS', solvedIds(firstHalfSession, first.CRIOS.obtenerMisionesActivas()), ['energy','greenhouse']);
      assert('FIRST_HALF_FINAL_DISABLED', first.document.getElementById('finalBtn').disabled === true, 'Final habilitado con 2/4.');
      var firstSessionId = firstHalfSession.idSesion;
      details.firstSessionId = firstSessionId;
      var firstDiag = snapshotDiagnostics('runtime-first-half', first);
      assertCleanDiagnostics('FIRST_RUNTIME', firstDiag);
      assertExpectedFetches('FIRST_RUNTIME', firstDiag);
      firstRuntime.frame.remove();
      firstRuntime = null;

      resumedRuntime = await launchRuntime(new URL(link.href, studio.location.href).href, 'Runtime MVP resume', 1366, 768);
      var resumed = resumedRuntime.child;
      await waitGroups(resumed, 'resumed-runtime');
      resumed.go('reveal');
      assert('RESUME_LOGIN_VISIBLE', !resumed.document.getElementById('missionLogin').classList.contains('hidden'), 'Login no visible.');
      assert('RESUME_WELCOME_HIDDEN', resumed.document.getElementById('missionWelcome').classList.contains('hidden'), 'Welcome visible antes de confirmar.');
      assert('RESUME_REAL_NAME_PREFILLED', resumed.document.getElementById('userNameInput').value === 'Alumno MVP', 'Nombre no recuperado.');
      assert('RESUME_CHARACTER_PREFILLED', resumed.document.getElementById('characterNameInput').value === 'Operador MVP', 'Personaje no recuperado.');
      assert('RESUME_GROUP_PREFILLED', resumed.document.getElementById('groupInput').value === 'ALUMNO_MVP', 'Grupo no recuperado.');
      resumed.document.getElementById('identifyButton').click();
      await waitFor(function(){ return !resumed.document.getElementById('missionWelcome').classList.contains('hidden'); }, 30000, 'resumed-identified');
      var resumedSession = getSession(resumed);
      assert('RESUME_SESSION_ID_STABLE', resumedSession.idSesion === firstSessionId, 'Se creó otra sesión.');
      equal('RESUME_SOLVED_IDS', solvedIds(resumedSession, resumed.CRIOS.obtenerMisionesActivas()), ['energy','greenhouse']);
      await enterCampaign(resumed, 'resumed-runtime');
      assert('RESUME_FINAL_DISABLED', resumed.document.getElementById('finalBtn').disabled === true, 'Final habilitado con 2/4 después de recarga.');

      details.missionSolutions.push(await solveMissionThroughUi(resumed, 'ice', 'SECOND_HALF'));
      details.missionSolutions.push(await solveMissionThroughUi(resumed, 'hangar', 'SECOND_HALF'));
      var allSolvedSession = getSession(resumed);
      equal('ALL_MISSIONS_SOLVED_IDS', solvedIds(allSolvedSession, resumed.CRIOS.obtenerMisionesActivas()), ['energy','greenhouse','ice','hangar']);
      assert('ALL_MISSIONS_FINAL_ENABLED', resumed.document.getElementById('finalBtn').disabled === false, 'Final no habilitado con 4/4.');
      equal('ALL_MISSIONS_PROGRESS_LABEL', resumed.document.getElementById('progressLabel').textContent.trim(), '100 % · 4/4 módulos');

      resumed.document.getElementById('finalBtn').click();
      await waitFor(function(){ return resumed.document.getElementById('final').classList.contains('active'); }, 10000, 'final-active');
      var instruction = resumed.document.getElementById('finalInstruction').textContent;
      var adjustments = matchStatement(instruction, /resten\s+([\d.,]+)\s*m².*agreguen\s+([\d.,]+)\s*m²/i, 'final');
      var missionExpected = details.missionSolutions.map(function(item){ return item.expected; });
      var finalExpected = missionExpected.reduce(function(sum, value){ return sum + value; }, 0) - adjustments[0] + adjustments[1];
      var finalProcedure = missionExpected.join('+') + '-' + adjustments[0] + '+' + adjustments[1];
      details.finalExpected = finalExpected;
      details.finalProcedure = finalProcedure;

      var finalProcedureInput = resumed.document.getElementById('finalProcedure');
      finalProcedureInput.value = finalProcedure;
      finalProcedureInput.parentElement.querySelector('button').click();
      await waitFor(function(){ return !resumed.document.getElementById('finalResultStep').classList.contains('locked'); }, 10000, 'final-procedure-accepted');
      assert('FINAL_PROCEDURE_FEEDBACK_OK', resumed.document.getElementById('finalProcedureFeedback').classList.contains('ok'), 'Procedimiento final no aprobado.');
      var finalAnswerInput = resumed.document.getElementById('finalAnswer');
      finalAnswerInput.value = String(finalExpected);
      finalAnswerInput.parentElement.querySelector('button').click();
      await waitFor(function(){ return resumed.document.getElementById('credits').classList.contains('active'); }, 15000, 'credits-active');
      await waitFor(function(){
        var session = getSession(resumed);
        return session && session.final && session.final.answerCorrect === true && session.enviada === true;
      }, 10000, 'final-session-persisted');
      var completedSession = getSession(resumed);
      assert('FINAL_PROCEDURE_CORRECT', completedSession.final.procedureCorrect === true, 'Procedimiento final no persistido.');
      assert('FINAL_ANSWER_CORRECT', completedSession.final.answerCorrect === true, 'Resultado final no persistido.');
      equal('FINAL_EXPECTED_RECORDED', completedSession.final.expected, finalExpected);
      equal('FINAL_CREDITS_TOTAL', resumed.document.getElementById('creditsTotal').textContent.trim(), String(finalExpected));
      assert('FINAL_COMPLETE_MARKER', resumed.sessionStorage.getItem(completeKey) === 'true', 'Marcador complete ausente.');
      assert('FINAL_SESSION_FINISHED', Boolean(completedSession.finISO && completedSession.enviada), 'Sesión no finalizada.');
      assert('FINAL_EVALUATION_PRESENT', Boolean(completedSession.evaluacion && typeof completedSession.evaluacion.puntaje === 'number'), 'Evaluación final ausente.');
      var completedSessionId = completedSession.idSesion;
      var resumeDiag = snapshotDiagnostics('runtime-second-half-and-final', resumed);
      assertCleanDiagnostics('RESUMED_RUNTIME', resumeDiag);
      assertExpectedFetches('RESUMED_RUNTIME', resumeDiag);
      resumedRuntime.frame.remove();
      resumedRuntime = null;

      completedRuntime = await launchRuntime(new URL(link.href, studio.location.href).href, 'Runtime MVP completed reload', 390, 844);
      var completed = completedRuntime.child;
      await waitGroups(completed, 'completed-runtime');
      completed.go('reveal');
      inspectNarrowViewport(completedRuntime, 'NARROW_IDENTIFY', 'identifyButton');
      assert('COMPLETED_RELOAD_LOGIN_VISIBLE', !completed.document.getElementById('missionLogin').classList.contains('hidden'), 'Login no visible tras finalización.');
      completed.document.getElementById('identifyButton').click();
      await waitFor(function(){ return !completed.document.getElementById('missionWelcome').classList.contains('hidden'); }, 30000, 'completed-reload-identified');
      inspectNarrowViewport(completedRuntime, 'NARROW_ENTRY', 'campaignEntryButton');
      var completedReloadSession = getSession(completed);
      assert('COMPLETED_RELOAD_SESSION_ID_STABLE', completedReloadSession.idSesion === completedSessionId, 'La sesión finalizada cambió.');
      assert('COMPLETED_RELOAD_COMPLETE_MARKER', completed.sessionStorage.getItem(completeKey) === 'true', 'Marcador complete no sobrevivió.');
      assert('COMPLETED_RELOAD_FINAL_RECORD', completedReloadSession.final && completedReloadSession.final.answerCorrect === true, 'Final no sobrevivió.');
      equal('COMPLETED_RELOAD_SOLVED_IDS', solvedIds(completedReloadSession, completed.CRIOS.obtenerMisionesActivas()), ['energy','greenhouse','ice','hangar']);
      await enterCampaign(completed, 'completed-runtime');
      assert('COMPLETED_RELOAD_FINAL_ENABLED', completed.document.getElementById('finalBtn').disabled === false, 'Final no habilitado tras recarga completa.');
      equal('COMPLETED_RELOAD_PROGRESS_LABEL', completed.document.getElementById('progressLabel').textContent.trim(), '100 % · 4/4 módulos');

      var publicationBeforeReset = completed.localStorage.getItem(publicationStorageKey);
      var resetButton = findButtonByText(completed.document.getElementById('map'), /Nueva sesión \/ cambiar identidad/i);
      assert('RESET_BUTTON_PRESENT', Boolean(resetButton), 'Botón de nueva sesión ausente.');
      resetButton.click();
      await waitFor(function(){ return completed.document.getElementById('reveal').classList.contains('active'); }, 10000, 'reset-reveal');
      assert('RESET_SESSION_REMOVED', getSession(completed) === null, 'Sesión no eliminada.');
      assert('RESET_PROGRESS_REMOVED', completed.sessionStorage.getItem(campaignProgressKey) === null, 'Progreso no eliminado.');
      assert('RESET_COMPLETE_REMOVED', completed.sessionStorage.getItem(completeKey) === null, 'Complete no eliminado.');
      assert('RESET_IDENTITY_REMOVED', completed.sessionStorage.getItem('crios-user-name') === null && completed.sessionStorage.getItem('crios-character-name') === null && completed.sessionStorage.getItem('crios-group-name') === null, 'Identidad no eliminada.');
      assert('RESET_PUBLICATION_PRESERVED', completed.localStorage.getItem(publicationStorageKey) === publicationBeforeReset && Boolean(publicationBeforeReset), 'Publicación alterada por reset.');
      await waitGroups(completed, 'reset-new-session');
      await identifyThroughUi(completed, 'Alumno MVP 2', 'Operador MVP 2', 'ALUMNO_MVP', 'new-session');
      var newSession = getSession(completed);
      assert('NEW_SESSION_PRESENT', Boolean(newSession), 'Nueva sesión ausente.');
      assert('NEW_SESSION_ID_CHANGED', newSession.idSesion !== completedSessionId, 'Nueva sesión reutilizó id.');
      assert('NEW_SESSION_PUBLISHED', newSession.campana.sourceMode === 'published' && newSession.campana.publicationId === publicationId, 'Nueva sesión perdió publicación.');
      equal('NEW_SESSION_SOLVED_IDS', solvedIds(newSession, completed.CRIOS.obtenerMisionesActivas()), []);
      await enterCampaign(completed, 'new-session');
      assert('NEW_SESSION_FINAL_DISABLED', completed.document.getElementById('finalBtn').disabled === true, 'Nueva sesión heredó final habilitado.');
      equal('NEW_SESSION_PROGRESS_LABEL', completed.document.getElementById('progressLabel').textContent.trim(), '0 % · 0/4 módulos');
      assert('NEW_SESSION_CAMPAIGN_PROGRESS_PRESENT', completed.sessionStorage.getItem(campaignProgressKey) !== null, 'Contenedor de progreso ausente.');

      var completedDiag = snapshotDiagnostics('runtime-completed-reload-reset-new-session', completed);
      assertCleanDiagnostics('COMPLETED_RUNTIME', completedDiag);
      assertExpectedFetches('COMPLETED_RUNTIME', completedDiag);
      var studioDiag = snapshotDiagnostics('studio', studio);
      assertCleanDiagnostics('STUDIO', studioDiag);
      equal('STUDIO_UNEXPECTED_FETCHES', studioDiag.fetchCalls, []);
      details.finalSessionId = completedSessionId;
      details.newSessionId = newSession.idSesion;
      details.completedReload = {
        completeMarker: true,
        allMissionsPreserved: true,
        finalEnabled: true,
        activeScreenAfterIdentification: completed.document.querySelector('.screen.active') && completed.document.querySelector('.screen.active').id
      };
    } catch (error) {
      pageErrors.push(String(error && error.stack || error));
    } finally {
      try { localStorage.clear(); } catch (ignoreLocal) {}
      try { sessionStorage.clear(); } catch (ignoreSession) {}
      frames.forEach(function(frame){ try { frame.remove(); } catch (ignoreFrame) {} });
      console.error = originalConsoleError;
      console.warn = originalConsoleWarn;

      var failed = assertions.filter(function(item){ return !item.passed; });
      var allFrameErrors = frameDiagnostics.reduce(function(sum, snapshot){ return sum + snapshot.pageErrors.length + snapshot.consoleErrors.length + snapshot.unhandledRejections.length; }, 0);
      var result = freeze({
        status: failed.length === 0 && pageErrors.length === 0 && consoleErrors.length === 0 && warnings.length === 0 && unhandledRejections.length === 0 && allFrameErrors === 0 ? 'PASS' : 'FAIL',
        total: assertions.length,
        passed: assertions.length - failed.length,
        failed: failed.length,
        assertions: assertions.slice(),
        failedAssertions: failed.slice(),
        pageErrors: pageErrors.slice(),
        consoleErrors: consoleErrors.slice(),
        warnings: warnings.slice(),
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

      Object.defineProperty(window, 'CRIOS_MVP_E2E_CHARACTERIZATION_RESULTS', {
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
