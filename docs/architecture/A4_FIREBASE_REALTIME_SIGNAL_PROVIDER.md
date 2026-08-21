# A4-004B/C: proveedor de señales Firebase Realtime Database

## Alcance

Firebase Realtime Database es un canal opcional de invalidación para LiveRoom. Apps Script LiveRoom continúa siendo la única fuente autoritativa. Una señal recibida activa el debounce de 300 ms de A4-004A; después, la consola consulta `getLiveRoomRoster` con la identidad autorizada del host y renderiza esa respuesta. El jugador publica una señal únicamente después de un JOIN o HEARTBEAT que Apps Script confirmó correctamente; la señal nunca sustituye esa confirmación.

El polling de roster cada 15000 ms permanece activo aunque Firebase funcione. Un fallo al inicializar el SDK, autenticar, suscribir, leer o escribir se absorbe dentro del proveedor y no interrumpe la sala, heartbeat, recuperación del host ni Compartir.

## Selección y configuración

A4-004B introdujo la selección configurable con `provider = 'noop'` como estado previo. A4-004C cerró la configuración live y el valor versionado actual es `CRIOS_CONFIG.realtime.provider = 'firebase'`. El proveedor sólo se inicia cuando también existen valores no vacíos para `apiKey`, `authDomain`, `databaseURL`, `projectId` y `appId`; `js/config.js` es la fuente versionada de esos identificadores públicos.

## Contrato de datos

El proveedor usa Firebase Anonymous Authentication y la ruta conceptual:

```text
/liveRoomSignals/{roomId}/{firebaseUid}
```

Cada UID sólo puede escribir su propio nodo. El payload persistido contiene exactamente:

```json
{
  "type": "presence-change",
  "eventId": "identificador-del-evento",
  "emittedAt": "2026-08-17T12:00:00.000Z"
}
```

No se envían ni almacenan roster, capability CRIOS, participantId del host, progreso, respuestas, resultados o sessionData. `roomId` y `firebaseUid` forman la ruta y tampoco son parte del payload.

Este ejemplo documenta el cierre histórico A4-004B/C. El candidato posterior de sincronización de progreso conserva el mismo payload mínimo y admite además `game-state-change`; sus productores y reconciliación se definen en [`GAME_STATE_PROGRESS_SYNC_RECONCILIATION.md`](GAME_STATE_PROGRESS_SYNC_RECONCILIATION.md).

## Reglas

Las reglas candidatas de `firebase/realtime-database.rules.json` están versionadas para el proyecto `crios-e1b83`. Niegan acceso por defecto, exigen autenticación para leer señales de una sala, limitan escritura a `auth.uid === $uid`, exigen los tres campos mínimos y rechazan cualquier campo adicional mediante `$other`. El smoke live del cierre confirmó tanto el camino permitido como las denegaciones previstas.

La evidencia conservada del smoke A4-004C no incluye un snapshot textual remoto que permita sostener identidad byte a byte. El snapshot aportado el 21 de agosto de 2026 conserva el contrato funcional de `presence-change`, pero omite las denegaciones explícitas de raíz presentes en la fuente versionada. La diferencia y su clasificación están registradas en [`FIREBASE_RTDB_RULES_PREFLIGHT_2026-08-21.md`](../evidence/FIREBASE_RTDB_RULES_PREFLIGHT_2026-08-21.md).

## Productores de señal del cierre A4-004B/C

El Runtime del jugador emite `presence-change` después de un `joinLiveRoom` válido, al restaurar mediante heartbeat y después de cada heartbeat exitoso. Una falla del canal realtime no cambia el estado `ACTIVE` ni la cadencia del heartbeat de Apps Script. El cierre abrupto de una pestaña todavía no se interpreta como desconexión autoritativa inmediata: esa semántica queda fuera de A4-004B y no se simula con datos no autoritativos.


## A4-004C: configuración live

A4-004C habilita el proveedor `firebase` contra el proyecto Web `crios-e1b83` y la instancia RTDB
`https://crios-e1b83-default-rtdb.firebaseio.com`. La configuración Web versionada contiene
identificadores públicos de Firebase; no contiene una clave privada ni una capability de CRIOS.

CRIOS carga exclusivamente los SDK necesarios desde la CDN oficial de Firebase, fijados en
`12.16.0`: `firebase-app-compat.js`, `firebase-auth-compat.js` y
`firebase-database-compat.js`. Se usa temporalmente la capa compat porque el proveedor A4-004B
ya tiene un contrato `window.firebase` estable y CRIOS no incorpora bundler en este tramo.
La migración futura al SDK modular no cambia la frontera signal-only.

Para el smoke live se desplegaron reglas con el contrato versionado de presencia y se habilitó
Firebase Authentication anónimo.

El smoke A4-004C verificó contra los servicios reales:
- creación de identidad Firebase anónima;
- denegación de lectura sin autenticación;
- escritura válida bajo `/liveRoomSignals/{roomId}/{auth.uid}`;
- lectura autenticada de la sala;
- rechazo de escritura bajo otro UID;
- rechazo de payload con campos adicionales;
- rechazo de tipos de señal inválidos;
- limpieza del nodo de smoke.

El smoke nunca imprime ID tokens ni refresh tokens. Firebase continúa siendo sólo un canal de
invalidación; Apps Script LiveRoom conserva la autoridad del roster y de la expiración.

El checkpoint de cierre es `719b7fb05c6f7cb277543e4e50836918b8357b4f`. La validación acumulada aprobó 2037/2037 comprobaciones Node, 399/399 browserless y un smoke real host/jugador con las tres sincronizaciones observadas por debajo de 8 segundos. El cierre abrupto de una pestaña continúa fuera de esta semántica signal-only y la sincronización de progreso o resultados requiere una decisión de arquitectura separada.
