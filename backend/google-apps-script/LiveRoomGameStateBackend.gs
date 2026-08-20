const CRIOS_LIVE_ROOM_GAME_STATE_SCHEMA_VERSION = '1.0';
const CRIOS_LIVE_ROOM_GAME_STATE_MAX_MISSION_ID_LENGTH = 160;

const CRIOS_LIVE_ROOM_GAME_STATE_OPERATIONS = Object.freeze({
  GET: 'getLiveRoomGameState',
  COMPLETE_MISSION: 'completeLiveRoomMission'
});

const CRIOS_LIVE_ROOM_GAME_STATE_ERROR_CODES = Object.freeze({
  PLAYER_REQUIRED: 'PLAYER_REQUIRED',
  MISSION_UNAVAILABLE: 'MISSION_UNAVAILABLE'
});

const CRIOS_LIVE_ROOM_GAME_STATE_SHEET = 'CRIOS_SALA_ESTADO';
const CRIOS_LIVE_ROOM_GAME_STATE_HEADERS = Object.freeze([
  'ROOM_ID',
  'CAMPAIGN_ID',
  'PUBLICATION_ID',
  'SCHEMA_VERSION',
  'REVISION',
  'COMPLETED_MISSION_IDS_JSON',
  'UPDATED_AT'
]);

function esOperacionEstadoJuegoLiveRoomRemota(solicitud) {
  if (!solicitud || typeof solicitud !== 'object') return false;
  return solicitud.operation === CRIOS_LIVE_ROOM_GAME_STATE_OPERATIONS.GET ||
    solicitud.operation === CRIOS_LIVE_ROOM_GAME_STATE_OPERATIONS.COMPLETE_MISSION;
}

function validarPayloadParticipanteEstadoJuegoLiveRoomRemota(payload, claves) {
  return clavesExactasLiveRoomRemota(payload, claves) &&
    cadenaNormalizadaLiveRoomRemota(payload.roomId, 160) === payload.roomId &&
    cadenaNormalizadaLiveRoomRemota(payload.participantId, 160) === payload.participantId &&
    capabilityValidaLiveRoomRemota(payload.capabilityToken);
}

function validarSolicitudEstadoJuegoLiveRoomRemota(solicitud) {
  if (!clavesExactasLiveRoomRemota(solicitud, ['protocolVersion', 'operation', 'requestId', 'payload'])) {
    return {ok: false, code: CRIOS_LIVE_ROOM_ERROR_CODES.INVALID_REQUEST, message: 'LiveRoom game-state request envelope shape is invalid.'};
  }
  if (solicitud.protocolVersion !== CRIOS_LIVE_ROOM_PROTOCOL_VERSION) {
    return {ok: false, code: CRIOS_LIVE_ROOM_ERROR_CODES.UNSUPPORTED_PROTOCOL, message: 'LiveRoom protocolVersion is unsupported.'};
  }
  if (!esOperacionEstadoJuegoLiveRoomRemota(solicitud)) {
    return {ok: false, code: CRIOS_LIVE_ROOM_ERROR_CODES.UNSUPPORTED_OPERATION, message: 'LiveRoom game-state operation is unsupported.'};
  }
  if (cadenaNormalizadaLiveRoomRemota(solicitud.requestId, 160) !== solicitud.requestId ||
      !esObjetoPlanoLiveRoomRemota(solicitud.payload)) {
    return {ok: false, code: CRIOS_LIVE_ROOM_ERROR_CODES.INVALID_REQUEST, message: 'LiveRoom game-state requestId or payload is invalid.'};
  }

  const payload = solicitud.payload;
  if (solicitud.operation === CRIOS_LIVE_ROOM_GAME_STATE_OPERATIONS.GET) {
    if (!validarPayloadParticipanteEstadoJuegoLiveRoomRemota(payload, ['roomId', 'participantId', 'capabilityToken'])) {
      return {ok: false, code: CRIOS_LIVE_ROOM_ERROR_CODES.INVALID_REQUEST, message: 'getLiveRoomGameState payload is invalid.'};
    }
  } else if (!validarPayloadParticipanteEstadoJuegoLiveRoomRemota(
    payload,
    ['roomId', 'participantId', 'capabilityToken', 'missionId']
  ) || cadenaNormalizadaLiveRoomRemota(payload.missionId, CRIOS_LIVE_ROOM_GAME_STATE_MAX_MISSION_ID_LENGTH) !== payload.missionId) {
    return {ok: false, code: CRIOS_LIVE_ROOM_ERROR_CODES.INVALID_REQUEST, message: 'completeLiveRoomMission payload is invalid.'};
  }
  return {ok: true};
}

