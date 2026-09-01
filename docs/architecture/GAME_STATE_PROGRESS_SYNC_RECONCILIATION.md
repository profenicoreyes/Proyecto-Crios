# Reconciliación y lectura agregada del progreso compartido

## Estado

Este documento registra la implementación local de la señal de invalidación, la reconciliación acotada y la lectura agregada del progreso cooperativo de `LiveRoom`. La implementación no tiene un identificador definitivo de roadmap; quedó comprometida localmente en `6df495850d2a925c18ceb5556f60b4967df50c7f`, no fue desplegada y no habilita todavía una capacidad disponible para usuarios.

El endpoint Apps Script versión 9 y las reglas Firebase ampliadas fueron publicados después del checkpoint local. Una consulta no mutante confirmó que el endpoint reconoce `getLiveRoomGameState`; la evidencia aportada y sus límites están en [`../evidence/GAME_STATE_PROGRESS_SYNC_REMOTE_EVIDENCE_2026-08-31.md`](../evidence/GAME_STATE_PROGRESS_SYNC_REMOTE_EVIDENCE_2026-08-31.md). El frontend acumulado, la reconciliación aquí descripta y el candidato posterior de resiliencia permanecen locales, y el smoke remoto integral sigue pendiente.

## Contrato de señal

Firebase Realtime Database continúa siendo un transporte de señales, no una autoridad de progreso. El contrato acepta exactamente dos tipos:

- `presence-change`, que invalida únicamente el roster;
- `game-state-change`, que invalida únicamente la caché de `LiveRoomGameState`.

Una señal de estado conserva solamente `type`, `eventId` y `emittedAt`. No contiene revisión, IDs de misión, participante CRIOS, capability, respuestas, resultados ni datos de sesión. Recibirla nunca muta el progreso: solo solicita una futura lectura autenticada a Apps Script.

El productor Runtime publica `game-state-change` únicamente después de que `completeLiveRoomMission` responde con éxito autoritativo y `changed === true`. Un replay o completado idempotente con `changed === false`, una lectura, un error remoto o una reconciliación no emiten señal. La falla al publicar la señal no revierte el completado ya confirmado.

## Política local de reconciliación

`js/live-room/live-room-game-state-reconciliation.js` concentra una política compartida por Runtime y la consola de mando:

| Control | Valor local |
| --- | ---: |
| debounce mínimo de señal | 300 ms |
| jitter adicional de señal | 0–29.700 ms |
| intervalo mínimo por consumidor | 30 s |
| fallback periódico | 90 s ± 30 s |
| backoff reintentable | 30–300 s |

La política garantiza un solo timer y una sola lectura en vuelo por consumidor. Señales repetidas se coalescen; una solicitud recibida durante una lectura produce como máximo una reconciliación posterior. Una pestaña oculta cancela el timer y no consulta; al recuperar visibilidad solicita una lectura. Un error terminal o explícitamente no reintentable detiene el scheduler; un error transitorio conserva la última proyección válida mientras aplica backoff.

Estos valores son provisionales para la implementación local. No constituyen una medición ni una garantía de capacidad del Apps Script desplegado.

## Integración Runtime

Cada Runtime activo se suscribe al canal de su sala mediante el transporte realtime compartido. `presence-change` se ignora para progreso y `game-state-change` se entrega al scheduler. La lectura inicial ocurre después de validar sala, publicación y `missionOrder`; las lecturas posteriores se disparan por señal, recuperación de visibilidad, actualización manual o fallback periódico.

La proyección compartida continúa separada del progreso personal. El scheduler se destruye y la suscripción se cancela al cambiar de contexto, destruir el jugador o recibir un estado terminal. Los callbacks tardíos quedan protegidos por generación y no pueden aplicar datos a otra sala. En la consola, toda lectura captura además `roomId` y `participantId` antes del `await` y revalida la tripleta al resolver; una lectura del scheduler que termina después de reemplazar el ciclo o ejecutar `destroy` no emite ni muta estado.

## Consola de mando de solo lectura

Studio conserva en el contexto autorizado del host únicamente el `missionOrder` público derivado de la publicación inmutable exacta. No persiste ni expone la capability dentro de ese contexto.

La consola crea un cliente hermano con el almacén lifecycle existente y usa exclusivamente `getLiveRoomGameState()`. No carga outbox ni coordinador y no invoca `completeLiveRoomMission`. La presentación es agregada:

- cantidad de misiones completadas por el equipo;
- secuencia genérica `Misión 1`, `Misión 2`, …;
- ningún ID técnico de misión ni atribución individual de completados.

Roster y progreso mantienen estados de error separados. Un fallo transitorio de progreso conserva la sala activa, el roster y el último snapshot válido. Un contexto legacy sin `missionOrder` continúa mostrando sala y presencia, pero degrada solamente el panel de progreso y no realiza una solicitud inválida.

## Evidencia sintética de control de carga

La prueba del scheduler modela el máximo contractual de 64 presencias lógicas recibiendo la misma invalidación. Cada presencia conserva un solo timer, todas quedan dentro de la ventana de 300–30.000 ms y la distribución determinista en seis intervalos de cinco segundos no supera 12 lecturas programadas por intervalo.

Esta prueba demuestra coalescencia, límites y distribución de la política. No demuestra throughput, cuotas, latencia ni disponibilidad de Apps Script; tampoco sustituye 64 dispositivos o procesos reales.

## Evidencia local

Las pruebas focales nuevas o ampliadas verifican:

- scheduler puro: 122/122;
- coordinador Runtime: 79/79;
- Runtime player: 163/163;
- composición y proyección Runtime: 80/80;
- consola de mando: 250/250;
- Studio host: 179/179;
- proveedor realtime: 58/58;
- transporte realtime: 34/34.

La regresión Node completa vigente aprueba 38/38 suites y 3038/3038 comprobaciones. Tres smokes autocertificantes de progreso en navegador local aprueban 89/89 comprobaciones: 64 de Runtime/proyección y 25 de consola agregada con dos jugadores lógicos, señales tipadas, degradación transitoria, recuperación, lectura exclusiva y ausencia de IDs técnicos o atribución en la UI. Corresponden a una sola instancia con contextos lógicos y no validan el flujo contra servicios desplegados. El smoke complementario de foreground/focus aprueba 36/36 en Runtime, Host y Studio sin red real.

## Límites pendientes

Permanecen pendientes y requieren autorización y evidencia independientes:

- publicar de forma coherente el frontend acumulado y el backend exacto del candidato, con reconfirmación autenticada de las reglas Firebase;
- ejecutar smoke contra el endpoint y el proyecto Firebase reales;
- validar dos o más navegadores o dispositivos independientes, incluida red degradada, recarga y expiración;
- observar carga y latencia reales antes de declarar definitiva la cadencia;
- asignar, si la documentación futura lo decide, un identificador de implementación;
- bundle y despliegue.
