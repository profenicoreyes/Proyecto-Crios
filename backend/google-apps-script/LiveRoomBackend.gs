const CRIOS_LIVE_ROOM_PROTOCOL_VERSION = '1.0';
const CRIOS_LIVE_ROOM_IDLE_TIMEOUT_MS = 10 * 60 * 1000;
const CRIOS_LIVE_ROOM_MAX_PARTICIPANTS = 64;
const CRIOS_LIVE_ROOM_CAPABILITY_MIN_LENGTH = 32;
const CRIOS_LIVE_ROOM_CAPABILITY_MAX_LENGTH = 256;
const CRIOS_LIVE_ROOM_EXPIRED_MESSAGE = 'Esta sesión finalizó por inactividad.';

const CRIOS_LIVE_ROOM_OPERATIONS = Object.freeze({
  CREATE: 'createLiveRoom',
  JOIN: 'joinLiveRoom',
  HEARTBEAT: 'heartbeatLiveRoom',
  GET: 'getLiveRoom',
  GET_ROSTER: 'getLiveRoomRoster'
});

const CRIOS_LIVE_ROOM_ERROR_CODES = Object.freeze({
  INVALID_REQUEST: 'INVALID_REQUEST',
  UNSUPPORTED_PROTOCOL: 'UNSUPPORTED_PROTOCOL',
  UNSUPPORTED_OPERATION: 'UNSUPPORTED_OPERATION',
  PUBLICATION_UNAVAILABLE: 'PUBLICATION_UNAVAILABLE',
  ROOM_UNAVAILABLE: 'ROOM_UNAVAILABLE',
  ROOM_EXPIRED: 'ROOM_EXPIRED',
  ROOM_FULL: 'ROOM_FULL',
  PARTICIPANT_UNAVAILABLE: 'PARTICIPANT_UNAVAILABLE',
  PARTICIPANT_CONFLICT: 'PARTICIPANT_CONFLICT',
  CAPABILITY_INVALID: 'CAPABILITY_INVALID',
  HOST_REQUIRED: 'HOST_REQUIRED',
  REQUEST_CONFLICT: 'REQUEST_CONFLICT',
  SERVER_ERROR: 'SERVER_ERROR'
});

const CRIOS_LIVE_ROOM_SHEETS = Object.freeze({
  ROOMS: 'CRIOS_SALAS',
  PRESENCES: 'CRIOS_SALA_PRESENCIAS',
  REQUESTS: 'CRIOS_SALA_SOLICITUDES'
});

const CRIOS_LIVE_ROOM_HEADERS = Object.freeze({
  ROOMS: Object.freeze([
    'ROOM_ID',
    'CAMPAIGN_ID',
    'PUBLICATION_ID',
    'CREATED_AT',
    'LAST_ACTIVITY_AT',
    'EXPIRES_AT',
    'STATUS'
  ]),
  PRESENCES: Object.freeze([
    'ROOM_ID',
    'PARTICIPANT_ID',
    'ROLE',
    'JOINED_AT',
    'LAST_SEEN_AT',
    'CAPABILITY_SHA256'
  ]),
  REQUESTS: Object.freeze([
    'REQUEST_ID',
    'OPERATION',
    'REQUEST_HASH',
    'RESPONSE_JSON',
    'CREATED_AT'
  ])
});

function esObjetoPlanoLiveRoomRemota(valor) {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) return false;
  const prototipo = Object.getPrototypeOf(valor);
  return prototipo === Object.prototype || prototipo === null;
}

function clavesExactasLiveRoomRemota(valor, esperadas) {
  if (!esObjetoPlanoLiveRoomRemota(valor)) return false;
  const actuales = Object.keys(valor).sort();
  const objetivo = esperadas.slice().sort();
  return actuales.length === objetivo.length && actuales.every((clave, indice) => clave === objetivo[indice]);
}

function cadenaNormalizadaLiveRoomRemota(valor, maximo) {
  if (typeof valor !== 'string') return null;
  const limpia = valor.trim();
  if (!limpia || limpia !== valor || limpia.length > maximo || /[\u0000-\u001F\u007F]/.test(limpia)) return null;
  return limpia;
}

function capabilityValidaLiveRoomRemota(valor) {
  return typeof valor === 'string' &&
    valor.length >= CRIOS_LIVE_ROOM_CAPABILITY_MIN_LENGTH &&
    valor.length <= CRIOS_LIVE_ROOM_CAPABILITY_MAX_LENGTH &&
    valor.trim() === valor &&
    !/[\u0000-\u001F\u007F]/.test(valor);
}