function fechaIsoCanonicaEstadoJuegoLiveRoomRemota(valor) {
  if (typeof valor !== 'string' || !valor || valor.trim() !== valor) return false;
  const timestamp = Date.parse(valor);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === valor;
}

function validarOrdenMisionesEstadoJuegoLiveRoomRemota(missionOrder) {
  if (!Array.isArray(missionOrder)) return false;
  const vistas = Object.create(null);
  for (let indice = 0; indice < missionOrder.length; indice += 1) {
    const missionId = missionOrder[indice];
    if (cadenaNormalizadaLiveRoomRemota(missionId, CRIOS_LIVE_ROOM_GAME_STATE_MAX_MISSION_ID_LENGTH) !== missionId ||
        Object.prototype.hasOwnProperty.call(vistas, missionId)) return false;
    vistas[missionId] = true;
  }
  return true;
}

function resolverOrdenMisionesEstadoJuegoLiveRoomRemota(libro, room) {
  if (typeof leerPublicacionVerificadaRemota !== 'function') {
    return {ok: false, code: CRIOS_LIVE_ROOM_ERROR_CODES.SERVER_ERROR, message: 'Publication resolver is unavailable.'};
  }
  const almacenada = leerPublicacionVerificadaRemota(libro, room.publicationId);
  const publication = almacenada && almacenada.publication;
  if (!publication || publication.publicationId !== room.publicationId || publication.campaignId !== room.campaignId) {
    return {ok: false, code: CRIOS_LIVE_ROOM_ERROR_CODES.PUBLICATION_UNAVAILABLE, message: 'Publication is unavailable for LiveRoom game state.'};
  }
  const content = publication.content;
  const manifest = content && content.runtimeExecutionManifest;
  const missionOrder = manifest && manifest.missionOrder;
  const missionSpecs = content && content.missionSpecs;
  if (!validarOrdenMisionesEstadoJuegoLiveRoomRemota(missionOrder) ||
      !Array.isArray(missionSpecs) || missionSpecs.length !== missionOrder.length) {
    return {ok: false, code: CRIOS_LIVE_ROOM_ERROR_CODES.PUBLICATION_UNAVAILABLE, message: 'Publication mission order is unavailable for LiveRoom game state.'};
  }
  for (let indice = 0; indice < missionOrder.length; indice += 1) {
    if (!esObjetoPlanoLiveRoomRemota(missionSpecs[indice]) || missionSpecs[indice].missionId !== missionOrder[indice]) {
      return {ok: false, code: CRIOS_LIVE_ROOM_ERROR_CODES.PUBLICATION_UNAVAILABLE, message: 'Publication mission specs do not match mission order.'};
    }
  }
  return {ok: true, missionOrder: missionOrder.slice()};
}

function posicionesMisionesEstadoJuegoLiveRoomRemota(missionOrder) {
  const posiciones = Object.create(null);
  missionOrder.forEach((missionId, indice) => { posiciones[missionId] = indice; });
  return posiciones;
}

