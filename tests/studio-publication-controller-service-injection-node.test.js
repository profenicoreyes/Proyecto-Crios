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

load('js/studio/publication/studio-publication-controller.js');

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

function makeValidation(campaignId) {
  return Object.freeze({
    valid: true,
    issues: Object.freeze([]),
    normalized: Object.freeze({ campaignId: campaignId })
  });
}

function makePublicationResult(id, version) {
  const publication = Object.freeze({
    campaignId: 'campaign-injected',
    publicationId: id,
    version,
    schemaVersion: '2.0',
    contentHash: 'a'.repeat(64),
    content: Object.freeze({ nombre: 'Injected' })
  });
  const record = Object.freeze({
    publicationId: id,
    campaignId: publication.campaignId,
    version,
    schemaVersion: publication.schemaVersion,
    contentHash: publication.contentHash,
    sourceDraftRevision: 'rev-1',
    createdAt: '2026-08-08T00:00:00.000Z',
    status: 'PUBLISHED'
  });
  return Object.freeze({
    success: true,
    publication,
    record,
    validation: makeValidation(publication.campaignId),
    error: null
  });
}

function createHarness() {
  const counters = {
    createStore: 0,
    createLocalService: 0,
    localPublish: 0,
    injectedPublish: 0,
    stateChanges: 0
  };

  const snapshot = {
    id: 'campaign-injected',
    campaignId: 'campaign-injected',
    draftRevision: 'rev-1',
    misiones: [{ id: 'mission-1' }]
  };

  const localResult = makePublicationResult('local-pub-1', 1);
  const injectedResult = makePublicationResult('remote-pub-9', 9);

  const localService = {
    async publishCampaign() {
      counters.localPublish += 1;
      return localResult;
    },
    listPublications() { return Object.freeze([localResult.publication]); },
    getPublication(id) { return id === localResult.publication.publicationId ? localResult.publication : null; },
    getRecord(id) { return id === localResult.record.publicationId ? localResult.record : null; }
  };

  const injectedService = Object.freeze({
    async publishCampaign(draft, options) {
      counters.injectedPublish += 1;
      check(draft === snapshot, 'injected service receives adapter snapshot');
      equal(options.campaignId, 'campaign-injected', 'campaignId forwarded to injected service');
      equal(options.draftRevision, 'rev-1', 'draftRevision forwarded to injected service');
      equal(options.expectedDraftRevision, 'rev-1', 'expectedDraftRevision forwarded to injected service');
      return injectedResult;
    },
    listPublications(campaignId) {
      equal(campaignId, 'campaign-injected', 'list campaignId forwarded to injected service');
      return Object.freeze([injectedResult.publication]);
    },
    getPublication(id) {
      return id === injectedResult.publication.publicationId ? injectedResult.publication : null;
    },
    getRecord(id) {
      return id === injectedResult.record.publicationId ? injectedResult.record : null;
    }
  });

  const core = {
    createInMemoryPublicationStore() {
      counters.createStore += 1;
      return Object.freeze({ kind: 'local-store' });
    },
    createPublicationService() {
      counters.createLocalService += 1;
      return localService;
    },
    validateDraft(draft, options) {
      check(draft === snapshot, 'core validation receives adapter snapshot');
      equal(options.campaignId, 'campaign-injected', 'validation campaignId');
      equal(options.draftRevision, 'rev-1', 'validation draftRevision');
      equal(options.schemaVersion, '2.0', 'validation schemaVersion');
      return makeValidation('campaign-injected');
    },
    createPublicationResult(value) { return Object.freeze(value); }
  };

  const adapter = Object.freeze({
    getCurrentDraftSnapshot() { return snapshot; },
    getCampaignId() { return 'campaign-injected'; },
    readDraftRevision() { return 'rev-1'; }
  });

  return { counters, snapshot, core, adapter, localService, injectedService, localResult, injectedResult };
}

