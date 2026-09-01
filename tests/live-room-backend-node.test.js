'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

function displayValue(v) {
  if (v == null) return '';
  if (v instanceof Date) return v.toISOString();
  const s = String(v);
  return s.startsWith("'") ? s.slice(1) : s;
}

class MockFinder {
  constructor(range, text) { this.range = range; this.text = String(text); this.entire = false; }
  matchEntireCell(v) { this.entire = v; return this; }
  findNext() {
    for (let r = 0; r < this.range.numRows; r += 1) {
      for (let c = 0; c < this.range.numCols; c += 1) {
        const rr = this.range.row - 1 + r;
        const cc = this.range.col - 1 + c;
        const value = displayValue(this.range.sheet.getCell(rr, cc));
        if (this.entire ? value === this.text : value.includes(this.text)) {
          return { getRow: () => rr + 1, getColumn: () => cc + 1 };
        }
      }
    }
    return null;
  }
}

class MockRange {
  constructor(sheet, row, col, numRows = 1, numCols = 1) { Object.assign(this, { sheet, row, col, numRows, numCols }); }
  getDisplayValues() {
    const out = [];
    for (let r = 0; r < this.numRows; r += 1) {
      const row = [];
      for (let c = 0; c < this.numCols; c += 1) row.push(displayValue(this.sheet.getCell(this.row - 1 + r, this.col - 1 + c)));
      out.push(row);
    }
    return out;
  }
  getDisplayValue() { return this.getDisplayValues()[0][0]; }
  getValue() { return this.sheet.getCell(this.row - 1, this.col - 1) ?? ''; }
  setValues(values) {
    if (values.length !== this.numRows) throw new Error('row mismatch');
    for (let r = 0; r < this.numRows; r += 1) {
      if (values[r].length !== this.numCols) throw new Error('col mismatch');
      for (let c = 0; c < this.numCols; c += 1) this.sheet.setCell(this.row - 1 + r, this.col - 1 + c, values[r][c]);
    }
    return this;
  }
  setFontWeight() { return this; }
  createTextFinder(text) { return new MockFinder(this, text); }
}

class MockSheet {
  constructor(name) { this.name = name; this.rows = []; this.frozen = 0; }
  getName() { return this.name; }
  getCell(r, c) { return (this.rows[r] || [])[c]; }
  setCell(r, c, v) {
    while (this.rows.length <= r) this.rows.push([]);
    while (this.rows[r].length <= c) this.rows[r].push('');
    this.rows[r][c] = v;
  }
  getLastRow() {
    let last = 0;
    for (let r = 0; r < this.rows.length; r += 1) if (this.rows[r].some(v => v !== '' && v != null)) last = r + 1;
    return last;
  }
  getRange(row, col, numRows = 1, numCols = 1) { return new MockRange(this, row, col, numRows, numCols); }
  setFrozenRows(n) { this.frozen = n; }
}

class MockBook {
  constructor() { this.sheets = new Map(); }
  getSheetByName(name) { return this.sheets.get(name) || null; }
  insertSheet(name) { const sheet = new MockSheet(name); this.sheets.set(name, sheet); return sheet; }
}

const repo = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const book = new MockBook();
let lockHeld = 0;
let lockWaits = 0;
let lockReleases = 0;
let uuid = 0;
let now = '2026-08-13T20:00:00.000Z';

const publications = new Map([
  ['pub-1', { publication: { campaignId: 'campaign-1', publicationId: 'pub-1' } }],
  ['pub-formula', { publication: { campaignId: '=campaign', publicationId: 'pub-formula' } }]
]);