function ordenarRecursivamenteLiveRoomRemota(valor) {
  if (valor === null || typeof valor === 'string' || typeof valor === 'boolean') return valor;
  if (typeof valor === 'number') {
    if (!Number.isFinite(valor)) throw new Error('LiveRoom request contains a non-finite number.');
    return valor;
  }
  if (Array.isArray(valor)) return valor.map(ordenarRecursivamenteLiveRoomRemota);
  if (!esObjetoPlanoLiveRoomRemota(valor)) throw new Error('LiveRoom request contains an unsupported value.');
  const salida = {};
  Object.keys(valor).sort().forEach(clave => {
    if (clave === '__proto__' || clave === 'prototype' || clave === 'constructor') {
      throw new Error('LiveRoom request contains a dangerous key.');
    }
    salida[clave] = ordenarRecursivamenteLiveRoomRemota(valor[clave]);
  });
  return salida;
}

function sha256LiveRoomRemota(texto) {
  const bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    texto,
    Utilities.Charset.UTF_8
  );
  return bytes.map(byte => {
    const normalizado = byte < 0 ? byte + 256 : byte;
    return normalizado.toString(16).padStart(2, '0');
  }).join('');
}

function compararConstanteLiveRoomRemota(a, b) {
  const izquierda = String(a == null ? '' : a);
  const derecha = String(b == null ? '' : b);
  let diferencia = izquierda.length ^ derecha.length;
  const largo = Math.max(izquierda.length, derecha.length);
  for (let indice = 0; indice < largo; indice += 1) {
    diferencia |= (indice < izquierda.length ? izquierda.charCodeAt(indice) : 0) ^
      (indice < derecha.length ? derecha.charCodeAt(indice) : 0);
  }
  return diferencia === 0;
}

function hashSolicitudLiveRoomRemota(solicitud) {
  return sha256LiveRoomRemota(JSON.stringify(ordenarRecursivamenteLiveRoomRemota(solicitud)));
}

function ahoraIsoLiveRoomRemota() {
  return new Date().toISOString();
}

function expiracionDesdeActividadLiveRoomRemota(activityAt) {
  return new Date(Date.parse(activityAt) + CRIOS_LIVE_ROOM_IDLE_TIMEOUT_MS).toISOString();
}

function crearRespuestaLiveRoomRemota(solicitud, exito, datos, codigo, mensaje, reintentable) {
  const operacion = solicitud && typeof solicitud.operation === 'string' ? solicitud.operation : CRIOS_LIVE_ROOM_OPERATIONS.GET;
  const requestId = solicitud && cadenaNormalizadaLiveRoomRemota(solicitud.requestId, 160)
    ? solicitud.requestId
    : 'invalid-request';
  return {
    protocolVersion: CRIOS_LIVE_ROOM_PROTOCOL_VERSION,
    operation: operacion,
    requestId: requestId,
    success: Boolean(exito),
    data: exito ? datos : null,
    error: exito ? null : {
      code: codigo || CRIOS_LIVE_ROOM_ERROR_CODES.SERVER_ERROR,
      message: String(mensaje || codigo || 'LiveRoom server error.'),
      retryable: Boolean(reintentable)
    }
  };
}

