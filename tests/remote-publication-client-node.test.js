'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const repo = path.resolve(process.argv[2] || path.join(__dirname, '..'));
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

const context = { console, setTimeout, clearTimeout, AbortController, TextEncoder, URL, URLSearchParams, performance };
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
function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

load('js/publication/remote/remote-publication-contract.js');
load('js/publication/remote/remote-publication-client.js');

const contract = context.CRIOS_REMOTE_PUBLICATION_CONTRACT;
const api = context.CRIOS_REMOTE_PUBLICATION_CLIENT;
const clientSource = fs.readFileSync(path.join(repo, 'js/publication/remote/remote-publication-client.js'), 'utf8');

check(Boolean(contract), 'remote contract loads');
check(Boolean(api), 'remote client loads');
equal(api.version, '1.0.0', 'remote client version');
equal(Object.keys(api).sort().join(','), 'createClient,errorCodes,version', 'root API exact');
check(Object.isFrozen(api), 'root API frozen');
check(!clientSource.includes('script.google.com/macros/s/'), 'client contains no fixed production endpoint');
check(!clientSource.includes('writeToken'), 'client contains no teacher write-token transport');
check(!clientSource.includes('INSECURE_CONTEXT'), 'client contains no secure-context auth gate');
check(!Object.prototype.hasOwnProperty.call(api.errorCodes, 'AUTH_UNAVAILABLE'), 'auth-unavailable client error retired');
check(!Object.prototype.hasOwnProperty.call(api.errorCodes, 'INSECURE_CONTEXT'), 'insecure-context client error retired');
equal(Object.keys(contract.constants.operations).sort().join(','), 'GET,PUBLISH', 'contract exposes publish/get operations only');
check(!Object.prototype.hasOwnProperty.call(contract, 'createActivateRequest'), 'contract exposes no activate builder');
check(!Object.prototype.hasOwnProperty.call(contract, 'createDeactivateRequest'), 'contract exposes no deactivate builder');

