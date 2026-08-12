const CRIOS_PUBLICATION_PROTOCOL_VERSION = '1.0';
const CRIOS_PUBLICATION_WRITE_TOKEN_HASH_PROPERTY = 'CRIOS_PUBLICATION_WRITE_TOKEN_SHA256';
const CRIOS_PUBLICATION_WRITE_TOKEN_MIN_LENGTH = 8;
const CRIOS_PUBLICATION_WRITE_TOKEN_MAX_LENGTH = 256;
const CRIOS_PUBLICATION_MAX_CONTENT_BYTES = 524288;
const CRIOS_PUBLICATION_CHUNK_SIZE = 30000;

const CRIOS_PUBLICATION_OPERATIONS = Object.freeze({
  PUBLISH: 'publishPublication',
  ACTIVATE: 'activatePublication',
  DEACTIVATE: 'deactivatePublication',
  GET: 'getPublication'
});

const CRIOS_PUBLICATION_ERROR_CODES = Object.freeze({
  INVALID_REQUEST: 'INVALID_REQUEST',
  UNSUPPORTED_PROTOCOL: 'UNSUPPORTED_PROTOCOL',
  UNSUPPORTED_OPERATION: 'UNSUPPORTED_OPERATION',
  CONTENT_TOO_LARGE: 'CONTENT_TOO_LARGE',
  WRITE_UNAUTHORIZED: 'WRITE_UNAUTHORIZED',
  WRITE_CONFLICT: 'WRITE_CONFLICT',
  PUBLICATION_UNAVAILABLE: 'PUBLICATION_UNAVAILABLE',
  SERVER_VALIDATION_FAILED: 'SERVER_VALIDATION_FAILED',
  SERVER_HASH_MISMATCH: 'SERVER_HASH_MISMATCH',
  SERVER_ERROR: 'SERVER_ERROR'
});

const CRIOS_PUBLICATION_SHEETS = Object.freeze({
  PUBLICATIONS: 'CRIOS_PUBLICACIONES',
  CHUNKS: 'CRIOS_PUBLICACION_BLOQUES',
  ACTIVE: 'CRIOS_PUBLICACION_ACTIVAS',
  ACTIVATIONS: 'CRIOS_PUBLICACION_EVENTOS',
  REQUESTS: 'CRIOS_PUBLICACION_SOLICITUDES'
});

const CRIOS_PUBLICATION_HEADERS = Object.freeze({
  PUBLICATIONS: Object.freeze([
    'PUBLICATION_ID',
    'CAMPAIGN_ID',
    'VERSION',
    'SCHEMA_VERSION',
    'CONTENT_HASH',
    'SOURCE_DRAFT_REVISION',
    'CREATED_AT',
    'STATUS',
    'CONTENT_BYTES',
    'CHUNK_COUNT',
    'REQUEST_ID',
    'REQUEST_HASH'
  ]),
  CHUNKS: Object.freeze([
    'PUBLICATION_ID',
    'CHUNK_INDEX',
    'DATA_B64'
  ]),
  ACTIVE: Object.freeze([
    'CAMPAIGN_ID',
    'PUBLICATION_ID',
    'VERSION',
    'CONTENT_HASH',
    'ACTIVATED_AT'
  ]),
  ACTIVATIONS: Object.freeze([
    'ACTIVATION_ID',
    'ACTION',
    'CAMPAIGN_ID',
    'PREVIOUS_PUBLICATION_ID',
    'NEXT_PUBLICATION_ID',
    'OCCURRED_AT',
    'REQUEST_HASH'
  ]),
  REQUESTS: Object.freeze([
    'REQUEST_ID',
    'OPERATION',
    'REQUEST_HASH',
    'RESULT_PUBLICATION_ID',
    'CHANGED',
    'REFERENCE_JSON',
    'EVENT_JSON',
    'CREATED_AT'
  ])
});

function esClavePeligrosaPublicacionRemota(clave) {
  return clave === '__proto__' || clave === 'prototype' || clave === 'constructor';
}

function esObjetoPlanoPublicacionRemota(valor) {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) return false;
  const prototipo = Object.getPrototypeOf(valor);
  return prototipo === Object.prototype || prototipo === null;
}

function clavesExactasPublicacionRemota(valor, esperadas) {
  if (!esObjetoPlanoPublicacionRemota(valor)) return false;
  const actuales = Object.keys(valor).sort();
  const objetivo = esperadas.slice().sort();
  return actuales.length === objetivo.length && actuales.every((clave, indice) => clave === objetivo[indice]);
}

function cadenaNormalizadaPublicacionRemota(valor, maximo) {
  if (typeof valor !== 'string') return null;
  const limpia = valor.trim();
  if (!limpia || limpia.length > maximo || /[\u0000-\u001F\u007F]/.test(limpia)) return null;
  return limpia;
}

function hashValidoPublicacionRemota(valor) {
  return typeof valor === 'string' && /^[0-9a-f]{64}$/.test(valor);
}

function operacionPublicacionRemotaConocida(valor) {
  return Object.keys(CRIOS_PUBLICATION_OPERATIONS).some(clave => CRIOS_PUBLICATION_OPERATIONS[clave] === valor);
}