global.SpreadsheetApp = { getActiveSpreadsheet: () => book };
global.LockService = { getScriptLock: () => ({ waitLock() { lockHeld += 1; lockWaits += 1; }, releaseLock() { lockHeld -= 1; lockReleases += 1; } }) };
global.Utilities = {
  DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' },
  computeDigest(_alg, text) { return Array.from(crypto.createHash('sha256').update(String(text), 'utf8').digest()).map(x => x > 127 ? x - 256 : x); },
  getUuid() { uuid += 1; return `10000000-0000-4000-8000-${String(uuid).padStart(12, '0')}`; }
};
global.ContentService = { MimeType: { JSON: 'json' }, createTextOutput: text => ({ text, setMimeType() { return this; } }) };
global.leerPublicacionVerificadaRemota = (_book, publicationId) => publications.get(publicationId) || null;
global.esEnvelopePostPublicacionRemota = () => false;
global.window = global;

for (const file of [
  path.join(repo, 'backend/google-apps-script/LiveRoomBackend.gs'),
  path.join(repo, 'backend/google-apps-script/Code.gs')
]) {
  vm.runInThisContext(fs.readFileSync(file, 'utf8'), { filename: file });
}

global.ahoraIsoLiveRoomRemota = () => now;

let total = 0;
let failed = 0;
function check(condition, message) {
  total += 1;
  if (!condition) { failed += 1; console.error('FAIL=' + message); }
}
function equal(actual, expected, message) {
  check(JSON.stringify(actual) === JSON.stringify(expected), message + ' actual=' + JSON.stringify(actual) + ' expected=' + JSON.stringify(expected));
}
function request(operation, requestId, payload) { return { protocolVersion: '1.0', operation, requestId, payload }; }
function token(seed) { return `${seed}-`.padEnd(40, 'x'); }
function call(req) { return procesarSolicitudLiveRoomRemota(req); }

check(CRIOS_LIVE_ROOM_IDLE_TIMEOUT_MS === 600000, 'timeout exactly ten minutes');
check(CRIOS_LIVE_ROOM_PRESENCE_ACTIVE_TIMEOUT_MS === 300000, 'presence active timeout exactly five minutes');
check(CRIOS_LIVE_ROOM_MAX_PARTICIPANTS === 64, 'participant cap explicit');
equal(CRIOS_LIVE_ROOM_EXPIRED_MESSAGE, 'Esta sesión finalizó por inactividad.', 'expired message exact');
check(esEnvelopePostLiveRoomRemota({ liveRoomRequest: {} }), 'dedicated POST envelope recognized');
check(!esEnvelopePostLiveRoomRemota({ request: {} }), 'publication envelope not confused with LiveRoom');
check(!esEnvelopePostLiveRoomRemota({ liveRoomRequest: {}, extra: true }), 'LiveRoom envelope exact');

let res = call(request('createLiveRoom', 'req-create-missing', {
  campaignId: 'campaign-1', publicationId: 'missing', participantId: 'host-missing', capabilityToken: token('missing')
}));
equal(res.error.code, 'PUBLICATION_UNAVAILABLE', 'room creation requires existing immutable publication');
check(book.sheets.size === 0, 'failed create does not create room sheets');

const createReq = request('createLiveRoom', 'req-create-1', {
  campaignId: 'campaign-1', publicationId: 'pub-1', participantId: 'host-1', capabilityToken: token('host')
});
res = call(createReq);
check(res.success, 'room create succeeds');
const roomId = res.data.room.roomId;
equal(res.data.room.campaignId, 'campaign-1', 'room anchors campaign');
equal(res.data.room.publicationId, 'pub-1', 'room anchors exact publication');
equal(res.data.room.createdAt, now, 'server clock owns createdAt');
equal(res.data.room.lastActivityAt, now, 'creation is activity');
equal(res.data.room.expiresAt, '2026-08-13T20:10:00.000Z', 'expiry derives from server activity');
equal(res.data.room.status, 'active', 'new room active');
equal(res.data.presence.role, 'host', 'creator presence is host');
check(!JSON.stringify(res).includes(createReq.payload.capabilityToken), 'capability secret absent from response');
check(!Object.prototype.hasOwnProperty.call(res.data.room, 'capabilityToken'), 'room snapshot secret-free');
check(!Object.prototype.hasOwnProperty.call(res.data.presence, 'capabilityToken'), 'presence snapshot secret-free');

