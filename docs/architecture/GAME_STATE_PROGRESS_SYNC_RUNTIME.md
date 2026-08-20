# Coordinación Runtime del progreso compartido

## Estado

Este documento registra la composición local del primer progreso cooperativo de `LiveRoom` dentro de Runtime. La implementación no tiene todavía un identificador definitivo de roadmap, no fue staged ni commiteada, no fue desplegada y no habilita una capacidad disponible para usuarios.

Runtime carga modelo, outbox, reconciliador, cliente y coordinador. Studio carga solamente el modelo puro para validar el orden público de misiones; la consola de mando carga modelo, reconciliador y cliente, pero no outbox ni coordinador y utiliza exclusivamente la lectura. El endpoint publicado vigente todavía no contiene las operaciones autoritativas requeridas.

## Composición sin exposición de capability

El cliente lifecycle `js/live-room/remote/live-room-client.js` conserva internamente su almacén de credenciales y ofrece `createGameStateClient(context)` como puerto estrecho. La instancia de estado recibe exactamente el mismo `credentialStore`; ninguna API pública permite leer, enumerar o devolver la capability.

`js/runtime/live-room/runtime-live-room-player.js` crea el coordinador solo cuando coinciden estas condiciones:

- el jugador LiveRoom está `ACTIVE`;
- existen `roomId`, `campaignId`, `publicationId` y `participantId` válidos;
- la campaña publicada ya materializó un `missionOrder` no vacío.

Cada coordinador queda ligado a ese contexto exacto. Un cambio de sala, campaña, publicación o participante invalida la memoria anterior y no permite reutilizar su outbox.

## Outbox mínima y acotada

`js/live-room/live-room-game-state-outbox.js` usa `sessionStorage` con el prefijo:

`crios-live-room-game-state-outbox-v1:`

El registro físico contiene exclusivamente:

```js
{
  version,
  context: { roomId, campaignId, publicationId, participantId },
  items: [
    { requestId, missionId, createdAt, attemptCount, lastAttemptAt }
  ]
}
```

La capacidad máxima queda limitada naturalmente por `missionOrder`: solo puede existir un pendiente por misión y contexto. La outbox no contiene capability, respuestas, vidas, intentos pedagógicos, resultados, identidad personal ni snapshots de sesión.

Lectura, escritura, eliminación y recuperación validan nuevamente el registro físico. Una forma corrupta falla en cerrado y no se reemplaza silenciosamente. Al crear un contexto válido se eliminan únicamente outboxes LiveRoom de otros contextos; una destrucción normal conserva la outbox actual para permitir recarga y replay.

## Coordinador serializado

`js/runtime/live-room/runtime-live-room-game-state-coordinator.js` serializa todas sus operaciones mediante una única cola de promesas:

1. `start()` poda otros contextos y obtiene el snapshot autoritativo inicial;
2. después intenta vaciar los pendientes del contexto actual;
3. `recordCommittedMission()` encola sin esperar red y agenda el envío asíncrono;
4. cada replay conserva el mismo `requestId` lógico;
5. un fallo transitorio conserva el pendiente;
6. una reconciliación requerida fuerza una lectura autoritativa y confirma el pendiente solo si la misión ya aparece completada;
7. expiración, sala inexistente o cruce terminal de contexto descartan la proyección y la outbox correspondiente; esa instancia queda cerrada y no acepta nuevos eventos.

Los timestamps técnicos de intento nunca retroceden respecto del registro persistido, aun si el reloj del sistema retrocede entre recargas.

Después de un completado autoritativo con `changed === true`, el coordinador avisa al adaptador Runtime para publicar una señal mínima `game-state-change`. La recepción de esa señal nunca aplica datos: solicita al reconciliador una futura lectura autenticada. Señales de presencia no disparan lecturas de progreso.

`js/live-room/live-room-game-state-reconciliation.js` comparte con la consola una política de un solo timer y una lectura en vuelo, coalescencia, cooldown, jitter, fallback periódico, backoff, pausa por visibilidad y detención terminal. El detalle está en [`GAME_STATE_PROGRESS_SYNC_RECONCILIATION.md`](GAME_STATE_PROGRESS_SYNC_RECONCILIATION.md).

## Frontera post-commit

`js/crios.js` conserva la red fuera de la transacción de Game Flow. El orden de una misión correcta es:

