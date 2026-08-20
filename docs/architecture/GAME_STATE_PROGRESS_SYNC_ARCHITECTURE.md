# Arquitectura de sincronización de estado y progreso de juego

## Estado de esta decisión

Esta decisión de arquitectura fue aceptada para abrir implementación después de A4-004. Los tramos locales enumerados más abajo ya cuentan con implementación y evidencia, pero la decisión todavía no constituye por sí misma un tramo, no tiene un identificador definitivo y no afirma que la capacidad esté desplegada o disponible para usuarios.

La validación restante debe avanzar por los tramos verificables definidos al final. Commit, bundle y despliegue conservan sus autorizaciones independientes.

## Objetivo

Sincronizar progreso cooperativo entre los dispositivos que participan en una misma `LiveRoom`, sin convertir el estado local completo de cada estudiante en un documento remoto ni alterar la publicación inmutable.

La semántica propuesta es:

> una misión completada por un jugador autorizado pasa a estar completada para el equipo dentro de esa sala.

El progreso compartido es efímero, pertenece a la sala exacta y solo puede crecer mientras la sala está activa. No representa la continuidad personal de un estudiante entre dispositivos.

## Evidencia vigente y restricciones heredadas

La arquitectura parte de estas condiciones ya verificadas:

- una `LiveRoom` referencia exactamente una publicación inmutable mediante `campaignId + publicationId`;
- Apps Script es la autoridad remota de sala, presencia, capability y expiración;
- Firebase Realtime Database transporta señales de invalidación, no snapshots autoritativos;
- `StudentSession`, `sessionData`, `sessionStats`, `progress` y `progresosCampanas` no son representaciones equivalentes ni tienen hoy un único propietario remoto;
- `participantId` identifica una presencia de navegador, no una identidad pedagógica portable;
- Game Flow ejecuta una transacción local sincrónica y su rollback no puede incluir una operación de red;
- únicamente create, join y heartbeat constituyen actividad de presencia que extiende la vida de la sala.

Estas restricciones descartan sincronizar directamente un blob de `StudentSession` o de `sessionData`.

## Estado compartido

El único dato pedagógico compartido en esta capacidad es el conjunto de IDs de misiones completadas para la publicación exacta de la sala.

Snapshot lógico canónico:

```json
{
  "schemaVersion": "1.0",
  "roomId": "room-id",
  "campaignId": "campaign-id",
  "publicationId": "publication-id",
  "revision": 0,
  "completedMissionIds": [],
  "updatedAt": "2026-08-18T12:00:00.000Z"
}
```

Reglas:

- `revision` comienza en `0` y nunca disminuye;
- `completedMissionIds` comienza vacío, no contiene duplicados y respeta el orden de `runtimeExecutionManifest.missionOrder` de la publicación;
- agregar por primera vez una misión válida incrementa `revision` exactamente una vez;
- volver a completar una misión ya incluida es un éxito idempotente y no incrementa `revision`;
- no existe operación para borrar una misión completada, reemplazar el snapshot completo ni reducir la revisión;
- `updatedAt` usa reloj de servidor; en el estado inicial coincide lógicamente con la creación de la sala;
- la identidad `roomId + campaignId + publicationId` debe coincidir con la `LiveRoom` y no puede ser elegida por el escritor.

El nombre del agregado es `LiveRoomGameState`. Es distinto de `StudentSession` y materializa el límite conceptual `CRIOS_LIVE_STATE` anticipado por la arquitectura de LiveRoom. La persistencia física debe usar una hoja separada de salas, presencias, solicitudes y publicaciones; el nombre y los encabezados exactos se fijarán en el tramo de backend, no en esta decisión sin numerar.

## Estado expresamente local

No se sincronizan ni se infieren desde el estado compartido:

- nombre real, personaje, grupo u otra identidad pedagógica;
- `participantId` del autor de cada completado;
- respuestas, procedimientos, valores esperados o datos generados de una variante;
- intentos, pistas, tiempos, estadísticas o telemetría;
- vidas, misión actual, pantalla actual o navegación;
- `sessionData`, `sessionStats` o el objeto `StudentSession`;
- resultado final, envío de resultados o `idSesion` legacy;
- finalización personal de la campaña;
- capabilities, hashes de capabilities o credenciales Firebase.

