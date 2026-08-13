'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const repo = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const source = fs.readFileSync(path.join(repo, 'js/live-room/live-room-model.js'), 'utf8');

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

function throws(run, fragment, message) {
  let error = null;
  try { run(); } catch (caught) { error = caught; }
  check(Boolean(error) && String(error.message).includes(fragment), message + ' error=' + (error && error.message));
}

const context = vm.createContext({ window: {}, Object, String, Number, Array, RegExp, Error, Math, Date });
context.window.window = context.window;
vm.runInContext(source, context, { filename: 'live-room-model.js' });
const model = context.window.CRIOS_LIVE_ROOM_MODEL;

const created = '2026-08-13T20:00:00.000Z';
const plusTen = '2026-08-13T20:10:00.000Z';
const plusTenAndOne = '2026-08-13T20:10:00.001Z';

check(Boolean(model), 'API exists');
equal(model.IDLE_TIMEOUT_MS, 600000, 'idle timeout is exactly ten minutes');
equal(model.EXPIRED_MESSAGE, 'Esta sesión finalizó por inactividad.', 'expired user message');
equal(model.LIVE_ROOM_STATUSES.join(','), 'active,expired', 'room statuses exact');
equal(model.PRESENCE_ROLES.join(','), 'host,player', 'presence roles exact');
check(Object.isFrozen(model), 'API frozen');
check(Object.isFrozen(model.LIVE_ROOM_STATUSES), 'statuses frozen');
check(Object.isFrozen(model.PRESENCE_ROLES), 'roles frozen');

const room = model.createRoom({
  roomId: 'room-1',
  campaignId: 'campaign-1',
  publicationId: 'publication-1',
  createdAt: created
});
equal(room.roomId, 'room-1', 'room id preserved');
equal(room.campaignId, 'campaign-1', 'campaign id preserved');
equal(room.publicationId, 'publication-1', 'publication id preserved');
equal(room.createdAt, created, 'createdAt preserved');
equal(room.lastActivityAt, created, 'initial activity equals creation');
equal(room.expiresAt, plusTen, 'expiry derives from initial activity');
equal(room.status, 'active', 'new room active');
check(Object.isFrozen(room), 'room immutable');
check(model.validateRoom(room) === room, 'room validates');
check(!Object.prototype.hasOwnProperty.call(room, 'sessionId'), 'room does not reuse StudentSession id');
check(!Object.prototype.hasOwnProperty.call(room, 'releaseId'), 'room does not reuse StudentSession releaseId');
check(!Object.prototype.hasOwnProperty.call(room, 'lives'), 'room does not contain player state');
check(!Object.prototype.hasOwnProperty.call(room, 'progress'), 'room does not absorb local player progress');
check(!Object.prototype.hasOwnProperty.call(room, 'token'), 'room snapshot contains no capability token');

equal(model.isExpired(room, '2026-08-13T20:09:59.999Z'), false, 'active before timeout');
equal(model.isExpired(room, plusTen), false, 'exactly ten minutes is not more than ten minutes');
equal(model.isExpired(room, plusTenAndOne), true, 'expires after more than ten minutes');

const touched = model.touchRoom(room, '2026-08-13T20:05:00.000Z');
equal(touched.createdAt, created, 'touch preserves creation');
equal(touched.lastActivityAt, '2026-08-13T20:05:00.000Z', 'touch advances activity');
equal(touched.expiresAt, '2026-08-13T20:15:00.000Z', 'touch moves expiry');
equal(touched.status, 'active', 'touch stays active');
check(touched !== room, 'touch returns new room');
equal(room.lastActivityAt, created, 'touch does not mutate source room');
throws(() => model.touchRoom(touched, '2026-08-13T20:04:59.999Z'), 'no puede retroceder', 'room clock cannot move backward');

const expired = model.expireRoom(room, plusTenAndOne);
equal(expired.status, 'expired', 'expiry marks room expired');
equal(expired.expiresAt, plusTen, 'expiry deadline preserved');
check(Object.isFrozen(expired), 'expired room immutable');
equal(model.isExpired(expired, created), true, 'expired status remains expired regardless query clock');
equal(model.expireRoom(expired, plusTenAndOne), expired, 'expiry is idempotent');
throws(() => model.expireRoom(room, plusTen), 'todavía no superó', 'cannot expire at exact deadline');
throws(() => model.touchRoom(expired, '2026-08-13T20:11:00.000Z'), 'No se puede reactivar', 'expired room cannot reactivate');

const host = model.createPresence({
  roomId: room.roomId,
  participantId: 'host-1',
  role: 'host',
  joinedAt: created
});
equal(host.role, 'host', 'host role accepted');
equal(host.lastSeenAt, created, 'host initial lastSeen');
check(Object.isFrozen(host), 'presence immutable');
check(model.validatePresence(host) === host, 'presence validates');

const player = model.createPresence({
  roomId: room.roomId,
  participantId: 'player-1',
  role: 'player',
  joinedAt: '2026-08-13T20:01:00.000Z'
});
equal(player.role, 'player', 'player role accepted');
const seen = model.touchPresence(player, '2026-08-13T20:01:30.000Z');
equal(seen.lastSeenAt, '2026-08-13T20:01:30.000Z', 'heartbeat advances presence');
equal(player.lastSeenAt, '2026-08-13T20:01:00.000Z', 'heartbeat does not mutate source');
throws(() => model.touchPresence(seen, '2026-08-13T20:01:29.999Z'), 'no puede retroceder', 'presence clock cannot move backward');

throws(() => model.createPresence({ roomId:'room-1', participantId:'x', role:'admin', joinedAt:created }), 'role no permitido', 'unknown role rejected');
throws(() => model.createRoom({ roomId:'room-1', campaignId:'campaign-1', publicationId:'publication-1', createdAt:created, progress:{} }), 'forma no permitida', 'room create extras rejected');
throws(() => model.validateRoom(Object.assign({}, room, { expiresAt:'2026-08-13T20:10:01.000Z' })), 'derivarse exactamente', 'forged expiry rejected');
throws(() => model.validateRoom(Object.assign({}, room, { lastActivityAt:'2026-08-13T19:59:59.999Z', expiresAt:'2026-08-13T20:09:59.999Z' })), 'anterior a createdAt', 'activity before creation rejected');

console.log('LIVE_ROOM_MODEL_TEST_STATUS=' + (failed ? 'FAIL' : 'PASS'));
console.log('LIVE_ROOM_MODEL_TEST_TOTAL=' + total);
console.log('LIVE_ROOM_MODEL_TEST_FAILED=' + failed);
console.log('LIVE_ROOM_MODEL_STUDENT_SESSION_SEPARATION=true');
console.log('LIVE_ROOM_MODEL_IDLE_TIMEOUT_MS=' + model.IDLE_TIMEOUT_MS);
if (failed) process.exit(1);
