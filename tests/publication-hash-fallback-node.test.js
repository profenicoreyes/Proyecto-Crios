'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const { TextEncoder } = require('util');

const repo = path.resolve(process.argv[2] || process.cwd());
const source = fs.readFileSync(path.join(repo, 'js/publication/publication-hash.js'), 'utf8');

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

function expectedHash(value) {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

function createContext(cryptoValue) {
  const context = {
    console,
    TextEncoder,
    Uint8Array,
    Uint32Array,
    ArrayBuffer,
    Math,
    Object,
    String,
    Number,
    Error,
    Promise,
    Set,
    Map,
    crypto: cryptoValue,
    CRIOS_PUBLICATION_CORE: {
      __internals: {
        buildCanonicalContent: function(){ return ''; },
        constants: { errorCodes: { HASH_FAILED: 'HASH_FAILED' } },
        createCoreError: function(code, message, metadata) {
          const error = new Error(String(message || code));
          error.code = code;
          error.metadata = metadata || null;
          return error;
        }
      }
    }
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(source, context, { filename: 'publication-hash.js' });
  return context;
}

async function run() {
  const fallback = createContext({});
  const hash = fallback.CRIOS_PUBLICATION_CORE.__internals.calculateContentHash;

  equal(await hash(''), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', 'empty-string NIST vector');
  equal(await hash('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad', 'abc NIST vector');
  equal(await hash('The quick brown fox jumps over the lazy dog'), 'd7a8fbb307d7809469ca9abcb0082e4f8d5651e46d3cdb762d02d0bf37c9e592', 'quick-brown-fox vector');

  const unicode = 'CRIOS · Antártida · 7.º grado · matemática 🧊';
  equal(await hash(unicode), expectedHash(unicode), 'UTF-8 fallback matches Node SHA-256');

  const multiBlock = 'a'.repeat(1000);
  equal(await hash(multiBlock), expectedHash(multiBlock), 'multi-block fallback matches Node SHA-256');

  const canonical = JSON.stringify({ content: { missions: ['ice', 'hangar'], note: 'B6C' }, schemaVersion: '2.0' });
  const canonicalHash = await hash(canonical);
  equal(canonicalHash, expectedHash(canonical), 'canonical-like payload matches Node SHA-256');
  check(/^[0-9a-f]{64}$/.test(canonicalHash), 'fallback output is lowercase 64-char hex');
  equal(await hash(canonical), canonicalHash, 'fallback is deterministic');

  let injectedFailure = null;
  try {
    await hash('ok', { digest: async function(){ throw new Error('forced digest failure'); } });
  } catch (error) {
    injectedFailure = error;
  }
  equal(injectedFailure && injectedFailure.code, 'HASH_FAILED', 'explicit failing digest still maps to HASH_FAILED');
  check(Boolean(injectedFailure && injectedFailure.metadata && /forced digest failure/.test(injectedFailure.metadata.message)), 'HASH_FAILED retains digest failure metadata');

  let subtleCalls = 0;
  let subtleAlgorithm = '';
  const subtle = createContext({
    subtle: {
      digest: async function(algorithm) {
        subtleCalls += 1;
        subtleAlgorithm = algorithm;
        return new Uint8Array(32).fill(0xab);
      }
    }
  });
  const subtleHash = subtle.CRIOS_PUBLICATION_CORE.__internals.calculateContentHash;
  equal(await subtleHash('web-crypto-preferred'), 'ab'.repeat(32), 'Web Crypto result is preferred when available');
  equal(subtleCalls, 1, 'Web Crypto digest called exactly once');
  equal(subtleAlgorithm, 'SHA-256', 'Web Crypto called with SHA-256');

  const noSubtle = createContext({ subtle: null });
  equal(await noSubtle.CRIOS_PUBLICATION_CORE.__internals.calculateContentHash('abc'), expectedHash('abc'), 'null subtle falls back successfully');

  const noCrypto = createContext(null);
  equal(await noCrypto.CRIOS_PUBLICATION_CORE.__internals.calculateContentHash('abc'), expectedHash('abc'), 'missing crypto falls back successfully');

  console.log('PUBLICATION_HASH_FALLBACK_NODE_TEST_STATUS=' + (failed === 0 ? 'PASS' : 'FAIL'));
  console.log('PUBLICATION_HASH_FALLBACK_NODE_TEST_TOTAL=' + total);
  console.log('PUBLICATION_HASH_FALLBACK_NODE_TEST_FAILED=' + failed);
  console.log('PUBLICATION_HASH_FALLBACK_WEB_CRYPTO_PREFERRED=true');
  console.log('PUBLICATION_HASH_FALLBACK_INSECURE_HTTP_SUPPORTED=true');
  process.exitCode = failed === 0 ? 0 : 1;
}

run().catch(function(error) {
  console.error(error && error.stack ? error.stack : error);
  console.log('PUBLICATION_HASH_FALLBACK_NODE_TEST_STATUS=FAIL');
  console.log('PUBLICATION_HASH_FALLBACK_NODE_TEST_TOTAL=' + total);
  console.log('PUBLICATION_HASH_FALLBACK_NODE_TEST_FAILED=' + (failed + 1));
  process.exitCode = 1;
});
