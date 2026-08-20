'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = process.argv[2] || path.resolve(__dirname, '..');
const sourcePath = path.join(root, 'js/live-room/live-room-game-state-outbox.js');
const source = fs.readFileSync(sourcePath, 'utf8');
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
  ok(JSON.stringify(actual) === JSON.stringify(expected), label +
    ' expected=' + JSON.stringify(expected) + ' actual=' + JSON.stringify(actual));
}

function makeStorage(initial) {
  const values = new Map(initial || []);
  return {
    get length() { return values.size; },
    key(index) { return Array.from(values.keys())[index] ?? null; },
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(String(key), String(value)); },
    removeItem(key) { values.delete(String(key)); },
    values
  };
}

function load(storage) {
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
    encodeURIComponent,
    sessionStorage: storage
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(source, context, {filename: sourcePath});
  return context.CRIOS_LIVE_ROOM_GAME_STATE_OUTBOX;
}

const contextValue = {
  roomId: 'room-1',
  campaignId: 'campaign-1',
  publicationId: 'publication-1',
  participantId: 'player-1',
  missionOrder: ['energy', 'greenhouse', 'ice']
};
const createdAt = '2026-08-18T12:00:00.000Z';
const attemptedAt = '2026-08-18T12:01:00.000Z';

const storage = makeStorage();
const api = load(storage);
ok(Boolean(api), 'outbox API exists');
eq(api.version, '1.0.0', 'outbox API version');
eq(api.recordVersion, 1, 'outbox record version');
ok(api.keyPrefix.startsWith('crios-live-room-game-state-outbox-v1:'), 'outbox key namespace');
ok(Object.isFrozen(api), 'outbox API frozen');
ok(Object.isFrozen(api.errorCodes), 'outbox error codes frozen');

const outbox = api.createOutbox({context: contextValue, storage});
ok(outbox.available(), 'valid outbox available');
ok(Object.isFrozen(outbox), 'outbox instance frozen');
eq(Object.keys(outbox).sort(), [
  'acknowledge',
  'available',
  'clear',
  'enqueue',
  'list',
  'markAttempt',
  'pruneOtherContexts',
  'version'
], 'outbox API narrow');

let result = outbox.list();
ok(result.success, 'empty outbox lists successfully');
eq(result.data.pendingCount, 0, 'empty outbox pending count');
eq(result.data.items, [], 'empty outbox items');
eq(result.data.context, {
  roomId: contextValue.roomId,
  campaignId: contextValue.campaignId,
  publicationId: contextValue.publicationId,
  participantId: contextValue.participantId
}, 'stored context excludes mission order');
eq(storage.values.size, 0, 'empty read creates no physical record');
ok(Object.isFrozen(result) && Object.isFrozen(result.data.items), 'list result deeply frozen');

result = outbox.enqueue({requestId: 'request-energy', missionId: 'energy', createdAt});
ok(result.success, 'first mission enqueued');
eq(result.data.added, true, 'first mission added');
eq(result.data.pendingCount, 1, 'first mission pending count');
eq(result.data.item, {
  requestId: 'request-energy',
  missionId: 'energy',
  createdAt,
  attemptCount: 0,
  lastAttemptAt: null
}, 'first item exact shape');
ok(Object.isFrozen(result) && Object.isFrozen(result.data.item), 'enqueue result deeply frozen');
eq(storage.values.size, 1, 'first enqueue persists one context record');

const currentKey = Array.from(storage.values.keys())[0];
ok(currentKey.startsWith(api.keyPrefix), 'persisted key uses dedicated prefix');
const stored = JSON.parse(storage.values.get(currentKey));
eq(Object.keys(stored).sort(), ['context', 'items', 'version'], 'record exact keys');
eq(Object.keys(stored.context).sort(), ['campaignId', 'participantId', 'publicationId', 'roomId'], 'record context exact keys');
eq(Object.keys(stored.items[0]).sort(), ['attemptCount', 'createdAt', 'lastAttemptAt', 'missionId', 'requestId'], 'record item exact keys');
eq(stored.version, 1, 'record physical version');
ok(!JSON.stringify(stored).includes('capability'), 'record contains no capability');
ok(!JSON.stringify(stored).includes('answer'), 'record contains no answer');

