'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = process.argv[2] || path.resolve(__dirname, '..');
let total = 0;
let failed = 0;

function ok(condition, label) {
  total += 1;
  if (!condition) {
    failed += 1;
    console.error('FAIL ' + label);
  }
}

function eq(actual, expected, label) {
  ok(actual === expected, label + ' actual=' + String(actual) + ' expected=' + String(expected));
}

function makeSessionStorage() {
  const values = new Map();
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
    size() { return values.size; }
  };
}

function makeContext(config) {
  let fetchCount = 0;
  const storage = makeSessionStorage();
  const context = {
    console,
    Object,
    Array,
    String,
    Number,
    Boolean,
    Date,
    Math,
    JSON,
    RegExp,
    Error,
    TypeError,
    Map,
    Set,
    Promise,
    Uint8Array,
    encodeURIComponent,
    decodeURIComponent,
    setTimeout,
    clearTimeout,
    AbortController: global.AbortController,
    sessionStorage: storage,
    crypto: {
      randomUUID() { return '11111111-2222-4333-8444-555555555555'; },
      getRandomValues(bytes) { for (let i = 0; i < bytes.length; i += 1) bytes[i] = (i + 1) & 255; return bytes; }
    },
    fetch() { fetchCount += 1; throw new Error('network should not run during bootstrap'); },
    __fetchCount() { return fetchCount; },
    __storage: storage,
    CRIOS_CONFIG: config
  };
  context.window = context;
  return vm.createContext(context);
}

function runFile(context, relative) {
  const file = path.join(root, relative);
  vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: file });
}

const endpoint = 'https://script.google.com/macros/s/example/exec';
const context = makeContext({ publicationEndpoint: endpoint, publicationTimeoutMs: 15000 });
runFile(context, 'js/live-room/live-room-model.js');
runFile(context, 'js/live-room/remote/live-room-contract.js');
runFile(context, 'js/live-room/remote/live-room-client.js');
runFile(context, 'js/live-room/remote/live-room-browser-bootstrap.js');

const bootstrap = context.CRIOS_LIVE_ROOM_BROWSER_BOOTSTRAP;
const selection = context.CRIOS_LIVE_ROOM_BROWSER;

ok(Boolean(bootstrap), 'bootstrap global exists');
eq(bootstrap.version, '1.0.0', 'bootstrap version');
ok(typeof bootstrap.createClientSelection === 'function', 'bootstrap exposes createClientSelection');
ok(Object.isFrozen(bootstrap), 'bootstrap global frozen');
ok(Boolean(selection), 'default selection exists');
eq(selection.configured, true, 'default selection configured');
eq(selection.error, null, 'default selection has no error');
ok(selection.model === context.CRIOS_LIVE_ROOM_MODEL, 'default selection exposes loaded model');
ok(Boolean(selection.client), 'default selection exposes client');
eq(selection.client.available(), true, 'default client available');
ok(Object.isFrozen(selection), 'default selection frozen');
eq(context.__fetchCount(), 0, 'bootstrap makes no network request');
eq(context.__storage.size(), 0, 'bootstrap writes no capability storage');
ok(typeof selection.client.createLiveRoom === 'function', 'client create method available');
ok(typeof selection.client.joinLiveRoom === 'function', 'client join method available');
ok(typeof selection.client.heartbeatLiveRoom === 'function', 'client heartbeat method available');
ok(typeof selection.client.getLiveRoom === 'function', 'client get method available');
ok(typeof selection.client.forgetCapability === 'function', 'client capability cleanup available');

const injectedModel = Object.freeze({ marker: 'model' });
const injectedContract = Object.freeze({ marker: 'contract' });
let factoryCalls = 0;
let capturedOptions = null;
const fakeClient = Object.freeze({
  available() { return true; },
  createLiveRoom() {},
  joinLiveRoom() {},
  heartbeatLiveRoom() {},
  getLiveRoom() {}
});
const fakeFactory = Object.freeze({
  createClient(options) { factoryCalls += 1; capturedOptions = options; return fakeClient; }
});
const injected = bootstrap.createClientSelection({
  config: { endpoint: ' https://example.test/live ', timeoutMs: 4321 },
  model: injectedModel,
  contract: injectedContract,
  clientFactory: fakeFactory
});

