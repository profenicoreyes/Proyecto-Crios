'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const repo = path.resolve(process.argv[2] || path.join(__dirname, '..'));
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
  check(actual === expected, message + ' actual=' + String(actual) + ' expected=' + String(expected));
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
  const calls = { client: 0, service: 0, clientOptions: null, serviceOptions: null };
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
const bootstrapSource = fs.readFileSync(path.join(repo, 'js/studio/publication/studio-remote-publication-bootstrap.js'), 'utf8');
const studioSource = fs.readFileSync(path.join(repo, 'js/studio/studio.js'), 'utf8');
const html = fs.readFileSync(path.join(repo, 'studio/index.html'), 'utf8');

check(Boolean(api), 'bootstrap API exists');
equal(api.version, '1.0.0', 'bootstrap API version');
equal(api.configGlobal, 'CRIOS_STUDIO_REMOTE_PUBLICATION_CONFIG', 'config global name');
check(Object.isFrozen(api), 'bootstrap API frozen');
check(typeof api.createServiceSelection === 'function', 'selection factory exists');
check(!bootstrapSource.includes('script.google.com/macros/s/'), 'bootstrap contains no fixed endpoint');
check(!bootstrapSource.includes('Teacher write authorization'), 'bootstrap contains no active teacher auth message');

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
  equal(result.error, null, 'missing config is not error');
  equal(h.calls.client, 0, 'missing config creates no client');
  equal(h.calls.service, 0, 'missing config creates no service');
}

{
  const h = makeHarness();
  const result = selection(api, h, {
    endpoint: '  https://example.invalid/remote  ',
    timeoutMs: 4321
  });
  equal(result.configured, true, 'endpoint config selects remote mode');
  equal(result.service, h.service, 'endpoint config returns remote service');
  equal(result.error, null, 'endpoint config has no error');
  equal(h.calls.client, 1, 'endpoint config creates client');
  equal(h.calls.service, 1, 'endpoint config creates service');
  equal(h.calls.clientOptions.contract, h.contract, 'contract forwarded');
  equal(h.calls.clientOptions.endpoint, 'https://example.invalid/remote', 'endpoint normalized');
  equal(h.calls.clientOptions.timeoutMs, 4321, 'timeout forwarded');
  check(!Object.prototype.hasOwnProperty.call(h.calls.clientOptions, 'writeToken'), 'client options have no literal token');
  check(!Object.prototype.hasOwnProperty.call(h.calls.clientOptions, 'writeTokenProvider'), 'client options have no token provider');
  equal(h.calls.serviceOptions.core, h.core, 'core forwarded');
  equal(h.calls.serviceOptions.store, h.store, 'store forwarded');
  check(Boolean(h.calls.serviceOptions.remoteClient), 'created client forwarded');
}

{
  const h = makeHarness();
  let revisionReads = 0;
  const revisionReader = function(){ revisionReads += 1; return 'rev-live'; };
  const result = selection(api, h, { endpoint: 'https://example.invalid/remote' }, { readDraftRevision: revisionReader });
  equal(result.configured, true, 'revision reader config selects remote mode');
  equal(h.calls.serviceOptions.readDraftRevision, revisionReader, 'live draft revision reader forwarded by reference');
  equal(revisionReads, 0, 'bootstrap does not read revision during composition');
}

[
  { value: null, code: 'REMOTE_PUBLICATION_CONFIG_INVALID', name: 'null config' },
  { value: [], code: 'REMOTE_PUBLICATION_CONFIG_INVALID', name: 'array config' },
  { value: {}, code: 'REMOTE_PUBLICATION_ENDPOINT_REQUIRED', name: 'missing endpoint' },
  { value: { endpoint: '   ' }, code: 'REMOTE_PUBLICATION_ENDPOINT_REQUIRED', name: 'blank endpoint' },
  { value: { endpoint: 'https://example.invalid', timeoutMs: 0 }, code: 'REMOTE_PUBLICATION_CONFIG_INVALID', name: 'zero timeout' },
  { value: { endpoint: 'https://example.invalid', timeoutMs: 'bad' }, code: 'REMOTE_PUBLICATION_CONFIG_INVALID', name: 'invalid timeout' },
  { value: { endpoint: 'https://example.invalid', extra: true }, code: 'REMOTE_PUBLICATION_CONFIG_INVALID', name: 'unknown key' },
  { value: { endpoint: 'https://example.invalid', writeToken: 'legacy-secret' }, code: 'REMOTE_PUBLICATION_AUTH_RETIRED', name: 'literal token retired' },
  { value: { endpoint: 'https://example.invalid', writeTokenProvider: function(){ return 'legacy'; } }, code: 'REMOTE_PUBLICATION_AUTH_RETIRED', name: 'token provider retired' }
].forEach(function(item) {
  const h = makeHarness();
  const result = selection(api, h, item.value);
  equal(result.configured, true, item.name + ' remains explicit remote config');
  equal(result.service, null, item.name + ' injects no service');
  equal(result.error && result.error.code, item.code, item.name + ' error code');
  equal(h.calls.client, 0, item.name + ' creates no client');
  equal(h.calls.service, 0, item.name + ' creates no service');
});

[
  { field: 'core', value: null },
  { field: 'clientFactory', value: Object.freeze({}) },
  { field: 'serviceFactory', value: Object.freeze({}) }
].forEach(function(item) {
  const overrides = {};
  overrides[item.field] = item.value;
  const h = makeHarness(overrides);
  const result = selection(api, h, { endpoint: 'https://example.invalid' });
  equal(result.configured, true, 'missing ' + item.field + ' remains configured');
  equal(result.service, null, 'missing ' + item.field + ' returns no service');
  equal(result.error && result.error.code, 'REMOTE_PUBLICATION_MODULE_UNAVAILABLE', 'missing ' + item.field + ' fails closed');
});

