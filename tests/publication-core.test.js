(function(){
  'use strict';

  var startedAt = performance.now();
  var tests = [];
  var observedErrorCodes = Object.create(null);
  var telemetry = {
    consoleErrors: [],
    consoleWarnings: [],
    pageErrors: [],
    unhandledRejections: []
  };

  var originalConsoleError = console.error;
  var originalConsoleWarn = console.warn;

  console.error = function() {
    telemetry.consoleErrors.push(Array.prototype.slice.call(arguments).map(function(item){ return String(item); }).join(' '));
    return originalConsoleError.apply(console, arguments);
  };

  console.warn = function() {
    telemetry.consoleWarnings.push(Array.prototype.slice.call(arguments).map(function(item){ return String(item); }).join(' '));
    return originalConsoleWarn.apply(console, arguments);
  };

  window.addEventListener('error', function(event){
    telemetry.pageErrors.push(String(event && event.message || 'error'));
  });

  window.addEventListener('unhandledrejection', function(event){
    telemetry.unhandledRejections.push(String(event && event.reason || 'unhandledrejection'));
  });

  function addTest(name, run) {
    tests.push({ name: name, run: run });
  }

  function assert(condition, message) {
    if (!condition) throw new Error(message || 'Assertion failed');
  }

  function assertEqual(actual, expected, message) {
    if (actual !== expected) {
      throw new Error((message || 'Expected equality') + ' | actual=' + actual + ' expected=' + expected);
    }
  }

  function assertKeysExact(value, expectedKeys, message) {
    var actual = Object.keys(value).sort();
    var expected = expectedKeys.slice().sort();
    assert(deepEqual(actual, expected), (message || 'Key set mismatch') + ' | actual=' + actual.join(',') + ' expected=' + expected.join(','));
  }

  function markCode(code) {
    if (typeof code === 'string' && code.trim() !== '') {
      observedErrorCodes[code] = true;
    }
  }

  function deepEqual(a, b) {
    return JSON.stringify(a) === JSON.stringify(b);
  }

  function createBaseDraft() {
    return {
      campaignId: 'reactivacion-base-antartica',
      draftRevision: 'rev-001',
      nombre: 'Campana Base',
      descripcion: 'Descripcion',
      escenario: 'antartida',
      estado: 'draft',
      version: 1,
      misiones: [
        { id: 'energy', titulo: 'Centro de Energia', numero: '01' },
        { id: 'greenhouse', titulo: 'Invernadero', numero: '02' }
      ]
    };
  }

  function createDeterministicService(custom) {
    var ids = ['pub-001', 'pub-002', 'pub-003', 'pub-004', 'pub-005'];
    var index = 0;
    var options = custom || {};
    return window.CRIOS_PUBLICATION_CORE.createPublicationService({
      store: options.store,
      clock: options.clock || function(){ return '2026-01-01T00:00:00.000Z'; },
      publicationIdFactory: options.publicationIdFactory || function(){
        var value = ids[index] || ('pub-' + String(index + 1).padStart(3, '0'));
        index += 1;
        return value;
      },
      digest: options.digest,
      schemaVersion: options.schemaVersion || '2.0',
      readDraftRevision: options.readDraftRevision
    });
  }

  addTest('1. API pública exacta y congelada', function(){
    var api = window.CRIOS_PUBLICATION_CORE;
    var keys = Object.keys(api).sort();
    var expected = [
      'buildCanonicalContent',
      'buildPublicationCandidate',
      'calculateContentHash',
      'constants',
      'createInMemoryPublicationStore',
      'createPublicationService',
      'createValidationIssue',
      'isPublicationResult',
      'isPublishedCampaign',
      'normalizeDraft',
      'validateDraft',
      'version'
    ].sort();
    assert(Object.isFrozen(api), 'API should be frozen');
    assert(deepEqual(keys, expected), 'API keys mismatch');
    assertEqual(api.version, '1.0.0', 'Version mismatch');
  });

  addTest('2. normalizeDraft no modifica el original', function(){
    var draft = createBaseDraft();
    var before = JSON.stringify(draft);
    var normalized = window.CRIOS_PUBLICATION_CORE.normalizeDraft(draft, {});
    var after = JSON.stringify(draft);
    assertEqual(before, after, 'Draft should remain unchanged');
    assert(normalized !== draft, 'normalizeDraft must return a new object');
  });

  addTest('3. normalizeDraft elimina estado transitorio', function(){
    var draft = createBaseDraft();
    draft.progress = { energy: true };
    draft.session = { status: 'running' };
    draft.currentScreen = 'map';
    var normalized = window.CRIOS_PUBLICATION_CORE.normalizeDraft(draft, {});
    assert(!('progress' in normalized.content), 'progress should be removed');
    assert(!('session' in normalized.content), 'session should be removed');
    assert(!('currentScreen' in normalized.content), 'currentScreen should be removed');
  });

  addTest('4. normalizeDraft conserva orden de misiones', function(){
    var draft = createBaseDraft();
    draft.misiones = [
      { id: 'hangar' },
      { id: 'energy' },
      { id: 'greenhouse' }
    ];
    var normalized = window.CRIOS_PUBLICATION_CORE.normalizeDraft(draft, {});
    var ids = normalized.content.misiones.map(function(m){ return m.id; }).join(',');
    assertEqual(ids, 'hangar,energy,greenhouse', 'Mission order must be preserved');
  });

  addTest('5. valores no serializables son rechazados', function(){
    var draft = createBaseDraft();
    draft.bad = function(){};
    var validation = window.CRIOS_PUBLICATION_CORE.validateDraft(draft, {});
    assert(validation.valid === false, 'Validation should fail');
    assert(validation.errors.length > 0, 'Validation should report errors');
  });

  addTest('6. campaignId ausente produce CAMPAIGN_ID_MISSING', function(){
    var draft = {
      draftRevision: 'rev-x',
      nombre: 'X',
      escenario: 'antartida',
      misiones: [{ id: 'energy' }]
    };
    var validation = window.CRIOS_PUBLICATION_CORE.validateDraft(draft, {});
    var hasCode = validation.issues.some(function(i){ return i.code === 'CAMPAIGN_ID_MISSING'; });
    assert(hasCode, 'Expected CAMPAIGN_ID_MISSING issue');
  });

  addTest('7. draftRevision ausente bloquea publicación', async function(){
    var draft = {
      campaignId: 'reactivacion-base-antartica',
      nombre: 'Sin revision',
      escenario: 'antartida',
      misiones: [{ id: 'energy' }]
    };
    var service = createDeterministicService();
    var result = await service.publishCampaign(draft, {});
    assert(result.success === false, 'Publish should fail without draftRevision');
  });

  addTest('8. IDs duplicados producen DUPLICATE_ID', function(){
    var draft = createBaseDraft();
    draft.misiones = [{ id: 'energy' }, { id: 'energy' }];
    var validation = window.CRIOS_PUBLICATION_CORE.validateDraft(draft, {});
    var hasCode = validation.issues.some(function(i){ return i.code === 'DUPLICATE_ID'; });
    assert(hasCode, 'Expected DUPLICATE_ID issue');
  });

  addTest('9. referencia inexistente produce MISSING_REFERENCE', function(){
    var backup = window.REGISTRO_MISIONES;
    window.REGISTRO_MISIONES = { obtener: function(){ return null; } };
    try {
      var draft = createBaseDraft();
      var validation = window.CRIOS_PUBLICATION_CORE.validateDraft(draft, {});
      var hasCode = validation.issues.some(function(i){ return i.code === 'MISSING_REFERENCE'; });
      assert(hasCode, 'Expected MISSING_REFERENCE issue');
    } finally {
      if (backup === undefined) {
        try { delete window.REGISTRO_MISIONES; } catch (ignore) {}
      } else {
        window.REGISTRO_MISIONES = backup;
      }
    }
  });

  addTest('10. propiedades en distinto orden producen el mismo canonical content', function(){
    var a = {
      campaignId: 'c1',
      draftRevision: 'r1',
      schemaVersion: '2.0',
      content: { z: 1, a: { b: 2, a: 1 }, misiones: [{ id: 'energy' }] }
    };
    var b = {
      schemaVersion: '2.0',
      draftRevision: 'r1',
      campaignId: 'c1',
      content: { a: { a: 1, b: 2 }, misiones: [{ id: 'energy' }], z: 1 }
    };
    var c1 = window.CRIOS_PUBLICATION_CORE.buildCanonicalContent(a);
    var c2 = window.CRIOS_PUBLICATION_CORE.buildCanonicalContent(b);
    assertEqual(c1, c2, 'Canonical content should match');
  });

  addTest('11. arrays en distinto orden producen canonical content diferente', function(){
    var a = {
      campaignId: 'c1',
      draftRevision: 'r1',
      schemaVersion: '2.0',
      content: { misiones: [{ id: 'energy' }, { id: 'greenhouse' }] }
    };
    var b = {
      campaignId: 'c1',
      draftRevision: 'r1',
      schemaVersion: '2.0',
      content: { misiones: [{ id: 'greenhouse' }, { id: 'energy' }] }
    };
    var c1 = window.CRIOS_PUBLICATION_CORE.buildCanonicalContent(a);
    var c2 = window.CRIOS_PUBLICATION_CORE.buildCanonicalContent(b);
    assert(c1 !== c2, 'Canonical content should differ for array order changes');
  });

  addTest('12. contenido idéntico produce el mismo SHA-256', async function(){
    var content = '{"a":1}';
    var h1 = await window.CRIOS_PUBLICATION_CORE.calculateContentHash(content);
    var h2 = await window.CRIOS_PUBLICATION_CORE.calculateContentHash(content);
    assertEqual(h1, h2, 'Hash should match for same content');
  });

  addTest('13. contenido diferente produce SHA-256 diferente', async function(){
    var h1 = await window.CRIOS_PUBLICATION_CORE.calculateContentHash('{"a":1}');
    var h2 = await window.CRIOS_PUBLICATION_CORE.calculateContentHash('{"a":2}');
    assert(h1 !== h2, 'Hash should differ for different content');
  });

  addTest('14. hash tiene 64 caracteres hexadecimales', async function(){
    var h = await window.CRIOS_PUBLICATION_CORE.calculateContentHash('{"x":1}');
    assert(/^[0-9a-f]{64}$/.test(h), 'Hash format should be 64 lowercase hex chars');
  });

  addTest('15. publicación exitosa crea publication y record coherentes', async function(){
    var service = createDeterministicService();
    var draft = createBaseDraft();
    var result = await service.publishCampaign(draft, { expectedDraftRevision: 'rev-001' });
    assert(result.success === true, 'Publish should succeed');
    assert(result.publication.publicationId === result.record.publicationId, 'publicationId mismatch');
    assert(result.publication.version === result.record.version, 'version mismatch');
    assert(result.publication.contentHash === result.record.contentHash, 'contentHash mismatch');
  });

  addTest('16. objetos publicados quedan profundamente congelados', async function(){
    var service = createDeterministicService();
    var draft = createBaseDraft();
    var result = await service.publishCampaign(draft, { expectedDraftRevision: 'rev-001' });
    assert(Object.isFrozen(result.publication), 'Publication must be frozen');
    assert(Object.isFrozen(result.record), 'Record must be frozen');
    assert(Object.isFrozen(result.publication.content), 'Publication content must be frozen');
  });

  addTest('17. modificar el draft después de publicar no altera la publicación', async function(){
    var service = createDeterministicService();
    var draft = createBaseDraft();
    var result = await service.publishCampaign(draft, { expectedDraftRevision: 'rev-001' });
    draft.nombre = 'Cambiado';
    draft.misiones[0].id = 'hack';
    assert(result.publication.content.nombre === 'Campana Base', 'Publication content must be immutable copy');
    assert(result.publication.content.misiones[0].id === 'energy', 'Publication mission id must remain original');
  });

  addTest('18. modificar una lectura del store no altera el store', async function(){
    var store = window.CRIOS_PUBLICATION_CORE.createInMemoryPublicationStore();
    var service = createDeterministicService({ store: store });
    var result = await service.publishCampaign(createBaseDraft(), { expectedDraftRevision: 'rev-001' });
    var read = service.getPublication(result.publication.publicationId);
    var failedMutation = false;
    try {
      read.content.nombre = 'Mutado';
    } catch (error) {
      failedMutation = true;
    }
    var read2 = service.getPublication(result.publication.publicationId);
    assert(failedMutation || read2.content.nombre === 'Campana Base', 'Store must be defensive');
  });

  addTest('19. dos publicaciones iguales tienen distinto publicationId', async function(){
    var service = createDeterministicService();
    var d1 = createBaseDraft();
    var d2 = createBaseDraft();
    d2.draftRevision = 'rev-002';
    var r1 = await service.publishCampaign(d1, { expectedDraftRevision: 'rev-001' });
    var r2 = await service.publishCampaign(d2, { expectedDraftRevision: 'rev-002' });
    assert(r1.publication.publicationId !== r2.publication.publicationId, 'publicationId must differ');
  });

  addTest('20. dos publicaciones iguales tienen versiones consecutivas', async function(){
    var service = createDeterministicService();
    var d1 = createBaseDraft();
    var d2 = createBaseDraft();
    d2.draftRevision = 'rev-002';
    var r1 = await service.publishCampaign(d1, { expectedDraftRevision: 'rev-001' });
    var r2 = await service.publishCampaign(d2, { expectedDraftRevision: 'rev-002' });
    assertEqual(r1.publication.version, 1, 'First version must be 1');
    assertEqual(r2.publication.version, 2, 'Second version must be 2');
  });

  addTest('21. dos publicaciones iguales conservan el mismo contentHash', async function(){
    var service = createDeterministicService();
    var d1 = createBaseDraft();
    var d2 = createBaseDraft();
    d2.draftRevision = 'rev-002';
    var r1 = await service.publishCampaign(d1, { expectedDraftRevision: 'rev-001' });
    var r2 = await service.publishCampaign(d2, { expectedDraftRevision: 'rev-002' });
    assertEqual(r1.publication.contentHash, r2.publication.contentHash, 'Equal content should keep same contentHash');
  });

  addTest('22. validación fallida no modifica el store', async function(){
    var store = window.CRIOS_PUBLICATION_CORE.createInMemoryPublicationStore();
    var service = createDeterministicService({ store: store });
    var bad = createBaseDraft();
    bad.misiones = [];
    var result = await service.publishCampaign(bad, { expectedDraftRevision: 'rev-001' });
    var snap = service.snapshot();
    assert(result.success === false, 'Result should fail');
    assertEqual(snap.publications.length, 0, 'No publication should be stored');
    assertEqual(snap.records.length, 0, 'No record should be stored');
  });

  addTest('23. conflicto inicial de revisión no modifica el store', async function(){
    var store = window.CRIOS_PUBLICATION_CORE.createInMemoryPublicationStore();
    var service = createDeterministicService({ store: store });
    var draft = createBaseDraft();
    var result = await service.publishCampaign(draft, { expectedDraftRevision: 'rev-XXX' });
    var snap = service.snapshot();
    assert(result.success === false, 'Conflict should fail');
    assertEqual(result.error.code, 'DRAFT_REVISION_CONFLICT', 'Expected DRAFT_REVISION_CONFLICT');
    assertEqual(snap.publications.length, 0, 'Store must remain unchanged');
  });

  addTest('24. conflicto posterior al hash no modifica el store', async function(){
    var store = window.CRIOS_PUBLICATION_CORE.createInMemoryPublicationStore();
    var digest = async function(bytes){
      draft.version = 2;
      return crypto.subtle.digest('SHA-256', bytes);
    };
    var draft = createBaseDraft();
    var service = createDeterministicService({ store: store, digest: digest, readDraftRevision: function(d){ return String(d.version); } });
    draft.version = 1;
    var result = await service.publishCampaign(draft, { expectedDraftRevision: '1' });
    var snap = service.snapshot();
    assert(result.success === false, 'Late conflict should fail');
    assertEqual(result.error.code, 'DRAFT_REVISION_CONFLICT', 'Expected DRAFT_REVISION_CONFLICT');
    assertEqual(snap.publications.length, 0, 'Store must remain unchanged');
  });

  addTest('25. fallo antes de commit no modifica el store', async function(){
    var store = window.CRIOS_PUBLICATION_CORE.createInMemoryPublicationStore();
    var digest = async function(){ throw new Error('digest fail'); };
    var service = createDeterministicService({ store: store, digest: digest });
    var result = await service.publishCampaign(createBaseDraft(), { expectedDraftRevision: 'rev-001' });
    var snap = service.snapshot();
    assert(result.success === false, 'Publish should fail');
    assertEqual(snap.publications.length, 0, 'Store must remain unchanged on hash failure');
  });

  addTest('26. publicationId duplicado no deja estado parcial', async function(){
    var store = window.CRIOS_PUBLICATION_CORE.createInMemoryPublicationStore();
    var service = createDeterministicService({
      store: store,
      publicationIdFactory: function(){ return 'pub-fixed'; }
    });
    var d1 = createBaseDraft();
    var d2 = createBaseDraft();
    d2.draftRevision = 'rev-002';
    var r1 = await service.publishCampaign(d1, { expectedDraftRevision: 'rev-001' });
    var before = service.snapshot();
    var r2 = await service.publishCampaign(d2, { expectedDraftRevision: 'rev-002' });
    var after = service.snapshot();
    assert(r1.success === true, 'First publish should succeed');
    assert(r2.success === false, 'Second publish should fail on duplicate publicationId');
    assertEqual(before.publications.length, after.publications.length, 'No partial insertion allowed');
    assertEqual(before.records.length, after.records.length, 'No partial insertion allowed');
  });

  addTest('27. versión duplicada no deja estado parcial', async function(){
    var realStore = window.CRIOS_PUBLICATION_CORE.createInMemoryPublicationStore();
    var customStore = {
      commit: realStore.commit,
      getPublication: realStore.getPublication,
      getRecord: realStore.getRecord,
      listPublications: realStore.listPublications,
      listRecords: realStore.listRecords,
      getNextVersion: function(){ return 1; },
      snapshot: realStore.snapshot
    };

    var service = createDeterministicService({ store: customStore });
    var d1 = createBaseDraft();
    var d2 = createBaseDraft();
    d2.draftRevision = 'rev-002';

    var r1 = await service.publishCampaign(d1, { expectedDraftRevision: 'rev-001' });
    var before = service.snapshot();
    var r2 = await service.publishCampaign(d2, { expectedDraftRevision: 'rev-002' });
    var after = service.snapshot();

    assert(r1.success === true, 'First publish should succeed');
    assert(r2.success === false, 'Second publish should fail on duplicate version');
    assertEqual(before.publications.length, after.publications.length, 'No partial insertion allowed');
    assertEqual(before.records.length, after.records.length, 'No partial insertion allowed');
  });

  addTest('28. record y publication siempre se incorporan juntos', async function(){
    var service = createDeterministicService();
    var ok = await service.publishCampaign(createBaseDraft(), { expectedDraftRevision: 'rev-001' });
    assert(ok.success === true, 'Publish should succeed');
    var snap = service.snapshot();
    assertEqual(snap.publications.length, snap.records.length, 'Counts must match');
  });

  addTest('29. Runtime compatibility contiene todos los campos demostrados', function(){
    var validation = window.CRIOS_PUBLICATION_CORE.validateDraft(createBaseDraft(), {});
    var level = validation.levels.runtimeCompatibility;
    assert(level.valid === true, 'Runtime compatibility level should be valid');
  });

  addTest('30. ningún módulo usa storage, red o timers', function(){
    var api = window.CRIOS_PUBLICATION_CORE;
    var bundle = [
      api.normalizeDraft.toString(),
      api.validateDraft.toString(),
      api.buildPublicationCandidate.toString(),
      api.buildCanonicalContent.toString(),
      api.calculateContentHash.toString(),
      api.createInMemoryPublicationStore.toString(),
      api.createPublicationService.toString()
    ].join('\n');

    var forbidden = [
      'localStorage',
      'sessionStorage',
      'indexedDB',
      'fetch(',
      'XMLHttpRequest',
      'WebSocket',
      'sendBeacon',
      'setTimeout',
      'setInterval',
      'requestAnimationFrame'
    ];

    for (var i = 0; i < forbidden.length; i += 1) {
      assert(bundle.indexOf(forbidden[i]) === -1, 'Forbidden token detected: ' + forbidden[i]);
    }
  });

  addTest('31. constants está profundamente congelado', function(){
    var constants = window.CRIOS_PUBLICATION_CORE.constants;
    assert(Object.isFrozen(constants), 'constants should be frozen');
    assert(Object.isFrozen(constants.severity), 'constants.severity should be frozen');
    assert(Object.isFrozen(constants.recordStatus), 'constants.recordStatus should be frozen');
    assert(Object.isFrozen(constants.errorCodes), 'constants.errorCodes should be frozen');
  });

  addTest('32. único global nuevo y sin namespace interno público', function(){
    var forbiddenGlobals = [
      'CRIOS_PUBLICATION_INTERNAL',
      'CRIOS_PUBLICATION_MODEL',
      'CRIOS_PUBLICATION_NORMALIZER',
      'CRIOS_PUBLICATION_VALIDATOR',
      'CRIOS_PUBLICATION_CANONICALIZER',
      'CRIOS_PUBLICATION_HASH',
      'CRIOS_PUBLICATION_STORE',
      'CRIOS_PUBLICATION_SERVICE'
    ];

    for (var i = 0; i < forbiddenGlobals.length; i += 1) {
      var key = forbiddenGlobals[i];
      assert(!(key in window), 'Unexpected global detected: ' + key);
    }

    assert('CRIOS_PUBLICATION_CORE' in window, 'CRIOS_PUBLICATION_CORE must exist');
    assert(!Object.prototype.hasOwnProperty.call(window.CRIOS_PUBLICATION_CORE, '__internals'), 'Public API must not expose __internals');
  });

  addTest('33. shape exacta de ValidationIssue', function(){
    var issue = window.CRIOS_PUBLICATION_CORE.createValidationIssue({
      code: 'INVALID_DRAFT',
      severity: 'ERROR',
      level: 'structural',
      path: '$.x',
      message: 'x',
      metadata: { a: 1 }
    });

    assertKeysExact(issue, ['code', 'severity', 'level', 'path', 'message', 'metadata'], 'ValidationIssue shape mismatch');
    assert(Object.isFrozen(issue), 'ValidationIssue should be frozen');
  });

  addTest('34. shape exacta de PublishedCampaign, PublicationRecord y PublicationResult', async function(){
    var service = createDeterministicService();
    var result = await service.publishCampaign(createBaseDraft(), { expectedDraftRevision: 'rev-001' });
    assert(result.success === true, 'Publish should succeed');

    assertKeysExact(result.publication, ['campaignId', 'publicationId', 'version', 'schemaVersion', 'contentHash', 'content'], 'PublishedCampaign shape mismatch');
    assertKeysExact(result.record, ['publicationId', 'campaignId', 'version', 'schemaVersion', 'contentHash', 'sourceDraftRevision', 'createdAt', 'status'], 'PublicationRecord shape mismatch');
    assertKeysExact(result, ['success', 'publication', 'record', 'validation', 'error'], 'PublicationResult shape mismatch');
  });

  addTest('35. draftRevision distinta no altera canonical content', function(){
    var c1 = window.CRIOS_PUBLICATION_CORE.buildCanonicalContent({
      campaignId: 'c1',
      draftRevision: 'r1',
      schemaVersion: '2.0',
      content: { nombre: 'N', escenario: 'antartida', misiones: [{ id: 'm1' }] }
    });
    var c2 = window.CRIOS_PUBLICATION_CORE.buildCanonicalContent({
      campaignId: 'c1',
      draftRevision: 'r2',
      schemaVersion: '2.0',
      content: { nombre: 'N', escenario: 'antartida', misiones: [{ id: 'm1' }] }
    });
    assertEqual(c1, c2, 'draftRevision should not affect canonical content');
  });

  addTest('36. metadata operativa distinta no altera canonical content', function(){
    var base = {
      campaignId: 'c1',
      draftRevision: 'r1',
      schemaVersion: '2.0',
      publicationId: 'pub-001',
      version: 10,
      createdAt: '2026-01-01T00:00:00.000Z',
      content: {
        nombre: 'N',
        escenario: 'antartida',
        misiones: [{ id: 'm1' }]
      }
    };
    var variant = {
      campaignId: 'c1',
      draftRevision: 'r2',
      schemaVersion: '2.0',
      publicationId: 'pub-999',
      version: 99,
      createdAt: '2030-01-01T00:00:00.000Z',
      content: {
        nombre: 'N',
        escenario: 'antartida',
        misiones: [{ id: 'm1' }]
      }
    };

    var c1 = window.CRIOS_PUBLICATION_CORE.buildCanonicalContent(base);
    var c2 = window.CRIOS_PUBLICATION_CORE.buildCanonicalContent(variant);
    assertEqual(c1, c2, 'Operational metadata should not affect canonical content');
  });

  addTest('37. igual contenido y distinta draftRevision mantienen mismo hash', async function(){
    var d1 = createBaseDraft();
    var d2 = createBaseDraft();
    d2.draftRevision = 'rev-XYZ';
    var n1 = window.CRIOS_PUBLICATION_CORE.normalizeDraft(d1, {});
    var n2 = window.CRIOS_PUBLICATION_CORE.normalizeDraft(d2, {});
    var c1 = window.CRIOS_PUBLICATION_CORE.buildCanonicalContent(n1);
    var c2 = window.CRIOS_PUBLICATION_CORE.buildCanonicalContent(n2);
    var h1 = await window.CRIOS_PUBLICATION_CORE.calculateContentHash(c1);
    var h2 = await window.CRIOS_PUBLICATION_CORE.calculateContentHash(c2);
    assertEqual(h1, h2, 'draftRevision must not affect content hash');
  });

  addTest('38. dos stores no comparten estado', async function(){
    var storeA = window.CRIOS_PUBLICATION_CORE.createInMemoryPublicationStore();
    var storeB = window.CRIOS_PUBLICATION_CORE.createInMemoryPublicationStore();
    var serviceA = createDeterministicService({ store: storeA });
    var serviceB = createDeterministicService({ store: storeB });

    var rA = await serviceA.publishCampaign(createBaseDraft(), { expectedDraftRevision: 'rev-001' });
    assert(rA.success === true, 'Publish in storeA should succeed');

    var snapA = serviceA.snapshot();
    var snapB = serviceB.snapshot();
    assertEqual(snapA.publications.length, 1, 'storeA should contain one publication');
    assertEqual(snapB.publications.length, 0, 'storeB should stay empty');
  });

  addTest('39. getNextVersion no consume versión', function(){
    var store = window.CRIOS_PUBLICATION_CORE.createInMemoryPublicationStore();
    var v1 = store.getNextVersion('camp-1');
    var v2 = store.getNextVersion('camp-1');
    assertEqual(v1, 1, 'First next version should be 1');
    assertEqual(v2, 1, 'Second next version should still be 1 before commit');
  });

  addTest('40. snapshot y lecturas son defensivos y no exponen mapas', async function(){
    var service = createDeterministicService();
    var ok = await service.publishCampaign(createBaseDraft(), { expectedDraftRevision: 'rev-001' });
    assert(ok.success === true, 'Publish should succeed');

    var snap = service.snapshot();
    assert(!(snap.publications instanceof Map), 'publications must not expose Map');
    assert(!(snap.records instanceof Map), 'records must not expose Map');
    assert(!(snap.versionsByCampaign instanceof Map), 'versionsByCampaign must not expose Map');

    var changed = false;
    try {
      snap.publications.push({});
    } catch (error) {
      changed = true;
    }
    assert(changed || snap.publications.length === 1, 'Snapshot must be immutable defensively');
  });

  addTest('41. INVALID_DRAFT es alcanzable', function(){
    var validation = window.CRIOS_PUBLICATION_CORE.validateDraft(null, {});
    var found = validation.issues.some(function(i){ return i.code === 'INVALID_DRAFT'; });
    assert(found, 'INVALID_DRAFT should be reachable');
    markCode('INVALID_DRAFT');
  });

  addTest('42. VALIDATION_FAILED es alcanzable', async function(){
    var service = createDeterministicService();
    var bad = createBaseDraft();
    bad.misiones = [];
    var result = await service.publishCampaign(bad, { expectedDraftRevision: 'rev-001' });
    assert(result.success === false, 'Publish should fail');
    assertEqual(result.error.code, 'VALIDATION_FAILED', 'Expected VALIDATION_FAILED');
    markCode('VALIDATION_FAILED');
  });

  addTest('43. DRAFT_REVISION_CONFLICT es alcanzable', async function(){
    var service = createDeterministicService();
    var result = await service.publishCampaign(createBaseDraft(), { expectedDraftRevision: 'rev-bad' });
    assert(result.success === false, 'Publish should fail');
    assertEqual(result.error.code, 'DRAFT_REVISION_CONFLICT', 'Expected DRAFT_REVISION_CONFLICT');
    markCode('DRAFT_REVISION_CONFLICT');
  });

  addTest('44. RUNTIME_INCOMPATIBLE y SCHEMA_VERSION_UNSUPPORTED son alcanzables', function(){
    var badRuntime = createBaseDraft();
    badRuntime.escenario = '';
    var runtimeValidation = window.CRIOS_PUBLICATION_CORE.validateDraft(badRuntime, {});
    var hasRuntime = runtimeValidation.issues.some(function(i){ return i.code === 'RUNTIME_INCOMPATIBLE'; });
    assert(hasRuntime, 'Expected RUNTIME_INCOMPATIBLE');
    markCode('RUNTIME_INCOMPATIBLE');

    var badSchema = window.CRIOS_PUBLICATION_CORE.validateDraft(createBaseDraft(), { schemaVersion: '9.9' });
    var hasSchema = badSchema.issues.some(function(i){ return i.code === 'SCHEMA_VERSION_UNSUPPORTED'; });
    assert(hasSchema, 'Expected SCHEMA_VERSION_UNSUPPORTED');
    markCode('SCHEMA_VERSION_UNSUPPORTED');
  });

  addTest('45. SERIALIZATION_FAILED y CANONICALIZATION_FAILED son alcanzables', function(){
    var serializationFailed = false;
    try {
      window.CRIOS_PUBLICATION_CORE.normalizeDraft({ campaignId: 'c1', draftRevision: 'r1', misiones: [], x: function(){} }, {});
    } catch (errorS) {
      serializationFailed = errorS && errorS.code === 'SERIALIZATION_FAILED';
    }
    assert(serializationFailed, 'Expected SERIALIZATION_FAILED');
    markCode('SERIALIZATION_FAILED');

    var canonicalFailed = false;
    try {
      window.CRIOS_PUBLICATION_CORE.buildCanonicalContent({
        campaignId: 'c1',
        draftRevision: 'r1',
        schemaVersion: '2.0',
        content: { x: function(){} }
      });
    } catch (errorC) {
      canonicalFailed = errorC && errorC.code === 'CANONICALIZATION_FAILED';
    }
    assert(canonicalFailed, 'Expected CANONICALIZATION_FAILED');
    markCode('CANONICALIZATION_FAILED');
  });

  addTest('46. HASH_FAILED es alcanzable', async function(){
    var failed = false;
    try {
      await window.CRIOS_PUBLICATION_CORE.calculateContentHash('ok', {
        digest: async function(){ throw new Error('digest failed'); }
      });
    } catch (error) {
      failed = error && error.code === 'HASH_FAILED';
    }
    assert(failed, 'Expected HASH_FAILED');
    markCode('HASH_FAILED');
  });

  addTest('47. PUBLICATION_PERSISTENCE_FAILED y RECORD_PERSISTENCE_FAILED son alcanzables', async function(){
    var service = createDeterministicService({ publicationIdFactory: function(){ return ''; } });
    var result = await service.publishCampaign(createBaseDraft(), { expectedDraftRevision: 'rev-001' });
    assert(result.success === false, 'Publish should fail');
    assertEqual(result.error.code, 'PUBLICATION_PERSISTENCE_FAILED', 'Expected PUBLICATION_PERSISTENCE_FAILED');
    markCode('PUBLICATION_PERSISTENCE_FAILED');

    var store = window.CRIOS_PUBLICATION_CORE.createInMemoryPublicationStore();
    var threw = false;
    try {
      store.commit(
        {
          campaignId: 'c1',
          publicationId: 'pub-001',
          version: 1,
          schemaVersion: '2.0',
          contentHash: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
          content: { nombre: 'n', escenario: 'antartida', misiones: [{ id: 'm1' }] }
        },
        {
          publicationId: 'pub-XXX',
          campaignId: 'c1',
          version: 1,
          schemaVersion: '2.0',
          contentHash: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
          sourceDraftRevision: 'r1',
          createdAt: '2026-01-01T00:00:00.000Z',
          status: 'PUBLISHED'
        }
      );
    } catch (errorR) {
      threw = errorR && errorR.code === 'RECORD_PERSISTENCE_FAILED';
    }
    assert(threw, 'Expected RECORD_PERSISTENCE_FAILED');
    markCode('RECORD_PERSISTENCE_FAILED');
  });

  addTest('48. CAMPAIGN_ID_MISSING, DUPLICATE_ID y MISSING_REFERENCE quedan marcados', function(){
    var a = window.CRIOS_PUBLICATION_CORE.validateDraft({ draftRevision: 'r1', escenario: 'antartida', misiones: [{ id: 'm1' }] }, {});
    assert(a.issues.some(function(i){ return i.code === 'CAMPAIGN_ID_MISSING'; }), 'Expected CAMPAIGN_ID_MISSING');
    markCode('CAMPAIGN_ID_MISSING');

    var b = window.CRIOS_PUBLICATION_CORE.validateDraft({ campaignId: 'c1', draftRevision: 'r1', escenario: 'antartida', misiones: [{ id: 'm1' }, { id: 'm1' }] }, {});
    assert(b.issues.some(function(i){ return i.code === 'DUPLICATE_ID'; }), 'Expected DUPLICATE_ID');
    markCode('DUPLICATE_ID');

    var backup = window.REGISTRO_MISIONES;
    window.REGISTRO_MISIONES = { obtener: function(){ return null; } };
    try {
      var c = window.CRIOS_PUBLICATION_CORE.validateDraft({ campaignId: 'c1', draftRevision: 'r1', escenario: 'antartida', misiones: [{ id: 'm1' }] }, {});
      assert(c.issues.some(function(i){ return i.code === 'MISSING_REFERENCE'; }), 'Expected MISSING_REFERENCE');
      markCode('MISSING_REFERENCE');
    } finally {
      if (backup === undefined) {
        try { delete window.REGISTRO_MISIONES; } catch (ignore) {}
      } else {
        window.REGISTRO_MISIONES = backup;
      }
    }
  });

  addTest('49. núcleo no usa DOM ni dispara red/storage/timers en ejecución', async function(){
    var oldFetch = window.fetch;
    var oldXHR = window.XMLHttpRequest;
    var oldWS = window.WebSocket;
    var oldSetTimeout = window.setTimeout;
    var oldSetInterval = window.setInterval;
    var oldRaf = window.requestAnimationFrame;

    var calls = {
      fetch: 0,
      xhr: 0,
      ws: 0,
      timeout: 0,
      interval: 0,
      raf: 0
    };

    window.fetch = function(){ calls.fetch += 1; return Promise.reject(new Error('blocked fetch')); };
    window.XMLHttpRequest = function(){ calls.xhr += 1; throw new Error('blocked xhr'); };
    window.WebSocket = function(){ calls.ws += 1; throw new Error('blocked ws'); };
    window.setTimeout = function(){ calls.timeout += 1; return 0; };
    window.setInterval = function(){ calls.interval += 1; return 0; };
    window.requestAnimationFrame = function(){ calls.raf += 1; return 0; };

    try {
      var service = createDeterministicService();
      var result = await service.publishCampaign(createBaseDraft(), { expectedDraftRevision: 'rev-001' });
      assert(result.success === true, 'Publish should succeed while blocked globals are patched');

      assertEqual(calls.fetch, 0, 'fetch should not be called');
      assertEqual(calls.xhr, 0, 'XMLHttpRequest should not be called');
      assertEqual(calls.ws, 0, 'WebSocket should not be called');
      assertEqual(calls.timeout, 0, 'setTimeout should not be called');
      assertEqual(calls.interval, 0, 'setInterval should not be called');
      assertEqual(calls.raf, 0, 'requestAnimationFrame should not be called');

      var bundle = [
        window.CRIOS_PUBLICATION_CORE.normalizeDraft.toString(),
        window.CRIOS_PUBLICATION_CORE.validateDraft.toString(),
        window.CRIOS_PUBLICATION_CORE.buildCanonicalContent.toString(),
        window.CRIOS_PUBLICATION_CORE.createPublicationService.toString()
      ].join('\n');

      var domTokens = ['document', 'querySelector', 'getElementById', 'addEventListener'];
      for (var i = 0; i < domTokens.length; i += 1) {
        assert(bundle.indexOf(domTokens[i]) === -1, 'DOM token detected: ' + domTokens[i]);
      }
    } finally {
      window.fetch = oldFetch;
      window.XMLHttpRequest = oldXHR;
      window.WebSocket = oldWS;
      window.setTimeout = oldSetTimeout;
      window.setInterval = oldSetInterval;
      window.requestAnimationFrame = oldRaf;
    }
  });

  addTest('50. todos los códigos alcanzables tienen prueba y reservados explícitos', function(){
    var expectedReachable = [
      'INVALID_DRAFT',
      'VALIDATION_FAILED',
      'DRAFT_REVISION_CONFLICT',
      'CAMPAIGN_ID_MISSING',
      'DUPLICATE_ID',
      'MISSING_REFERENCE',
      'RUNTIME_INCOMPATIBLE',
      'SERIALIZATION_FAILED',
      'CANONICALIZATION_FAILED',
      'HASH_FAILED',
      'PUBLICATION_PERSISTENCE_FAILED',
      'RECORD_PERSISTENCE_FAILED',
      'SCHEMA_VERSION_UNSUPPORTED'
    ];

    for (var i = 0; i < expectedReachable.length; i += 1) {
      var code = expectedReachable[i];
      assert(observedErrorCodes[code] === true, 'Missing evidence for error code: ' + code);
    }

    var reserved = [];
    assert(Array.isArray(reserved), 'Reserved codes list must be explicit');
    assertEqual(reserved.length, 0, 'Reserved codes should be explicit and empty for this implementation');
  });

  async function runAllTests() {
    var results = [];
    for (var i = 0; i < tests.length; i += 1) {
      var test = tests[i];
      var passed = false;
      var errorMessage = '';
      try {
        var maybePromise = test.run();
        if (maybePromise && typeof maybePromise.then === 'function') {
          await maybePromise;
        }
        passed = true;
      } catch (error) {
        passed = false;
        errorMessage = String(error && error.message || error);
      }
      results.push({ name: test.name, passed: passed, error: errorMessage });
    }

    var passedCount = results.filter(function(item){ return item.passed; }).length;
    var failedCount = results.length - passedCount;
    var durationMs = Math.round(performance.now() - startedAt);

    var finalResult = {
      total: results.length,
      passed: passedCount,
      failed: failedCount,
      tests: results,
      durationMs: durationMs,
      status: failedCount === 0 ? 'PASS' : 'FAIL'
    };

    window.CRIOS_PUBLICATION_TEST_RESULTS = finalResult;
    window.CRIOS_PUBLICATION_TEST_TELEMETRY = telemetry;

    if (failedCount > 0) {
      for (var j = 0; j < results.length; j += 1) {
        if (!results[j].passed) {
          console.error('[CRIOS Publication Test Failed]', results[j].name, results[j].error);
        }
      }
    }
  }

  runAllTests();
})();
