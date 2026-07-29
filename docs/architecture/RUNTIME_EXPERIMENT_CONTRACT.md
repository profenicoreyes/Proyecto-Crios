## 1. Propósito

Definir el contrato verificable del siguiente experimento runtime para las afirmaciones que no quedaron cerradas de forma puramente estática en la matriz de claims.

## 2. Alcance

- Repositorio: Proyecto-Crios.
- Fuente de partida: docs/architecture/DEMONSTRABLE_CLAIMS_MATRIX.md.
- Alcance funcional: flujo de sesion, navegacion, misiones, evaluacion, cierre, persistencia, transmision, gameOver y recuperacion.
- No incluye implementacion de instrumentacion.
- No incluye ejecucion del experimento.

## 3. Fuentes

- docs/architecture/DEMONSTRABLE_CLAIMS_MATRIX.md
- index.html
- js/config.js
- js/crios.js
- js/player-state/player-state-service.js
- js/runtime/runtime-core.js
- js/navigation/navigation-core.js
- js/session/session-factory.js
- js/session/session-validator.js
- js/player-state/player-state-validator.js

## 4. Afirmaciones runtime extraídas

- DC-013: la finalizacion tecnica equivale a un cierre transmitido exitosamente de extremo a extremo.
- DC-015: la finalizacion queda persistida y es recuperable despues de una recarga.
- DC-018: no existe una rama visible dedicada de `gameOver` para el usuario final.
- DC-020: el ownership de la mision actual convive en varios clusters legacy y de dominio.
- DC-024: callbacks, promesas, timers y tareas diferidas participan del flujo principal.
- DC-028: no existen contradicciones entre documentos y codigo en todos los temas auditados.
- DC-029: existen dependencias de integracion que solo pueden cerrarse en runtime.
- DC-030: las afirmaciones globales de completitud documental implican garantia del comportamiento real.
- DC-013, DC-028 y DC-030 son afirmaciones asimetricas: una observacion runtime puede refutarlas, pero un conjunto finito de ejecuciones no puede confirmarlas globalmente.
- DC-018 es una afirmacion de ausencia y solo puede comprobarse dentro del universo explicitamente ejecutado.
- El contrato no debe presentar como confirmacion global la mera ausencia de fallos durante una corrida.

## 5. Código ejecutable relacionado

- js/crios.js:L123-L177 — sincroniza missionId, integra player-state y refresca runtime/navigation.
- js/crios.js:L291-L310 — construye sessionData y registra pantallas.
- js/crios.js:L340-L435 — construye payload, serializa envios, transmite y recupera pendiente.
- js/crios.js:L443-L527 — navega pantallas, actualiza mapa y ejecuta evaluacion final.
- js/crios.js:L936-L972 — evalua misiones y procedimiento final.
- js/player-state/player-state-service.js:L16-L49 — aplica evaluation, calcula gameOver y restaura continuidad.
- js/runtime/runtime-core.js:L52-L91 — exige coherencia entre currentMissionIndex y currentMissionId.
- js/navigation/navigation-core.js:L60-L110 — valida coherencia de runtime, session y release.
- js/session/session-factory.js:L22-L43 — crea session con currentMissionIndex y currentMissionId.
- index.html:L283-L397 — expone mapa, final, creditos y los scripts enlazados.

## 6. Riesgos y preguntas experimentales

- La telemetria de envio usa no-cors, por lo que el estado transmitido no se confirma solo con codigo local.
- gameOver existe en dominio pero puede ser absorbido por restorePlayerState sin pantalla dedicada.
- La coherencia de mision actual se distribuye entre clusters legacy y dominio.
- Timers y promesas introducen orden observable pero no garantizan causalidad completa sin trazas.
- pendingResult se escribe por dos rutas distintas y puede requerir un experimento de correlacion.

## 7. Casos experimentales