function validarEstadoJuegoLiveRoomRemota(gameState, room, missionOrder) {
  if (!clavesExactasLiveRoomRemota(gameState, [
    'schemaVersion',
    'roomId',
    'campaignId',
    'publicationId',
    'revision',
    'completedMissionIds',
    'updatedAt'
  ])) throw new Error('LiveRoomGameState shape is invalid.');
  if (gameState.schemaVersion !== CRIOS_LIVE_ROOM_GAME_STATE_SCHEMA_VERSION ||
      gameState.roomId !== room.roomId ||
      gameState.campaignId !== room.campaignId ||
      gameState.publicationId !== room.publicationId) {
    throw new Error('LiveRoomGameState identity is invalid.');
  }
  if (!Number.isInteger(gameState.revision) || gameState.revision < 0 ||
      !Array.isArray(gameState.completedMissionIds) ||
      gameState.revision !== gameState.completedMissionIds.length ||
      !fechaIsoCanonicaEstadoJuegoLiveRoomRemota(gameState.updatedAt) ||
      Date.parse(gameState.updatedAt) < Date.parse(room.createdAt)) {
    throw new Error('LiveRoomGameState revision or timestamp is invalid.');
  }

  const posiciones = posicionesMisionesEstadoJuegoLiveRoomRemota(missionOrder);
  const vistas = Object.create(null);
  let posicionAnterior = -1;
  for (let indice = 0; indice < gameState.completedMissionIds.length; indice += 1) {
    const missionId = gameState.completedMissionIds[indice];
    if (cadenaNormalizadaLiveRoomRemota(missionId, CRIOS_LIVE_ROOM_GAME_STATE_MAX_MISSION_ID_LENGTH) !== missionId ||
        !Object.prototype.hasOwnProperty.call(posiciones, missionId) ||
        Object.prototype.hasOwnProperty.call(vistas, missionId) ||
        posiciones[missionId] <= posicionAnterior) {
      throw new Error('LiveRoomGameState completed missions are invalid.');
    }
    vistas[missionId] = true;
    posicionAnterior = posiciones[missionId];
  }
  return gameState;
}

function crearEstadoInicialJuegoLiveRoomRemota(room, missionOrder) {
  const gameState = {
    schemaVersion: CRIOS_LIVE_ROOM_GAME_STATE_SCHEMA_VERSION,
    roomId: room.roomId,
    campaignId: room.campaignId,
    publicationId: room.publicationId,
    revision: 0,
    completedMissionIds: [],
    updatedAt: room.createdAt
  };
  validarEstadoJuegoLiveRoomRemota(gameState, room, missionOrder);
  return gameState;
}

function buscarFilaEstadoJuegoLiveRoomRemota(hoja, roomId) {
  if (!hoja || hoja.getLastRow() < 2) return 0;
  const valores = hoja.getRange(2, 1, hoja.getLastRow() - 1, 1).getDisplayValues();
  let fila = 0;
  for (let indice = 0; indice < valores.length; indice += 1) {
    if (valores[indice][0] !== roomId) continue;
    if (fila) throw new Error('Duplicate LiveRoomGameState row.');
    fila = indice + 2;
  }
  return fila;
}

function leerEstadoJuegoLiveRoomRemota(libro, room, missionOrder) {
  const hoja = obtenerHojaLecturaLiveRoomRemota(
    libro,
    CRIOS_LIVE_ROOM_GAME_STATE_SHEET,
    CRIOS_LIVE_ROOM_GAME_STATE_HEADERS
  );
  if (!hoja) return null;
  const fila = buscarFilaEstadoJuegoLiveRoomRemota(hoja, room.roomId);
  if (!fila) return null;
  const valores = hoja.getRange(fila, 1, 1, CRIOS_LIVE_ROOM_GAME_STATE_HEADERS.length).getDisplayValues()[0];
  if (!/^(0|[1-9]\d*)$/.test(valores[4])) throw new Error('Stored LiveRoomGameState revision is invalid.');
  let completedMissionIds;
  try {
    completedMissionIds = JSON.parse(valores[5]);
  } catch (error) {
    throw new Error('Stored LiveRoomGameState completed missions are invalid.');
  }
  const gameState = {
    schemaVersion: valores[3],
    roomId: valores[0],
    campaignId: valores[1],
    publicationId: valores[2],
    revision: Number(valores[4]),
    completedMissionIds: completedMissionIds,
    updatedAt: valores[6]
  };
  validarEstadoJuegoLiveRoomRemota(gameState, room, missionOrder);
  return {row: fila, gameState: gameState};
}

