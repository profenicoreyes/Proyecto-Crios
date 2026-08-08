'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const repo = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const source = fs.readFileSync(path.join(repo, 'js/studio/publication/studio-write-auth.js'), 'utf8');

function load(promptImpl) {
  const window = { prompt: promptImpl };
  window.window = window;
  const context = vm.createContext({ window, Object, String, Boolean, Number, Array, RegExp, Error });
  vm.runInContext(source, context, { filename: 'studio-write-auth.js' });
  return window.CRIOS_STUDIO_WRITE_AUTH;
}

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

const calls = [];
const tokenA = 'teacher-' + 'a'.repeat(40);
const tokenB = 'teacher-' + 'b'.repeat(40);
const queue = [tokenA, tokenB];
const api = load((message) => {
  calls.push(message);
  return queue.shift();
});

check(Boolean(api), 'write auth API exists');
equal(api.version, '1.0.0', 'write auth version exact');
equal(Object.keys(api).sort().join(','), 'createPromptProvider,version', 'write auth API exact');
check(Object.isFrozen(api), 'write auth API frozen');

const provider = api.createPromptProvider();
check(typeof provider === 'function', 'provider created');
equal(provider(), tokenA, 'first prompt returns first token');
equal(provider(), tokenB, 'second write prompts again instead of caching');
equal(calls.length, 2, 'prompt invoked for every write');
check(calls.every((message) => /No se guarda/.test(message)), 'default prompt states non-persistence');

const invalidValues = [null, '', '1234567', 'x'.repeat(257)];
for (const value of invalidValues) {
  const local = api.createPromptProvider({ promptImpl: () => value });
  equal(local(), '', 'invalid/cancelled token fails closed');
}

const eightCharToken = '12345678';
const eightCharProvider = api.createPromptProvider({ promptImpl: () => eightCharToken });
equal(eightCharProvider(), eightCharToken, 'exactly 8 characters accepted');

const customToken = ' a!\nZ9? ';
let customMessage = '';
const custom = api.createPromptProvider({
  message: 'Autorización docente',
  promptImpl(message) {
    customMessage = message;
    return customToken;
  }
});
equal(custom(), customToken, 'provider preserves unrestricted valid token exactly');
equal(customMessage, 'Autorización docente', 'custom prompt message respected');

const noPrompt = load(undefined);
const noPromptProvider = noPrompt.createPromptProvider({ promptImpl: null });
equal(noPromptProvider(), '', 'missing prompt fails closed');

check(source.indexOf('localStorage') < 0, 'auth module does not use localStorage');
check(source.indexOf('sessionStorage') < 0, 'auth module does not use sessionStorage');
check(source.indexOf('indexedDB') < 0, 'auth module does not use indexedDB');
check(source.indexOf('document.cookie') < 0, 'auth module does not use cookies');
check(source.indexOf('fetch(') < 0, 'auth module has no network');
check(source.indexOf('console.') < 0, 'auth module does not log token');
check(source.indexOf('writeToken:') < 0, 'auth module exposes no token property');

console.log('STUDIO_WRITE_AUTH_TEST_STATUS=' + (failed ? 'FAIL' : 'PASS'));
console.log('STUDIO_WRITE_AUTH_TEST_TOTAL=' + total);
console.log('STUDIO_WRITE_AUTH_TEST_FAILED=' + failed);
console.log('STUDIO_WRITE_AUTH_PROMPTS_EVERY_WRITE=true');
console.log('STUDIO_WRITE_AUTH_PERSISTENCE=false');
console.log('STUDIO_WRITE_AUTH_NETWORK=false');
console.log('STUDIO_WRITE_AUTH_SECRET_EMBEDDED=false');
if (failed) process.exit(1);