function validarSolicitudLiveRoomRemota(solicitud) {
  if (!clavesExactasLiveRoomRemota(solicitud, ['protocolVersion', 'operation', 'requestId', 'payload'])) {
    return {ok: false, code: CRIOS_LIVE_ROOM_ERROR_CODES.INVALID_REQUEST, message: 'LiveRoom request envelope shape is invalid.'};
  }
  if (solicitud.protocolVersion !== CRIOS_LIVE_ROOM_PROTOCOL_VERSION) {
    return {ok: false, code: CRIOS_LIVE_ROOM_ERROR_CODES.UNSUPPORTED_PROTOCOL, message: 'LiveRoom protocolVersion is unsupported.'};
  }
  if (!Object.keys(CRIOS_LIVE_ROOM_OPERATIONS).some(clave => CRIOS_LIVE_ROOM_OPERATIONS[clave] === solicitud.operation)) {
    return {ok: false, code: CRIOS_LIVE_ROOM_ERROR_CODES.UNSUPPORTED_OPERATION, message: 'LiveRoom operation is unsupported.'};
  }
  if (cadenaNormalizadaLiveRoomRemota(solicitud.requestId, 160) !== solicitud.requestId || !esObjetoPlanoLiveRoomRemota(solicitud.payload)) {
    return {ok: false, code: CRIOS_LIVE_ROOM_ERROR_CODES.INVALID_REQUEST, message: 'LiveRoom requestId or payload is invalid.'};
  }

  const payload = solicitud.payload;
  if (solicitud.operation === CRIOS_LIVE_ROOM_OPERATIONS.CREATE) {
    if (!clavesExactasLiveRoomRemota(payload, ['campaignId', 'publicationId', 'participantId', 'capabilityToken']) ||
        cadenaNormalizadaLiveRoomRemota(payload.campaignId, 160) !== payload.campaignId ||
        cadenaNormalizadaLiveRoomRemota(payload.publicationId, 200) !== payload.publicationId ||
        cadenaNormalizadaLiveRoomRemota(payload.participantId, 160) !== payload.participantId ||
        !capabilityValidaLiveRoomRemota(payload.capabilityToken)) {
      return {ok: false, code: CRIOS_LIVE_ROOM_ERROR_CODES.INVALID_REQUEST, message: 'createLiveRoom payload is invalid.'};
    }
  } else if (solicitud.operation === CRIOS_LIVE_ROOM_OPERATIONS.JOIN) {
    if (!clavesExactasLiveRoomRemota(payload, ['roomId', 'participantId', 'capabilityToken']) ||
        cadenaNormalizadaLiveRoomRemota(payload.roomId, 160) !== payload.roomId ||
        cadenaNormalizadaLiveRoomRemota(payload.participantId, 160) !== payload.participantId ||
        !capabilityValidaLiveRoomRemota(payload.capabilityToken)) {
      return {ok: false, code: CRIOS_LIVE_ROOM_ERROR_CODES.INVALID_REQUEST, message: 'joinLiveRoom payload is invalid.'};
    }
  } else if (solicitud.operation === CRIOS_LIVE_ROOM_OPERATIONS.HEARTBEAT) {
    if (!clavesExactasLiveRoomRemota(payload, ['roomId', 'participantId', 'capabilityToken']) ||
        cadenaNormalizadaLiveRoomRemota(payload.roomId, 160) !== payload.roomId ||
        cadenaNormalizadaLiveRoomRemota(payload.participantId, 160) !== payload.participantId ||
        !capabilityValidaLiveRoomRemota(payload.capabilityToken)) {
      return {ok: false, code: CRIOS_LIVE_ROOM_ERROR_CODES.INVALID_REQUEST, message: 'heartbeatLiveRoom payload is invalid.'};
    }
  } else if (solicitud.operation === CRIOS_LIVE_ROOM_OPERATIONS.GET) {
    if (!clavesExactasLiveRoomRemota(payload, ['roomId']) ||
        cadenaNormalizadaLiveRoomRemota(payload.roomId, 160) !== payload.roomId) {
      return {ok: false, code: CRIOS_LIVE_ROOM_ERROR_CODES.INVALID_REQUEST, message: 'getLiveRoom payload is invalid.'};
    }
  } else if (solicitud.operation === CRIOS_LIVE_ROOM_OPERATIONS.GET_ROSTER) {
    if (!clavesExactasLiveRoomRemota(payload, ['roomId', 'participantId', 'capabilityToken']) ||
        cadenaNormalizadaLiveRoomRemota(payload.roomId, 160) !== payload.roomId ||
        cadenaNormalizadaLiveRoomRemota(payload.participantId, 160) !== payload.participantId ||
        !capabilityValidaLiveRoomRemota(payload.capabilityToken)) {
      return {ok: false, code: CRIOS_LIVE_ROOM_ERROR_CODES.INVALID_REQUEST, message: 'getLiveRoomRoster payload is invalid.'};
    }
  }
  return {ok: true};
}

function encabezadosValidosLiveRoomRemota(hoja, encabezados) {
  if (!hoja || hoja.getLastRow() < 1) return false;
  const actuales = hoja.getRange(1, 1, 1, encabezados.length).getDisplayValues()[0];
  return encabezados.every((encabezado, indice) => actuales[indice] === encabezado);
}

function obtenerHojaLecturaLiveRoomRemota(libro, nombre, encabezados) {
  const hoja = libro.getSheetByName(nombre);
  if (!hoja || hoja.getLastRow() === 0) return null;
  if (!encabezadosValidosLiveRoomRemota(hoja, encabezados)) throw new Error('LiveRoom sheet header mismatch: ' + nombre + '.');
  return hoja;
}

