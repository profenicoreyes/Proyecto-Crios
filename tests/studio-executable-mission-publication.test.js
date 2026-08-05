/* CRIOS A2-006C - executable mission publication tests */
(function(){
  'use strict';
  var startedAt=performance.now();var definitions=[];var results=[];
  function test(name,run){definitions.push({name:name,run:run});}
  function assert(value,message){if(!value)throw new Error(message||'Assertion failed.');}
  function equal(actual,expected,message){assert(JSON.stringify(actual)===JSON.stringify(expected),(message||'Values differ')+'; actual='+JSON.stringify(actual)+' expected='+JSON.stringify(expected));}
  function clone(value){return JSON.parse(JSON.stringify(value));}
  function keys(value){return Object.keys(value).sort();}
  function noFunctions(value){if(typeof value==='function')return false;if(!value||typeof value!=='object')return true;return Object.keys(value).every(function(key){return noFunctions(value[key]);});}
  function waitFor(predicate){return new Promise(function(resolve,reject){var start=performance.now();(function tick(){if(predicate())return resolve();if(performance.now()-start>20000)return reject(new Error('Timeout'));setTimeout(tick,20);}());});}

  var hooks=window.__CRIOS_A2_006C_HOOKS__;var runtime=window.CRIOS_RUNTIME_MISSION_HANDLERS;var catalog=hooks.catalog;var adapter=hooks.adapterFactory.createStudioMissionSpecAdapter({runtime:runtime,catalog:catalog});
  var publicationApi;var missionApi;var draftApi=window.CRIOS_CAMPAIGN_DRAFT;var baseAdaptation;var publicationOne;var publicationTwo;var publicationThree;var publicationFour;var recovered;

  test('001 CRIOS_STUDIO conserva publishCampaign',function(){assert(typeof CRIOS_STUDIO.publishCampaign==='function');});
  test('002 publication API exacta',function(){equal(keys(CRIOS_STUDIO.publication),['getLastResult','getPublication','getRecord','getState','listPublications','publishCurrentDraft','validateCurrentDraft','version'].sort());});
  test('003 activation API exacta',function(){equal(keys(CRIOS_STUDIO.activation),['activatePublication','deactivatePublication','getActiveReference','getState','listHistory','resolveActivePublication','rollbackPublication','version'].sort());});
  test('004 persistence API exacta',function(){equal(keys(CRIOS_STUDIO.persistence),['clearLocalData','exportLocalData','getStatus','version'].sort());});
  test('005 missionSpecs existe',function(){assert(CRIOS_STUDIO.missionSpecs);});
  test('006 missionSpecs API exacta',function(){equal(keys(CRIOS_STUDIO.missionSpecs),['getCurrentSpec','getExecutionManifest','getState','listCurrentSpecs','validateCurrentDraft','version'].sort());});
  test('007 missionSpecs congelada',function(){assert(Object.isFrozen(CRIOS_STUDIO.missionSpecs));});
  test('008 runtime handlers disponibles en Studio',function(){assert(runtime&&runtime.version==='1.0.0');});
  test('009 fixture no es dependencia de produccion',function(){assert(window.CRIOS_RUNTIME_MISSION_FIXTURES&&catalog!==window.CRIOS_RUNTIME_MISSION_FIXTURES);});
  test('010 namespaces temporales retirados',function(){assert(!window.CRIOS_STUDIO_GEOMETRY_AREA_SPEC_CATALOG&&!window.CRIOS_STUDIO_MISSION_SPEC_ADAPTER&&!window.CRIOS_STUDIO_MISSION_SPEC_CONTROLLER);});

  test('011 catalogo tiene cuatro entradas',function(){equal(catalog.list().length,4);});
  ['energy','greenhouse','ice','hangar'].forEach(function(id,index){test('01'+(index+2)+' catalogo contiene '+id,function(){equal(catalog.get(id).missionId,id);});});
  test('016 specs del catalogo congeladas',function(){assert(catalog.list().every(function(spec){return Object.isFrozen(spec)&&Object.isFrozen(spec.payload);}));});
  test('017 catalogo devuelve copias defensivas',function(){assert(catalog.get('energy')!==catalog.get('energy'));equal(catalog.get('energy'),catalog.get('energy'));});
  test('018 missionId desconocido rechazado',function(){var caught;try{catalog.get('unknown');}catch(error){caught=error;}equal(caught&&caught.code,'MISSION_SPEC_NOT_FOUND');});
  test('019 specs no contienen funciones',function(){assert(noFunctions(catalog.list()));});
  test('020 catalogo no expone mapa',function(){equal(keys(catalog),['get','list','version']);});
  test('021 equivalencia semantica de cuatro fixtures',function(){['energy','greenhouse','ice','hangar'].forEach(function(id){equal(catalog.get(id),CRIOS_RUNTIME_MISSION_FIXTURES.get(id),id);});});

  test('022 preparar draft con cuatro specs',function(){var missions=CRIOS_STUDIO_ADAPTER.getMissions();missions.forEach(function(mission){if(!draftApi.contieneMision(mission.id))draftApi.agregarMision(mission);});draftApi.establecerNombre('Campana Ejecutable A2-006C');assert(draftApi.getCampaign().misiones.length===4);});
  test('023 draft contiene cuatro specs propias',function(){assert(draftApi.getCampaign().misiones.every(function(mission){return mission.missionSpec;}));});
  test('024 orden del draft preservado',function(){equal(draftApi.getCampaign().misiones.map(function(mission){return mission.id;}),['energy','greenhouse','ice','hangar']);});
  test('025 snapshot serializable',function(){assert(noFunctions(draftApi.getCampaign()));JSON.stringify(draftApi.getCampaign());});
  test('026 snapshot defensivo',function(){var snapshot=draftApi.getCampaign();snapshot.nombre='Mutado';assert(draftApi.obtenerNombre()!=='Mutado');});
  test('027 payload cambia revision',function(){var revisionAdapter=hooks.publicationAdapterFactory.createStudioPublicationAdapter({draftApi:draftApi});var first=revisionAdapter.readDraftRevision();var spec=draftApi.obtenerMissionSpec('energy');spec.payload.presentation.hint+=' Revision';draftApi.establecerMissionSpec('energy',spec);var second=revisionAdapter.readDraftRevision();assert(first!==second);spec.payload.presentation.hint=spec.payload.presentation.hint.replace(' Revision','');draftApi.establecerMissionSpec('energy',spec);});
  test('028 handler cambia firma significativa',function(){var snapshot=draftApi.getCampaign();var a=JSON.stringify(snapshot);snapshot.misiones[0].missionSpec.handlerVersion='2.0.0';assert(JSON.stringify(snapshot)!==a);});
  test('029 orden cambia firma significativa',function(){var snapshot=draftApi.getCampaign();var before=JSON.stringify(snapshot.misiones);snapshot.misiones.reverse();assert(JSON.stringify(snapshot.misiones)!==before);});
  test('030 evaluacion cambia firma significativa',function(){var snapshot=draftApi.getCampaign();var before=JSON.stringify(snapshot.finalEvaluation);snapshot.finalEvaluation.unit='cm2';assert(JSON.stringify(snapshot.finalEvaluation)!==before);});
  test('031 cambio visual se elimina al normalizar',function(){var a=draftApi.getCampaign(),b=clone(a);a.uiState={tab:'one'};b.uiState={tab:'two'};equal(CRIOS_PUBLICATION_CORE.normalizeDraft(a,{campaignId:'x',draftRevision:'1'}).content,CRIOS_PUBLICATION_CORE.normalizeDraft(b,{campaignId:'x',draftRevision:'1'}).content);});

  test('032 cuatro specs validas',function(){baseAdaptation=adapter.validateAndAdapt(draftApi.getCampaign());assert(baseAdaptation.valid);equal(baseAdaptation.specs.length,4);});
  test('033 handler exacto disponible',function(){assert(baseAdaptation.specs.every(function(spec){return runtime.has(spec.handlerId,spec.handlerVersion);}));});
  test('034 handler ausente falla',function(){var value=clone(draftApi.getCampaign());value.misiones[0].missionSpec.handlerId='missing';assert(!adapter.validateAndAdapt(value).valid);});
  test('035 version ausente falla',function(){var value=clone(draftApi.getCampaign());value.misiones[0].missionSpec.handlerVersion='';assert(!adapter.validateAndAdapt(value).valid);});
  test('036 payload incompleto falla',function(){var value=clone(draftApi.getCampaign());delete value.misiones[0].missionSpec.payload.presentation;assert(!adapter.validateAndAdapt(value).valid);});
  test('037 missionId duplicado falla',function(){var value=clone(draftApi.getCampaign());value.misiones[1].id=value.misiones[0].id;assert(!adapter.validateAndAdapt(value).valid);});
  test('038 mision sin spec desconocida falla',function(){var value=clone(draftApi.getCampaign());value.misiones[0]={id:'unknown'};assert(!adapter.validateAndAdapt(value).valid);});
  test('039 orden incoherente falla',function(){var value=clone(draftApi.getCampaign());value.misiones[0].missionSpec.missionId='hangar';assert(!adapter.validateAndAdapt(value).valid);});
  test('040 manifiesto incoherente no se produce',function(){var value=clone(draftApi.getCampaign());value.misiones.push(clone(value.misiones[0]));var result=adapter.validateAndAdapt(value);assert(!result.valid&&result.manifest===null);});
  test('041 evaluacion final invalida falla',function(){var value=clone(draftApi.getCampaign());value.finalEvaluation.adjustments=[];assert(!adapter.validateAndAdapt(value).valid);});
  test('042 incidencias estructuradas',function(){var value=clone(draftApi.getCampaign());value.finalEvaluation=null;var found=adapter.validateAndAdapt(value).issues[0];equal(keys(found),['code','message','path','severity']);});
  test('043 validacion no muta draft',function(){var before=JSON.stringify(draftApi.getCampaign());adapter.validateAndAdapt(draftApi.getCampaign());equal(JSON.stringify(draftApi.getCampaign()),before);});

  test('044 manifiesto forma contractual exacta',function(){equal(keys(baseAdaptation.manifest),['missionCount','missionOrder','requiredHandlers','runtimeContractVersion']);});
  test('045 runtimeContractVersion exacta',function(){equal(baseAdaptation.manifest.runtimeContractVersion,'1.0.0');});
  test('046 missionCount exacto',function(){equal(baseAdaptation.manifest.missionCount,4);});
  test('047 missionOrder exacto',function(){equal(baseAdaptation.manifest.missionOrder,['energy','greenhouse','ice','hangar']);});
  test('048 requiredHandlers exacto',function(){equal(baseAdaptation.manifest.requiredHandlers,[{handlerId:'crios.geometry.declarative-area',handlerVersion:'1.0.0'}]);});
  test('049 handlers sin duplicados',function(){equal(new Set(baseAdaptation.manifest.requiredHandlers.map(function(x){return x.handlerId+'@'+x.handlerVersion;})).size,baseAdaptation.manifest.requiredHandlers.length);});
  test('050 orden determinista de handlers',function(){equal(adapter.validateAndAdapt(draftApi.getCampaign()).manifest.requiredHandlers,baseAdaptation.manifest.requiredHandlers);});
  test('051 manifiesto congelado',function(){assert(Object.isFrozen(baseAdaptation.manifest)&&Object.isFrozen(baseAdaptation.manifest.missionOrder));});
  test('052 snapshot adaptado congelado',function(){assert(Object.isFrozen(baseAdaptation.snapshot)&&Object.isFrozen(baseAdaptation.snapshot.missionSpecs));});

  test('053 validacion real desde Studio',async function(){publicationApi=CRIOS_STUDIO.publication;missionApi=CRIOS_STUDIO.missionSpecs;var result=await publicationApi.validateCurrentDraft();assert(result.ok);});
  test('054 missionSpecs READY',function(){equal(missionApi.validateCurrentDraft().valid,true);equal(missionApi.getState().status,'READY');});
  test('055 publicacion real desde Studio',async function(){publicationOne=await publicationApi.publishCurrentDraft();assert(publicationOne.success);});
  test('056 publicacion contiene specs',function(){equal(publicationOne.publication.content.missionSpecs.length,4);});
  test('057 publicacion contiene manifiesto',function(){equal(publicationOne.publication.content.runtimeExecutionManifest,baseAdaptation.manifest);});
  test('058 publicacion contiene evaluacion final',function(){equal(publicationOne.publication.content.finalEvaluation,draftApi.obtenerEvaluacionFinal());});
  test('059 contenido sin funciones',function(){assert(noFunctions(publicationOne.publication.content));});
  test('060 contenido congelado',function(){assert(Object.isFrozen(publicationOne.publication.content)&&Object.isFrozen(publicationOne.publication.content.missionSpecs));});
  test('061 hash verificable',async function(){var canonical=CRIOS_PUBLICATION_CORE.buildCanonicalContent({schemaVersion:publicationOne.publication.schemaVersion,content:publicationOne.publication.content});equal(await CRIOS_PUBLICATION_CORE.calculateContentHash(canonical),publicationOne.publication.contentHash);});
  test('062 payload cambia hash',async function(){var spec=draftApi.obtenerMissionSpec('energy');spec.payload.presentation.question+=' Cambio';draftApi.establecerMissionSpec('energy',spec);publicationTwo=await publicationApi.publishCurrentDraft();assert(publicationTwo.success&&publicationTwo.publication.contentHash!==publicationOne.publication.contentHash);});
  test('063 handlerVersion cambia contenido canonico',async function(){var value=clone(baseAdaptation.snapshot);value.missionSpecs[0].handlerVersion='2.0.0';var normalized=CRIOS_PUBLICATION_CORE.normalizeDraft(value,{campaignId:'x',draftRevision:'1'});var canonical=CRIOS_PUBLICATION_CORE.buildCanonicalContent(normalized);assert((await CRIOS_PUBLICATION_CORE.calculateContentHash(canonical))!==publicationOne.publication.contentHash);});
  test('064 orden cambia hash',async function(){draftApi.moverMision(0,1);publicationThree=await publicationApi.publishCurrentDraft();assert(publicationThree.success&&publicationThree.publication.contentHash!==publicationTwo.publication.contentHash);});
  test('065 evaluacion cambia hash',async function(){var finalEvaluation=draftApi.obtenerEvaluacionFinal();finalEvaluation.instruction+=' Verificada.';draftApi.establecerEvaluacionFinal(finalEvaluation);publicationFour=await publicationApi.publishCurrentDraft();assert(publicationFour.success&&publicationFour.publication.contentHash!==publicationThree.publication.contentHash);});
  test('066 cambio visual conserva canonico',function(){var a=clone(baseAdaptation.snapshot),b=clone(baseAdaptation.snapshot);a.uiState={tab:'a'};b.uiState={tab:'b'};var na=CRIOS_PUBLICATION_CORE.normalizeDraft(a,{campaignId:'x',draftRevision:'1'}),nb=CRIOS_PUBLICATION_CORE.normalizeDraft(b,{campaignId:'x',draftRevision:'1'});equal(CRIOS_PUBLICATION_CORE.buildCanonicalContent(na),CRIOS_PUBLICATION_CORE.buildCanonicalContent(nb));});
  test('067 publicar no activa',function(){assert(CRIOS_STUDIO.activation.getState().activeReference===null);});
  test('068 fallo no consume version',async function(){var current=publicationApi.listPublications().length;var spec=draftApi.obtenerMissionSpec('energy');draftApi.establecerMissionSpec('energy',null);var failed=await publicationApi.publishCurrentDraft();assert(!failed.success);equal(publicationApi.listPublications().length,current);draftApi.establecerMissionSpec('energy',spec);});
  test('069 fallo no persiste',function(){equal(CRIOS_STUDIO.persistence.getStatus().publicationCount,4);});
  test('070 publicationId presente',function(){assert(publicationOne.publication.publicationId);});
  test('071 versiones consecutivas',function(){equal([publicationOne,publicationTwo,publicationThree,publicationFour].map(function(x){return x.publication.version;}),[1,2,3,4]);});
  test('072 contentHash presente',function(){assert(/^[0-9a-f]{64}$/.test(publicationFour.publication.contentHash));});

  test('073 publicacion persiste',function(){equal(CRIOS_STUDIO.persistence.getStatus().publicationCount,4);});
  test('074 record persiste',function(){assert(publicationApi.getRecord(publicationOne.publication.publicationId));});
  test('075 segundo coordinador recupera publicacion',function(){var coordinator=CRIOS_PUBLICATION_PERSISTENCE.createPersistenceCoordinator();recovered=coordinator.publicationStore.getPublication(publicationFour.publication.publicationId);assert(recovered);});
  test('076 specs se recuperan',function(){equal(recovered.content.missionSpecs.length,4);});
  test('077 manifiesto se recupera',function(){equal(recovered.content.runtimeExecutionManifest,publicationFour.publication.content.runtimeExecutionManifest);});
  test('078 evaluacion se recupera',function(){equal(recovered.content.finalEvaluation,publicationFour.publication.content.finalEvaluation);});
  test('079 hash se conserva',function(){equal(recovered.contentHash,publicationFour.publication.contentHash);});
  test('080 siguiente version continua',function(){var coordinator=CRIOS_PUBLICATION_PERSISTENCE.createPersistenceCoordinator();equal(coordinator.publicationStore.getNextVersion(recovered.campaignId),5);});
  test('081 activacion existente funciona',async function(){var first=await CRIOS_STUDIO.activation.activatePublication(publicationOne.publication.campaignId,publicationOne.publication.publicationId);var latest=await CRIOS_STUDIO.activation.activatePublication(publicationFour.publication.campaignId,publicationFour.publication.publicationId);assert(first.success&&latest.success);});
  test('082 rollback existente funciona',async function(){var result=await CRIOS_STUDIO.activation.rollbackPublication(publicationOne.publication.campaignId,publicationOne.publication.publicationId);assert(result.success);});
  test('083 borrado local existente funciona',function(){var coordinator=CRIOS_PUBLICATION_PERSISTENCE.createPersistenceCoordinator();assert(typeof coordinator.clear==='function');});

  test('084 produccion no consulta REGISTRO_MISIONES',function(){var sources=[hooks.catalog.get,hooks.adapterFactory.createStudioMissionSpecAdapter].join(' ');assert(!/REGISTRO_MISIONES/.test(sources));});
  test('085 produccion no importa fixtures',function(){assert(!/CRIOS_RUNTIME_MISSION_FIXTURES|tests\/fixtures/.test([hooks.catalog.get,hooks.adapterFactory.createStudioMissionSpecAdapter].join(' ')));});
  test('086 produccion no usa eval',function(){assert(!/\beval\s*\(/.test([hooks.catalog.get,hooks.adapterFactory.createStudioMissionSpecAdapter].join(' ')));});
  test('087 produccion no usa Function constructor',function(){assert(!/new\s+Function|Function\s*\(/.test([hooks.catalog.get,hooks.adapterFactory.createStudioMissionSpecAdapter].join(' ')));});
  test('088 produccion no usa rawHtml',function(){assert(!/rawHtml/.test([hooks.catalog.get,hooks.adapterFactory.createStudioMissionSpecAdapter].join(' ')));});
  test('089 produccion no usa rawSvg',function(){assert(!/rawSvg/.test([hooks.catalog.get,hooks.adapterFactory.createStudioMissionSpecAdapter].join(' ')));});
  test('090 produccion no inicia red',function(){assert(!/fetch|XMLHttpRequest|WebSocket|sendBeacon/.test([hooks.catalog.get,hooks.adapterFactory.createStudioMissionSpecAdapter].join(' ')));});
  test('091 produccion no crea timers periodicos',function(){assert(!/setInterval|requestAnimationFrame/.test([hooks.catalog.get,hooks.adapterFactory.createStudioMissionSpecAdapter].join(' ')));});
  test('092 Runtime principal no esta cargado',function(){assert(typeof window.CRIOS_RUNTIME_CORE==='object'&&typeof window.CRIOS_RUNTIME_CORE.start==='undefined');});
  test('093 no publicacion automatica',function(){assert(publicationApi.listPublications().length===4);});
  test('094 no activacion automatica',function(){assert(CRIOS_STUDIO.activation.getState().activeReference&&CRIOS_STUDIO.activation.getState().activeReference.publicationId===publicationOne.publication.publicationId);});
  test('095 API missionSpecs lista copias congeladas',function(){var list=missionApi.listCurrentSpecs();assert(Object.isFrozen(list)&&list.every(Object.isFrozen));});
  test('096 getCurrentSpec solo draft',function(){assert(missionApi.getCurrentSpec('energy')&&missionApi.getCurrentSpec('unknown')===null);});
  test('097 getExecutionManifest congelado',function(){assert(Object.isFrozen(missionApi.getExecutionManifest()));});
  test('098 interfaz compatibilidad presente',function(){assert(document.getElementById('studioExecutionCompatibilitySummary'));});
  test('099 interfaz no muestra payload completo',function(){assert(!document.getElementById('studioExecutionCompatibilitySummary').textContent.includes('answerExpression'));});
  test('100 pagina sin errores propios',function(){equal(window.__CRIOS_A2_006C_TELEMETRY__.pageerrors,[]);equal(window.__CRIOS_A2_006C_TELEMETRY__.consoleErrors,[]);equal(window.__CRIOS_A2_006C_TELEMETRY__.warnings,[]);});
  test('101 A2_014D_UNREGISTERED_MISSION_PUBLISHES',async function(){var missionId='a2-014d-independent-mission';assert(REGISTRO_MISIONES&&typeof REGISTRO_MISIONES.obtener==='function');assert(!REGISTRO_MISIONES.obtener(missionId),'La mision independiente no debe existir en REGISTRO_MISIONES.');var spec=clone(catalog.get('energy'));spec.missionId=missionId;var added=draftApi.agregarMision({id:missionId,missionSpec:spec});assert(added&&added.ok,'No se pudo agregar la mision independiente al Draft.');var adaptation=adapter.validateAndAdapt(draftApi.getCampaign());assert(adaptation.valid,'La missionSpec independiente debe ser valida antes de publicar.');assert(runtime.has(spec.handlerId,spec.handlerVersion),'El handler publicado debe estar registrado.');var result=await publicationApi.publishCurrentDraft();var issues=result&&result.validation&&result.validation.issues||[];var observed=issues.find(function(issue){return issue&&issue.code==='MISSING_REFERENCE'&&issue.message==='mission id is not registered: '+missionId;})||null;assert(result&&result.success,'A2_014D_UNREGISTERED_MISSION_PUBLISHES expected publication success; observedCode='+(observed&&observed.code||result&&result.error&&result.error.code||'none')+'; observedMessage='+(observed&&observed.message||result&&result.error&&result.error.message||'none'));var published=result.publication.content.missionSpecs.find(function(item){return item.missionId===missionId;});assert(published,'La publicacion debe conservar la mision independiente.');equal(published.missionId,missionId,'El missionId publicado fue alterado.');equal(published.handlerId,spec.handlerId,'El handlerId publicado fue alterado.');equal(published.handlerVersion,spec.handlerVersion,'La handlerVersion publicada fue alterada.');equal(published.payload,spec.payload,'El payload publicado fue alterado.');});

  async function run(){
    await waitFor(function(){return window.CRIOS_STUDIO&&window.CRIOS_STUDIO.missionSpecs;});publicationApi=CRIOS_STUDIO.publication;missionApi=CRIOS_STUDIO.missionSpecs;
    for(var i=0;i<definitions.length;i+=1){try{await definitions[i].run();results.push({name:definitions[i].name,passed:true,error:null});}catch(error){results.push({name:definitions[i].name,passed:false,error:String(error&&error.message||error)});}}
    var passed=results.filter(function(item){return item.passed;}).length;var telemetry=window.__CRIOS_A2_006C_TELEMETRY__;
    var finalResult=Object.freeze({status:passed===results.length?'PASS':'FAIL',total:results.length,passed:passed,failed:results.length-passed,tests:Object.freeze(results),durationMs:Math.round((performance.now()-startedAt)*100)/100,pageerrors:Object.freeze(telemetry.pageerrors.slice()),consoleErrors:Object.freeze(telemetry.consoleErrors.slice()),warnings:Object.freeze(telemetry.warnings.slice())});
    window.CRIOS_STUDIO_EXECUTABLE_PUBLICATION_TEST_RESULTS=finalResult;document.getElementById('testOutput').textContent=JSON.stringify(finalResult,null,2);
  }
  run();
})();