function validarValorSerializablePublicacionRemota(valor, vistos, ruta) {
  if (valor === null || typeof valor === 'string' || typeof valor === 'boolean') return;
  if (typeof valor === 'number') {
    if (!Number.isFinite(valor)) throw new Error('Non-finite number at ' + ruta + '.');
    return;
  }
  if (typeof valor !== 'object') throw new Error('Non-serializable value at ' + ruta + '.');
  if (vistos.indexOf(valor) >= 0) throw new Error('Circular value at ' + ruta + '.');
  if (!Array.isArray(valor) && !esObjetoPlanoPublicacionRemota(valor)) {
    throw new Error('Only plain objects and arrays are supported at ' + ruta + '.');
  }

  vistos.push(valor);
  if (Array.isArray(valor)) {
    for (let indice = 0; indice < valor.length; indice += 1) {
      if (!Object.prototype.hasOwnProperty.call(valor, indice)) {
        throw new Error('Sparse arrays are not supported at ' + ruta + '.');
      }
      validarValorSerializablePublicacionRemota(valor[indice], vistos, ruta + '[' + indice + ']');
    }
    const extras = Object.keys(valor).filter(clave => !/^(0|[1-9]\d*)$/.test(clave) || Number(clave) >= valor.length);
    if (extras.length) throw new Error('Array properties are not supported at ' + ruta + '.');
  } else {
    Object.keys(valor).forEach(clave => {
      if (esClavePeligrosaPublicacionRemota(clave)) throw new Error('Dangerous key at ' + ruta + '.' + clave + '.');
      validarValorSerializablePublicacionRemota(valor[clave], vistos, ruta + '.' + clave);
    });
  }
  vistos.pop();
}

function medirJsonUtf8PublicacionRemota(valor) {
  validarValorSerializablePublicacionRemota(valor, [], '$');
  const json = JSON.stringify(valor);
  if (typeof json !== 'string') throw new Error('Publication content cannot be serialized as JSON.');
  return Utilities.newBlob(json).getBytes().length;
}

function ordenarRecursivamentePublicacionRemota(valor) {
  if (valor === null || typeof valor === 'string' || typeof valor === 'boolean') return valor;
  if (typeof valor === 'number') {
    if (!Number.isFinite(valor)) throw new Error('Publication content contains a non-finite number.');
    return valor;
  }
  if (Array.isArray(valor)) return valor.map(ordenarRecursivamentePublicacionRemota);
  if (!esObjetoPlanoPublicacionRemota(valor)) throw new Error('Publication content contains an unsupported value.');

  const salida = {};
  Object.keys(valor).sort().forEach(clave => {
    if (esClavePeligrosaPublicacionRemota(clave)) throw new Error('Publication content contains a dangerous key.');
    const hijo = valor[clave];
    if (hijo === undefined || typeof hijo === 'function' || typeof hijo === 'symbol' || typeof hijo === 'bigint') {
      throw new Error('Publication content contains a non-serializable value.');
    }
    salida[clave] = ordenarRecursivamentePublicacionRemota(hijo);
  });
  return salida;
}

function canonicalizarContenidoPublicacionRemota(schemaVersion, content) {
  validarValorSerializablePublicacionRemota(content, [], '$.content');
  return JSON.stringify(ordenarRecursivamentePublicacionRemota({
    schemaVersion: schemaVersion,
    content: content
  }));
}

