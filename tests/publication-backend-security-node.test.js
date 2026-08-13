'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

const repo = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const source = fs.readFileSync(path.join(repo, 'backend/google-apps-script/PublicationBackend.gs'), 'utf8');

let properties = Object.create(null);
const context = {
  console,
  Object,
  Array,
  Number,
  String,
  Boolean,
  Date,
  JSON,
  Math,
  RegExp,
  Error,
  Set,
  Map,
  PropertiesService: {
    getScriptProperties() {
      return {
        getProperty(name) {
          return Object.prototype.hasOwnProperty.call(properties, name) ? properties[name] : null;
        }
      };
    }
  },
  Utilities: {
    DigestAlgorithm: { SHA_256: 'SHA_256' },
    Charset: { UTF_8: 'UTF_8' },
    computeDigest(algorithm, text) {
      if (algorithm !== 'SHA_256') throw new Error('unexpected algorithm');
      return Array.from(crypto.createHash('sha256').update(String(text), 'utf8').digest());
    }
  }
};
context.global = context;
vm.createContext(context);
vm.runInContext(source, context, { filename: 'PublicationBackend.gs' });

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
function sha(value) {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}
function authorize(token) {
  return context.autorizarEscrituraPublicacionRemota({ writeToken: token });
}

check(typeof context.autorizarEscrituraPublicacionRemota === 'function', 'authorization function exists');

properties = {};
equal(authorize('x'.repeat(48)), false, 'missing hash property fails closed');

properties = { CRIOS_PUBLICATION_WRITE_TOKEN_SHA256: 'not-a-hash' };
equal(authorize('x'.repeat(48)), false, 'invalid stored hash fails closed');

properties = {
  CRIOS_PUBLICATION_WRITE_TOKEN: 'legacy-secret-that-must-not-be-used',
  CRIOS_PUBLICATION_WRITE_TOKEN_SHA256: ''
};
equal(authorize('legacy-secret-that-must-not-be-used'), false, 'legacy raw token property is ignored');

const validToken = 'teacher-token-' + 'a'.repeat(48);
properties = { CRIOS_PUBLICATION_WRITE_TOKEN_SHA256: sha(validToken) };
equal(authorize(validToken), true, 'correct teacher token accepted');
equal(authorize(validToken + 'x'), false, 'wrong teacher token rejected');
const unrestrictedToken = ' a!\nZ9? ';
properties = { CRIOS_PUBLICATION_WRITE_TOKEN_SHA256: sha(unrestrictedToken) };
equal(authorize(unrestrictedToken), true, '8+ character token with whitespace/control/symbols accepted exactly');
properties = { CRIOS_PUBLICATION_WRITE_TOKEN_SHA256: sha(validToken) };
equal(authorize('1234567'), false, 'teacher token shorter than 8 rejected');
equal(authorize('12345678'), false, 'wrong 8-character teacher token rejected without format restrictions');
equal(authorize('x'.repeat(257)), false, 'oversized teacher token rejected');
equal(authorize('x'.repeat(31) + '\n'), false, 'control character rejected');
equal(context.autorizarEscrituraPublicacionRemota({}), false, 'missing context token rejected');
equal(context.autorizarEscrituraPublicacionRemota(null), false, 'null context rejected');

const differentToken = 'teacher-token-' + 'b'.repeat(48);
properties = { CRIOS_PUBLICATION_WRITE_TOKEN_SHA256: sha(differentToken) };
equal(authorize(validToken), false, 'rotated token invalidates previous token');
equal(authorize(differentToken), true, 'rotated token accepted');

check(source.includes("CRIOS_PUBLICATION_WRITE_TOKEN_SHA256"), 'hashed token property name present');
check(!source.includes("getProperty(CRIOS_PUBLICATION_WRITE_TOKEN_PROPERTY)"), 'legacy raw property lookup absent');
check(!/CRIOS_PUBLICATION_WRITE_TOKEN_PROPERTY\s*=/.test(source), 'legacy raw token constant absent');
check(source.includes('sha256PublicacionRemota(recibido)'), 'received token hashed before comparison');
check(source.includes('compararConstantePublicacionRemota'), 'constant comparison retained');

const processStart = source.indexOf('function procesarSolicitudPublicacionRemota');
const processEnd = source.indexOf('function esEnvelopePostPublicacionRemota', processStart);
const processSource = processStart >= 0 && processEnd > processStart ? source.slice(processStart, processEnd) : '';
check(processStart >= 0 && processEnd > processStart, 'remote request processing function located');
check(!processSource.includes('autorizarEscrituraPublicacionRemota('), 'normal publish path no longer calls teacher authorization');
check(source.includes('CRIOS_PUBLICATION_ANONYMOUS_RATE_LIMIT = 30'), 'anonymous publication rate limit declared');
check(source.includes('CRIOS_PUBLICATION_ANONYMOUS_RATE_WINDOW_SECONDS = 60'), 'anonymous rate window declared');
check(source.includes('CRIOS_PUBLICATION_MAX_STORED_PUBLICATIONS = 5000'), 'anonymous storage capacity declared');
check(source.includes('consumirCupoPublicacionAnonimaRemota'), 'anonymous rate guard implemented');
check(source.includes('validarCupoNuevaPublicacionRemota'), 'new publication capacity guard implemented');
check(source.includes("WRITE_RATE_LIMITED: 'WRITE_RATE_LIMITED'"), 'rate-limit error code declared');
check(source.includes("WRITE_CAPACITY_REACHED: 'WRITE_CAPACITY_REACHED'"), 'capacity error code declared');

console.log('PUBLICATION_BACKEND_SECURITY_TEST_STATUS=' + (failed ? 'FAIL' : 'PASS'));
console.log('PUBLICATION_BACKEND_SECURITY_TEST_TOTAL=' + total);
console.log('PUBLICATION_BACKEND_SECURITY_TEST_FAILED=' + failed);
console.log('PUBLICATION_BACKEND_NORMAL_PATH_TEACHER_AUTH=false');
console.log('PUBLICATION_BACKEND_ANONYMOUS_RATE_LIMIT=30_PER_60_SECONDS');
console.log('PUBLICATION_BACKEND_STORAGE_LIMIT=5000_PUBLICATIONS');
console.log('PUBLICATION_BACKEND_LEGACY_AUTH_HELPER_RETAINED_DEAD=true');
console.log('PUBLICATION_BACKEND_RAW_TOKEN_STORED=false');
if (failed) process.exit(1);
