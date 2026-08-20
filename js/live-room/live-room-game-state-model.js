/* CRIOS LiveRoom Game State — pure cooperative progress model */
(function(){
  'use strict';

  const VERSION = '1.0.0';
  const SCHEMA_VERSION = '1.0';
  const MAX_ID_LENGTH = 160;
  const MAX_PUBLICATION_ID_LENGTH = 200;
  const STATE_KEYS = Object.freeze([
    'schemaVersion',
    'roomId',
    'campaignId',
    'publicationId',
    'revision',
    'completedMissionIds',
    'updatedAt'
  ]);

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

  function normalizedId(value, label, maxLength) {
    if (typeof value !== 'string') throw new Error(label + ' debe ser texto.');
    const clean = value.trim();
    if (!clean || clean !== value || clean.length > maxLength || /[\u0000-\u001F\u007F]/.test(clean)) {
      throw new Error(label + ' inválido o no normalizado.');
    }
    return clean;
  }

  function canonicalIso(value, label) {
    if (typeof value !== 'string' || !value || value.trim() !== value) {
      throw new Error(label + ' debe ser una fecha ISO canónica.');
    }
    const timestamp = Date.parse(value);
    if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString() !== value) {
      throw new Error(label + ' debe ser una fecha ISO canónica.');
    }
    return value;
  }

  function clone(value) {
    if (value === null || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map(clone);
    const copy = {};
    Object.keys(value).forEach((key) => { copy[key] = clone(value[key]); });
    return copy;
  }

  function freeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.keys(value).forEach((key) => { freeze(value[key]); });
    return Object.freeze(value);
  }

  function frozenCopy(value) {
    return freeze(clone(value));
  }

  function validateMissionOrder(missionOrder) {
    if (!Array.isArray(missionOrder)) throw new Error('missionOrder debe ser un arreglo.');
    const seen = new Set();
    missionOrder.forEach((missionId, index) => {
      const normalized = normalizedId(missionId, 'missionOrder[' + index + ']', MAX_ID_LENGTH);
      if (seen.has(normalized)) throw new Error('missionOrder no admite IDs duplicados.');
      seen.add(normalized);
    });
    return missionOrder;
  }

  function missionPositions(missionOrder) {
    validateMissionOrder(missionOrder);
    const positions = new Map();
    missionOrder.forEach((missionId, index) => { positions.set(missionId, index); });
    return positions;
  }

  function validateCompletedMissionIds(completedMissionIds, missionOrder) {
    if (!Array.isArray(completedMissionIds)) throw new Error('completedMissionIds debe ser un arreglo.');
    const positions = missionPositions(missionOrder);
    const seen = new Set();
    let previousPosition = -1;
    completedMissionIds.forEach((missionId, index) => {
      const normalized = normalizedId(missionId, 'completedMissionIds[' + index + ']', MAX_ID_LENGTH);
      if (seen.has(normalized)) throw new Error('completedMissionIds no admite IDs duplicados.');
      if (!positions.has(normalized)) throw new Error('completedMissionIds contiene una misión ajena a la publicación.');
      const position = positions.get(normalized);
      if (position <= previousPosition) throw new Error('completedMissionIds no respeta el orden canónico de missionOrder.');
      seen.add(normalized);
      previousPosition = position;
    });
    return completedMissionIds;
  }

  function validateGameState(gameState, missionOrder) {
    exactKeys(gameState, STATE_KEYS, 'LiveRoomGameState');
    if (gameState.schemaVersion !== SCHEMA_VERSION) throw new Error('schemaVersion de LiveRoomGameState no soportada.');
    normalizedId(gameState.roomId, 'roomId', MAX_ID_LENGTH);
    normalizedId(gameState.campaignId, 'campaignId', MAX_ID_LENGTH);
    normalizedId(gameState.publicationId, 'publicationId', MAX_PUBLICATION_ID_LENGTH);
    if (!Number.isInteger(gameState.revision) || gameState.revision < 0) {
      throw new Error('revision debe ser un entero no negativo.');
    }
    validateCompletedMissionIds(gameState.completedMissionIds, missionOrder);
    if (gameState.revision !== gameState.completedMissionIds.length) {
      throw new Error('revision debe coincidir con la cantidad de misiones completadas.');
    }
    canonicalIso(gameState.updatedAt, 'updatedAt');
    return gameState;
  }

  function createGameState(input) {
    exactKeys(input, ['roomId', 'campaignId', 'publicationId', 'missionOrder', 'createdAt'], 'LiveRoomGameStateCreateInput');
    validateMissionOrder(input.missionOrder);
    const gameState = {
      schemaVersion: SCHEMA_VERSION,
      roomId: normalizedId(input.roomId, 'roomId', MAX_ID_LENGTH),
      campaignId: normalizedId(input.campaignId, 'campaignId', MAX_ID_LENGTH),
      publicationId: normalizedId(input.publicationId, 'publicationId', MAX_PUBLICATION_ID_LENGTH),
      revision: 0,
      completedMissionIds: [],
      updatedAt: canonicalIso(input.createdAt, 'createdAt')
    };
    validateGameState(gameState, input.missionOrder);
    return frozenCopy(gameState);
  }

  function completeMission(gameState, input) {
    exactKeys(input, ['missionId', 'missionOrder', 'completedAt'], 'CompleteLiveRoomMissionInput');
    validateGameState(gameState, input.missionOrder);
    const missionId = normalizedId(input.missionId, 'missionId', MAX_ID_LENGTH);
    const positions = missionPositions(input.missionOrder);
    if (!positions.has(missionId)) throw new Error('missionId no pertenece a la publicación de la sala.');
    const completedAt = canonicalIso(input.completedAt, 'completedAt');
    if (Date.parse(completedAt) < Date.parse(gameState.updatedAt)) {
      throw new Error('completedAt no puede retroceder respecto de updatedAt.');
    }

    if (gameState.completedMissionIds.includes(missionId)) {
      return freeze({state: frozenCopy(gameState), changed: false});
    }

    const completedMissionIds = gameState.completedMissionIds.concat(missionId)
      .sort((left, right) => positions.get(left) - positions.get(right));
    const next = {
      schemaVersion: SCHEMA_VERSION,
      roomId: gameState.roomId,
      campaignId: gameState.campaignId,
      publicationId: gameState.publicationId,
      revision: gameState.revision + 1,
      completedMissionIds,
      updatedAt: completedAt
    };
    validateGameState(next, input.missionOrder);
    return freeze({state: frozenCopy(next), changed: true});
  }

  function sameIdentity(left, right) {
    return left.roomId === right.roomId &&
      left.campaignId === right.campaignId &&
      left.publicationId === right.publicationId;
  }

  function sameSnapshot(left, right) {
    return left.schemaVersion === right.schemaVersion &&
      sameIdentity(left, right) &&
      left.revision === right.revision &&
      left.updatedAt === right.updatedAt &&
      left.completedMissionIds.length === right.completedMissionIds.length &&
      left.completedMissionIds.every((missionId, index) => missionId === right.completedMissionIds[index]);
  }

  function reconcileGameState(current, incoming, missionOrder) {
    validateGameState(current, missionOrder);
    validateGameState(incoming, missionOrder);
    if (!sameIdentity(current, incoming)) throw new Error('LiveRoomGameState no puede cruzar sala o publicación.');

    if (incoming.revision < current.revision) {
      return freeze({state: frozenCopy(current), changed: false});
    }
    if (incoming.revision === current.revision) {
      if (!sameSnapshot(current, incoming)) throw new Error('Una misma revision no puede representar snapshots diferentes.');
      return freeze({state: frozenCopy(current), changed: false});
    }
    if (!current.completedMissionIds.every((missionId) => incoming.completedMissionIds.includes(missionId))) {
      throw new Error('Un snapshot posterior no puede perder misiones completadas.');
    }
    if (Date.parse(incoming.updatedAt) < Date.parse(current.updatedAt)) {
      throw new Error('Un snapshot posterior no puede retroceder updatedAt.');
    }
    return freeze({state: frozenCopy(incoming), changed: true});
  }

  window.CRIOS_LIVE_ROOM_GAME_STATE_MODEL = Object.freeze({
    VERSION,
    SCHEMA_VERSION,
    createGameState,
    validateGameState,
    validateMissionOrder,
    completeMission,
    reconcileGameState
  });
})();
