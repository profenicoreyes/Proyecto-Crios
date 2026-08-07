/* CRIOS A3-003A - runtime must not expose locally persisted campaign entry shortcuts */
(function(){
  'use strict';

  var resultNode = document.getElementById('results');
  var assertions = [];
  var failedAssertions = [];
  var pageErrors = [];
  var consoleErrors = [];
  var unhandledRejections = [];
  var frames = [];
  var details = {};
  var originalConsoleError = console.error;

  window.addEventListener('error', function(event){
    pageErrors.push(String(event.error && event.error.stack || event.message || event.error || 'PAGE_ERROR'));
  });
  window.addEventListener('unhandledrejection', function(event){
    unhandledRejections.push(String(event.reason && event.reason.stack || event.reason || 'UNHANDLED_REJECTION'));
  });
  console.error = function(){
    consoleErrors.push(Array.prototype.map.call(arguments, String).join(' '));
    return originalConsoleError.apply(console, arguments);
  };

  function assert(id, condition, message) {
    assertions.push(id);
    if (condition) return;
    failedAssertions.push({ id: id, message: String(message || 'Assertion failed.') });
  }

  function waitFor(check, timeout, label) {
    var started = performance.now();
    return new Promise(function(resolve, reject){
      (function poll(){
        var value = null;
        try { value = check(); } catch (error) { reject(error); return; }
        if (value) { resolve(value); return; }
        if (performance.now() - started >= timeout) { reject(new Error('TIMEOUT_' + label)); return; }
        setTimeout(poll, 25);
      })();
    });
  }

  function diagnosticBootstrap() {
    return [
      '(function(){',
      'window.__CRIOS_A2_014F_DIAG__={pageErrors:[],consoleErrors:[],unhandledRejections:[]};',
      'window.addEventListener("error",function(event){window.__CRIOS_A2_014F_DIAG__.pageErrors.push(String(event.error&&event.error.stack||event.message||event.error||"PAGE_ERROR"));});',
      'window.addEventListener("unhandledrejection",function(event){window.__CRIOS_A2_014F_DIAG__.unhandledRejections.push(String(event.reason&&event.reason.stack||event.reason||"UNHANDLED_REJECTION"));});',
      'var originalError=console.error;console.error=function(){window.__CRIOS_A2_014F_DIAG__.consoleErrors.push(Array.prototype.map.call(arguments,String).join(" "));return originalError.apply(console,arguments);};',
      'window.fetch=async function(input){var url=String(input&&input.url||input||"");if(url.indexOf("accion=grupos")>=0){return new Response(JSON.stringify({ok:true,grupos:["A2_014F"]}),{status:200,headers:{"Content-Type":"application/json"}});}return new Response(JSON.stringify({ok:true}),{status:200,headers:{"Content-Type":"application/json"}});};',
      'window.AudioContext=window.webkitAudioContext=function(){this.state="running";this.currentTime=0;this.destination={};this.createOscillator=function(){return{frequency:{value:0,setValueAtTime:function(){}},detune:{setValueAtTime:function(){}},type:"sine",connect:function(){},start:function(){},stop:function(){}};};this.createGain=function(){return{gain:{value:0,setValueAtTime:function(){},exponentialRampToValueAtTime:function(){}},connect:function(){},disconnect:function(){}};};this.createBiquadFilter=function(){return{type:"lowpass",frequency:{setValueAtTime:function(){}},Q:{value:0},connect:function(){}};};this.createDynamicsCompressor=function(){return{connect:function(){}};};this.resume=async function(){this.state="running";};};',
      '})();'
    ].join('');
  }

  function scriptTag(code) {
    return '<script>' + String(code).replace(/<\/script/gi, '<\\/script') + '<\/script>';
  }

  async function openRuntimeWithoutQuery() {
    var frame = document.createElement('iframe');
    frame.style.cssText = 'position:fixed;left:-10000px;top:0;width:1280px;height:900px;border:0;opacity:0;pointer-events:none;';
    frame.title = 'CRIOS A2-014F published entry surface';
    frames.push(frame);
    document.body.appendChild(frame);
    frame.src = './published-entry-surface.test.html?shell=1&token=' + Math.random().toString(36).slice(2);
    await waitFor(function(){
      return frame.contentWindow && frame.contentWindow.location.pathname.endsWith('/tests/published-entry-surface.test.html');
    }, 20000, 'SHELL_READY');

    var source = await fetch('../index.html', { cache: 'no-store' }).then(function(response){
      if (!response.ok) throw new Error('INDEX_FETCH_FAILED_' + response.status);
      return response.text();
    });
    var bootstrap = 'history.replaceState(null,"","../index.html");' + diagnosticBootstrap();
    source = source.replace('<head>', '<head><base href="../">' + scriptTag(bootstrap));

    var child = frame.contentWindow;
    child.document.open();
    child.document.write(source);
    child.document.close();
    await waitFor(function(){
      return child.CRIOS && child.CRIOS.runtimeLaunch && child.document.getElementById('groupInput');
    }, 30000, 'RUNTIME_READY');
    return child;
  }

  function isVisible(element, child) {
    if (!element || element.hidden) return false;
    var style = child.getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    return Boolean(element.getClientRects().length);
  }

  function visiblePublishedEntries(child, canonicalSearch) {
    return Array.prototype.slice.call(child.document.querySelectorAll('a[href]')).filter(function(anchor){
      if (!isVisible(anchor, child)) return false;
      try {
        var url = new URL(anchor.getAttribute('href'), child.location.href);
        return url.pathname.endsWith('/index.html') && url.search === canonicalSearch;
      } catch (error) {
        return false;
      }
    }).map(function(anchor){
      return {
        text: anchor.textContent.trim(),
        href: anchor.getAttribute('href'),
        target: anchor.getAttribute('target'),
        rel: anchor.getAttribute('rel')
      };
    });
  }

  function seedPublishedCampaign() {
    var api = window.CRIOS_PUBLICATION_PERSISTENCE;
    var campaignId = 'a2-014f-visible-entry';
    var publicationId = 'pub-a2-014f-visible-entry-v1';
    var timestamp = '2026-08-05T18:00:00.000Z';
    var publication = {
      campaignId: campaignId,
      publicationId: publicationId,
      version: 1,
      schemaVersion: '1.0.0',
      contentHash: 'hash-a2-014f-visible-entry-v1',
      content: { title: 'A2-014F Visible Published Entry' }
    };
    var publicationRecord = {
      publicationId: publicationId,
      campaignId: campaignId,
      version: 1,
      schemaVersion: '1.0.0',
      contentHash: publication.contentHash,
      sourceDraftRevision: 'a2-014f-revision-1',
      createdAt: timestamp,
      status: 'PUBLISHED'
    };
    var activeReference = {
      campaignId: campaignId,
      publicationId: publicationId,
      version: 1,
      contentHash: publication.contentHash,
      activatedAt: timestamp
    };
    var activationRecord = {
      activationId: 'activation-a2-014f-visible-entry',
      action: 'ACTIVATE',
      campaignId: campaignId,
      previousPublicationId: null,
      nextPublicationId: publicationId,
      occurredAt: timestamp
    };
    var adapter = api.createStorageAdapter({ storage: localStorage, clock: function(){ return timestamp; } });
    var coordinator = api.createPersistenceCoordinator({ adapter: adapter });
    coordinator.publicationStore.commit(publication, publicationRecord);
    coordinator.activationStore.commit(activeReference, activationRecord);
    return {
      api: api,
      adapter: adapter,
      coordinator: coordinator,
      campaignId: campaignId,
      publicationId: publicationId,
      canonicalSearch: window.CRIOS_RUNTIME_LAUNCH.buildPublishedLaunchSearch(campaignId)
    };
  }

  async function run() {
    localStorage.clear();
    sessionStorage.clear();

    var launchApi = window.CRIOS_RUNTIME_LAUNCH;
    var persistenceApi = window.CRIOS_PUBLICATION_PERSISTENCE;
    assert('LAUNCH_CONTRACT_AVAILABLE', Boolean(launchApi && typeof launchApi.buildPublishedLaunchSearch === 'function'), 'Runtime launch contract unavailable.');
    assert('PERSISTENCE_API_AVAILABLE', Boolean(persistenceApi && typeof persistenceApi.createPersistenceCoordinator === 'function'), 'Persistence API unavailable.');

    var seed = seedPublishedCampaign();
    var persistedDocument = seed.coordinator.exportDocument();
    assert('PERSISTED_DOCUMENT_VALID', persistenceApi.isPersistenceDocument(persistedDocument) === true, 'Seeded persistence document is invalid.');
    assert('PERSISTED_PUBLICATION_LISTED', seed.coordinator.publicationStore.listPublications(seed.campaignId).length === 1, 'Persisted publication was not listed.');
    assert('ACTIVE_REFERENCE_AVAILABLE', Boolean(seed.coordinator.activationStore.getActiveReference(seed.campaignId)), 'Active reference was not persisted.');
    assert('CANONICAL_PUBLISHED_SEARCH_AVAILABLE', seed.canonicalSearch === '?source=published&campaignId=' + encodeURIComponent(seed.campaignId), 'Canonical published search differs.');

    var child = await openRuntimeWithoutQuery();
    var childDiag = child.__CRIOS_A2_014F_DIAG__ || {};
    var entries = visiblePublishedEntries(child, seed.canonicalSearch);
    var childPersistence = child.CRIOS_PUBLICATION_PERSISTENCE.createPersistenceCoordinator({
      adapter: child.CRIOS_PUBLICATION_PERSISTENCE.createStorageAdapter({ storage: child.localStorage })
    });

    details = {
      campaignId: seed.campaignId,
      publicationId: seed.publicationId,
      canonicalSearch: seed.canonicalSearch,
      runtimeMode: child.CRIOS.runtimeCampaignMode,
      runtimeLaunchExplicit: child.CRIOS.runtimeLaunch.explicit,
      persistedPublicationCount: childPersistence.publicationStore.listPublications(seed.campaignId).length,
      activeReference: childPersistence.activationStore.getActiveReference(seed.campaignId),
      visiblePublishedEntryCount: entries.length,
      visiblePublishedEntries: entries
    };

    assert('INDEX_OPENED_WITHOUT_QUERY', child.location.search === '', 'Index was not opened without query: ' + child.location.search);
    assert('INDEX_DEFAULTS_TO_LEGACY', child.CRIOS.runtimeCampaignMode === 'legacy', 'Unexpected Runtime mode: ' + child.CRIOS.runtimeCampaignMode);
    assert('INDEX_REQUEST_IS_NOT_EXPLICIT', child.CRIOS.runtimeLaunch.explicit === false, 'Runtime request unexpectedly explicit.');
    assert('INDEX_CAN_READ_PERSISTED_PUBLICATION', details.persistedPublicationCount === 1 && details.activeReference && details.activeReference.publicationId === seed.publicationId, 'Index origin cannot recover the seeded publication.');
    assert(
      'A3_003A_INDEX_DOES_NOT_EXPOSE_PERSISTED_PUBLISHED_ENTRY',
      entries.length === 0,
      'persistedPublicationCount=' + details.persistedPublicationCount +
        '; activePublicationId=' + (details.activeReference && details.activeReference.publicationId || 'none') +
        '; runtimeMode=' + details.runtimeMode +
        '; runtimeLaunchExplicit=' + details.runtimeLaunchExplicit +
        '; canonicalSearch=' + details.canonicalSearch +
        '; visiblePublishedEntryCount=' + entries.length
    );

    pageErrors = pageErrors.concat(Array.isArray(childDiag.pageErrors) ? childDiag.pageErrors : []);
    consoleErrors = consoleErrors.concat(Array.isArray(childDiag.consoleErrors) ? childDiag.consoleErrors : []);
    unhandledRejections = unhandledRejections.concat(Array.isArray(childDiag.unhandledRejections) ? childDiag.unhandledRejections : []);
  }

  function cleanup() {
    frames.forEach(function(frame){ if (frame && frame.parentNode) frame.parentNode.removeChild(frame); });
    localStorage.clear();
    sessionStorage.clear();
    console.error = originalConsoleError;
    return {
      localStorageCleared: localStorage.length === 0,
      sessionStorageCleared: sessionStorage.length === 0,
      framesRemoved: frames.every(function(frame){ return !frame.parentNode; })
    };
  }

  run().catch(function(error){
    pageErrors.push(String(error && error.stack || error));
  }).then(function(){
    var cleanupResult = cleanup();
    var total = assertions.length;
    var failed = failedAssertions.length;
    var result = Object.freeze({
      status: failed === 0 && pageErrors.length === 0 && consoleErrors.length === 0 && unhandledRejections.length === 0 ? 'PASS' : 'FAIL',
      total: total,
      passed: total - failed,
      failed: failed,
      failedAssertions: failedAssertions.slice(),
      pageErrors: pageErrors.slice(),
      consoleErrors: consoleErrors.slice(),
      unhandledRejections: unhandledRejections.slice(),
      cleanup: Object.freeze(cleanupResult),
      details: Object.freeze(details)
    });
    window.CRIOS_PUBLISHED_ENTRY_SURFACE_TEST_RESULTS = result;
    resultNode.textContent = JSON.stringify(result, null, 2);
  });
})();
