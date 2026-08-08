'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const repo = path.resolve(process.argv[2] || path.join(__dirname, '..'));
global.window = global;

function load(relative) {
  vm.runInThisContext(fs.readFileSync(path.join(repo, relative), 'utf8'), { filename: relative });
}

load('js/runtime/publication/runtime-remote-publication-readers.js');

const api = global.CRIOS_RUNTIME_REMOTE_PUBLICATION_READERS;
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
async function rejectsCode(factory, code, message) {
  let caught = null;
  try { await factory(); } catch (error) { caught = error; }
  check(Boolean(caught), message + ' throws');
  equal(caught && caught.code, code, message + ' code');
}

const hash = 'a'.repeat(64);
function fixture() {
  return {
    publication: {
      campaignId: 'campaign-b4',
      publicationId: 'publication-b4-v1',
      version: 1,
      schemaVersion: '2.0',
      contentHash: hash,
      content: { nombre: 'Campaña B4' }
    },
    activeReference: {
      campaignId: 'campaign-b4',
      publicationId: 'publication-b4-v1',
      version: 1,
      contentHash: hash,
      activatedAt: '2026-08-08T12:00:00.000Z'
    }
  };
}
function successClient(data, calls) {
  return Object.freeze({
    async getPublication(campaignId, publicationId) {
      calls.push({ campaignId, publicationId });
      return Object.freeze({ success: true, requestId: 'r1', data, error: null });
    }
  });
}

