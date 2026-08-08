'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const repo = path.resolve(process.argv[2] || path.join(__dirname, '..'));
global.window = global;

function load(relative) {
  vm.runInThisContext(fs.readFileSync(path.join(repo, relative), 'utf8'), { filename: relative });
}

load('js/runtime/publication/runtime-remote-publication-bootstrap.js');

const api = global.CRIOS_RUNTIME_REMOTE_PUBLICATION_BOOTSTRAP;
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
function harness(overrides) {
  const opts = overrides || {};
  const calls = { client: 0, readers: 0, clientOptions: null, readersOptions: null };
  const contract = opts.contract === undefined ? Object.freeze({ marker: 'contract' }) : opts.contract;
  const client = opts.client === undefined ? Object.freeze({ getPublication: async () => null }) : opts.client;
  const readers = opts.readers === undefined
    ? Object.freeze({ activeReferenceReader: async () => null, publicationReader: async () => null })
    : opts.readers;

  const clientFactory = opts.clientFactory || Object.freeze({
    createClient(options) {
      calls.client += 1;
      calls.clientOptions = options;
      if (opts.clientThrow) throw new Error(opts.clientThrow);
      return client;
    }
  });

  const readersFactory = opts.readersFactory || Object.freeze({
    createRemotePublicationReaders(options) {
      calls.readers += 1;
      calls.readersOptions = options;
      if (opts.readersThrow) throw new Error(opts.readersThrow);
      return readers;
    }
  });

  return { calls, contract, client, readers, clientFactory, readersFactory };
}
function select(h, config, extra) {
  return api.createReaderSelection(Object.assign({
    config,
    campaignId: ' campaign-b4 ',
    publicationId: ' publication-b4-v1 ',
    contract: h.contract,
    clientFactory: h.clientFactory,
    readersFactory: h.readersFactory
  }, extra || {}));
}

check(Boolean(api), 'bootstrap API exists');
equal(api.version, '1.0.0', 'bootstrap version');
equal(api.configGlobal, 'CRIOS_RUNTIME_REMOTE_PUBLICATION_CONFIG', 'config global exact');
equal(Object.keys(api).sort().join(','), 'configGlobal,createReaderSelection,version', 'bootstrap API exact');
check(Object.isFrozen(api), 'bootstrap API frozen');

delete global.CRIOS_RUNTIME_REMOTE_PUBLICATION_CONFIG;
{
  const h = harness();
  const result = api.createReaderSelection({
    campaignId: 'campaign-b4',
    publicationId: 'publication-b4-v1',
    contract: h.contract,
    clientFactory: h.clientFactory,
    readersFactory: h.readersFactory
  });
  equal(result.configured, false, 'missing config keeps local path');
  equal(result.readers, null, 'missing config has no readers');
  equal(result.client, null, 'missing config has no client');
  equal(result.error, null, 'missing config is not error');
  equal(h.calls.client, 0, 'missing config no client construction');
  equal(h.calls.readers, 0, 'missing config no readers construction');
  check(Object.isFrozen(result), 'missing config selection frozen');
}

{
  const h = harness();
  const result = select(h, { endpoint: '  https://example.invalid/exec  ', timeoutMs: 4321 });
  equal(result.configured, true, 'valid config remote selected');
  equal(result.error, null, 'valid config no error');
  equal(result.client, h.client, 'valid config returns client');
  equal(result.readers, h.readers, 'valid config returns readers');
  equal(h.calls.client, 1, 'valid config creates one client');
  equal(h.calls.readers, 1, 'valid config creates one readers bundle');
  equal(h.calls.clientOptions.contract, h.contract, 'contract forwarded');
  equal(h.calls.clientOptions.endpoint, 'https://example.invalid/exec', 'endpoint normalized');
  equal(h.calls.clientOptions.timeoutMs, 4321, 'timeout forwarded');
  check(!Object.prototype.hasOwnProperty.call(h.calls.clientOptions, 'writeTokenProvider'), 'runtime does not forward write provider');
  equal(h.calls.readersOptions.remoteClient, h.client, 'same client forwarded to readers');
  equal(h.calls.readersOptions.campaignId, 'campaign-b4', 'campaign normalized');
  equal(h.calls.readersOptions.publicationId, 'publication-b4-v1', 'publication normalized');
}

{
  const h = harness();
  global.CRIOS_RUNTIME_REMOTE_PUBLICATION_CONFIG = Object.freeze({ endpoint: 'https://global.invalid/exec' });
  const result = api.createReaderSelection({
    campaignId: 'campaign-b4',
    publicationId: 'publication-b4-v1',
    contract: h.contract,
    clientFactory: h.clientFactory,
    readersFactory: h.readersFactory
  });
  equal(result.configured, true, 'global config detected');
  equal(h.calls.clientOptions.endpoint, 'https://global.invalid/exec', 'global endpoint used');
  delete global.CRIOS_RUNTIME_REMOTE_PUBLICATION_CONFIG;
}