function escribirEstadoJuegoLiveRoomRemota(libro, gameState, room, missionOrder) {
  validarEstadoJuegoLiveRoomRemota(gameState, room, missionOrder);
  const hoja = obtenerHojaEscrituraLiveRoomRemota(
    libro,
    CRIOS_LIVE_ROOM_GAME_STATE_SHEET,
    CRIOS_LIVE_ROOM_GAME_STATE_HEADERS
  );
  const existente = buscarFilaEstadoJuegoLiveRoomRemota(hoja, gameState.roomId);
  const fila = existente || hoja.getLastRow() + 1;
  hoja.getRange(fila, 1, 1, CRIOS_LIVE_ROOM_GAME_STATE_HEADERS.length).setValues([[
    textoCeldaLiveRoomRemota(gameState.roomId),
    textoCeldaLiveRoomRemota(gameState.campaignId),
    textoCeldaLiveRoomRemota(gameState.publicationId),
    textoCeldaLiveRoomRemota(gameState.schemaVersion),
    gameState.revision,
    textoCeldaLiveRoomRemota(JSON.stringify(gameState.completedMissionIds)),
    textoCeldaLiveRoomRemota(gameState.updatedAt)
  ]]);
}

function obtenerEstadoJuegoLiveRoomRemota(libro, room, missionOrder) {
  const almacenado = leerEstadoJuegoLiveRoomRemota(libro, room, missionOrder);
  return almacenado ? almacenado.gameState : crearEstadoInicialJuegoLiveRoomRemota(room, missionOrder);
}

function autorizarParticipanteEstadoJuegoLiveRoomRemota(libro, payload, role) {
  const almacenada = leerPresenciaLiveRoomRemota(libro, payload.roomId, payload.participantId);
  if (!almacenada) {
    return {ok: false, code: CRIOS_LIVE_ROOM_ERROR_CODES.PARTICIPANT_UNAVAILABLE, message: 'LiveRoom participant is unavailable.'};
  }
  const recibido = sha256LiveRoomRemota(payload.capabilityToken);
  if (!compararConstanteLiveRoomRemota(almacenada.capabilityHash, recibido)) {
    return {ok: false, code: CRIOS_LIVE_ROOM_ERROR_CODES.CAPABILITY_INVALID, message: 'LiveRoom participant capability is invalid.'};
  }
  if (role && almacenada.presence.role !== role) {
    return {ok: false, code: CRIOS_LIVE_ROOM_GAME_STATE_ERROR_CODES.PLAYER_REQUIRED, message: 'Only a LiveRoom player can complete a mission.'};
  }
  return {ok: true, presence: almacenada.presence};
}

function resolverContextoEstadoJuegoLiveRoomRemota(libro, solicitud, nowIso, role) {
  const estadoRoom = expirarSiCorrespondeLiveRoomRemota(
    libro,
    leerLiveRoomRemota(libro, solicitud.payload.roomId),
    nowIso
  );
  if (estadoRoom.unavailable) {
    return {ok: false, response: crearRespuestaLiveRoomRemota(solicitud, false, null, CRIOS_LIVE_ROOM_ERROR_CODES.ROOM_UNAVAILABLE, 'LiveRoom is unavailable.', false)};
  }
  if (estadoRoom.expired) {
    return {ok: false, response: crearRespuestaLiveRoomRemota(solicitud, false, null, CRIOS_LIVE_ROOM_ERROR_CODES.ROOM_EXPIRED, CRIOS_LIVE_ROOM_EXPIRED_MESSAGE, false)};
  }
  const autorizacion = autorizarParticipanteEstadoJuegoLiveRoomRemota(libro, solicitud.payload, role);
  if (!autorizacion.ok) {
    return {ok: false, response: crearRespuestaLiveRoomRemota(solicitud, false, null, autorizacion.code, autorizacion.message, false)};
  }
  const publication = resolverOrdenMisionesEstadoJuegoLiveRoomRemota(libro, estadoRoom.room);
  if (!publication.ok) {
    return {ok: false, response: crearRespuestaLiveRoomRemota(solicitud, false, null, publication.code, publication.message, false)};
  }
  return {ok: true, room: estadoRoom.room, presence: autorizacion.presence, missionOrder: publication.missionOrder};
}

