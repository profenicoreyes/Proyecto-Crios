# Cliente remoto de sincronización de progreso

## Estado

Este documento registra el cliente remoto local del primer progreso cooperativo de `LiveRoom`. La implementación no tiene todavía un identificador definitivo de roadmap; quedó comprometida localmente en `6df495850d2a925c18ceb5556f60b4967df50c7f` y no fue desplegada. Runtime carga el cliente para lectura y completado; la consola de mando lo carga con un contexto host para lectura exclusiva; Studio permanece fuera y usa solamente el modelo puro.

El endpoint publicado vigente continúa sin estas operaciones hasta una autorización de despliegue independiente. La existencia del cliente local no convierte el progreso compartido en una capacidad disponible para usuarios.

## Alcance implementado

Archivo de producción nuevo:

- `js/live-room/remote/live-room-game-state-client.js`: transporte autenticado de lectura/completado, validación semántica y memoria monotónica del último snapshot aceptado.

Dependencias obligatorias:

- `js/live-room/live-room-game-state-model.js`;
- `js/live-room/remote/live-room-game-state-contract.js`;
- endpoint Apps Script;
- implementación de `fetch`;
- `credentialStore` con una operación de lectura `get(roomId, participantId)`.

Durante el tramo aislado aquí descripto no se modificó el cliente lifecycle `js/live-room/remote/live-room-client.js`, ni sus claves de storage, el bootstrap, HTML, Runtime, Game Flow, Studio, consola, Firebase o Apps Script. La composición posterior amplía lifecycle y Runtime sin modificar la API pública de este cliente; se documenta en [`GAME_STATE_PROGRESS_SYNC_RUNTIME.md`](GAME_STATE_PROGRESS_SYNC_RUNTIME.md).

## Composición por contexto

Cada instancia queda vinculada desde su creación a una forma exacta:

```js
{
  roomId,
  campaignId,
  publicationId,
  participantId,
  missionOrder
}
```

No admite campos adicionales. En particular, el contexto no recibe `capabilityToken`, respuestas, vidas, intentos, resultados ni estado personal.

`missionOrder` se valida con el modelo puro y se copia de forma inmutable. La identidad completa impide reutilizar una caché entre salas, publicaciones o participantes.

La composición vigente crea un único `credentialStore` por superficie autorizada y entrega la misma instancia al cliente lifecycle y al cliente de estado mediante un puerto de fábrica estrecho. El cliente de estado solo invoca `credentialStore.get`; no escribe, migra, elimina, registra ni devuelve la capability. No se duplican el formato ni la clave de persistencia lifecycle vigentes.

Runtime usa las dos operaciones remotas. La consola de mando crea el mismo tipo de cliente hermano, pero su composición llama exclusivamente `getLiveRoomGameState()` y no carga outbox ni coordinador.

## API pública

La instancia expone únicamente:

- `available()`;
- `getLiveRoomGameState(callOptions)`;
- `completeLiveRoomMission(missionId, callOptions)`.

No expone lectura de capability, reemplazo genérico de snapshot, `expectedRevision`, reset ni borrado remoto.

`callOptions.requestId` es opcional. Si está presente, se conserva exactamente como identidad lógica después de la normalización ya exigida por el contrato. La outbox Runtime usa esta propiedad para repetir el mismo comando; el cliente continúa sin implementar por sí mismo persistencia ni reintentos automáticos.

## Transporte

Ambas operaciones usan el sobre LiveRoom existente:

```json
{
  "liveRoomRequest": {
    "protocolVersion": "1.0",
    "operation": "getLiveRoomGameState",
    "requestId": "request-id",
    "payload": {}
  }
}
```

La solicitud se envía mediante `POST`, `credentials: "omit"`, `cache: "no-store"` y `Content-Type: text/plain;charset=utf-8`, igual que el cliente lifecycle vigente. El payload real se construye exclusivamente con el contrato estricto e incorpora internamente la capability leída para la sala y el participante configurados.

No se incluyen `campaignId`, `publicationId`, revisión ni snapshot en el comando; esas propiedades continúan derivadas por el servidor.

## Validación y reconciliación

Una respuesta exitosa atraviesa cuatro controles antes de llegar al consumidor:

1. forma wire, operación y `requestId` mediante el contrato remoto;
2. esquema, revisión, pertenencia y orden de misiones mediante el modelo puro y `missionOrder` publicado;
3. coincidencia exacta de `roomId + campaignId + publicationId` con el contexto configurado;
4. reconciliación contra el último snapshot aceptado en memoria.