for (const item of [
  { config: null, code: 'RUNTIME_REMOTE_PUBLICATION_CONFIG_INVALID', name: 'null config' },
  { config: [], code: 'RUNTIME_REMOTE_PUBLICATION_CONFIG_INVALID', name: 'array config' },
  { config: {}, code: 'RUNTIME_REMOTE_PUBLICATION_ENDPOINT_REQUIRED', name: 'missing endpoint' },
  { config: { endpoint: '   ' }, code: 'RUNTIME_REMOTE_PUBLICATION_ENDPOINT_REQUIRED', name: 'blank endpoint' },
  { config: { endpoint: 'https://x', timeoutMs: 0 }, code: 'RUNTIME_REMOTE_PUBLICATION_CONFIG_INVALID', name: 'zero timeout' },
  { config: { endpoint: 'https://x', timeoutMs: 'bad' }, code: 'RUNTIME_REMOTE_PUBLICATION_CONFIG_INVALID', name: 'bad timeout' },
  { config: { endpoint: 'https://x', extra: true }, code: 'RUNTIME_REMOTE_PUBLICATION_CONFIG_INVALID', name: 'unknown key' },
  { config: { endpoint: 'https://x', writeToken: 'secret' }, code: 'RUNTIME_REMOTE_PUBLICATION_SECRET_NOT_ALLOWED', name: 'literal token rejected' },
  { config: { endpoint: 'https://x', writeTokenProvider: () => 'secret' }, code: 'RUNTIME_REMOTE_PUBLICATION_SECRET_NOT_ALLOWED', name: 'provider rejected' }
]) {
  const h = harness();
  const result = select(h, item.config);
  equal(result.configured, true, item.name + ' remains explicit');
  equal(result.readers, null, item.name + ' no readers');
  equal(result.error && result.error.code, item.code, item.name + ' code');
  equal(h.calls.client, 0, item.name + ' no client');
  equal(h.calls.readers, 0, item.name + ' no readers factory');
  check(Object.isFrozen(result.error), item.name + ' error frozen');
}

for (const identity of [
  { campaignId: '', publicationId: 'p', name: 'missing campaign' },
  { campaignId: 'c', publicationId: '', name: 'missing publication' }
]) {
  const h = harness();
  const result = select(h, { endpoint: 'https://x' }, {
    campaignId: identity.campaignId,
    publicationId: identity.publicationId
  });
  equal(result.error && result.error.code, 'RUNTIME_REMOTE_PUBLICATION_IDENTITY_INVALID', identity.name + ' code');
  equal(h.calls.client, 0, identity.name + ' no client');
}

for (const missing of [
  { contract: null, name: 'contract' },
  { clientFactory: Object.freeze({}), name: 'client factory' },
  { readersFactory: Object.freeze({}), name: 'readers factory' }
]) {
  const h = harness(missing);
  const result = select(h, { endpoint: 'https://x' });
  equal(result.configured, true, 'missing ' + missing.name + ' remains explicit');
  equal(result.readers, null, 'missing ' + missing.name + ' no readers');
  equal(result.error && result.error.code, 'RUNTIME_REMOTE_PUBLICATION_MODULE_UNAVAILABLE', 'missing ' + missing.name + ' fails closed');
}

{
  const h = harness({ clientThrow: 'client boom' });
  const result = select(h, { endpoint: 'https://x' });
  equal(result.error && result.error.code, 'RUNTIME_REMOTE_PUBLICATION_CLIENT_CREATE_FAILED', 'client throw code');
  equal(h.calls.readers, 0, 'client throw no readers construction');
}
{
  const h = harness({ readersThrow: 'readers boom' });
  const result = select(h, { endpoint: 'https://x' });
  equal(result.error && result.error.code, 'RUNTIME_REMOTE_PUBLICATION_READERS_CREATE_FAILED', 'readers throw code');
  equal(result.client, h.client, 'reader creation failure retains client diagnostic');
}
{
  const h = harness({ readers: Object.freeze({}) });
  const result = select(h, { endpoint: 'https://x' });
  equal(result.error && result.error.code, 'RUNTIME_REMOTE_PUBLICATION_READERS_INVALID', 'invalid readers interface code');
}

const source = fs.readFileSync(path.join(repo, 'js/runtime/publication/runtime-remote-publication-bootstrap.js'), 'utf8');
check(source.indexOf('localStorage') < 0, 'bootstrap has no localStorage');
check(source.indexOf('sessionStorage') < 0, 'bootstrap has no sessionStorage');
check(source.indexOf('fetch(') < 0, 'bootstrap has no direct fetch');
check(source.indexOf('resultsEndpoint') < 0, 'bootstrap does not reuse results endpoint');

console.log('RUNTIME_REMOTE_PUBLICATION_BOOTSTRAP_TEST_STATUS=' + (failed ? 'FAIL' : 'PASS'));
console.log('RUNTIME_REMOTE_PUBLICATION_BOOTSTRAP_TEST_TOTAL=' + total);
console.log('RUNTIME_REMOTE_PUBLICATION_BOOTSTRAP_TEST_FAILED=' + failed);
console.log('RUNTIME_REMOTE_CONFIG_EXPLICIT_ONLY=true');
console.log('RUNTIME_REMOTE_CONFIG_SECRET_FREE=true');
console.log('RUNTIME_REMOTE_INVALID_CONFIG_FAILS_CLOSED=true');
console.log('RUNTIME_REMOTE_MISSING_CONFIG_PRESERVES_LOCAL=true');
if (failed) process.exit(1);
