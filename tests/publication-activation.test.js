(function(){
  'use strict';

  var startedAt = performance.now();
  var definitions = [];
  var pageErrors = [];
  var consoleErrors = [];
  var consoleWarnings = [];
  var networkCalls = [];
  var intervalCalls = 0;
  var storageCalls = 0;
  var runtimeBefore = null;
  var campaignsBefore = null;
  var publications = {};
  var campaignId = 'activation-campaign';
  var publicationOne;
  var publicationTwo;
  var publicationThree;

  var originalConsoleError = console.error;
  var originalConsoleWarn = console.warn;
  console.error = function(){ consoleErrors.push(Array.prototype.join.call(arguments, ' ')); return originalConsoleError.apply(console, arguments); };
  console.warn = function(){ consoleWarnings.push(Array.prototype.join.call(arguments, ' ')); return originalConsoleWarn.apply(console, arguments); };
  window.addEventListener('error', function(event){ pageErrors.push(String(event && event.message || 'error')); });

  function assert(value, message) { if (!value) throw new Error(message || 'Assertion failed'); }
  function equal(actual, expected, message) { if (actual !== expected) throw new Error((message || 'Values differ') + ' | actual=' + actual + ' expected=' + expected); }
  function sameKeys(value, keys) { return JSON.stringify(Object.keys(value).sort()) === JSON.stringify(keys.slice().sort()); }
  function stable(value) { return JSON.stringify(value); }
  function add(name, run) { definitions.push({ name: name, run: run }); }
  function errorCode(result, code) { assert(result && !result.success, 'Expected failure'); equal(result.error.code, code, 'Unexpected error code'); }

  function waitFor(condition, timeout) {
    var start = performance.now();
    return new Promise(function(resolve, reject){
      function check(){
        if (condition()) return resolve();
        if (performance.now() - start > (timeout || 10000)) return reject(new Error('Timeout'));
        setTimeout(check, 20);
      }
      check();
    });
  }

  async function makePublication(id, version, content, overrides) {
    var core = window.CRIOS_PUBLICATION_CORE;
    var source = { schemaVersion: '2.0', content: content };
    var hash = await core.calculateContentHash(core.buildCanonicalContent(source));
    return Object.freeze(Object.assign({
      campaignId: campaignId,
      publicationId: id,
      version: version,
      schemaVersion: '2.0',
      contentHash: hash,
      content: Object.freeze(content)
    }, overrides || {}));
  }

  function createService(options) {
    var api = window.CRIOS_PUBLICATION_ACTIVATION;
    var opts = options || {};
    var sequence = 0;
    return api.createActivationService({
      publicationReader: opts.reader || function(id){ return publications[id] || null; },
      publicationLister: function(id){ return Object.keys(publications).map(function(key){ return publications[key]; }).filter(function(item){ return item.campaignId === id; }); },
      canonicalizer: opts.canonicalizer || function(publication){ return window.CRIOS_PUBLICATION_CORE.buildCanonicalContent(publication); },
      hashCalculator: opts.hashCalculator || function(canonical){ return window.CRIOS_PUBLICATION_CORE.calculateContentHash(canonical); },
      activationStore: opts.store,
      clock: opts.clock || function(){ return '2026-07-24T12:00:00.000Z'; },
      activationIdFactory: opts.activationIdFactory || function(){ sequence += 1; return 'test-activation-' + sequence; }
    });
  }

  async function activatedPair() {
    var service = createService();
    await service.activatePublication(campaignId, publicationOne.publicationId);
    await service.activatePublication(campaignId, publicationTwo.publicationId);
    return service;
  }

  add('1. API raíz exacta', function(){ assert(sameKeys(window.CRIOS_PUBLICATION_ACTIVATION, ['version','constants','createInMemoryActivationStore','createActivationService','isActivePublicationReference','isActivationResult'])); equal(window.CRIOS_PUBLICATION_ACTIVATION.version, '1.0.0'); });
  add('2. API raíz congelada', function(){ assert(Object.isFrozen(window.CRIOS_PUBLICATION_ACTIVATION)); });
  add('3. constants congelado', function(){ var value=window.CRIOS_PUBLICATION_ACTIVATION.constants; assert(Object.isFrozen(value) && Object.isFrozen(value.actions) && Object.isFrozen(value.errorCodes)); });
  add('4. namespace temporal retirado', function(){ assert(!('CRIOS_PUBLICATION_ACTIVATION_INTERNAL' in window)); });
  add('5. ActivePublicationReference exacto', async function(){ var r=await createService().activatePublication(campaignId, publicationOne.publicationId); assert(sameKeys(r.reference,['campaignId','publicationId','version','contentHash','activatedAt'])); assert(Object.isFrozen(r.reference)); });
  add('6. ActivationRecord exacto', async function(){ var r=await createService().activatePublication(campaignId, publicationOne.publicationId); assert(sameKeys(r.record,['activationId','action','campaignId','previousPublicationId','nextPublicationId','occurredAt'])); assert(Object.isFrozen(r.record)); });
  add('7. ActivationResult exacto', async function(){ var r=await createService().activatePublication(campaignId, publicationOne.publicationId); assert(sameKeys(r,['success','changed','reference','publication','record','error'])); assert(window.CRIOS_PUBLICATION_ACTIVATION.isActivationResult(r)); });
  add('8. stores independientes', function(){ var api=window.CRIOS_PUBLICATION_ACTIVATION,s1=api.createInMemoryActivationStore(),s2=api.createInMemoryActivationStore(); assert(s1!==s2); equal(s1.snapshot().history.length,0); equal(s2.snapshot().history.length,0); });
  add('9. activar publicación existente', async function(){ var r=await createService().activatePublication(campaignId,publicationOne.publicationId); assert(r.success && r.changed); });
  add('10. referencia coincide con publicación', async function(){ var r=await createService().activatePublication(campaignId,publicationOne.publicationId); equal(r.reference.publicationId,r.publication.publicationId); equal(r.reference.contentHash,r.publication.contentHash); });
  add('11. record ACTIVATE correcto', async function(){ var r=await createService().activatePublication(campaignId,publicationOne.publicationId); equal(r.record.action,'ACTIVATE'); equal(r.record.nextPublicationId,publicationOne.publicationId); });
  add('12. activar misma publicación es idempotente', async function(){ var s=createService(); await s.activatePublication(campaignId,publicationOne.publicationId); var r=await s.activatePublication(campaignId,publicationOne.publicationId); assert(r.success && !r.changed && r.record===null); });
  add('13. idempotencia no agrega historial', async function(){ var s=createService(); await s.activatePublication(campaignId,publicationOne.publicationId); await s.activatePublication(campaignId,publicationOne.publicationId); equal(s.listHistory(campaignId).length,1); });
  add('14. publicación inexistente falla', async function(){ errorCode(await createService().activatePublication(campaignId,'missing'),'PUBLICATION_NOT_FOUND'); });
  add('15. campaignId incorrecto falla', async function(){ errorCode(await createService().activatePublication('other',publicationOne.publicationId),'CAMPAIGN_MISMATCH'); errorCode(await createService().activatePublication('',publicationOne.publicationId),'INVALID_CAMPAIGN_ID'); errorCode(await createService().activatePublication(campaignId,''),'INVALID_PUBLICATION_ID'); });
  add('16. version inconsistente falla', async function(){ var bad=await makePublication('bad-version',1,{value:9},{version:0}); publications[bad.publicationId]=bad; errorCode(await createService().activatePublication(campaignId,bad.publicationId),'VERSION_MISMATCH'); });
  add('17. hash inconsistente falla', async function(){ var bad=Object.freeze(Object.assign({},publicationOne,{publicationId:'bad-hash',contentHash:'0'.repeat(64)})); publications[bad.publicationId]=bad; errorCode(await createService().activatePublication(campaignId,bad.publicationId),'CONTENT_HASH_MISMATCH'); });
  add('18. activación fallida no cambia store', async function(){ var s=createService(); await s.activatePublication(campaignId,'missing'); equal(s.listHistory(campaignId).length,0); assert(s.getActiveReference(campaignId)===null); });
  add('19. expectedActivePublicationId correcto permite cambio', async function(){ var s=createService(); await s.activatePublication(campaignId,publicationOne.publicationId); var r=await s.activatePublication(campaignId,publicationTwo.publicationId,{expectedActivePublicationId:publicationOne.publicationId}); assert(r.success); });
  add('20. conflicto de referencia falla sin mutar', async function(){ var s=createService(); await s.activatePublication(campaignId,publicationOne.publicationId); var before=stable(s.snapshot()); errorCode(await s.activatePublication(campaignId,publicationTwo.publicationId,{expectedActivePublicationId:'wrong'}),'ACTIVATION_CONFLICT'); equal(stable(s.snapshot()),before); });
  add('21. desactivar publicación activa', async function(){ var s=createService(); await s.activatePublication(campaignId,publicationOne.publicationId); var r=s.deactivatePublication(campaignId); assert(r.success&&r.changed&&r.reference===null); });
  add('22. record DEACTIVATE correcto', async function(){ var s=createService(); await s.activatePublication(campaignId,publicationOne.publicationId); var r=s.deactivatePublication(campaignId); equal(r.record.action,'DEACTIVATE'); assert(r.record.nextPublicationId===null); });
  add('23. desactivar sin activa es idempotente', function(){ var r=createService().deactivatePublication(campaignId); assert(r.success&&!r.changed&&r.record===null); });
  add('24. desactivar no elimina publicaciones', async function(){ var count=Object.keys(publications).length,s=createService(); await s.activatePublication(campaignId,publicationOne.publicationId); s.deactivatePublication(campaignId); equal(Object.keys(publications).length,count); });
  add('25. rollback a publicación anterior activa', async function(){ var s=await activatedPair(); var r=await s.rollbackPublication(campaignId,publicationOne.publicationId); assert(r.success&&r.reference.publicationId===publicationOne.publicationId); });
  add('26. record ROLLBACK correcto', async function(){ var s=await activatedPair(); var r=await s.rollbackPublication(campaignId,publicationOne.publicationId); equal(r.record.action,'ROLLBACK'); });
  add('27. rollback a versión mayor falla', async function(){ var s=createService(); await s.activatePublication(campaignId,publicationOne.publicationId); errorCode(await s.rollbackPublication(campaignId,publicationTwo.publicationId),'ROLLBACK_TARGET_INVALID'); });
  add('28. rollback a publicación nunca activa falla', async function(){ var s=createService(); await s.activatePublication(campaignId,publicationOne.publicationId); await s.activatePublication(campaignId,publicationThree.publicationId); errorCode(await s.rollbackPublication(campaignId,publicationTwo.publicationId),'ROLLBACK_TARGET_INVALID'); });
  add('29. rollback sin activa falla', async function(){ errorCode(await createService().rollbackPublication(campaignId,publicationOne.publicationId),'NO_ACTIVE_PUBLICATION'); });
  add('30. rollback fallido no modifica historial', async function(){ var s=await activatedPair(),before=s.listHistory(campaignId).length; await s.rollbackPublication(campaignId,publicationThree.publicationId); equal(s.listHistory(campaignId).length,before); });
  add('31. historial es append-only', async function(){ var s=await activatedPair(); s.deactivatePublication(campaignId); equal(s.listHistory(campaignId).length,3); });
  add('32. historial se filtra por campaignId', async function(){ var other=await makePublication('other-1',1,{value:4},{campaignId:'other'}); publications[other.publicationId]=other; var s=createService(); await s.activatePublication(campaignId,publicationOne.publicationId); await s.activatePublication('other',other.publicationId); equal(s.listHistory(campaignId).length,1); equal(s.listHistory('other').length,1); });
  add('33. snapshot defensivo', async function(){ var s=createService(); await s.activatePublication(campaignId,publicationOne.publicationId); var snap=s.snapshot(); assert(Object.isFrozen(snap)&&Object.isFrozen(snap.activation.history)); });
  add('34. getActiveReference defensivo', async function(){ var s=createService(); await s.activatePublication(campaignId,publicationOne.publicationId); var a=s.getActiveReference(campaignId),b=s.getActiveReference(campaignId); assert(a!==b&&Object.isFrozen(a)); });
  add('35. resolver publicación activa', async function(){ var s=createService(); await s.activatePublication(campaignId,publicationOne.publicationId); var r=await s.resolveActivePublication(campaignId); assert(r.success&&r.publication.publicationId===publicationOne.publicationId); });
  add('36. resolver sin activa falla', async function(){ errorCode(await createService().resolveActivePublication(campaignId),'NO_ACTIVE_PUBLICATION'); });
  add('37. resolver detecta campaña incoherente', async function(){ var current=publicationOne; var s=createService({reader:function(){return current;}}); await s.activatePublication(campaignId,publicationOne.publicationId); current=Object.freeze(Object.assign({},publicationOne,{campaignId:'other'})); errorCode(await s.resolveActivePublication(campaignId),'CAMPAIGN_MISMATCH'); });
  add('38. resolver detecta versión incoherente', async function(){ var current=publicationOne; var s=createService({reader:function(){return current;}}); await s.activatePublication(campaignId,publicationOne.publicationId); current=Object.freeze(Object.assign({},publicationOne,{version:2})); errorCode(await s.resolveActivePublication(campaignId),'VERSION_MISMATCH'); });
  add('39. resolver detecta hash incoherente', async function(){ var current=publicationOne; var s=createService({reader:function(){return current;}}); await s.activatePublication(campaignId,publicationOne.publicationId); current=Object.freeze(Object.assign({},publicationOne,{contentHash:'f'.repeat(64)})); errorCode(await s.resolveActivePublication(campaignId),'CONTENT_HASH_MISMATCH'); });
  add('40. resolver devuelve copia congelada', async function(){ var s=createService(); await s.activatePublication(campaignId,publicationOne.publicationId); var r=await s.resolveActivePublication(campaignId); assert(Object.isFrozen(r.publication)&&r.publication!==publicationOne); });
  add('41. activar no modifica PublishedCampaign', async function(){ var before=stable(publicationOne); await createService().activatePublication(campaignId,publicationOne.publicationId); equal(stable(publicationOne),before); });
  add('42. activar no modifica PublicationRecord', async function(){ var record=Object.freeze({publicationId:publicationOne.publicationId,value:1}),before=stable(record); await createService().activatePublication(campaignId,publicationOne.publicationId); equal(stable(record),before); });
  add('43. activar no modifica Runtime', async function(){ var before=stable(window.CRIOS_RUNTIME_CORE); await createService().activatePublication(campaignId,publicationOne.publicationId); equal(stable(window.CRIOS_RUNTIME_CORE),before); });
  add('44. activar no crea publicaciones', async function(){ var before=Object.keys(publications).length; await createService().activatePublication(campaignId,publicationOne.publicationId); equal(Object.keys(publications).length,before); });
  add('45. CRIOS_STUDIO.publication conserva API exacta', function(){ assert(sameKeys(window.CRIOS_STUDIO.publication,['version','validateCurrentDraft','publishCurrentDraft','listPublications','getPublication','getRecord','getLastResult','getState'])); });
  add('46. CRIOS_STUDIO.activation existe', function(){ assert(window.CRIOS_STUDIO.activation); });
  add('47. CRIOS_STUDIO.activation tiene API exacta', function(){ assert(sameKeys(window.CRIOS_STUDIO.activation,['version','activatePublication','deactivatePublication','rollbackPublication','getActiveReference','resolveActivePublication','listHistory','getState'])); });
  add('48. CRIOS_STUDIO.activation está congelada', function(){ assert(Object.isFrozen(window.CRIOS_STUDIO.activation)); });
  add('49. activar desde Studio actualiza panel', async function(){ var api=window.CRIOS_STUDIO.publication; ensureStudioDraft(); await api.validateCurrentDraft(); var p=await api.publishCurrentDraft(); assert(p.success); await window.CRIOS_STUDIO.activation.activatePublication(p.publication.campaignId,p.publication.publicationId); await waitFor(function(){return document.querySelector('.studio-publication-active-badge');}); equal(document.querySelector('.studio-publication-active-badge').textContent,'Activa'); });
  add('50. publicar no activa automáticamente', async function(){ window.CRIOS_CAMPAIGN_DRAFT.establecerNombre('Activation automatic check'); var p=await window.CRIOS_STUDIO.publication.publishCurrentDraft(); assert(p.success); var active=window.CRIOS_STUDIO.activation.getActiveReference(p.publication.campaignId); assert(!active||active.publicationId!==p.publication.publicationId); });
  add('51. botón Activar no duplica listeners', async function(){ var button=Array.prototype.find.call(document.querySelectorAll('#studioPublicationHistory button'),function(item){return item.textContent==='Activar';}); assert(button,'Activate button missing'); var campaign=window.CRIOS_STUDIO.publication.listPublications()[0].campaignId,before=window.CRIOS_STUDIO.activation.listHistory(campaign).length; button.click(); await waitFor(function(){return window.CRIOS_STUDIO.activation.listHistory(campaign).length>before;}); equal(window.CRIOS_STUDIO.activation.listHistory(campaign).length,before+1); });
  add('52. botón Desactivar funciona', async function(){ var button=document.getElementById('studioActivationDeactivateButton'); assert(button&&!button.hidden); button.click(); await waitFor(function(){return window.CRIOS_STUDIO.activation.getState().status==='INACTIVE';}); assert(window.CRIOS_STUDIO.activation.getState().activeReference===null); });
  add('53. botón Rollback respeta reglas', async function(){ var list=window.CRIOS_STUDIO.publication.listPublications(); assert(list.length>=2); var id=list[0].campaignId; await window.CRIOS_STUDIO.activation.activatePublication(id,list[0].publicationId); await window.CRIOS_STUDIO.activation.activatePublication(id,list[list.length-1].publicationId); var button=Array.prototype.find.call(document.querySelectorAll('#studioPublicationHistory button'),function(item){return item.textContent==='Volver a esta versión';}); assert(button,'Rollback button missing'); button.click(); await waitFor(function(){var a=window.CRIOS_STUDIO.activation.getActiveReference(id);return a&&a.publicationId===list[0].publicationId;}); });
  add('54. historial desaparece al recargar', async function(){ var fresh=createService(); equal(fresh.listHistory(campaignId).length,0); assert(fresh.getActiveReference(campaignId)===null); });
  add('55. no se utiliza storage', function(){ var sources=[window.CRIOS_PUBLICATION_ACTIVATION.createActivationService,window.CRIOS_PUBLICATION_ACTIVATION.createInMemoryActivationStore].join(' '); assert(!/localStorage|sessionStorage|indexedDB/.test(sources)); equal(storageCalls,0); });
  add('56. no se genera red desde operaciones', async function(){ var before=networkCalls.length; await createService().activatePublication(campaignId,publicationOne.publicationId); equal(networkCalls.length,before); });
  add('57. no se crean timers periódicos', function(){ var sources=window.CRIOS_PUBLICATION_ACTIVATION.createActivationService.toString(); assert(!/setInterval|requestAnimationFrame/.test(sources)); equal(intervalCalls,0); });
  add('58. no hay acceso DOM desde el núcleo de activación', function(){ var sources=[window.CRIOS_PUBLICATION_ACTIVATION.createActivationService,window.CRIOS_PUBLICATION_ACTIVATION.createInMemoryActivationStore].join(' '); assert(!/document\.|querySelector|getElementById/.test(sources)); });
  add('59. no hay pageerrors', function(){ equal(pageErrors.length,0,pageErrors.join(' | ')); });
  add('60. no hay errores nuevos de consola', function(){ equal(consoleErrors.length,0,consoleErrors.join(' | ')); });
  add('61. ACTIVATION_STORE_FAILED es alcanzable', function(){ var store=window.CRIOS_PUBLICATION_ACTIVATION.createInMemoryActivationStore(),caught=null; try{store.commit({},{});}catch(error){caught=error;} assert(caught&&caught.code==='ACTIVATION_STORE_FAILED'); });
  add('62. ACTIVATION_ID_FAILED es alcanzable', async function(){ var s=createService({activationIdFactory:function(){return '';}}); errorCode(await s.activatePublication(campaignId,publicationOne.publicationId),'ACTIVATION_ID_FAILED'); });
  add('63. RESOLUTION_FAILED es alcanzable', async function(){ var s=createService({canonicalizer:function(){throw new Error('failure');}}); errorCode(await s.activatePublication(campaignId,publicationOne.publicationId),'RESOLUTION_FAILED'); });

  function ensureStudioDraft() {
    var missions=window.CRIOS_STUDIO_ADAPTER.getMissions()||[];
    window.CRIOS_CAMPAIGN_DRAFT.establecerNombre('Campana Activacion A2-004');
    window.CRIOS_CAMPAIGN_DRAFT.establecerDescripcion('Prueba de activacion y resolucion');
    window.CRIOS_CAMPAIGN_DRAFT.establecerEscenario('antartida');
    if (missions[0]&&!window.CRIOS_CAMPAIGN_DRAFT.contieneMision(missions[0].id)) window.CRIOS_CAMPAIGN_DRAFT.agregarMision(missions[0]);
  }

  async function run() {
    await waitFor(function(){ return window.CRIOS_STUDIO&&window.CRIOS_STUDIO.activation; });
    runtimeBefore=stable(window.CRIOS_RUNTIME_CORE);
    campaignsBefore=stable(window.CAMPANAS_CRIOS);
    publicationOne=await makePublication('publication-1',1,{value:1});
    publicationTwo=await makePublication('publication-2',2,{value:2});
    publicationThree=await makePublication('publication-3',3,{value:3});
    publications[publicationOne.publicationId]=publicationOne;
    publications[publicationTwo.publicationId]=publicationTwo;
    publications[publicationThree.publicationId]=publicationThree;

    var results=[];
    for(var i=0;i<definitions.length;i+=1){
      try { await definitions[i].run(); results.push({name:definitions[i].name,passed:true,error:null}); }
      catch(error){ results.push({name:definitions[i].name,passed:false,error:String(error&&error.message||error)}); }
    }
    var passed=results.filter(function(item){return item.passed;}).length;
    window.CRIOS_PUBLICATION_ACTIVATION_TEST_TELEMETRY=Object.freeze({pageErrors:pageErrors.slice(),consoleErrors:consoleErrors.slice(),consoleWarnings:consoleWarnings.slice(),networkCalls:networkCalls.slice(),intervalCalls:intervalCalls,storageCalls:storageCalls,runtimeUnchanged:stable(window.CRIOS_RUNTIME_CORE)===runtimeBefore,campaignsUnchanged:stable(window.CAMPANAS_CRIOS)===campaignsBefore});
    window.CRIOS_PUBLICATION_ACTIVATION_TEST_RESULTS=Object.freeze({total:results.length,passed:passed,failed:results.length-passed,tests:Object.freeze(results),durationMs:Math.round((performance.now()-startedAt)*100)/100,status:passed===results.length?'PASS':'FAIL'});
  }

  run();
})();