| ID runtime | IDs DC | Pregunta | Estado inicial | Acción | Evidencia requerida | Confirma | Refuta | Recorrido inverso |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| RT-001 | DC-013 | ¿El sistema distingue el cierre local, la resolución de la promesa `fetch` y la confirmación real del servidor? | Sesión activa, módulos completados y procedimiento final habilitado. El primer envío debe poder mantenerse pendiente mediante un `fetch` controlado. | Ejecutar un envío incremental; mientras `transmissionBusy` sea verdadero ejecutar el cierre final; resolver y rechazar el envío en corridas separadas. | Estados antes y después de `transmissionBusy`, `transmissionQueued`, `finISO`, `enviada`, `evaluacion`, `complete`, `pendingResult` y las llamadas a `sendSessionUpdate()`. | Solo confirmaría DC-013 si el cierre técnico no se marcara hasta obtener confirmación verificable de procesamiento del servidor. Con el `no-cors` actual esta confirmación global no es alcanzable desde el cliente. | `finISO`, `enviada` o `complete` quedan marcados antes de una confirmación verificable, o permanecen marcados después de un fallo de transmisión. | PARCIAL: desde el último envío reconstruir la cola, la llamada final, `transmitResults()` y `validateFinal()`; la confirmación del servidor queda fuera del cliente. |
| RT-002 | DC-015 | ¿Qué parte exacta del cierre persiste y se recupera después de recargar la página? | Sesión finalizada en una corrida exitosa y, en otra corrida, finalizada con fallo controlado de red. | Capturar storage antes de recargar; recargar; volver a leer `sessionData`, `complete`, `pendingResult`, pantalla activa y dominio reconstruido. | Comparación antes y después de `sessionData.final`, `finISO`, `enviada`, `evaluacion`, `complete`, `currentScreen`, `missionOpenedAt`, `domainSession`, `domainRuntime` y `domainNavigation`. | Los campos persistidos del cierre reaparecen con los mismos valores y la inicialización los vuelve a cargar sin corrupción. | Los campos persistidos desaparecen o cambian; o se afirma recuperación de pantalla o tiempos de misión aunque `currentScreen` y `missionOpenedAt` se reinicien. | COMPLETO para storage local del navegador; PARCIAL para experiencia visual y dominio reconstruido asincrónicamente. |
| RT-003 | DC-018 | ¿El estado técnico `gameOver` produce una pantalla terminal visible dedicada antes de ser restaurado? | `domainSession.status` en `running` y `lives` igual a 1, con una misión coherente abierta. | Ejecutar una respuesta incorrecta y observar el estado inmediatamente después de `applyEvaluation()` y después de `restorePlayerState()`. | Estado `status` y `lives` antes de evaluar, después de evaluar y después de restaurar; pantalla activa; secciones visibles del DOM. | Se observa `gameOver` técnico transitorio, restauración a `running` y ninguna pantalla dedicada de `gameOver` dentro del universo ejecutado. | Se activa una pantalla o ruta visible dedicada de `gameOver`, o el estado terminal permanece visible sin restauración. | COMPLETO dentro del front-end inspeccionado: pantalla final, restauración y evaluación pueden correlacionarse mediante secuencia. |
| RT-004 | DC-020 | ¿Qué clústeres representan simultáneamente la misión actual y cuándo convergen o divergen? | Campaña cargada, dominio listo y mapa visible. | Abrir cada misión, cambiar entre misiones y volver al mapa. | Snapshots de `currentScreen`, `missionOpenedAt`, `domainSession.currentMissionIndex`, `domainSession.progress.currentMissionId`, `domainRuntime.mission.id` y `domainNavigation.currentMissionId`. | Se demuestra la coexistencia de varios clústeres y se identifica el punto exacto en que `syncDomainMissionById()` y `refreshDomainRuntimeAndNavigation()` los hacen converger. | Solo existe una representación mutable de misión actual o los clústeres no se sincronizan como documenta el código. | COMPLETO dentro del front-end: desde la pantalla de misión puede reconstruirse `openMission()`, la resolución de dominio y las mutaciones previas. |
| RT-005 | DC-024 | ¿Cuál es el orden real de las promesas, timers, callbacks y listeners usados por el flujo principal? | Página recién cargada y tracer vacío. | Ejecutar arranque, carga de módulos, introducción, apertura y resolución de misión, cierre final y eventos `online`, `pagehide` y `visibilitychange`. | Eventos de programación y resolución con `sequence`, `performanceTime`, tipo de tarea, función de origen y callback ejecutado. | Se observan tareas diferidas participando efectivamente en el flujo y queda registrado su orden real para las rutas ejecutadas. | Las rutas ejecutadas no contienen las tareas diferidas documentadas o el orden observado contradice los puntos instrumentados. | PARCIAL: puede reconstruirse la cadena del código instrumentado, pero no la política interna completa del scheduler del navegador. |
| RT-006 | DC-028 | ¿Aparece al menos una contradicción entre la documentación auditada y los resultados de RT-001 a RT-005? | Trazas completas y válidas de RT-001 a RT-005. | Comparar cada resultado observado contra su afirmación y evidencia documental correspondiente. | Matriz de comparación con ID DC, resultado observado, documento, coincidencia, contradicción y límite. | Una ejecución finita no confirma globalmente que no existan contradicciones; solo puede dejar la afirmación no refutada dentro del universo ejecutado. | Cualquier resultado runtime incompatible con una afirmación documental refuta DC-028. | NO_POSIBLE_SIN_INSTRUMENTACIÓN_ADICIONAL para una prueba global; el recorrido es completo solo para los casos ejecutados. |
| RT-007 | DC-029 | ¿Qué dependencias de integración cambian el resultado cuando dominio, red o recuperación todavía no están disponibles? | Corridas separadas con `domainReady` falso y verdadero; red online y offline; storage vacío y con sesión previa. | Abrir misión y evaluar antes y después de cargar dominio; ejecutar envío offline y reintento online; recargar con sesión persistida. | Retornos tempranos, errores capturados, estados legacy y de dominio, `pendingResult`, eventos de carga y reconstrucción. | El resultado depende de la disponibilidad y del orden de módulos, red o storage, demostrando dependencias que no se cierran solo con lectura estática. | Los resultados son idénticos e independientes del orden y disponibilidad de todos los subsistemas evaluados. | PARCIAL: completo para módulos y storage locales; parcial para red externa y scheduler. |
| RT-008 | DC-030 | ¿Una documentación declarada completa garantiza por sí sola el comportamiento observado en todas las corridas? | Resultados de RT-001 a RT-007 y documentos auditados. | Comparar afirmaciones globales contra ejecuciones exitosas, fallos controlados, recargas, concurrencia y estados transitorios. | Tabla de falsación con afirmación, corrida, observación, coincidencia, desviación y alcance. | No puede confirmarse globalmente mediante un conjunto finito de pruebas; solo puede quedar no refutada en el universo ejecutado. | Una sola desviación entre la garantía documental y el comportamiento runtime refuta la implicación global. | NO_POSIBLE_SIN_INSTRUMENTACIÓN_ADICIONAL para garantía universal; completo para cada desviación concreta observada. |

