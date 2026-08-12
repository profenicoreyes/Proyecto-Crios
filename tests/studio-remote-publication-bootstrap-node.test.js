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

load('js/publication/remote/remote-publication-contract.js');
load('js/publication/remote/remote-publication-client.js');
load('js/studio/publication/studio-remote-publication-service.js');
load('js/studio/publication/studio-remote-publication-bootstrap.js');

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

function makeService() {
  return Object.freeze({
    publishCampaign: async function(){ return null; },
    listPublications: function(){ return Object.freeze([]); },
    getPublication: function(){ return null; },
    getRecord: function(){ return null; }
  });
}

function makeHarness(overrides) {
  const cfg = overrides || {};
  const calls = {
    client: 0,
    service: 0,
    clientOptions: null,
    serviceOptions: null
  };

  const contract = cfg.contract === undefined ? Object.freeze({ marker: 'contract' }) : cfg.contract;
  const core = cfg.core === undefined ? Object.freeze({ marker: 'core' }) : cfg.core;
  const store = cfg.store === undefined ? Object.freeze({ marker: 'store' }) : cfg.store;
  const service = cfg.service === undefined ? makeService() : cfg.service;

  const clientFactory = cfg.clientFactory || Object.freeze({
    createClient(options) {
      calls.client += 1;
      calls.clientOptions = options;
      if (cfg.clientThrow) throw new Error(cfg.clientThrow);
      return Object.freeze({ marker: 'client' });
    }
  });

  const serviceFactory = cfg.serviceFactory || Object.freeze({
    createRemotePublicationService(options) {
      calls.service += 1;
      calls.serviceOptions = options;
      if (cfg.serviceThrow) throw new Error(cfg.serviceThrow);
      return service;
    }
  });

  return { calls, contract, core, store, service, clientFactory, serviceFactory };
}

function selection(api, harness, config, extra) {
  return api.createServiceSelection(Object.assign({
    config,
    core: harness.core,
    store: harness.store,
    contract: harness.contract,
    clientFactory: harness.clientFactory,
    serviceFactory: harness.serviceFactory
  }, extra || {}));
}

const api = global.CRIOS_STUDIO_REMOTE_PUBLICATION_BOOTSTRAP;

check(Boolean(api), 'bootstrap API exists');
equal(api.version, '1.0.0', 'bootstrap API version');
equal(api.configGlobal, 'CRIOS_STUDIO_REMOTE_PUBLICATION_CONFIG', 'config global name');
check(Object.isFrozen(api), 'bootstrap API frozen');
check(typeof api.createServiceSelection === 'function', 'selection factory exists');

delete global.CRIOS_STUDIO_REMOTE_PUBLICATION_CONFIG;
{
  const h = makeHarness();
  const result = api.createServiceSelection({
    core: h.core,
    store: h.store,
    contract: h.contract,
    clientFactory: h.clientFactory,
    serviceFactory: h.serviceFactory
  });
  equal(result.configured, false, 'missing config keeps local path unconfigured');
  equal(result.service, null, 'missing config returns no injected service');
  equal(result.error, null, 'missing config is not an error');
  check(Object.isFrozen(result), 'missing-config selection frozen');
  equal(h.calls.client, 0, 'missing config does not create client');
  equal(h.calls.service, 0, 'missing config does not create service');
}

{
  const h = makeHarness();
  const provider = function(){ return 'runtime-token'; };
  const result = selection(api, h, {
    endpoint: '  https://example.invalid/remote  ',
    writeTokenProvider: provider,
    timeoutMs: 4321
  });
  equal(result.configured, true, 'valid explicit config selects remote mode');
  equal(result.service, h.service, 'valid config returns remote service');
  equal(result.error, null, 'valid config has no bootstrap error');
  check(Object.isFrozen(result), 'valid selection frozen');
  equal(h.calls.client, 1, 'valid config creates one client');
  equal(h.calls.service, 1, 'valid config creates one service');
  equal(h.calls.clientOptions.contract, h.contract, 'contract forwarded to client');
  equal(h.calls.clientOptions.endpoint, 'https://example.invalid/remote', 'endpoint normalized before client');
  equal(h.calls.clientOptions.writeTokenProvider, provider, 'provider forwarded without calling it');
  equal(h.calls.clientOptions.timeoutMs, 4321, 'timeout forwarded');
  equal(h.calls.serviceOptions.core, h.core, 'core forwarded to service');
  equal(h.calls.serviceOptions.store, h.store, 'store forwarded to service');
  check(Boolean(h.calls.serviceOptions.remoteClient), 'created client forwarded to service');
}

