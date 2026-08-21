# Backend autoritativo de sincronización de progreso

## Estado

Este documento registra el backend local del primer progreso cooperativo de `LiveRoom`. La implementación no tiene todavía un identificador definitivo de roadmap; quedó comprometida localmente en `6df495850d2a925c18ceb5556f60b4967df50c7f` y no fue desplegada.

El backend publicado vigente continúa sin conocer `getLiveRoomGameState` ni `completeLiveRoomMission` hasta que exista una autorización de despliegue independiente.

## Alcance implementado

Archivos de producción:

- `backend/google-apps-script/LiveRoomGameStateBackend.gs`: almacenamiento, autorización, lectura y comando aditivo;
- `backend/google-apps-script/LiveRoomBackend.gs`: delegación mínima de las dos operaciones nuevas al backend de estado;
- `js/live-room/live-room-game-state-model.js`: invariantes puras del snapshot;
- `js/live-room/remote/live-room-game-state-contract.js`: contrato wire complementario sobre el protocolo LiveRoom `1.0`.

No se modificaron `Code.gs`, `PublicationBackend.gs`, Firebase, Runtime, Studio, consola de mando ni el cliente remoto LiveRoom vigente. `Code.gs` conserva el mismo sobre `{ liveRoomRequest }`; la delegación ocurre dentro del dispatcher LiveRoom existente.

## Operaciones

### `getLiveRoomGameState`

Payload exacto:

```json
{
  "roomId": "room-id",
  "participantId": "participant-id",
  "capabilityToken": "capability"
}
```

Respuesta exitosa:

```json
{
  "gameState": {
    "schemaVersion": "1.0",
    "roomId": "room-id",
    "campaignId": "campaign-id",
    "publicationId": "publication-id",
    "revision": 0,
    "completedMissionIds": [],
    "updatedAt": "2026-08-18T12:00:00.000Z"
  }
}
```

Host y jugadores registrados pueden leer demostrando la capability de su presencia. La lectura no crea registros de idempotencia ni una fila física para el estado inicial.

### `completeLiveRoomMission`

Payload exacto:

```json
{
  "roomId": "room-id",
  "participantId": "participant-id",
  "capabilityToken": "capability",
  "missionId": "mission-id"
}
```

Respuesta exitosa:

```json
{
  "gameState": {
    "schemaVersion": "1.0",
    "roomId": "room-id",
    "campaignId": "campaign-id",
    "publicationId": "publication-id",
    "revision": 1,
    "completedMissionIds": ["mission-id"],
    "updatedAt": "2026-08-18T12:01:00.000Z"
  },
  "changed": true
}
```

Solo una presencia con rol `player` puede ejecutar el comando. `changed` es `false` cuando la misión ya estaba completada; en ese caso revisión y `updatedAt` permanecen intactos.

No existe `putLiveRoomGameState`, reset, borrado ni `expectedRevision`. También se rechazan campos de respuesta, procedimiento, identidad o evaluación.

## Persistencia física

Hoja separada:

`CRIOS_SALA_ESTADO`

Encabezados exactos:

1. `ROOM_ID`
2. `CAMPAIGN_ID`
3. `PUBLICATION_ID`
4. `SCHEMA_VERSION`
5. `REVISION`
6. `COMPLETED_MISSION_IDS_JSON`
7. `UPDATED_AT`

Existe como máximo una fila por `roomId`. Una ausencia de fila para una sala válida equivale al snapshot inicial de revisión `0`, con `updatedAt = room.createdAt`. La primera misión nueva materializa la fila; las siguientes la actualizan.

IDs con prefijos interpretables como fórmulas se escriben como texto. La lista JSON comienza con `[` y se valida al leer. Encabezados inválidos, JSON corrupto, revisión incoherente o filas duplicadas fallan en cerrado con `SERVER_ERROR`; nunca se reemplazan silenciosamente por un estado vacío.

## Autoridad y validación

Antes de leer o mutar, Apps Script verifica dentro de `ScriptLock`:

1. versión, operación, `requestId` y forma exacta del payload;
2. existencia y vigencia lógica de la sala;
3. presencia registrada y hash de capability coincidente;
4. rol `player` para completar;
5. publicación íntegra exacta de la sala;
6. coincidencia entre `runtimeExecutionManifest.missionOrder` y `missionSpecs`;
7. pertenencia de `missionId` al orden publicado;
8. identidad, esquema, revisión, fecha, unicidad y orden del snapshot persistido.