const rawBeforeDuplicate = storage.values.get(currentKey);
result = outbox.enqueue({requestId: 'request-energy-other', missionId: 'energy', createdAt: attemptedAt});
ok(result.success, 'duplicate mission accepted idempotently');
eq(result.data.added, false, 'duplicate mission not added');
eq(result.data.item.requestId, 'request-energy', 'duplicate mission retains original requestId');
eq(storage.values.get(currentKey), rawBeforeDuplicate, 'duplicate mission does not rewrite record');

result = outbox.enqueue({requestId: 'request-energy', missionId: 'greenhouse', createdAt});
ok(!result.success, 'duplicate requestId for another mission rejected');
eq(result.error.code, api.errorCodes.ITEM_INVALID, 'duplicate requestId error');
result = outbox.enqueue({requestId: 'request-greenhouse', missionId: 'greenhouse', createdAt});
ok(result.success && result.data.added, 'second mission enqueued');
eq(result.data.pendingCount, 2, 'two pending missions');

result = outbox.markAttempt('request-energy', attemptedAt);
ok(result.success, 'attempt persisted');
eq(result.data.item.attemptCount, 1, 'attempt count incremented');
eq(result.data.item.lastAttemptAt, attemptedAt, 'attempt timestamp persisted');
result = outbox.markAttempt('request-energy', '2026-08-18T11:59:00.000Z');
ok(!result.success, 'attempt before creation rejected');
eq(result.error.code, api.errorCodes.ITEM_INVALID, 'nonmonotonic attempt error');
result = outbox.markAttempt('missing-request', attemptedAt);
ok(!result.success, 'missing attempt item rejected');
eq(result.error.code, api.errorCodes.ITEM_UNAVAILABLE, 'missing attempt error');

const reloaded = api.createOutbox({context: contextValue, storage});
result = reloaded.list();
ok(result.success, 'outbox reload succeeds');
eq(result.data.pendingCount, 2, 'reload preserves pending items');
eq(result.data.items[0].attemptCount, 1, 'reload preserves technical attempts');
result = reloaded.acknowledge('missing-request');
ok(result.success, 'missing acknowledgement idempotent');
eq(result.data.removed, false, 'missing acknowledgement removes nothing');
result = reloaded.acknowledge('request-energy');
ok(result.success && result.data.removed, 'first item acknowledged');
eq(result.data.pendingCount, 1, 'one item remains');
eq(reloaded.list().data.items[0].missionId, 'greenhouse', 'remaining mission preserved');
result = reloaded.acknowledge('request-greenhouse');
ok(result.success && result.data.removed, 'last item acknowledged');
eq(result.data.pendingCount, 0, 'acknowledgement empties outbox');
eq(storage.values.has(currentKey), false, 'empty outbox removes physical record');

outbox.enqueue({requestId: 'request-energy-new', missionId: 'energy', createdAt});
const otherContext = Object.assign({}, contextValue, {participantId: 'player-2'});
const otherOutbox = api.createOutbox({context: otherContext, storage});
otherOutbox.enqueue({requestId: 'request-other-player', missionId: 'ice', createdAt});
eq(storage.values.size, 2, 'different participant has isolated record');
result = outbox.pruneOtherContexts();
ok(result.success, 'old context pruning succeeds');
eq(result.data.prunedCount, 1, 'one foreign context pruned');
eq(storage.values.size, 1, 'current context record retained');
eq(outbox.list().data.items[0].missionId, 'energy', 'current pending item retained after prune');

