'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const repo = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const configSource = fs.readFileSync(path.join(repo, 'js/config.js'), 'utf8');
const bridgeSource = fs.readFileSync(path.join(repo, 'js/publication/remote/remote-publication-deployment-config.js'), 'utf8');

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

function contextWith(configExpression) {
  const window = {};
  window.window = window;
  const context = vm.createContext({
    window,
    Object,
    String,
    Boolean,
    Number,
    Array,
    RegExp,
    Error,
    Math
  });
  if (configExpression === 'repo') {
    vm.runInContext(configSource, context, { filename: 'config.js' });
  } else {
    vm.runInContext('const CRIOS_CONFIG = Object.freeze(' + JSON.stringify(configExpression) + ');', context);
  }
  vm.runInContext(bridgeSource, context, { filename: 'remote-publication-deployment-config.js' });
  return window;
}

{
  const window = contextWith('repo');
  check(Boolean(window.CRIOS_REMOTE_PUBLICATION_DEPLOYMENT_CONFIG), 'bridge API exists');
  equal(window.CRIOS_REMOTE_PUBLICATION_DEPLOYMENT_CONFIG.version, '1.0.0', 'bridge version');

  const runtime = window.CRIOS_RUNTIME_REMOTE_PUBLICATION_CONFIG;
  const studio = window.CRIOS_STUDIO_REMOTE_PUBLICATION_CONFIG;
  check(Boolean(runtime), 'repository endpoint configures Runtime');
  check(Boolean(studio), 'repository endpoint configures Studio without auth module');
  equal(runtime.endpoint, 'https://script.google.com/macros/s/AKfycbwq4tKzIuPfJJ2tOEAHpEhLsg7tmWvPYQ5fJ8jLgo74lo1BT0Fw_eNgtE53VsMb_e33bA/exec', 'Runtime uses deployed endpoint');
  equal(studio.endpoint, runtime.endpoint, 'Studio uses same publication endpoint');
  equal(runtime.timeoutMs, 15000, 'Runtime timeout configured');
  equal(studio.timeoutMs, 15000, 'Studio timeout configured');
  equal(Object.keys(runtime).sort().join(','), 'endpoint,timeoutMs', 'Runtime config exact');
  equal(Object.keys(studio).sort().join(','), 'endpoint,timeoutMs', 'Studio config exact');
  check(Object.isFrozen(runtime), 'Runtime config frozen');
  check(Object.isFrozen(studio), 'Studio config frozen');
}

{
  const cfg = {
    publicationEndpoint: '  https://publication.example/exec  ',
    publicationTimeoutMs: 4321,
    resultsEndpoint: 'https://results.example/exec'
  };
  const window = contextWith(cfg);
  const runtime = window.CRIOS_RUNTIME_REMOTE_PUBLICATION_CONFIG;
  const studio = window.CRIOS_STUDIO_REMOTE_PUBLICATION_CONFIG;
  equal(runtime.endpoint, 'https://publication.example/exec', 'Runtime endpoint normalized');
  equal(studio.endpoint, 'https://publication.example/exec', 'Studio endpoint normalized');
  equal(runtime.timeoutMs, 4321, 'Runtime timeout forwarded');
  equal(studio.timeoutMs, 4321, 'Studio timeout forwarded');
  check(runtime.endpoint !== cfg.resultsEndpoint, 'publication bridge does not reuse results endpoint');
}

{
  const cfg = { publicationEndpoint: 'https://publication.example/exec', publicationTimeoutMs: -1 };
  const window = contextWith(cfg);
  equal(window.CRIOS_RUNTIME_REMOTE_PUBLICATION_CONFIG.timeoutMs, 15000, 'invalid timeout uses safe default in Runtime');
  equal(window.CRIOS_STUDIO_REMOTE_PUBLICATION_CONFIG.timeoutMs, 15000, 'invalid timeout uses safe default in Studio');
}

{
  const window = contextWith({ publicationEndpoint: '   ', publicationTimeoutMs: 1000 });
  check(!Object.prototype.hasOwnProperty.call(window, 'CRIOS_RUNTIME_REMOTE_PUBLICATION_CONFIG'), 'blank endpoint does not configure Runtime');
  check(!Object.prototype.hasOwnProperty.call(window, 'CRIOS_STUDIO_REMOTE_PUBLICATION_CONFIG'), 'blank endpoint does not configure Studio');
}