(async function run(){
check(Boolean(api), 'API exists');
equal(api.version, '1.0.0', 'API version');
check(Object.isFrozen(api), 'API frozen');
check(Object.isFrozen(api.errorCodes), 'error codes frozen');
equal(Object.keys(api).sort().join(','), 'createRemotePublicationReaders,errorCodes,version', 'API exact');

{
  let caught = null;
  try { api.createRemotePublicationReaders({}); } catch (error) { caught = error; }
  check(Boolean(caught), 'missing options throw');
  equal(caught && caught.code, 'RUNTIME_REMOTE_READERS_INVALID_OPTIONS', 'missing options code');
}
{
  let caught = null;
  try { api.createRemotePublicationReaders({ remoteClient: {}, campaignId: 'c', publicationId: 'p' }); } catch (error) { caught = error; }
  equal(caught && caught.code, 'RUNTIME_REMOTE_READERS_INVALID_OPTIONS', 'client interface required');
}

{
  const calls = [];
  const data = fixture();
  const readers = api.createRemotePublicationReaders({
    remoteClient: successClient(data, calls),
    campaignId: ' campaign-b4 ',
    publicationId: ' publication-b4-v1 '
  });
  check(Object.isFrozen(readers), 'reader bundle frozen');
  equal(Object.keys(readers).sort().join(','), 'activeReferenceReader,publicationReader', 'reader bundle exact');
  const reference = await readers.activeReferenceReader('campaign-b4');
  const publication = await readers.publicationReader('publication-b4-v1', 'campaign-b4');
  equal(calls.length, 1, 'active then publication uses one remote call');
  equal(calls[0].campaignId, 'campaign-b4', 'remote campaign exact');
  equal(calls[0].publicationId, 'publication-b4-v1', 'remote publication exact');
  equal(reference.publicationId, 'publication-b4-v1', 'reference publication returned');
  equal(publication.publicationId, 'publication-b4-v1', 'publication returned');
  check(Object.isFrozen(reference), 'reference frozen');
  check(Object.isFrozen(publication), 'publication frozen');
  check(reference !== data.activeReference, 'reference defensive copy');
  check(publication !== data.publication, 'publication defensive copy');
}

{
  const calls = [];
  const data = fixture();
  const readers = api.createRemotePublicationReaders({
    remoteClient: successClient(data, calls),
    campaignId: data.publication.campaignId,
    publicationId: data.publication.publicationId
  });
  const publication = await readers.publicationReader(data.publication.publicationId, data.publication.campaignId);
  const reference = await readers.activeReferenceReader(data.publication.campaignId);
  equal(calls.length, 1, 'publication then active uses one remote call');
  equal(publication.contentHash, reference.contentHash, 'cached snapshot coherent');
}

{
  const calls = [];
  const data = fixture();
  const readers = api.createRemotePublicationReaders({
    remoteClient: successClient(data, calls),
    campaignId: data.publication.campaignId,
    publicationId: data.publication.publicationId
  });
  await rejectsCode(
    () => readers.activeReferenceReader('other-campaign'),
    'ACTIVE_REFERENCE_MISMATCH',
    'wrong campaign'
  );
  await rejectsCode(
    () => readers.publicationReader('other-publication', data.publication.campaignId),
    'PUBLICATION_IDENTITY_MISMATCH',
    'wrong publication'
  );
  await rejectsCode(
    () => readers.publicationReader(data.publication.publicationId, 'other-campaign'),
    'PUBLICATION_IDENTITY_MISMATCH',
    'wrong publication campaign'
  );
  equal(calls.length, 0, 'identity mismatch performs no remote call');
}

{
  const calls = [];
  const readers = api.createRemotePublicationReaders({
    remoteClient: Object.freeze({
      async getPublication(campaignId, publicationId) {
        calls.push({ campaignId, publicationId });
        return { success: false, data: null, error: { code: 'PUBLICATION_UNAVAILABLE' } };
      }
    }),
    campaignId: 'campaign-b4',
    publicationId: 'publication-b4-v1'
  });
  await rejectsCode(() => readers.activeReferenceReader('campaign-b4'), 'PUBLICATION_NOT_FOUND', 'server unavailable publication');
  equal(calls.length, 1, 'unavailable publication one remote call');
}

{
  const readers = api.createRemotePublicationReaders({
    remoteClient: Object.freeze({
      async getPublication() {
        return { success: false, data: null, error: { code: 'REMOTE_IDENTITY_MISMATCH' } };
      }
    }),
    campaignId: 'campaign-b4',
    publicationId: 'publication-b4-v1'
  });
  await rejectsCode(() => readers.activeReferenceReader('campaign-b4'), 'PUBLICATION_IDENTITY_MISMATCH', 'remote identity rejection');
}

{
  const readers = api.createRemotePublicationReaders({
    remoteClient: Object.freeze({
      async getPublication() {
        return { success: false, data: null, error: { code: 'REMOTE_TRANSPORT_FAILED' } };
      }
    }),
    campaignId: 'campaign-b4',
    publicationId: 'publication-b4-v1'
  });
  await rejectsCode(() => readers.activeReferenceReader('campaign-b4'), 'RUNTIME_PUBLICATION_RESOLUTION_ERROR', 'transport failure');
}

{
  const readers = api.createRemotePublicationReaders({
    remoteClient: Object.freeze({
      async getPublication() { throw new Error('transport exploded'); }
    }),
    campaignId: 'campaign-b4',
    publicationId: 'publication-b4-v1'
  });
  await rejectsCode(() => readers.activeReferenceReader('campaign-b4'), 'RUNTIME_PUBLICATION_RESOLUTION_ERROR', 'transport throw');
}

for (const mutate of [
  data => { data.publication.publicationId = 'other'; },
  data => { data.activeReference.publicationId = 'other'; },
  data => { data.activeReference.version = 2; },
  data => { data.activeReference.contentHash = 'b'.repeat(64); },
  data => { delete data.activeReference.activatedAt; },
  data => { data.extra = true; }
]) {
  const data = fixture();
  mutate(data);
  const readers = api.createRemotePublicationReaders({
    remoteClient: successClient(data, []),
    campaignId: 'campaign-b4',
    publicationId: 'publication-b4-v1'
  });
  await rejectsCode(() => readers.activeReferenceReader('campaign-b4'), 'PUBLICATION_IDENTITY_MISMATCH', 'malformed or mismatched remote snapshot');
}

const source = fs.readFileSync(path.join(repo, 'js/runtime/publication/runtime-remote-publication-readers.js'), 'utf8');
check(source.indexOf('localStorage') < 0, 'reader module has no localStorage');
check(source.indexOf('sessionStorage') < 0, 'reader module has no sessionStorage');
check(source.indexOf('fetch(') < 0, 'reader module has no direct fetch');
check(source.indexOf('XMLHttpRequest') < 0, 'reader module has no XMLHttpRequest');
check(source.indexOf('writeToken') < 0, 'reader module has no write token');

console.log('RUNTIME_REMOTE_PUBLICATION_READERS_TEST_STATUS=' + (failed ? 'FAIL' : 'PASS'));
console.log('RUNTIME_REMOTE_PUBLICATION_READERS_TEST_TOTAL=' + total);
console.log('RUNTIME_REMOTE_PUBLICATION_READERS_TEST_FAILED=' + failed);
console.log('RUNTIME_REMOTE_READERS_SINGLE_FETCH_CACHE=true');
console.log('RUNTIME_REMOTE_READERS_EXACT_IDENTITY=true');
console.log('RUNTIME_REMOTE_READERS_LOCAL_STORAGE=false');
console.log('RUNTIME_REMOTE_READERS_DIRECT_NETWORK=false');
if (failed) process.exit(1);
})().catch(error => {
  console.error('RUNTIME_REMOTE_PUBLICATION_READERS_TEST_STATUS=FAIL');
  console.error(String(error && error.stack || error));
  process.exit(1);
});
