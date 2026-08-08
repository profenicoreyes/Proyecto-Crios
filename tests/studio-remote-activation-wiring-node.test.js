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

load('js/publication/activation/activation-model.js');
load('js/publication/activation/activation-store.js');
load('js/publication/activation/activation-service.js');
load('js/publication/activation/activation-api.js');
load('js/publication/remote/remote-publication-contract.js');
load('js/publication/remote/remote-publication-client.js');
load('js/studio/publication/studio-remote-publication-service.js');
load('js/studio/publication/studio-remote-publication-bootstrap.js');
load('js/studio/publication/studio-remote-activation-service.js');

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

function publicationService() {
  return Object.freeze({
    publishCampaign: async function(){ return null; },
    listPublications: function(){ return Object.freeze([]); },
    getPublication: function(){ return null; },
    getRecord: function(){ return null; }
  });
}

const bootstrapApi = global.CRIOS_STUDIO_REMOTE_PUBLICATION_BOOTSTRAP;
const activationApi = global.CRIOS_PUBLICATION_ACTIVATION;
const remoteActivationFactory = global.CRIOS_STUDIO_REMOTE_ACTIVATION_SERVICE;

check(Boolean(bootstrapApi), 'remote publication bootstrap exists');
check(Boolean(activationApi), 'activation API exists');
check(Boolean(remoteActivationFactory), 'remote activation service factory exists');

{
  const fakeClient = Object.freeze({ marker: 'shared-client' });
  let serviceClient = null;
  let providerCalls = 0;
  const selected = bootstrapApi.createServiceSelection({
    config: {
      endpoint: 'https://example.invalid/c3',
      writeTokenProvider: function(){ providerCalls += 1; return 'runtime-only'; }
    },
    core: Object.freeze({ marker: 'core' }),
    store: Object.freeze({ marker: 'store' }),
    contract: Object.freeze({ marker: 'contract' }),
    clientFactory: Object.freeze({
      createClient: function(){ return fakeClient; }
    }),
    serviceFactory: Object.freeze({
      createRemotePublicationService: function(options){
        serviceClient = options.remoteClient;
        return publicationService();
      }
    })
  });

  equal(selected.configured, true, 'valid remote config remains configured');
  check(Boolean(selected.service), 'valid remote config exposes publication service');
  equal(selected.client, fakeClient, 'selection exposes exact created remote client');
  equal(serviceClient, fakeClient, 'publication service receives exact same remote client');
  equal(selected.error, null, 'valid remote config has no selection error');
  equal(providerCalls, 0, 'selection does not read teacher credential');
  check(Object.isFrozen(selected), 'selection remains frozen after client exposure');
}

{
  delete global.CRIOS_STUDIO_REMOTE_PUBLICATION_CONFIG;
  const selected = bootstrapApi.createServiceSelection({});
  equal(selected.configured, false, 'missing config preserves local path');
  equal(selected.service, null, 'missing config exposes no remote publication service');
  equal(selected.client, null, 'missing config exposes no remote client');
  equal(selected.error, null, 'missing config remains non-error');
}

{
  const selected = bootstrapApi.createServiceSelection({ config: { endpoint: ' ' } });
  equal(selected.configured, true, 'invalid explicit config remains explicit remote mode');
  equal(selected.service, null, 'invalid explicit config exposes no publication service');
  equal(selected.client, null, 'invalid explicit config exposes no client');
  equal(selected.error && selected.error.code, 'REMOTE_PUBLICATION_ENDPOINT_REQUIRED', 'invalid explicit config fails closed');
}

{
  const selected = bootstrapApi.createServiceSelection({
    config: { endpoint: 'https://example.invalid/c3' },
    core: Object.freeze({ marker: 'core' }),
    contract: Object.freeze({ marker: 'contract' }),
    clientFactory: Object.freeze({ createClient: function(){ return Object.freeze({ marker: 'client-before-service-failure' }); } }),
    serviceFactory: Object.freeze({ createRemotePublicationService: function(){ throw new Error('service failed'); } })
  });
  equal(selected.configured, true, 'publication service construction failure remains explicit remote mode');
  equal(selected.service, null, 'publication service failure exposes no service');
  equal(selected.client, null, 'publication service failure does not leak a partially composed client');
  equal(selected.error && selected.error.code, 'REMOTE_PUBLICATION_SERVICE_CREATE_FAILED', 'publication service failure is explicit');
}

const html = fs.readFileSync(path.join(repo, 'studio/index.html'), 'utf8');
const studioSource = fs.readFileSync(path.join(repo, 'js/studio/studio.js'), 'utf8');
const bootstrapSource = fs.readFileSync(path.join(repo, 'js/studio/publication/studio-remote-publication-bootstrap.js'), 'utf8');

