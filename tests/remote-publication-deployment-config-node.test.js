'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const repo = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const configSource = fs.readFileSync(path.join(repo, 'js/config.js'), 'utf8');
const authSource = fs.readFileSync(path.join(repo, 'js/studio/publication/studio-write-auth.js'), 'utf8');
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

function contextWith(configExpression, withAuth, promptImpl) {
  const window = {};
  window.window = window;
  if (promptImpl) window.prompt = promptImpl;
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
  if (withAuth) vm.runInContext(authSource, context, { filename: 'studio-write-auth.js' });
  vm.runInContext(bridgeSource, context, { filename: 'remote-publication-deployment-config.js' });
  return window;
}

{
  const window = contextWith('repo', false);
  check(Boolean(window.CRIOS_REMOTE_PUBLICATION_DEPLOYMENT_CONFIG), 'bridge API exists');
  equal(window.CRIOS_REMOTE_PUBLICATION_DEPLOYMENT_CONFIG.version, '1.0.0', 'bridge version');
  check(Boolean(window.CRIOS_RUNTIME_REMOTE_PUBLICATION_CONFIG), 'deployed repository endpoint configures Runtime');
  equal(window.CRIOS_RUNTIME_REMOTE_PUBLICATION_CONFIG.endpoint, 'https://script.google.com/macros/s/AKfycbwq4tKzIuPfJJ2tOEAHpEhLsg7tmWvPYQ5fJ8jLgo74lo1BT0Fw_eNgtE53VsMb_e33bA/exec', 'Runtime uses deployed publication endpoint');
  equal(window.CRIOS_RUNTIME_REMOTE_PUBLICATION_CONFIG.timeoutMs, 15000, 'Runtime uses configured publication timeout');
  check(!Object.prototype.hasOwnProperty.call(window.CRIOS_RUNTIME_REMOTE_PUBLICATION_CONFIG, 'writeToken'), 'deployed Runtime remains secret-free');
  check(!Object.prototype.hasOwnProperty.call(window.CRIOS_RUNTIME_REMOTE_PUBLICATION_CONFIG, 'writeTokenProvider'), 'deployed Runtime has no teacher provider');
  check(!Object.prototype.hasOwnProperty.call(window, 'CRIOS_STUDIO_REMOTE_PUBLICATION_CONFIG'), 'Studio config remains absent when auth factory is unavailable');
}

{
  const prompts = [];
  const token = 'crios123';
  const window = contextWith('repo', true, (message) => {
    prompts.push(message);
    return token;
  });
  const studio = window.CRIOS_STUDIO_REMOTE_PUBLICATION_CONFIG;
  check(Boolean(studio), 'deployed repository endpoint configures Studio when auth factory exists');
  equal(studio.endpoint, 'https://script.google.com/macros/s/AKfycbwq4tKzIuPfJJ2tOEAHpEhLsg7tmWvPYQ5fJ8jLgo74lo1BT0Fw_eNgtE53VsMb_e33bA/exec', 'Studio uses deployed publication endpoint');
  equal(studio.timeoutMs, 15000, 'Studio uses configured publication timeout');
  equal(prompts.length, 0, 'deployed Studio provider remains lazy');
  equal(studio.writeTokenProvider(), token, 'deployed Studio provider resolves teacher token at write time');
  equal(prompts.length, 1, 'deployed Studio provider prompts exactly on write');
}