const presenceSheet = book.getSheetByName('CRIOS_SALA_PRESENCIAS');
check(Boolean(presenceSheet), 'presence sheet created');
const storedHost = leerPresenciaLiveRoomRemota(book, roomId, 'host-1');
check(Boolean(storedHost), 'host presence stored');
check(storedHost.capabilityHash.length === 64, 'only capability hash stored');
check(storedHost.capabilityHash !== createReq.payload.capabilityToken, 'plaintext capability not stored');

const roomRowsAfterCreate = book.getSheetByName('CRIOS_SALAS').getLastRow();
res = call(createReq);
check(res.success && res.data.room.roomId === roomId, 'create request replay idempotent');
equal(book.getSheetByName('CRIOS_SALAS').getLastRow(), roomRowsAfterCreate, 'create replay adds no room');

const conflictCreate = request('createLiveRoom', 'req-create-1', {
  campaignId: 'campaign-1', publicationId: 'pub-1', participantId: 'host-other', capabilityToken: token('other')
});
res = call(conflictCreate);
equal(res.error.code, 'REQUEST_CONFLICT', 'requestId conflict rejected');

now = '2026-08-13T20:05:00.000Z';
const joinReq = request('joinLiveRoom', 'req-join-1', { roomId, participantId: 'player-1', capabilityToken: token('player') });
res = call(joinReq);
check(res.success, 'player joins active room');
equal(res.data.presence.role, 'player', 'join role server-owned player');
equal(res.data.room.lastActivityAt, now, 'join touches room activity');
equal(res.data.room.expiresAt, '2026-08-13T20:15:00.000Z', 'join extends expiry exactly ten minutes');
check(!JSON.stringify(res).includes(joinReq.payload.capabilityToken), 'join response secret-free');

const presenceRowsAfterJoin = presenceSheet.getLastRow();
res = call(joinReq);
check(res.success && res.data.presence.participantId === 'player-1', 'join request replay idempotent');
equal(presenceSheet.getLastRow(), presenceRowsAfterJoin, 'join replay adds no presence');

const duplicateParticipant = request('joinLiveRoom', 'req-join-dup', { roomId, participantId: 'player-1', capabilityToken: token('new-secret') });
res = call(duplicateParticipant);
equal(res.error.code, 'PARTICIPANT_CONFLICT', 'duplicate participant id rejected');

now = '2026-08-13T20:06:00.000Z';
const badHeartbeat = request('heartbeatLiveRoom', 'req-hb-bad', { roomId, participantId: 'player-1', capabilityToken: token('wrong') });
const beforeBad = leerLiveRoomRemota(book, roomId).room.lastActivityAt;
res = call(badHeartbeat);
equal(res.error.code, 'CAPABILITY_INVALID', 'heartbeat requires participant capability');
equal(leerLiveRoomRemota(book, roomId).room.lastActivityAt, beforeBad, 'bad heartbeat does not extend room');

const heartbeatReq = request('heartbeatLiveRoom', 'req-hb-1', { roomId, participantId: 'player-1', capabilityToken: joinReq.payload.capabilityToken });
res = call(heartbeatReq);
check(res.success, 'valid player heartbeat succeeds');
equal(res.data.presence.lastSeenAt, now, 'heartbeat updates presence server timestamp');
equal(res.data.room.lastActivityAt, now, 'heartbeat updates room activity');
equal(res.data.room.expiresAt, '2026-08-13T20:16:00.000Z', 'heartbeat extends expiry');

const hbRoomAtFirst = res.data.room.lastActivityAt;
now = '2026-08-13T20:07:00.000Z';
res = call(heartbeatReq);
check(res.success, 'heartbeat replay returns prior success');
equal(res.data.room.lastActivityAt, hbRoomAtFirst, 'heartbeat replay does not extend activity twice');
equal(leerLiveRoomRemota(book, roomId).room.lastActivityAt, hbRoomAtFirst, 'stored room unchanged on heartbeat replay');

