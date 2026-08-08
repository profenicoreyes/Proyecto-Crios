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

load('js/studio/publication/studio-activation-controller.js');

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

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function reference(publicationId, version) {
  return Object.freeze({
    campaignId: 'camp-1',
    publicationId,
    version,
    contentHash: String(version).repeat(64).slice(0, 64),
    activatedAt: '2026-08-08T12:00:00.000Z'
  });
}

function activationRecord(id, previousPublicationId, nextPublicationId, action) {
  return Object.freeze({
    activationId: id,
    action,
    campaignId: 'camp-1',
    previousPublicationId: previousPublicationId || null,
    nextPublicationId: nextPublicationId || null,
    occurredAt: '2026-08-08T12:00:00.000Z'
  });
}

function result(success, changed, ref, record, error) {
  return Object.freeze({
    success,
    changed,
    reference: ref || null,
    publication: null,
    record: record || null,
    error: error || null
  });
}

function makeService(options) {
  const opts = options || {};
  const calls = {
    activate: 0,
    deactivate: 0,
    rollback: 0,
    getActive: 0,
    resolve: 0,
    listHistory: 0
  };
  let active = opts.initialReference || null;
  let history = (opts.initialHistory || []).slice();

  const service = Object.freeze({
    async activatePublication(campaignId, publicationId, callOptions) {
      calls.activate += 1;
      equal(campaignId, 'camp-1', 'activate campaignId forwarded');
      check(Boolean(publicationId), 'activate publicationId forwarded');
      if (opts.activateDeferred) {
        const value = await opts.activateDeferred.promise;
        active = value.reference || null;
        if (value.record) history.push(value.record);
        return value;
      }
      const next = reference(publicationId, publicationId === 'pub-1' ? 1 : 2);
      const value = result(true, true, next, activationRecord('a-' + calls.activate, active && active.publicationId, publicationId, 'ACTIVATE'), null);
      active = next;
      history.push(value.record);
      return value;
    },
    deactivatePublication(campaignId, callOptions) {
      calls.deactivate += 1;
      equal(campaignId, 'camp-1', 'deactivate campaignId forwarded');
      if (opts.deactivateDeferred) {
        return opts.deactivateDeferred.promise.then(value => {
          active = value.reference || null;
          if (value.record) history.push(value.record);
          return value;
        });
      }
      const value = result(true, Boolean(active), null, active ? activationRecord('d-' + calls.deactivate, active.publicationId, null, 'DEACTIVATE') : null, null);
      active = null;
      if (value.record) history.push(value.record);
      return value;
    },
    async rollbackPublication(campaignId, publicationId, callOptions) {
      calls.rollback += 1;
      equal(campaignId, 'camp-1', 'rollback campaignId forwarded');
      if (opts.rollbackDeferred) {
        const value = await opts.rollbackDeferred.promise;
        active = value.reference || null;
        if (value.record) history.push(value.record);
        return value;
      }
      const next = reference(publicationId, 1);
      const value = result(true, true, next, activationRecord('r-' + calls.rollback, active && active.publicationId, publicationId, 'ACTIVATE'), null);
      active = next;
      history.push(value.record);
      return value;
    },
    getActiveReference(campaignId) {
      calls.getActive += 1;
      return campaignId === 'camp-1' ? active : null;
    },
    resolveActivePublication(campaignId) {
      calls.resolve += 1;
      return Promise.resolve(active
        ? result(true, false, active, null, null)
        : result(false, false, null, null, Object.freeze({ code: 'NO_ACTIVE_PUBLICATION', message: 'No active publication.', metadata: null })));
    },
    listHistory(campaignId) {
      calls.listHistory += 1;
      return campaignId === 'camp-1' ? Object.freeze(history.slice()) : Object.freeze([]);
    }
  });

  return { service, calls, getActive: () => active, getHistory: () => history.slice() };
}