## 8. Modelo de traza

- Campos obligatorios: sequence, traceId, experimentId, timestamp, performanceTime, eventType, sourceFile, sourceFunction, phase, sessionId, persisted, transmitted, visibleEffect, error, metadata.
- Campos condicionales: missionId, screenBefore, screenAfter, currentMissionIndexBefore, currentMissionIndexAfter, currentMissionIdBefore, currentMissionIdAfter, evaluationBefore, evaluationAfter, finalizedBefore, finalizedAfter, transmissionQueuedBefore, transmissionQueuedAfter, gameOverBefore, gameOverAfter.
- Nulos permitidos: solo cuando el evento no tenga ese eje de observacion.
- Serializacion: JSON lineal por evento; objetos anidados solo dentro de metadata o snapshots.
- Referencias circulares: no permitidas; deben copiarse como snapshots planos o ids de correlacion.
- Tamaño maximo: acotado por evento a un snapshot sintetico; el contrato no fija un volumen de almacenamiento permanente.
- Orden: sequence monotonica por experimento y traceId estable por corrida.
- Correlacion: experimentId agrupa casos; traceId agrupa una corrida; sequence ordena eventos.
- `sequence`: entero positivo y estrictamente creciente dentro de cada `traceId`.
- `traceId`: identificador unico de una corrida.
- `experimentId`: uno de RT-001 a RT-008.
- `timestamp`: fecha ISO canonica.
- `performanceTime`: numero obtenido de `performance.now()`.
- Los campos `Before` y `After` deben contener snapshots y nunca referencias vivas.
- Profundidad maxima de snapshot: 5 niveles.
- Longitud maxima de una cadena capturada: 1000 caracteres.
- Cantidad maxima en memoria: 2000 eventos.
- Al superar el maximo debe descartarse el evento mas antiguo.
- El tracer no puede escribir en `localStorage` ni `sessionStorage`.
- El tracer no puede ejecutar `fetch`, `sendBeacon` ni otra operacion de red.
- Las referencias circulares deben convertirse en el texto `[Circular]`.
- Los valores no serializables deben convertirse en una representacion segura.
- Las trazas deben poder consultarse, exportarse y borrarse manualmente.
- Exportar o borrar nunca debe ocurrir automaticamente.
- La desactivacion del tracer debe dejar el flujo sin efectos observables adicionales.