{
  let providerCalls = 0;
  const h = makeHarness();
  const provider = function(){ providerCalls += 1; return 'secret-at-call-time'; };
  const result = selection(api, h, {
    endpoint: 'https://example.invalid/remote',
    writeTokenProvider: provider
  });
  equal(result.configured, true, 'provider config selected');
  equal(providerCalls, 0, 'bootstrap never reads teacher credential');
  equal(h.calls.clientOptions.writeTokenProvider, provider, 'bootstrap passes provider by reference');
}

{
  const h = makeHarness();
  let revisionReads = 0;
  const revisionReader = function(){ revisionReads += 1; return 'rev-live'; };
  const result = selection(api, h, { endpoint: 'https://example.invalid/remote' }, { readDraftRevision: revisionReader });
  equal(result.configured, true, 'revision-reader config selects remote mode');
  equal(h.calls.serviceOptions.readDraftRevision, revisionReader, 'bootstrap forwards live draft revision reader by reference');
  equal(revisionReads, 0, 'bootstrap does not read draft revision during composition');
}

{
  const h = makeHarness();
  const result = selection(api, h, { endpoint: 'https://example.invalid/remote' });
  equal(result.configured, true, 'endpoint-only config selects remote mode');
  equal(result.service, h.service, 'endpoint-only config creates service');
  equal(typeof h.calls.clientOptions.writeTokenProvider, 'function', 'missing provider mapped to fail-closed provider function');
  equal(h.calls.clientOptions.writeTokenProvider(), '', 'default provider exposes no credential');
}

[
  { value: null, code: 'REMOTE_PUBLICATION_CONFIG_INVALID', name: 'null config' },
  { value: [], code: 'REMOTE_PUBLICATION_CONFIG_INVALID', name: 'array config' },
  { value: {}, code: 'REMOTE_PUBLICATION_ENDPOINT_REQUIRED', name: 'missing endpoint' },
  { value: { endpoint: '   ' }, code: 'REMOTE_PUBLICATION_ENDPOINT_REQUIRED', name: 'blank endpoint' },
  { value: { endpoint: 'https://example.invalid', writeTokenProvider: 'bad' }, code: 'REMOTE_PUBLICATION_AUTH_PROVIDER_INVALID', name: 'invalid provider' },
  { value: { endpoint: 'https://example.invalid', timeoutMs: 0 }, code: 'REMOTE_PUBLICATION_CONFIG_INVALID', name: 'zero timeout' },
  { value: { endpoint: 'https://example.invalid', timeoutMs: 'bad' }, code: 'REMOTE_PUBLICATION_CONFIG_INVALID', name: 'invalid timeout' },
  { value: { endpoint: 'https://example.invalid', extra: true }, code: 'REMOTE_PUBLICATION_CONFIG_INVALID', name: 'unknown key' },
  { value: { endpoint: 'https://example.invalid', writeToken: 'literal-secret' }, code: 'REMOTE_PUBLICATION_SECRET_LITERAL_REJECTED', name: 'literal token' }
].forEach(function(item){
  const h = makeHarness();
  const result = selection(api, h, item.value);
  equal(result.configured, true, item.name + ' remains explicit remote configuration');
  equal(result.service, null, item.name + ' injects no service');
  equal(result.error && result.error.code, item.code, item.name + ' error code');
  check(Object.isFrozen(result), item.name + ' selection frozen');
  check(Object.isFrozen(result.error), item.name + ' error frozen');
  equal(h.calls.client, 0, item.name + ' creates no client');
  equal(h.calls.service, 0, item.name + ' creates no service');
});

[
  { field: 'core', value: null },
  { field: 'clientFactory', value: Object.freeze({}) },
  { field: 'serviceFactory', value: Object.freeze({}) }
].forEach(function(item){
  const overrides = {};
  overrides[item.field] = item.value;
  const h = makeHarness(overrides);
  const result = selection(api, h, { endpoint: 'https://example.invalid' });
  equal(result.configured, true, 'missing ' + item.field + ' remains configured');
  equal(result.service, null, 'missing ' + item.field + ' returns no service');
  equal(result.error && result.error.code, 'REMOTE_PUBLICATION_MODULE_UNAVAILABLE', 'missing ' + item.field + ' fails closed');
});

