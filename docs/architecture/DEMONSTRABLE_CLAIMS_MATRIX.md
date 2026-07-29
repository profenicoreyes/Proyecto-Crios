## 1. Propósito

Construir una matriz de afirmaciones demostrables que separe evidencia ejecutable directa de evidencia parcial, documental o ausente, con foco en el flujo real de CRIOS.

## 2. Alcance

- Repositorio auditado: Proyecto-Crios.
- Universo documental auditado:
  - docs/architecture/CURRENT_GAME_FLOW_BASELINE.md
  - docs/architecture/STATE_OWNERSHIP_MATRIX.md
  - docs/architecture/EVENT_FLOW_MATRIX.md
  - docs/architecture/MISSION_TIMELINE.md
  - docs/architecture/STATE_MUTATION_MAP.md
  - docs/architecture/GAME_TRANSACTIONS.md
  - docs/architecture/FLOW_TRACEABILITY_AUDIT.md
- Universo ejecutable auditado: index.html y todos los .js bajo js/.

## 3. Exclusiones

- No se usa markdown como evidencia ejecutable.
- No se infieren comportamientos runtime no observables estaticamente.
- No se usan nombres de archivo ni comentarios como prueba suficiente.

## 4. Documentos auditados

- CURRENT_GAME_FLOW_BASELINE.md
- STATE_OWNERSHIP_MATRIX.md
- EVENT_FLOW_MATRIX.md
- MISSION_TIMELINE.md
- STATE_MUTATION_MAP.md
- GAME_TRANSACTIONS.md
- FLOW_TRACEABILITY_AUDIT.md

## 5. Código ejecutable inspeccionado

- index.html
- js/config.js
- js/crios.js
- js/datos/taxonomia.js
- js/datos/campanas.js
- js/nucleo/registro-misiones.js
- js/misiones/matematica/geometria/areas/centro-energia.js
- js/misiones/matematica/geometria/areas/invernadero.js
- js/misiones/matematica/geometria/areas/banco-hielo.js
- js/misiones/matematica/geometria/areas/hangar-perforacion.js
- js/escenarios/registro-escenarios.js
- js/escenarios/antartida.js
- js/escenarios/registro-carga.js
- js/release/release-model.js
- js/release/release-validator.js
- js/release/release-factory.js
- js/session/session-model.js
- js/session/session-validator.js
- js/session/session-factory.js
- js/player-state/player-state-validator.js
- js/player-state/player-state-service.js
- js/runtime/runtime-core.js
- js/navigation/navigation-core.js
- js/servicios/campaign-validator.js
- js/publish/publish-service.js
- js/share/share-model.js
- js/share/share-validator.js
- js/share/share-service.js
- js/studio/adapter.js
- js/studio/studio.js
- js/studio/modelo/campaign-draft.js
- js/studio/acciones/campaign-actions.js
- js/studio/render/studio-renderer.js
- js/studio/validacion/campaign-validator.js
- Script inline en index.html (registro automatico de escenario).

## 6. Método

- Se extrajeron afirmaciones atomicas desde los 7 documentos.
- Se contrastaron contra codigo ejecutable con funcion/bloque y lineas exactas.
- Se clasifico nivel de evidencia (E3-E0) y estado.
- Se marcaron contradicciones y limites.
- Se forzo cobertura explicita de los 30 temas criticos.

## 7. Niveles de evidencia

- E3 — Evidencia ejecutable directa: operacion concreta visible en codigo ejecutable con ruta, funcion y lineas.
- E2 — Evidencia ejecutable parcial o indirecta: hay soporte parcial, pero falta cierre de orden, alcance o runtime.
- E1 — Evidencia exclusivamente documental: soporte solo en documentos/nomenclatura.
- E0 — Sin evidencia localizada: no se encontro soporte suficiente.

## 8. Estados de clasificación