storage.values.set(currentKey, '{broken');
const corruptRaw = storage.values.get(currentKey);
result = outbox.list();
ok(!result.success, 'invalid JSON fails closed');
eq(result.error.code, api.errorCodes.CORRUPTED, 'invalid JSON corruption code');
ok(Object.isFrozen(result) && Object.isFrozen(result.error), 'corruption error frozen');
result = outbox.enqueue({requestId: 'request-ice', missionId: 'ice', createdAt});
ok(!result.success, 'enqueue cannot overwrite corrupt record');
eq(storage.values.get(currentKey), corruptRaw, 'corrupt record preserved for diagnosis');

storage.values.set(currentKey, JSON.stringify({
  version: 1,
  context: {
    roomId: contextValue.roomId,
    campaignId: contextValue.campaignId,
    publicationId: contextValue.publicationId,
    participantId: contextValue.participantId
  },
  items: [],
  answers: []
}));
result = outbox.list();
ok(!result.success, 'record with pedagogical field rejected');
eq(result.error.code, api.errorCodes.CORRUPTED, 'extra record field corruption code');
result = outbox.clear();
ok(result.success, 'clear removes corrupt current record');
eq(storage.values.size, 0, 'clear leaves no outbox keys');

result = outbox.enqueue({requestId: 'request-bad', missionId: 'foreign', createdAt});
eq(result.error.code, api.errorCodes.ITEM_INVALID, 'foreign mission rejected');
result = outbox.enqueue({requestId: 'request-bad', missionId: 'energy', createdAt: 'not-iso'});
eq(result.error.code, api.errorCodes.ITEM_INVALID, 'invalid timestamp rejected');
result = outbox.enqueue({requestId: 'request-bad', missionId: 'energy', createdAt, answer: 42});
eq(result.error.code, api.errorCodes.ITEM_INVALID, 'extra item field rejected');

const extraContext = api.createOutbox({
  context: Object.assign({}, contextValue, {capabilityToken: 'secret'}),
  storage
});
ok(!extraContext.available(), 'context with capability unavailable');
result = extraContext.list();
eq(result.error.code, api.errorCodes.CONTEXT_INVALID, 'context with capability rejected');
ok(!JSON.stringify(result).includes('secret'), 'context error leaks no capability');
const duplicateOrder = api.createOutbox({context: Object.assign({}, contextValue, {missionOrder: ['energy', 'energy']}), storage});
ok(!duplicateOrder.available(), 'duplicate mission order unavailable');
eq(duplicateOrder.list().error.code, api.errorCodes.CONTEXT_INVALID, 'duplicate mission order rejected');
const emptyParticipant = api.createOutbox({context: Object.assign({}, contextValue, {participantId: ''}), storage});
ok(!emptyParticipant.available(), 'empty participant unavailable');

const throwingStorage = {
  getItem() { throw new Error('secret capability'); },
  setItem() { throw new Error('secret capability'); },
  removeItem() { throw new Error('secret capability'); }
};
const brokenStorageOutbox = api.createOutbox({context: contextValue, storage: throwingStorage});
ok(brokenStorageOutbox.available(), 'throwing storage is structurally available');
result = brokenStorageOutbox.list();
eq(result.error.code, api.errorCodes.STORAGE_FAILED, 'storage read failure normalized');
ok(!JSON.stringify(result).includes('secret'), 'storage exception message not exposed');

ok(!source.includes('localStorage'), 'outbox never uses persistent localStorage');
ok(!source.includes('capabilityToken'), 'outbox source never handles capability token');
ok(!source.includes('StudentSession'), 'outbox source excludes StudentSession');
ok(!source.includes('sessionData'), 'outbox source excludes sessionData');
ok(!source.includes('expectedRevision'), 'outbox source excludes expectedRevision');

console.log('LIVE_ROOM_GAME_STATE_OUTBOX_TEST_STATUS=' + (failed === 0 ? 'PASS' : 'FAIL'));
console.log('LIVE_ROOM_GAME_STATE_OUTBOX_TEST_TOTAL=' + total);
console.log('LIVE_ROOM_GAME_STATE_OUTBOX_TEST_FAILED=' + failed);
process.exit(failed === 0 ? 0 : 1);