check(bridgeSource.indexOf('resultsEndpoint') < 0, 'bridge source never reads resultsEndpoint');
check(bridgeSource.indexOf('writeToken') < 0, 'bridge contains no write token');
check(bridgeSource.indexOf('writeTokenProvider') < 0, 'bridge contains no write-token provider');
check(bridgeSource.indexOf('CRIOS_STUDIO_WRITE_AUTH') < 0, 'bridge has no teacher auth dependency');
check(bridgeSource.indexOf('prompt(') < 0, 'bridge never prompts');
check(bridgeSource.indexOf('localStorage') < 0, 'bridge has no localStorage');
check(bridgeSource.indexOf('sessionStorage') < 0, 'bridge has no sessionStorage');
check(bridgeSource.indexOf('fetch(') < 0, 'bridge has no network');

const mainHtml = fs.readFileSync(path.join(repo, 'index.html'), 'utf8');
const studioHtml = fs.readFileSync(path.join(repo, 'studio/index.html'), 'utf8');

const mainOrder = [
  'js/config.js',
  'js/publication/remote/remote-publication-client.js',
  'js/publication/remote/remote-publication-deployment-config.js',
  'js/runtime/publication/runtime-remote-publication-bootstrap.js',
  'js/crios.js'
].map((src) => mainHtml.indexOf(src));
check(mainOrder.every((index) => index >= 0), 'main page loads deployment dependencies');
check(mainOrder.every((index, i) => i === 0 || index > mainOrder[i - 1]), 'main deployment script order safe');

const studioOrder = [
  '../js/config.js',
  '../js/publication/remote/remote-publication-client.js',
  '../js/publication/remote/remote-publication-deployment-config.js',
  '../js/studio/publication/studio-remote-publication-bootstrap.js',
  '../js/studio/studio.js'
].map((src) => studioHtml.indexOf(src));
check(studioOrder.every((index) => index >= 0), 'Studio loads anonymous publication dependencies');
check(studioOrder.every((index, i) => i === 0 || index > studioOrder[i - 1]), 'Studio deployment script order safe');
check(studioHtml.indexOf('../js/studio/publication/studio-write-auth.js') < 0, 'Studio no longer loads teacher auth module');
check(!fs.existsSync(path.join(repo, 'js/studio/publication/studio-write-auth.js')), 'teacher auth module removed');

const repoConfigEndpoint = /publicationEndpoint:\s*'([^']*)'/.exec(configSource);
check(Boolean(repoConfigEndpoint), 'repository publicationEndpoint declared');
equal(repoConfigEndpoint && repoConfigEndpoint[1], 'https://script.google.com/macros/s/AKfycbwq4tKzIuPfJJ2tOEAHpEhLsg7tmWvPYQ5fJ8jLgo74lo1BT0Fw_eNgtE53VsMb_e33bA/exec', 'repository publicationEndpoint matches controlled deployment');
check(repoConfigEndpoint && repoConfigEndpoint[1] !== /resultsEndpoint:\s*'([^']*)'/.exec(configSource)[1], 'publication endpoint remains separate from results endpoint');

console.log('REMOTE_DEPLOYMENT_CONFIG_TEST_STATUS=' + (failed ? 'FAIL' : 'PASS'));
console.log('REMOTE_DEPLOYMENT_CONFIG_TEST_TOTAL=' + total);
console.log('REMOTE_DEPLOYMENT_CONFIG_TEST_FAILED=' + failed);
console.log('REMOTE_DEPLOYMENT_ENDPOINT_SEPARATE_FROM_RESULTS=true');
console.log('REMOTE_DEPLOYMENT_RUNTIME_SECRET_FREE=true');
console.log('REMOTE_DEPLOYMENT_STUDIO_SECRET_FREE=true');
console.log('REMOTE_DEPLOYMENT_STUDIO_AUTH_MODULE_REQUIRED=false');
console.log('REMOTE_DEPLOYMENT_PRODUCTION_ENDPOINT_CONFIGURED=true');
if (failed) process.exit(1);