## 9. Catálogo de eventos

| Evento propuesto | Decisión | Evento real para Flow-02 | Punto ejecutable | Casos relacionados | Justificación |
| --- | --- | --- | --- | --- | --- |
| session:create:before | NECESARIO | session:create:before | `js/crios.js:L291-L298 — startSession()` | RT-002, RT-007 | Captura el estado anterior a reemplazar completamente `sessionData`. |
| session:create:after | NECESARIO | session:create:after | `js/crios.js:L299-L304 — startSession()` | RT-002, RT-007 | Captura la sesión creada y el primer estado persistido. |
| screen:shift:before | DEBE_RENOMBRARSE | screen:history-trim:before | `js/crios.js:L305-L309 — recordScreen()` | RT-005 | `pantallas.shift()` no navega; elimina el registro más antiguo cuando el historial supera 80 entradas. |
| screen:shift:after | DEBE_RENOMBRARSE | screen:history-trim:after | `js/crios.js:L305-L309 — recordScreen()` | RT-005 | Debe registrar longitud y elemento eliminado, no un cambio de pantalla. |
| mission:select:before | NECESARIO | mission:select:before | `js/crios.js:L465-L467 — openMission()` | RT-004, RT-007 | Captura el ID solicitado antes de resolverlo mediante dominio. |
| mission:select:after | NECESARIO | mission:select:after | `js/crios.js:L465-L467 — openMission()` | RT-004, RT-007 | Captura el ID resuelto y permite detectar divergencias. |
| mission:start:before | DEBE_RENOMBRARSE | mission:open:before | `js/crios.js:L465-L470 — openMission()` | RT-004 | No existe un engine separado de inicio; la operación real abre, renderiza y navega. |
| mission:start:after | DEBE_RENOMBRARSE | mission:open:after | `js/crios.js:L465-L470 — openMission()` | RT-004 | Debe capturar `missionOpenedAt` y la pantalla resultante. |
| evaluation:create:before | DEBE_RENOMBRARSE | domain:evaluation:apply:before | `js/crios.js:L160-L171 — applyDomainEvaluationForMission()` | RT-003, RT-004, RT-007 | El EvaluationModel se construye de forma inline y se aplica inmediatamente. |
| evaluation:create:after | DEBE_RENOMBRARSE | domain:evaluation:apply:after | `js/crios.js:L168-L177 — applyDomainEvaluationForMission()` | RT-003, RT-004, RT-007 | Debe capturar vidas y estado después de `applyEvaluation()`, antes de ocultar un `gameOver`. |
| evaluation:submit:before | NECESARIO | evaluation:submit:before | `js/crios.js:L936-L951 — validateMissionResult()` y `js/crios.js:L502-L526 — validateFinal()` | RT-001, RT-003, RT-005 | Representa la interacción real de envío de una respuesta de misión o final. |
| evaluation:submit:after | NECESARIO | evaluation:submit:after | `js/crios.js:L936-L951 — validateMissionResult()` y `js/crios.js:L502-L526 — validateFinal()` | RT-001, RT-003, RT-005 | Captura resultado, feedback, persistencia y tarea diferida programada. |
| integration:start | DEBE_RENOMBRARSE | domain:integration:before | `js/crios.js:L160-L177 — applyDomainEvaluationForMission()` | RT-003, RT-004, RT-007 | El punto real integra PlayerState, Session, Runtime y Navigation. |
| integration:end | DEBE_RENOMBRARSE | domain:integration:after | `js/crios.js:L160-L177 — applyDomainEvaluationForMission()` | RT-003, RT-004, RT-007 | Captura el resultado después de restauración y reconstrucción de Runtime y Navigation. |
| finalization:before | DEBE_RENOMBRARSE | finalization:local:before | `js/crios.js:L502-L518 — validateFinal()` | RT-001, RT-002 | La finalización local comienza antes de que exista confirmación de red. |
| finalization:after | DEBE_RENOMBRARSE | finalization:local:after | `js/crios.js:L507-L518 — validateFinal()` | RT-001, RT-002 | Debe separar cierre local, transición visual y transmisión asincrónica. |
| gameOver:before | NO_EXISTE_PUNTO_REAL | player-state:evaluation:before | `js/player-state/player-state-service.js:L16-L35 — applyEvaluation()` | RT-003 | Antes de evaluar todavía no se sabe si ocurrirá `gameOver`; corresponde capturar el estado previo de PlayerState. |
| gameOver:after | DEBE_DIVIDIRSE | gameOver:entered y gameOver:restored | `js/crios.js:L168-L175 — applyDomainEvaluationForMission()` y `js/player-state/player-state-service.js:L30-L49` | RT-003 | `gameOver` puede existir después de aplicar la evaluación y desaparecer inmediatamente después de restaurar. |
| persistence:before | NECESARIO | persistence:before | `js/crios.js:L193-L200 — writeJson()` y escrituras directas relevantes | RT-001, RT-002, RT-007 | Permite distinguir intención de persistir, clave, storage y estado previo. |
| persistence:after | NECESARIO | persistence:after | `js/crios.js:L193-L200 — writeJson()` y escrituras directas relevantes | RT-001, RT-002, RT-007 | Debe registrar éxito, fallo y valor observable después de la escritura. |
| transmission:before | NECESARIO | transmission:before | `js/crios.js:L369-L395 — sendSessionUpdate()`; `js/crios.js:L411-L425 — sendExitSnapshot()`; `js/crios.js:L428-L434 — retryPendingResult()` | RT-001, RT-005, RT-007 | Distingue envío incremental, final, snapshot de salida y reintento. |
| transmission:after | NECESARIO | transmission:after | `js/crios.js:L369-L395 — sendSessionUpdate()`; `js/crios.js:L411-L425 — sendExitSnapshot()`; `js/crios.js:L428-L434 — retryPendingResult()` | RT-001, RT-005, RT-007 | Debe distinguir promesa resuelta, error, pendiente local y ausencia de confirmación del servidor. |
| render:before | DEBE_RENOMBRARSE | screen:render:before | `js/crios.js:L443-L464 — go()` | RT-002, RT-003, RT-004, RT-005 | El punto real desactiva y activa secciones `.screen`. |
| render:after | DEBE_RENOMBRARSE | screen:render:after | `js/crios.js:L443-L464 — go()` | RT-002, RT-003, RT-004, RT-005 | Debe capturar pantalla solicitada, existencia del elemento y pantalla activa resultante. |
| error:thrown | DEBE_RENOMBRARSE | error:caught | `js/crios.js:L178-L180 — applyDomainEvaluationForMission()`; `js/crios.js:L389-L391 — sendSessionUpdate()`; `js/crios.js:L633-L638 — identifyUser()`; `js/crios.js:L1043-L1045 — listener online` | RT-001, RT-005, RT-007 | El flujo principal captura varios errores; no existe un interceptor global seguro de excepciones lanzadas. |
| flow:return-early | NECESARIO | flow:return-early | `js/crios.js:L93-L93 — getCurrentDomainSession()`; `js/crios.js:L124-L127 — syncDomainMissionById()`; `js/crios.js:L135-L135 — buildDomainEvaluationInputByMissionId()`; `js/crios.js:L147-L152 — applyDomainEvaluationForMission()`; `js/crios.js:L161-L164 — applyDomainEvaluationForMission()`; `js/crios.js:L370-L371 — sendSessionUpdate()`; `js/crios.js:L412-L412 — sendExitSnapshot()`; `js/crios.js:L429-L430 — retryPendingResult()` | RT-001, RT-004, RT-007 | Los retornos tempranos cambian el flujo sin producir necesariamente un error visible. |
| async:scheduled | NECESARIO | async:scheduled | `js/crios.js:L41-L70 — ensureDomainModulesLoaded()`; `js/crios.js:L398-L401 — sendSessionUpdate()`; `js/crios.js:L518-L518 — validateFinal()`; `js/crios.js:L978-L1005 — validateFinalProcedure()`; `js/crios.js:L1038-L1045 — listener online` | RT-001, RT-005, RT-007 | Registra programación de promesas, fetch y timers instrumentados explícitamente. |
| async:resolved | NECESARIO | async:resolved | `js/crios.js:L41-L70 — ensureDomainModulesLoaded()`; `js/crios.js:L369-L395 — sendSessionUpdate()`; `js/crios.js:L428-L434 — retryPendingResult()` | RT-001, RT-005, RT-007 | Permite establecer el orden observado sin modificar el scheduler. |
| async:rejected | NECESARIO | async:rejected | `js/crios.js:L53-L54 — ensureDomainModulesLoaded()`; `js/crios.js:L389-L391 — sendSessionUpdate()`; `js/crios.js:L633-L638 — identifyUser()`; `js/crios.js:L1043-L1045 — listener online` | RT-001, RT-005, RT-007 | Registra rechazos y fallos capturados en los puntos reales. |

