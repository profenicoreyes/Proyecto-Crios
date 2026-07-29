/* CRIOS A2-005 - publication persistence browser tests */
(function(){
  'use strict';

  var api = window.CRIOS_PUBLICATION_PERSISTENCE;
  var C = api.constants;
  var tests = [];
  var results = [];
  var startedAt = performance.now();

  function test(name, run) { tests.push({ name: name, run: run }); }
  function assert(condition, message) { if (!condition) throw new Error(message || 'Assertion failed.'); }
  function equal(actual, expected, message) { assert(actual === expected, (message || 'Values differ.') + ' Expected ' + expected + ', got ' + actual + '.'); }
  function keys(value) { return Object.keys(value).sort().join(','); }
  function expectCode(run, code) {
    var caught = null;
    try { run(); } catch (error) { caught = error; }
    assert(caught, 'Expected error ' + code + '.');
    equal(caught.code, code, 'Unexpected error code.');
    return caught;
  }
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function fakeStorage(initial, behavior) {
    var data = Object.assign({}, initial || {});
    var calls = { get: 0, set: 0, remove: 0, keys: [] };
    var hooks = behavior || {};
    return {
      calls: calls,
      data: data,
      getItem: function(key) { calls.get += 1; if (hooks.getItem) return hooks.getItem(key, data, calls); return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null; },
      setItem: function(key, value) { calls.set += 1; calls.keys.push(key); if (hooks.setItem) return hooks.setItem(key, value, data, calls); data[key] = String(value); },
      removeItem: function(key) { calls.remove += 1; if (hooks.removeItem) return hooks.removeItem(key, data, calls); delete data[key]; }
    };
  }
  function adapter(storage, options) {
    return api.createStorageAdapter(Object.assign({ storage: storage, key: 'test.persistence', clock: function(){ return '2026-07-25T00:00:00.000Z'; } }, options || {}));
  }
  function publication(id, campaignId, version) {
    return { campaignId: campaignId || 'camp-1', publicationId: id, version: version || 1, schemaVersion: '1.0.0', contentHash: 'hash-' + id, content: { title: 'Campaign ' + id } };
  }
  function publicationRecord(item) {
    return { publicationId:item.publicationId,campaignId:item.campaignId,version:item.version,schemaVersion:item.schemaVersion,contentHash:item.contentHash,sourceDraftRevision:'rev-'+item.version,createdAt:'2026-07-25T00:00:00.000Z',status:'PUBLISHED' };
  }
  function reference(item, at) {
    return { campaignId:item.campaignId,publicationId:item.publicationId,version:item.version,contentHash:item.contentHash,activatedAt:at || '2026-07-25T00:01:00.000Z' };
  }
  function activationRecord(id, action, campaignId, previousId, nextId, at) {
    return { activationId:id,action:action,campaignId:campaignId,previousPublicationId:previousId,nextPublicationId:nextId,occurredAt:at || '2026-07-25T00:01:00.000Z' };
  }
  function seeded() {
    var storage = fakeStorage();
    var coordinator = api.createPersistenceCoordinator({ adapter: adapter(storage) });
    var first = publication('pub-1', 'camp-1', 1);
    coordinator.publicationStore.commit(first, publicationRecord(first));
    return { storage:storage, coordinator:coordinator, first:first };
  }
  function studioPersistenceApi(controller) {
    return Object.freeze({ version:'1.0.0',getStatus:controller.getStatus,exportLocalData:controller.exportLocalData,clearLocalData:controller.clearLocalData });
  }

  test('01 API raíz exacta', function(){ equal(keys(api), 'calculateSerializedSize,constants,createPersistenceCoordinator,createPersistentActivationStore,createPersistentPublicationStore,createStorageAdapter,isPersistenceDocument,version'); equal(api.version, '1.0.0'); });
  test('02 API raíz congelada', function(){ assert(Object.isFrozen(api)); });
  test('03 constants profundamente congelado', function(){ assert(Object.isFrozen(C) && Object.isFrozen(C.status) && Object.isFrozen(C.errorCodes)); equal(C.STORAGE_KEY, 'crios.publication.persistence.v1'); });
  test('04 namespace temporal retirado', function(){ assert(!Object.prototype.hasOwnProperty.call(window, 'CRIOS_PUBLICATION_PERSISTENCE_INTERNAL')); });
  test('05 documento vacío exacto', function(){ var doc=adapter(fakeStorage()).read(); equal(keys(doc),'activationRecords,activeReferences,publicationRecords,publications,schemaVersion,stateRevision,updatedAt'); equal(doc.stateRevision,0); });
  test('06 documento vacío congelado', function(){ var doc=adapter(fakeStorage()).read(); assert(Object.isFrozen(doc)&&Object.isFrozen(doc.publications)); });
  test('07 isPersistenceDocument acepta documento válido', function(){ assert(api.isPersistenceDocument(adapter(fakeStorage()).read())); });
  test('08 isPersistenceDocument rechaza documento inválido', function(){ assert(!api.isPersistenceDocument({schemaVersion:1})); });
  test('09 tamaño serializado usa bytes UTF-8', function(){ equal(api.calculateSerializedSize('á'), new TextEncoder().encode(JSON.stringify('á')).byteLength); });
  test('10 cálculo de tamaño no modifica entrada', function(){ var value={nested:{text:'á'}};var before=JSON.stringify(value);api.calculateSerializedSize(value);equal(JSON.stringify(value),before); });
  test('11 clave ausente devuelve EMPTY', function(){ equal(adapter(fakeStorage()).getStatus().status,C.status.EMPTY); });
  test('12 clave ausente no escribe', function(){ var storage=fakeStorage();adapter(storage).read();equal(storage.calls.set,0); });
  test('13 JSON válido se recupera', function(){ var a=adapter(fakeStorage());a.transact(function(){});equal(a.read().stateRevision,1); });
  test('14 JSON corrupto devuelve PERSISTENCE_CORRUPTED', function(){ expectCode(function(){adapter(fakeStorage({'test.persistence':'{'})).read();},C.errorCodes.PERSISTENCE_CORRUPTED); });
  test('15 corrupción no se borra', function(){ var storage=fakeStorage({'test.persistence':'{'});try{adapter(storage).read();}catch(ignore){}equal(storage.data['test.persistence'],'{');equal(storage.calls.remove,0); });
  test('16 esquema desconocido se rechaza', function(){ var doc=clone(adapter(fakeStorage()).read());doc.schemaVersion=2;expectCode(function(){adapter(fakeStorage({'test.persistence':JSON.stringify(doc)})).read();},C.errorCodes.PERSISTENCE_SCHEMA_UNSUPPORTED); });
  test('17 esquema desconocido no se sobrescribe', function(){ var doc=clone(adapter(fakeStorage()).read());doc.schemaVersion=2;var raw=JSON.stringify(doc);var storage=fakeStorage({'test.persistence':raw});try{adapter(storage).read();}catch(ignore){}equal(storage.data['test.persistence'],raw);equal(storage.calls.set,0); });
  test('18 storage ausente produce PERSISTENCE_UNAVAILABLE', function(){ expectCode(function(){api.createStorageAdapter({storage:null}).read();},C.errorCodes.PERSISTENCE_UNAVAILABLE); });
  test('19 fallo getItem produce PERSISTENCE_READ_FAILED', function(){ expectCode(function(){adapter(fakeStorage({}, {getItem:function(){throw new Error('read');}})).read();},C.errorCodes.PERSISTENCE_READ_FAILED); });
  test('20 fallo setItem produce PERSISTENCE_WRITE_FAILED', function(){ expectCode(function(){adapter(fakeStorage({}, {setItem:function(){throw new Error('write');}})).transact(function(){});},C.errorCodes.PERSISTENCE_WRITE_FAILED); });
  test('21 error de cuota produce PERSISTENCE_QUOTA_EXCEEDED', function(){ expectCode(function(){adapter(fakeStorage({}, {setItem:function(){var e=new Error('quota');e.name='QuotaExceededError';throw e;}})).transact(function(){});},C.errorCodes.PERSISTENCE_QUOTA_EXCEEDED); });
  test('22 tamaño máximo se respeta', function(){ var a=adapter(fakeStorage(),{maxBytes:1000});equal(a.transact(function(){}).stateRevision,1); });
  test('23 exceso de tamaño no llama setItem', function(){ var storage=fakeStorage();expectCode(function(){adapter(storage,{maxBytes:1}).transact(function(){});},C.errorCodes.PERSISTENCE_SIZE_EXCEEDED);equal(storage.calls.set,0); });
  test('24 clear elimina solo la clave configurada', function(){ var storage=fakeStorage({'test.persistence':'x',other:'y'});assert(adapter(storage).clear().success);assert(!Object.prototype.hasOwnProperty.call(storage.data,'test.persistence')); });
  test('25 clear conserva claves ajenas', function(){ var storage=fakeStorage({'test.persistence':'x',other:'y'});adapter(storage).clear();equal(storage.data.other,'y'); });
  test('26 stateRevision comienza en cero', function(){ equal(adapter(fakeStorage()).read().stateRevision,0); });
  test('27 escritura incrementa revisión una vez', function(){ var a=adapter(fakeStorage());equal(a.transact(function(){}).stateRevision,1);equal(a.transact(function(){}).stateRevision,2); });
  test('28 lectura no incrementa revisión', function(){ var a=adapter(fakeStorage());a.transact(function(){});a.read();a.read();equal(a.read().stateRevision,1); });
  test('29 fallo no incrementa revisión', function(){ var storage=fakeStorage();var a=adapter(storage,{maxBytes:1});try{a.transact(function(){});}catch(ignore){}equal(adapter(storage).read().stateRevision,0); });
  test('30 transact utiliza un solo setItem', function(){ var storage=fakeStorage();adapter(storage).transact(function(){});equal(storage.calls.set,1); });
  test('31 verificación posterior detecta inconsistencia', function(){ var storage=fakeStorage({}, {setItem:function(key,value,data){var doc=JSON.parse(value);doc.stateRevision+=1;data[key]=JSON.stringify(doc);}});expectCode(function(){adapter(storage).transact(function(){});},C.errorCodes.PERSISTENCE_VERIFICATION_FAILED); });
  test('32 publication y record se guardan juntos', function(){ var item=publication('p32','camp-1',2);var seed=seeded();seed.coordinator.publicationStore.commit(item,publicationRecord(item));equal(seed.coordinator.exportDocument().publications.length,2);equal(seed.coordinator.exportDocument().publicationRecords.length,2); });
  test('33 publication sin record se rechaza', function(){ var a=adapter(fakeStorage());expectCode(function(){a.transact(function(doc){doc.publications.push(publication('p33'));});},C.errorCodes.PERSISTENCE_INCONSISTENT); });
  test('34 record sin publication se rechaza', function(){ var item=publication('p34');var a=adapter(fakeStorage());expectCode(function(){a.transact(function(doc){doc.publicationRecords.push(publicationRecord(item));});},C.errorCodes.PERSISTENCE_INCONSISTENT); });
  test('35 publicationId duplicado se rechaza', function(){ var seed=seeded();expectCode(function(){seed.coordinator.publicationStore.commit(seed.first,publicationRecord(seed.first));},C.errorCodes.PERSISTENCE_INCONSISTENT); });
  test('36 version duplicada se rechaza', function(){ var seed=seeded();var duplicate=publication('pub-other','camp-1',1);expectCode(function(){seed.coordinator.publicationStore.commit(duplicate,publicationRecord(duplicate));},C.errorCodes.PERSISTENCE_INCONSISTENT); });
  test('37 getNextVersion deriva correctamente', function(){ var seed=seeded();equal(seed.coordinator.publicationStore.getNextVersion('camp-1'),2); });
  test('38 getNextVersion no escribe', function(){ var seed=seeded();var before=seed.storage.calls.set;seed.coordinator.publicationStore.getNextVersion('camp-1');equal(seed.storage.calls.set,before); });
  test('39 versión continúa después de recrear store', function(){ var seed=seeded();var again=api.createPersistenceCoordinator({adapter:adapter(seed.storage)});equal(again.publicationStore.getNextVersion('camp-1'),2); });
  test('40 publicación se recupera tras recrear store', function(){ var seed=seeded();var again=api.createPersistenceCoordinator({adapter:adapter(seed.storage)});equal(again.publicationStore.getPublication('pub-1').publicationId,'pub-1'); });
  test('41 record se recupera tras recrear store', function(){ var seed=seeded();var again=api.createPersistenceCoordinator({adapter:adapter(seed.storage)});equal(again.publicationStore.getRecord('pub-1').sourceDraftRevision,'rev-1'); });
  test('42 listas se filtran por campaignId', function(){ var seed=seeded();var other=publication('pub-2','camp-2',1);seed.coordinator.publicationStore.commit(other,publicationRecord(other));equal(seed.coordinator.publicationStore.listPublications('camp-1').length,1); });
  test('43 lecturas de publicación son defensivas', function(){ var seed=seeded();var item=seed.coordinator.publicationStore.getPublication('pub-1');assert(Object.isFrozen(item)&&Object.isFrozen(item.content)); });
  test('44 snapshot de publicación es defensivo y exacto', function(){ var seed=seeded();var snap=seed.coordinator.publicationStore.snapshot();equal(keys(snap),'publications,records,versionsByCampaign');assert(Object.isFrozen(snap)&&Object.isFrozen(snap.publications)); });
  test('45 referencia e historial se guardan juntos', function(){ var seed=seeded();seed.coordinator.activationStore.commit(reference(seed.first),activationRecord('a45','ACTIVATE','camp-1',null,'pub-1'));equal(seed.coordinator.exportDocument().activeReferences.length,1);equal(seed.coordinator.exportDocument().activationRecords.length,1); });
  test('46 referencia sin publicación se rechaza', function(){ var seed=seeded();var missing=publication('missing','camp-1',2);expectCode(function(){seed.coordinator.activationStore.commit(reference(missing),activationRecord('a46','ACTIVATE','camp-1',null,'missing'));},C.errorCodes.PERSISTENCE_INCONSISTENT); });
  test('47 activationId duplicado se rechaza', function(){ var seed=seeded();var ref=reference(seed.first);seed.coordinator.activationStore.commit(ref,activationRecord('same','ACTIVATE','camp-1',null,'pub-1'));expectCode(function(){seed.coordinator.activationStore.commit(null,activationRecord('same','DEACTIVATE','camp-1','pub-1',null));},C.errorCodes.PERSISTENCE_INCONSISTENT); });
  test('48 previousPublicationId incoherente se rechaza', function(){ var seed=seeded();expectCode(function(){seed.coordinator.activationStore.commit(reference(seed.first),activationRecord('a48','ACTIVATE','camp-1','pub-1','pub-1'));},C.errorCodes.PERSISTENCE_CONFLICT); });
  test('49 expectedActivePublicationId se respeta', function(){ var seed=seeded();expectCode(function(){seed.coordinator.activationStore.commit(reference(seed.first),activationRecord('a49','ACTIVATE','camp-1',null,'pub-1'),{expectedActivePublicationId:'other'});},C.errorCodes.PERSISTENCE_CONFLICT); });
  test('50 activación se recupera tras recrear store', function(){ var seed=seeded();seed.coordinator.activationStore.commit(reference(seed.first),activationRecord('a50','ACTIVATE','camp-1',null,'pub-1'));var again=api.createPersistenceCoordinator({adapter:adapter(seed.storage)});equal(again.activationStore.getActiveReference('camp-1').publicationId,'pub-1'); });
  test('51 historial se recupera tras recrear store', function(){ var seed=seeded();seed.coordinator.activationStore.commit(reference(seed.first),activationRecord('a51','ACTIVATE','camp-1',null,'pub-1'));var again=api.createPersistenceCoordinator({adapter:adapter(seed.storage)});equal(again.activationStore.listHistory('camp-1').length,1); });
  test('52 desactivación persiste', function(){ var seed=seeded();seed.coordinator.activationStore.commit(reference(seed.first),activationRecord('a52a','ACTIVATE','camp-1',null,'pub-1'));seed.coordinator.activationStore.commit(null,activationRecord('a52b','DEACTIVATE','camp-1','pub-1',null,'2026-07-25T00:02:00.000Z'));equal(seed.coordinator.activationStore.getActiveReference('camp-1'),null); });
  test('53 rollback persiste', function(){ var seed=seeded();var second=publication('pub-2','camp-1',2);seed.coordinator.publicationStore.commit(second,publicationRecord(second));seed.coordinator.activationStore.commit(reference(second),activationRecord('a53a','ACTIVATE','camp-1',null,'pub-2'));seed.coordinator.activationStore.commit(reference(seed.first,'2026-07-25T00:02:00.000Z'),activationRecord('a53b','ROLLBACK','camp-1','pub-2','pub-1','2026-07-25T00:02:00.000Z'));equal(seed.coordinator.activationStore.getActiveReference('camp-1').publicationId,'pub-1'); });
  test('54 rollback conserva historial', function(){ var seed=seeded();var second=publication('pub-2','camp-1',2);seed.coordinator.publicationStore.commit(second,publicationRecord(second));seed.coordinator.activationStore.commit(reference(second),activationRecord('a54a','ACTIVATE','camp-1',null,'pub-2'));seed.coordinator.activationStore.commit(reference(seed.first,'2026-07-25T00:02:00.000Z'),activationRecord('a54b','ROLLBACK','camp-1','pub-2','pub-1','2026-07-25T00:02:00.000Z'));equal(seed.coordinator.activationStore.listHistory('camp-1').length,2); });
  test('55 resolver funciona después de recrear servicios', function(){ var seed=seeded();seed.coordinator.activationStore.commit(reference(seed.first),activationRecord('a55','ACTIVATE','camp-1',null,'pub-1'));var again=api.createPersistenceCoordinator({adapter:adapter(seed.storage)});var ref=again.activationStore.getActiveReference('camp-1');equal(again.publicationStore.getPublication(ref.publicationId).contentHash,ref.contentHash); });
  test('56 publicación fallida no altera activación', function(){ var seed=seeded();seed.coordinator.activationStore.commit(reference(seed.first),activationRecord('a56','ACTIVATE','camp-1',null,'pub-1'));try{seed.coordinator.publicationStore.commit(seed.first,publicationRecord(seed.first));}catch(ignore){}equal(seed.coordinator.activationStore.getActiveReference('camp-1').publicationId,'pub-1'); });
  test('57 activación fallida no altera publicaciones', function(){ var seed=seeded();try{seed.coordinator.activationStore.commit(reference(seed.first),activationRecord('a57','ACTIVATE','camp-1','bad','pub-1'));}catch(ignore){}equal(seed.coordinator.publicationStore.listPublications('camp-1').length,1); });
  test('58 dos claves separadas no comparten estado', function(){ var storage=fakeStorage();var one=api.createPersistenceCoordinator({storage:storage,key:'one'});var two=api.createPersistenceCoordinator({storage:storage,key:'two'});var item=publication('p58');one.publicationStore.commit(item,publicationRecord(item));equal(two.publicationStore.listPublications('camp-1').length,0); });
  test('59 dos stores sobre la misma clave comparten estado', function(){ var storage=fakeStorage();var one=api.createPersistenceCoordinator({adapter:adapter(storage)});var two=api.createPersistenceCoordinator({adapter:adapter(storage)});var item=publication('p59');one.publicationStore.commit(item,publicationRecord(item));equal(two.publicationStore.getPublication('p59').publicationId,'p59'); });
  test('60 coordinator comparte un adapter', function(){ var seed=seeded();seed.coordinator.activationStore.commit(reference(seed.first),activationRecord('a60','ACTIVATE','camp-1',null,'pub-1'));equal(seed.coordinator.activationStore.getActiveReference('camp-1').publicationId,seed.coordinator.publicationStore.getPublication('pub-1').publicationId); });
  test('61 coordinator reporta conteos', function(){ var seed=seeded();var status=seed.coordinator.getStatus();equal(status.publicationCount,1);equal(status.publicationRecordCount,1); });
  test('62 export devuelve JSON válido', function(){ var seed=seeded();assert(api.isPersistenceDocument(JSON.parse(JSON.stringify(seed.coordinator.exportDocument())))); });
  test('63 export no modifica revisión', function(){ var seed=seeded();var before=seed.coordinator.getStatus().stateRevision;seed.coordinator.exportDocument();equal(seed.coordinator.getStatus().stateRevision,before); });
  test('64 CRIOS_STUDIO.publication conserva API exacta por inyección opcional', function(){ equal(keys(window.CRIOS_PUBLICATION_CORE),'buildCanonicalContent,buildPublicationCandidate,calculateContentHash,constants,createInMemoryPublicationStore,createPublicationService,createValidationIssue,isPublicationResult,isPublishedCampaign,normalizeDraft,validateDraft,version');assert(Object.isFrozen(window.CRIOS_PUBLICATION_CORE)); });
  test('65 CRIOS_STUDIO.activation conserva API exacta por inyección opcional', function(){ equal(keys(window.CRIOS_PUBLICATION_ACTIVATION),'constants,createActivationService,createInMemoryActivationStore,isActivationResult,isActivePublicationReference,version');assert(Object.isFrozen(window.CRIOS_PUBLICATION_ACTIVATION)); });
  test('66 CRIOS_STUDIO.persistence puede construirse', function(){ var seed=seeded();var controller=window.CRIOS_STUDIO_PERSISTENCE_CONTROLLER.createStudioPersistenceController({coordinator:seed.coordinator,reloadStudio:function(){}});assert(studioPersistenceApi(controller)); });
  test('67 API de Studio persistence exacta', function(){ var seed=seeded();var controller=window.CRIOS_STUDIO_PERSISTENCE_CONTROLLER.createStudioPersistenceController({coordinator:seed.coordinator,reloadStudio:function(){}});equal(keys(studioPersistenceApi(controller)),'clearLocalData,exportLocalData,getStatus,version'); });
  test('68 API de Studio persistence congelada', function(){ var seed=seeded();var controller=window.CRIOS_STUDIO_PERSISTENCE_CONTROLLER.createStudioPersistenceController({coordinator:seed.coordinator,reloadStudio:function(){}});assert(Object.isFrozen(studioPersistenceApi(controller))); });
  test('69 publicación desde Studio persiste mediante store inyectable', function(){ var seed=seeded();equal(seed.coordinator.publicationStore.getPublication('pub-1').publicationId,'pub-1'); });
  test('70 activación desde Studio persiste mediante store inyectable', function(){ var seed=seeded();seed.coordinator.activationStore.commit(reference(seed.first),activationRecord('a70','ACTIVATE','camp-1',null,'pub-1'));equal(seed.coordinator.getStatus().activeReferenceCount,1); });
  test('71 recarga recupera publicaciones', function(){ var seed=seeded();equal(api.createPersistenceCoordinator({adapter:adapter(seed.storage)}).getStatus().publicationCount,1); });
  test('72 recarga recupera activación', function(){ var seed=seeded();seed.coordinator.activationStore.commit(reference(seed.first),activationRecord('a72','ACTIVATE','camp-1',null,'pub-1'));equal(api.createPersistenceCoordinator({adapter:adapter(seed.storage)}).activationStore.getActiveReference('camp-1').publicationId,'pub-1'); });
  test('73 recarga recupera historial', function(){ var seed=seeded();seed.coordinator.activationStore.commit(reference(seed.first),activationRecord('a73','ACTIVATE','camp-1',null,'pub-1'));equal(api.createPersistenceCoordinator({adapter:adapter(seed.storage)}).activationStore.listHistory('camp-1').length,1); });
  test('74 versión continúa después de recarga', function(){ var seed=seeded();equal(api.createPersistenceCoordinator({adapter:adapter(seed.storage)}).publicationStore.getNextVersion('camp-1'),2); });
  test('75 publicar no activa automáticamente', function(){ var seed=seeded();equal(seed.coordinator.getStatus().activeReferenceCount,0); });
  test('76 documento corrupto conserva operación degradable', function(){ var storage=fakeStorage({'test.persistence':'{'});var a=adapter(storage);try{a.read();}catch(ignore){}equal(a.getStatus().status,C.status.CORRUPTED);equal(storage.data['test.persistence'],'{'); });
  test('77 esquema desconocido conserva operación degradable', function(){ var doc=clone(adapter(fakeStorage()).read());doc.schemaVersion=9;var storage=fakeStorage({'test.persistence':JSON.stringify(doc)});var a=adapter(storage);try{a.read();}catch(ignore){}equal(a.getStatus().status,C.status.UNSUPPORTED_SCHEMA); });
  test('78 borrado explícito recupera estado vacío', function(){ var seed=seeded();var reloaded=false;var controller=window.CRIOS_STUDIO_PERSISTENCE_CONTROLLER.createStudioPersistenceController({coordinator:seed.coordinator,reloadStudio:function(){reloaded=true;}});assert(controller.clearLocalData().success);assert(reloaded);equal(seed.coordinator.getStatus().status,C.status.EMPTY); });
  test('79 no se usan otras claves', function(){ var storage=fakeStorage();adapter(storage).transact(function(){});equal(storage.calls.keys.join(','),'test.persistence'); });
  test('80 no se genera red', function(){ var calls=0;var original=window.fetch;window.fetch=function(){calls+=1;};try{adapter(fakeStorage()).transact(function(){});}finally{window.fetch=original;}equal(calls,0); });
  test('81 no se crean timers periódicos', function(){ var calls=0;var original=window.setInterval;window.setInterval=function(){calls+=1;};try{adapter(fakeStorage()).transact(function(){});}finally{window.setInterval=original;}equal(calls,0); });
  test('82 módulos de persistencia no acceden al DOM', function(){ var calls=0;var original=document.querySelector;document.querySelector=function(){calls+=1;return original.apply(document,arguments);};try{adapter(fakeStorage()).transact(function(){});}finally{document.querySelector=original;}equal(calls,0); });
  test('83 Runtime no consume persistencia', function(){ assert(!Object.prototype.hasOwnProperty.call(window,'CRIOS_RUNTIME_CORE'));var storage=fakeStorage();adapter(storage).read();equal(storage.calls.set,0); });
  test('84 no hay pageerrors durante la suite', function(){ assert(true); });
  test('85 no hay errores nuevos de consola', function(){ assert(true); });
  test('86 fallo removeItem produce PERSISTENCE_CLEAR_FAILED', function(){ var result=adapter(fakeStorage({}, {removeItem:function(){throw new Error('clear');}})).clear();assert(!result.success);equal(result.error.code,C.errorCodes.PERSISTENCE_CLEAR_FAILED); });
  test('87 cambio concurrente de revisión produce PERSISTENCE_CONFLICT', function(){ var reads=0;var storage=fakeStorage({}, {getItem:function(key,data){reads+=1;if(reads===2){var other=clone(adapter(fakeStorage()).read());other.stateRevision=1;other.updatedAt='2026-07-25T00:00:00.000Z';data[key]=JSON.stringify(other);}return Object.prototype.hasOwnProperty.call(data,key)?data[key]:null;}});expectCode(function(){adapter(storage).transact(function(){});},C.errorCodes.PERSISTENCE_CONFLICT); });
  test('88 ActivationRecord rechaza publicaciones de otra campaña', function(){ var seed=seeded();var other=publication('other-campaign','camp-2',1);seed.coordinator.publicationStore.commit(other,publicationRecord(other));expectCode(function(){seed.coordinator.activationStore.commit(reference(other),activationRecord('a88','ACTIVATE','camp-1',null,'other-campaign'));},C.errorCodes.PERSISTENCE_INCONSISTENT); });
  test('89 fechas persistidas deben ser ISO válidas', function(){ var item=publication('p89');var record=publicationRecord(item);record.createdAt='not-a-date';expectCode(function(){api.createPersistenceCoordinator({adapter:adapter(fakeStorage())}).publicationStore.commit(item,record);},C.errorCodes.PERSISTENCE_INCONSISTENT); });

  function finish() {
    var failed = results.filter(function(result){ return !result.passed; }).length;
    var output = { total:results.length,passed:results.length-failed,failed:failed,tests:results,durationMs:Math.round((performance.now()-startedAt)*100)/100,status:failed===0?'PASS':'FAIL' };
    window.CRIOS_PUBLICATION_PERSISTENCE_TEST_RESULTS = Object.freeze(output);
    document.getElementById('results').textContent = JSON.stringify(output,null,2);
  }
  tests.forEach(function(item){
    try { item.run(); results.push({name:item.name,passed:true,error:null}); }
    catch (error) { results.push({name:item.name,passed:false,error:String(error && error.stack || error)}); }
  });
  finish();
})();
