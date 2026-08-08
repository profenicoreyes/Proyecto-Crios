'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const repo = path.resolve(__dirname, '..');
let total = 0;
let failed = 0;
const failures = [];

function check(condition, name) {
  total += 1;
  if (!condition) {
    failed += 1;
    failures.push(name);
  }
}

function equal(actual, expected, name) {
  check(actual === expected, `${name} | actual=${String(actual)} expected=${String(expected)}`);
}

const context = {
  console,
  setTimeout,
  clearTimeout,
  AbortController,
  TextEncoder,
  URL,
  URLSearchParams,
  performance
};
context.window = context;
context.crypto = { randomUUID: () => 'uuid-fallback' };
vm.createContext(context);

function load(rel) {
  const filename = path.join(repo, rel);
  vm.runInContext(fs.readFileSync(filename, 'utf8'), context, { filename });
}

function vmClone(value) {
  context.__cloneJson = JSON.stringify(value);
  const cloned = vm.runInContext('JSON.parse(__cloneJson)', context);
  delete context.__cloneJson;
  return cloned;
}

load('js/publication/remote/remote-publication-contract.js');
load('js/publication/remote/remote-publication-client.js');

const contract = context.CRIOS_REMOTE_PUBLICATION_CONTRACT;
const api = context.CRIOS_REMOTE_PUBLICATION_CLIENT;

check(Boolean(contract), 'remote contract loads');
check(Boolean(api), 'remote client loads');
equal(api.version, '1.0.0', 'remote client version');
equal(Object.keys(api).sort().join(','), 'createClient,errorCodes,version', 'root API exact');
check(Object.isFrozen(api), 'root API frozen');
check(!fs.readFileSync(path.join(repo, 'js/publication/remote/remote-publication-client.js'), 'utf8').includes('script.google.com/macros/s/'), 'client contains no fixed production endpoint');
check(!fs.readFileSync(path.join(repo, 'js/publication/remote/remote-publication-client.js'), 'utf8').includes('teacher-secret'), 'client contains no write token literal');

let sequence = 0;
let fetchCount = 0;
let throwNext = false;
let invalidJsonNext = false;
let invalidContractNext = false;
let httpStatusNext = 0;
const calls = [];
const versions = new Map();
const publications = new Map();
const active = new Map();
const idempotent = new Map();
const requestBodies = new Map();

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function response(request, success, data, error) {
  return {
    protocolVersion: '1.0',
    operation: request.operation,
    requestId: request.requestId,
    success,
    data: success ? data : null,
    error: success ? null : error
  };
}

function failure(request, code, message, retryable) {
  return response(request, false, null, { code, message, retryable: Boolean(retryable) });
}