`campaignId`, `publicationId`, orden y revisión son derivados por el servidor; el escritor no los envía.

El backend autentica al participante y la pertenencia de la misión. No recibe respuestas ni puede certificar la corrección matemática evaluada por el cliente.

## Concurrencia e idempotencia

La operación mutante reutiliza `CRIOS_SALA_SOLICITUDES` y el contrato existente `requestId + requestHash`:

- replay exacto devuelve la respuesta original;
- la vigencia de sala, presencia, capability y rol se revalidan antes de aceptar incluso un replay exacto;
- reutilizar un `requestId` para otra operación, participante o misión produce `REQUEST_CONFLICT`;
- un duplicado nuevo de una misión ya completada se registra como éxito con `changed = false`;
- dos misiones diferentes se unen bajo el mismo `ScriptLock` y ninguna reemplaza el snapshot completo;
- `completedMissionIds` se reordena siempre según la publicación, no según el orden de llegada;
- `updatedAt` usa la hora de servidor sin permitir que retroceda respecto del snapshot anterior;
- `revision` coincide con la cantidad de IDs únicos completados.

La respuesta idempotente almacenada contiene solo el snapshot compartido y `changed`. La capability participa del hash de solicitud, pero no se persiste en texto plano.

## Liveness y expiración

Leer o completar progreso no actualiza:

- `LiveRoom.lastActivityAt`;
- `LiveRoom.expiresAt`;
- `LiveRoomPresence.lastSeenAt`.

Create, join y heartbeat continúan siendo los únicos eventos de liveness. A exactamente `expiresAt`, el estado sigue accesible; un instante después, la sala se marca expirada y toda lectura, mutación o replay de completado se rechaza con `ROOM_EXPIRED`.

## Compatibilidad preservada

- Las cinco operaciones lifecycle/presencia existentes conservan su contrato exacto.
- El contrato JavaScript de presencia no fue ampliado ni reemplazado.
- El sobre de publicación y el POST legacy de resultados continúan separados.
- El backend nuevo funciona con salas anteriores porque la ausencia de fila deriva revisión `0`.
- No se crea estado para una lectura, un host escritor, una capability inválida, una misión ajena o una publicación estructuralmente incompatible.

## Evidencia local

Prueba focal nueva:

- `tests/live-room-game-state-backend-node.test.js`: 87/87 comprobaciones aprobadas.

La prueba cubre autoridad de servidor, forma wire cruzada con el contrato del navegador, lectura host/jugador, capability, rol, misión publicada, idempotencia, revalidación de capability y expiración también ante replay, conflictos globales de `requestId`, unión, orden canónico, timestamp monotónico, expiración exacta, no-liveness, corrupción, filas duplicadas, publicación ausente/incompatible, seguridad ante fórmulas y ausencia de secretos.

Regresión focal ampliada:

- 14 suites;
- 1041/1041 comprobaciones aprobadas;
- 0 suites fallidas.

La evidencia es local y no sustituye un smoke contra Apps Script real.

## Próximo límite

El cliente remoto, su coordinación Runtime, la señal de invalidación, el reconciliador y la lectura agregada de consola ya fueron implementados y validados localmente. Sus fronteras se registran en [`GAME_STATE_PROGRESS_SYNC_CLIENT.md`](GAME_STATE_PROGRESS_SYNC_CLIENT.md), [`GAME_STATE_PROGRESS_SYNC_RUNTIME.md`](GAME_STATE_PROGRESS_SYNC_RUNTIME.md) y [`GAME_STATE_PROGRESS_SYNC_RECONCILIATION.md`](GAME_STATE_PROGRESS_SYNC_RECONCILIATION.md). Studio carga solo el modelo puro; la consola carga únicamente la composición de lectura y no emite completados.

El siguiente límite verificable es el despliegue coherente y el smoke real multi-navegador, con observación de carga antes de considerar definitiva la cadencia. Firebase continúa sin ser autoridad.

Un despliegue posterior deberá incluir, como conjunto coherente, `Code.gs`, `PublicationBackend.gs`, `LiveRoomBackend.gs` y `LiveRoomGameStateBackend.gs`, seguido de smoke remoto. Nada de eso está autorizado por este documento.
