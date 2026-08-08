(function(){
  'use strict';

  var startedAt = performance.now();
  var definitions = [];
  var results = [];
  var telemetry = {
    pageErrors: [],
    consoleErrors: [],
    consoleWarnings: [],
    unhandledRejections: []
  };
  var originalConsoleError = console.error;
  var originalConsoleWarn = console.warn;

  console.error = function(){
    telemetry.consoleErrors.push(Array.prototype.slice.call(arguments).map(String).join(' '));
    return originalConsoleError.apply(console, arguments);
  };
  console.warn = function(){
    telemetry.consoleWarnings.push(Array.prototype.slice.call(arguments).map(String).join(' '));
    return originalConsoleWarn.apply(console, arguments);
  };
  window.addEventListener('error', function(event){ telemetry.pageErrors.push(String(event && event.message || 'error')); });
  window.addEventListener('unhandledrejection', function(event){ telemetry.unhandledRejections.push(String(event && event.reason || 'unhandledrejection')); });

  function test(name, run){ definitions.push({ name: name, run: run }); }
  function assert(condition, message){ if (!condition) throw new Error(message || 'Assertion failed'); }
  function equal(actual, expected, message){ if (actual !== expected) throw new Error((message || 'Values differ') + ' actual=' + actual + ' expected=' + expected); }
  function deepEqual(actual, expected, message){ if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error((message || 'Structures differ') + ' actual=' + JSON.stringify(actual) + ' expected=' + JSON.stringify(expected)); }
  function exactKeys(value, expected){ deepEqual(Object.keys(value).sort(), expected.slice().sort(), 'Key set differs'); }
  function api(){ return window.CRIOS_RUNTIME_LAUNCH; }
  function resolve(search){ return api().resolveLaunchRequest(search); }
  function expectFailure(search, code, parameter){
    var result = resolve(search);
    assert(!result.success, 'Expected failure');
    equal(result.request, null);
    equal(result.error.code, code);
    equal(result.error.parameter, parameter);
    assert(api().isLaunchResolution(result));
    return result;
  }

  test('01 API pública exacta y congelada', function(){
    exactKeys(api(), ['version','constants','resolveLaunchRequest','buildPublishedLaunchSearch','buildLegacyLaunchSearch','isLaunchResolution']);
    assert(Object.isFrozen(api()));
    equal(api().version, '1.1.0');
  });
  test('02 constantes exactas y congeladas', function(){
    exactKeys(api().constants, ['modes','parameters','errorCodes','maxCampaignIdLength','maxPublicationIdLength']);
    assert(Object.isFrozen(api().constants));
    assert(Object.isFrozen(api().constants.modes));
    equal(api().constants.maxCampaignIdLength, 160);
    equal(api().constants.maxPublicationIdLength, 200);
  });
  test('03 consulta vacía no fuerza modo', function(){
    var result = resolve('');
    assert(result.success);
    deepEqual(result.request, {explicit:false,sourceMode:null,campaignId:null,publicationId:null});
  });
  test('04 signo de pregunta solo no fuerza modo', function(){
    assert(resolve('?').success);
    equal(resolve('?').request.explicit, false);
  });
  test('05 parámetros ajenos no fuerzan modo', function(){
    var result = resolve('?trace=1&controlled-source=x');
    assert(result.success);
    equal(result.request.explicit, false);
  });
  test('06 resolución por defecto está congelada en profundidad', function(){
    var result = resolve('');
    assert(Object.isFrozen(result));
    assert(Object.isFrozen(result.request));
    assert(api().isLaunchResolution(result));
  });
  test('07 legacy explícito', function(){
    var result = resolve('?source=legacy');
    deepEqual(result.request, {explicit:true,sourceMode:'legacy',campaignId:null,publicationId:null});
  });
  test('08 legacy acepta espacios codificados alrededor del valor', function(){
    equal(resolve('?source=%20legacy%20').request.sourceMode, 'legacy');
  });
  test('09 published explícito', function(){
    var result = resolve('?source=published&campaignId=campana-1&publicationId=pub-1');
    deepEqual(result.request, {explicit:true,sourceMode:'published',campaignId:'campana-1',publicationId:'pub-1'});
  });
  test('10 campaignId se normaliza por bordes', function(){
    equal(resolve('?source=published&campaignId=%20campana-1%20&publicationId=pub-1').request.campaignId, 'campana-1');
  });
  test('11 campaignId Unicode válido', function(){
    equal(resolve('?source=published&campaignId=campa%C3%B1a-%C3%A1rea&publicationId=pub-1').request.campaignId, 'campaña-área');
  });
  test('12 campaignId con espacio interno válido', function(){
    equal(resolve('?source=published&campaignId=grupo+uno&publicationId=pub-1').request.campaignId, 'grupo uno');
  });
  test('13 orden de parámetros indiferente', function(){
    equal(resolve('?publicationId=pub-1&campaignId=campana-1&source=published').request.sourceMode, 'published');
  });
  test('14 parámetros ajenos conviven con lanzamiento', function(){
    equal(resolve('?trace=1&source=published&campaignId=campana-1&publicationId=pub-1&run=x').request.campaignId, 'campana-1');
  });
  test('15 builder published canónico', function(){
    equal(api().buildPublishedLaunchSearch('campana-1', 'pub-1'), '?source=published&campaignId=campana-1&publicationId=pub-1');
  });
  test('16 builder published codifica y normaliza', function(){
    equal(api().buildPublishedLaunchSearch(' campaña uno ', ' pub uno '), '?source=published&campaignId=campa%C3%B1a%20uno&publicationId=pub%20uno');
  });
  test('17 builder published hace roundtrip', function(){
    var search = api().buildPublishedLaunchSearch('campaña uno', 'publicación uno');
    equal(resolve(search).request.campaignId, 'campaña uno');
    equal(resolve(search).request.publicationId, 'publicación uno');
  });
  test('18 builder legacy canónico', function(){
    equal(api().buildLegacyLaunchSearch(), '?source=legacy');
  });
  test('19 source duplicado se rechaza', function(){
    expectFailure('?source=legacy&source=published', 'DUPLICATE_PARAMETER', 'source');
  });
  test('20 campaignId duplicado se rechaza', function(){
    expectFailure('?source=published&campaignId=a&campaignId=b&publicationId=p', 'DUPLICATE_PARAMETER', 'campaignId');
  });
  test('20b publicationId duplicado se rechaza', function(){
    expectFailure('?source=published&campaignId=a&publicationId=p&publicationId=q', 'DUPLICATE_PARAMETER', 'publicationId');
  });
  test('21 source vacío se rechaza', function(){
    expectFailure('?source=', 'INVALID_SOURCE', 'source');
  });
  test('22 source desconocido se rechaza sin fallback', function(){
    expectFailure('?source=preview', 'UNSUPPORTED_SOURCE', 'source');
  });
  test('23 source distingue mayúsculas', function(){
    expectFailure('?source=Published&campaignId=a&publicationId=p', 'UNSUPPORTED_SOURCE', 'source');
  });
  test('24 campaignId sin source se rechaza', function(){
    expectFailure('?campaignId=a&publicationId=p', 'SOURCE_REQUIRED', 'source');
  });
  test('25 published sin campaignId se rechaza', function(){
    expectFailure('?source=published&publicationId=p', 'CAMPAIGN_ID_REQUIRED', 'campaignId');
  });
  test('25b published sin publicationId se rechaza', function(){
    expectFailure('?source=published&campaignId=a', 'PUBLICATION_ID_REQUIRED', 'publicationId');
  });
  test('26 campaignId vacío se rechaza', function(){
    expectFailure('?source=published&campaignId=&publicationId=p', 'INVALID_CAMPAIGN_ID', 'campaignId');
  });
  test('27 campaignId solo espacios se rechaza', function(){
    expectFailure('?source=published&campaignId=+++&publicationId=p', 'INVALID_CAMPAIGN_ID', 'campaignId');
  });
  test('27b publicationId vacío se rechaza', function(){
    expectFailure('?source=published&campaignId=a&publicationId=', 'INVALID_PUBLICATION_ID', 'publicationId');
  });
  test('27c publicationId solo espacios se rechaza', function(){
    expectFailure('?source=published&campaignId=a&publicationId=+++', 'INVALID_PUBLICATION_ID', 'publicationId');
  });
  test('28 legacy con campaignId se rechaza', function(){
    expectFailure('?source=legacy&campaignId=a', 'CAMPAIGN_ID_NOT_ALLOWED', 'campaignId');
  });
  test('28b legacy con publicationId se rechaza', function(){
    expectFailure('?source=legacy&publicationId=p', 'PUBLICATION_ID_NOT_ALLOWED', 'publicationId');
  });
  test('29 escape inválido en source se rechaza', function(){
    expectFailure('?source=%E0%A4%A', 'MALFORMED_QUERY', null);
  });
  test('30 escape inválido en campaignId se rechaza', function(){
    expectFailure('?source=published&campaignId=a&publicationId=%ZZ', 'MALFORMED_QUERY', null);
  });
  test('31 fragmento dentro del search se rechaza', function(){
    expectFailure('?source=legacy#x', 'MALFORMED_QUERY', null);
  });
  test('32 control en campaignId se rechaza', function(){
    expectFailure('?source=published&campaignId=a%0Ab&publicationId=p', 'INVALID_CAMPAIGN_ID', 'campaignId');
  });
  test('32b control en publicationId se rechaza', function(){
    expectFailure('?source=published&campaignId=a&publicationId=p%0Aq', 'INVALID_PUBLICATION_ID', 'publicationId');
  });
  test('33 longitud máxima de campaignId es válida', function(){
    var id = new Array(161).join('a');
    equal(resolve(api().buildPublishedLaunchSearch(id, 'pub')).request.campaignId.length, 160);
  });
  test('34 campaignId sobre longitud máxima se rechaza', function(){
    var id = new Array(162).join('a');
    expectFailure('?source=published&campaignId=' + id + '&publicationId=pub', 'INVALID_CAMPAIGN_ID', 'campaignId');
  });
  test('34b longitud máxima de publicationId es válida', function(){
    var id = new Array(201).join('p');
    equal(resolve(api().buildPublishedLaunchSearch('campana', id)).request.publicationId.length, 200);
  });
  test('34c publicationId sobre longitud máxima se rechaza', function(){
    var id = new Array(202).join('p');
    expectFailure('?source=published&campaignId=campana&publicationId=' + id, 'INVALID_PUBLICATION_ID', 'publicationId');
  });
  test('35 builder published rechaza vacío con código', function(){
    var thrown = null;
    try { api().buildPublishedLaunchSearch('', 'pub'); } catch (error) { thrown = error; }
    assert(thrown);
    equal(thrown.code, 'INVALID_CAMPAIGN_ID');
    equal(thrown.parameter, 'campaignId');
  });
  test('36 builder published rechaza controles', function(){
    var thrown = null;
    try { api().buildPublishedLaunchSearch('a\nb', 'pub'); } catch (error) { thrown = error; }
    equal(thrown && thrown.code, 'INVALID_CAMPAIGN_ID');
  });
  test('36b builder published requiere publicationId válido', function(){
    var thrown = null;
    try { api().buildPublishedLaunchSearch('campana', ''); } catch (error) { thrown = error; }
    assert(thrown);
    equal(thrown.code, 'INVALID_PUBLICATION_ID');
    equal(thrown.parameter, 'publicationId');
  });
  test('37 null equivale a ausencia de solicitud', function(){
    equal(resolve(null).request.explicit, false);
  });
  test('38 error tiene claves exactas', function(){
    var result = expectFailure('?source=x', 'UNSUPPORTED_SOURCE', 'source');
    exactKeys(result.error, ['code','message','parameter']);
  });
  test('39 error está congelado en profundidad', function(){
    var result = expectFailure('?source=x', 'UNSUPPORTED_SOURCE', 'source');
    assert(Object.isFrozen(result));
    assert(Object.isFrozen(result.error));
  });
  test('40 request tiene claves exactas', function(){
    exactKeys(resolve('?source=legacy').request, ['explicit','sourceMode','campaignId','publicationId']);
  });
  test('41 validador acepta resolución válida', function(){
    assert(api().isLaunchResolution(resolve('?source=published&campaignId=a&publicationId=p')));
  });
  test('42 validador rechaza copia mutable', function(){
    var mutable = JSON.parse(JSON.stringify(resolve('?source=legacy')));
    assert(!api().isLaunchResolution(mutable));
  });
  test('43 funciones públicas no contienen dependencias de entorno', function(){
    var source = [api().resolveLaunchRequest, api().buildPublishedLaunchSearch, api().buildLegacyLaunchSearch].join('\n');
    ['document','localStorage','sessionStorage','fetch(','XMLHttpRequest','setTimeout','setInterval'].forEach(function(token){
      assert(source.indexOf(token) < 0, 'Unexpected environment dependency: ' + token);
    });
  });
  test('44 resolver no toca DOM, storage, red ni timers', function(){
    var counters = {query:0,local:0,session:0,fetch:0,timeout:0,interval:0};
    var originalQuery = document.querySelector;
    var originalLocal = localStorage.getItem;
    var originalSession = sessionStorage.getItem;
    var originalFetch = window.fetch;
    var originalTimeout = window.setTimeout;
    var originalInterval = window.setInterval;
    document.querySelector = function(){ counters.query += 1; return null; };
    localStorage.getItem = function(){ counters.local += 1; return null; };
    sessionStorage.getItem = function(){ counters.session += 1; return null; };
    window.fetch = function(){ counters.fetch += 1; return Promise.reject(new Error('unexpected')); };
    window.setTimeout = function(){ counters.timeout += 1; return 0; };
    window.setInterval = function(){ counters.interval += 1; return 0; };
    try {
      assert(resolve('?source=published&campaignId=a&publicationId=p').success);
    } finally {
      document.querySelector = originalQuery;
      localStorage.getItem = originalLocal;
      sessionStorage.getItem = originalSession;
      window.fetch = originalFetch;
      window.setTimeout = originalTimeout;
      window.setInterval = originalInterval;
    }
    deepEqual(counters, {query:0,local:0,session:0,fetch:0,timeout:0,interval:0});
  });

  async function run(){
    for (var index = 0; index < definitions.length; index += 1) {
      try {
        await definitions[index].run();
        results.push(Object.freeze({name:definitions[index].name,passed:true,error:null}));
      } catch (error) {
        results.push(Object.freeze({name:definitions[index].name,passed:false,error:String(error && error.message || error)}));
      }
    }
    var passed = results.filter(function(item){ return item.passed; }).length;
    var output = Object.freeze({
      status: passed === results.length && telemetry.pageErrors.length === 0 && telemetry.consoleErrors.length === 0 && telemetry.unhandledRejections.length === 0 ? 'PASS' : 'FAIL',
      total: results.length,
      passed: passed,
      failed: results.length - passed,
      tests: Object.freeze(results.slice()),
      durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
      pageErrors: Object.freeze(telemetry.pageErrors.slice()),
      consoleErrors: Object.freeze(telemetry.consoleErrors.slice()),
      consoleWarnings: Object.freeze(telemetry.consoleWarnings.slice()),
      unhandledRejections: Object.freeze(telemetry.unhandledRejections.slice())
    });
    window.CRIOS_RUNTIME_LAUNCH_CONTRACT_TEST_RESULTS = output;
    document.getElementById('results').textContent = JSON.stringify(output, null, 2);
  }

  run();
})();