function obtenerHojaEscrituraLiveRoomRemota(libro, nombre, encabezados) {
  const hoja = libro.getSheetByName(nombre) || libro.insertSheet(nombre);
  if (hoja.getLastRow() === 0) {
    const rango = hoja.getRange(1, 1, 1, encabezados.length);
    rango.setValues([encabezados]);
    rango.setFontWeight('bold');
    hoja.setFrozenRows(1);
  } else if (!encabezadosValidosLiveRoomRemota(hoja, encabezados)) {
    throw new Error('LiveRoom sheet header mismatch: ' + nombre + '.');
  }
  return hoja;
}

function textoCeldaLiveRoomRemota(valor) {
  const texto = String(valor == null ? '' : valor);
  return /^[=+\-@]/.test(texto) ? "'" + texto : texto;
}

function buscarFilaExactaLiveRoomRemota(hoja, columna, valor) {
  if (!hoja || hoja.getLastRow() < 2) return 0;
  const coincidencia = hoja.getRange(2, columna, hoja.getLastRow() - 1, 1)
    .createTextFinder(String(valor)).matchEntireCell(true).findNext();
  return coincidencia ? coincidencia.getRow() : 0;
}

function leerLiveRoomRemota(libro, roomId) {
  const hoja = obtenerHojaLecturaLiveRoomRemota(libro, CRIOS_LIVE_ROOM_SHEETS.ROOMS, CRIOS_LIVE_ROOM_HEADERS.ROOMS);
  if (!hoja) return null;
  const fila = buscarFilaExactaLiveRoomRemota(hoja, 1, roomId);
  if (!fila) return null;
  const valores = hoja.getRange(fila, 1, 1, CRIOS_LIVE_ROOM_HEADERS.ROOMS.length).getDisplayValues()[0];
  return {
    row: fila,
    room: {
      roomId: valores[0],
      campaignId: valores[1],
      publicationId: valores[2],
      createdAt: valores[3],
      lastActivityAt: valores[4],
      expiresAt: valores[5],
      status: valores[6]
    }
  };
}

function escribirLiveRoomRemota(libro, room) {
  const hoja = obtenerHojaEscrituraLiveRoomRemota(libro, CRIOS_LIVE_ROOM_SHEETS.ROOMS, CRIOS_LIVE_ROOM_HEADERS.ROOMS);
  const existente = buscarFilaExactaLiveRoomRemota(hoja, 1, room.roomId);
  const fila = existente || hoja.getLastRow() + 1;
  hoja.getRange(fila, 1, 1, CRIOS_LIVE_ROOM_HEADERS.ROOMS.length).setValues([[
    textoCeldaLiveRoomRemota(room.roomId),
    textoCeldaLiveRoomRemota(room.campaignId),
    textoCeldaLiveRoomRemota(room.publicationId),
    textoCeldaLiveRoomRemota(room.createdAt),
    textoCeldaLiveRoomRemota(room.lastActivityAt),
    textoCeldaLiveRoomRemota(room.expiresAt),
    textoCeldaLiveRoomRemota(room.status)
  ]]);
}

function leerPresenciaLiveRoomRemota(libro, roomId, participantId) {
  const hoja = obtenerHojaLecturaLiveRoomRemota(libro, CRIOS_LIVE_ROOM_SHEETS.PRESENCES, CRIOS_LIVE_ROOM_HEADERS.PRESENCES);
  if (!hoja || hoja.getLastRow() < 2) return null;
  const filas = hoja.getRange(2, 1, hoja.getLastRow() - 1, CRIOS_LIVE_ROOM_HEADERS.PRESENCES.length).getDisplayValues();
  for (let indice = 0; indice < filas.length; indice += 1) {
    if (filas[indice][0] === roomId && filas[indice][1] === participantId) {
      return {
        row: indice + 2,
        presence: {
          roomId: filas[indice][0],
          participantId: filas[indice][1],
          role: filas[indice][2],
          joinedAt: filas[indice][3],
          lastSeenAt: filas[indice][4]
        },
        capabilityHash: filas[indice][5]
      };
    }
  }
  return null;
}

function contarPresenciasLiveRoomRemota(libro, roomId) {
  const hoja = obtenerHojaLecturaLiveRoomRemota(libro, CRIOS_LIVE_ROOM_SHEETS.PRESENCES, CRIOS_LIVE_ROOM_HEADERS.PRESENCES);
  if (!hoja || hoja.getLastRow() < 2) return 0;
  const filas = hoja.getRange(2, 1, hoja.getLastRow() - 1, 1).getDisplayValues();
  return filas.reduce((total, fila) => total + (fila[0] === roomId ? 1 : 0), 0);
}