No se conserva atribución remota de qué jugador completó cada misión. La consola puede observar el progreso del equipo, pero no convertirlo en un reporte individual.

## Efecto funcional en Runtime

Runtime mantiene dos fuentes separadas:

- progreso personal local: el que ya persiste para la sesión del jugador;
- progreso compartido de sala: el último `LiveRoomGameState` autoritativo conocido.

Mientras el Runtime pertenece a una sala activa, el progreso efectivo para el mapa y el desbloqueo del protocolo final es la unión de ambos conjuntos. Esta proyección no sobrescribe ni persiste el progreso compartido dentro de `progress`, `progresosCampanas` o `StudentSession`.

Consecuencias visibles:

- una misión completada por otro jugador aparece como completada por el equipo;
- todas las misiones compartidas habilitan el protocolo final para los participantes de la sala;
- cada jugador conserva su variante y realiza localmente su propia evaluación final;
- una actualización remota no interrumpe una misión abierta, no cambia de pantalla y no consume ni restaura vidas;
- un jugador puede seguir resolviendo una misión que el equipo ya completó; su posterior reporte es un no-op idempotente;
- fuera de una sala, y después de su expiración, el recorrido utiliza únicamente el progreso personal previo.

No se importará automáticamente a la sala todo el progreso local preexistente. Solo se reportan completados producidos después de que ese Runtime haya establecido y validado su contexto de sala, más los eventos pendientes del mismo contexto. Esta regla evita que una sesión individual anterior avance silenciosamente una sala nueva.

## Autoridad, lectores y escritores

Apps Script es la única autoridad de `LiveRoomGameState`.

- host y jugadores registrados pueden leer el snapshot demostrando su capability de participante;
- solo una presencia con rol `player` puede reportar una misión completada;
- el host es lector en esta capacidad: no completa, borra, corrige ni fuerza progreso;
- conocer el `roomId` no autoriza una lectura ni una mutación;
- una sala expirada rechaza lectura y escritura de estado y no puede reactivarse mediante ellas.

El servidor valida antes de mutar:

1. forma y versión estrictas de la solicitud;
2. sala existente y activa;
3. participante registrado, capability válida y rol permitido;
4. correspondencia exacta con la publicación inmutable de la sala;
5. pertenencia de `missionId` al `missionOrder` íntegro de esa publicación;
6. integridad estructural del estado persistido.

La autorización prueba que una presencia válida reportó el evento. No prueba que la respuesta matemática fuera correcta, porque la evaluación vigente ocurre en el cliente y las respuestas quedan fuera del contrato. Una garantía antitrampa o una evaluación pedagógica autoritativa requerirían otra decisión de arquitectura.

## Operaciones remotas mínimas

La implementación debe agregar solamente dos comandos específicos al sobre LiveRoom existente:

La frontera JavaScript se mantiene como un contrato complementario de progreso sobre el mismo protocolo `1.0`. No se amplía silenciosamente el conjunto exacto de operaciones del contrato estable de presencia; el cliente de estado implementado depende explícitamente del nuevo contrato.

El almacenamiento y procesamiento autoritativo local se documentan en [`GAME_STATE_PROGRESS_SYNC_BACKEND.md`](GAME_STATE_PROGRESS_SYNC_BACKEND.md). Ese backend todavía no fue desplegado.

### `getLiveRoomGameState`

Payload:

- `roomId`;
- `participantId`;
- `capabilityToken`.

Es una lectura autenticada. No actualiza `lastSeenAt`, `lastActivityAt` ni `expiresAt`, no crea un registro de idempotencia y no puede reactivar una sala.

### `completeLiveRoomMission`

Payload:

- `roomId`;
- `participantId`;
- `capabilityToken`;
- `missionId`.

Es un comando aditivo, autenticado e idempotente bajo el `requestId` del protocolo LiveRoom. Devuelve el snapshot resultante y si la colección cambió.

No recibe un snapshot completo ni `expectedRevision`. La exclusión de `expectedRevision` es deliberada: la operación de unión es conmutativa y Apps Script ya serializa mutaciones mediante `ScriptLock`. Rechazar una revisión antigua introduciría reintentos y conflictos sin proteger ningún dato reemplazable.

## Concurrencia e idempotencia

