# A4-004B: proveedor de señales Firebase Realtime Database

## Alcance

Firebase Realtime Database es un canal opcional de invalidación para LiveRoom. Apps Script LiveRoom continúa siendo la única fuente autoritativa. Una señal recibida activa el debounce de 300 ms de A4-004A; después, la consola consulta `getLiveRoomRoster` con la identidad autorizada del host y renderiza esa respuesta. El jugador publica una señal únicamente después de un JOIN o HEARTBEAT que Apps Script confirmó correctamente; la señal nunca sustituye esa confirmación.

El polling de roster cada 15000 ms permanece activo aunque Firebase funcione. Un fallo al inicializar el SDK, autenticar, suscribir, leer o escribir se absorbe dentro del proveedor y no interrumpe la sala, heartbeat, recuperación del host ni Compartir.

## Selección y configuración

El valor versionado es `CRIOS_CONFIG.realtime.provider = 'noop'`. Firebase sólo se selecciona cuando `provider` vale `firebase` y existen valores no vacíos para `apiKey`, `authDomain`, `databaseURL`, `projectId` y `appId`. A4-004B no incluye valores reales, carga del SDK, proyecto Firebase, despliegue de reglas ni smoke live. El Runtime carga la frontera y el adapter local, pero mientras `provider` sea `noop` no se inicia Firebase.

La configuración prevista para A4-004C tiene esta forma:

```js
realtime: Object.freeze({
  provider: 'firebase',
  firebase: Object.freeze({
    apiKey: 'CONFIGURAR_EN_A4_004C',
    authDomain: 'CONFIGURAR_EN_A4_004C',
    databaseURL: 'CONFIGURAR_EN_A4_004C',
    projectId: 'CONFIGURAR_EN_A4_004C',
    appId: 'CONFIGURAR_EN_A4_004C'
  })
})
```

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

## Reglas

Las reglas de `firebase/realtime-database.rules.json` están versionadas pero no desplegadas. Niegan acceso por defecto, exigen autenticación para leer señales de una sala, limitan escritura a `auth.uid === $uid`, exigen los tres campos mínimos y rechazan cualquier campo adicional mediante `$other`.

## Productores de señal

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

Antes del smoke live deben estar publicados en Firebase los contenidos exactos de
`firebase/realtime-database.rules.json` y habilitado Firebase Authentication anónimo.

El smoke A4-004C verifica contra los servicios reales:
- creación de identidad Firebase anónima;
- denegación de lectura sin autenticación;
- escritura válida bajo `/liveRoomSignals/{roomId}/{auth.uid}`;
- lectura autenticada de la sala;
- rechazo de escritura bajo otro UID;
- rechazo de payload con campos adicionales;
- limpieza del nodo de smoke.

El smoke nunca imprime ID tokens ni refresh tokens. Firebase continúa siendo sólo un canal de
invalidación; Apps Script LiveRoom conserva la autoridad del roster y de la expiración.