function createDependencies(localHarness) {
  const counters = { createLocalService: 0, stateChanges: 0 };
  const publicationApi = Object.freeze({
    getPublication(id) { return Object.freeze({ campaignId: 'camp-1', publicationId: id, version: id === 'pub-1' ? 1 : 2, contentHash: 'a'.repeat(64) }); },
    listPublications() { return Object.freeze([]); }
  });
  const core = Object.freeze({
    buildCanonicalContent(value) { return JSON.stringify(value); },
    calculateContentHash() { return 'a'.repeat(64); }
  });
  const activationApi = Object.freeze({
    createActivationService(options) {
      counters.createLocalService += 1;
      check(typeof options.publicationReader === 'function', 'local publicationReader preserved');
      check(typeof options.publicationLister === 'function', 'local publicationLister preserved');
      check(typeof options.canonicalizer === 'function', 'local canonicalizer preserved');
      check(typeof options.hashCalculator === 'function', 'local hashCalculator preserved');
      return localHarness.service;
    }
  });
  return { counters, publicationApi, core, activationApi };
}

async function main() {
  const api = global.CRIOS_STUDIO_ACTIVATION_CONTROLLER;

  check(Boolean(api), 'activation controller API exists');
  check(Object.isFrozen(api), 'activation controller API frozen');
  check(typeof api.createStudioActivationController === 'function', 'activation controller factory exists');
  equal(api.status.IDLE, 'IDLE', 'IDLE status preserved');
  equal(api.status.DEACTIVATING, 'DEACTIVATING', 'DEACTIVATING status preserved');
  equal(api.status.ERROR, 'ERROR', 'ERROR status preserved');

  // Default path: no activationService own-property must preserve local construction.
  const localHarness = makeService({ initialReference: reference('pub-2', 2) });
  const localDeps = createDependencies(localHarness);
  const localStore = Object.freeze({ kind: 'persistent-activation-cache' });
  const localController = api.createStudioActivationController({
    publicationApi: localDeps.publicationApi,
    activationApi: localDeps.activationApi,
    core: localDeps.core,
    activationStore: localStore,
    onStateChange() { localDeps.counters.stateChanges += 1; }
  });

  check(Object.isFrozen(localController), 'default controller frozen');
  equal(localDeps.counters.createLocalService, 1, 'default path constructs local activation service exactly once');
  localController.setCurrentCampaign('camp-1');
  equal(localController.getState().status, 'ACTIVE', 'default path sees existing active reference');
  equal(localController.getActiveReference('camp-1').publicationId, 'pub-2', 'default getActiveReference delegated');

  const localDeactivationPromise = localController.deactivatePublication('camp-1', { requestId: 'local-deactivate' });
  check(localDeactivationPromise && typeof localDeactivationPromise.then === 'function', 'deactivatePublication always exposes async promise boundary');
  const localDeactivated = await localDeactivationPromise;
  check(localDeactivated.success === true, 'sync local deactivation result remains supported');
  equal(localHarness.calls.deactivate, 1, 'local deactivation service called once');
  equal(localController.getState().status, 'INACTIVE', 'local deactivation finishes INACTIVE');
  equal(localController.getState().busy, false, 'local deactivation clears busy');
  check(localController.getState().activeReference === null, 'local deactivation clears active reference');
  check(localDeps.counters.stateChanges >= 2, 'default path emits begin and finish state changes');

  // Explicit injected service bypasses local factory.
  const injectedHarness = makeService({ initialReference: reference('pub-2', 2) });
  const injectedDeps = createDependencies(makeService({}));
  const injectedController = api.createStudioActivationController({
    publicationApi: injectedDeps.publicationApi,
    activationApi: injectedDeps.activationApi,
    core: injectedDeps.core,
    activationStore: localStore,
    activationService: injectedHarness.service,
    onStateChange() { injectedDeps.counters.stateChanges += 1; }
  });

  equal(injectedDeps.counters.createLocalService, 0, 'valid injected service bypasses local factory');
  injectedController.setCurrentCampaign('camp-1');
  equal(injectedController.getState().status, 'ACTIVE', 'injected service state visible');
  equal(injectedController.getState().activeReference.publicationId, 'pub-2', 'injected reference preserved');

  const injectedActivated = await injectedController.activatePublication('camp-1', 'pub-1', { requestId: 'remote-activate' });
  check(injectedActivated.success === true, 'injected activate succeeds');
  equal(injectedHarness.calls.activate, 1, 'injected activate called once');
  equal(injectedController.getState().status, 'ACTIVE', 'injected activate finishes ACTIVE');
  equal(injectedController.getState().activeReference.publicationId, 'pub-1', 'injected authoritative reference refreshed');
  check(Object.isFrozen(injectedActivated), 'injected activation result defensively frozen');
  check(Object.isFrozen(injectedController.getState()), 'controller state defensively frozen');

  // Async deactivation: controller must remain busy until remote promise settles.
  const deactivationDeferred = deferred();
  const asyncDeactivationHarness = makeService({
    initialReference: reference('pub-2', 2),
    deactivateDeferred: deactivationDeferred
  });
  const asyncDeps = createDependencies(makeService({}));
  const asyncController = api.createStudioActivationController({
    publicationApi: asyncDeps.publicationApi,
    activationApi: asyncDeps.activationApi,
    core: asyncDeps.core,
    activationService: asyncDeactivationHarness.service
  });
  asyncController.setCurrentCampaign('camp-1');

  const pendingDeactivation = asyncController.deactivatePublication('camp-1', { requestId: 'remote-deactivate' });
  check(pendingDeactivation && typeof pendingDeactivation.then === 'function', 'remote deactivation returns promise');
  equal(asyncController.getState().status, 'DEACTIVATING', 'pending remote deactivation remains DEACTIVATING');
  equal(asyncController.getState().busy, true, 'pending remote deactivation remains busy');
  equal(asyncController.getState().activeReference.publicationId, 'pub-2', 'pending deactivation preserves current reference');
  equal(asyncDeactivationHarness.calls.deactivate, 1, 'remote deactivation service called once');

  const deactivationRecord = activationRecord('remote-d-1', 'pub-2', null, 'DEACTIVATE');
  deactivationDeferred.resolve(result(true, true, null, deactivationRecord, null));
  const asyncDeactivated = await pendingDeactivation;
  check(asyncDeactivated.success === true, 'remote deactivation result succeeds');
  equal(asyncController.getState().status, 'INACTIVE', 'remote deactivation finishes INACTIVE');
  equal(asyncController.getState().busy, false, 'remote deactivation clears busy only after settlement');
  check(asyncController.getState().activeReference === null, 'remote deactivation clears reference after settlement');
  equal(asyncController.listHistory('camp-1').length, 1, 'remote deactivation history refreshed after settlement');

  // Busy guard must prevent a second operation while async activation is in flight.
  const activationDeferred = deferred();
  const busyHarness = makeService({ activateDeferred: activationDeferred });
  const busyDeps = createDependencies(makeService({}));
  const busyController = api.createStudioActivationController({
    publicationApi: busyDeps.publicationApi,
    activationApi: busyDeps.activationApi,
    core: busyDeps.core,
    activationService: busyHarness.service
  });

  const pendingActivation = busyController.activatePublication('camp-1', 'pub-2', { requestId: 'pending-activate' });
  equal(busyController.getState().status, 'ACTIVATING', 'pending activation enters ACTIVATING');
  equal(busyController.getState().busy, true, 'pending activation sets busy');

  const blockedDeactivation = await busyController.deactivatePublication('camp-1');
  check(blockedDeactivation.success === false, 'concurrent deactivation blocked');
  equal(blockedDeactivation.error.code, 'ACTIVATION_CONFLICT', 'concurrent operation reports conflict');
  equal(busyHarness.calls.deactivate, 0, 'blocked operation never reaches service');
  equal(busyController.getState().status, 'ACTIVATING', 'blocked operation does not disturb pending state');
  equal(busyController.getState().busy, true, 'blocked operation leaves busy true');

  const activatedRef = reference('pub-2', 2);
  activationDeferred.resolve(result(true, true, activatedRef, activationRecord('remote-a-1', null, 'pub-2', 'ACTIVATE'), null));
  const completedActivation = await pendingActivation;
  check(completedActivation.success === true, 'pending activation eventually succeeds');
  equal(busyController.getState().status, 'ACTIVE', 'completed activation enters ACTIVE');
  equal(busyController.getState().busy, false, 'completed activation clears busy');

  // Rollback remains async and delegates to injected service.
  const rollbackDeferred = deferred();
  const rollbackHarness = makeService({
    initialReference: reference('pub-2', 2),
    initialHistory: [activationRecord('old-a', null, 'pub-1', 'ACTIVATE')],
    rollbackDeferred
  });
  const rollbackDeps = createDependencies(makeService({}));
  const rollbackController = api.createStudioActivationController({
    publicationApi: rollbackDeps.publicationApi,
    activationApi: rollbackDeps.activationApi,
    core: rollbackDeps.core,
    activationService: rollbackHarness.service
  });
  rollbackController.setCurrentCampaign('camp-1');
  check(rollbackController.canRollback(Object.freeze({ campaignId: 'camp-1', publicationId: 'pub-1', version: 1 })), 'canRollback uses injected history');
  const pendingRollback = rollbackController.rollbackPublication('camp-1', 'pub-1', { requestId: 'remote-rollback' });
  equal(rollbackController.getState().status, 'ROLLING_BACK', 'pending rollback enters ROLLING_BACK');
  equal(rollbackController.getState().busy, true, 'pending rollback sets busy');
  const rollbackRef = reference('pub-1', 1);
  rollbackDeferred.resolve(result(true, true, rollbackRef, activationRecord('remote-r-1', 'pub-2', 'pub-1', 'ACTIVATE'), null));
  const rolledBack = await pendingRollback;
  check(rolledBack.success === true, 'remote rollback succeeds');
  equal(rollbackHarness.calls.rollback, 1, 'rollback delegated once');
  equal(rollbackController.getState().activeReference.publicationId, 'pub-1', 'rollback refreshes authoritative reference');
  equal(rollbackController.getState().status, 'ACTIVE', 'rollback finishes ACTIVE');

  // Explicit invalid injection must fail closed and never construct local service.
  const nullLocalHarness = makeService({});
  const nullDeps = createDependencies(nullLocalHarness);
  const nullController = api.createStudioActivationController({
    publicationApi: nullDeps.publicationApi,
    activationApi: nullDeps.activationApi,
    core: nullDeps.core,
    activationService: null
  });
  equal(nullDeps.counters.createLocalService, 0, 'explicit null activation service does not silently fall back local');
  const unavailableActivate = await nullController.activatePublication('camp-1', 'pub-1');
  check(unavailableActivate.success === false, 'explicit null service blocks activation');
  equal(unavailableActivate.error.code, 'ACTIVATION_SERVICE_UNAVAILABLE', 'explicit null service returns controlled unavailable error');
  equal(nullLocalHarness.calls.activate, 0, 'explicit null service never reaches local activation');
  equal(nullController.getState().status, 'ERROR', 'explicit null service moves controller to ERROR');
  equal(nullController.getState().busy, false, 'explicit null service is not left busy');
  check(nullController.getActiveReference('camp-1') === null, 'unavailable getActiveReference fails closed');
  equal(nullController.listHistory('camp-1').length, 0, 'unavailable history fails closed empty');
  check(nullController.canRollback(Object.freeze({ campaignId: 'camp-1', publicationId: 'pub-1', version: 1 })) === false, 'unavailable canRollback fails closed');
  const unavailableResolve = await Promise.resolve(nullController.resolveActivePublication('camp-1'));
  check(unavailableResolve.success === false, 'unavailable resolve fails closed');
  equal(unavailableResolve.error.code, 'ACTIVATION_SERVICE_UNAVAILABLE', 'unavailable resolve error code controlled');
  check(Object.isFrozen(unavailableResolve), 'unavailable resolve result frozen');

  const invalidLocalHarness = makeService({});
  const invalidDeps = createDependencies(invalidLocalHarness);
  const invalidController = api.createStudioActivationController({
    publicationApi: invalidDeps.publicationApi,
    activationApi: invalidDeps.activationApi,
    core: invalidDeps.core,
    activationService: Object.freeze({ activatePublication: async function(){} })
  });
  equal(invalidDeps.counters.createLocalService, 0, 'invalid explicit service does not silently fall back local');
  const invalidDeactivate = await invalidController.deactivatePublication('camp-1');
  check(invalidDeactivate.success === false, 'invalid explicit service blocks deactivation');
  equal(invalidDeactivate.error.code, 'ACTIVATION_SERVICE_UNAVAILABLE', 'invalid service error code controlled');
  equal(invalidLocalHarness.calls.deactivate, 0, 'invalid explicit service never reaches local deactivation');

  // Omitting injection entirely must still use local path even when value would otherwise be undefined.
  const omittedHarness = makeService({});
  const omittedDeps = createDependencies(omittedHarness);
  const omittedController = api.createStudioActivationController({
    publicationApi: omittedDeps.publicationApi,
    activationApi: omittedDeps.activationApi,
    core: omittedDeps.core
  });
  equal(omittedDeps.counters.createLocalService, 1, 'omitted activationService property preserves local path');
  const omittedActivated = await omittedController.activatePublication('camp-1', 'pub-1');
  check(omittedActivated.success === true, 'omitted injection local activation works');
  equal(omittedHarness.calls.activate, 1, 'omitted injection reaches local service');

  // Explicit undefined is still explicit and therefore must fail closed.
  const undefinedHarness = makeService({});
  const undefinedDeps = createDependencies(undefinedHarness);
  const undefinedController = api.createStudioActivationController({
    publicationApi: undefinedDeps.publicationApi,
    activationApi: undefinedDeps.activationApi,
    core: undefinedDeps.core,
    activationService: undefined
  });
  equal(undefinedDeps.counters.createLocalService, 0, 'explicit undefined injection does not fall back local');
  const undefinedResult = await undefinedController.activatePublication('camp-1', 'pub-1');
  equal(undefinedResult.error.code, 'ACTIVATION_SERVICE_UNAVAILABLE', 'explicit undefined injection fails closed');

  const source = fs.readFileSync(path.join(repo, 'js/studio/publication/studio-activation-controller.js'), 'utf8');
  check(source.indexOf('fetch(') === -1, 'controller seam contains no fetch');
  check(source.indexOf('XMLHttpRequest') === -1, 'controller seam contains no XMLHttpRequest');
  check(source.indexOf('localStorage') === -1, 'controller seam contains no localStorage');
  check(source.indexOf('writeToken') === -1, 'controller seam contains no write token');
  check(source.indexOf('CRIOS_STUDIO_REMOTE_ACTIVATION_SERVICE') === -1, 'controller seam has no direct remote module coupling');
  check(source.indexOf('CRIOS_STUDIO_REMOTE_PUBLICATION_CONFIG') === -1, 'controller seam has no remote config coupling');
  check(source.indexOf('async function deactivatePublication') >= 0, 'deactivation boundary is explicitly async');
  check(source.indexOf("hasOwnProperty.call(opts, 'activationService')") >= 0, 'explicit activation service own-property detection present');

  console.log('STUDIO_ACTIVATION_SERVICE_INJECTION_TEST_STATUS=' + (failed === 0 ? 'PASS' : 'FAIL'));
  console.log('STUDIO_ACTIVATION_SERVICE_INJECTION_TEST_TOTAL=' + total);
  console.log('STUDIO_ACTIVATION_SERVICE_INJECTION_TEST_FAILED=' + failed);
  console.log('STUDIO_ACTIVATION_SERVICE_INJECTION_LOCAL_FALLBACK_PRESERVED=true');
  console.log('STUDIO_ACTIVATION_SERVICE_INJECTION_SUPPORTED=true');
  console.log('STUDIO_ACTIVATION_SERVICE_INJECTION_EXPLICIT_FAILURE_FAILS_CLOSED=true');
  console.log('STUDIO_ACTIVATION_DEACTIVATION_ASYNC_BOUNDARY=true');
  console.log('STUDIO_ACTIVATION_SYNC_LOCAL_DEACTIVATION_COMPATIBLE=true');
  console.log('STUDIO_ACTIVATION_PENDING_BUSY_GUARD=true');
  console.log('STUDIO_ACTIVATION_SERVICE_INJECTION_REAL_NETWORK=false');
  process.exitCode = failed === 0 ? 0 : 1;
}

main().catch(error => {
  console.error(error && error.stack || error);
  console.log('STUDIO_ACTIVATION_SERVICE_INJECTION_TEST_STATUS=FAIL');
  console.log('STUDIO_ACTIVATION_SERVICE_INJECTION_TEST_TOTAL=' + total);
  console.log('STUDIO_ACTIVATION_SERVICE_INJECTION_TEST_FAILED=' + (failed + 1));
  process.exitCode = 1;
});