function escribirPresenciaLiveRoomRemota(libro, presence, capabilityHash) {
  const hoja = obtenerHojaEscrituraLiveRoomRemota(libro, CRIOS_LIVE_ROOM_SHEETS.PRESENCES, CRIOS_LIVE_ROOM_HEADERS.PRESENCES);
  const existente = leerPresenciaLiveRoomRemota(libro, presence.roomId, presence.participantId);
  const fila = existente ? existente.row : hoja.getLastRow() + 1;
  hoja.getRange(fila, 1, 1, CRIOS_LIVE_ROOM_HEADERS.PRESENCES.length).setValues([[
    textoCeldaLiveRoomRemota(presence.roomId),
    textoCeldaLiveRoomRemota(presence.participantId),
    textoCeldaLiveRoomRemota(presence.role),
    textoCeldaLiveRoomRemota(presence.joinedAt),
    textoCeldaLiveRoomRemota(presence.lastSeenAt),
    textoCeldaLiveRoomRemota(capabilityHash)
  ]]);
}

function listarPresenciasLiveRoomRemota(libro, roomId, nowIso) {
  const hoja = obtenerHojaLecturaLiveRoomRemota(libro, CRIOS_LIVE_ROOM_SHEETS.PRESENCES, CRIOS_LIVE_ROOM_HEADERS.PRESENCES);
  if (!hoja || hoja.getLastRow() < 2) return [];
  const filas = hoja.getRange(2, 1, hoja.getLastRow() - 1, CRIOS_LIVE_ROOM_HEADERS.PRESENCES.length).getDisplayValues();
  const nowMs = Date.parse(nowIso);
  return filas
    .filter(fila => fila[0] === roomId)
    .map(fila => {
      const lastSeenMs = Date.parse(fila[4]);
      return {
        participantId: fila[1],
        role: fila[2],
        joinedAt: fila[3],
        lastSeenAt: fila[4],
        connected: Number.isFinite(lastSeenMs) && nowMs <= lastSeenMs + CRIOS_LIVE_ROOM_IDLE_TIMEOUT_MS
      };
    })
    .sort((a, b) => a.joinedAt.localeCompare(b.joinedAt) || a.participantId.localeCompare(b.participantId));
}

function crearRosterSnapshotLiveRoomRemota(participants, generatedAt) {
  const active = participants.filter(participant => participant.connected === true);
  return {
    generatedAt: generatedAt,
    registeredParticipantCount: participants.length,
    activeParticipantCount: active.length,
    activePlayerCount: active.filter(participant => participant.role === 'player').length,
    hostConnected: active.some(participant => participant.role === 'host'),
    participants: participants
  };
}

function leerSolicitudProcesadaLiveRoomRemota(libro, requestId) {
  const hoja = obtenerHojaLecturaLiveRoomRemota(libro, CRIOS_LIVE_ROOM_SHEETS.REQUESTS, CRIOS_LIVE_ROOM_HEADERS.REQUESTS);
  if (!hoja) return null;
  const fila = buscarFilaExactaLiveRoomRemota(hoja, 1, requestId);
  if (!fila) return null;
  const valores = hoja.getRange(fila, 1, 1, CRIOS_LIVE_ROOM_HEADERS.REQUESTS.length).getDisplayValues()[0];
  return {
    operation: valores[1],
    requestHash: valores[2],
    data: JSON.parse(valores[3])
  };
}

function guardarSolicitudProcesadaLiveRoomRemota(libro, solicitud, requestHash, data) {
  const hoja = obtenerHojaEscrituraLiveRoomRemota(libro, CRIOS_LIVE_ROOM_SHEETS.REQUESTS, CRIOS_LIVE_ROOM_HEADERS.REQUESTS);
  hoja.getRange(hoja.getLastRow() + 1, 1, 1, CRIOS_LIVE_ROOM_HEADERS.REQUESTS.length).setValues([[
    textoCeldaLiveRoomRemota(solicitud.requestId),
    textoCeldaLiveRoomRemota(solicitud.operation),
    textoCeldaLiveRoomRemota(requestHash),
    textoCeldaLiveRoomRemota(JSON.stringify(data)),
    textoCeldaLiveRoomRemota(ahoraIsoLiveRoomRemota())
  ]]);
}