{
  const savedContract = global.CRIOS_REMOTE_PUBLICATION_CONTRACT;
  delete global.CRIOS_REMOTE_PUBLICATION_CONTRACT;
  try {
    const h = makeHarness({ contract: null });
    const result = selection(api, h, { endpoint: 'https://example.invalid' });
    equal(result.configured, true, 'missing contract remains configured');
    equal(result.service, null, 'missing contract returns no service');
    equal(result.error && result.error.code, 'REMOTE_PUBLICATION_MODULE_UNAVAILABLE', 'missing contract fails closed');
  } finally {
    global.CRIOS_REMOTE_PUBLICATION_CONTRACT = savedContract;
  }
}

{
  const h = makeHarness({ clientThrow: 'client boom' });
  const result = selection(api, h, { endpoint: 'https://example.invalid' });
  equal(result.error && result.error.code, 'REMOTE_PUBLICATION_CLIENT_CREATE_FAILED', 'client construction failure code');
  check((result.error && result.error.message || '').includes('client boom'), 'client construction failure message preserved');
  equal(h.calls.service, 0, 'service not created after client failure');
}

{
  const h = makeHarness({ serviceThrow: 'service boom' });
  const result = selection(api, h, { endpoint: 'https://example.invalid' });
  equal(result.error && result.error.code, 'REMOTE_PUBLICATION_SERVICE_CREATE_FAILED', 'service construction failure code');
  check((result.error && result.error.message || '').includes('service boom'), 'service construction failure message preserved');
}

{
  const h = makeHarness({ service: Object.freeze({ publishCampaign: async function(){} }) });
  const result = selection(api, h, { endpoint: 'https://example.invalid' });
  equal(result.error && result.error.code, 'REMOTE_PUBLICATION_SERVICE_INVALID', 'invalid service interface rejected');
  equal(result.service, null, 'invalid service interface not injected');
}

{
  const h = makeHarness();
  global.CRIOS_STUDIO_REMOTE_PUBLICATION_CONFIG = Object.freeze({
    endpoint: 'https://global.example.invalid/remote'
  });
  const result = api.createServiceSelection({
    core: h.core,
    store: h.store,
    contract: h.contract,
    clientFactory: h.clientFactory,
    serviceFactory: h.serviceFactory
  });
  equal(result.configured, true, 'global config is detected');
  equal(result.service, h.service, 'global config creates service');
  equal(h.calls.clientOptions.endpoint, 'https://global.example.invalid/remote', 'global endpoint forwarded');
  delete global.CRIOS_STUDIO_REMOTE_PUBLICATION_CONFIG;
}

{
  const h = makeHarness();
  global.CRIOS_STUDIO_REMOTE_PUBLICATION_CONFIG = Object.freeze({
    endpoint: 'https://global.example.invalid/remote'
  });
  const result = api.createServiceSelection({
    config: { endpoint: 'https://explicit.example.invalid/remote' },
    core: h.core,
    store: h.store,
    contract: h.contract,
    clientFactory: h.clientFactory,
    serviceFactory: h.serviceFactory
  });
  equal(result.service, h.service, 'explicit config creates service');
  equal(h.calls.clientOptions.endpoint, 'https://explicit.example.invalid/remote', 'explicit config overrides global config');
  delete global.CRIOS_STUDIO_REMOTE_PUBLICATION_CONFIG;
}

const html = fs.readFileSync(path.join(repo, 'studio/index.html'), 'utf8');
const studioSource = fs.readFileSync(path.join(repo, 'js/studio/studio.js'), 'utf8');
const bootstrapSource = fs.readFileSync(path.join(repo, 'js/studio/publication/studio-remote-publication-bootstrap.js'), 'utf8');

const scriptOrder = [
  '../js/publication/remote/remote-publication-contract.js',
  '../js/publication/remote/remote-publication-client.js',
  '../js/studio/publication/studio-remote-publication-service.js',
  '../js/studio/publication/studio-remote-publication-bootstrap.js',
  '../js/studio/publication/studio-publication-controller.js',
  '../js/studio/studio.js'
].map(function(src){ return html.indexOf(src); });

