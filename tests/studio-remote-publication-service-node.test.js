'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const repo = path.resolve(process.argv[2] || process.cwd());
global.window = global;

function load(relative) {
  const filename = path.join(repo, relative);
  vm.runInThisContext(fs.readFileSync(filename, 'utf8'), { filename });
}

[
  'js/publication/publication-model.js',
  'js/publication/publication-normalizer.js',
  'js/publication/publication-validator.js',
  'js/publication/publication-canonicalizer.js',
  'js/publication/publication-hash.js',
  'js/publication/publication-memory-store.js',
  'js/publication/publication-service.js',
  'js/publication/publication-api.js',
  'js/studio/publication/studio-remote-publication-service.js'
].forEach(load);

let total = 0;
let failed = 0;

function check(condition, message) {
  total += 1;
  if (!condition) {
    failed += 1;
    console.error('FAIL=' + message);
  }
}

function equal(actual, expected, message) {
  check(actual === expected, message + ' actual=' + actual + ' expected=' + expected);
}

function draft(revision) {
  return {
    campaignId: 'remote-campaign',
    draftRevision: revision || 'rev-1',
    nombre: 'Campaña remota',
    descripcion: 'Prueba',
    escenario: 'antartida',
    estado: 'draft',
    version: 1,
    misiones: [{ id: 'energy', titulo: 'Centro de energía', numero: '01' }]
  };
}

function publicationFromInput(input, id, version) {
  return Object.freeze({
    campaignId: input.campaignId,
    publicationId: id,
    version: version,
    schemaVersion: input.schemaVersion,
    contentHash: input.contentHash,
    content: JSON.parse(JSON.stringify(input.content))
  });
}

function recordFromPublication(publication, revision) {
  return Object.freeze({
    publicationId: publication.publicationId,
    campaignId: publication.campaignId,
    version: publication.version,
    schemaVersion: publication.schemaVersion,
    contentHash: publication.contentHash,
    sourceDraftRevision: revision,
    createdAt: '2026-08-07T12:00:00.000Z',
    status: 'PUBLISHED'
  });
}

function remoteFactory(config) {
  const cfg = config || {};
  const calls = [];
  let sequence = 0;
  return {
    calls,
    async publishPublication(input, options) {
      calls.push({ input: JSON.parse(JSON.stringify(input)), options: options ? JSON.parse(JSON.stringify(options)) : null });
      if (cfg.throwError) throw new Error(cfg.throwError);
      if (cfg.failure) return Object.freeze({ success: false, requestId: 'req-fail', data: null, error: Object.freeze(cfg.failure) });
      sequence += 1;
      const id = cfg.fixedId || ('server-pub-' + sequence);
      const version = cfg.fixedVersion || sequence;
      let publication = publicationFromInput(input, id, version);
      let record = recordFromPublication(publication, input.draftRevision);
      if (typeof cfg.mutate === 'function') {
        const changed = cfg.mutate(publication, record, input, sequence) || {};
        publication = changed.publication || publication;
        record = changed.record || record;
      }
      return Object.freeze({
        success: true,
        requestId: options && options.requestId || ('req-' + sequence),
        data: Object.freeze({ publication, record }),
        error: null
      });
    }
  };
}