## 10. Activación y no interferencia

- Flow-02 debera crear un modulo aislado: `js/runtime/trace-core.js`.
- El modulo debera cargarse inmediatamente antes de: `js/crios.js`.
- Debera permanecer desactivado por defecto.
- La activacion recomendada sera explicita mediante: `?criosTrace=1`.
- Tambien debera ofrecer una API manual que permita activar y desactivar la captura durante una sesion de desarrollo.
- No debera usar monkey patching global de `fetch`, `Promise`, `setTimeout`, storage ni APIs del navegador.
- Solo deberan instrumentarse puntos explicitos del codigo CRIOS.
- El modulo no debera depender del dominio, Studio ni narrativa.
- El codigo de dominio no debera depender del tracer.
- Cuando este desactivado, una llamada de traza debera ser un no-op tolerante a fallos.
- Ningun error interno del tracer podra propagarse al juego.
- No debera cambiar valores retornados.
- No debera cambiar argumentos.
- No debera cambiar el orden de llamadas.
- No debera crear nuevas promesas o timers para capturar eventos.
- No debera crear escrituras persistentes.
- No debera realizar operaciones de red.
- No debera conservar referencias vivas a objetos del juego.
- Debera limitarse a 2000 eventos en memoria.
- Debera poder exportarse y eliminarse por llamada manual.
- Toda la instrumentacion debera poder retirarse eliminando el modulo, su etiqueta `script` y llamadas explicitas de emision.

