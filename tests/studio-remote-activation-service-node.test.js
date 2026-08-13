'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const repo = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(__dirname, '..');
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
  check(actual === expected, message + ' | actual=' + String(actual) + ' expected=' + String(expected));
}

function sameKeys(value, keys) {
  return Boolean(value && JSON.stringify(Object.keys(value).sort()) === JSON.stringify(keys.slice().sort()));
}

const context = {
  console,
  setTimeout,
  clearTimeout
};
context.window = context;
context.global = context;
vm.createContext(context);

function load(relativePath) {
  const source = fs.readFileSync(path.join(repo, relativePath), 'utf8');
  vm.runInContext(source, context, { filename: relativePath });
}

load('js/publication/activation/activation-model.js');
load('js/publication/activation/activation-store.js');
load('js/publication/activation/activation-service.js');
load('js/publication/activation/activation-api.js');
load('js/publication/remote/remote-publication-contract.js');
load('js/publication/remote/remote-publication-client.js');
load('js/studio/publication/studio-remote-activation-service.js');

const activationApi = context.CRIOS_PUBLICATION_ACTIVATION;
const api = context.CRIOS_STUDIO_REMOTE_ACTIVATION_SERVICE;

const serviceActivationApi = Object.freeze({
  isActivationResult(value) {
    return activationApi.isActivationResult(value);
  },
  isActivePublicationReference(value) {
    return Boolean(value && typeof value === 'object' &&
      typeof value.campaignId === 'string' && value.campaignId.trim() &&
      typeof value.publicationId === 'string' && value.publicationId.trim() &&
      Number.isInteger(value.version) && value.version > 0 &&
      typeof value.contentHash === 'string' && value.contentHash.trim() &&
      typeof value.activatedAt === 'string' && value.activatedAt.trim());
  }
});

check(Boolean(api), 'remote activation service API exists');
equal(api.version, '1.0.0', 'remote activation service version');
check(typeof api.createRemoteActivationService === 'function', 'remote activation factory exists');
check(Object.isFrozen(api), 'remote activation API frozen');

const publications = {
  'pub-1': Object.freeze({ campaignId: 'camp-1', publicationId: 'pub-1', version: 1, schemaVersion: '2.0', contentHash: '1'.repeat(64), content: Object.freeze({ value: 1 }) }),
  'pub-2': Object.freeze({ campaignId: 'camp-1', publicationId: 'pub-2', version: 2, schemaVersion: '2.0', contentHash: '2'.repeat(64), content: Object.freeze({ value: 2 }) }),
  'pub-3': Object.freeze({ campaignId: 'camp-1', publicationId: 'pub-3', version: 3, schemaVersion: '2.0', contentHash: '3'.repeat(64), content: Object.freeze({ value: 3 }) }),
  'other-1': Object.freeze({ campaignId: 'camp-2', publicationId: 'other-1', version: 1, schemaVersion: '2.0', contentHash: '4'.repeat(64), content: Object.freeze({ value: 4 }) })
};

const publicationApi = Object.freeze({
  getPublication(publicationId) {
    return publications[publicationId] || null;
  }
});

function reference(publication, activatedAt) {
  return Object.freeze({
    campaignId: publication.campaignId,
    publicationId: publication.publicationId,
    version: publication.version,
    contentHash: publication.contentHash,
    activatedAt: activatedAt || '2026-08-08T12:00:00.000Z'
  });
}

function record(id, action, campaignId, previousId, nextId, occurredAt) {
  return Object.freeze({
    activationId: id,
    action,
    campaignId,
    previousPublicationId: previousId == null ? null : previousId,
    nextPublicationId: nextId == null ? null : nextId,
    occurredAt: occurredAt || '2026-08-08T12:00:00.000Z'
  });
}

function remoteSuccess(requestId, data) {
  return Object.freeze({ success: true, requestId, data: Object.freeze(data), error: null });
}