function server(request, writeToken) {
  const body = JSON.stringify(request);
  if (request.operation !== 'getPublication' && idempotent.has(request.requestId)) {
    if (requestBodies.get(request.requestId) !== body) {
      return failure(request, 'WRITE_CONFLICT', 'requestId conflict.', false);
    }
    return clone(idempotent.get(request.requestId));
  }
  if (request.operation !== 'getPublication' && writeToken !== 'test-write-token') {
    return failure(request, 'WRITE_UNAUTHORIZED', 'Teacher write authorization is required.', false);
  }

  let data;
  if (request.operation === 'publishPublication') {
    const campaignId = request.payload.campaignId;
    const version = (versions.get(campaignId) || 0) + 1;
    versions.set(campaignId, version);
    const publicationId = `server-${campaignId}-v${version}`;
    const publication = {
      campaignId,
      publicationId,
      version,
      schemaVersion: request.payload.schemaVersion,
      contentHash: request.payload.contentHash,
      content: clone(request.payload.content)
    };
    const record = {
      publicationId,
      campaignId,
      version,
      schemaVersion: request.payload.schemaVersion,
      contentHash: request.payload.contentHash,
      sourceDraftRevision: request.payload.draftRevision,
      createdAt: `2026-08-07T22:00:0${version}.000Z`,
      status: 'PUBLISHED'
    };
    publications.set(publicationId, publication);
    data = { publication, record };
  } else if (request.operation === 'activatePublication') {
    const publication = publications.get(request.payload.publicationId) || null;
    if (!publication || publication.campaignId !== request.payload.campaignId) {
      return failure(request, 'PUBLICATION_UNAVAILABLE', 'Publication unavailable.', false);
    }
    const previous = active.get(request.payload.campaignId) || null;
    if (previous && previous.publicationId === publication.publicationId) {
      data = { changed: false, reference: clone(previous), record: null };
    } else {
      const reference = {
        campaignId: publication.campaignId,
        publicationId: publication.publicationId,
        version: publication.version,
        contentHash: publication.contentHash,
        activatedAt: '2026-08-07T22:10:00.000Z'
      };
      const record = {
        activationId: request.requestId,
        action: 'ACTIVATE',
        campaignId: publication.campaignId,
        previousPublicationId: previous ? previous.publicationId : null,
        nextPublicationId: publication.publicationId,
        occurredAt: '2026-08-07T22:10:00.000Z'
      };
      active.set(publication.campaignId, reference);
      data = { changed: true, reference, record };
    }
  } else if (request.operation === 'deactivatePublication') {
    const previous = active.get(request.payload.campaignId) || null;
    if (!previous) {
      data = { changed: false, reference: null, record: null };
    } else {
      const record = {
        activationId: request.requestId,
        action: 'DEACTIVATE',
        campaignId: request.payload.campaignId,
        previousPublicationId: previous.publicationId,
        nextPublicationId: null,
        occurredAt: '2026-08-07T22:20:00.000Z'
      };
      active.delete(request.payload.campaignId);
      data = { changed: true, reference: null, record };
    }
  } else if (request.operation === 'getPublication') {
    const publication = publications.get(request.payload.publicationId) || null;
    const reference = active.get(request.payload.campaignId) || null;
    if (!publication || !reference || reference.publicationId !== publication.publicationId) {
      return failure(request, 'PUBLICATION_UNAVAILABLE', 'Publication is not active.', false);
    }
    data = { publication: clone(publication), activeReference: clone(reference) };
  } else {
    return failure(request, 'UNSUPPORTED_OPERATION', 'Unsupported operation.', false);
  }

  const output = response(request, true, data, null);
  if (request.operation !== 'getPublication') {
    idempotent.set(request.requestId, clone(output));
    requestBodies.set(request.requestId, body);
  }
  return output;
}

async function fakeFetch(url, init) {
  fetchCount += 1;
  if (throwNext) {
    throwNext = false;
    throw new Error('simulated transport failure');
  }

  const method = String((init && init.method) || 'GET').toUpperCase();
  let request;
  let writeToken = '';
  if (method === 'POST') {
    const envelope = JSON.parse(String(init.body || '{}'));
    request = envelope.request;
    writeToken = envelope.writeToken || '';
  } else {
    const parsed = new URL(String(url));
    request = {
      protocolVersion: parsed.searchParams.get('protocolVersion') || '',
      operation: parsed.searchParams.get('operation') || '',
      requestId: parsed.searchParams.get('requestId') || '',
      payload: {
        campaignId: parsed.searchParams.get('campaignId') || '',
        publicationId: parsed.searchParams.get('publicationId') || ''
      }
    };
  }

  calls.push({
    method,
    url: String(url),
    request: clone(request),
    writeToken,
    init: {
      method: init && init.method,
      credentials: init && init.credentials,
      cache: init && init.cache,
      redirect: init && init.redirect,
      headers: clone(init && init.headers)
    }
  });

  if (httpStatusNext) {
    const status = httpStatusNext;
    httpStatusNext = 0;
    return { ok: false, status, text: async () => 'temporary error' };
  }
  if (invalidJsonNext) {
    invalidJsonNext = false;
    return { ok: true, status: 200, text: async () => '{not-json' };
  }
  if (invalidContractNext) {
    invalidContractNext = false;
    return { ok: true, status: 200, text: async () => JSON.stringify({ bad: true }) };
  }

  return { ok: true, status: 200, text: async () => JSON.stringify(server(request, writeToken)) };
}

function createClient(tokenProvider) {
  return api.createClient({
    contract,
    endpoint: 'https://remote.test/exec',
    fetchImpl: fakeFetch,
    writeTokenProvider: tokenProvider || (() => 'test-write-token'),
    requestIdFactory: (operation) => `req-${operation}-${++sequence}`,
    timeoutMs: 5000
  });
}

