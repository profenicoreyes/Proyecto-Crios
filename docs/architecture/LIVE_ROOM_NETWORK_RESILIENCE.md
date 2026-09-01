# Candidato sin numerar: resiliencia de red para LiveRoom

## Estado

Este documento describe un candidato implementado localmente y todavía no desplegado. No le asigna un identificador definitivo de etapa, no modifica el protocolo `1.0` y no habilita por sí solo commit, bundle ni despliegue.

El endpoint Apps Script versión 9 y el enum Firebase de progreso fueron publicados antes de este candidato. Esa publicación base y su verificación parcial se separan de la resiliencia aquí descripta en [`../evidence/GAME_STATE_PROGRESS_SYNC_REMOTE_EVIDENCE_2026-08-31.md`](../evidence/GAME_STATE_PROGRESS_SYNC_REMOTE_EVIDENCE_2026-08-31.md).

El objetivo es tolerar latencia, suspensión de pestañas y disparos simultáneos sin exigir que los alumnos se conecten durante una ventana inicial breve y sin convertir Firebase en autoridad.

## Evidencia que motiva el ajuste

- Todas las operaciones lifecycle y roster de LiveRoom toman `LockService.getScriptLock()` y esperan hasta 10000 ms; el backend de progreso usa el mismo tipo de lock.
- La verificación manual de Apps Script versión 9 del 21 de agosto de 2026 mostró ejecuciones `doPost` completadas entre 2.718 s y 14.071 s. Es una observación operativa, no una prueba de capacidad.
- Un timeout de navegador de 15 s podía vencer cerca de una ejecución legítima lenta y mostrar `Failed to fetch` o `LiveRoom request timed out` aunque el servicio siguiera procesando.
- Los timers de una pestaña oculta pueden ser postergados por el navegador. Por eso recuperar foco o visibilidad debe solicitar recuperación inmediata, sujeta al gate y a single-flight.
- Los valores típicos de WebSocket no se trasladan directamente: CRIOS usa solicitudes HTTP serializadas por Apps Script y Google Sheets, no un socket persistente de bajo costo.

## Perfil decidido para el candidato

| Parámetro | Valor | Semántica |
| --- | ---: | --- |
| timeout HTTP compartido | 30 s | Aborta la espera del navegador; no declara expirada la sala. |
| heartbeat host/jugador | 120 s | Mantiene la cadencia vigente. No se inicia otra solicitud del mismo controlador mientras una anterior siga en vuelo. |
| presencia conectada | 300 s | A exactamente `lastSeenAt + 300000 ms` sigue conectada; después queda desconectada en el roster. |
| polling fallback de roster | 30 s | Continúa aun con Firebase; señales y foco pueden pedir una lectura anticipada. |
| inactividad de sala | 600 s | Sin cambios: a exactamente `expiresAt` sigue activa; después expira. |
| retorno a foco/visibilidad | inmediato con gate de 30 s | El primer disparo solicita heartbeat y, para host, roster; otro anterior a 30000 ms se coalesce. La frontera exacta y una regresión del reloj permiten recuperación. |
| debounce Firebase de presencia | 300 ms | Sin cambios; la señal solo invalida y Apps Script sigue siendo autoridad. |

## Dos relojes distintos

`connected` y `room.status` no representan lo mismo:

- una presencia puede aparecer desconectada después de cinco minutos sin heartbeat mientras la sala continúa activa por actividad válida del host u otro jugador;
- una sala continúa disponible mientras al menos una operación create, join o heartbeat válida renueve su lease de diez minutos;
- leer roster o progreso no renueva la sala;
- un alumno puede entrar más tarde durante la clase si la sala sigue activa; no existe una obligación de conectarse en los primeros 15 segundos;
- una sala expirada no se reactiva mediante foco, polling, Firebase, roster ni progreso.

## Control de concurrencia

Runtime conserva como máximo un heartbeat en vuelo. Studio y la consola conservan como máximo un heartbeat y una lectura de roster en vuelo por controlador. Las llamadas concurrentes de cada operación reutilizan la misma promesa; el gate de foreground evita que `focus` y `visibilitychange` consecutivos generen ciclos redundantes.

El bloqueo se libera tanto al resolver como al rechazar la promesa, y solo la promesa que ocupa el slot puede limpiarlo. Después puede comenzar una nueva solicitud. Este control reduce duplicados del mismo navegador; no coordina navegadores distintos ni demuestra capacidad para 64 presencias reales.

## Ciclos asíncronos y respuestas tardías