- DEMOSTRADA_ESTATICAMENTE
- PARCIALMENTE_DEMOSTRADA
- CONTRADICHA
- NO_DEMOSTRADA
- NO_APLICA

## 9. Reglas para afirmaciones de ausencia

Universo inspeccionado para ausencia:
- index.html
- js/**/*.js del repositorio

Terminos/simbolos buscados para ausencia o completitud:
- gameOver
- go('gameover')
- transmissionQueued
- currentMissionIndex
- currentMissionId
- sessionData.finISO
- sessionData.enviada
- sessionData.evaluacion
- pantallas.shift
- pendingResult

Criterio aplicado:
- Toda afirmacion de ausencia se dejo como PARCIALMENTE_DEMOSTRADA o NO_DEMOSTRADA cuando no puede garantizarse completitud global solo con estatico.

## 10. Inventario de afirmaciones

- total de afirmaciones: 30
- DEMOSTRADA_ESTATICAMENTE: 19
- PARCIALMENTE_DEMOSTRADA: 6
- CONTRADICHA: 3
- NO_DEMOSTRADA: 2
- NO_APLICA: 0
- E3: 19
- E2: 8
- E1: 3
- E0: 0
- requieren runtime: 8
- contradicciones entre documentos: 1
- contradicciones documento-codigo: 2

## 11. Matriz de afirmaciones demostrables

