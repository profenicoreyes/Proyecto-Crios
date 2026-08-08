'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const repo = path.resolve(process.argv[2] || path.join(__dirname, '..'));
global.window = global;
global.CRIOS_DOMAIN = {};
global.__CRIOS_REGISTER_DOMAIN_MODULE__ = function(name, contract) {
  global.CRIOS_DOMAIN[name] = contract;
};

function load(relative) {
  vm.runInThisContext(fs.readFileSync(path.join(repo, relative), 'utf8'), { filename: relative });
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
  'js/publication/remote/remote-publication-contract.js',
  'js/publication/remote/remote-publication-client.js',
  'js/runtime/missions/published-mission-spec.js',
  'js/runtime/missions/safe-expression.js',
  'js/runtime/missions/mission-handler-registry.js',
  'js/runtime/missions/declarative-area-handler.js',
  'js/runtime/missions/mission-materializer.js',
  'js/runtime/missions/mission-handlers-api.js',
  'tests/fixtures/publishable-mission-spec-fixtures.js',
  'js/runtime/publication/runtime-publication-model.js',
  'js/runtime/publication/runtime-publication-validator.js',
  'js/runtime/publication/runtime-publication-resolver.js',
  'js/runtime/publication/runtime-publication-api.js',
  'js/runtime/publication/runtime-remote-publication-readers.js',
  'js/runtime/publication/runtime-remote-publication-bootstrap.js',
  'js/runtime/bootstrap/runtime-bootstrap-adapter.js'
].forEach(load);
delete global.__CRIOS_REGISTER_DOMAIN_MODULE__;

const core = global.CRIOS_PUBLICATION_CORE;
const handlers = global.CRIOS_RUNTIME_MISSION_HANDLERS;
const runtime = global.CRIOS_RUNTIME_EXECUTABLE_PUBLICATION;
const remoteBootstrap = global.CRIOS_RUNTIME_REMOTE_PUBLICATION_BOOTSTRAP;
const adapter = global.CRIOS_DOMAIN.runtimeBootstrapAdapter;
const fixtures = global.CRIOS_RUNTIME_MISSION_FIXTURES;

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
  check(Object.is(actual, expected), message + ' actual=' + String(actual) + ' expected=' + String(expected));
}
function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
function finalEvaluation() {
  return {
    responseType: 'NUMERIC_WITH_PROCEDURE',
    rngPolicy: 'SEEDED_SEQUENCE_V1',
    unit: 'm2',
    instruction: 'Integra los resultados.',
    adjustments: [
      { name: 'recovered', operation: 'add', values: [2, 4, 6] },
      { name: 'loss', operation: 'subtract', values: [1, 3, 5] }
    ]
  };
}

async function buildPublication() {
  const value = {
    campaignId: 'campaign-b4-integration',
    publicationId: 'publication-b4-integration-v1',
    version: 1,
    schemaVersion: '2.0',
    contentHash: '',
    content: {
      nombre: 'Campaña remota B4',
      descripcion: 'Cross-device',
      escenario: 'antartida',
      clasificacion: { area: 'matematica' },
      missionSpecs: fixtures.createAll(),
      runtimeExecutionManifest: {
        runtimeContractVersion: '1.0.0',
        requiredHandlers: [{ handlerId: 'crios.geometry.declarative-area', handlerVersion: '1.0.0' }],
        missionCount: 4,
        missionOrder: ['energy', 'greenhouse', 'ice', 'hangar']
      },
      finalEvaluation: finalEvaluation()
    }
  };
  value.contentHash = await core.calculateContentHash(
    core.buildCanonicalContent({ schemaVersion: value.schemaVersion, content: value.content })
  );
  return value;
}

function activeReference(publication) {
  return {
    campaignId: publication.campaignId,
    publicationId: publication.publicationId,
    version: publication.version,
    contentHash: publication.contentHash,
    activatedAt: '2026-08-08T15:00:00.000Z'
  };
}