function procesarGetEstadoJuegoLiveRoomRemota(libro, solicitud) {
  const nowIso = ahoraIsoLiveRoomRemota();
  const contexto = resolverContextoEstadoJuegoLiveRoomRemota(libro, solicitud, nowIso, null);
  if (!contexto.ok) return contexto.response;
  const gameState = obtenerEstadoJuegoLiveRoomRemota(libro, contexto.room, contexto.missionOrder);
  return crearRespuestaLiveRoomRemota(solicitud, true, {gameState: gameState});
}

function procesarCompletarMisionLiveRoomRemota(libro, solicitud, requestHash) {
  const nowIso = ahoraIsoLiveRoomRemota();
  const contexto = resolverContextoEstadoJuegoLiveRoomRemota(libro, solicitud, nowIso, 'player');
  if (!contexto.ok) return contexto.response;
  const replay = replayLiveRoomRemota(libro, solicitud, requestHash);
  if (replay) return replay;
  if (!contexto.missionOrder.includes(solicitud.payload.missionId)) {
    return crearRespuestaLiveRoomRemota(
      solicitud,
      false,
      null,
      CRIOS_LIVE_ROOM_GAME_STATE_ERROR_CODES.MISSION_UNAVAILABLE,
      'Mission is unavailable for this LiveRoom publication.',
      false
    );
  }

  const current = obtenerEstadoJuegoLiveRoomRemota(libro, contexto.room, contexto.missionOrder);
  const changed = !current.completedMissionIds.includes(solicitud.payload.missionId);
  let gameState = current;
  if (changed) {
    const posiciones = posicionesMisionesEstadoJuegoLiveRoomRemota(contexto.missionOrder);
    gameState = {
      schemaVersion: current.schemaVersion,
      roomId: current.roomId,
      campaignId: current.campaignId,
      publicationId: current.publicationId,
      revision: current.revision + 1,
      completedMissionIds: current.completedMissionIds.concat(solicitud.payload.missionId)
        .sort((left, right) => posiciones[left] - posiciones[right]),
      updatedAt: Date.parse(nowIso) < Date.parse(current.updatedAt) ? current.updatedAt : nowIso
    };
    escribirEstadoJuegoLiveRoomRemota(libro, gameState, contexto.room, contexto.missionOrder);
  }
  const data = {gameState: gameState, changed: changed};
  guardarSolicitudProcesadaLiveRoomRemota(libro, solicitud, requestHash, data);
  return crearRespuestaLiveRoomRemota(solicitud, true, data);
}

function procesarSolicitudEstadoJuegoLiveRoomRemota(solicitud) {
  const validacion = validarSolicitudEstadoJuegoLiveRoomRemota(solicitud);
  if (!validacion.ok) {
    return crearRespuestaLiveRoomRemota(solicitud, false, null, validacion.code, validacion.message, false);
  }

  const bloqueo = LockService.getScriptLock();
  bloqueo.waitLock(10000);
  try {
    const libro = SpreadsheetApp.getActiveSpreadsheet();
    if (solicitud.operation === CRIOS_LIVE_ROOM_GAME_STATE_OPERATIONS.GET) {
      return procesarGetEstadoJuegoLiveRoomRemota(libro, solicitud);
    }
    const requestHash = hashSolicitudLiveRoomRemota(solicitud);
    return procesarCompletarMisionLiveRoomRemota(libro, solicitud, requestHash);
  } catch (error) {
    return crearRespuestaLiveRoomRemota(
      solicitud,
      false,
      null,
      CRIOS_LIVE_ROOM_ERROR_CODES.SERVER_ERROR,
      'LiveRoom game-state server failure.',
      true
    );
  } finally {
    bloqueo.releaseLock();
  }
}