| ID | Afirmación atómica | Fuente documental | Tipo | Evidencia ejecutable | Ubicación exacta | Nivel | Estado | Contradicción o límite | Prueba runtime necesaria |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| DC-001 | El inicio de sesion valida identidad y crea sesion operativa. | EVENT_FLOW_MATRIX.md:L16 | existencia | identifyUser valida campos y llama startSession. | js/crios.js:L641-L665 — identifyUser() — valida inputs y dispara startSession() | E3 | DEMOSTRADA_ESTATICAMENTE | No aplica | No |
| DC-002 | sessionData se construye con estructura base de sesion y misiones. | STATE_OWNERSHIP_MATRIX.md:L16 | mutacion de estado | startSession asigna objeto raiz y poblado de misiones. | js/crios.js:L291-L300 — startSession() — crea sessionData y sessionData.misiones | E3 | DEMOSTRADA_ESTATICAMENTE | No aplica | No |
| DC-003 | La navegacion de pantallas muta estado y renderiza pantalla activa. | EVENT_FLOW_MATRIX.md:L27 | visibilidad en interfaz | go actualiza currentScreen, classes active y hooks map/final. | js/crios.js:L443-L458 — go() — set currentScreen y activa seccion DOM | E3 | DEMOSTRADA_ESTATICAMENTE | No aplica | No |
| DC-004 | Existe mutacion por recorte mediante pantallas.shift(). | FLOW_TRACEABILITY_AUDIT.md:L290 | mutacion de estado | recordScreen limita historial a 80 entradas. | js/crios.js:L305-L308 — recordScreen() — push y shift de sessionData.pantallas | E3 | DEMOSTRADA_ESTATICAMENTE | No aplica | No |
| DC-005 | Abrir mision resuelve id de dominio y navega a mision concreta. | EVENT_FLOW_MATRIX.md:L21 | causalidad | openMission resuelve missionId, renderiza y navega. | js/crios.js:L465-L469 — openMission() — resolveMissionIdUsingDomain + go('mission-*') | E3 | DEMOSTRADA_ESTATICAMENTE | No aplica | No |
| DC-006 | domainSession.currentMissionIndex se sincroniza con missionId activo. | FLOW_TRACEABILITY_AUDIT.md:L292 | propiedad del estado | syncDomainMissionById calcula index y lo asigna. | js/crios.js:L123-L131 — syncDomainMissionById() — asigna currentMissionIndex | E3 | DEMOSTRADA_ESTATICAMENTE | No aplica | No |
| DC-007 | domainSession.progress.currentMissionId se sincroniza en la misma operacion. | FLOW_TRACEABILITY_AUDIT.md:L292 | propiedad del estado | misma funcion asigna progress.currentMissionId. | js/crios.js:L129-L131 — syncDomainMissionById() — asigna progress.currentMissionId | E3 | DEMOSTRADA_ESTATICAMENTE | No aplica | No |
| DC-008 | La evaluacion de respuesta de mision bifurca en correcta/incorrecta. | EVENT_FLOW_MATRIX.md:L24-L26 | orden temporal | validateMissionResult compara valor, muta estado y encola envio. | js/crios.js:L936-L951 — validateMissionResult() — ramas por coincidencia con expected | E3 | DEMOSTRADA_ESTATICAMENTE | No aplica | No |
| DC-009 | sessionData.evaluacion se recrea/reemplaza al cierre final transmitido. | FLOW_TRACEABILITY_AUDIT.md:L293 | persistencia | en envio final se reasigna objeto evaluacion completo. | js/crios.js:L381-L385 — sendSessionUpdate() — crea sessionData.evaluacion | E3 | DEMOSTRADA_ESTATICAMENTE | No aplica | No |
| DC-010 | Tras evaluar respuesta, se integra estado de dominio y se refresca runtime/navigation. | CURRENT_GAME_FLOW_BASELINE.md:L235 | integracion entre subsistemas | applyDomainEvaluationForMission aplica player-state y refresh. | js/crios.js:L160-L177 — applyDomainEvaluationForMission() — applyEvaluation + refreshDomainRuntimeAndNavigation | E3 | DEMOSTRADA_ESTATICAMENTE | No aplica | No |
| DC-011 | transmissionQueued existe para serializar envios concurrentes. | STATE_OWNERSHIP_MATRIX.md:L30 | atomicidad | bandera activa en seccion critica de envio. | js/crios.js:L340-L395 — sendSessionUpdate() — usa transmissionBusy y transmissionQueued | E3 | DEMOSTRADA_ESTATICAMENTE | No aplica | No |
| DC-012 | La expresion transmissionQueued = transmissionQueued || finalized existe literalmente. | FLOW_TRACEABILITY_AUDIT.md:L291 | existencia | asignacion booleana de cola con OR. | js/crios.js:L371-L371 — sendSessionUpdate() — transmissionQueued=transmissionQueued||finalized | E3 | DEMOSTRADA_ESTATICAMENTE | No aplica | No |
| DC-013 | La finalizacion tecnica equivale a cierre transmitido exitoso de extremo a extremo. | EVENT_FLOW_MATRIX.md:L30-L33 | terminalidad | cierre local marca complete/finISO/enviada antes de confirmacion externa verificable. | js/crios.js:L403-L408 — transmitResults() — set finISO/enviada y await sendSessionUpdate(true) | E2 | PARCIALMENTE_DEMOSTRADA | no-cors sin verificacion de procesamiento servidor | Si |
| DC-014 | La finalizacion visible lleva a pantalla de creditos. | EVENT_FLOW_MATRIX.md:L30 | visibilidad en interfaz | rama correcta agenda transicion a credits. | js/crios.js:L507-L519 — validateFinal() — setTimeout(() => go('credits')) | E3 | DEMOSTRADA_ESTATICAMENTE | No aplica | No |
| DC-015 | La finalizacion queda persistida y recuperable tras recarga. | CURRENT_GAME_FLOW_BASELINE.md:L274 | persistencia | se persisten complete/finISO/enviada, pero recuperacion total depende de runtime real de navegador. | js/crios.js:L405-L407 — transmitResults() — persistSession(); sessionStorage.setItem complete en L514 | E2 | PARCIALMENTE_DEMOSTRADA | requiere comprobar recarga real y secuencia de lectura | Si |
| DC-016 | La continuidad se restaura en la misma cadena de evaluacion si no puede continuar. | CURRENT_GAME_FLOW_BASELINE.md:L287 | recuperacion | applyEvaluation + canContinue + restore en misma funcion. | js/crios.js:L166-L175 — applyDomainEvaluationForMission() — restorePlayerState inmediato | E3 | DEMOSTRADA_ESTATICAMENTE | No aplica | No |
| DC-017 | Existe estado/ramo tecnico gameOver en dominio de jugador. | CURRENT_GAME_FLOW_BASELINE.md:L449 | existencia | applyEvaluation setea status gameOver cuando vidas llegan a 0. | js/player-state/player-state-service.js:L30-L33 — applyEvaluation() — status = gameOver/running | E3 | DEMOSTRADA_ESTATICAMENTE | No aplica | No |
| DC-018 | No existe una rama visible dedicada de gameOver para usuario final. | CURRENT_GAME_FLOW_BASELINE.md:L456 | ausencia de camino alternativo | no hay pantalla gameOver ni go('gameover') en flujo principal observado. | index.html:L262-L370 — secciones visibles (map/final/credits) sin seccion gameover; js/crios.js:L443-L458 — go() sin rama gameover dedicada | E2 | PARCIALMENTE_DEMOSTRADA | afirmacion de ausencia no puede cerrarse con completitud absoluta solo estatico | Si |
| DC-019 | El ownership del progreso esta distribuido entre memoria activa y storage. | STATE_MUTATION_MAP.md:L66 | propiedad u ownership | save/progreso de campania escribe campaignProgress y progress. | js/crios.js:L203-L216 — establecerCampanaActiva() writeJson progress/campaignProgress; js/crios.js:L474-L474 — save() | E3 | DEMOSTRADA_ESTATICAMENTE | No aplica | No |
| DC-020 | El ownership de mision actual convive en varios clusters legacy/dominio. | STATE_MUTATION_MAP.md:L67 | propiedad u ownership | coexisten currentScreen, missionOpenedAt y dominio; coherencia total requiere ejecucion completa. | js/crios.js:L443-L469 — go()/openMission(); js/crios.js:L129-L130 — syncDomainMissionById() | E2 | PARCIALMENTE_DEMOSTRADA | falta prueba integrada extremo a extremo con todos clusters | Si |
| DC-021 | El ownership de cierre final convive en complete + final.answerCorrect + finISO + enviada. | STATE_MUTATION_MAP.md:L68 | propiedad u ownership | codigo muta todas las piezas del cluster de cierre. | js/crios.js:L508-L516 — validateFinal(); js/crios.js:L405-L407 y L382-L384 — transmitResults()/sendSessionUpdate() | E3 | DEMOSTRADA_ESTATICAMENTE | No aplica | No |
| DC-022 | La transaccion de resolver mision es atomica segun la documentacion. | GAME_TRANSACTIONS.md:L70-L94 | atomicidad | hay pasos multipunto con persistencias y timer; interrupciones dejan parciales. | js/crios.js:L936-L951 — validateMissionResult(); js/crios.js:L399-L400 — debounce envio | E2 | CONTRADICHA | documento admite interrupcion parcial; codigo no implementa commit atomico unico | No |
| DC-023 | El flujo tiene interrupciones y retornos tempranos explicitos. | GAME_TRANSACTIONS.md:L93-L94 | recuperacion | guard clauses y catches en envio/evaluacion. | js/crios.js:L160-L165 — applyDomainEvaluationForMission() early returns; js/crios.js:L411-L424 — sendExitSnapshot() fallback | E3 | DEMOSTRADA_ESTATICAMENTE | No aplica | No |
| DC-024 | Callbacks, promesas, timers y tareas diferidas participan del flujo principal. | EVENT_FLOW_MATRIX.md:L32-L36 | orden temporal | Promise chain, fetch async/await, setTimeout y listeners estan presentes; completitud temporal requiere runtime. | js/crios.js:L59-L68 — ensureDomainModulesLoaded(); js/crios.js:L399-L400 y L518 — setTimeout; js/crios.js:L1054-L1057 — listeners | E2 | PARCIALMENTE_DEMOSTRADA | orden real depende del scheduler/event loop del navegador | Si |
| DC-025 | Existen caminos de recuperacion de persistencia y red. | EVENT_FLOW_MATRIX.md:L34-L37 | recuperacion | pendingResult se reintenta en online/inicio y se limpia en exito/reset. | js/crios.js:L428-L435 — retryPendingResult(); js/crios.js:L537-L546 — resetProgress() removeItem | E3 | DEMOSTRADA_ESTATICAMENTE | No aplica | No |
| DC-026 | La persistencia real coincide totalmente con la persistencia documentada. | CURRENT_GAME_FLOW_BASELINE.md:L211-L227 | persistencia | hay diferencias de representacion pendingResult (objeto JSON vs string raw) y caminos distintos. | js/crios.js:L390-L390 — writeJson(localStorage,pendingResult,payload); js/crios.js:L424-L424 — localStorage.setItem(pendingResult, raw) | E2 | CONTRADICHA | modelo de persistencia no es univoco en todos los caminos | No |
| DC-027 | No hay contradicciones entre documentos de arquitectura. | FLOW_TRACEABILITY_AUDIT.md:L289-L293 | ausencia de camino alternativo | un documento explicita mutaciones omitidas por otro, por lo que hay contradiccion documental. | docs/architecture/FLOW_TRACEABILITY_AUDIT.md:L289-L293 — mutaciones no registradas; docs/architecture/STATE_MUTATION_MAP.md:L55-L63 — mapa incompleto | E1 | CONTRADICHA | contradiccion detectada entre documentos | No |
| DC-028 | No hay contradicciones entre documentos y codigo en todos los temas auditados. | CURRENT_GAME_FLOW_BASELINE.md:L524 | afirmacion global de completitud | hay evidencia fuerte parcial, pero sin prueba runtime global ni barrido exhaustivo de todos caminos. | js/crios.js (multiples rangos auditados) + docs auditados | E1 | NO_DEMOSTRADA | afirmacion global no cerrable solo con estatico parcial | Si |
| DC-029 | Hay dependencias de integracion que solo pueden cerrarse en runtime. | FLOW_TRACEABILITY_AUDIT.md:L304-L305 | integracion entre subsistemas | coexisten clusters y asincronia; la coherencia final requiere ejecucion de escenarios. | js/crios.js:L129-L130, L443-L469, L1038-L1057 — sincronizacion dominio + UI + listeners | E2 | PARCIALMENTE_DEMOSTRADA | requiere pruebas de carrera, offline/online y recarga | Si |
| DC-030 | Las afirmaciones globales de completitud documental implican garantia del comportamiento real. | FLOW_TRACEABILITY_AUDIT.md:L285-L287 | afirmacion global de completitud | la documentacion sola no garantiza runtime correcto ni exhaustividad de caminos. | Evidencia ejecutable insuficiente para garantia total de completitud | E1 | NO_DEMOSTRADA | completitud global excede prueba estatica disponible | Si |