function responseFor(url, publication, mutate) {
  const parsed = new URL(String(url));
  const request = {
    protocolVersion: parsed.searchParams.get('protocolVersion') || '',
    operation: parsed.searchParams.get('operation') || '',
    requestId: parsed.searchParams.get('requestId') || '',
    campaignId: parsed.searchParams.get('campaignId') || '',
    publicationId: parsed.searchParams.get('publicationId') || ''
  };
  if (request.campaignId !== publication.campaignId || request.publicationId !== publication.publicationId) {
    return {
      protocolVersion: request.protocolVersion,
      operation: request.operation,
      requestId: request.requestId,
      success: false,
      data: null,
      error: { code: 'PUBLICATION_UNAVAILABLE', message: 'Publication is not active.', retryable: false }
    };
  }
  const data = { publication: clone(publication), activeReference: activeReference(publication) };
  if (mutate) mutate(data);
  return {
    protocolVersion: request.protocolVersion,
    operation: request.operation,
    requestId: request.requestId,
    success: true,
    data,
    error: null
  };
}

(async function run() {
  check(Boolean(core), 'publication core loaded');
  check(Boolean(runtime), 'runtime publication API loaded');
  check(Boolean(remoteBootstrap), 'remote bootstrap loaded');
  check(Boolean(adapter), 'runtime bootstrap adapter registered');

  const publication = await buildPublication();
  const calls = [];
  global.fetch = async function(url, init) {
    calls.push({ url: String(url), init: clone(init || {}) });
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify(responseFor(url, publication))
    };
  };

  const selection = remoteBootstrap.createReaderSelection({
    config: { endpoint: 'https://remote.invalid/exec', timeoutMs: 5000 },
    campaignId: publication.campaignId,
    publicationId: publication.publicationId
  });
  check(selection.configured, 'remote selection configured');
  check(!selection.error, 'remote selection no error');
  check(Boolean(selection.readers), 'remote readers created');
  check(Boolean(selection.client), 'remote client created');

  let localPersistenceCalls = 0;
  const events = [];
  const result = await adapter.preparePublishedCampaign({
    mode: 'published',
    campaignId: publication.campaignId,
    publicationId: publication.publicationId,
    identity: 'student|character|group',
    runtimePublicationApi: runtime,
    publicationCore: core,
    missionHandlersApi: handlers,
    persistenceApi: {
      createPersistenceCoordinator() {
        localPersistenceCalls += 1;
        throw new Error('local persistence must not be used in remote mode');
      }
    },
    publicationReaders: selection.readers,
    telemetry(type, payload) { events.push({ type, payload }); }
  });

  check(result.success, 'remote publication prepares successfully');
  equal(localPersistenceCalls, 0, 'remote mode bypasses local persistence');
  equal(calls.length, 1, 'remote pipeline performs one GET');
  check(calls[0].url.indexOf('accion=getPublication') >= 0, 'remote call is getPublication');
  check(calls[0].url.indexOf('campaignId=' + encodeURIComponent(publication.campaignId)) >= 0, 'remote URL campaign exact');
  check(calls[0].url.indexOf('publicationId=' + encodeURIComponent(publication.publicationId)) >= 0, 'remote URL publication exact');
  equal(String(calls[0].init.method || '').toUpperCase(), 'GET', 'remote transport GET');
  equal(calls[0].init.credentials, 'omit', 'remote GET omits credentials');
  equal(calls[0].init.cache, 'no-store', 'remote GET no-store');
  equal(result.campaign.data.campaign.campaignId, publication.campaignId, 'prepared campaign id exact');
  equal(result.campaign.data.campaign.publicationId, publication.publicationId, 'prepared publication id exact');
  equal(result.campaign.data.campaign.contentHash, publication.contentHash, 'prepared content hash exact');
  equal(result.campaign.data.missions.length, 4, 'four remote missions prepared');
  check(events.some(item => item.type === 'bootstrap-runtime:publication-read'), 'publication-read telemetry emitted');
  check(events.some(item => item.type === 'bootstrap-runtime:completed'), 'completed telemetry emitted');
  check(events.every(item => JSON.stringify(item).indexOf('student|character|group') < 0), 'identity absent from telemetry');

  const wrongLinkSelection = remoteBootstrap.createReaderSelection({
    config: { endpoint: 'https://remote.invalid/exec' },
    campaignId: publication.campaignId,
    publicationId: 'publication-b4-other'
  });
  const beforeWrong = calls.length;
  const wrongLink = await adapter.preparePublishedCampaign({
    mode: 'published',
    campaignId: publication.campaignId,
    publicationId: 'publication-b4-other',
    identity: 'student|character|group',
    runtimePublicationApi: runtime,
    publicationCore: core,
    missionHandlersApi: handlers,
    publicationReaders: wrongLinkSelection.readers
  });
  check(!wrongLink.success, 'inactive or wrong exact link fails');
  equal(wrongLink.error.code, 'PUBLICATION_NOT_FOUND', 'wrong exact link maps unavailable');
  equal(calls.length, beforeWrong + 1, 'wrong exact link only one GET');

  const previousFetch = global.fetch;
  let transportCalls = 0;
  global.fetch = async function() {
    transportCalls += 1;
    throw new Error('offline');
  };
  const offlineSelection = remoteBootstrap.createReaderSelection({
    config: { endpoint: 'https://remote.invalid/exec', timeoutMs: 50 },
    campaignId: publication.campaignId,
    publicationId: publication.publicationId
  });
  const offline = await adapter.preparePublishedCampaign({
    mode: 'published',
    campaignId: publication.campaignId,
    publicationId: publication.publicationId,
    identity: 'student|character|group',
    runtimePublicationApi: runtime,
    publicationCore: core,
    missionHandlersApi: handlers,
    publicationReaders: offlineSelection.readers
  });
  check(!offline.success, 'offline remote fails closed');
  equal(offline.error.code, 'RUNTIME_PUBLICATION_RESOLUTION_ERROR', 'offline code');
  equal(transportCalls, 1, 'offline only one attempt');
  global.fetch = previousFetch;

  let mismatchCalls = 0;
  global.fetch = async function(url) {
    mismatchCalls += 1;
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify(responseFor(url, publication, data => {
        data.activeReference.contentHash = 'b'.repeat(64);
      }))
    };
  };
  const mismatchSelection = remoteBootstrap.createReaderSelection({
    config: { endpoint: 'https://remote.invalid/exec' },
    campaignId: publication.campaignId,
    publicationId: publication.publicationId
  });
  const mismatch = await adapter.preparePublishedCampaign({
    mode: 'published',
    campaignId: publication.campaignId,
    publicationId: publication.publicationId,
    identity: 'student|character|group',
    runtimePublicationApi: runtime,
    publicationCore: core,
    missionHandlersApi: handlers,
    publicationReaders: mismatchSelection.readers
  });
  check(!mismatch.success, 'remote identity mismatch fails closed');
  equal(mismatch.error.code, 'PUBLICATION_IDENTITY_MISMATCH', 'remote identity mismatch code');
  equal(mismatchCalls, 1, 'remote identity mismatch one call');

  global.fetch = previousFetch;
  const recoveryCalls = [];
  global.fetch = async function(url, init) {
    recoveryCalls.push({ url: String(url), init: clone(init || {}) });
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify(responseFor(url, publication))
    };
  };
  const recoverySelection = remoteBootstrap.createReaderSelection({
    config: { endpoint: 'https://remote.invalid/exec' },
    campaignId: publication.campaignId,
    publicationId: publication.publicationId
  });
  const pinned = result.campaign.data.campaign;
  const recovered = await adapter.recoverPublishedCampaign({
    mode: 'published',
    campaignId: publication.campaignId,
    publicationId: publication.publicationId,
    identity: 'student|character|group',
    runtimePublicationApi: runtime,
    publicationCore: core,
    missionHandlersApi: handlers,
    publicationReaders: recoverySelection.readers,
    pinnedPublication: pinned
  });
  check(recovered.success, 'pinned remote recovery succeeds');
  equal(recoveryCalls.length, 1, 'pinned recovery still remotely verifies active publication');
  equal(recovered.campaign.data.progressKey, result.campaign.data.progressKey, 'pinned recovery preserves progress identity');

  const wrongPinned = Object.assign({}, pinned, { publicationId: 'publication-old' });
  const beforeWrongPinned = recoveryCalls.length;
  const wrongPinnedResult = await adapter.recoverPublishedCampaign({
    mode: 'published',
    campaignId: publication.campaignId,
    publicationId: publication.publicationId,
    identity: 'student|character|group',
    runtimePublicationApi: runtime,
    publicationCore: core,
    missionHandlersApi: handlers,
    publicationReaders: recoverySelection.readers,
    pinnedPublication: wrongPinned
  });
  check(!wrongPinnedResult.success, 'wrong pinned identity fails before remote read');
  equal(wrongPinnedResult.error.code, 'PINNED_PUBLICATION_MISMATCH', 'wrong pin code');
  equal(recoveryCalls.length, beforeWrongPinned, 'wrong pin no remote call');

  delete global.fetch;

  const adapterSource = fs.readFileSync(path.join(repo, 'js/runtime/bootstrap/runtime-bootstrap-adapter.js'), 'utf8');
  const criosSource = fs.readFileSync(path.join(repo, 'js/crios.js'), 'utf8');
  const indexSource = fs.readFileSync(path.join(repo, 'index.html'), 'utf8');

  check(adapterSource.indexOf('publicationReaders') >= 0, 'adapter has reader injection seam');
  check(criosSource.indexOf('CRIOS_RUNTIME_REMOTE_PUBLICATION_BOOTSTRAP') >= 0, 'crios composes runtime remote bootstrap');
  check(criosSource.indexOf('options.publicationReaders=remoteSelection.readers') >= 0, 'crios injects remote readers');
  check(criosSource.indexOf('existingPublicationId===requestedPublishedPublicationId') >= 0, 'session recovery bound to link publication');
  check(indexSource.indexOf('js/publication/remote/remote-publication-contract.js') >= 0, 'runtime page loads remote contract');
  check(indexSource.indexOf('js/publication/remote/remote-publication-client.js') >= 0, 'runtime page loads remote client');
  check(indexSource.indexOf('js/runtime/publication/runtime-remote-publication-readers.js') >= 0, 'runtime page loads remote readers');
  check(indexSource.indexOf('js/runtime/publication/runtime-remote-publication-bootstrap.js') >= 0, 'runtime page loads remote bootstrap');

  console.log('RUNTIME_REMOTE_PUBLICATION_INTEGRATION_TEST_STATUS=' + (failed ? 'FAIL' : 'PASS'));
  console.log('RUNTIME_REMOTE_PUBLICATION_INTEGRATION_TEST_TOTAL=' + total);
  console.log('RUNTIME_REMOTE_PUBLICATION_INTEGRATION_TEST_FAILED=' + failed);
  console.log('RUNTIME_REMOTE_PUBLICATION_SINGLE_GET=true');
  console.log('RUNTIME_REMOTE_PUBLICATION_LOCAL_PERSISTENCE_BYPASSED=true');
  console.log('RUNTIME_REMOTE_PUBLICATION_PINNED_RECOVERY_REVALIDATED=true');
  console.log('RUNTIME_REMOTE_PUBLICATION_FAIL_CLOSED=true');
  console.log('RUNTIME_REMOTE_PUBLICATION_REAL_NETWORK=false');
  if (failed) process.exit(1);
})().catch(error => {
  console.error('RUNTIME_REMOTE_PUBLICATION_INTEGRATION_TEST_STATUS=FAIL');
  console.error(String(error && error.stack || error));
  process.exit(1);
});