function replayLiveRoomRemota(libro, solicitud, requestHash) {
  const previa = leerSolicitudProcesadaLiveRoomRemota(libro, solicitud.requestId);
  if (!previa) return null;
  if (previa.operation !== solicitud.operation || previa.requestHash !== requestHash) {
    return crearRespuestaLiveRoomRemota(solicitud, false, null, CRIOS_LIVE_ROOM_ERROR_CODES.REQUEST_CONFLICT, 'requestId was already used for a different LiveRoom request.', false);
  }
  return crearRespuestaLiveRoomRemota(solicitud, true, previa.data);
}

function crearRoomSnapshotLiveRoomRemota(roomId, campaignId, publicationId, createdAt) {
  return {
    roomId: roomId,
    campaignId: campaignId,
    publicationId: publicationId,
    createdAt: createdAt,
    lastActivityAt: createdAt,
    expiresAt: expiracionDesdeActividadLiveRoomRemota(createdAt),
    status: 'active'
  };
}

function crearPresenciaSnapshotLiveRoomRemota(roomId, participantId, role, joinedAt) {
  return {
    roomId: roomId,
    participantId: participantId,
    role: role,
    joinedAt: joinedAt,
    lastSeenAt: joinedAt
  };
}

function expirarSiCorrespondeLiveRoomRemota(libro, almacenada, nowIso) {
  if (!almacenada) return {unavailable: true};
  const room = almacenada.room;
  if (room.status === 'expired' || Date.parse(nowIso) > Date.parse(room.expiresAt)) {
    if (room.status !== 'expired') {
      room.status = 'expired';
      escribirLiveRoomRemota(libro, room);
    }
    return {expired: true, room: room};
  }
  if (room.status !== 'active') return {unavailable: true};
  return {active: true, room: room};
}

function tocarRoomLiveRoomRemota(room, nowIso) {
  room.lastActivityAt = nowIso;
  room.expiresAt = expiracionDesdeActividadLiveRoomRemota(nowIso);
  room.status = 'active';
  return room;
}

function procesarCrearLiveRoomRemota(libro, solicitud, requestHash) {
  const replay = replayLiveRoomRemota(libro, solicitud, requestHash);
  if (replay) return replay;

  if (typeof leerPublicacionVerificadaRemota !== 'function') {
    return crearRespuestaLiveRoomRemota(solicitud, false, null, CRIOS_LIVE_ROOM_ERROR_CODES.SERVER_ERROR, 'Publication resolver is unavailable.', false);
  }
  const almacenada = leerPublicacionVerificadaRemota(libro, solicitud.payload.publicationId);
  if (!almacenada || almacenada.publication.campaignId !== solicitud.payload.campaignId) {
    return crearRespuestaLiveRoomRemota(solicitud, false, null, CRIOS_LIVE_ROOM_ERROR_CODES.PUBLICATION_UNAVAILABLE, 'Publication is unavailable for LiveRoom creation.', false);
  }

  let roomId = Utilities.getUuid();
  while (leerLiveRoomRemota(libro, roomId)) roomId = Utilities.getUuid();
  const nowIso = ahoraIsoLiveRoomRemota();
  const room = crearRoomSnapshotLiveRoomRemota(roomId, solicitud.payload.campaignId, solicitud.payload.publicationId, nowIso);
  const presence = crearPresenciaSnapshotLiveRoomRemota(roomId, solicitud.payload.participantId, 'host', nowIso);
  escribirLiveRoomRemota(libro, room);
  escribirPresenciaLiveRoomRemota(libro, presence, sha256LiveRoomRemota(solicitud.payload.capabilityToken));
  const data = {room: room, presence: presence};
  guardarSolicitudProcesadaLiveRoomRemota(libro, solicitud, requestHash, data);
  return crearRespuestaLiveRoomRemota(solicitud, true, data);
}