{
  const h = makeHarness({ clientThrow: 'client boom' });
  const result = selection(api, h, { endpoint: 'https://example.invalid' });
  equal(result.error && result.error.code, 'REMOTE_PUBLICATION_CLIENT_CREATE_FAILED', 'client construction failure code');
}
{
  const h = makeHarness({ serviceThrow: 'service boom' });
  const result = selection(api, h, { endpoint: 'https://example.invalid' });
  equal(result.error && result.error.code, 'REMOTE_PUBLICATION_SERVICE_CREATE_FAILED', 'service construction failure code');
}
{
  const h = makeHarness({ service: Object.freeze({}) });
  const result = selection(api, h, { endpoint: 'https://example.invalid' });
  equal(result.error && result.error.code, 'REMOTE_PUBLICATION_SERVICE_INVALID', 'invalid service interface rejected');
}

const scriptOrder = [
  '../js/config.js',
  '../js/publication/remote/remote-publication-client.js',
  '../js/publication/remote/remote-publication-deployment-config.js',
  '../js/studio/publication/studio-remote-publication-service.js',
  '../js/studio/publication/studio-remote-publication-bootstrap.js',
  '../js/studio/studio.js'
].map(function(src){ return html.indexOf(src); });
check(scriptOrder.every(function(index){ return index >= 0; }), 'all remote composition scripts loaded by Studio');
check(scriptOrder.every(function(index, i){ return i === 0 || index > scriptOrder[i - 1]; }), 'remote composition order safe');
check(html.indexOf('../js/studio/publication/studio-write-auth.js') < 0, 'Studio no longer loads teacher write auth module');
check(!fs.existsSync(path.join(repo, 'js/studio/publication/studio-write-auth.js')), 'teacher write auth module removed from repository');
check(studioSource.includes('remotePublicationBootstrapFactory.createServiceSelection'), 'Studio calls bootstrap selection');
check(studioSource.includes('publicationControllerOptions.publicationService = remotePublicationSelection.service'), 'Studio injects selected remote service');
check(!studioSource.includes('writeToken'), 'Studio wiring contains no write token');
check(!studioSource.includes('teacher-secret'), 'Studio wiring contains no teacher secret');

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
      return Object.freeze({ publications: Object.freeze(cachedPublications.slice()), records: Object.freeze(cachedRecords.slice()), versionsByCampaign: Object.freeze({}) });
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
        validation: Object.freeze({ valid: true, issues: Object.freeze([]), normalized: Object.freeze({ campaignId: options.campaignId }) }),
        error: null
      });
    },
    buildCanonicalContent(candidate) { return candidate.content; },
    async calculateContentHash() { return 'b'.repeat(64); },
    isPublishedCampaign(value) {
      return Boolean(value &&
        value.campaignId === 'real-campaign' &&
        value.publicationId === 'server-publication-7' &&
        value.version === 7 &&
        value.schemaVersion === '2.0' &&
        value.contentHash === 'b'.repeat(64));
    }
  });

  let fetchCalls = 0;
  let observedEnvelope = null;
  const oldFetch = global.fetch;
  global.fetch = async function(url, init) {
    fetchCalls += 1;
    observedEnvelope = JSON.parse(String(init && init.body || '{}'));
    const request = observedEnvelope.request;
    check(Boolean(request), 'real composition sends contract request');
    equal(Object.keys(observedEnvelope).sort().join(','), 'request', 'real composition sends request-only envelope');
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
              createdAt: '2026-08-13T21:00:00.000Z',
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
      config: { endpoint: 'https://example.invalid/real-publication' },
      core,
      store,
      readDraftRevision: function(){ revisionReads += 1; return 'rev-real'; }
    });

    equal(selected.configured, true, 'real factories select remote mode');
    check(Boolean(selected.service), 'real factories create remote publication service');
    equal(selected.error, null, 'real factories compose without error');

    const result = await selected.service.publishCampaign(
      { campaignId: 'real-campaign', nombre: 'Real composition' },
      {
        campaignId: 'real-campaign',
        draftRevision: 'rev-real',
        expectedDraftRevision: 'rev-real',
        requestId: 'req-real-composition'
      }
    );

    equal(result.success, true, 'real composed anonymous publication succeeds');
    equal(result.publication && result.publication.publicationId, 'server-publication-7', 'server publicationId authoritative');
    equal(result.publication && result.publication.version, 7, 'server version authoritative');
    equal(revisionReads, 2, 'live draft revision checked before build and write');
    equal(fetchCalls, 1, 'real client performs exactly one fetch');
    equal(cachedPublications.length, 1, 'authoritative publication cached once');
    equal(cachedRecords.length, 1, 'authoritative record cached once');
    check(!Object.prototype.hasOwnProperty.call(observedEnvelope, 'writeToken'), 'real composition sends no teacher key');
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
  console.log('STUDIO_REMOTE_PUBLICATION_BOOTSTRAP_ANONYMOUS_PUBLISH=true');
  console.log('STUDIO_REMOTE_PUBLICATION_BOOTSTRAP_AUTH_CONFIG_RETIRED=true');
  console.log('STUDIO_REMOTE_PUBLICATION_BOOTSTRAP_REQUEST_ONLY_ENVELOPE=true');
  console.log('STUDIO_REMOTE_PUBLICATION_BOOTSTRAP_REAL_NETWORK=false');
  process.exitCode = failed === 0 ? 0 : 1;
}
finish();