eq(injected.configured, true, 'injected selection configured');
eq(injected.error, null, 'injected selection no error');
ok(injected.model === injectedModel, 'injected model preserved');
ok(injected.client === fakeClient, 'injected client preserved');
eq(factoryCalls, 1, 'client factory called once');
eq(capturedOptions.endpoint, 'https://example.test/live', 'endpoint normalized before client factory');
eq(capturedOptions.timeoutMs, 4321, 'timeout forwarded');
ok(capturedOptions.contract === injectedContract, 'contract forwarded');
ok(Object.isFrozen(injected), 'injected selection frozen');

const missingConfigContext = makeContext(undefined);
delete missingConfigContext.CRIOS_CONFIG;
runFile(missingConfigContext, 'js/live-room/live-room-model.js');
runFile(missingConfigContext, 'js/live-room/remote/live-room-contract.js');
runFile(missingConfigContext, 'js/live-room/remote/live-room-client.js');
runFile(missingConfigContext, 'js/live-room/remote/live-room-browser-bootstrap.js');
eq(missingConfigContext.CRIOS_LIVE_ROOM_BROWSER.configured, false, 'missing default config is optional');
eq(missingConfigContext.CRIOS_LIVE_ROOM_BROWSER.client, null, 'missing default config has no client');
eq(missingConfigContext.CRIOS_LIVE_ROOM_BROWSER.error, null, 'missing default config has no error');

const blank = bootstrap.createClientSelection({ config: { endpoint: '', timeoutMs: 15000 }, model: injectedModel, contract: injectedContract, clientFactory: fakeFactory });
eq(blank.configured, true, 'blank endpoint considered configured');
eq(blank.client, null, 'blank endpoint has no client');
eq(blank.error.code, 'LIVE_ROOM_REMOTE_ENDPOINT_REQUIRED', 'blank endpoint fails closed');
ok(Object.isFrozen(blank.error), 'blank endpoint error frozen');

const badTimeout = bootstrap.createClientSelection({ config: { endpoint, timeoutMs: 0 }, model: injectedModel, contract: injectedContract, clientFactory: fakeFactory });
eq(badTimeout.error.code, 'LIVE_ROOM_REMOTE_CONFIG_INVALID', 'zero timeout rejected');
const nanTimeout = bootstrap.createClientSelection({ config: { endpoint, timeoutMs: 'nope' }, model: injectedModel, contract: injectedContract, clientFactory: fakeFactory });
eq(nanTimeout.error.code, 'LIVE_ROOM_REMOTE_CONFIG_INVALID', 'non numeric timeout rejected');
const arrayConfig = bootstrap.createClientSelection({ config: [], model: injectedModel, contract: injectedContract, clientFactory: fakeFactory });
eq(arrayConfig.error.code, 'LIVE_ROOM_REMOTE_CONFIG_INVALID', 'array config rejected');
const authConfig = bootstrap.createClientSelection({ config: { endpoint, writeToken: 'secret' }, model: injectedModel, contract: injectedContract, clientFactory: fakeFactory });
eq(authConfig.error.code, 'LIVE_ROOM_REMOTE_CONFIG_INVALID', 'writeToken config rejected');
const capConfig = bootstrap.createClientSelection({ config: { endpoint, capabilityToken: 'secret' }, model: injectedModel, contract: injectedContract, clientFactory: fakeFactory });
eq(capConfig.error.code, 'LIVE_ROOM_REMOTE_CONFIG_INVALID', 'capability config rejected');
ok(String(capConfig.error.metadata.keys).includes('capabilityToken'), 'unsupported key named in metadata');