function procesarJoinLiveRoomRemota(libro, solicitud, requestHash) {
  const replay = replayLiveRoomRemota(libro, solicitud, requestHash);
  if (replay) return replay;

  const nowIso = ahoraIsoLiveRoomRemota();
  const estado = expirarSiCorrespondeLiveRoomRemota(libro, leerLiveRoomRemota(libro, solicitud.payload.roomId), nowIso);
  if (estado.unavailable) return crearRespuestaLiveRoomRemota(solicitud, false, null, CRIOS_LIVE_ROOM_ERROR_CODES.ROOM_UNAVAILABLE, 'LiveRoom is unavailable.', false);
  if (estado.expired) return crearRespuestaLiveRoomRemota(solicitud, false, null, CRIOS_LIVE_ROOM_ERROR_CODES.ROOM_EXPIRED, CRIOS_LIVE_ROOM_EXPIRED_MESSAGE, false);
  if (contarPresenciasLiveRoomRemota(libro, estado.room.roomId) >= CRIOS_LIVE_ROOM_MAX_PARTICIPANTS) {
    return crearRespuestaLiveRoomRemota(solicitud, false, null, CRIOS_LIVE_ROOM_ERROR_CODES.ROOM_FULL, 'LiveRoom reached its participant limit.', false);
  }
  if (leerPresenciaLiveRoomRemota(libro, estado.room.roomId, solicitud.payload.participantId)) {
    return crearRespuestaLiveRoomRemota(solicitud, false, null, CRIOS_LIVE_ROOM_ERROR_CODES.PARTICIPANT_CONFLICT, 'participantId is already registered in this LiveRoom.', false);
  }

  const presence = crearPresenciaSnapshotLiveRoomRemota(estado.room.roomId, solicitud.payload.participantId, 'player', nowIso);
  tocarRoomLiveRoomRemota(estado.room, nowIso);
  escribirPresenciaLiveRoomRemota(libro, presence, sha256LiveRoomRemota(solicitud.payload.capabilityToken));
  escribirLiveRoomRemota(libro, estado.room);
  const data = {room: estado.room, presence: presence};
  guardarSolicitudProcesadaLiveRoomRemota(libro, solicitud, requestHash, data);
  return crearRespuestaLiveRoomRemota(solicitud, true, data);
}

function procesarHeartbeatLiveRoomRemota(libro, solicitud, requestHash) {
  const replay = replayLiveRoomRemota(libro, solicitud, requestHash);
  if (replay) return replay;

  const nowIso = ahoraIsoLiveRoomRemota();
  const estado = expirarSiCorrespondeLiveRoomRemota(libro, leerLiveRoomRemota(libro, solicitud.payload.roomId), nowIso);
  if (estado.unavailable) return crearRespuestaLiveRoomRemota(solicitud, false, null, CRIOS_LIVE_ROOM_ERROR_CODES.ROOM_UNAVAILABLE, 'LiveRoom is unavailable.', false);
  if (estado.expired) return crearRespuestaLiveRoomRemota(solicitud, false, null, CRIOS_LIVE_ROOM_ERROR_CODES.ROOM_EXPIRED, CRIOS_LIVE_ROOM_EXPIRED_MESSAGE, false);

  const almacenada = leerPresenciaLiveRoomRemota(libro, estado.room.roomId, solicitud.payload.participantId);
  if (!almacenada) return crearRespuestaLiveRoomRemota(solicitud, false, null, CRIOS_LIVE_ROOM_ERROR_CODES.PARTICIPANT_UNAVAILABLE, 'LiveRoom participant is unavailable.', false);
  const recibido = sha256LiveRoomRemota(solicitud.payload.capabilityToken);
  if (!compararConstanteLiveRoomRemota(almacenada.capabilityHash, recibido)) {
    return crearRespuestaLiveRoomRemota(solicitud, false, null, CRIOS_LIVE_ROOM_ERROR_CODES.CAPABILITY_INVALID, 'LiveRoom participant capability is invalid.', false);
  }

  almacenada.presence.lastSeenAt = nowIso;
  tocarRoomLiveRoomRemota(estado.room, nowIso);
  escribirPresenciaLiveRoomRemota(libro, almacenada.presence, almacenada.capabilityHash);
  escribirLiveRoomRemota(libro, estado.room);
  const data = {room: estado.room, presence: almacenada.presence};
  guardarSolicitudProcesadaLiveRoomRemota(libro, solicitud, requestHash, data);
  return crearRespuestaLiveRoomRemota(solicitud, true, data);
}

function procesarGetLiveRoomRemota(libro, solicitud) {
  const nowIso = ahoraIsoLiveRoomRemota();
  const estado = expirarSiCorrespondeLiveRoomRemota(libro, leerLiveRoomRemota(libro, solicitud.payload.roomId), nowIso);
  if (estado.unavailable) return crearRespuestaLiveRoomRemota(solicitud, false, null, CRIOS_LIVE_ROOM_ERROR_CODES.ROOM_UNAVAILABLE, 'LiveRoom is unavailable.', false);
  if (estado.expired) return crearRespuestaLiveRoomRemota(solicitud, false, null, CRIOS_LIVE_ROOM_ERROR_CODES.ROOM_EXPIRED, CRIOS_LIVE_ROOM_EXPIRED_MESSAGE, false);
  return crearRespuestaLiveRoomRemota(solicitud, true, {room: estado.room});
}