check(scriptOrder.every(function(index){ return index >= 0; }), 'all remote composition scripts are loaded by Studio');
check(scriptOrder.every(function(index, i){ return i === 0 || index > scriptOrder[i - 1]; }), 'remote composition script order is dependency-safe');
check(studioSource.includes('remotePublicationBootstrapFactory.createServiceSelection'), 'Studio calls remote bootstrap selection factory');
check(studioSource.includes('remotePublicationSelection && remotePublicationSelection.configured'), 'Studio only injects publication service for explicit remote configuration');
check(studioSource.includes('publicationControllerOptions.publicationService = remotePublicationSelection.service'), 'Studio forwards selected service through controller injection seam');
check(studioSource.includes('var publicationAdapter = null;'), 'Studio shares one publication adapter across remote service and controller');
check(studioSource.includes('readDraftRevision: function(){'), 'Studio supplies live draft revision reader to remote bootstrap');
check(bootstrapSource.includes('serviceOptions.readDraftRevision = opts.readDraftRevision'), 'bootstrap forwards live revision reader into remote service');
check(studioSource.includes("'CRIOS_STUDIO_REMOTE_PUBLICATION_CONFIG'"), 'Studio detects explicit remote configuration even if bootstrap module is unavailable');
check(!studioSource.includes('script.google.com/macros/s/'), 'Studio wiring contains no fixed remote endpoint');
check(!bootstrapSource.includes('script.google.com/macros/s/'), 'bootstrap contains no fixed remote endpoint');
check(!bootstrapSource.includes('teacher-secret'), 'bootstrap contains no embedded teacher secret');
check(!studioSource.includes('teacher-secret'), 'Studio wiring contains no embedded teacher secret');
check(studioSource.includes('delete window.CRIOS_STUDIO_REMOTE_PUBLICATION_BOOTSTRAP'), 'Studio removes bootstrap factory global after composition');
check(studioSource.includes('delete window.CRIOS_STUDIO_REMOTE_PUBLICATION_SERVICE'), 'Studio removes remote service factory global after composition');
check(studioSource.includes('delete window.CRIOS_REMOTE_PUBLICATION_CLIENT'), 'Studio removes remote client factory global after composition');
check(studioSource.includes('delete window.CRIOS_REMOTE_PUBLICATION_CONTRACT'), 'Studio removes remote contract global after composition');