## 11. Recorridos directos

- RT-001: validar final -> mutar sessionData.final -> renderizar cierre -> transmitir -> persistir -> recargar.
- RT-002: aplicar evaluacion incorrecta -> mutar estado de dominio -> posible restore -> observar si hay pantalla gameOver.
- RT-003: openMission -> syncDomainMissionById -> refreshDomainRuntimeAndNavigation -> renderMission -> go.
- RT-004: validateMissionResult o validateFinalProcedure -> applyDomainEvaluationForMission o validateFinal -> persistencia -> setTimeout/render.
- RT-005: ensureDomainModulesLoaded -> promesas de carga -> intro -> navigation post-load.
- RT-006: sendSessionUpdate -> fallo o exito -> retryPendingResult / sendExitSnapshot.
- RT-007: go, inicializadores de sesion y dominio, recarga de pagina.
- RT-008: sendSessionUpdate con transmissionBusy true y finalized true.

## 12. Recorridos inversos

- RT-001 — PARCIAL. Desde el ultimo envio se reconstruyen cola, llamada final y transicion local; la confirmacion de servidor queda fuera del cliente.
- RT-002 — PARCIAL. Se reconstruye persistencia local y recarga, con limite en el orden asincronico de rehidratacion visual.
- RT-003 — COMPLETO. La secuencia entre evaluacion, estado tecnico `gameOver`, restauracion y ausencia/presencia de pantalla dedicada puede cerrarse en front-end.
- RT-004 — COMPLETO. La convergencia/divergencia de clusters de mision actual se reconstruye de punta a punta en el cliente.
- RT-005 — PARCIAL. Se reconstruyen puntos instrumentados, no la politica interna completa del scheduler.
- RT-006 — NO_POSIBLE_SIN_INSTRUMENTACIÓN_ADICIONAL para la afirmación global; completo dentro de los casos ejecutados.
- RT-007 — PARCIAL. Se reconstruyen dependencias de orden y disponibilidad locales, con limite en red externa.
- RT-008 — NO_POSIBLE_SIN_INSTRUMENTACIÓN_ADICIONAL para la garantía universal; completo para cada desviación concreta.