const orderedScripts = [
  '../js/publication/remote/remote-publication-contract.js',
  '../js/publication/remote/remote-publication-client.js',
  '../js/studio/publication/studio-remote-publication-service.js',
  '../js/studio/publication/studio-remote-publication-bootstrap.js',
  '../js/publication/activation/activation-api.js',
  '../js/studio/publication/studio-remote-activation-service.js',
  '../js/studio/publication/studio-activation-controller.js',
  '../js/studio/studio.js'
].map(function(src){ return html.indexOf(src); });

check(orderedScripts.every(function(index){ return index >= 0; }), 'Studio loads every remote activation composition dependency');
check(orderedScripts.every(function(index, i){ return i === 0 || index > orderedScripts[i - 1]; }), 'Studio remote activation script order is dependency-safe');
check(studioSource.includes('var remoteActivationServiceFactory = window.CRIOS_STUDIO_REMOTE_ACTIVATION_SERVICE;'), 'Studio reads remote activation factory during composition');
check(studioSource.includes('remotePublicationSelection.client'), 'Studio consumes client exposed by remote publication selection');
check(studioSource.includes('remoteActivationServiceFactory.createRemoteActivationService'), 'Studio composes remote activation service through factory');
check(studioSource.includes('activationApi: activationApi'), 'Studio passes activation API to remote activation service');
check(studioSource.includes('publicationApi: studioPublicationApi'), 'Studio passes Studio publication API to remote activation service');
check(studioSource.includes('remoteClient: remotePublicationSelection.client'), 'Studio passes exact selected client to remote activation service');
check(studioSource.includes('store: activationStore || undefined'), 'Studio passes activation persistence only as optional cache');
check(studioSource.includes('activationControllerOptions.activationService = remoteActivationService'), 'Studio injects remote activation service through controller seam');
check(studioSource.includes('if (remotePublicationSelection && remotePublicationSelection.configured)'), 'activation injection only occurs for explicit remote configuration');
check(studioSource.includes('remotePublicationSelection.service &&'), 'activation wiring requires successful remote publication composition');
check(studioSource.includes('studioPublicationController &&'), 'activation wiring requires successful Studio publication controller composition');
check(studioSource.includes('client: null'), 'bootstrap-unavailable explicit config has no client and fails closed');
check(studioSource.includes('remoteActivationService = null;'), 'remote activation composition has explicit fail-closed null state');
check(studioSource.includes('studioActivationController.deactivatePublication(campaignId).then(function(){'), 'Studio waits for asynchronous deactivation completion');
check(studioSource.includes('delete window.CRIOS_STUDIO_REMOTE_ACTIVATION_SERVICE'), 'Studio removes remote activation factory global after composition');
check(bootstrapSource.includes('client: client || null'), 'bootstrap selection exposes client explicitly');
check(bootstrapSource.includes('return selection(true, service, client, null);'), 'bootstrap returns client only with fully composed publication service');
check(!studioSource.includes('script.google.com/macros/s/'), 'Studio remote activation wiring embeds no production endpoint');
check(!bootstrapSource.includes('script.google.com/macros/s/'), 'bootstrap embeds no production endpoint');
check(!studioSource.includes('teacher-secret'), 'Studio remote activation wiring embeds no teacher secret');
check(!bootstrapSource.includes('teacher-secret'), 'bootstrap embeds no teacher secret');
check(!studioSource.includes('writeToken:'), 'Studio does not construct a literal write token');
check(!studioSource.includes('fetch('), 'Studio composition performs no direct fetch transport');
check(!studioSource.includes('XMLHttpRequest'), 'Studio composition performs no direct XHR transport');