function procesarGetRosterLiveRoomRemota(libro, solicitud) {
  const nowIso = ahoraIsoLiveRoomRemota();
  const estado = expirarSiCorrespondeLiveRoomRemota(libro, leerLiveRoomRemota(libro, solicitud.payload.roomId), nowIso);
  if (estado.unavailable) return crearRespuestaLiveRoomRemota(solicitud, false, null, CRIOS_LIVE_ROOM_ERROR_CODES.ROOM_UNAVAILABLE, 'LiveRoom is unavailable.', false);
  if (estado.expired) return crearRespuestaLiveRoomRemota(solicitud, false, null, CRIOS_LIVE_ROOM_ERROR_CODES.ROOM_EXPIRED, CRIOS_LIVE_ROOM_EXPIRED_MESSAGE, false);

  const almacenada = leerPresenciaLiveRoomRemota(libro, estado.room.roomId, solicitud.payload.participantId);
  if (!almacenada) return crearRespuestaLiveRoomRemota(solicitud, false, null, CRIOS_LIVE_ROOM_ERROR_CODES.PARTICIPANT_UNAVAILABLE, 'LiveRoom participant is unavailable.', false);
  const recibido = sha256LiveRoomRemota(solicitud.payload.capabilityToken);
  if (!compararConstanteLiveRoomRemota(almacenada.capabilityHash, recibido)) {
    return crearRespuestaLiveRoomRemota(solicitud, false, null, CRIOS_LIVE_ROOM_ERROR_CODES.CAPABILITY_INVALID, 'LiveRoom participant capability is invalid.', false);
  }
  if (almacenada.presence.role !== 'host') {
    return crearRespuestaLiveRoomRemota(solicitud, false, null, CRIOS_LIVE_ROOM_ERROR_CODES.HOST_REQUIRED, 'Only the LiveRoom host can read the participant roster.', false);
  }

  const participants = listarPresenciasLiveRoomRemota(libro, estado.room.roomId, nowIso);
  return crearRespuestaLiveRoomRemota(solicitud, true, {
    room: estado.room,
    roster: crearRosterSnapshotLiveRoomRemota(participants, nowIso)
  });
}

function procesarSolicitudLiveRoomRemota(solicitud) {
  const validacion = validarSolicitudLiveRoomRemota(solicitud);
  if (!validacion.ok) return crearRespuestaLiveRoomRemota(solicitud, false, null, validacion.code, validacion.message, false);

  const bloqueo = LockService.getScriptLock();
  bloqueo.waitLock(10000);
  try {
    const libro = SpreadsheetApp.getActiveSpreadsheet();
    if (solicitud.operation === CRIOS_LIVE_ROOM_OPERATIONS.GET) return procesarGetLiveRoomRemota(libro, solicitud);
    if (solicitud.operation === CRIOS_LIVE_ROOM_OPERATIONS.GET_ROSTER) return procesarGetRosterLiveRoomRemota(libro, solicitud);
    const requestHash = hashSolicitudLiveRoomRemota(solicitud);
    if (solicitud.operation === CRIOS_LIVE_ROOM_OPERATIONS.CREATE) return procesarCrearLiveRoomRemota(libro, solicitud, requestHash);
    if (solicitud.operation === CRIOS_LIVE_ROOM_OPERATIONS.JOIN) return procesarJoinLiveRoomRemota(libro, solicitud, requestHash);
    if (solicitud.operation === CRIOS_LIVE_ROOM_OPERATIONS.HEARTBEAT) return procesarHeartbeatLiveRoomRemota(libro, solicitud, requestHash);
    return crearRespuestaLiveRoomRemota(solicitud, false, null, CRIOS_LIVE_ROOM_ERROR_CODES.UNSUPPORTED_OPERATION, 'LiveRoom operation is unsupported.', false);
  } catch (error) {
    return crearRespuestaLiveRoomRemota(solicitud, false, null, CRIOS_LIVE_ROOM_ERROR_CODES.SERVER_ERROR, 'LiveRoom server failure.', true);
  } finally {
    bloqueo.releaseLock();
  }
}

function esEnvelopePostLiveRoomRemota(datos) {
  return clavesExactasLiveRoomRemota(datos, ['liveRoomRequest']) && esObjetoPlanoLiveRoomRemota(datos.liveRoomRequest);
}