function remoteFailure(requestId, code, message, retryable) {
  return Object.freeze({
    success: false,
    requestId,
    data: null,
    error: Object.freeze({ code, message: message || code, retryable: Boolean(retryable), metadata: null })
  });
}

function makeRemote(options) {
  const opts = options || {};
  const calls = [];
  let sequence = 0;
  let active = opts.initialActive || null;
  const history = [];

  function nextId(prefix, supplied) {
    if (supplied) return supplied;
    sequence += 1;
    return prefix + '-' + sequence;
  }

  const client = Object.freeze({
    async activatePublication(campaignId, publicationId, callOptions) {
      const requestId = nextId('activate', callOptions && callOptions.requestId);
      calls.push({ operation: 'activate', campaignId, publicationId, callOptions: callOptions || null });
      if (opts.throwActivate) throw new Error(opts.throwActivate);
      if (opts.failActivate) return remoteFailure(requestId, opts.failActivate, 'remote activate denied', false);
      if (opts.activateData) return remoteSuccess(requestId, opts.activateData);
      const publication = publications[publicationId];
      const previous = active ? active.publicationId : null;
      if (!publication) return remoteFailure(requestId, 'PUBLICATION_UNAVAILABLE', 'missing publication', false);
      if (active && active.publicationId === publicationId) {
        return remoteSuccess(requestId, { changed: false, reference: active, record: null });
      }
      active = reference(publication, '2026-08-08T12:0' + String(sequence) + ':00.000Z');
      const activationRecord = record(requestId, 'ACTIVATE', campaignId, previous, publicationId, active.activatedAt);
      history.push(activationRecord);
      return remoteSuccess(requestId, { changed: true, reference: active, record: activationRecord });
    },
    async deactivatePublication(campaignId, callOptions) {
      const requestId = nextId('deactivate', callOptions && callOptions.requestId);
      calls.push({ operation: 'deactivate', campaignId, callOptions: callOptions || null });
      if (opts.throwDeactivate) throw new Error(opts.throwDeactivate);
      if (opts.failDeactivate) return remoteFailure(requestId, opts.failDeactivate, 'remote deactivate denied', false);
      if (opts.deactivateData) return remoteSuccess(requestId, opts.deactivateData);
      if (!active) return remoteSuccess(requestId, { changed: false, reference: null, record: null });
      const previous = active.publicationId;
      active = null;
      const activationRecord = record(requestId, 'DEACTIVATE', campaignId, previous, null, '2026-08-08T12:30:00.000Z');
      history.push(activationRecord);
      return remoteSuccess(requestId, { changed: true, reference: null, record: activationRecord });
    },
    async getPublication(campaignId, publicationId, callOptions) {
      const requestId = nextId('get', callOptions && callOptions.requestId);
      calls.push({ operation: 'get', campaignId, publicationId, callOptions: callOptions || null });
      if (opts.throwGet) throw new Error(opts.throwGet);
      if (opts.failGet) return remoteFailure(requestId, opts.failGet, 'remote read failed', false);
      if (!active || active.campaignId !== campaignId || active.publicationId !== publicationId) {
        return remoteFailure(requestId, 'PUBLICATION_UNAVAILABLE', 'not active', false);
      }
      return remoteSuccess(requestId, { publication: publications[publicationId], activeReference: active });
    }
  });

  return { client, calls, history, get active(){ return active; } };
}

function makeStore(seed) {
  const initial = seed || {};
  const activeByCampaign = Object.assign({}, initial.activeByCampaign || {});
  const historyByCampaign = Object.assign({}, initial.historyByCampaign || {});
  const commits = [];
  return {
    commits,
    getActiveReference(campaignId) {
      return activeByCampaign[campaignId] || null;
    },
    listHistory(campaignId) {
      return Object.freeze((historyByCampaign[campaignId] || []).slice());
    },
    commit(nextReference, nextRecord, options) {
      const current = activeByCampaign[nextRecord.campaignId] || null;
      const currentId = current ? current.publicationId : null;
      if (options && Object.prototype.hasOwnProperty.call(options, 'expectedActivePublicationId') && options.expectedActivePublicationId !== currentId) {
        throw new Error('expected mismatch');
      }
      if (nextRecord.previousPublicationId !== currentId) throw new Error('previous mismatch');
      commits.push({ reference: nextReference, record: nextRecord, options });
      if (nextReference) activeByCampaign[nextRecord.campaignId] = nextReference;
      else delete activeByCampaign[nextRecord.campaignId];
      historyByCampaign[nextRecord.campaignId] = (historyByCampaign[nextRecord.campaignId] || []).concat([nextRecord]);
      return Object.freeze({ reference: nextReference, record: nextRecord });
    }
  };
}