now = '2026-08-13T20:16:00.000Z';
const exactBoundaryHeartbeat = request('heartbeatLiveRoom', 'req-hb-boundary', { roomId, participantId: 'host-1', capabilityToken: createReq.payload.capabilityToken });
res = call(exactBoundaryHeartbeat);
check(res.success, 'exactly ten minutes remains active');
equal(res.data.room.expiresAt, '2026-08-13T20:26:00.000Z', 'boundary heartbeat renews room');

now = '2026-08-13T20:26:00.001Z';
const afterExpiry = request('heartbeatLiveRoom', 'req-hb-expired', { roomId, participantId: 'host-1', capabilityToken: createReq.payload.capabilityToken });
res = call(afterExpiry);
equal(res.error.code, 'ROOM_EXPIRED', 'more than ten minutes expires room');
equal(res.error.message, CRIOS_LIVE_ROOM_EXPIRED_MESSAGE, 'expired heartbeat has user-facing message');
equal(leerLiveRoomRemota(book, roomId).room.status, 'expired', 'expiry persisted');

const joinExpired = request('joinLiveRoom', 'req-join-expired', { roomId, participantId: 'late-player', capabilityToken: token('late') });
res = call(joinExpired);
equal(res.error.code, 'ROOM_EXPIRED', 'expired room cannot be joined');
const getExpired = request('getLiveRoom', 'req-get-expired', { roomId });
res = call(getExpired);
equal(res.error.code, 'ROOM_EXPIRED', 'expired room cannot be reopened by get');
equal(res.error.message, CRIOS_LIVE_ROOM_EXPIRED_MESSAGE, 'get shows inactivity message');

now = '2026-08-13T21:00:00.000Z';
const formulaCreate = request('createLiveRoom', 'req-create-formula', {
  campaignId: '=campaign', publicationId: 'pub-formula', participantId: '@host-formula', capabilityToken: token('formula')
});
res = call(formulaCreate);
check(res.success, 'formula-leading identifiers roundtrip safely');
equal(res.data.room.campaignId, '=campaign', 'formula campaign preserved');
const formulaRoomId = res.data.room.roomId;
equal(leerPresenciaLiveRoomRemota(book, formulaRoomId, '@host-formula').presence.participantId, '@host-formula', 'formula participant preserved');

const transportCreate = request('createLiveRoom', 'req-http-create', {
  campaignId: 'campaign-1', publicationId: 'pub-1', participantId: 'host-http', capabilityToken: token('http-host')
});
res = JSON.parse(doPost({ postData: { contents: JSON.stringify({ liveRoomRequest: transportCreate }) } }).text);
check(res.success, 'Code.gs doPost routes dedicated LiveRoom envelope');
check(res.data.room.publicationId === 'pub-1', 'transport room targets exact publication');

// Existing publication and legacy result routes remain reachable because the LiveRoom envelope is disjoint.
global.esEnvelopePostPublicacionRemota = data => Boolean(data && data.request && data.request.kind === 'publication-probe');
global.procesarSolicitudPublicacionRemota = req => ({ publicationProbe: req.kind });
res = JSON.parse(doPost({ postData: { contents: JSON.stringify({ request: { kind: 'publication-probe' } }) } }).text);
equal(res, { publicationProbe: 'publication-probe' }, 'publication POST route preserved');
global.esEnvelopePostPublicacionRemota = () => false;

const legacy = { idSesion: 'legacy-live-room-probe', grupo: '8A', nombre: 'Ana' };
res = JSON.parse(doPost({ postData: { contents: JSON.stringify(legacy) } }).text);
check(res.ok && res.idSesion === 'legacy-live-room-probe', 'legacy results POST route preserved');
check(Boolean(book.getSheetByName('Hoja 1')) && Boolean(book.getSheetByName('GRUPO - 8A')), 'legacy result sheets still written');