let sequence = 0;
let fetchCount = 0;
let throwNext = false;
let invalidJsonNext = false;
let invalidContractNext = false;
let httpStatusNext = 0;
const calls = [];
const versions = new Map();
const publications = new Map();
const createdAtByPublication = new Map();
const idempotent = new Map();
const requestBodies = new Map();

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
function compatibilityReference(publication) {
  return {
    campaignId: publication.campaignId,
    publicationId: publication.publicationId,
    version: publication.version,
    contentHash: publication.contentHash,
    activatedAt: createdAtByPublication.get(publication.publicationId)
  };
}
function server(request) {
  const body = JSON.stringify(request);

  if (request.operation === 'publishPublication' && idempotent.has(request.requestId)) {
    if (requestBodies.get(request.requestId) !== body) {
      return failure(request, 'WRITE_CONFLICT', 'requestId conflict.', false);
    }
    return clone(idempotent.get(request.requestId));
  }

  let data;
  if (request.operation === 'publishPublication') {
    const campaignId = request.payload.campaignId;
    const version = (versions.get(campaignId) || 0) + 1;
    versions.set(campaignId, version);
    const publicationId = `server-${campaignId}-v${version}`;
    const createdAt = `2026-08-13T20:00:0${Math.min(version, 9)}.000Z`;
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
      createdAt,
      status: 'PUBLISHED'
    };
    publications.set(publicationId, publication);
    createdAtByPublication.set(publicationId, createdAt);
    data = { publication, record };
  } else if (request.operation === 'getPublication') {
    const publication = publications.get(request.payload.publicationId) || null;
    if (!publication || publication.campaignId !== request.payload.campaignId) {
      return failure(request, 'PUBLICATION_UNAVAILABLE', 'Publication is unavailable.', false);
    }
    data = { publication: clone(publication), activeReference: compatibilityReference(publication) };
  } else {
    return failure(request, 'UNSUPPORTED_OPERATION', 'Unsupported operation.', false);
  }

  const output = response(request, true, data, null);
  if (request.operation === 'publishPublication') {
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
  let envelope = null;

  if (method === 'POST') {
    envelope = JSON.parse(String(init.body || '{}'));
    request = envelope.request;
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
    envelope: clone(envelope),
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
  return { ok: true, status: 200, text: async () => JSON.stringify(server(request)) };
}

function createClient(extra) {
  return api.createClient(Object.assign({
    contract,
    endpoint: 'https://remote.test/exec',
    fetchImpl: fakeFetch,
    requestIdFactory: (operation) => `req-${operation}-${++sequence}`,
    timeoutMs: 5000
  }, extra || {}));
}
function publishInput(campaignId, revision, hashChar) {
  return vmClone({
    campaignId,
    draftRevision: revision,
    schemaVersion: '2.0',
    contentHash: String(hashChar || 'a').repeat(64),
    content: { nombre: `Campaña ${revision}`, misiones: [{ id: 'm1' }] }
  });
}

(async function run() {
  const client = createClient();
  equal(Object.keys(client).sort().join(','), 'getPublication,publishPublication', 'client instance API exact');
  check(Object.isFrozen(client), 'client instance frozen');
  equal(typeof client.activatePublication, 'undefined', 'activate method retired');
  equal(typeof client.deactivatePublication, 'undefined', 'deactivate method retired');

  let retiredProviderCalls = 0;
  const clientWithStaleProvider = createClient({
    writeTokenProvider() {
      retiredProviderCalls += 1;
      throw new Error('stale provider must never run');
    }
  });
  const staleProviderPublish = await clientWithStaleProvider.publishPublication(publishInput('camp-stale-provider', 'rev-1', '0'), { requestId: 'publish-stale-provider' });
  check(staleProviderPublish.success, 'stale writeTokenProvider option cannot gate anonymous publish');
  equal(retiredProviderCalls, 0, 'stale writeTokenProvider option is ignored and never read');

  const firstInput = publishInput('camp-a', 'rev-1', 'a');
  const first = await client.publishPublication(firstInput, { requestId: 'publish-v1' });
  check(first.success, 'anonymous first publish succeeds');
  equal(first.requestId, 'publish-v1', 'explicit requestId preserved');
  equal(first.data.publication.publicationId, 'server-camp-a-v1', 'server publicationId accepted');
  equal(first.data.publication.version, 1, 'first version accepted');
  equal(first.data.record.sourceDraftRevision, 'rev-1', 'source draft revision preserved');

  const firstCall = calls.find((item) => item.request.requestId === 'publish-v1');
  equal(firstCall.method, 'POST', 'publish uses POST');
  equal(Object.keys(firstCall.envelope).sort().join(','), 'request', 'publish POST envelope contains request only');
  check(!Object.prototype.hasOwnProperty.call(firstCall.envelope, 'writeToken'), 'publish sends no writeToken');
  equal(firstCall.init.credentials, 'omit', 'POST credentials omitted');
  equal(firstCall.init.cache, 'no-store', 'POST cache disabled');
  equal(firstCall.init.headers['Content-Type'], 'text/plain;charset=utf-8', 'POST uses safe content type');
  equal(firstCall.request.operation, 'publishPublication', 'publish operation exact');

  const repeated = await client.publishPublication(firstInput, { requestId: 'publish-v1' });
  check(repeated.success, 'idempotent repeated publish succeeds');
  equal(repeated.data.publication.publicationId, first.data.publication.publicationId, 'idempotent repeated publish returns same publication');
  equal(versions.get('camp-a'), 1, 'idempotent repeated publish does not increment version');

  const getFirst = await client.getPublication('camp-a', first.data.publication.publicationId, { requestId: 'get-v1-before-v2' });
  check(getFirst.success, 'direct GET first publication succeeds');
  equal(getFirst.data.publication.publicationId, first.data.publication.publicationId, 'GET exact publication');
  equal(getFirst.data.activeReference.publicationId, first.data.publication.publicationId, 'GET compatibility reference exact');

  const getCall = calls.find((item) => item.request.requestId === 'get-v1-before-v2');
  equal(getCall.method, 'GET', 'read uses GET');
  equal(getCall.envelope, null, 'GET has no write envelope');
  check(getCall.url.includes('accion=getPublication'), 'GET includes Apps Script action');
  check(getCall.url.includes('campaignId=camp-a'), 'GET includes campaignId');
  check(getCall.url.includes(`publicationId=${encodeURIComponent(first.data.publication.publicationId)}`), 'GET includes publicationId');

  const second = await client.publishPublication(publishInput('camp-a', 'rev-2', 'b'), { requestId: 'publish-v2' });
  check(second.success, 'second immutable publish succeeds');
  equal(second.data.publication.version, 2, 'second publish gets next version');
  check(second.data.publication.publicationId !== first.data.publication.publicationId, 'second publish gets unique publicationId');

  const oldLink = await client.getPublication('camp-a', first.data.publication.publicationId, { requestId: 'get-old-link' });
  check(oldLink.success, 'old direct link survives later publish');
  equal(oldLink.data.publication.publicationId, first.data.publication.publicationId, 'old link resolves exact old snapshot');

  const newLink = await client.getPublication('camp-a', second.data.publication.publicationId, { requestId: 'get-new-link' });
  check(newLink.success, 'new direct link resolves');
  equal(newLink.data.publication.publicationId, second.data.publication.publicationId, 'new link resolves exact new snapshot');

  const wrongCampaign = await client.getPublication('other-camp', first.data.publication.publicationId, { requestId: 'get-wrong-campaign' });
  check(!wrongCampaign.success, 'campaign/publication mismatch unavailable');
  equal(wrongCampaign.error.code, 'PUBLICATION_UNAVAILABLE', 'mismatch code preserved');

  const missing = await client.getPublication('camp-a', 'missing-publication', { requestId: 'get-missing' });
  check(!missing.success, 'unknown publication unavailable');
  equal(missing.error.code, 'PUBLICATION_UNAVAILABLE', 'unknown publication code preserved');
  check(missing.error.retryable === false, 'unknown publication non-retryable');

  throwNext = true;
  const transport = await client.getPublication('camp-a', first.data.publication.publicationId, { requestId: 'transport-id' });
  check(!transport.success, 'transport exception becomes failure result');
  equal(transport.error.code, 'REMOTE_TRANSPORT_FAILED', 'transport error code');
  check(transport.error.retryable, 'transport error retryable');

  httpStatusNext = 503;
  const http503 = await client.getPublication('camp-a', first.data.publication.publicationId, { requestId: 'http-503-id' });
  check(!http503.success, 'HTTP 503 becomes failure');
  equal(http503.error.code, 'REMOTE_HTTP_ERROR', 'HTTP error code');
  check(http503.error.retryable, 'HTTP 503 retryable');
  equal(http503.error.metadata.status, 503, 'HTTP status metadata retained');

  httpStatusNext = 400;
  const http400 = await client.getPublication('camp-a', first.data.publication.publicationId, { requestId: 'http-400-id' });
  check(!http400.success, 'HTTP 400 becomes failure');
  check(!http400.error.retryable, 'HTTP 400 non-retryable');

  invalidJsonNext = true;
  const invalidJson = await client.getPublication('camp-a', first.data.publication.publicationId, { requestId: 'invalid-json-id' });
  check(!invalidJson.success, 'invalid JSON rejected');
  equal(invalidJson.error.code, 'REMOTE_RESPONSE_PARSE_FAILED', 'invalid JSON code');

  invalidContractNext = true;
  const invalidContract = await client.getPublication('camp-a', first.data.publication.publicationId, { requestId: 'invalid-contract-id' });
  check(!invalidContract.success, 'contract-invalid response rejected');
  equal(invalidContract.error.code, 'REMOTE_RESPONSE_INVALID', 'contract-invalid response code');

  const unavailableClient = api.createClient({ contract, endpoint: '', fetchImpl: fakeFetch, requestIdFactory: () => 'unavailable-id' });
  const unavailableResult = await unavailableClient.getPublication('camp-a', first.data.publication.publicationId);
  check(!unavailableResult.success, 'missing endpoint fails safely');
  equal(unavailableResult.error.code, 'REMOTE_CLIENT_UNAVAILABLE', 'missing endpoint code');

  const incompleteContract = { createPublishRequest: contract.createPublishRequest, parseResponse: contract.parseResponse };
  const incompleteClient = api.createClient({ contract: incompleteContract, endpoint: 'https://remote.test/exec', fetchImpl: fakeFetch });
  const incompleteResult = await incompleteClient.getPublication('camp-a', first.data.publication.publicationId);
  check(!incompleteResult.success, 'missing GET builder makes client unavailable');
  equal(incompleteResult.error.code, 'REMOTE_CLIENT_UNAVAILABLE', 'incomplete contract fails closed');

  check(failed === 0, 'all preceding checks passed');

  console.log(`REMOTE_CLIENT_TEST_STATUS=${failed === 0 ? 'PASS' : 'FAIL'}`);
  console.log(`REMOTE_CLIENT_TEST_TOTAL=${total}`);
  console.log(`REMOTE_CLIENT_TEST_FAILED=${failed}`);
  console.log('REMOTE_CLIENT_MUTABLE_OPERATIONS=false');
  console.log('REMOTE_CLIENT_ANONYMOUS_PUBLISH=true');
  console.log('REMOTE_CLIENT_REQUEST_ONLY_ENVELOPE=true');
  console.log('REMOTE_CLIENT_DIRECT_IMMUTABLE_GET=true');
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
  process.exitCode = 1;
});