## 12. Flujo de inicio y navegación

- Inicio de sesion: identifyUser valida identidad y dispara startSession + sendSessionUpdate(false).
- Construccion de sesion: startSession inicializa sessionData/sessionStats/progress y reconstruye dominio.
- Navegacion: go() registra pantalla, alterna clase active y desencadena updateMap/renderFinal segun id.
- Apertura de mision: openMission usa resolveMissionIdUsingDomain y registra missionOpenedAt.

## 13. Misión actual y progreso

- Mision actual en dominio:
  - syncDomainMissionById muta currentMissionIndex y progress.currentMissionId.
  - runtime-core y navigation-core exigen coherencia indice/id.
- Progreso:
  - validateMissionResult correcta: progress[id]=true, completed=true, timeMs acumulado.
  - save() persiste progress y campaignProgress.

## 14. Evaluación e integración

- Evaluacion de mision:
  - validateMissionResult bifurca correcta/incorrecta.
  - applyDomainEvaluationForMission integra player-state y refresh runtime/navigation.
- Evaluacion final:
  - validateFinalProcedure y validateFinal mutan sessionData.final.*.
  - sendSessionUpdate(true) recrea sessionData.evaluacion.

## 15. Finalización y gameOver

- Finalizacion tecnica:
  - validateFinal marca complete.
  - transmitResults marca finISO/enviada y dispara envio final.