const invalidShape = call({ protocolVersion: '1.0', operation: 'getLiveRoom', requestId: 'req-invalid', payload: { roomId: roomId, extra: true } });
equal(invalidShape.error.code, 'INVALID_REQUEST', 'exact payload shape enforced');
const unsupported = call({ protocolVersion: '1.0', operation: 'deleteLiveRoom', requestId: 'req-delete', payload: {} });
equal(unsupported.error.code, 'UNSUPPORTED_OPERATION', 'destructive remote operation absent');

// Fill another room to the participant cap without exposing secrets in stored snapshots.
now = '2026-08-13T22:00:00.000Z';
const capCreate = request('createLiveRoom', 'req-cap-create', {
  campaignId: 'campaign-1', publicationId: 'pub-1', participantId: 'cap-host', capabilityToken: token('cap-host')
});
res = call(capCreate);
const capRoom = res.data.room.roomId;
for (let i = 1; i < 64; i += 1) {
  const req = request('joinLiveRoom', `req-cap-${i}`, { roomId: capRoom, participantId: `cap-player-${i}`, capabilityToken: token(`cap-${i}`) });
  res = call(req);
  if (!res.success) throw new Error('setup cap join failed at ' + i + ': ' + JSON.stringify(res));
}
check(contarPresenciasLiveRoomRemota(book, capRoom) === 64, 'participant cap includes host');
const overCap = request('joinLiveRoom', 'req-cap-over', { roomId: capRoom, participantId: 'cap-player-over', capabilityToken: token('cap-over') });
res = call(overCap);
equal(res.error.code, 'ROOM_FULL', '65th participant rejected');

// A4-003A: host-only presence roster is the first synchronized room state.
check(CRIOS_LIVE_ROOM_OPERATIONS.GET_ROSTER === 'getLiveRoomRoster', 'roster operation explicit');
check(CRIOS_LIVE_ROOM_ERROR_CODES.HOST_REQUIRED === 'HOST_REQUIRED', 'host-only roster error explicit');
const requestSheet = book.getSheetByName('CRIOS_SALA_SOLICITUDES');
const requestsBeforeRoster = requestSheet.getLastRow();
const activityBeforeRoster = leerLiveRoomRemota(book, capRoom).room.lastActivityAt;
const capHostToken = capCreate.payload.capabilityToken;
res = call(request('getLiveRoomRoster', 'req-roster-host', { roomId: capRoom, participantId: 'cap-host', capabilityToken: capHostToken }));
check(res.success, 'host can read participant roster');
equal(res.data.roster.registeredParticipantCount, 64, 'roster reports registered participants');
equal(res.data.roster.activeParticipantCount, 64, 'roster reports all participants active initially');
equal(res.data.roster.activePlayerCount, 63, 'roster counts active players excluding host');
equal(res.data.roster.hostConnected, true, 'roster reports host connected');
check(Array.isArray(res.data.roster.participants) && res.data.roster.participants.length === 64, 'roster returns deterministic participant snapshots');
check(res.data.roster.participants.every(item => typeof item.connected === 'boolean'), 'roster participant connected flag explicit');
check(!JSON.stringify(res).includes(capHostToken), 'roster response does not leak host capability');
check(!JSON.stringify(res).includes('CAPABILITY_SHA256'), 'roster response does not expose capability hash field');
equal(leerLiveRoomRemota(book, capRoom).room.lastActivityAt, activityBeforeRoster, 'roster read does not extend room activity');
equal(requestSheet.getLastRow(), requestsBeforeRoster, 'roster read does not create idempotency write records');

res = call(request('getLiveRoom', 'req-public-no-roster', { roomId: capRoom }));
check(res.success && !Object.prototype.hasOwnProperty.call(res.data, 'roster'), 'public room GET remains roster-free');
res = call(request('getLiveRoomRoster', 'req-roster-player', { roomId: capRoom, participantId: 'cap-player-1', capabilityToken: token('cap-1') }));
equal(res.error.code, 'HOST_REQUIRED', 'player capability cannot read roster');
res = call(request('getLiveRoomRoster', 'req-roster-bad-cap', { roomId: capRoom, participantId: 'cap-host', capabilityToken: token('wrong-roster') }));
equal(res.error.code, 'CAPABILITY_INVALID', 'invalid host capability cannot read roster');
res = call(request('getLiveRoomRoster', 'req-roster-shape', { roomId: capRoom, participantId: 'cap-host', capabilityToken: capHostToken, extra: true }));
equal(res.error.code, 'INVALID_REQUEST', 'roster payload shape remains exact');

