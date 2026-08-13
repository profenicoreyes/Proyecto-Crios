/* CRIOS Live Room — pure lifecycle boundary */
(function(){
  'use strict';

  const IDLE_TIMEOUT_MS = 10 * 60 * 1000;
  const LIVE_ROOM_STATUSES = Object.freeze(['active', 'expired']);
  const PRESENCE_ROLES = Object.freeze(['host', 'player']);
  const EXPIRED_MESSAGE = 'Esta sesión finalizó por inactividad.';

  function isPlainObject(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === null || Object.getPrototypeOf(prototype) === null;
  }

  function exactKeys(value, expected, label) {
    if (!isPlainObject(value)) throw new Error(label + ' debe ser un objeto plano.');
    const actual = Object.keys(value).sort();
    const wanted = expected.slice().sort();
    if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
      throw new Error(label + ' contiene una forma no permitida.');
    }
  }

  function normalizedId(value, label) {
    if (typeof value !== 'string') throw new Error(label + ' debe ser texto.');
    const clean = value.trim();
    if (!clean || clean.length > 160 || /[\u0000-\u001F\u007F]/.test(clean)) {
      throw new Error(label + ' inválido.');
    }
    return clean;
  }

  function canonicalIso(value, label) {
    if (typeof value !== 'string' || value.trim() !== value || !value) {
      throw new Error(label + ' debe ser una fecha ISO canónica.');
    }
    const time = Date.parse(value);
    if (!Number.isFinite(time) || new Date(time).toISOString() !== value) {
      throw new Error(label + ' debe ser una fecha ISO canónica.');
    }
    return value;
  }

  function milliseconds(value) {
    return Date.parse(value);
  }

  function addIdleTimeout(iso) {
    return new Date(milliseconds(iso) + IDLE_TIMEOUT_MS).toISOString();
  }

  function validateRoom(room) {
    exactKeys(room, [
      'roomId',
      'campaignId',
      'publicationId',
      'createdAt',
      'lastActivityAt',
      'expiresAt',
      'status'
    ], 'LiveRoom');

    normalizedId(room.roomId, 'roomId');
    normalizedId(room.campaignId, 'campaignId');
    normalizedId(room.publicationId, 'publicationId');
    canonicalIso(room.createdAt, 'createdAt');
    canonicalIso(room.lastActivityAt, 'lastActivityAt');
    canonicalIso(room.expiresAt, 'expiresAt');

    if (!LIVE_ROOM_STATUSES.includes(room.status)) {
      throw new Error('LiveRoom.status no permitido.');
    }

    if (milliseconds(room.lastActivityAt) < milliseconds(room.createdAt)) {
      throw new Error('lastActivityAt no puede ser anterior a createdAt.');
    }

    if (room.expiresAt !== addIdleTimeout(room.lastActivityAt)) {
      throw new Error('expiresAt debe derivarse exactamente de lastActivityAt.');
    }

    return room;
  }

  function createRoom(input) {
    exactKeys(input, ['roomId', 'campaignId', 'publicationId', 'createdAt'], 'LiveRoomCreateInput');

    const createdAt = canonicalIso(input.createdAt, 'createdAt');
    const room = {
      roomId: normalizedId(input.roomId, 'roomId'),
      campaignId: normalizedId(input.campaignId, 'campaignId'),
      publicationId: normalizedId(input.publicationId, 'publicationId'),
      createdAt,
      lastActivityAt: createdAt,
      expiresAt: addIdleTimeout(createdAt),
      status: 'active'
    };

    validateRoom(room);
    return Object.freeze(room);
  }

  function validatePresence(presence) {
    exactKeys(presence, [
      'roomId',
      'participantId',
      'role',
      'joinedAt',
      'lastSeenAt'
    ], 'LiveRoomPresence');

    normalizedId(presence.roomId, 'roomId');
    normalizedId(presence.participantId, 'participantId');
    canonicalIso(presence.joinedAt, 'joinedAt');
    canonicalIso(presence.lastSeenAt, 'lastSeenAt');

    if (!PRESENCE_ROLES.includes(presence.role)) {
      throw new Error('role no permitido.');
    }

    if (milliseconds(presence.lastSeenAt) < milliseconds(presence.joinedAt)) {
      throw new Error('lastSeenAt no puede ser anterior a joinedAt.');
    }

    return presence;
  }

  function createPresence(input) {
    exactKeys(input, ['roomId', 'participantId', 'role', 'joinedAt'], 'LiveRoomPresenceCreateInput');

    const joinedAt = canonicalIso(input.joinedAt, 'joinedAt');
    const presence = {
      roomId: normalizedId(input.roomId, 'roomId'),
      participantId: normalizedId(input.participantId, 'participantId'),
      role: input.role,
      joinedAt,
      lastSeenAt: joinedAt
    };

    validatePresence(presence);
    return Object.freeze(presence);
  }

  function touchPresence(presence, seenAt) {
    validatePresence(presence);
    const nextSeenAt = canonicalIso(seenAt, 'seenAt');

    if (milliseconds(nextSeenAt) < milliseconds(presence.lastSeenAt)) {
      throw new Error('seenAt no puede retroceder.');
    }

    return Object.freeze({
      roomId: presence.roomId,
      participantId: presence.participantId,
      role: presence.role,
      joinedAt: presence.joinedAt,
      lastSeenAt: nextSeenAt
    });
  }

  function touchRoom(room, activityAt) {
    validateRoom(room);
    if (room.status !== 'active') throw new Error('No se puede reactivar una LiveRoom expirada.');

    const nextActivityAt = canonicalIso(activityAt, 'activityAt');
    if (milliseconds(nextActivityAt) < milliseconds(room.lastActivityAt)) {
      throw new Error('activityAt no puede retroceder.');
    }

    return Object.freeze({
      roomId: room.roomId,
      campaignId: room.campaignId,
      publicationId: room.publicationId,
      createdAt: room.createdAt,
      lastActivityAt: nextActivityAt,
      expiresAt: addIdleTimeout(nextActivityAt),
      status: 'active'
    });
  }

  function isExpired(room, now) {
    validateRoom(room);
    const current = canonicalIso(now, 'now');
    if (room.status === 'expired') return true;
    return milliseconds(current) > milliseconds(room.expiresAt);
  }

  function expireRoom(room, now) {
    validateRoom(room);
    const current = canonicalIso(now, 'now');

    if (!isExpired(room, current)) {
      throw new Error('La LiveRoom todavía no superó el límite de inactividad.');
    }

    if (room.status === 'expired') return room;

    return Object.freeze({
      roomId: room.roomId,
      campaignId: room.campaignId,
      publicationId: room.publicationId,
      createdAt: room.createdAt,
      lastActivityAt: room.lastActivityAt,
      expiresAt: room.expiresAt,
      status: 'expired'
    });
  }

  window.CRIOS_LIVE_ROOM_MODEL = Object.freeze({
    IDLE_TIMEOUT_MS,
    LIVE_ROOM_STATUSES,
    PRESENCE_ROLES,
    EXPIRED_MESSAGE,
    createRoom,
    validateRoom,
    createPresence,
    validatePresence,
    touchPresence,
    touchRoom,
    isExpired,
    expireRoom
  });
})();
