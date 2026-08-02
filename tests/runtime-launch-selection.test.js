(function(){
  'use strict';

  var startedAt=performance.now();
  var tests=[];
  var telemetry={pageErrors:[],consoleErrors:[],unhandledRejections:[]};
  var originalConsoleError=console.error;
  window.addEventListener('error',function(event){telemetry.pageErrors.push(String(event.error&&event.error.message||event.message||'error'));});
  window.addEventListener('unhandledrejection',function(event){telemetry.unhandledRejections.push(String(event.reason&&event.reason.message||event.reason||'rejection'));});
  console.error=function(){telemetry.consoleErrors.push(Array.prototype.map.call(arguments,String).join(' '));return originalConsoleError.apply(console,arguments);};

  function assert(name,condition,detail){tests.push(Object.freeze({name:name,passed:Boolean(condition),error:condition?null:String(detail||'Assertion failed.')}));}
  function equal(name,actual,expected){assert(name,Object.is(actual,expected),'actual='+String(actual)+' expected='+String(expected));}
  function selection(configuredMode,search,api){return window.CRIOS_RUNTIME_LAUNCH_SELECTION.selectRuntimeLaunch(configuredMode,search,api===undefined?window.CRIOS_RUNTIME_LAUNCH:api);}

  Promise.resolve().then(function(){
    var api=window.CRIOS_RUNTIME_LAUNCH_SELECTION;
    assert('API existe',Boolean(api));
    equal('versión exacta',api.version,'1.0.0');
    assert('API congelada',Object.isFrozen(api));
    equal('API exacta',Object.keys(api).sort().join(','),['errorCodes','isRuntimeLaunchSelection','selectRuntimeLaunch','version'].sort().join(','));

    var legacyDefault=selection('legacy','');
    assert('legacy default válido',api.isRuntimeLaunchSelection(legacyDefault));
    equal('legacy default no explícito',legacyDefault.explicit,false);
    equal('legacy default no bloqueado',legacyDefault.blocked,false);
    equal('legacy default mode',legacyDefault.sourceMode,'legacy');
    equal('legacy default sin campaignId',legacyDefault.campaignId,null);
    equal('legacy default sin error',legacyDefault.error,null);

    var publishedDefault=selection('published','?other=value');
    assert('published configurado válido',api.isRuntimeLaunchSelection(publishedDefault));
    equal('parámetros desconocidos no fuerzan lanzamiento',publishedDefault.explicit,false);
    equal('published configurado permanece',publishedDefault.sourceMode,'published');
    equal('published configurado sin id explícito',publishedDefault.campaignId,null);

    var explicitLegacy=selection('published','?source=legacy');
    assert('legacy explícito válido',api.isRuntimeLaunchSelection(explicitLegacy));
    equal('legacy explícito prevalece',explicitLegacy.sourceMode,'legacy');
    equal('legacy explícito marcado',explicitLegacy.explicit,true);
    equal('legacy explícito sin id',explicitLegacy.campaignId,null);

    var explicitPublished=selection('legacy','?source=published&campaignId=campaign-alpha');
    assert('published explícito válido',api.isRuntimeLaunchSelection(explicitPublished));
    equal('published explícito prevalece',explicitPublished.sourceMode,'published');
    equal('published explícito marcado',explicitPublished.explicit,true);
    equal('published conserva campaignId',explicitPublished.campaignId,'campaign-alpha');
    equal('published explícito no bloqueado',explicitPublished.blocked,false);

    var missingCampaign=selection('legacy','?source=published');
    assert('published incompleto bloqueado',api.isRuntimeLaunchSelection(missingCampaign));
    equal('published incompleto blocked',missingCampaign.blocked,true);
    equal('published incompleto sin modo',missingCampaign.sourceMode,null);
    equal('published incompleto código',missingCampaign.error.code,'CAMPAIGN_ID_REQUIRED');
    assert('error heredado congelado',Object.isFrozen(missingCampaign.error));

    var sourceRequired=selection('legacy','?campaignId=campaign-alpha');
    equal('campaignId aislado bloqueado',sourceRequired.blocked,true);
    equal('campaignId aislado código',sourceRequired.error.code,'SOURCE_REQUIRED');

    var duplicate=selection('legacy','?source=legacy&source=published');
    equal('duplicado bloqueado',duplicate.blocked,true);
    equal('duplicado código',duplicate.error.code,'DUPLICATE_PARAMETER');

    var invalidConfigured=selection('other','');
    assert('configuración inválida reconocida',api.isRuntimeLaunchSelection(invalidConfigured));
    equal('configuración inválida bloqueada',invalidConfigured.blocked,true);
    equal('configuración inválida código',invalidConfigured.error.code,'INVALID_RUNTIME_CAMPAIGN_MODE');

    var explicitOverridesInvalid=selection('other','?source=published&campaignId=campaign-beta');
    equal('solicitud explícita prevalece sobre config inválida',explicitOverridesInvalid.sourceMode,'published');
    equal('solicitud explícita válida no bloqueada',explicitOverridesInvalid.blocked,false);

    var missingContractKnown=selection('legacy','?source=published&campaignId=campaign-gamma',null);
    equal('contrato ausente con parámetros bloquea',missingContractKnown.blocked,true);
    equal('contrato ausente código',missingContractKnown.error.code,'LAUNCH_CONTRACT_UNAVAILABLE');

    var missingContractDefault=selection('legacy','?unrelated=1',null);
    equal('contrato ausente sin solicitud conserva modo',missingContractDefault.sourceMode,'legacy');
    equal('contrato ausente sin solicitud no bloquea',missingContractDefault.blocked,false);

    assert('selección congelada',Object.isFrozen(explicitPublished));
    assert('objeto arbitrario no es selección',!api.isRuntimeLaunchSelection({}));
    assert('mutación rechazada',function(){try{explicitPublished.sourceMode='legacy';}catch(ignore){}return explicitPublished.sourceMode==='published';}());
    equal('builder legacy interoperable',window.CRIOS_RUNTIME_LAUNCH.buildLegacyLaunchSearch(),'?source=legacy');
    equal('builder published interoperable',window.CRIOS_RUNTIME_LAUNCH.buildPublishedLaunchSearch('campaign alpha'),'?source=published&campaignId=campaign%20alpha');

    assert('sin errores de página',telemetry.pageErrors.length===0,telemetry.pageErrors.join(' | '));
    assert('sin errores de consola',telemetry.consoleErrors.length===0,telemetry.consoleErrors.join(' | '));
    assert('sin rechazos no controlados',telemetry.unhandledRejections.length===0,telemetry.unhandledRejections.join(' | '));
  }).catch(function(error){assert('ejecución del runner',false,error&&error.stack||error);}).finally(function(){
    var failed=tests.filter(function(test){return !test.passed;});
    var result=Object.freeze({status:failed.length?'FAIL':'PASS',total:tests.length,passed:tests.length-failed.length,failed:failed.length,tests:Object.freeze(tests.slice()),pageErrors:Object.freeze(telemetry.pageErrors.slice()),consoleErrors:Object.freeze(telemetry.consoleErrors.slice()),unhandledRejections:Object.freeze(telemetry.unhandledRejections.slice()),durationMs:Math.round((performance.now()-startedAt)*10)/10});
    window.CRIOS_RUNTIME_LAUNCH_SELECTION_TEST_RESULTS=result;
    document.getElementById('results').textContent=JSON.stringify(result,null,2);
    console.error=originalConsoleError;
  });
})();