let boundaryPresence = listarPresenciasLiveRoomRemota(book, capRoom, '2026-08-13T22:05:00.000Z')
  .find(item => item.participantId === 'cap-player-1');
equal(boundaryPresence.connected, true, 'presence remains connected exactly five minutes after last seen');
boundaryPresence = listarPresenciasLiveRoomRemota(book, capRoom, '2026-08-13T22:05:00.001Z')
  .find(item => item.participantId === 'cap-player-1');
equal(boundaryPresence.connected, false, 'presence becomes disconnected after five minutes');

now = '2026-08-13T22:09:00.000Z';
res = call(request('heartbeatLiveRoom', 'req-cap-host-hb', { roomId: capRoom, participantId: 'cap-host', capabilityToken: capHostToken }));
check(res.success, 'host heartbeat keeps room active independently of roster reads');
const activityAfterHostHeartbeat = res.data.room.lastActivityAt;
now = '2026-08-13T22:10:00.001Z';
res = call(request('getLiveRoomRoster', 'req-roster-stale', { roomId: capRoom, participantId: 'cap-host', capabilityToken: capHostToken }));
check(res.success, 'roster remains readable while room active from valid heartbeat');
equal(res.data.roster.activeParticipantCount, 1, 'stale participants are excluded from active count');
equal(res.data.roster.activePlayerCount, 0, 'stale players are excluded from active player count');
equal(res.data.roster.hostConnected, true, 'recent host heartbeat remains connected');
check(res.data.roster.participants.filter(item => item.role === 'player').every(item => item.connected === false), 'players older than five minutes are reported disconnected');
equal(leerLiveRoomRemota(book, capRoom).room.lastActivityAt, activityAfterHostHeartbeat, 'stale roster read still does not extend activity');

const roomSheet = book.getSheetByName('CRIOS_SALAS');
const presenceRows = book.getSheetByName('CRIOS_SALA_PRESENCIAS').rows.flat().join('|');
check(!presenceRows.includes(token('host')), 'host capability plaintext absent from storage');
check(!presenceRows.includes(token('player')), 'player capability plaintext absent from storage');
check(roomSheet.getLastRow() >= 4, 'multiple rooms stored independently');
check(lockHeld === 0, 'all LiveRoom locks released');
check(lockWaits === lockReleases, 'LiveRoom locks balanced');

if (failed) {
  console.error('LIVE_ROOM_BACKEND_TEST_STATUS=FAIL');
  console.error('LIVE_ROOM_BACKEND_TEST_TOTAL=' + total);
  console.error('LIVE_ROOM_BACKEND_TEST_FAILED=' + failed);
  process.exit(1);
}

console.log('LIVE_ROOM_BACKEND_TEST_STATUS=PASS');
console.log('LIVE_ROOM_BACKEND_TEST_TOTAL=' + total);
console.log('LIVE_ROOM_BACKEND_TEST_FAILED=0');
console.log('LIVE_ROOM_BACKEND_IDLE_TIMEOUT_MS=600000');
console.log('LIVE_ROOM_BACKEND_PRESENCE_ACTIVE_TIMEOUT_MS=300000');
console.log('LIVE_ROOM_BACKEND_MAX_PARTICIPANTS=64');
console.log('LIVE_ROOM_BACKEND_SERVER_CLOCK=true');
console.log('LIVE_ROOM_BACKEND_CAPABILITY_HASH_ONLY=true');
console.log('LIVE_ROOM_BACKEND_PUBLICATION_PERSISTENCE_UNCHANGED=true');