async function main() {
  const api = global.CRIOS_STUDIO_PUBLICATION_CONTROLLER;

  check(Boolean(api), 'controller API exists');
  check(Object.isFrozen(api), 'controller API frozen');
  check(typeof api.createStudioPublicationController === 'function', 'controller factory exists');
  equal(api.status.IDLE, 'IDLE', 'status contract preserved');

  const injected = createHarness();
  const suppliedStore = Object.freeze({ kind: 'persistent-cache' });
  const controller = api.createStudioPublicationController({
    core: injected.core,
    adapter: injected.adapter,
    publicationStore: suppliedStore,
    publicationService: injected.injectedService,
    onStateChange() { injected.counters.stateChanges += 1; }
  });

  check(Object.isFrozen(controller), 'controller frozen with injected service');
  equal(injected.counters.createStore, 0, 'injected service does not allocate local store');
  equal(injected.counters.createLocalService, 0, 'injected service bypasses local publication service factory');

  const validation = await controller.validateCurrentDraft();
  check(validation.ok === true, 'validation still succeeds with injected service');
  equal(controller.getState().status, 'READY', 'validation state remains READY');

  const published = await controller.publishCurrentDraft();
  check(published.success === true, 'publish succeeds through injected service');
  equal(published.publication.publicationId, 'remote-pub-9', 'injected publication identity preserved');
  equal(published.publication.version, 9, 'injected server version preserved');
  equal(injected.counters.injectedPublish, 1, 'injected publish called exactly once');
  equal(injected.counters.localPublish, 0, 'local publish not called when service injected');
  equal(injected.counters.createLocalService, 0, 'local service still not constructed after publish');
  equal(controller.getState().status, 'PUBLISHED', 'controller state becomes PUBLISHED');
  equal(controller.getState().currentCampaignId, 'campaign-injected', 'controller campaign state preserved');
  check(injected.counters.stateChanges >= 4, 'state changes still emitted');

  const listed = controller.listPublications();
  equal(listed.length, 1, 'injected list delegated');
  equal(listed[0].publicationId, 'remote-pub-9', 'injected list result preserved');
  equal(controller.getPublication('remote-pub-9').version, 9, 'getPublication delegated');
  equal(controller.getRecord('remote-pub-9').sourceDraftRevision, 'rev-1', 'getRecord delegated');

  const local = createHarness();
  const localController = api.createStudioPublicationController({
    core: local.core,
    adapter: local.adapter
  });
  equal(local.counters.createStore, 1, 'default path still allocates local store');
  equal(local.counters.createLocalService, 1, 'default path still constructs local service');
  const localPublished = await localController.publishCurrentDraft();
  check(localPublished.success === true, 'default local publish remains functional');
  equal(local.counters.localPublish, 1, 'default local publish called once');
  equal(local.counters.injectedPublish, 0, 'default path does not call injected service');
  equal(localPublished.publication.publicationId, 'local-pub-1', 'default local identity preserved');

  const nullInjected = createHarness();
  const nullController = api.createStudioPublicationController({
    core: nullInjected.core,
    adapter: nullInjected.adapter,
    publicationService: null
  });
  equal(nullInjected.counters.createStore, 0, 'explicit null injection does not allocate local store');
  equal(nullInjected.counters.createLocalService, 0, 'explicit null injection fails closed instead of falling back local');
  const nullResult = await nullController.publishCurrentDraft();
  check(nullResult.success === false, 'explicit null service blocks publish');
  equal(nullResult.error.code, 'PUBLICATION_CORE_UNAVAILABLE', 'explicit null service returns controlled unavailable error');
  equal(nullInjected.counters.localPublish, 0, 'explicit null service never publishes locally');

  const invalidInjected = createHarness();
  const invalidController = api.createStudioPublicationController({
    core: invalidInjected.core,
    adapter: invalidInjected.adapter,
    publicationService: Object.freeze({ publishCampaign: async function(){ return invalidInjected.injectedResult; } })
  });
  equal(invalidInjected.counters.createLocalService, 0, 'invalid explicit service does not silently fall back local');
  const invalidResult = await invalidController.publishCurrentDraft();
  check(invalidResult.success === false, 'invalid explicit service blocks publish');
  equal(invalidInjected.counters.localPublish, 0, 'invalid explicit service never reaches local publish');

  const source = fs.readFileSync(path.join(repo, 'js/studio/publication/studio-publication-controller.js'), 'utf8');
  check(source.indexOf('fetch(') === -1, 'controller injection seam contains no fetch');
  check(source.indexOf('XMLHttpRequest') === -1, 'controller injection seam contains no XMLHttpRequest');
  check(source.indexOf('localStorage') === -1, 'controller injection seam contains no localStorage');
  check(source.indexOf('writeToken') === -1, 'controller injection seam contains no embedded write token');

  console.log('STUDIO_PUBLICATION_SERVICE_INJECTION_TEST_STATUS=' + (failed === 0 ? 'PASS' : 'FAIL'));
  console.log('STUDIO_PUBLICATION_SERVICE_INJECTION_TEST_TOTAL=' + total);
  console.log('STUDIO_PUBLICATION_SERVICE_INJECTION_TEST_FAILED=' + failed);
  console.log('STUDIO_PUBLICATION_SERVICE_INJECTION_LOCAL_FALLBACK_PRESERVED=true');
  console.log('STUDIO_PUBLICATION_SERVICE_INJECTION_EXPLICIT_FAILURE_FAILS_CLOSED=true');
  console.log('STUDIO_PUBLICATION_SERVICE_INJECTION_REAL_NETWORK=false');
  process.exitCode = failed === 0 ? 0 : 1;
}

main().catch(error => {
  console.error(error && error.stack || error);
  console.log('STUDIO_PUBLICATION_SERVICE_INJECTION_TEST_STATUS=FAIL');
  console.log('STUDIO_PUBLICATION_SERVICE_INJECTION_TEST_TOTAL=' + total);
  console.log('STUDIO_PUBLICATION_SERVICE_INJECTION_TEST_FAILED=' + (failed + 1));
  process.exitCode = 1;
});
