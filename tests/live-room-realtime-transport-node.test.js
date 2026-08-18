const fs = require('fs');
const path = require('path');
const vm = require('vm');

const repo = process.argv[2] || path.resolve(__dirname, '..');
const sourcePath = path.join(repo, 'js', 'live-room', 'realtime', 'live-room-realtime-transport.js');
const source = fs.readFileSync(sourcePath, 'utf8');

let total = 0;
let failed = 0;
function check(condition, message) {
  total += 1;
  if (!condition) {
    failed += 1;
    console.error('FAIL ' + message);
  }
}
function equal(actual, expected, message) {
  check(actual === expected, `${message} expected=${expected} actual=${actual}`);
}

const windowStub = {};
const context = {
  window: windowStub,
  Date,
  Object,
  Array,
  String,
  Number,
  Boolean,
  JSON,
  Math,
  Map,
  Set,
  console
};
windowStub.window = windowStub;
vm.createContext(context);
vm.runInContext(source, context, { filename: sourcePath });

const api = windowStub.CRIOS_LIVE_ROOM_REALTIME_TRANSPORT;
check(Boolean(api), 'realtime transport API exported');
check(typeof api.createTransport === 'function', 'createTransport exported');
check(typeof api.normalizeSignal === 'function', 'normalizeSignal exported');
equal(api.signalType, 'presence-change', 'only supported signal type exported');

const transport = api.createTransport();
check(Boolean(transport), 'transport created');
check(typeof transport.subscribeRoom === 'function', 'subscribeRoom exported');
check(typeof transport.unsubscribeRoom === 'function', 'unsubscribeRoom exported');
check(typeof transport.publishSignal === 'function', 'publishSignal exported');
check(typeof transport.destroy === 'function', 'destroy exported');

let received = null;
const subscribed = transport.subscribeRoom('room-1', (signal) => { received = signal; });
check(subscribed === true, 'subscribe returns true for valid callback');

const publishResult = transport.publishSignal('room-1', {
  roomId: 'room-1',
  type: 'presence-change',
  eventId: 'evt-1',
  emittedAt: '2026-08-16T12:00:00.000Z',
  capability: 'secret-never-forwarded',
  participantId: 'host-secret',
  roster: { participants: [] }
});
check(publishResult === true, 'publish returns true for valid signal');
check(Boolean(received), 'subscriber receives signal');
if (received) {
  equal(received.roomId, 'room-1', 'signal room id preserved');
  equal(received.type, 'presence-change', 'signal type preserved');
  equal(received.eventId, 'evt-1', 'signal event id preserved');
  equal(received.emittedAt, '2026-08-16T12:00:00.000Z', 'signal emittedAt preserved');
  check(!Object.prototype.hasOwnProperty.call(received, 'capability'), 'signal excludes capability');
  check(!Object.prototype.hasOwnProperty.call(received, 'participantId'), 'signal excludes participantId');
  check(!Object.prototype.hasOwnProperty.call(received, 'roster'), 'signal excludes roster payload');
}

received = null;
check(transport.unsubscribeRoom('room-1') === true, 'unsubscribe returns true for subscribed room');
check(transport.publishSignal('room-1', { type: 'presence-change', eventId:'evt-after-unsubscribe' }) === true, 'publish still succeeds without listeners');
equal(received, null, 'unsubscribe prevents further callbacks');

check(transport.subscribeRoom('', () => {}) === false, 'subscribe rejects empty room id');
check(transport.publishSignal('', { type: 'presence-change', eventId:'evt-x' }) === false, 'publish rejects empty room id');
check(transport.publishSignal('room-1', { type: 'presence-change' }) === false, 'publish rejects missing event id');
check(transport.publishSignal('room-1', { type: 'unexpected', eventId:'evt-x' }) === false, 'publish rejects unsupported signal type');

transport.destroy();
check(transport.subscribeRoom('room-1', () => {}) === false, 'subscribe disabled after destroy');
check(transport.publishSignal('room-1', { type: 'presence-change' }) === false, 'publish disabled after destroy');
check(transport.unsubscribeRoom('room-1') === false, 'unsubscribe disabled after destroy');

console.log('LIVE_ROOM_REALTIME_TRANSPORT_TEST_TOTAL=' + total);
console.log('LIVE_ROOM_REALTIME_TRANSPORT_TEST_FAILED=' + failed);
console.log('LIVE_ROOM_REALTIME_TRANSPORT_TEST_STATUS=' + (failed === 0 ? 'PASS' : 'FAIL'));
process.exitCode = failed === 0 ? 0 : 1;