async function runRealCompositionIntegration() {
  const cachedPublications = [];
  const cachedRecords = [];
  const store = Object.freeze({
    commit(publication, record) {
      cachedPublications.push(publication);
      cachedRecords.push(record);
      return Object.freeze({ publication, record });
    },
    getPublication(publicationId) {
      return cachedPublications.find(function(item){ return item.publicationId === publicationId; }) || null;
    },
    getRecord(publicationId) {
      return cachedRecords.find(function(item){ return item.publicationId === publicationId; }) || null;
    },
    listPublications(campaignId) {
      return Object.freeze(cachedPublications.filter(function(item){ return item.campaignId === campaignId; }));
    },
    listRecords(campaignId) {
      return Object.freeze(cachedRecords.filter(function(item){ return item.campaignId === campaignId; }));
    },
    snapshot() {
      return Object.freeze({
        publications: Object.freeze(cachedPublications.slice()),
        records: Object.freeze(cachedRecords.slice()),
        versionsByCampaign: Object.freeze({})
      });
    }
  });

  const core = Object.freeze({
    buildPublicationCandidate(draft, options) {
      return Object.freeze({
        ok: true,
        candidate: Object.freeze({
          campaignId: options.campaignId,
          draftRevision: options.draftRevision,
          schemaVersion: options.schemaVersion,
          content: Object.freeze({ nombre: draft.nombre })
        }),
        validation: Object.freeze({
          valid: true,
          issues: Object.freeze([]),
          normalized: Object.freeze({ campaignId: options.campaignId })
        }),
        error: null
      });
    },
    buildCanonicalContent(candidate) {
      return candidate.content;
    },
    async calculateContentHash() {
      return 'b'.repeat(64);
    },
    isPublishedCampaign(value) {
      return Boolean(value &&
        value.campaignId === 'real-campaign' &&
        value.publicationId === 'server-publication-7' &&
        value.version === 7 &&
        value.schemaVersion === '2.0' &&
        value.contentHash === 'b'.repeat(64));
    }
  });

  let providerCalls = 0;
  let fetchCalls = 0;
  let observedUrl = '';
  let observedInit = null;
  const oldFetch = global.fetch;

  global.fetch = async function(url, init) {
    fetchCalls += 1;
    observedUrl = String(url);
    observedInit = init;
    const envelope = JSON.parse(String(init && init.body || '{}'));
    const request = envelope.request;
    check(Boolean(request), 'real composition sends contract request');
    equal(envelope.writeToken, 'runtime-only-token', 'real composition obtains token only at write time');
    return {
      ok: true,
      status: 200,
      async text() {
        return JSON.stringify({
          protocolVersion: request.protocolVersion,
          operation: request.operation,
          requestId: request.requestId,
          success: true,
          data: {
            publication: {
              campaignId: request.payload.campaignId,
              publicationId: 'server-publication-7',
              version: 7,
              schemaVersion: request.payload.schemaVersion,
              contentHash: request.payload.contentHash,
              content: request.payload.content
            },
            record: {
              publicationId: 'server-publication-7',
              campaignId: request.payload.campaignId,
              version: 7,
              schemaVersion: request.payload.schemaVersion,
              contentHash: request.payload.contentHash,
              sourceDraftRevision: request.payload.draftRevision,
              createdAt: '2026-08-08T03:00:00.000Z',
              status: 'PUBLISHED'
            }
          },
          error: null
        });
      }
    };
  };

  try {
    let revisionReads = 0;
    const selected = api.createServiceSelection({
      config: {
        endpoint: 'https://example.invalid/real-publication',
        writeTokenProvider: function(){
          providerCalls += 1;
          return 'runtime-only-token';
        }
      },
      core,
      store,
      readDraftRevision: function(){
        revisionReads += 1;
        return 'rev-real';
      }
    });

    equal(selected.configured, true, 'real factories select remote mode');
    check(Boolean(selected.service), 'real factories create Studio remote publication service');
    equal(selected.error, null, 'real factories compose without error');
    equal(providerCalls, 0, 'real factory composition does not read credential');

    const result = await selected.service.publishCampaign(
      { campaignId: 'real-campaign', nombre: 'Real composition' },
      {
        campaignId: 'real-campaign',
        draftRevision: 'rev-real',
        expectedDraftRevision: 'rev-real',
        requestId: 'req-real-composition'
      }
    );

    equal(result.success, true, 'real composed publication succeeds against fake transport');
    equal(result.publication && result.publication.publicationId, 'server-publication-7', 'server publicationId remains authoritative');
    equal(result.publication && result.publication.version, 7, 'server version remains authoritative');
    equal(result.record && result.record.createdAt, '2026-08-08T03:00:00.000Z', 'server createdAt remains authoritative');
    equal(providerCalls, 1, 'credential provider called exactly once for write');
    equal(revisionReads, 2, 'live draft revision reader runs before build and immediately before remote write');
    equal(fetchCalls, 1, 'real client performs exactly one fake fetch');
    equal(observedUrl, 'https://example.invalid/real-publication', 'real client uses configured endpoint');
    equal(observedInit && observedInit.method, 'POST', 'real client uses POST for publication write');
    equal(cachedPublications.length, 1, 'authoritative publication cached locally once');
    equal(cachedRecords.length, 1, 'authoritative publication record cached locally once');
    equal(cachedPublications[0].publicationId, 'server-publication-7', 'local cache stores server publication identity');
  } finally {
    global.fetch = oldFetch;
  }
}

async function finish() {
  try {
    await runRealCompositionIntegration();
  } catch (error) {
    failed += 1;
    console.error('FAIL=real composition integration threw ' + String(error && error.stack || error));
  }

  console.log('STUDIO_REMOTE_PUBLICATION_BOOTSTRAP_TEST_STATUS=' + (failed === 0 ? 'PASS' : 'FAIL'));
  console.log('STUDIO_REMOTE_PUBLICATION_BOOTSTRAP_TEST_TOTAL=' + total);
  console.log('STUDIO_REMOTE_PUBLICATION_BOOTSTRAP_TEST_FAILED=' + failed);
  console.log('STUDIO_REMOTE_PUBLICATION_BOOTSTRAP_LOCAL_FALLBACK_WITHOUT_CONFIG=true');
  console.log('STUDIO_REMOTE_PUBLICATION_BOOTSTRAP_EXPLICIT_CONFIG_FAILS_CLOSED=true');
  console.log('STUDIO_REMOTE_PUBLICATION_BOOTSTRAP_LITERAL_SECRET_REJECTED=true');
  console.log('STUDIO_REMOTE_PUBLICATION_BOOTSTRAP_PROVIDER_NOT_READ_DURING_COMPOSITION=true');
  console.log('STUDIO_REMOTE_PUBLICATION_BOOTSTRAP_REAL_FACTORIES_WITH_FAKE_TRANSPORT=true');
  console.log('STUDIO_REMOTE_PUBLICATION_BOOTSTRAP_SERVER_IDENTITY_AUTHORITY=true');
  console.log('STUDIO_REMOTE_PUBLICATION_BOOTSTRAP_REAL_NETWORK=false');

  process.exitCode = failed === 0 ? 0 : 1;
}

finish();