Runtime, Studio y la consola invalidan la generación de presencia al comenzar un ciclo incompatible, alcanzar un estado terminal o ejecutar `destroy`. Cada solicitud captura generación, `roomId` y `participantId`; después de cada `await` crítico vuelve a validar que el ciclo y la identidad continúan vigentes. La consola aplica la misma validación a las lecturas agregadas de progreso iniciadas por lifecycle, scheduler o actualización manual. Una respuesta tardía de un ciclo reemplazado o destruido no puede emitir estado, mutar la proyección, programar timers, limpiar la promesa nueva ni revertir `EXPIRED`.

La lectura inicial de progreso de la consola acepta una tripleta esperada completa y aplica fail-closed: si falta generación o identidad, o el ciclo dejó de estar activo, no lee la red, no emite y no ejecuta `fatal`. El modo manual sin contexto esperado conserva el comportamiento previo.

## Carga y límites conocidos

Con 64 presencias y heartbeat cada 120 s, el promedio teórico es 32 heartbeats por minuto, más dos lecturas de roster por minuto por host y las operaciones de progreso. Los clientes pueden además agruparse temporalmente. Como Apps Script serializa operaciones mediante un lock global, el máximo contractual de 64 presencias no equivale a capacidad validada.

El ajuste de roster de 15 s a 30 s reduce su fallback de cuatro a dos lecturas por minuto. Mantener heartbeat en 120 s evita cuadruplicar la carga que produciría una cadencia de 30 s y deja dos intervalos completos antes del límite de presencia de cinco minutos.

No se agrega jitter al heartbeat en este candidato. Antes de ampliar el número de dispositivos debe medirse latencia, espera de lock, errores, cuota y distribución real; si aparecen ráfagas, el jitter o una autoridad de presencia distinta requieren una nueva decisión.

## Degradación esperada

- Un timeout o fallo transitorio conserva el último estado válido y permite recuperación en el siguiente intervalo o al volver a foco.
- Firebase puede fallar sin impedir join, heartbeat, roster autoritativo ni progreso.
- Una señal perdida queda cubierta por el polling de 30 s.
- Una pestaña suspendida puede figurar desconectada después de cinco minutos; al volver a foco solicita recuperación, sujeta al gate y a single-flight.
- `ROOM_EXPIRED`, capability inválida o participante inexistente siguen siendo errores terminales según el contrato vigente.

## Compatibilidad

- No cambian payloads, operaciones, hojas, capabilities, reglas Firebase ni URLs públicas.
- El timeout de 30 s y single-flight son cambios de cliente.
- La ventana de presencia de cinco minutos solo cambia la proyección derivada del roster; no borra presencias ni altera el lease de la sala.
- La sincronización de progreso y su reconciliación mantienen sus políticas separadas.
- Cierre manual, duración máxima absoluta y desconexión autoritativa inmediata permanecen fuera de alcance.

## Evidencia local vigente

- suites dirigidas de lifecycle: Runtime 163/163, Studio 179/179 y Host 250/250; total 592/592;
- regresión Node completa: 38/38 suites y 3038/3038 comprobaciones;
- `live-room-foreground-browser-smoke.test.html`: 36/36 en navegador real local, con eventos `focus` y `visibilitychange`, frontera exacta de 30000 ms, reloj regresivo, coalescencia, estados terminales y `destroy`;
- el smoke usa clientes falsos por iframe y no accede a Apps Script ni Firebase reales.

## Gates antes de desplegar

1. Regresión Node completa y `git diff --check` sin errores.
2. Smokes browserless, los tres smokes de progreso (89/89) y el smoke de foreground/focus (36/36).
3. Smoke real con host y dos jugadores en navegadores independientes: entrada tardía, avance compartido, pestaña oculta, retorno a foco y recuperación tras una falla transitoria.
4. Confirmar en Apps Script que no hay excepciones de lock ni aumento sostenido de timeouts.
5. Verificar que Firebase solo transporta `presence-change` y `game-state-change`; no requiere nuevas reglas.
6. Desplegar y registrar evidencia únicamente con aprobación separada.

## Referencias externas

- [Socket.IO server options: heartbeat](https://socket.io/docs/v4/server-options/#pinginterval) muestra valores de sockets persistentes que sirven como comparación, no como configuración directa de CRIOS.
- [Colyseus reconnection](https://docs.colyseus.io/room/reconnection) diferencia ventanas de reconexión según el ritmo del juego.
- [Firebase Realtime Database presence](https://firebase.google.com/docs/database/web/offline-capabilities) documenta presencia basada en conexión y `onDisconnect`; CRIOS mantiene Apps Script como autoridad.
- [MDN Page Visibility API](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API) documenta la visibilidad de pestañas usada para la recuperación inmediata.