function sha256PublicacionRemota(texto) {
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

function hashSolicitudPublicacionRemota(solicitud) {
  return sha256PublicacionRemota(JSON.stringify(ordenarRecursivamentePublicacionRemota(solicitud)));
}

function crearRespuestaPublicacionRemota(solicitud, exito, datos, codigo, mensaje, reintentable) {
  const operacion = solicitud && operacionPublicacionRemotaConocida(solicitud.operation)
    ? solicitud.operation
    : CRIOS_PUBLICATION_OPERATIONS.GET;
  const requestId = solicitud && cadenaNormalizadaPublicacionRemota(solicitud.requestId, 160)
    ? solicitud.requestId.trim()
    : 'invalid-request';

  return {
    protocolVersion: CRIOS_PUBLICATION_PROTOCOL_VERSION,
    operation: operacion,
    requestId: requestId,
    success: Boolean(exito),
    data: exito ? datos : null,
    error: exito ? null : {
      code: codigo || CRIOS_PUBLICATION_ERROR_CODES.SERVER_ERROR,
      message: String(mensaje || codigo || 'Remote publication server error.'),
      retryable: Boolean(reintentable)
    }
  };
}

function validarSolicitudPublicacionRemota(solicitud) {
  if (!clavesExactasPublicacionRemota(solicitud, ['protocolVersion', 'operation', 'requestId', 'payload'])) {
    return {ok: false, code: CRIOS_PUBLICATION_ERROR_CODES.INVALID_REQUEST, message: 'Remote request envelope shape is invalid.'};
  }
  if (solicitud.protocolVersion !== CRIOS_PUBLICATION_PROTOCOL_VERSION) {
    return {ok: false, code: CRIOS_PUBLICATION_ERROR_CODES.UNSUPPORTED_PROTOCOL, message: 'Remote protocolVersion is unsupported.'};
  }
  if (!operacionPublicacionRemotaConocida(solicitud.operation)) {
    return {ok: false, code: CRIOS_PUBLICATION_ERROR_CODES.UNSUPPORTED_OPERATION, message: 'Remote operation is unsupported.'};
  }
  if (cadenaNormalizadaPublicacionRemota(solicitud.requestId, 160) !== solicitud.requestId) {
    return {ok: false, code: CRIOS_PUBLICATION_ERROR_CODES.INVALID_REQUEST, message: 'requestId is invalid or not normalized.'};
  }
  if (!esObjetoPlanoPublicacionRemota(solicitud.payload)) {
    return {ok: false, code: CRIOS_PUBLICATION_ERROR_CODES.INVALID_REQUEST, message: 'payload must be a plain object.'};
  }

  const payload = solicitud.payload;
  if (solicitud.operation === CRIOS_PUBLICATION_OPERATIONS.PUBLISH) {
    if (!clavesExactasPublicacionRemota(payload, ['campaignId', 'draftRevision', 'schemaVersion', 'contentHash', 'content'])) {
      return {ok: false, code: CRIOS_PUBLICATION_ERROR_CODES.INVALID_REQUEST, message: 'publishPublication payload shape is invalid.'};
    }
    if (cadenaNormalizadaPublicacionRemota(payload.campaignId, 160) !== payload.campaignId ||
        cadenaNormalizadaPublicacionRemota(payload.draftRevision, 200) !== payload.draftRevision ||
        cadenaNormalizadaPublicacionRemota(payload.schemaVersion, 40) !== payload.schemaVersion ||
        !hashValidoPublicacionRemota(payload.contentHash) ||
        !esObjetoPlanoPublicacionRemota(payload.content)) {
      return {ok: false, code: CRIOS_PUBLICATION_ERROR_CODES.INVALID_REQUEST, message: 'publishPublication payload values are invalid.'};
    }
    try {
      const tamano = medirJsonUtf8PublicacionRemota(payload.content);
      if (tamano > CRIOS_PUBLICATION_MAX_CONTENT_BYTES) {
        return {ok: false, code: CRIOS_PUBLICATION_ERROR_CODES.CONTENT_TOO_LARGE, message: 'content exceeds the remote publication size limit.'};
      }
    } catch (errorContenido) {
      return {ok: false, code: CRIOS_PUBLICATION_ERROR_CODES.INVALID_REQUEST, message: String(errorContenido && errorContenido.message || errorContenido)};
    }
  } else if (solicitud.operation === CRIOS_PUBLICATION_OPERATIONS.ACTIVATE) {
    if (!clavesExactasPublicacionRemota(payload, ['campaignId', 'publicationId']) ||
        cadenaNormalizadaPublicacionRemota(payload.campaignId, 160) !== payload.campaignId ||
        cadenaNormalizadaPublicacionRemota(payload.publicationId, 200) !== payload.publicationId) {
      return {ok: false, code: CRIOS_PUBLICATION_ERROR_CODES.INVALID_REQUEST, message: 'activatePublication payload is invalid.'};
    }
  } else if (solicitud.operation === CRIOS_PUBLICATION_OPERATIONS.DEACTIVATE) {
    if (!clavesExactasPublicacionRemota(payload, ['campaignId']) ||
        cadenaNormalizadaPublicacionRemota(payload.campaignId, 160) !== payload.campaignId) {
      return {ok: false, code: CRIOS_PUBLICATION_ERROR_CODES.INVALID_REQUEST, message: 'deactivatePublication payload is invalid.'};
    }
  } else if (solicitud.operation === CRIOS_PUBLICATION_OPERATIONS.GET) {
    if (!clavesExactasPublicacionRemota(payload, ['campaignId', 'publicationId']) ||
        cadenaNormalizadaPublicacionRemota(payload.campaignId, 160) !== payload.campaignId ||
        cadenaNormalizadaPublicacionRemota(payload.publicationId, 200) !== payload.publicationId) {
      return {ok: false, code: CRIOS_PUBLICATION_ERROR_CODES.INVALID_REQUEST, message: 'getPublication payload is invalid.'};
    }
  }

  return {ok: true};
}

function compararConstantePublicacionRemota(a, b) {
  const izquierda = String(a == null ? '' : a);
  const derecha = String(b == null ? '' : b);
  let diferencia = izquierda.length ^ derecha.length;
  const largo = Math.max(izquierda.length, derecha.length);
  for (let indice = 0; indice < largo; indice += 1) {
    const codigoIzquierda = indice < izquierda.length ? izquierda.charCodeAt(indice) : 0;
    const codigoDerecha = indice < derecha.length ? derecha.charCodeAt(indice) : 0;
    diferencia |= codigoIzquierda ^ codigoDerecha;
  }
  return diferencia === 0;
}

function autorizarEscrituraPublicacionRemota(contexto) {
  const hashEsperado = PropertiesService
    .getScriptProperties()
    .getProperty(CRIOS_PUBLICATION_WRITE_TOKEN_HASH_PROPERTY);
  if (!hashValidoPublicacionRemota(hashEsperado)) return false;

  const recibido = contexto && typeof contexto.writeToken === 'string'
    ? contexto.writeToken
    : '';
  if (recibido.length < CRIOS_PUBLICATION_WRITE_TOKEN_MIN_LENGTH ||
      recibido.length > CRIOS_PUBLICATION_WRITE_TOKEN_MAX_LENGTH) {
    return false;
  }

  return compararConstantePublicacionRemota(
    hashEsperado,
    sha256PublicacionRemota(recibido)
  );
}

function encabezadosValidosPublicacionRemota(hoja, encabezados) {
  if (!hoja || hoja.getLastRow() < 1) return false;
  const actuales = hoja.getRange(1, 1, 1, encabezados.length).getDisplayValues()[0];
  return encabezados.every((encabezado, indice) => actuales[indice] === encabezado);
}

function obtenerHojaLecturaPublicacionRemota(libro, nombre, encabezados) {
  const hoja = libro.getSheetByName(nombre);
  if (!hoja || hoja.getLastRow() === 0) return null;
  if (!encabezadosValidosPublicacionRemota(hoja, encabezados)) {
    throw new Error('Remote publication sheet header mismatch: ' + nombre + '.');
  }
  return hoja;
}

function obtenerHojaEscrituraPublicacionRemota(libro, nombre, encabezados) {
  const hoja = libro.getSheetByName(nombre) || libro.insertSheet(nombre);
  if (hoja.getLastRow() === 0) {
    const rango = hoja.getRange(1, 1, 1, encabezados.length);
    rango.setValues([encabezados]);
    rango.setFontWeight('bold');
    hoja.setFrozenRows(1);
  } else if (!encabezadosValidosPublicacionRemota(hoja, encabezados)) {
    throw new Error('Remote publication sheet header mismatch: ' + nombre + '.');
  }
  return hoja;
}

function textoCeldaPublicacionRemota(valor) {
  const texto = String(valor == null ? '' : valor);
  return /^[=+\-@]/.test(texto) ? "'" + texto : texto;
}

function buscarFilaExactaPublicacionRemota(hoja, columna, valor) {
  if (!hoja) return 0;
  const ultimaFila = hoja.getLastRow();
  if (ultimaFila < 2) return 0;
  const coincidencia = hoja
    .getRange(2, columna, ultimaFila - 1, 1)
    .createTextFinder(String(valor))
    .matchEntireCell(true)
    .findNext();
  return coincidencia ? coincidencia.getRow() : 0;
}

function leerPublicacionPorIdRemota(libro, publicationId) {
  const hoja = obtenerHojaLecturaPublicacionRemota(
    libro,
    CRIOS_PUBLICATION_SHEETS.PUBLICATIONS,
    CRIOS_PUBLICATION_HEADERS.PUBLICATIONS
  );
  if (!hoja) return null;
  const fila = buscarFilaExactaPublicacionRemota(hoja, 1, publicationId);
  if (!fila) return null;
  const valores = hoja.getRange(fila, 1, 1, CRIOS_PUBLICATION_HEADERS.PUBLICATIONS.length).getDisplayValues()[0];
  const chunkCount = Number(valores[9]);
  const contentBytes = Number(valores[8]);
  if (!Number.isSafeInteger(chunkCount) || chunkCount < 1 || !Number.isSafeInteger(contentBytes) || contentBytes < 0) {
    throw new Error('Stored publication metadata is invalid.');
  }

  const hojaBloques = obtenerHojaLecturaPublicacionRemota(
    libro,
    CRIOS_PUBLICATION_SHEETS.CHUNKS,
    CRIOS_PUBLICATION_HEADERS.CHUNKS
  );
  if (!hojaBloques) throw new Error('Stored publication chunks are missing.');
  const ultimaFilaBloques = hojaBloques.getLastRow();
  const bloques = [];
  if (ultimaFilaBloques >= 2) {
    const filas = hojaBloques.getRange(2, 1, ultimaFilaBloques - 1, CRIOS_PUBLICATION_HEADERS.CHUNKS.length).getDisplayValues();
    filas.forEach(filaBloque => {
      if (filaBloque[0] === publicationId) bloques.push({indice: Number(filaBloque[1]), data: filaBloque[2]});
    });
  }
  bloques.sort((a, b) => a.indice - b.indice);
  if (bloques.length !== chunkCount || bloques.some((bloque, indice) => bloque.indice !== indice)) {
    throw new Error('Stored publication chunks are incomplete or inconsistent.');
  }

  const base64 = bloques.map(bloque => bloque.data).join('');
  const json = Utilities.newBlob(Utilities.base64DecodeWebSafe(base64)).getDataAsString('UTF-8');
  if (Utilities.newBlob(json).getBytes().length !== contentBytes) throw new Error('Stored publication content byte length is inconsistent.');
  const content = JSON.parse(json);
  validarValorSerializablePublicacionRemota(content, [], '$.storedContent');

  const publication = {
    campaignId: valores[1],
    publicationId: valores[0],
    version: Number(valores[2]),
    schemaVersion: valores[3],
    contentHash: valores[4],
    content: content
  };
  const record = {
    publicationId: valores[0],
    campaignId: valores[1],
    version: Number(valores[2]),
    schemaVersion: valores[3],
    contentHash: valores[4],
    sourceDraftRevision: valores[5],
    createdAt: valores[6],
    status: valores[7]
  };

  if (!Number.isSafeInteger(publication.version) || publication.version < 1 ||
      !hashValidoPublicacionRemota(publication.contentHash) || record.status !== 'PUBLISHED') {
    throw new Error('Stored publication identity is invalid.');
  }

  return {
    publication: publication,
    record: record,
    contentBytes: contentBytes,
    requestId: valores[10],
    requestHash: valores[11]
  };
}

function siguienteVersionPublicacionRemota(libro, campaignId) {
  const hoja = obtenerHojaEscrituraPublicacionRemota(
    libro,
    CRIOS_PUBLICATION_SHEETS.PUBLICATIONS,
    CRIOS_PUBLICATION_HEADERS.PUBLICATIONS
  );
  const ultimaFila = hoja.getLastRow();
  if (ultimaFila < 2) return 1;
  const filas = hoja.getRange(2, 1, ultimaFila - 1, CRIOS_PUBLICATION_HEADERS.PUBLICATIONS.length).getDisplayValues();
  let maxima = 0;
  filas.forEach(fila => {
    if (fila[1] === campaignId) {
      const version = Number(fila[2]);
      if (Number.isSafeInteger(version) && version > maxima) maxima = version;
    }
  });
  return maxima + 1;
}

function guardarPublicacionRemota(libro, request, requestHash, publication, record) {
  const json = JSON.stringify(publication.content);
  const bytes = Utilities.newBlob(json).getBytes().length;
  const encoded = Utilities.base64EncodeWebSafe(json, Utilities.Charset.UTF_8);
  const chunks = [];
  for (let offset = 0; offset < encoded.length; offset += CRIOS_PUBLICATION_CHUNK_SIZE) {
    chunks.push(encoded.slice(offset, offset + CRIOS_PUBLICATION_CHUNK_SIZE));
  }
  if (!chunks.length) chunks.push('');

  // Los bloques se escriben primero y el registro de publicación al final.
  // Así una escritura parcial nunca vuelve visible una publicación sin contenido completo.
  const hojaBloques = obtenerHojaEscrituraPublicacionRemota(
    libro,
    CRIOS_PUBLICATION_SHEETS.CHUNKS,
    CRIOS_PUBLICATION_HEADERS.CHUNKS
  );
  const filas = chunks.map((chunk, indice) => [
    textoCeldaPublicacionRemota(publication.publicationId),
    indice,
    textoCeldaPublicacionRemota(chunk)
  ]);
  hojaBloques.getRange(hojaBloques.getLastRow() + 1, 1, filas.length, CRIOS_PUBLICATION_HEADERS.CHUNKS.length).setValues(filas);

  const hoja = obtenerHojaEscrituraPublicacionRemota(
    libro,
    CRIOS_PUBLICATION_SHEETS.PUBLICATIONS,
    CRIOS_PUBLICATION_HEADERS.PUBLICATIONS
  );
  hoja.getRange(hoja.getLastRow() + 1, 1, 1, CRIOS_PUBLICATION_HEADERS.PUBLICATIONS.length).setValues([[
    textoCeldaPublicacionRemota(publication.publicationId),
    textoCeldaPublicacionRemota(publication.campaignId),
    publication.version,
    textoCeldaPublicacionRemota(publication.schemaVersion),
    textoCeldaPublicacionRemota(publication.contentHash),
    textoCeldaPublicacionRemota(record.sourceDraftRevision),
    textoCeldaPublicacionRemota(record.createdAt),
    textoCeldaPublicacionRemota(record.status),
    bytes,
    chunks.length,
    textoCeldaPublicacionRemota(request.requestId),
    textoCeldaPublicacionRemota(requestHash)
  ]]);
}

function buscarPublicacionPorRequestIdRemota(libro, requestId) {
  const hoja = obtenerHojaLecturaPublicacionRemota(
    libro,
    CRIOS_PUBLICATION_SHEETS.PUBLICATIONS,
    CRIOS_PUBLICATION_HEADERS.PUBLICATIONS
  );
  if (!hoja) return null;
  const fila = buscarFilaExactaPublicacionRemota(hoja, 11, requestId);
  if (!fila) return null;
  return leerPublicacionPorIdRemota(libro, hoja.getRange(fila, 1).getDisplayValue());
}

function leerReferenciaActivaPublicacionRemota(libro, campaignId) {
  const hoja = obtenerHojaLecturaPublicacionRemota(
    libro,
    CRIOS_PUBLICATION_SHEETS.ACTIVE,
    CRIOS_PUBLICATION_HEADERS.ACTIVE
  );
  if (!hoja) return null;
  const fila = buscarFilaExactaPublicacionRemota(hoja, 1, campaignId);
  if (!fila) return null;
  const valores = hoja.getRange(fila, 1, 1, CRIOS_PUBLICATION_HEADERS.ACTIVE.length).getDisplayValues()[0];
  return {
    campaignId: valores[0],
    publicationId: valores[1],
    version: Number(valores[2]),
    contentHash: valores[3],
    activatedAt: valores[4]
  };
}

function escribirReferenciaActivaPublicacionRemota(libro, referencia) {
  const hoja = obtenerHojaEscrituraPublicacionRemota(
    libro,
    CRIOS_PUBLICATION_SHEETS.ACTIVE,
    CRIOS_PUBLICATION_HEADERS.ACTIVE
  );
  let fila = buscarFilaExactaPublicacionRemota(hoja, 1, referencia.campaignId);
  if (!fila) fila = hoja.getLastRow() + 1;
  hoja.getRange(fila, 1, 1, CRIOS_PUBLICATION_HEADERS.ACTIVE.length).setValues([[
    textoCeldaPublicacionRemota(referencia.campaignId),
    textoCeldaPublicacionRemota(referencia.publicationId),
    referencia.version,
    textoCeldaPublicacionRemota(referencia.contentHash),
    textoCeldaPublicacionRemota(referencia.activatedAt)
  ]]);
}

function eliminarReferenciaActivaPublicacionRemota(libro, campaignId) {
  const hoja = obtenerHojaLecturaPublicacionRemota(
    libro,
    CRIOS_PUBLICATION_SHEETS.ACTIVE,
    CRIOS_PUBLICATION_HEADERS.ACTIVE
  );
  if (!hoja) return;
  const fila = buscarFilaExactaPublicacionRemota(hoja, 1, campaignId);
  if (fila) hoja.deleteRow(fila);
}

function leerEventoActivacionPublicacionRemota(libro, activationId) {
  const hoja = obtenerHojaLecturaPublicacionRemota(
    libro,
    CRIOS_PUBLICATION_SHEETS.ACTIVATIONS,
    CRIOS_PUBLICATION_HEADERS.ACTIVATIONS
  );
  if (!hoja) return null;
  const fila = buscarFilaExactaPublicacionRemota(hoja, 1, activationId);
  if (!fila) return null;
  const valores = hoja.getRange(fila, 1, 1, CRIOS_PUBLICATION_HEADERS.ACTIVATIONS.length).getDisplayValues()[0];
  return {
    event: {
      activationId: valores[0],
      action: valores[1],
      campaignId: valores[2],
      previousPublicationId: valores[3] || null,
      nextPublicationId: valores[4] || null,
      occurredAt: valores[5]
    },
    requestHash: valores[6]
  };
}

function guardarEventoActivacionPublicacionRemota(libro, evento, requestHash) {
  const hoja = obtenerHojaEscrituraPublicacionRemota(
    libro,
    CRIOS_PUBLICATION_SHEETS.ACTIVATIONS,
    CRIOS_PUBLICATION_HEADERS.ACTIVATIONS
  );
  hoja.getRange(hoja.getLastRow() + 1, 1, 1, CRIOS_PUBLICATION_HEADERS.ACTIVATIONS.length).setValues([[
    textoCeldaPublicacionRemota(evento.activationId),
    textoCeldaPublicacionRemota(evento.action),
    textoCeldaPublicacionRemota(evento.campaignId),
    textoCeldaPublicacionRemota(evento.previousPublicationId || ''),
    textoCeldaPublicacionRemota(evento.nextPublicationId || ''),
    textoCeldaPublicacionRemota(evento.occurredAt),
    textoCeldaPublicacionRemota(requestHash)
  ]]);
}

function leerSolicitudProcesadaPublicacionRemota(libro, requestId) {
  const hoja = obtenerHojaLecturaPublicacionRemota(
    libro,
    CRIOS_PUBLICATION_SHEETS.REQUESTS,
    CRIOS_PUBLICATION_HEADERS.REQUESTS
  );
  if (!hoja) return null;
  const fila = buscarFilaExactaPublicacionRemota(hoja, 1, requestId);
  if (!fila) return null;
  const valores = hoja.getRange(fila, 1, 1, CRIOS_PUBLICATION_HEADERS.REQUESTS.length).getDisplayValues()[0];
  return {
    requestId: valores[0],
    operation: valores[1],
    requestHash: valores[2],
    resultPublicationId: valores[3] || null,
    changed: valores[4] === '' ? null : valores[4] === '1',
    reference: valores[5] ? JSON.parse(valores[5]) : null,
    event: valores[6] ? JSON.parse(valores[6]) : null,
    createdAt: valores[7]
  };
}

function guardarSolicitudProcesadaPublicacionRemota(libro, solicitud, requestHash, resultado) {
  const hoja = obtenerHojaEscrituraPublicacionRemota(
    libro,
    CRIOS_PUBLICATION_SHEETS.REQUESTS,
    CRIOS_PUBLICATION_HEADERS.REQUESTS
  );
  hoja.getRange(hoja.getLastRow() + 1, 1, 1, CRIOS_PUBLICATION_HEADERS.REQUESTS.length).setValues([[
    textoCeldaPublicacionRemota(solicitud.requestId),
    textoCeldaPublicacionRemota(solicitud.operation),
    textoCeldaPublicacionRemota(requestHash),
    textoCeldaPublicacionRemota(resultado.resultPublicationId || ''),
    resultado.changed === null || resultado.changed === undefined ? '' : (resultado.changed ? '1' : '0'),
    textoCeldaPublicacionRemota(resultado.reference ? JSON.stringify(resultado.reference) : ''),
    textoCeldaPublicacionRemota(resultado.event ? JSON.stringify(resultado.event) : ''),
    textoCeldaPublicacionRemota(new Date().toISOString())
  ]]);
}

function verificarIntegridadPublicacionRemota(publication) {
  if (!publication || !hashValidoPublicacionRemota(publication.contentHash)) return false;
  const canonical = canonicalizarContenidoPublicacionRemota(publication.schemaVersion, publication.content);
  return sha256PublicacionRemota(canonical) === publication.contentHash;
}

function leerPublicacionVerificadaRemota(libro, publicationId) {
  try {
    const almacenada = leerPublicacionPorIdRemota(libro, publicationId);
    if (!almacenada || !verificarIntegridadPublicacionRemota(almacenada.publication)) return null;
    return almacenada;
  } catch (error) {
    return null;
  }
}

function responderReplayPublicacionRemota(libro, solicitud, requestHash, procesada) {
  if (procesada.operation !== solicitud.operation || procesada.requestHash !== requestHash) {
    return crearRespuestaPublicacionRemota(
      solicitud,
      false,
      null,
      CRIOS_PUBLICATION_ERROR_CODES.WRITE_CONFLICT,
      'requestId was already used for a different remote publication request.',
      false
    );
  }

  if (solicitud.operation === CRIOS_PUBLICATION_OPERATIONS.PUBLISH) {
    const almacenada = procesada.resultPublicationId
      ? leerPublicacionVerificadaRemota(libro, procesada.resultPublicationId)
      : null;
    if (!almacenada) {
      return crearRespuestaPublicacionRemota(solicitud, false, null, CRIOS_PUBLICATION_ERROR_CODES.SERVER_ERROR, 'Stored idempotent publication is unavailable.', false);
    }
    return crearRespuestaPublicacionRemota(solicitud, true, {
      publication: almacenada.publication,
      record: almacenada.record
    });
  }

  return crearRespuestaPublicacionRemota(solicitud, true, {
    changed: Boolean(procesada.changed),
    reference: procesada.reference,
    record: procesada.event
  });
}

function procesarPublicacionNuevaRemota(libro, solicitud, requestHash) {
  const procesada = leerSolicitudProcesadaPublicacionRemota(libro, solicitud.requestId);
  if (procesada) return responderReplayPublicacionRemota(libro, solicitud, requestHash, procesada);

  const recuperada = buscarPublicacionPorRequestIdRemota(libro, solicitud.requestId);
  if (recuperada) {
    if (recuperada.requestHash !== requestHash) {
      return crearRespuestaPublicacionRemota(solicitud, false, null, CRIOS_PUBLICATION_ERROR_CODES.WRITE_CONFLICT, 'requestId was already used for a different publication.', false);
    }
    guardarSolicitudProcesadaPublicacionRemota(libro, solicitud, requestHash, {
      resultPublicationId: recuperada.publication.publicationId,
      changed: null,
      reference: null,
      event: null
    });
    return crearRespuestaPublicacionRemota(solicitud, true, {publication: recuperada.publication, record: recuperada.record});
  }

  const canonical = canonicalizarContenidoPublicacionRemota(solicitud.payload.schemaVersion, solicitud.payload.content);
  const hashServidor = sha256PublicacionRemota(canonical);
  if (hashServidor !== solicitud.payload.contentHash) {
    return crearRespuestaPublicacionRemota(
      solicitud,
      false,
      null,
      CRIOS_PUBLICATION_ERROR_CODES.SERVER_HASH_MISMATCH,
      'Server SHA-256 does not match contentHash.',
      false
    );
  }

  const version = siguienteVersionPublicacionRemota(libro, solicitud.payload.campaignId);
  let publicationId = Utilities.getUuid();
  while (leerPublicacionPorIdRemota(libro, publicationId)) publicationId = Utilities.getUuid();
  const createdAt = new Date().toISOString();
  const publication = {
    campaignId: solicitud.payload.campaignId,
    publicationId: publicationId,
    version: version,
    schemaVersion: solicitud.payload.schemaVersion,
    contentHash: hashServidor,
    content: solicitud.payload.content
  };
  const record = {
    publicationId: publicationId,
    campaignId: solicitud.payload.campaignId,
    version: version,
    schemaVersion: solicitud.payload.schemaVersion,
    contentHash: hashServidor,
    sourceDraftRevision: solicitud.payload.draftRevision,
    createdAt: createdAt,
    status: 'PUBLISHED'
  };

  guardarPublicacionRemota(libro, solicitud, requestHash, publication, record);
  guardarSolicitudProcesadaPublicacionRemota(libro, solicitud, requestHash, {
    resultPublicationId: publicationId,
    changed: null,
    reference: null,
    event: null
  });
  return crearRespuestaPublicacionRemota(solicitud, true, {publication: publication, record: record});
}

function procesarActivacionPublicacionRemota(libro, solicitud, requestHash) {
  const procesada = leerSolicitudProcesadaPublicacionRemota(libro, solicitud.requestId);
  if (procesada) return responderReplayPublicacionRemota(libro, solicitud, requestHash, procesada);

  const eventoPrevio = leerEventoActivacionPublicacionRemota(libro, solicitud.requestId);
  if (eventoPrevio) {
    if (eventoPrevio.requestHash !== requestHash || eventoPrevio.event.action !== 'ACTIVATE') {
      return crearRespuestaPublicacionRemota(solicitud, false, null, CRIOS_PUBLICATION_ERROR_CODES.WRITE_CONFLICT, 'requestId was already used for a different activation.', false);
    }
    const previa = leerPublicacionVerificadaRemota(libro, eventoPrevio.event.nextPublicationId);
    if (!previa) {
      return crearRespuestaPublicacionRemota(solicitud, false, null, CRIOS_PUBLICATION_ERROR_CODES.SERVER_ERROR, 'Stored idempotent activation is unavailable.', false);
    }
    const referenciaPrevia = {
      campaignId: previa.publication.campaignId,
      publicationId: previa.publication.publicationId,
      version: previa.publication.version,
      contentHash: previa.publication.contentHash,
      activatedAt: eventoPrevio.event.occurredAt
    };
    guardarSolicitudProcesadaPublicacionRemota(libro, solicitud, requestHash, {
      resultPublicationId: null,
      changed: true,
      reference: referenciaPrevia,
      event: eventoPrevio.event
    });
    return crearRespuestaPublicacionRemota(solicitud, true, {changed: true, reference: referenciaPrevia, record: eventoPrevio.event});
  }

  const almacenada = leerPublicacionVerificadaRemota(libro, solicitud.payload.publicationId);
  if (!almacenada || almacenada.publication.campaignId !== solicitud.payload.campaignId) {
    return crearRespuestaPublicacionRemota(solicitud, false, null, CRIOS_PUBLICATION_ERROR_CODES.PUBLICATION_UNAVAILABLE, 'Publication is unavailable for activation.', false);
  }

  const actual = leerReferenciaActivaPublicacionRemota(libro, solicitud.payload.campaignId);
  if (actual && actual.publicationId === almacenada.publication.publicationId &&
      actual.version === almacenada.publication.version && actual.contentHash === almacenada.publication.contentHash) {
    guardarSolicitudProcesadaPublicacionRemota(libro, solicitud, requestHash, {
      resultPublicationId: null,
      changed: false,
      reference: actual,
      event: null
    });
    return crearRespuestaPublicacionRemota(solicitud, true, {changed: false, reference: actual, record: null});
  }

  const occurredAt = new Date().toISOString();
  const referencia = {
    campaignId: almacenada.publication.campaignId,
    publicationId: almacenada.publication.publicationId,
    version: almacenada.publication.version,
    contentHash: almacenada.publication.contentHash,
    activatedAt: occurredAt
  };
  const evento = {
    activationId: solicitud.requestId,
    action: 'ACTIVATE',
    campaignId: almacenada.publication.campaignId,
    previousPublicationId: actual ? actual.publicationId : null,
    nextPublicationId: almacenada.publication.publicationId,
    occurredAt: occurredAt
  };

  escribirReferenciaActivaPublicacionRemota(libro, referencia);
  guardarEventoActivacionPublicacionRemota(libro, evento, requestHash);
  guardarSolicitudProcesadaPublicacionRemota(libro, solicitud, requestHash, {
    resultPublicationId: null,
    changed: true,
    reference: referencia,
    event: evento
  });
  return crearRespuestaPublicacionRemota(solicitud, true, {changed: true, reference: referencia, record: evento});
}

function procesarDesactivacionPublicacionRemota(libro, solicitud, requestHash) {
  const procesada = leerSolicitudProcesadaPublicacionRemota(libro, solicitud.requestId);
  if (procesada) return responderReplayPublicacionRemota(libro, solicitud, requestHash, procesada);

  const eventoPrevio = leerEventoActivacionPublicacionRemota(libro, solicitud.requestId);
  if (eventoPrevio) {
    if (eventoPrevio.requestHash !== requestHash || eventoPrevio.event.action !== 'DEACTIVATE') {
      return crearRespuestaPublicacionRemota(solicitud, false, null, CRIOS_PUBLICATION_ERROR_CODES.WRITE_CONFLICT, 'requestId was already used for a different deactivation.', false);
    }
    guardarSolicitudProcesadaPublicacionRemota(libro, solicitud, requestHash, {
      resultPublicationId: null,
      changed: true,
      reference: null,
      event: eventoPrevio.event
    });
    return crearRespuestaPublicacionRemota(solicitud, true, {changed: true, reference: null, record: eventoPrevio.event});
  }

  const actual = leerReferenciaActivaPublicacionRemota(libro, solicitud.payload.campaignId);
  if (!actual) {
    guardarSolicitudProcesadaPublicacionRemota(libro, solicitud, requestHash, {
      resultPublicationId: null,
      changed: false,
      reference: null,
      event: null
    });
    return crearRespuestaPublicacionRemota(solicitud, true, {changed: false, reference: null, record: null});
  }

  const occurredAt = new Date().toISOString();
  const evento = {
    activationId: solicitud.requestId,
    action: 'DEACTIVATE',
    campaignId: solicitud.payload.campaignId,
    previousPublicationId: actual.publicationId,
    nextPublicationId: null,
    occurredAt: occurredAt
  };

  eliminarReferenciaActivaPublicacionRemota(libro, solicitud.payload.campaignId);
  guardarEventoActivacionPublicacionRemota(libro, evento, requestHash);
  guardarSolicitudProcesadaPublicacionRemota(libro, solicitud, requestHash, {
    resultPublicationId: null,
    changed: true,
    reference: null,
    event: evento
  });
  return crearRespuestaPublicacionRemota(solicitud, true, {changed: true, reference: null, record: evento});
}

function procesarLecturaPublicacionRemota(libro, solicitud) {
  const almacenada = leerPublicacionVerificadaRemota(libro, solicitud.payload.publicationId);
  if (!almacenada || almacenada.publication.campaignId !== solicitud.payload.campaignId) {
    return crearRespuestaPublicacionRemota(solicitud, false, null, CRIOS_PUBLICATION_ERROR_CODES.PUBLICATION_UNAVAILABLE, 'Publication is unavailable.', false);
  }

  const createdAt = almacenada.record && cadenaNormalizadaPublicacionRemota(almacenada.record.createdAt, 80);
  if (!createdAt) {
    return crearRespuestaPublicacionRemota(solicitud, false, null, CRIOS_PUBLICATION_ERROR_CODES.PUBLICATION_UNAVAILABLE, 'Publication metadata is unavailable.', false);
  }

  // Transitional protocol compatibility: GET remains on protocol 1.0 while direct
  // immutable links stop depending on CRIOS_PUBLICACION_ACTIVAS. The field keeps
  // the legacy activeReference shape but is derived only from the requested
  // immutable publication; activatedAt carries the publication creation time.
  const referenciaCompatibilidad = {
    campaignId: almacenada.publication.campaignId,
    publicationId: almacenada.publication.publicationId,
    version: almacenada.publication.version,
    contentHash: almacenada.publication.contentHash,
    activatedAt: createdAt
  };

  return crearRespuestaPublicacionRemota(solicitud, true, {
    publication: almacenada.publication,
    activeReference: referenciaCompatibilidad
  });
}

function procesarSolicitudPublicacionRemota(solicitud, contexto) {
  const validacion = validarSolicitudPublicacionRemota(solicitud);
  if (!validacion.ok) {
    return crearRespuestaPublicacionRemota(solicitud, false, null, validacion.code, validacion.message, false);
  }

  const escritura = solicitud.operation !== CRIOS_PUBLICATION_OPERATIONS.GET;
  if (escritura && !autorizarEscrituraPublicacionRemota(contexto)) {
    return crearRespuestaPublicacionRemota(solicitud, false, null, CRIOS_PUBLICATION_ERROR_CODES.WRITE_UNAUTHORIZED, 'Teacher write authorization is required.', false);
  }

  const bloqueo = escritura ? LockService.getScriptLock() : null;
  if (bloqueo) bloqueo.waitLock(10000);

  try {
    const libro = SpreadsheetApp.getActiveSpreadsheet();
    if (solicitud.operation === CRIOS_PUBLICATION_OPERATIONS.GET) return procesarLecturaPublicacionRemota(libro, solicitud);

    const requestHash = hashSolicitudPublicacionRemota(solicitud);
    if (solicitud.operation === CRIOS_PUBLICATION_OPERATIONS.PUBLISH) return procesarPublicacionNuevaRemota(libro, solicitud, requestHash);
    if (solicitud.operation === CRIOS_PUBLICATION_OPERATIONS.ACTIVATE) return procesarActivacionPublicacionRemota(libro, solicitud, requestHash);
    return procesarDesactivacionPublicacionRemota(libro, solicitud, requestHash);
  } catch (error) {
    return crearRespuestaPublicacionRemota(
      solicitud,
      false,
      null,
      CRIOS_PUBLICATION_ERROR_CODES.SERVER_ERROR,
      'Remote publication server failure.',
      true
    );
  } finally {
    if (bloqueo) bloqueo.releaseLock();
  }
}

function esEnvelopePostPublicacionRemota(datos) {
  return esObjetoPlanoPublicacionRemota(datos) &&
    clavesExactasPublicacionRemota(datos, ['request', 'writeToken']) &&
    esObjetoPlanoPublicacionRemota(datos.request) &&
    typeof datos.writeToken === 'string';
}

function construirSolicitudGetPublicacionRemota(parametros) {
  const params = parametros || {};
  return {
    protocolVersion: String(params.protocolVersion || ''),
    operation: CRIOS_PUBLICATION_OPERATIONS.GET,
    requestId: String(params.requestId || ''),
    payload: {
      campaignId: String(params.campaignId || ''),
      publicationId: String(params.publicationId || '')
    }
  };
}