(async function run() {
  const client = createClient();
  equal(Object.keys(client).sort().join(','), 'activatePublication,deactivatePublication,getPublication,publishPublication', 'client instance API exact');
  check(Object.isFrozen(client), 'client instance frozen');

  const beforeNoToken = fetchCount;
  const noToken = await createClient(() => '').deactivatePublication('camp-a');
  check(!noToken.success, 'missing token fails closed');
  equal(noToken.error.code, 'WRITE_UNAUTHORIZED', 'missing token code');
  equal(fetchCount, beforeNoToken, 'missing token causes no fetch');

  const asyncTokenClient = createClient(async () => 'test-write-token');
  const asyncTokenResult = await asyncTokenClient.deactivatePublication('camp-empty');
  check(asyncTokenResult.success, 'async token provider supported');

  const authThrowClient = createClient(() => { throw new Error('auth unavailable'); });
  const authThrow = await authThrowClient.deactivatePublication('camp-a');
  check(!authThrow.success, 'throwing token provider fails closed');
  equal(authThrow.error.code, 'WRITE_UNAUTHORIZED', 'throwing token provider maps to write unauthorized');

  const contentHash = 'a'.repeat(64);
  const publishInput = vmClone({
    campaignId: 'camp-a',
    draftRevision: 'rev-1',
    schemaVersion: '2.0',
    contentHash,
    content: { nombre: 'Campaña', misiones: [{ id: 'm1' }] }
  });
  const published = await client.publishPublication(publishInput, { requestId: 'explicit-publish-id' });
  check(published.success, 'publish succeeds');
  equal(published.requestId, 'explicit-publish-id', 'explicit requestId preserved');
  equal(published.data.publication.publicationId, 'server-camp-a-v1', 'server publicationId accepted');
  equal(published.data.publication.version, 1, 'server version accepted');
  equal(published.data.record.createdAt, '2026-08-07T22:00:01.000Z', 'server createdAt accepted');
  equal(published.data.record.sourceDraftRevision, 'rev-1', 'source draft revision preserved');

  const publishCall = calls.find((item) => item.request.requestId === 'explicit-publish-id');
  equal(publishCall.method, 'POST', 'publish uses POST');
  equal(publishCall.writeToken, 'test-write-token', 'token sent in outer envelope');
  check(!Object.prototype.hasOwnProperty.call(publishCall.request, 'writeToken'), 'token excluded from contract request');
  equal(publishCall.init.credentials, 'omit', 'POST credentials omitted');
  equal(publishCall.init.cache, 'no-store', 'POST cache disabled');
  equal(publishCall.init.redirect, 'follow', 'POST redirects followed');
  equal(publishCall.init.headers['Content-Type'], 'text/plain;charset=utf-8', 'POST uses Apps Script safe content type');
  equal(publishCall.request.operation, 'publishPublication', 'publish operation exact');
  equal(publishCall.request.payload.contentHash, contentHash, 'publish hash exact');

  const repeat = await client.publishPublication(publishInput, { requestId: 'explicit-publish-id' });
  check(repeat.success, 'idempotent repeated publish succeeds');
  equal(repeat.data.publication.publicationId, published.data.publication.publicationId, 'idempotent repeated publish returns same publication');
  equal(versions.get('camp-a'), 1, 'idempotent repeated publish does not increment version');

  const activated = await client.activatePublication('camp-a', published.data.publication.publicationId, { requestId: 'activate-id' });
  check(activated.success && activated.data.changed, 'activate succeeds');
  equal(activated.data.reference.publicationId, published.data.publication.publicationId, 'activate reference exact');
  equal(activated.data.record.activationId, 'activate-id', 'activation record uses requestId');
  equal(activated.data.record.action, 'ACTIVATE', 'activation record action exact');

  const activatedAgain = await client.activatePublication('camp-a', published.data.publication.publicationId, { requestId: 'activate-again-id' });
  check(activatedAgain.success && !activatedAgain.data.changed, 'activate same publication is idempotent state change');
  equal(activatedAgain.data.record, null, 'unchanged activation has no record');

  const getActive = await client.getPublication('camp-a', published.data.publication.publicationId, { requestId: 'get-id' });
  check(getActive.success, 'GET active publication succeeds');
  equal(getActive.data.publication.publicationId, published.data.publication.publicationId, 'GET publication exact');
  equal(getActive.data.activeReference.publicationId, published.data.publication.publicationId, 'GET active reference exact');
  const getCall = calls.find((item) => item.request.requestId === 'get-id');
  equal(getCall.method, 'GET', 'read uses GET');
  equal(getCall.writeToken, '', 'GET sends no write token');
  check(getCall.url.includes('accion=getPublication'), 'GET includes Apps Script action');
  check(getCall.url.includes('campaignId=camp-a'), 'GET includes campaignId');
  check(getCall.url.includes(`publicationId=${encodeURIComponent(published.data.publication.publicationId)}`), 'GET includes publicationId');

  const deactivated = await client.deactivatePublication('camp-a', { requestId: 'deactivate-id' });
  check(deactivated.success && deactivated.data.changed, 'deactivate succeeds');
  equal(deactivated.data.reference, null, 'deactivate returns null active reference');
  equal(deactivated.data.record.action, 'DEACTIVATE', 'deactivation action exact');

  const unavailable = await client.getPublication('camp-a', published.data.publication.publicationId, { requestId: 'get-inactive-id' });
  check(!unavailable.success, 'inactive GET fails neutrally');
  equal(unavailable.error.code, 'PUBLICATION_UNAVAILABLE', 'inactive GET code preserved');
  check(unavailable.error.retryable === false, 'inactive GET is non-retryable');

  throwNext = true;
  const transport = await client.deactivatePublication('camp-a', { requestId: 'transport-id' });
  check(!transport.success, 'transport exception becomes failure result');
  equal(transport.error.code, 'REMOTE_TRANSPORT_FAILED', 'transport error code');
  check(transport.error.retryable, 'transport error retryable');

  httpStatusNext = 503;
  const http503 = await client.deactivatePublication('camp-a', { requestId: 'http-503-id' });
  check(!http503.success, 'HTTP 503 becomes failure');
  equal(http503.error.code, 'REMOTE_HTTP_ERROR', 'HTTP error code');
  check(http503.error.retryable, 'HTTP 503 retryable');
  equal(http503.error.metadata.status, 503, 'HTTP status metadata retained');

  httpStatusNext = 400;
  const http400 = await client.deactivatePublication('camp-a', { requestId: 'http-400-id' });
  check(!http400.success, 'HTTP 400 becomes failure');
  check(!http400.error.retryable, 'HTTP 400 non-retryable');

  invalidJsonNext = true;
  const invalidJson = await client.deactivatePublication('camp-a', { requestId: 'invalid-json-id' });
  check(!invalidJson.success, 'invalid JSON rejected');
  equal(invalidJson.error.code, 'REMOTE_RESPONSE_PARSE_FAILED', 'invalid JSON code');
  check(invalidJson.error.retryable, 'invalid JSON marked retryable');

  invalidContractNext = true;
  const invalidContract = await client.deactivatePublication('camp-a', { requestId: 'invalid-contract-id' });
  check(!invalidContract.success, 'contract-invalid response rejected');
  equal(invalidContract.error.code, 'REMOTE_RESPONSE_INVALID', 'contract-invalid response code');
  check(!invalidContract.error.retryable, 'contract-invalid response non-retryable');

  const unavailableClient = api.createClient({ contract, endpoint: '', fetchImpl: fakeFetch, requestIdFactory: () => 'unavailable-id' });
  const unavailableClientResult = await unavailableClient.getPublication('camp-a', 'pub-a');
  check(!unavailableClientResult.success, 'missing endpoint fails safely');
  equal(unavailableClientResult.error.code, 'REMOTE_CLIENT_UNAVAILABLE', 'missing endpoint code');

  check(failed === 0, 'all preceding checks passed');

  console.log(`REMOTE_CLIENT_TEST_STATUS=${failed === 0 ? 'PASS' : 'FAIL'}`);
  console.log(`REMOTE_CLIENT_TEST_TOTAL=${total}`);
  console.log(`REMOTE_CLIENT_TEST_FAILED=${failed}`);
  console.log('REMOTE_CLIENT_REAL_NETWORK=false');
  console.log('REMOTE_CLIENT_SECRET_EMBEDDED=false');
  if (failures.length) failures.forEach((item) => console.log(`FAIL=${item}`));
  process.exitCode = failed === 0 ? 0 : 1;
})().catch((error) => {
  failed += 1;
  console.error(`UNCAUGHT=${error && error.stack || error}`);
  console.log('REMOTE_CLIENT_TEST_STATUS=FAIL');
  console.log(`REMOTE_CLIENT_TEST_TOTAL=${total}`);
  console.log(`REMOTE_CLIENT_TEST_FAILED=${failed}`);
  console.log('REMOTE_CLIENT_REAL_NETWORK=false');
  process.exitCode = 1;
});