La memoria local aplica estas reglas:

- el primer snapshot válido inicializa la memoria;
- una revisión superior solo se acepta si conserva todos los completados previos y no retrocede `updatedAt`;
- una revisión inferior puede provenir de un replay idempotente antiguo y no reemplaza el estado ya observado;
- la misma revisión exige un snapshot idéntico;
- una divergencia de igual revisión o un snapshot superior no monotónico falla cerrado con `LIVE_ROOM_GAME_STATE_RECONCILIATION_REQUIRED` y no altera la memoria.

El error de reconciliación es reintentable mediante una nueva lectura autoritativa. El cliente no inicia esa lectura por sí solo para evitar recursión, ráfagas o decisiones de política antes del coordinador Runtime.

## Resultados públicos

Lectura exitosa:

```js
{
  success: true,
  requestId,
  data: {
    gameState,
    stateAdvanced
  },
  error: null
}
```

Completado exitoso:

```js
{
  success: true,
  requestId,
  data: {
    gameState,
    stateAdvanced,
    changed
  },
  error: null
}
```

`gameState` siempre es el snapshot efectivo monotónico, no necesariamente el snapshot antiguo incluido en un replay. `stateAdvanced` describe si esta respuesta avanzó la memoria local. `changed` conserva la semántica de la respuesta autoritativa para ese `requestId`; por eso un replay original puede informar `changed = true` mientras `stateAdvanced = false`.

Los resultados, errores y snapshots son copias profundamente inmutables y no contienen la capability.

## Fallos cerrados

No se ejecuta red cuando falta una capability, el contexto es inválido, el `requestId` no puede crearse, la misión no supera el contrato o faltan dependencias.

El cliente normaliza sin cuerpo remoto sensible:

- errores HTTP y su código de estado;
- timeout o fallo de transporte;
- JSON inválido;
- rechazo del contrato;
- error autoritativo Apps Script;
- incompatibilidad semántica con la publicación;
- cruce de contexto;
- divergencia de revisión.

Las excepciones de `fetch` y del almacén de credenciales no se reflejan textualmente en el resultado, para evitar que una implementación defectuosa incluya secretos en sus mensajes.

## Evidencia local

Prueba focal nueva:

- `tests/live-room-game-state-remote-client-node.test.js`: 173/173 comprobaciones aprobadas.

La prueba cubre API estrecha, configuración inmutable, lookup exacto de capability, ausencia de secretos, sobre y opciones de transporte, lectura, completado, `requestId` explícito, replay antiguo, revisión inferior, igualdad, divergencia, pérdida de completados, recuperación posterior, cruce de campaña/publicación, orden/ID de misión inválidos, errores locales, HTTP, transporte, JSON, errores del backend y respuestas que no corresponden a la solicitud.

Regresión ampliada relacionada:

- 15 suites Node;
- 1232/1232 comprobaciones aprobadas;
- modelo, contratos, cliente lifecycle, bootstrap, backend, Runtime jugador, Studio host, transporte y proveedor realtime, nuevo estado cooperativo y fronteras de publicación sin regresiones.

Esta evidencia corresponde al tramo aislado del cliente. La composición posterior en Runtime, la invalidación y la lectura host se documentan y prueban por separado en [`GAME_STATE_PROGRESS_SYNC_RUNTIME.md`](GAME_STATE_PROGRESS_SYNC_RUNTIME.md) y [`GAME_STATE_PROGRESS_SYNC_RECONCILIATION.md`](GAME_STATE_PROGRESS_SYNC_RECONCILIATION.md); todavía no demuestran comportamiento contra Apps Script o Firebase desplegados.

## Próximo límite

El coordinador post-commit, la outbox mínima, la entrega compartida de `credentialStore`, la proyección separada, la señal de invalidación y la lectura host ya fueron implementados y validados localmente; sus fronteras vigentes se registran en [`GAME_STATE_PROGRESS_SYNC_RUNTIME.md`](GAME_STATE_PROGRESS_SYNC_RUNTIME.md) y [`GAME_STATE_PROGRESS_SYNC_RECONCILIATION.md`](GAME_STATE_PROGRESS_SYNC_RECONCILIATION.md).

La prueba integral multi-navegador, la medición contra servicios reales y cualquier despliegue permanecen pendientes y requieren evidencia y autorización propias.