- Finalizacion visible:
  - setTimeout(go('credits')).
- gameOver:
  - existe tecnicamente en player-state-service.
  - se restaura continuidad por restorePlayerState cuando canContinue es false.
  - no se observo pantalla dedicada de gameOver en el flujo UI principal.

## 16. Persistencia y recuperación

- Persistencia principal:
  - sessionStorage: progress, campaignProgress, sessionStats, sessionData, complete, identidad.
- Recuperacion red:
  - fallback a pendingResult local en fallo de envio.
  - retryPendingResult al iniciar y al evento online.
  - sendExitSnapshot en pagehide/visibility hidden.
- Recuperacion por reinicio:
  - resetProgress limpia storage y estado en memoria.

## 17. Ownership y mutaciones

- Cluster progreso: progress + progresosCampanas + sessionStorage.
- Cluster mision actual: currentScreen + missionOpenedAt + domainSession.progress.currentMissionId + runtime/navigation.
- Cluster cierre: complete + sessionData.final.answerCorrect + sessionData.finISO + sessionData.enviada.
- Mutaciones destacadas:
  - pantallas.shift.
  - transmissionQueued OR finalized.
  - recreacion de sessionData.evaluacion en cierre final.

## 18. Atomicidad, interrupciones y asincronía

- No hay transaccion ACID unica para "resolver mision"; hay pasos y persistencias parciales.
- Hay retornos tempranos y manejo de errores en rutas criticas.
- Asincronia relevante:
  - Promesas de carga de dominio.
  - fetch async/await para telemetria.
  - timers (debounce, transiciones) y listeners de ciclo de vida.