{
  const cfg = {
    publicationEndpoint: '  https://publication.example/exec  ',
    publicationTimeoutMs: 4321,
    resultsEndpoint: 'https://results.example/exec'
  };
  const prompts = [];
  const token = 'teacher-' + 'z'.repeat(40);
  const window = contextWith(cfg, true, (message) => {
    prompts.push(message);
    return token;
  });
  const runtime = window.CRIOS_RUNTIME_REMOTE_PUBLICATION_CONFIG;
  const studio = window.CRIOS_STUDIO_REMOTE_PUBLICATION_CONFIG;

  check(Object.isFrozen(runtime), 'runtime deployment config frozen');
  equal(Object.keys(runtime).sort().join(','), 'endpoint,timeoutMs', 'runtime config exact');
  equal(runtime.endpoint, 'https://publication.example/exec', 'runtime uses publication endpoint');
  equal(runtime.timeoutMs, 4321, 'runtime timeout forwarded');
  check(!Object.prototype.hasOwnProperty.call(runtime, 'writeToken'), 'runtime no literal secret');
  check(!Object.prototype.hasOwnProperty.call(runtime, 'writeTokenProvider'), 'runtime no provider');

  check(Object.isFrozen(studio), 'studio deployment config frozen');
  equal(Object.keys(studio).sort().join(','), 'endpoint,timeoutMs,writeTokenProvider', 'studio config exact');
  equal(studio.endpoint, 'https://publication.example/exec', 'studio uses publication endpoint');
  equal(studio.timeoutMs, 4321, 'studio timeout forwarded');
  check(typeof studio.writeTokenProvider === 'function', 'studio provider installed');
  equal(prompts.length, 0, 'provider not read during composition');
  equal(studio.writeTokenProvider(), token, 'provider resolves token only at write time');
  equal(prompts.length, 1, 'provider prompts on write');

  check(runtime.endpoint !== cfg.resultsEndpoint, 'publication bridge does not reuse results endpoint');
}

{
  const cfg = { publicationEndpoint: 'https://publication.example/exec', publicationTimeoutMs: -1 };
  const window = contextWith(cfg, false);
  equal(window.CRIOS_RUNTIME_REMOTE_PUBLICATION_CONFIG.timeoutMs, 15000, 'invalid timeout uses safe default');
  check(!Object.prototype.hasOwnProperty.call(window, 'CRIOS_STUDIO_REMOTE_PUBLICATION_CONFIG'), 'studio config absent when auth factory unavailable');
}

check(bridgeSource.indexOf('resultsEndpoint') < 0, 'bridge source never reads resultsEndpoint');
check(bridgeSource.indexOf('writeToken:') < 0, 'bridge contains no literal write token');
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
check(mainOrder.every((index, i) => i === 0 || index > mainOrder[i - 1]), 'main deployment script order is safe');

const studioOrder = [
  '../js/config.js',
  '../js/publication/remote/remote-publication-client.js',
  '../js/studio/publication/studio-write-auth.js',
  '../js/publication/remote/remote-publication-deployment-config.js',
  '../js/studio/publication/studio-remote-publication-bootstrap.js',
  '../js/studio/studio.js'
].map((src) => studioHtml.indexOf(src));
check(studioOrder.every((index) => index >= 0), 'Studio loads deployment/auth dependencies');
check(studioOrder.every((index, i) => i === 0 || index > studioOrder[i - 1]), 'Studio deployment script order is safe');

const repoConfigEndpoint = /publicationEndpoint:\s*'([^']*)'/.exec(configSource);
check(Boolean(repoConfigEndpoint), 'repository publicationEndpoint declared');
equal(repoConfigEndpoint && repoConfigEndpoint[1], 'https://script.google.com/macros/s/AKfycbwq4tKzIuPfJJ2tOEAHpEhLsg7tmWvPYQ5fJ8jLgo74lo1BT0Fw_eNgtE53VsMb_e33bA/exec', 'repository publicationEndpoint matches controlled deployment');
check(repoConfigEndpoint && repoConfigEndpoint[1] !== /resultsEndpoint:\s*'([^']*)'/.exec(configSource)[1], 'repository publication endpoint remains separate from results endpoint');

console.log('REMOTE_DEPLOYMENT_CONFIG_TEST_STATUS=' + (failed ? 'FAIL' : 'PASS'));
console.log('REMOTE_DEPLOYMENT_CONFIG_TEST_TOTAL=' + total);
console.log('REMOTE_DEPLOYMENT_CONFIG_TEST_FAILED=' + failed);
console.log('REMOTE_DEPLOYMENT_ENDPOINT_SEPARATE_FROM_RESULTS=true');
console.log('REMOTE_DEPLOYMENT_RUNTIME_SECRET_FREE=true');
console.log('REMOTE_DEPLOYMENT_STUDIO_PROVIDER_LAZY=true');
console.log('REMOTE_DEPLOYMENT_PRODUCTION_ENDPOINT_CONFIGURED=true');
if (failed) process.exit(1);
