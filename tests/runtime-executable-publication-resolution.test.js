/* CRIOS A2-006D - runtime executable publication resolution tests */
(function(){
  'use strict';
  var startedAt=performance.now();var definitions=[];var results=[];var api=window.CRIOS_RUNTIME_EXECUTABLE_PUBLICATION;var handlers=window.CRIOS_RUNTIME_MISSION_HANDLERS;var core=window.CRIOS_PUBLICATION_CORE;var fixtures=window.CRIOS_RUNTIME_MISSION_FIXTURES;var basePublication;var baseReference;var baseResult;
  function test(name,run){definitions.push({name:name,run:run});}
  function assert(value,message){if(!value)throw new Error(message||'Assertion failed.');}
  function equal(actual,expected,message){assert(JSON.stringify(actual)===JSON.stringify(expected),(message||'Values differ')+'; actual='+JSON.stringify(actual)+' expected='+JSON.stringify(expected));}
  function clone(value){return JSON.parse(JSON.stringify(value));}
  function keys(value){return Object.keys(value).sort();}
  function deepFreeze(value){if(!value||typeof value!=='object'||Object.isFrozen(value))return value;Object.keys(value).forEach(function(key){deepFreeze(value[key]);});return Object.freeze(value);}
  function frozenDeep(value){if(!value||typeof value!=='object')return true;return Object.isFrozen(value)&&Object.keys(value).every(function(key){return frozenDeep(value[key]);});}
  function noFunctions(value){if(typeof value==='function')return false;if(!value||typeof value!=='object')return true;return Object.keys(value).every(function(key){return noFunctions(value[key]);});}
  function finalEvaluation(){return {responseType:'NUMERIC_WITH_PROCEDURE',rngPolicy:'SEEDED_SEQUENCE_V1',unit:'m2',instruction:'Integra los resultados de las cuatro misiones.',adjustments:[{name:'recovered',operation:'add',values:[2,4,6]},{name:'loss',operation:'subtract',values:[1,3,5]}]};}
  async function publication(change){var specs=fixtures.createAll();var manifest={runtimeContractVersion:'1.0.0',requiredHandlers:[{handlerId:'crios.geometry.declarative-area',handlerVersion:'1.0.0'}],missionCount:4,missionOrder:['energy','greenhouse','ice','hangar']};var value={campaignId:'campaign-a2-006d',publicationId:'publication-a2-006d-v1',version:1,schemaVersion:'2.0',contentHash:'',content:{nombre:'Campana Runtime A2-006D',missionSpecs:specs,runtimeExecutionManifest:manifest,finalEvaluation:finalEvaluation()}};if(change)change(value);value.contentHash=await core.calculateContentHash(core.buildCanonicalContent({schemaVersion:value.schemaVersion,content:value.content}));return value;}
  function reference(value){return {campaignId:value.campaignId,publicationId:value.publicationId,version:value.version,contentHash:value.contentHash,activatedAt:'2026-07-25T00:00:00.000Z'};}
  function sequenceFactory(values,calls){return function(missionId,index){calls.push({missionId:missionId,index:index});var cursor=0;return function(){var value=values[cursor%values.length];cursor+=1;return value;};};}
  function resolver(options){var opts=options||{};return api.createRuntimePublicationResolver({activeReferenceReader:opts.activeReferenceReader||function(){return baseReference;},publicationReader:opts.publicationReader||function(){return basePublication;},publicationCore:opts.publicationCore||core,missionHandlersApi:opts.missionHandlersApi||handlers,rngFactory:opts.rngFactory||sequenceFactory([0,0.25,0.5,0.75],[])});}
  async function resolvePublication(value,rngFactory){var ref=reference(value);return api.createRuntimePublicationResolver({activeReferenceReader:function(){return ref;},publicationReader:function(){return value;},publicationCore:core,missionHandlersApi:handlers,rngFactory:rngFactory||sequenceFactory([0.1,0.3,0.5,0.7],[])}).resolveActiveCampaign(value.campaignId);}
  async function errorFrom(change,referenceChange){var value=await publication(change);var ref=reference(value);if(referenceChange)referenceChange(ref,value);var result=await api.createRuntimePublicationResolver({activeReferenceReader:function(){return ref;},publicationReader:function(){return value;},publicationCore:core,missionHandlersApi:handlers,rngFactory:sequenceFactory([0.2],[])}).resolveActiveCampaign(value.campaignId);return result.error;}

  test('001 API global existe',function(){assert(api);});
  test('002 API exacta',function(){equal(keys(api),['constants','createRuntimePublicationResolver','isResolvedRuntimeCampaign','validateExecutablePublication','version'].sort());});
  test('003 version exacta',function(){equal(api.version,'1.0.0');});
  test('004 API congelada',function(){assert(Object.isFrozen(api));});
  test('005 constants congeladas profundamente',function(){assert(frozenDeep(api.constants));});
  test('006 codigos requeridos presentes',function(){['INVALID_CAMPAIGN_ID','ACTIVE_REFERENCE_NOT_FOUND','ACTIVE_REFERENCE_MISMATCH','PUBLICATION_NOT_FOUND','PUBLICATION_IDENTITY_MISMATCH','CONTENT_HASH_MISMATCH','UNSUPPORTED_RUNTIME_CONTRACT','INVALID_EXECUTION_MANIFEST','MISSION_COUNT_MISMATCH','MISSION_ORDER_MISMATCH','DUPLICATE_MISSION_ID','INVALID_MISSION_SPEC','HANDLER_NOT_AVAILABLE','HANDLER_VERSION_NOT_AVAILABLE','MISSION_MATERIALIZATION_FAILED','INVALID_FINAL_EVALUATION','INVALID_RESOLVED_CAMPAIGN','RUNTIME_PUBLICATION_RESOLUTION_ERROR'].forEach(function(code){equal(api.constants.errorCodes[code],code);});});
  test('007 namespace temporal retirado',function(){assert(!window.__CRIOS_RUNTIME_EXECUTABLE_PUBLICATION_INTERNAL__);});
  test('008 unico global de produccion nuevo',function(){var before=window.__CRIOS_GLOBALS_BEFORE_RUNTIME_PUBLICATION__,after=window.__CRIOS_GLOBALS_AFTER_RUNTIME_PUBLICATION__;var added=after.filter(function(name){return before.indexOf(name)<0&&name!=='__CRIOS_GLOBALS_BEFORE_RUNTIME_PUBLICATION__';});equal(added,['CRIOS_RUNTIME_EXECUTABLE_PUBLICATION']);});
  test('009 no CRIOS_STUDIO cargado',function(){assert(!Object.prototype.hasOwnProperty.call(window,'CRIOS_STUDIO'));});
  test('010 no REGISTRO_MISIONES cargado',function(){assert(!Object.prototype.hasOwnProperty.call(window,'REGISTRO_MISIONES'));});
  test('011 factory exige dependencias',function(){var caught;try{api.createRuntimePublicationResolver({});}catch(error){caught=error;}assert(caught);});
  test('012 resolver API exacta',function(){equal(keys(resolver()),['resolveActiveCampaign']);});
  test('013 resolver congelado',function(){assert(Object.isFrozen(resolver()));});
  test('014 validate dependencia core',async function(){var result=await api.validateExecutablePublication(basePublication,{publicationCore:null,missionHandlersApi:handlers});assert(!result.valid);});
  test('015 validate dependencia handlers',async function(){var result=await api.validateExecutablePublication(basePublication,{publicationCore:core,missionHandlersApi:null});assert(!result.valid);});

  test('016 campaignId invalido',async function(){equal((await resolver().resolveActiveCampaign('')).error.code,'INVALID_CAMPAIGN_ID');});
  test('017 referencia ausente',async function(){equal((await resolver({activeReferenceReader:function(){return null;}}).resolveActiveCampaign(basePublication.campaignId)).error.code,'ACTIVE_REFERENCE_NOT_FOUND');});
  test('018 referencia de otra campana',async function(){var ref=clone(baseReference);ref.campaignId='other';equal((await resolver({activeReferenceReader:function(){return ref;}}).resolveActiveCampaign(basePublication.campaignId)).error.code,'ACTIVE_REFERENCE_MISMATCH');});
  test('019 publicacion ausente',async function(){equal((await resolver({publicationReader:function(){return null;}}).resolveActiveCampaign(basePublication.campaignId)).error.code,'PUBLICATION_NOT_FOUND');});
  test('020 publicationId incorrecto',async function(){var ref=clone(baseReference);ref.publicationId='other';equal((await resolver({activeReferenceReader:function(){return ref;}}).resolveActiveCampaign(basePublication.campaignId)).error.code,'PUBLICATION_IDENTITY_MISMATCH');});
  test('021 campaignId publicacion incorrecto',async function(){var value=clone(basePublication);value.campaignId='other';equal((await resolver({publicationReader:function(){return value;}}).resolveActiveCampaign(basePublication.campaignId)).error.code,'PUBLICATION_IDENTITY_MISMATCH');});
  test('022 version publicacion incorrecta',async function(){var value=clone(basePublication);value.version=2;equal((await resolver({publicationReader:function(){return value;}}).resolveActiveCampaign(basePublication.campaignId)).error.code,'PUBLICATION_IDENTITY_MISMATCH');});
  test('023 hash referencia incorrecto',async function(){var ref=clone(baseReference);ref.contentHash='0'.repeat(64);equal((await resolver({activeReferenceReader:function(){return ref;}}).resolveActiveCampaign(basePublication.campaignId)).error.code,'PUBLICATION_IDENTITY_MISMATCH');});
  test('024 resultado fallo forma exacta',async function(){equal(keys(await resolver().resolveActiveCampaign('')),['campaign','error','success']);});
  test('025 error forma exacta',async function(){equal(keys((await resolver().resolveActiveCampaign('')).error),['code','message','metadata','path']);});
  test('026 error congelado',async function(){assert(frozenDeep((await resolver().resolveActiveCampaign('')).error));});
  test('027 error sin stack',async function(){assert(!Object.prototype.hasOwnProperty.call((await resolver().resolveActiveCampaign('')).error,'stack'));});

  test('028 publicacion valida',async function(){assert((await api.validateExecutablePublication(basePublication,{publicationCore:core,missionHandlersApi:handlers})).valid);});
  test('029 hash valido resuelve',async function(){assert(baseResult.success);});
  test('030 hash alterado falla',async function(){var value=clone(basePublication);value.content.nombre='alterado';var result=await resolvePublication(value);equal(result.error.code,'CONTENT_HASH_MISMATCH');});
  test('031 contrato 1.0.0',function(){equal(baseResult.campaign.runtimeContractVersion,'1.0.0');});
  test('032 contrato desconocido',async function(){equal((await errorFrom(function(value){value.content.runtimeExecutionManifest.runtimeContractVersion='2.0.0';})).code,'UNSUPPORTED_RUNTIME_CONTRACT');});
  test('033 manifiesto exacto valido',function(){equal(keys(basePublication.content.runtimeExecutionManifest),['missionCount','missionOrder','requiredHandlers','runtimeContractVersion']);});
  test('034 clave desconocida manifiesto',async function(){equal((await errorFrom(function(value){value.content.runtimeExecutionManifest.extra=true;})).code,'INVALID_EXECUTION_MANIFEST');});
  test('035 requiredHandlers preservado',function(){equal(baseResult.campaign.requiredHandlers,basePublication.content.runtimeExecutionManifest.requiredHandlers);});
  test('036 requiredHandlers incoherente',async function(){equal((await errorFrom(function(value){value.content.runtimeExecutionManifest.requiredHandlers=[];})).code,'INVALID_EXECUTION_MANIFEST');});
  test('037 handler ausente',async function(){equal((await errorFrom(function(value){value.content.missionSpecs[0].handlerId='missing.handler';value.content.runtimeExecutionManifest.requiredHandlers=[{handlerId:'missing.handler',handlerVersion:'1.0.0'},{handlerId:'crios.geometry.declarative-area',handlerVersion:'1.0.0'}];})).code,'HANDLER_NOT_AVAILABLE');});
  test('038 version handler ausente',async function(){equal((await errorFrom(function(value){value.content.missionSpecs[0].handlerVersion='2.0.0';value.content.runtimeExecutionManifest.requiredHandlers=[{handlerId:'crios.geometry.declarative-area',handlerVersion:'2.0.0'},{handlerId:'crios.geometry.declarative-area',handlerVersion:'1.0.0'}];})).code,'HANDLER_VERSION_NOT_AVAILABLE');});
  test('039 sin fallback de version',async function(){var error=await errorFrom(function(value){value.content.missionSpecs[0].handlerVersion='2.0.0';value.content.runtimeExecutionManifest.requiredHandlers=[{handlerId:'crios.geometry.declarative-area',handlerVersion:'2.0.0'},{handlerId:'crios.geometry.declarative-area',handlerVersion:'1.0.0'}];});equal(error.metadata.handlerVersion,'2.0.0');});
  test('040 missionCount valido',function(){equal(baseResult.campaign.resolutionMetadata.missionCount,4);});
  test('041 missionCount incorrecto',async function(){equal((await errorFrom(function(value){value.content.runtimeExecutionManifest.missionCount=3;})).code,'MISSION_COUNT_MISMATCH');});
  test('042 missionOrder valido',function(){equal(baseResult.campaign.missionOrder,['energy','greenhouse','ice','hangar']);});
  test('043 missionOrder cantidad incorrecta',async function(){equal((await errorFrom(function(value){value.content.runtimeExecutionManifest.missionOrder.pop();})).code,'MISSION_ORDER_MISMATCH');});
  test('044 missionOrder correspondencia incorrecta',async function(){equal((await errorFrom(function(value){value.content.runtimeExecutionManifest.missionOrder.reverse();})).code,'MISSION_ORDER_MISMATCH');});
  test('045 missionId duplicado',async function(){equal((await errorFrom(function(value){value.content.missionSpecs[1]=clone(value.content.missionSpecs[0]);value.content.runtimeExecutionManifest.missionOrder[1]='energy';})).code,'DUPLICATE_MISSION_ID');});
  test('046 spec ausente',async function(){equal((await errorFrom(function(value){value.content.missionSpecs.pop();})).code,'MISSION_COUNT_MISMATCH');});
  test('047 spec adicional',async function(){equal((await errorFrom(function(value){value.content.missionSpecs.push(clone(value.content.missionSpecs[0]));})).code,'MISSION_COUNT_MISMATCH');});
  test('048 spec raiz invalida',async function(){equal((await errorFrom(function(value){value.content.missionSpecs[0].extra=true;})).code,'INVALID_MISSION_SPEC');});
  test('049 spec payload invalido',async function(){equal((await errorFrom(function(value){delete value.content.missionSpecs[0].payload.presentation;})).code,'INVALID_MISSION_SPEC');});
  test('050 cuatro specs validas',function(){equal(basePublication.content.missionSpecs.length,4);basePublication.content.missionSpecs.forEach(function(spec){assert(handlers.validatePublishedMissionSpec(spec).valid);});});
  test('051 evaluacion final preservada',function(){equal(baseResult.campaign.finalEvaluation,basePublication.content.finalEvaluation);});
  test('052 evaluacion final invalida',async function(){equal((await errorFrom(function(value){value.content.finalEvaluation.adjustments=[];})).code,'INVALID_FINAL_EVALUATION');});

  test('053 raiz ResolvedRuntimeCampaign exacta',function(){equal(keys(baseResult.campaign),['campaignId','contentHash','finalEvaluation','missionOrder','missions','publicationId','publicationVersion','requiredHandlers','resolutionMetadata','runtimeContractVersion']);});
  test('054 resultado exito exacto',function(){equal(keys(baseResult),['campaign','error','success']);});
  test('055 exito error null',function(){assert(baseResult.success&&baseResult.error===null);});
  test('056 isResolvedRuntimeCampaign true',function(){assert(api.isResolvedRuntimeCampaign(baseResult.campaign));});
  test('057 cuatro misiones resueltas',function(){equal(baseResult.campaign.missions.length,4);});
  test('058 orden materializado exacto',function(){equal(baseResult.campaign.missions.map(function(item){return item.missionId;}),baseResult.campaign.missionOrder);});
  test('059 mision resuelta raiz exacta',function(){baseResult.campaign.missions.forEach(function(item){equal(keys(item),['handlerId','handlerVersion','materialization','missionId','missionIndex','publishedSpec']);});});
  test('060 materializacion raiz exacta',function(){baseResult.campaign.missions.forEach(function(item){equal(keys(item.materialization),['content','generatedState','mission']);});});
  test('061 salida sin funciones',function(){assert(noFunctions(baseResult.campaign));});
  test('062 salida congelada profundamente',function(){assert(frozenDeep(baseResult.campaign));});
  test('063 lecturas defensivas',async function(){var first=await resolvePublication(basePublication);var second=await resolvePublication(basePublication);assert(first.campaign!==second.campaign);equal(first.campaign,second.campaign);});
  test('064 publicacion no mutada',async function(){var before=JSON.stringify(basePublication);await resolvePublication(basePublication);equal(JSON.stringify(basePublication),before);});
  test('065 referencia no mutada',async function(){var before=JSON.stringify(baseReference);await resolver().resolveActiveCampaign(basePublication.campaignId);equal(JSON.stringify(baseReference),before);});
  test('066 identidad publicacion preservada',function(){equal([baseResult.campaign.campaignId,baseResult.campaign.publicationId,baseResult.campaign.publicationVersion,baseResult.campaign.contentHash],[basePublication.campaignId,basePublication.publicationId,basePublication.version,basePublication.contentHash]);});
  test('067 metadata determinista exacta',function(){equal(baseResult.campaign.resolutionMetadata,{missionCount:4,handlerCount:1,rngPolicy:'INJECTED_PER_MISSION_V1'});});

  test('068 mismo RNG mismo resultado',async function(){var one=await resolvePublication(basePublication,sequenceFactory([0.1,0.4,0.7],[]));var two=await resolvePublication(basePublication,sequenceFactory([0.1,0.4,0.7],[]));equal(one.campaign,two.campaign);});
  test('069 RNG distinto cambia materializacion',async function(){var one=await resolvePublication(basePublication,sequenceFactory([0],[]));var two=await resolvePublication(basePublication,sequenceFactory([0.9],[]));assert(JSON.stringify(one.campaign.missions[0].materialization.generatedState)!==JSON.stringify(two.campaign.missions[0].materialization.generatedState));});
  test('070 factory RNG una vez por mision',async function(){var calls=[];await resolvePublication(basePublication,sequenceFactory([0.2],calls));equal(calls.map(function(call){return call.missionId;}),['energy','greenhouse','ice','hangar']);});
  test('071 indices RNG exactos',async function(){var calls=[];await resolvePublication(basePublication,sequenceFactory([0.2],calls));equal(calls.map(function(call){return call.index;}),[0,1,2,3]);});
  test('072 RNG aislado por mision',async function(){var rngs=[];var result=await resolvePublication(basePublication,function(){var cursor=0;var rng=function(){cursor+=1;return 0.2;};rngs.push(rng);return rng;});assert(result.success&&new Set(rngs).size===4);});
  test('073 sin llamadas RNG ocultas',async function(){var counts=[];var result=await resolvePublication(basePublication,function(missionId,index){counts[index]=0;return function(){counts[index]+=1;return 0.2;};});assert(result.success);equal(counts,basePublication.content.missionSpecs.map(function(spec){return spec.payload.generation.variables.length;}));});
  test('074 fallo RNG atomico',async function(){var calls=[];var result=await resolvePublication(basePublication,function(missionId,index){calls.push(missionId);if(index===1)return function(){throw new Error('stop');};return function(){return 0.2;};});assert(!result.success&&result.campaign===null);equal(calls,['energy','greenhouse']);});
  test('075 fallo no materializa posteriores',async function(){var calls=[];await resolvePublication(basePublication,function(missionId,index){calls.push(index);return index===2?function(){return 2;}:function(){return 0.2;};});equal(calls,[0,1,2]);});
  test('076 rngFactory invalida',async function(){equal((await resolvePublication(basePublication,function(){return null;})).error.code,'MISSION_MATERIALIZATION_FAILED');});
  test('077 rngFactory obligatoria',async function(){var result=await api.createRuntimePublicationResolver({activeReferenceReader:function(){return baseReference;},publicationReader:function(){return basePublication;},publicationCore:core,missionHandlersApi:handlers}).resolveActiveCampaign(basePublication.campaignId);equal(result.error.code,'MISSION_MATERIALIZATION_FAILED');});

  test('078 inversa posicion',function(){baseResult.campaign.missions.forEach(function(item,index){equal(item.missionIndex,index);});});
  test('079 inversa spec origen',function(){baseResult.campaign.missions.forEach(function(item,index){equal(item.publishedSpec,basePublication.content.missionSpecs[index]);});});
  test('080 inversa missionId',function(){baseResult.campaign.missions.forEach(function(item,index){equal(item.missionId,basePublication.content.runtimeExecutionManifest.missionOrder[index]);});});
  test('081 inversa handlerId',function(){baseResult.campaign.missions.forEach(function(item){equal(item.handlerId,item.publishedSpec.handlerId);});});
  test('082 inversa handlerVersion',function(){baseResult.campaign.missions.forEach(function(item){equal(item.handlerVersion,item.publishedSpec.handlerVersion);});});
  test('083 inversa handler disponible',function(){baseResult.campaign.missions.forEach(function(item){assert(handlers.has(item.handlerId,item.handlerVersion));});});
  test('084 inversa publicacion origen',function(){equal(baseResult.campaign.publicationId,basePublication.publicationId);});
  test('085 inversa hash origen',function(){equal(baseResult.campaign.contentHash,basePublication.contentHash);});
  test('086 ninguna mision sin spec',function(){assert(baseResult.campaign.missions.every(function(item){return item.publishedSpec;}));});
  test('087 ninguna spec sin mision',function(){equal(baseResult.campaign.missions.length,basePublication.content.missionSpecs.length);});
  test('088 reordenar salida invalida',function(){var value=clone(baseResult.campaign);value.missions.reverse();Object.freeze(value);assert(!api.isResolvedRuntimeCampaign(value));});
  test('089 sustituir mision invalida',function(){var value=clone(baseResult.campaign);value.missions[1]=clone(value.missions[0]);Object.freeze(value);assert(!api.isResolvedRuntimeCampaign(value));});
  test('090 alterar handlerId salida invalida',function(){var value=clone(baseResult.campaign);value.missions[0].handlerId='other';Object.freeze(value);assert(!api.isResolvedRuntimeCampaign(value));});
  test('091 alterar handlerVersion salida invalida',function(){var value=clone(baseResult.campaign);value.missions[0].handlerVersion='2.0.0';Object.freeze(value);assert(!api.isResolvedRuntimeCampaign(value));});
  test('092 alterar payload publicado cambia hash',async function(){var value=clone(basePublication);value.content.missionSpecs[0].payload.presentation.question+=' cambio';var result=await resolvePublication(value);equal(result.error.code,'CONTENT_HASH_MISMATCH');});

  test('093 sin DOM durante resolucion',async function(){var calls=0;var original=document.querySelector;document.querySelector=function(){calls+=1;return original.apply(document,arguments);};try{await resolvePublication(basePublication);}finally{document.querySelector=original;}equal(calls,0);});
  test('094 sin storage durante resolucion',async function(){var descriptor=Object.getOwnPropertyDescriptor(window,'localStorage');var calls=0;try{Object.defineProperty(window,'localStorage',{configurable:true,get:function(){calls+=1;throw new Error('storage');}});await resolvePublication(basePublication);}finally{if(descriptor)Object.defineProperty(window,'localStorage',descriptor);}equal(calls,0);});
  test('095 sin red durante resolucion',async function(){var calls=0;var original=window.fetch;window.fetch=function(){calls+=1;throw new Error('network');};try{await resolvePublication(basePublication);}finally{window.fetch=original;}equal(calls,0);});
  test('096 sin timers durante resolucion',async function(){var calls=0;var timeout=window.setTimeout,interval=window.setInterval;window.setTimeout=function(){calls+=1;};window.setInterval=function(){calls+=1;};try{await resolvePublication(basePublication);}finally{window.setTimeout=timeout;window.setInterval=interval;}equal(calls,0);});
  test('097 sin eval durante resolucion',async function(){var original=window.eval;window.eval=function(){throw new Error('eval');};try{assert((await resolvePublication(basePublication)).success);}finally{window.eval=original;}});
  test('098 sin Function durante resolucion',async function(){var original=window.Function;window.Function=function(){throw new Error('Function');};try{assert((await resolvePublication(basePublication)).success);}finally{window.Function=original;}});
  test('099 sin Math.random durante resolucion',async function(){var original=Math.random;Math.random=function(){throw new Error('random');};try{assert((await resolvePublication(basePublication)).success);}finally{Math.random=original;}});
  test('100 sin fallback legacy',function(){var sources=[api.createRuntimePublicationResolver,api.validateExecutablePublication].join(' ');assert(!/REGISTRO_MISIONES|CRIOS_STUDIO|legacy/i.test(sources));});
  test('101 no altera activacion',async function(){var before=JSON.stringify(baseReference);await resolver().resolveActiveCampaign(basePublication.campaignId);equal(JSON.stringify(baseReference),before);});
  test('102 no altera publicacion',async function(){var before=JSON.stringify(basePublication);await resolver().resolveActiveCampaign(basePublication.campaignId);equal(JSON.stringify(basePublication),before);});
  test('103 reader activo una vez',async function(){var count=0;await resolver({activeReferenceReader:function(){count+=1;return baseReference;}}).resolveActiveCampaign(basePublication.campaignId);equal(count,1);});
  test('104 reader publicacion una vez',async function(){var count=0;await resolver({publicationReader:function(){count+=1;return basePublication;}}).resolveActiveCampaign(basePublication.campaignId);equal(count,1);});
  test('105 no intenta otra publicacion',async function(){var count=0;var value=clone(basePublication);value.content.nombre='bad';var result=await resolver({publicationReader:function(){count+=1;return value;}}).resolveActiveCampaign(basePublication.campaignId);assert(!result.success);equal(count,1);});
  test('106 reader lanza error controlado',async function(){var result=await resolver({activeReferenceReader:function(){throw new Error('reader');}}).resolveActiveCampaign(basePublication.campaignId);equal(result.error.code,'RUNTIME_PUBLICATION_RESOLUTION_ERROR');});
  test('107 resultado error sin Error nativo',async function(){var result=await resolver({activeReferenceReader:function(){throw new Error('reader');}}).resolveActiveCampaign(basePublication.campaignId);assert(Object.getPrototypeOf(result.error)===Object.prototype);});
  test('108 validacion no muta publicacion',async function(){var before=JSON.stringify(basePublication);await api.validateExecutablePublication(basePublication,{publicationCore:core,missionHandlersApi:handlers});equal(JSON.stringify(basePublication),before);});
  test('109 no caches publicas',function(){assert(!Object.prototype.hasOwnProperty.call(api,'cache'));});
  test('110 no stores publicos',function(){assert(!Object.prototype.hasOwnProperty.call(api,'store'));});
  test('111 no register publico',function(){assert(!Object.prototype.hasOwnProperty.call(api,'register'));});
  test('112 Runtime principal no cargado',function(){assert(!Object.prototype.hasOwnProperty.call(window,'CRIOS_RUNTIME_CORE'));});
  test('113 pageerrors cero',function(){equal(window.__CRIOS_A2_006D_TELEMETRY__.pageerrors,[]);});
  test('114 errores consola cero',function(){equal(window.__CRIOS_A2_006D_TELEMETRY__.consoleErrors,[]);});
  test('115 warnings cero',function(){equal(window.__CRIOS_A2_006D_TELEMETRY__.warnings,[]);});
  test('116 validator exige congelacion profunda',function(){var value=clone(baseResult.campaign);Object.freeze(value);assert(!api.isResolvedRuntimeCampaign(value));});
  test('117 validator exige handler requerido',function(){var value=clone(baseResult.campaign);value.requiredHandlers=[];Object.freeze(value);assert(!api.isResolvedRuntimeCampaign(value));});
  test('118 validator rechaza handler requerido duplicado',function(){var value=clone(baseResult.campaign);value.requiredHandlers.push(clone(value.requiredHandlers[0]));value.resolutionMetadata.handlerCount=2;Object.freeze(value);assert(!api.isResolvedRuntimeCampaign(value));});
  test('119 validator exige identidad materializada',function(){var value=clone(baseResult.campaign);value.missions[0].materialization.mission.id='other';Object.freeze(value);assert(!api.isResolvedRuntimeCampaign(value));});
  test('120 validator rechaza missionOrder duplicado',function(){var value=clone(baseResult.campaign);value.missionOrder[1]=value.missionOrder[0];Object.freeze(value);assert(!api.isResolvedRuntimeCampaign(value));});
  test('121 validator rechaza handler requerido no usado',function(){var value=clone(baseResult.campaign);value.requiredHandlers.push({handlerId:'unused.handler',handlerVersion:'1.0.0'});value.resolutionMetadata.handlerCount=2;deepFreeze(value);assert(!api.isResolvedRuntimeCampaign(value));});

  async function run(){
    try{basePublication=await publication();baseReference=reference(basePublication);baseResult=await resolver().resolveActiveCampaign(basePublication.campaignId);}catch(error){window.__CRIOS_A2_006D_TELEMETRY__.pageerrors.push(String(error&&error.stack||error));}
    for(var index=0;index<definitions.length;index+=1){try{await definitions[index].run();results.push({name:definitions[index].name,passed:true,error:null});}catch(error){results.push({name:definitions[index].name,passed:false,error:String(error&&error.message||error)});}}
    var passed=results.filter(function(item){return item.passed;}).length;var telemetry=window.__CRIOS_A2_006D_TELEMETRY__;var output=Object.freeze({status:passed===results.length?'PASS':'FAIL',total:results.length,passed:passed,failed:results.length-passed,tests:Object.freeze(results),durationMs:Math.round((performance.now()-startedAt)*100)/100,pageerrors:Object.freeze(telemetry.pageerrors.slice()),consoleErrors:Object.freeze(telemetry.consoleErrors.slice()),warnings:Object.freeze(telemetry.warnings.slice())});
    window.CRIOS_RUNTIME_EXECUTABLE_PUBLICATION_TEST_RESULTS=output;document.getElementById('results').textContent=JSON.stringify(output,null,2);
  }
  run();
})();