## 19. Contradicciones y vacíos

- Contradicciones entre documentos: 1
  - Omisiones de mutaciones reportadas en FLOW_TRACEABILITY_AUDIT frente a mapas previos.
- Contradicciones documento-codigo: 2
  - Atomicidad documental no cerrada por una operacion atomica real.
  - Persistencia "totalmente coherente" contradicha por representaciones distintas de pendingResult.
- Vacios de evidencia:
  - Garantias globales de completitud y ausencia total de caminos alternativos.
  - Cierre de integracion extremo a extremo requiere runtime.
- Conteos de control:
  - total de afirmaciones: 30
  - DEMOSTRADA_ESTATICAMENTE: 19
  - PARCIALMENTE_DEMOSTRADA: 6
  - CONTRADICHA: 3
  - NO_DEMOSTRADA: 2
  - NO_APLICA: 0
  - E3: 19
  - E2: 8
  - E1: 3
  - E0: 0
  - afirmaciones que requieren runtime: 8
  - contradicciones entre documentos: 1
  - contradicciones documento-codigo: 2

## 20. Veredicto y próximo experimento runtime

- Veredicto: BASE_ESTATICA_SUFICIENTE_PARA_DISENAR_EXPERIMENTO_RUNTIME
- Justificacion breve:
  - Hay evidencia E3 suficiente para mapear puntos de control, mutaciones y transiciones clave.
  - Persisten limites E2/E1 en ausencia, completitud global y sincronizacion real de subsistemas.
  - El siguiente paso debe ser experimento runtime dirigido (sin ejecutarlo en este flujo) para cerrar causalidad temporal y consistencia extremo a extremo.