async function runSharedClientActivationIntegration() {
  const publication = Object.freeze({
    campaignId: 'camp-c3',
    publicationId: 'pub-c3',
    version: 3,
    schemaVersion: '2.0',
    contentHash: 'c'.repeat(64),
    content: Object.freeze({ nombre: 'C3' })
  });

  let active = null;
  const history = [];
  const store = Object.freeze({
    getActiveReference: function(){ return active; },
    listHistory: function(){ return Object.freeze(history.slice()); },
    commit: function(reference, record){
      active = reference;
      history.push(record);
      return Object.freeze({ reference, record });
    }
  });

  let activateCalls = 0;
  let deactivateCalls = 0;
  const sharedClient = Object.freeze({
    async activatePublication(campaignId, publicationId, callOptions) {
      activateCalls += 1;
      const reference = Object.freeze({
        campaignId,
        publicationId,
        version: publication.version,
        contentHash: publication.contentHash,
        activatedAt: '2026-08-08T15:00:00.000Z'
      });
      return Object.freeze({
        success: true,
        requestId: callOptions && callOptions.requestId || 'activate-c3',
        data: Object.freeze({
          changed: true,
          reference,
          record: Object.freeze({
            activationId: callOptions && callOptions.requestId || 'activate-c3',
            action: 'ACTIVATE',
            campaignId,
            previousPublicationId: null,
            nextPublicationId: publicationId,
            occurredAt: reference.activatedAt
          })
        }),
        error: null
      });
    },
    async deactivatePublication(campaignId, callOptions) {
      deactivateCalls += 1;
      return Object.freeze({
        success: true,
        requestId: callOptions && callOptions.requestId || 'deactivate-c3',
        data: Object.freeze({
          changed: true,
          reference: null,
          record: Object.freeze({
            activationId: callOptions && callOptions.requestId || 'deactivate-c3',
            action: 'DEACTIVATE',
            campaignId,
            previousPublicationId: publication.publicationId,
            nextPublicationId: null,
            occurredAt: '2026-08-08T15:05:00.000Z'
          })
        }),
        error: null
      });
    },
    async getPublication() {
      throw new Error('not expected in C3 activation/deactivation integration');
    }
  });

  const selected = bootstrapApi.createServiceSelection({
    config: { endpoint: 'https://example.invalid/shared-client' },
    core: Object.freeze({ marker: 'core' }),
    contract: Object.freeze({ marker: 'contract' }),
    clientFactory: Object.freeze({ createClient: function(){ return sharedClient; } }),
    serviceFactory: Object.freeze({ createRemotePublicationService: function(){ return publicationService(); } })
  });

  equal(selected.client, sharedClient, 'fully composed selection exposes shared client for activation wiring');

  const service = remoteActivationFactory.createRemoteActivationService({
    activationApi,
    publicationApi: Object.freeze({ getPublication: function(id){ return id === publication.publicationId ? publication : null; } }),
    remoteClient: selected.client,
    store
  });

  check(Boolean(service), 'real remote activation factory accepts selected shared client');
  check(typeof service.activatePublication === 'function', 'composed remote activation service exposes activate');
  check(typeof service.deactivatePublication === 'function', 'composed remote activation service exposes deactivate');

  const on = await service.activatePublication('camp-c3', 'pub-c3', { requestId: 'c3-on' });
  check(on.success && on.changed, 'selected shared client drives authoritative remote activation');
  equal(on.reference && on.reference.publicationId, 'pub-c3', 'authoritative activation reference preserved');
  equal(on.record && on.record.activationId, 'c3-on', 'authoritative activation record preserved');
  equal(activateCalls, 1, 'activation uses selected client exactly once');
  equal(store.getActiveReference('camp-c3').publicationId, 'pub-c3', 'remote activation may update consistent local cache');

  const off = await service.deactivatePublication('camp-c3', { requestId: 'c3-off' });
  check(off.success && off.changed, 'selected shared client drives authoritative remote deactivation');
  equal(off.reference, null, 'authoritative deactivation clears active reference');
  equal(off.record && off.record.activationId, 'c3-off', 'authoritative deactivation record preserved');
  equal(deactivateCalls, 1, 'deactivation uses selected client exactly once');
  equal(store.getActiveReference('camp-c3'), null, 'consistent local cache follows authoritative deactivation');
}

(async function finish(){
  try {
    await runSharedClientActivationIntegration();
  } catch (error) {
    failed += 1;
    console.error('FAIL=shared client activation integration threw ' + String(error && error.stack || error));
  }

  console.log('STUDIO_REMOTE_ACTIVATION_WIRING_TEST_STATUS=' + (failed === 0 ? 'PASS' : 'FAIL'));
  console.log('STUDIO_REMOTE_ACTIVATION_WIRING_TEST_TOTAL=' + total);
  console.log('STUDIO_REMOTE_ACTIVATION_WIRING_TEST_FAILED=' + failed);
  console.log('STUDIO_REMOTE_ACTIVATION_WIRING_SHARED_CLIENT=true');
  console.log('STUDIO_REMOTE_ACTIVATION_WIRING_EXPLICIT_REMOTE_ONLY=true');
  console.log('STUDIO_REMOTE_ACTIVATION_WIRING_FAILS_CLOSED=true');
  console.log('STUDIO_REMOTE_ACTIVATION_WIRING_ASYNC_DEACTIVATION=true');
  console.log('STUDIO_REMOTE_ACTIVATION_WIRING_LOCAL_CACHE_BEST_EFFORT=true');
  console.log('STUDIO_REMOTE_ACTIVATION_WIRING_REAL_NETWORK=false');

  process.exitCode = failed === 0 ? 0 : 1;
})().catch(function(error){
  failed += 1;
  console.error('FAIL=uncaught ' + String(error && error.stack || error));
  console.log('STUDIO_REMOTE_ACTIVATION_WIRING_TEST_STATUS=FAIL');
  console.log('STUDIO_REMOTE_ACTIVATION_WIRING_TEST_TOTAL=' + total);
  console.log('STUDIO_REMOTE_ACTIVATION_WIRING_TEST_FAILED=' + failed);
  console.log('STUDIO_REMOTE_ACTIVATION_WIRING_REAL_NETWORK=false');
  process.exitCode = 1;
});