Dos completados concurrentes de misiones diferentes deben conservar ambos IDs. Dos completados concurrentes de la misma misión deben producir una sola transición de revisión.

El backend aplica dentro del mismo bloqueo:

1. autorización y expiración;
2. replay/conflicto de `requestId` solo dentro de un contexto todavía vigente;
3. lectura y validación del snapshot actual;
4. unión con `missionId`;
5. escritura, si hubo cambio;
6. persistencia de la respuesta idempotente.

Un replay exacto puede devolver la respuesta original aunque el estado haya avanzado después, pero nunca evita una expiración o una autorización fallida. Por eso los consumidores:

- nunca aplican un snapshot con revisión menor a la ya observada;
- aceptan un snapshot con revisión mayor;
- exigen contenido idéntico cuando dos snapshots tienen la misma revisión;
- vuelven a leer la autoridad ante una inconsistencia de igual revisión.

No se usa last-write-wins ni un `putState` genérico.

## Integración con Game Flow

La red queda fuera de la transacción sincrónica existente.

Orden obligatorio al completar localmente una misión:

1. Evaluation produce un resultado correcto;
2. Game Flow completa PlayerState, progreso, Runtime y Navigation;
3. el estado personal se persiste con el mecanismo vigente;
4. un coordinador remoto registra el evento mínimo en una outbox del mismo contexto de sala;
5. el coordinador intenta `completeLiveRoomMission` de forma asíncrona.

Una falla remota no revierte una respuesta correcta ni el progreso personal. La outbox conserva solo `requestId`, identidad de sala/publicación/participante, `missionId` y metadatos técnicos mínimos; nunca respuestas, procedimientos ni estadísticas. Puede reintentarse tras recarga únicamente si continúa disponible la misma capability y el mismo contexto de sala.

Eventos pendientes de una sala expirada o de otra publicación no se migran a una sala nueva.

## Realtime y reconciliación

Firebase continúa siendo signal-only. La implementación podrá ampliar el tipo permitido con `game-state-change`, conservando el payload mínimo:

```json
{
  "type": "game-state-change",
  "eventId": "event-id",
  "emittedAt": "2026-08-18T12:00:00.000Z"
}
```

La señal no contiene revisión, IDs de misión, progreso, participante CRIOS ni datos de sesión. Se emite después de una respuesta autoritativa exitosa que cambió el conjunto. Al recibirla, host y jugadores aplican debounce y vuelven a consultar `getLiveRoomGameState` con su capability.

Las señales pueden perderse, duplicarse, retrasarse o ser emitidas por una identidad Firebase sin capability CRIOS; nunca mutan el progreso ni se aceptan como evidencia. La implementación local reconcilia al entrar, al recuperar visibilidad, después de completar localmente y mediante un fallback periódico con jitter y backoff.

La política provisional aplica 300 ms de debounce, hasta 29.700 ms de jitter de señal, un intervalo mínimo de 30 s por consumidor, fallback de 90 s ± 30 s y backoff de 30–300 s. Conserva un solo timer y una sola lectura en vuelo, coalesce señales y pausa en segundo plano. Una simulación determinista de 64 presencias distribuye la invalidación en seis intervalos de cinco segundos con un máximo de 12 lecturas programadas por intervalo. Esto valida la política local, no la capacidad real del Apps Script desplegado.

El detalle de composición, degradación y límites de esta política se registra en [`GAME_STATE_PROGRESS_SYNC_RECONCILIATION.md`](GAME_STATE_PROGRESS_SYNC_RECONCILIATION.md).

La ampliación de reglas Firebase y cualquier despliegue pertenecen a un tramo posterior y requieren autorización explícita.

## Ciclo de vida y persistencia

Leer o escribir progreso no extiende la actividad de la sala. Create, join y heartbeat continúan siendo los únicos eventos que actualizan su liveness.

La expiración lógica de la sala vuelve inaccesible su estado de juego inmediatamente. La eliminación física puede ser eventual y debe incluir el estado compartido sin tocar la publicación ni el progreso local.

Una ausencia física de fila de estado equivale solamente al snapshot inicial de revisión `0` para una sala válida. No equivale a una sala inexistente y permite compatibilidad con salas creadas antes de incorporar la nueva persistencia.

## Riesgos y controles