function createService(remote, store, pubApi) {
  return api.createRemoteActivationService({
    activationApi: serviceActivationApi,
    publicationApi: pubApi || publicationApi,
    remoteClient: remote && remote.client,
    store: store || null
  });
}

(async function run(){
  {
    const service = api.createRemoteActivationService({ activationApi: serviceActivationApi, publicationApi, remoteClient: null });
    const r = await service.activatePublication('camp-1', 'pub-1');
    equal(r.success, false, 'missing remote client fails');
    equal(r.error.code, 'REMOTE_ACTIVATION_UNAVAILABLE', 'missing remote client error code');
    check(activationApi.isActivationResult(r), 'unavailable result matches activation contract');
  }

  {
    const remote = makeRemote();
    const service = createService(remote);
    let r = await service.activatePublication('', 'pub-1');
    equal(r.error.code, 'INVALID_CAMPAIGN_ID', 'blank campaign rejected');
    equal(remote.calls.length, 0, 'blank campaign performs no remote call');
    r = await service.activatePublication('camp-1', '');
    equal(r.error.code, 'INVALID_PUBLICATION_ID', 'blank publication rejected');
    equal(remote.calls.length, 0, 'blank publication performs no remote call');
  }

  {
    const remote = makeRemote();
    const store = makeStore();
    const service = createService(remote, store);
    const r = await service.activatePublication('camp-1', 'pub-1', { requestId: 'req-fixed', expectedActivePublicationId: 'ignored' });
    check(r.success && r.changed, 'remote activation succeeds');
    equal(r.reference.publicationId, 'pub-1', 'remote reference returned');
    equal(r.publication.publicationId, 'pub-1', 'matching local publication attached');
    equal(r.record.activationId, 'req-fixed', 'server activation id preserved');
    equal(remote.calls.length, 1, 'one remote activation call');
    equal(remote.calls[0].callOptions.requestId, 'req-fixed', 'requestId forwarded');
    check(!Object.prototype.hasOwnProperty.call(remote.calls[0].callOptions, 'expectedActivePublicationId'), 'unsupported optimistic option not forwarded');
    equal(service.getActiveReference('camp-1').publicationId, 'pub-1', 'authoritative reference stored in service state');
    equal(service.listHistory('camp-1').length, 1, 'remote record appended to service history');
    equal(store.commits.length, 1, 'consistent local cache receives remote activation');
    equal(store.commits[0].record.activationId, 'req-fixed', 'cache preserves server activation id');
    check(Object.isFrozen(r), 'activation result frozen');
    check(Object.isFrozen(r.reference), 'activation reference frozen');
    check(Object.isFrozen(r.record), 'activation record frozen');
    check(activationApi.isActivationResult(r), 'remote activation result matches domain contract');
  }

  {
    const remote = makeRemote();
    const service = createService(remote);
    const first = await service.activatePublication('camp-1', 'pub-1');
    const second = await service.activatePublication('camp-1', 'pub-1');
    check(first.changed, 'first activation changes state');
    equal(second.success, true, 'idempotent activation succeeds');
    equal(second.changed, false, 'idempotent activation reports unchanged');
    equal(second.record, null, 'idempotent activation has no record');
    equal(service.listHistory('camp-1').length, 1, 'idempotent activation does not duplicate history');
  }

  {
    const remote = makeRemote({ failActivate: 'WRITE_UNAUTHORIZED' });
    const service = createService(remote);
    const r = await service.activatePublication('camp-1', 'pub-1', { requestId: 'denied-1' });
    equal(r.success, false, 'remote activation failure preserved');
    equal(r.error.code, 'WRITE_UNAUTHORIZED', 'remote failure code preserved');
    equal(r.error.metadata.requestId, 'denied-1', 'remote failure request id preserved');
    equal(service.getActiveReference('camp-1'), null, 'failed activation does not alter state');
  }

  {
    const remote = makeRemote({ throwActivate: 'transport down' });
    const service = createService(remote);
    const r = await service.activatePublication('camp-1', 'pub-1');
    equal(r.error.code, 'REMOTE_TRANSPORT_FAILED', 'thrown activation maps to transport failure');
    check(r.error.message.includes('transport down'), 'transport failure message preserved');
  }

  {
    const remote = makeRemote({ activateData: { changed: true, reference: reference(publications['pub-2']), record: record('bad-campaign', 'ACTIVATE', 'camp-1', null, 'pub-2') } });
    const service = createService(remote);
    const r = await service.activatePublication('camp-1', 'pub-1');
    equal(r.error.code, 'REMOTE_RESPONSE_INVALID', 'mismatched activation identity rejected');
    equal(service.getActiveReference('camp-1'), null, 'invalid response does not alter state');
  }

  {
    const stale = reference(publications['pub-2'], '2026-08-08T10:00:00.000Z');
    const store = makeStore({ activeByCampaign: { 'camp-1': stale } });
    const remote = makeRemote();
    const service = createService(remote, store);
    equal(service.getActiveReference('camp-1').publicationId, 'pub-2', 'service seeds local cached reference');
    const r = await service.activatePublication('camp-1', 'pub-1');
    check(r.success, 'remote authority succeeds despite stale cache');
    equal(r.reference.publicationId, 'pub-1', 'remote authority replaces in-memory stale reference');
    equal(store.commits.length, 0, 'stale cache is not force-mutated on previous-id mismatch');
    equal(service.getActiveReference('camp-1').publicationId, 'pub-1', 'service state follows server, not stale cache');
  }

  {
    const remote = makeRemote();
    const store = makeStore();
    const service = createService(remote, store);
    await service.activatePublication('camp-1', 'pub-1', { requestId: 'a-1' });
    const r = await service.deactivatePublication('camp-1', { requestId: 'd-1' });
    check(r.success && r.changed, 'remote deactivation succeeds');
    equal(r.reference, null, 'deactivation clears reference');
    equal(r.record.action, 'DEACTIVATE', 'deactivation record action preserved');
    equal(r.record.activationId, 'd-1', 'deactivation server id preserved');
    equal(service.getActiveReference('camp-1'), null, 'service state becomes inactive');
    equal(service.listHistory('camp-1').length, 2, 'deactivation appends history');
    equal(store.commits.length, 2, 'consistent cache receives activation and deactivation');
    check(activationApi.isActivationResult(r), 'deactivation result matches domain contract');
  }

  {
    const remote = makeRemote();
    const service = createService(remote);
    const r = await service.deactivatePublication('camp-1');
    equal(r.success, true, 'deactivation without remote active succeeds');
    equal(r.changed, false, 'deactivation without active is idempotent');
    equal(r.record, null, 'idempotent deactivation has no record');
    equal(service.listHistory('camp-1').length, 0, 'idempotent deactivation does not append history');
  }

  {
    const remote = makeRemote({ failDeactivate: 'WRITE_UNAUTHORIZED' });
    const service = createService(remote);
    const r = await service.deactivatePublication('camp-1');
    equal(r.error.code, 'WRITE_UNAUTHORIZED', 'deactivation remote failure code preserved');
  }

  {
    const remote = makeRemote({ throwDeactivate: 'deactivate transport down' });
    const service = createService(remote);
    const r = await service.deactivatePublication('camp-1');
    equal(r.error.code, 'REMOTE_TRANSPORT_FAILED', 'thrown deactivation maps to transport failure');
  }

  {
    const remote = makeRemote({ deactivateData: { changed: true, reference: reference(publications['pub-1']), record: record('invalid-d', 'DEACTIVATE', 'camp-1', 'pub-1', null) } });
    const service = createService(remote);
    const r = await service.deactivatePublication('camp-1');
    equal(r.error.code, 'REMOTE_RESPONSE_INVALID', 'deactivation with non-null reference rejected');
  }

  {
    const remote = makeRemote();
    const service = createService(remote);
    let r = await service.rollbackPublication('camp-1', 'pub-1');
    equal(r.error.code, 'NO_ACTIVE_PUBLICATION', 'rollback without active rejected locally');
    equal(remote.calls.length, 0, 'rollback without active performs no remote call');

    await service.activatePublication('camp-1', 'pub-1', { requestId: 'rb-a1' });
    await service.activatePublication('camp-1', 'pub-3', { requestId: 'rb-a3' });
    r = await service.rollbackPublication('camp-1', 'pub-1', { requestId: 'rb-back' });
    check(r.success && r.changed, 'rollback uses remote activation successfully');
    equal(r.reference.publicationId, 'pub-1', 'rollback target becomes active');
    equal(r.record.action, 'ACTIVATE', 'remote rollback preserves server ACTIVATE action');
    equal(r.record.activationId, 'rb-back', 'rollback server request id preserved');
    equal(remote.calls[remote.calls.length - 1].operation, 'activate', 'rollback maps to remote activate operation');
    equal(service.listHistory('camp-1').length, 3, 'rollback remote record appended');
  }

  {
    const remote = makeRemote();
    const service = createService(remote);
    await service.activatePublication('camp-1', 'pub-1');
    await service.activatePublication('camp-1', 'pub-3');
    let before = remote.calls.length;
    let r = await service.rollbackPublication('camp-1', 'pub-2');
    equal(r.error.code, 'ROLLBACK_TARGET_INVALID', 'never-active rollback target rejected');
    equal(remote.calls.length, before, 'invalid rollback performs no remote write');
    r = await service.rollbackPublication('camp-1', 'pub-3');
    equal(r.error.code, 'ROLLBACK_TARGET_INVALID', 'same/current rollback target rejected');
  }

  {
    const remote = makeRemote();
    const service = createService(remote);
    await service.activatePublication('camp-1', 'pub-1');
    const r = await service.resolveActivePublication('camp-1');
    check(r.success, 'resolve verifies the observed active reference remotely');
    equal(r.publication.publicationId, 'pub-1', 'resolve returns authoritative active publication');
    equal(remote.calls.filter(function(call){ return call.operation === 'get'; }).length, 1, 'remote-mode resolve always verifies through remote GET');
  }

  {
    const remote = makeRemote();
    const noLocalPublication = Object.freeze({ getPublication: function(){ return null; } });
    const service = createService(remote, null, noLocalPublication);
    await service.activatePublication('camp-1', 'pub-1');
    const r = await service.resolveActivePublication('camp-1', { requestId: 'resolve-1' });
    check(r.success, 'resolve falls back to authoritative remote GET');
    equal(r.publication.publicationId, 'pub-1', 'remote GET publication returned');
    const getCall = remote.calls.find(function(call){ return call.operation === 'get'; });
    equal(getCall.callOptions.requestId, 'resolve-1', 'resolve request id forwarded');
  }

  {
    const seeded = reference(publications['pub-1'], '2026-08-08T09:00:00.000Z');
    const store = makeStore({ activeByCampaign: { 'camp-1': seeded } });
    const remote = makeRemote({ failGet: 'PUBLICATION_UNAVAILABLE' });
    const noLocalPublication = Object.freeze({ getPublication: function(){ return null; } });
    const service = createService(remote, store, noLocalPublication);
    const r = await service.resolveActivePublication('camp-1');
    equal(r.error.code, 'PUBLICATION_UNAVAILABLE', 'remote resolution failure preserved');
    equal(r.reference.publicationId, 'pub-1', 'resolution failure preserves observed cached reference');
  }

  {
    const remote = makeRemote({ throwGet: 'read transport down' });
    const seeded = reference(publications['pub-1']);
    const store = makeStore({ activeByCampaign: { 'camp-1': seeded } });
    const noLocalPublication = Object.freeze({ getPublication: function(){ return null; } });
    const service = createService(remote, store, noLocalPublication);
    const r = await service.resolveActivePublication('camp-1');
    equal(r.error.code, 'REMOTE_TRANSPORT_FAILED', 'thrown resolve GET maps to transport failure');
  }

  {
    const remote = makeRemote();
    const service = createService(remote);
    const r = await service.resolveActivePublication('camp-1');
    equal(r.error.code, 'NO_ACTIVE_PUBLICATION', 'resolve without active rejected');
  }

  {
    const a1 = record('seed-1', 'ACTIVATE', 'camp-1', null, 'pub-1');
    const seeded = reference(publications['pub-1']);
    const store = makeStore({ activeByCampaign: { 'camp-1': seeded }, historyByCampaign: { 'camp-1': [a1] } });
    const remote = makeRemote({ initialActive: seeded });
    const service = createService(remote, store);
    equal(service.getActiveReference('camp-1').publicationId, 'pub-1', 'persistent cache seeds active reference');
    equal(service.listHistory('camp-1').length, 1, 'persistent cache seeds activation history');
    const h1 = service.listHistory('camp-1');
    const h2 = service.listHistory('camp-1');
    check(h1 !== h2, 'history returns defensive arrays');
    check(Object.isFrozen(h1) && Object.isFrozen(h1[0]), 'history defensive copies frozen');
  }

  {
    const remote = makeRemote();
    const badPubApi = Object.freeze({ getPublication: function(){ return publications['pub-2']; } });
    const service = createService(remote, null, badPubApi);
    const r = await service.activatePublication('camp-1', 'pub-1');
    check(r.success, 'server activation remains success despite mismatched local publication cache');
    equal(r.publication, null, 'mismatched local publication is not attached to authoritative result');
    equal(r.reference.publicationId, 'pub-1', 'server reference still authoritative');
  }

  {
    const duplicate = record('dup-1', 'ACTIVATE', 'camp-1', null, 'pub-1');
    const store = makeStore({ historyByCampaign: { 'camp-1': [duplicate] } });
    const remote = makeRemote({ activateData: { changed: true, reference: reference(publications['pub-1']), record: duplicate } });
    const service = createService(remote, store);
    const r = await service.activatePublication('camp-1', 'pub-1');
    check(r.success, 'idempotent server record remains success');
    equal(store.commits.length, 0, 'same server activation id is not committed twice');
    equal(service.listHistory('camp-1').length, 1, 'same activation id not duplicated in service history');
  }

  {
    const remote = makeRemote();
    const service = createService(remote);
    await service.activatePublication('camp-1', 'pub-1');
    await service.activatePublication('camp-2', 'other-1');
    equal(service.getActiveReference('camp-1').publicationId, 'pub-1', 'campaign one state isolated');
    equal(service.getActiveReference('camp-2').publicationId, 'other-1', 'campaign two state isolated');
    equal(service.listHistory('camp-1').length, 1, 'campaign one history isolated');
    equal(service.listHistory('camp-2').length, 1, 'campaign two history isolated');
  }

  {
    const contract = context.CRIOS_REMOTE_PUBLICATION_CONTRACT;
    const clientFactory = context.CRIOS_REMOTE_PUBLICATION_CLIENT;
    const transportCalls = [];
    let tokenReads = 0;

    const realClient = clientFactory.createClient({
      contract,
      endpoint: 'https://example.invalid/remote-activation',
      fetchImpl: async function(url, init){
        transportCalls.push({ url: String(url), init: init || {} });
        throw new Error('retired activation transport must not run');
      },
      writeTokenProvider: function(){ tokenReads += 1; return 'test-teacher-token'; },
      requestIdFactory: function(operation){ return 'real-' + operation + '-1'; },
      timeoutMs: 5000
    });

    equal(typeof realClient.activatePublication, 'undefined', 'real publication client exposes no activate method');
    equal(typeof realClient.deactivatePublication, 'undefined', 'real publication client exposes no deactivate method');

    const store = makeStore();
    const service = api.createRemoteActivationService({
      activationApi: serviceActivationApi,
      publicationApi,
      remoteClient: realClient,
      store
    });

    const on = await service.activatePublication('camp-1', 'pub-1', { requestId: 'retired-activate' });
    equal(on.success, false, 'legacy activation service fails closed with retired real client');
    equal(on.error.code, 'REMOTE_ACTIVATION_UNAVAILABLE', 'retired real client maps activate to unavailable');

    const off = await service.deactivatePublication('camp-1', { requestId: 'retired-deactivate' });
    equal(off.success, false, 'legacy deactivation service fails closed with retired real client');
    equal(off.error.code, 'REMOTE_ACTIVATION_UNAVAILABLE', 'retired real client maps deactivate to unavailable');

    equal(transportCalls.length, 0, 'retired mutable operations perform no real-client transport');
    equal(tokenReads, 0, 'retired mutable operations never request teacher write token');
    equal(store.commits.length, 0, 'retired real-client path writes no activation cache');
  }

  const source = fs.readFileSync(path.join(repo, 'js/studio/publication/studio-remote-activation-service.js'), 'utf8');
  check(!source.includes('script.google.com/macros/s/'), 'service contains no fixed production endpoint');
  check(!source.includes('writeToken'), 'service contains no authorization credential handling');
  check(!source.includes('fetch('), 'service performs transport only through injected remote client');
  check(!source.includes('XMLHttpRequest'), 'service contains no direct XHR transport');
  check(!source.includes('localStorage'), 'service contains no direct localStorage coupling');

  console.log('STUDIO_REMOTE_ACTIVATION_SERVICE_TEST_STATUS=' + (failed === 0 ? 'PASS' : 'FAIL'));
  console.log('STUDIO_REMOTE_ACTIVATION_SERVICE_TEST_TOTAL=' + total);
  console.log('STUDIO_REMOTE_ACTIVATION_SERVICE_TEST_FAILED=' + failed);
  console.log('STUDIO_REMOTE_ACTIVATION_SERVICE_REMOTE_AUTHORITY=LEGACY_FAKE_ONLY');
  console.log('STUDIO_REMOTE_ACTIVATION_SERVICE_LOCAL_CACHE_BEST_EFFORT=true');
  console.log('STUDIO_REMOTE_ACTIVATION_SERVICE_STALE_CACHE_DOES_NOT_OVERRIDE_REMOTE=true');
  console.log('STUDIO_REMOTE_ACTIVATION_SERVICE_REAL_CLIENT_MUTABLE_OPERATIONS=false');
  console.log('STUDIO_REMOTE_ACTIVATION_SERVICE_REAL_CLIENT_FAILS_CLOSED=true');
  console.log('STUDIO_REMOTE_ACTIVATION_SERVICE_REAL_NETWORK=false');
  process.exitCode = failed === 0 ? 0 : 1;
})().catch(function(error){
  failed += 1;
  console.error('FAIL=uncaught ' + String(error && error.stack || error));
  console.log('STUDIO_REMOTE_ACTIVATION_SERVICE_TEST_STATUS=FAIL');
  console.log('STUDIO_REMOTE_ACTIVATION_SERVICE_TEST_TOTAL=' + total);
  console.log('STUDIO_REMOTE_ACTIVATION_SERVICE_TEST_FAILED=' + failed);
  console.log('STUDIO_REMOTE_ACTIVATION_SERVICE_REAL_NETWORK=false');
  process.exitCode = 1;
});