## 13. Persistencia, transmisión y visibilidad

- Persistencia:
  - sessionData, sessionStats, progress, campaignProgress, complete y pendingResult se escriben en storage local.
- Transmisión:
  - sendSessionUpdate usa fetch no-cors y puede dejar pendingResult.
  - sendExitSnapshot usa sendBeacon o fetch keepalive con fallback local.
- Visibilidad:
  - go() y validateFinal() controlan pantallas y creditos.
  - updateMap mantiene mapa y estado visual.
- Diferencia clave:
  - visible no equivale a persistido.
  - persistido no equivale a transmitido.
  - transmitido no equivale a confirmado por servidor local.

## 14. GameOver y terminalidad

- gameOver tecnico existe en player-state-service.
- restorePlayerState puede revertir gameOver a running.
- No se define una pantalla gameOver dedicada en index.html.
- La terminalidad visible actual se expresa en final y credits, no en gameOver.

## 15. Interrupciones, errores y asincronía

- Retornos tempranos:
  - ausencia de sessionData o endpoints en sendSessionUpdate/sendExitSnapshot/retryPendingResult.
  - ausencia de domainSession o domainReady en sincronizacion de dominio.
- Errores:
  - fallos de player-state, runtime, navigation y fetch se capturan o se convierten en no-op.
- Asincronía:
  - promesas de carga de dominios;
  - fetch async/await;
  - setTimeout en retorno a mapa y creditos;
  - event listeners de online/pagehide/visibilitychange.

## 16. Criterios de aceptación de Flow-02