### Reporte falso de completado

Un cliente modificado puede afirmar que completó una misión. Se controla pertenencia, capability y validez de `missionId`, pero no corrección académica. La interfaz y la documentación no deben presentar este agregado como registro de evaluación individual.

### Doble fuente de progreso

El progreso personal y el compartido tienen propósitos distintos. Se evita la divergencia destructiva mediante una proyección de unión para UI/desbloqueo, sin copiar el snapshot remoto a las estructuras locales existentes.

### Ráfaga de lecturas

Una señal puede despertar a todos los participantes. La política local limita, distribuye y coalesce la ráfaga sintética de 64 presencias; la cadencia permanece provisional hasta medir carga real antes de desplegar.

### Replay con snapshot antiguo

El cliente aplica revisiones de forma monótona y reconcilia con una lectura autoritativa.

### Cruce de salas o publicaciones

Toda memoria local, outbox, caché y solicitud se vincula a `roomId + campaignId + publicationId + participantId`. Un cambio en cualquiera de esas identidades invalida el contexto anterior.

## Alternativas rechazadas

- sincronizar `StudentSession`, `sessionData` o `progress` completos: mezcla propietarios y expone datos fuera de alcance;
- usar Firebase como base autoritativa: contradice la frontera signal-only y la autorización CRIOS;
- aceptar `roomId` como permiso: permite lecturas y escrituras no autorizadas;
- usar last-write-wins o reemplazo de snapshot: permite pérdida de completados concurrentes;
- exigir compare-and-swap para una unión monotónica: agrega conflictos artificiales;
- subir automáticamente progreso local anterior al join: contamina una sala con otra sesión;
- ejecutar la red dentro de Game Flow: rompe la atomicidad y el rollback local;
- identificar al estudiante mediante `participantId`: confunde una presencia técnica con identidad pedagógica;
- validar respuestas en este agregado: ampliaría el alcance a Evaluation, contenido generado y datos pedagógicos.

## Tramos verificables de implementación

Estos tramos describen orden y evidencia, no asignan identificadores de roadmap:

1. **implementado y validado localmente:** modelo puro y contrato estricto de `LiveRoomGameState`, con pruebas de forma, orden, revisión y unión monotónica;
2. **implementado y validado localmente:** backend local Apps Script, almacenamiento separado, autorización, expiración, idempotencia y concurrencia, sin despliegue;
3. **implementado y validado localmente:** cliente remoto de navegador de contexto único, capability inyectada, replay explícito y protección contra regresión de revisión; Runtime lo usa para lectura y completado, mientras la consola lo usa solo para lectura; su contrato operativo se registra en [`GAME_STATE_PROGRESS_SYNC_CLIENT.md`](GAME_STATE_PROGRESS_SYNC_CLIENT.md);
4. **implementado y validado localmente:** coordinador Runtime post-commit, outbox acotada y proyección separada de progreso personal/compartido; su frontera se registra en [`GAME_STATE_PROGRESS_SYNC_RUNTIME.md`](GAME_STATE_PROGRESS_SYNC_RUNTIME.md);
5. **implementado y validado localmente:** lectura agregada de solo lectura en consola, señal `game-state-change` y reconciliación con control de carga sintético; su frontera se registra en [`GAME_STATE_PROGRESS_SYNC_RECONCILIATION.md`](GAME_STATE_PROGRESS_SYNC_RECONCILIATION.md);
6. **pendiente:** validación integral con dos o más navegadores o dispositivos reales, concurrencia, recarga, red degradada, señales falsas, expiración, modo sin room, ausencia de fuga de datos y smoke contra servicios desplegados.

Después de cada tramo deben permanecer intactos el modo sin `roomId`, el camino legacy, la publicación inmutable y los contratos de resultados existentes.

## Criterio para considerar cerrada la decisión

Antes de asignar un identificador de implementación debe aceptarse explícitamente que:

- el progreso es cooperativo por sala y no continuidad personal entre dispositivos;
- completar es una unión monotónica sin borrado;
- jugadores escriben completados y host/jugadores leen;
- Apps Script es autoridad y Firebase solo invalida caché;
- respuestas, vidas, intentos, identidad, resultados y evaluación permanecen locales;
- el servidor no certifica corrección matemática en este alcance.