1. Evaluation produce el resultado correcto;
2. Game Flow completa PlayerState, Progress, Runtime y Navigation;
3. `persistStats()` y `save()` verifican el éxito de todas las escrituras locales requeridas;
4. solo si ambas persistencias devolvieron éxito se llama al puerto `recordCommittedMission()`;
5. el coordinador escribe el evento mínimo en la outbox y agenda la red sin bloquear navegación, audio ni temporizadores.

Una respuesta incorrecta, Game Over, rollback de Game Flow o fallo de persistencia local no encola un completado compartido. El servidor continúa sin certificar la corrección matemática: confía en el evento post-commit emitido por el Runtime autorizado.

## Proyección separada

Runtime mantiene por separado:

- `progress`, `progresosCampanas` y `StudentSession`, que siguen siendo personales y locales;
- `liveRoomSharedCompletedMissionIds`, una copia inmutable del último snapshot compartido validado.

Mapa y desbloqueo final consultan la unión efectiva de ambos conjuntos. Los IDs compartidos se validan con `CRIOS_LIVE_ROOM_GAME_STATE_MODEL`, deben pertenecer a la campaña/publicación solicitadas y nunca se escriben dentro de las estructuras personales.

Fuera de una sala válida, tras un error terminal o al descartar el contexto, la proyección compartida se vacía y el juego vuelve a usar exclusivamente el progreso personal. No se importa automáticamente a la sala progreso personal anterior al join.

## Carga de scripts

`index.html` carga, en orden, modelo, outbox, reconciliador, contratos, cliente remoto, transporte realtime y luego el coordinador y el adaptador Runtime. `studio/index.html` carga solamente el modelo puro necesario para materializar el contexto público del host. `host/index.html` carga las dependencias de lectura y reconciliación, pero no la outbox ni el coordinador escritor.

Esta separación conserva un único almacén lifecycle de credenciales y evita que una superficie de solo lectura componga operaciones post-commit o persistencia de pendientes.

## Evidencia local focal

La regresión Node completa vigente aprueba 38/38 suites y 2888/2888 comprobaciones. Las suites focales ampliadas verifican, entre otras fronteras, reconciliador 122/122, coordinador 79/79, Runtime player 153/153 y composición/proyección 80/80.

La evidencia incluye recarga con el mismo `requestId`, red transitoria, invalidación realtime tipada, coalescencia, recuperación de visibilidad, expiración terminal irreversible, callbacks tardíos entre generaciones, cruce de contexto, outbox corrupta, reloj regresivo, ausencia de room, separación de persistencia y ausencia de capability en las APIs de composición.

Se completaron además tres smokes autocertificantes en un navegador real local:

- `runtime-live-room-game-state-browser-smoke.test.html`: 39/39 comprobaciones. Cubrió dos contextos lógicos de player/dispositivo sobre `sessionStorage` nativo, envío post-commit asíncrono, refresh explícito del segundo player, red transitoria, persistencia y recuperación de outbox con el mismo `requestId`, expiración terminal, ausencia de room y ausencia de capability o respuestas en la outbox física;
- `runtime-live-room-game-state-game-projection-browser-smoke.test.html`: 25/25 comprobaciones. Ejecutó el `index.html` y `js/crios.js` reales con un lanzamiento publicado explícito, verificó la proyección compartida `0/4 -> 3/4 -> 4/4 -> 0/4`, el bloqueo y desbloqueo del final, el rechazo de una publicación cruzada, la preservación del progreso personal y cero errores o advertencias de página/consola;
- `host-live-room-game-state-browser-smoke.test.html`: 25/25 comprobaciones. Ejecutó el DOM y controlador reales de `host/index.html` con dos jugadores lógicos, separó señales de presencia y progreso, conservó el último progreso válido ante una falla transitoria, recuperó el agregado completo, usó solo lectura y no mostró IDs técnicos ni atribución individual.

Los smokes de navegador aprueban 89/89 comprobaciones. Su alcance es una sola instancia con contextos lógicos aislados; no equivale a dos procesos, navegadores o dispositivos reales independientes y no valida Apps Script ni Firebase desplegados.

## Próximo límite

La lectura agregada en consola, la señal Firebase `game-state-change` como invalidación sin datos pedagógicos y la reconciliación con control sintético de carga ya están implementadas y validadas localmente. Quedan pendientes el despliegue coherente, la validación integral con dos o más navegadores o dispositivos reales independientes, la observación de carga real y el smoke contra Apps Script y Firebase desplegados.

Nada en este documento autoriza asignar un identificador, realizar commit, generar bundle, desplegar Apps Script o modificar Firebase.