- Cada evento tiene sequence monotónico.
- Cada experimento tiene traceId.
- No se pierde el vínculo con el ID DC.
- Se capturan estados antes y después.
- Se capturan retornos tempranos.
- Se capturan errores.
- Se separan efectos visibles, persistidos y transmitidos.
- Las trazas se pueden exportar y borrar.
- El juego funciona con instrumentacion desactivada.
- El resultado observable del juego no cambia con tracer activo o inactivo.
- No se crean escrituras permanentes inesperadas.
- El recorrido inverso puede reconstruirse hasta el limite permitido.
- Existe evidencia de no interferencia.
- Los 29 eventos propuestos tienen una decision justificada.
- Flow-02 implementa solamente los eventos reales clasificados como necesarios o renombrados.
- `gameOver:entered` se captura antes de cualquier restauracion.
- `gameOver:restored` se captura despues de `restorePlayerState()`.
- La resolucion de un `fetch` con `mode: no-cors` nunca se etiqueta como confirmacion de procesamiento del servidor.
- RT-003 conserva correctamente la direccion entre "Confirma" y "Refuta".
- RT-006 y RT-008 no pueden producir una confirmacion global a partir de un conjunto finito.
- El tracer no usa storage, red, nuevas promesas ni nuevos timers.
- La desactivacion del tracer produce cero eventos y no altera el resultado observable.
- El buffer se limita a 2000 eventos.
- `clear()` elimina todas las trazas y reinicia la secuencia.
- `export()` solo actua por invocacion manual.

## 17. Criterios de rechazo

- La instrumentacion cambia el orden de llamadas.
- La instrumentacion altera valores retornados.
- La instrumentacion agrega escrituras, promesas, timers o llamadas de red nuevas.
- La traza no conserva IDs DC ni traceId.
- No puede distinguir efectos visibles, persistidos y transmitidos.
- No puede desactivarse sin modificar el juego.
- La instrumentacion rompe gameOver, navegacion o persistencia.
- Marcar como confirmada una afirmacion global solo porque no aparecio un fallo.
- Interpretar una promesa `fetch` resuelta en `no-cors` como confirmacion del servidor.
- Instrumentar `pantallas.shift()` como si fuera navegacion.
- Perder el estado `gameOver` transitorio por capturar solamente despues de `restorePlayerState()`.
- Alterar el orden de evaluacion y restauracion para poder observarlo.
- Monkey patching global de APIs del navegador.
- Escribir trazas en `localStorage` o `sessionStorage`.
- Emitir trafico de red desde el tracer.
- Introducir tareas asincronicas que no existian en el flujo original.

## 18. Orden de ejecución

1. Implementar `trace-core.js` aislado y desactivado.
2. Cargarlo antes de `js/crios.js`.
3. Instrumentar primero creacion de sesion, navegacion y mision actual.
4. Instrumentar PlayerState y capturar `gameOver` antes de restaurarlo.
5. Instrumentar persistencia.
6. Instrumentar transmision y la cola `transmissionQueued`.
7. Instrumentar timers, promesas y listeners unicamente en puntos explicitos.
8. Verificar no interferencia con tracer desactivado.
9. Ejecutar RT-003 y RT-004 como pruebas locales deterministas.
10. Ejecutar RT-001 y RT-002 con red controlada.
11. Ejecutar RT-005 y RT-007.
12. Construir RT-006 y RT-008 a partir de las trazas anteriores.
13. No declarar garantias globales.

## 19. Riesgos residuales

- La red puede introducir no determinismo fuera del control local.
- Los timers pueden variar segun scheduler del navegador.
- El comportamiento de no-cors limita la confirmacion local de envio.
- El estado de dominio puede restaurarse antes de que el usuario vea un gameOver.
- Persistencia y transmision pueden divergir en fallos de red.

## 20. Veredicto

CONTRATO_LISTO_PARA_IMPLEMENTAR_FLOW_02

Este veredicto autoriza unicamente la implementacion de instrumentacion no interferente. No afirma que los comportamientos runtime esten confirmados ni que las afirmaciones globales hayan sido demostradas.