const noModel = bootstrap.createClientSelection({ config: { endpoint }, model: null, contract: injectedContract, clientFactory: fakeFactory });
eq(noModel.error.code, 'LIVE_ROOM_REMOTE_MODULE_UNAVAILABLE', 'missing model rejected');
const noContract = bootstrap.createClientSelection({ config: { endpoint }, model: injectedModel, contract: null, clientFactory: fakeFactory });
eq(noContract.error.code, 'LIVE_ROOM_REMOTE_MODULE_UNAVAILABLE', 'missing contract rejected');
const noFactory = bootstrap.createClientSelection({ config: { endpoint }, model: injectedModel, contract: injectedContract, clientFactory: {} });
eq(noFactory.error.code, 'LIVE_ROOM_REMOTE_MODULE_UNAVAILABLE', 'missing client factory rejected');
const throwingFactory = { createClient() { throw new Error('boom'); } };
const thrown = bootstrap.createClientSelection({ config: { endpoint }, model: injectedModel, contract: injectedContract, clientFactory: throwingFactory });
eq(thrown.error.code, 'LIVE_ROOM_REMOTE_CLIENT_CREATE_FAILED', 'factory exception fails closed');
ok(thrown.error.message.includes('boom'), 'factory exception message retained');
const unavailableFactory = { createClient() { return { available() { return false; }, createLiveRoom(){}, joinLiveRoom(){}, heartbeatLiveRoom(){}, getLiveRoom(){} }; } };
const unavailable = bootstrap.createClientSelection({ config: { endpoint }, model: injectedModel, contract: injectedContract, clientFactory: unavailableFactory });
eq(unavailable.error.code, 'LIVE_ROOM_REMOTE_CLIENT_INVALID', 'unavailable client rejected');
const incompleteFactory = { createClient() { return { available() { return true; }, createLiveRoom(){}, joinLiveRoom(){}, heartbeatLiveRoom(){} }; } };
const incomplete = bootstrap.createClientSelection({ config: { endpoint }, model: injectedModel, contract: injectedContract, clientFactory: incompleteFactory });
eq(incomplete.error.code, 'LIVE_ROOM_REMOTE_CLIENT_INVALID', 'incomplete client rejected');

const runtimeHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const studioHtml = fs.readFileSync(path.join(root, 'studio/index.html'), 'utf8');
const runtimeScripts = [
  'js/config.js',
  'js/live-room/live-room-model.js',
  'js/live-room/remote/live-room-contract.js',
  'js/live-room/remote/live-room-client.js',
  'js/live-room/remote/live-room-browser-bootstrap.js',
  'js/crios.js'
];
const studioScripts = [
  '../js/config.js',
  '../js/live-room/live-room-model.js',
  '../js/live-room/remote/live-room-contract.js',
  '../js/live-room/remote/live-room-client.js',
  '../js/live-room/remote/live-room-browser-bootstrap.js',
  '../js/studio/studio.js?v=20260812a3003b7c2'
];

runtimeScripts.forEach((src) => ok(runtimeHtml.includes('<script src="' + src + '"></script>'), 'runtime loads ' + src));
studioScripts.forEach((src) => ok(studioHtml.includes('<script src="' + src + '"></script>'), 'studio loads ' + src));
for (let i = 1; i < runtimeScripts.length; i += 1) ok(runtimeHtml.indexOf(runtimeScripts[i - 1]) < runtimeHtml.indexOf(runtimeScripts[i]), 'runtime script order ' + i);
for (let i = 1; i < studioScripts.length; i += 1) ok(studioHtml.indexOf(studioScripts[i - 1]) < studioHtml.indexOf(studioScripts[i]), 'studio script order ' + i);
eq((runtimeHtml.match(/live-room-browser-bootstrap\.js/g) || []).length, 1, 'runtime bootstrap loaded once');
eq((studioHtml.match(/live-room-browser-bootstrap\.js/g) || []).length, 1, 'studio bootstrap loaded once');
ok(!runtimeHtml.includes('capabilityToken'), 'runtime html contains no capability token');
ok(!studioHtml.includes('capabilityToken'), 'studio html contains no capability token');
ok(!runtimeHtml.includes('createLiveRoom('), 'runtime html does not auto create room');
ok(!studioHtml.includes('createLiveRoom('), 'studio html does not auto create room');

if (total !== 75) {
  console.error('FAIL expected exactly 75 assertions, got ' + total);
  failed += 1;
}

console.log('LIVE_ROOM_BROWSER_BOOTSTRAP_TEST_STATUS=' + (failed === 0 ? 'PASS' : 'FAIL'));
console.log('LIVE_ROOM_BROWSER_BOOTSTRAP_TEST_TOTAL=' + total);
console.log('LIVE_ROOM_BROWSER_BOOTSTRAP_TEST_FAILED=' + failed);
process.exit(failed === 0 ? 0 : 1);