async function main() {
  const api = global.CRIOS_STUDIO_REMOTE_PUBLICATION_SERVICE;
  const core = global.CRIOS_PUBLICATION_CORE;

  check(Boolean(api), 'API exists');
  equal(api.version, '1.0.0', 'API version');
  check(Object.isFrozen(api), 'API frozen');
  check(typeof api.createRemotePublicationService === 'function', 'factory exists');

  const remote = remoteFactory();
  const store = core.createInMemoryPublicationStore();
  const service = api.createRemotePublicationService({ core, remoteClient: remote, store });
  check(Object.isFrozen(service), 'service frozen');
  check(['getPublication','getRecord','listPublications','listRecords','publishCampaign','snapshot'].every(k => typeof service[k] === 'function'), 'service surface');

  const original = draft();
  const before = JSON.stringify(original);
  const first = await service.publishCampaign(original, {
    campaignId: original.campaignId,
    draftRevision: original.draftRevision,
    expectedDraftRevision: original.draftRevision,
    requestId: 'teacher-publish-1'
  });

  check(first.success === true, 'first publish succeeds');
  check(core.isPublicationResult(first), 'first result matches publication result shape');
  check(Object.isFrozen(first), 'first result frozen');
  equal(JSON.stringify(original), before, 'draft not mutated');
  equal(remote.calls.length, 1, 'one remote call');
  equal(remote.calls[0].options.requestId, 'teacher-publish-1', 'requestId forwarded');
  equal(remote.calls[0].input.campaignId, 'remote-campaign', 'campaignId forwarded');
  equal(remote.calls[0].input.draftRevision, 'rev-1', 'draftRevision forwarded');
  equal(remote.calls[0].input.schemaVersion, '2.0', 'schemaVersion forwarded');
  check(/^[0-9a-f]{64}$/.test(remote.calls[0].input.contentHash), 'hash forwarded');
  check(remote.calls[0].input.content && remote.calls[0].input.content.nombre === 'Campaña remota', 'normalized content forwarded');
  equal(first.publication.publicationId, 'server-pub-1', 'server publicationId authoritative');
  equal(first.publication.version, 1, 'server version authoritative');
  equal(first.record.createdAt, '2026-08-07T12:00:00.000Z', 'server createdAt authoritative');
  equal(service.listPublications('remote-campaign').length, 1, 'publication cached');
  equal(service.listRecords('remote-campaign').length, 1, 'record cached');
  equal(service.getPublication('server-pub-1').publicationId, 'server-pub-1', 'cached publication readable');
  equal(service.getRecord('server-pub-1').sourceDraftRevision, 'rev-1', 'cached record readable');
  check(Object.isFrozen(service.listPublications('remote-campaign')), 'publication list frozen');
  check(Object.isFrozen(service.snapshot()), 'snapshot frozen');

  const mismatchRemote = remoteFactory({
    mutate(publication, record) {
      const wrong = Object.freeze(Object.assign({}, publication, { campaignId: 'other-campaign' }));
      return { publication: wrong, record: Object.freeze(Object.assign({}, record, { campaignId: 'other-campaign' })) };
    }
  });
  const mismatchService = api.createRemotePublicationService({ core, remoteClient: mismatchRemote });
  const mismatch = await mismatchService.publishCampaign(draft(), { campaignId: 'remote-campaign', draftRevision: 'rev-1', expectedDraftRevision: 'rev-1' });
  check(mismatch.success === false, 'identity mismatch fails');
  equal(mismatch.error.code, 'REMOTE_IDENTITY_MISMATCH', 'identity mismatch code');
  equal(mismatchService.listPublications('remote-campaign').length, 0, 'identity mismatch not cached');

  const badRecordRemote = remoteFactory({
    mutate(publication, record) {
      return { publication, record: Object.freeze(Object.assign({}, record, { sourceDraftRevision: 'wrong' })) };
    }
  });
  const badRecordService = api.createRemotePublicationService({ core, remoteClient: badRecordRemote });
  const badRecord = await badRecordService.publishCampaign(draft(), { campaignId: 'remote-campaign', draftRevision: 'rev-1', expectedDraftRevision: 'rev-1' });
  check(badRecord.success === false, 'record mismatch fails');
  equal(badRecord.error.code, 'REMOTE_IDENTITY_MISMATCH', 'record mismatch code');

  const failedRemote = remoteFactory({ failure: { code: 'WRITE_UNAUTHORIZED', message: 'Teacher token required.', retryable: false } });
  const failedService = api.createRemotePublicationService({ core, remoteClient: failedRemote });
  const denied = await failedService.publishCampaign(draft(), { campaignId: 'remote-campaign', draftRevision: 'rev-1', expectedDraftRevision: 'rev-1' });
  check(denied.success === false, 'remote failure propagates');
  equal(denied.error.code, 'WRITE_UNAUTHORIZED', 'remote failure code preserved');
  check(denied.error.metadata && denied.error.metadata.retryable === false, 'retryable preserved in metadata');
  equal(failedService.listPublications('remote-campaign').length, 0, 'remote failure not cached');

  const throwingRemote = remoteFactory({ throwError: 'network down' });
  const throwingService = api.createRemotePublicationService({ core, remoteClient: throwingRemote });
  const transportFailure = await throwingService.publishCampaign(draft(), { campaignId: 'remote-campaign', draftRevision: 'rev-1', expectedDraftRevision: 'rev-1' });
  check(transportFailure.success === false, 'transport exception fails');
  equal(transportFailure.error.code, 'REMOTE_TRANSPORT_FAILED', 'transport exception code');

  const invalidDraft = draft();
  invalidDraft.misiones = [];
  const invalidRemote = remoteFactory();
  const invalidService = api.createRemotePublicationService({ core, remoteClient: invalidRemote });
  const invalid = await invalidService.publishCampaign(invalidDraft, { campaignId: 'remote-campaign', draftRevision: 'rev-1', expectedDraftRevision: 'rev-1' });
  check(invalid.success === false, 'invalid draft rejected');
  equal(invalid.error.code, 'VALIDATION_FAILED', 'invalid draft validation code');
  equal(invalidRemote.calls.length, 0, 'invalid draft never reaches network');

  const revisionRemote = remoteFactory();
  const revisionService = api.createRemotePublicationService({ core, remoteClient: revisionRemote });
  const initialConflict = await revisionService.publishCampaign(draft('rev-2'), { campaignId: 'remote-campaign', draftRevision: 'rev-2', expectedDraftRevision: 'rev-1' });
  check(initialConflict.success === false, 'initial revision conflict fails');
  equal(initialConflict.error.code, 'DRAFT_REVISION_CONFLICT', 'initial revision conflict code');
  equal(initialConflict.error.metadata.phase, 'initial', 'initial revision phase');
  equal(revisionRemote.calls.length, 0, 'initial revision conflict no network');

  let revisionReadCount = 0;
  const lateRemote = remoteFactory();
  const lateService = api.createRemotePublicationService({
    core,
    remoteClient: lateRemote,
    readDraftRevision() {
      revisionReadCount += 1;
      return revisionReadCount === 1 ? 'rev-1' : 'rev-2';
    }
  });
  const lateConflict = await lateService.publishCampaign(draft(), { campaignId: 'remote-campaign', draftRevision: 'rev-1', expectedDraftRevision: 'rev-1' });
  check(lateConflict.success === false, 'late revision conflict fails');
  equal(lateConflict.error.code, 'DRAFT_REVISION_CONFLICT', 'late revision conflict code');
  equal(lateConflict.error.metadata.phase, 'pre-remote', 'late revision phase');
  equal(lateRemote.calls.length, 0, 'late revision conflict no network');

  const idempotentRemote = remoteFactory({ fixedId: 'server-same', fixedVersion: 7 });
  const idempotentStore = core.createInMemoryPublicationStore();
  const idempotentService = api.createRemotePublicationService({ core, remoteClient: idempotentRemote, store: idempotentStore });
  const idem1 = await idempotentService.publishCampaign(draft(), { campaignId: 'remote-campaign', draftRevision: 'rev-1', expectedDraftRevision: 'rev-1', requestId: 'same-request' });
  const idem2 = await idempotentService.publishCampaign(draft(), { campaignId: 'remote-campaign', draftRevision: 'rev-1', expectedDraftRevision: 'rev-1', requestId: 'same-request' });
  check(idem1.success && idem2.success, 'idempotent response accepted twice');
  equal(idempotentService.listPublications('remote-campaign').length, 1, 'idempotent response cached once');
  equal(idempotentService.listRecords('remote-campaign').length, 1, 'idempotent record cached once');
  equal(idem2.publication.version, 7, 'idempotent server version retained');

  const collisionStore = core.createInMemoryPublicationStore();
  const seedRemote = remoteFactory({ fixedId: 'seed-id', fixedVersion: 3 });
  const seedService = api.createRemotePublicationService({ core, remoteClient: seedRemote, store: collisionStore });
  const seeded = await seedService.publishCampaign(draft(), { campaignId: 'remote-campaign', draftRevision: 'rev-1', expectedDraftRevision: 'rev-1' });
  check(seeded.success, 'collision seed succeeds');
  const collisionRemote = remoteFactory({ fixedId: 'other-id', fixedVersion: 3 });
  const collisionService = api.createRemotePublicationService({ core, remoteClient: collisionRemote, store: collisionStore });
  const collision = await collisionService.publishCampaign(draft(), { campaignId: 'remote-campaign', draftRevision: 'rev-1', expectedDraftRevision: 'rev-1' });
  check(collision.success === false, 'version collision fails');
  equal(collision.error.code, 'REMOTE_CACHE_CONFLICT', 'version collision code');
  equal(collisionService.listPublications('remote-campaign').length, 1, 'version collision does not mutate cache');

  const unavailable = api.createRemotePublicationService({ core, remoteClient: null });
  const unavailableResult = await unavailable.publishCampaign(draft(), { campaignId: 'remote-campaign', draftRevision: 'rev-1', expectedDraftRevision: 'rev-1' });
  check(unavailableResult.success === false, 'unavailable service fails closed');
  equal(unavailableResult.error.code, 'REMOTE_PUBLICATION_UNAVAILABLE', 'unavailable code');
  equal(unavailable.listPublications('remote-campaign').length, 0, 'unavailable list empty');
  check(Object.isFrozen(unavailable.listPublications('remote-campaign')), 'unavailable list frozen');

  const customSchemaRemote = remoteFactory();
  const customSchemaService = api.createRemotePublicationService({ core, remoteClient: customSchemaRemote, schemaVersion: '1.0.0' });
  const customSchema = await customSchemaService.publishCampaign(draft(), { campaignId: 'remote-campaign', draftRevision: 'rev-1', expectedDraftRevision: 'rev-1' });
  check(customSchema.success, 'custom supported schema succeeds');
  equal(customSchemaRemote.calls[0].input.schemaVersion, '1.0.0', 'custom schema sent remotely');

  console.log('STUDIO_REMOTE_PUBLICATION_SERVICE_TEST_STATUS=' + (failed === 0 ? 'PASS' : 'FAIL'));
  console.log('STUDIO_REMOTE_PUBLICATION_SERVICE_TEST_TOTAL=' + total);
  console.log('STUDIO_REMOTE_PUBLICATION_SERVICE_TEST_FAILED=' + failed);
  console.log('STUDIO_REMOTE_PUBLICATION_SERVICE_REAL_NETWORK=false');
  console.log('STUDIO_REMOTE_PUBLICATION_SERVICE_SERVER_IDENTITY_AUTHORITY=true');
  console.log('STUDIO_REMOTE_PUBLICATION_SERVICE_LOCAL_VERSION_ALLOCATION=false');
  process.exitCode = failed === 0 ? 0 : 1;
}

main().catch(error => {
  console.error(error && error.stack || error);
  console.log('STUDIO_REMOTE_PUBLICATION_SERVICE_TEST_STATUS=FAIL');
  console.log('STUDIO_REMOTE_PUBLICATION_SERVICE_TEST_TOTAL=' + total);
  console.log('STUDIO_REMOTE_PUBLICATION_SERVICE_TEST_FAILED=' + (failed + 1));
  process.exitCode = 1;
});
