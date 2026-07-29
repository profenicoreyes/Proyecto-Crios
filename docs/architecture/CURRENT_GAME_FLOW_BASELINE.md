# CURRENT_GAME_FLOW_BASELINE

## 1) Fecha y commit analizado

- Fecha de analisis: 2026-07-23
- Rama: `main`
- Commit: `6243979e6216eac496f4a4bb28722d3a64dda45a`

## 2) Estado de Git previo al sprint

- Working tree previo: sucio (cambios preexistentes detectados antes de este sprint).
- Evidencia previa (`git status --short`):
  - `M index.html`
  - `M js/crios.js`
  - `?? SPRINT_F1-004_REPORT.md`
  - `?? WORKFLOW.md`
  - `?? css/studio.css`
  - `?? docs/`
  - `?? js/escenarios/`
  - `?? js/navigation/`
  - (y otros no atribuibles a este sprint)

## 3) Estructura relevante del repositorio

- Entradas UI:
  - `index.html` (juego alumno)
  - `studio/index.html` (CRIOS Studio)
- Estilos:
  - `css/crios.css`
  - `css/studio.css`
- Runtime legado y orquestacion observable:
  - `js/crios.js`
- Config:
  - `js/config.js`
- Datos:
  - `js/datos/campanas.js`
  - `js/datos/taxonomia.js`
- Registro de misiones:
  - `js/nucleo/registro-misiones.js`
- Misiones:
  - `js/misiones/matematica/geometria/areas/*.js`
- Escenarios:
  - `js/escenarios/registro-escenarios.js`
  - `js/escenarios/antartida.js`
  - `js/escenarios/registro-carga.js`
- Dominio modular cargado dinamicamente:
  - `js/release/*`
  - `js/session/*`
  - `js/player-state/*`
  - `js/runtime/*`
  - `js/navigation/*`
- Dominio usado por Studio:
  - `js/publish/*`
  - `js/share/*`
- Studio:
  - `js/studio/*`
  - `js/servicios/campaign-validator.js`
- Documentacion base:
  - `docs/*.md`

## 4) Entry points

### Juego alumno

- Archivo: `index.html`
- Script final que arranca flujo principal: `js/crios.js`
- `js/crios.js` ejecuta bootstrap inmediato via IIFE.

### Studio

- Archivo: `studio/index.html`
- Script de bootstrap: `../js/studio/studio.js`
- No gobierna el flujo de partida del alumno.

## 5) Orden de carga

### Orden estatico en `index.html`

1. `js/escenarios/registro-escenarios.js`
2. `js/escenarios/antartida.js`
3. inline script de registro/activacion de escenario
4. `js/config.js`
5. `js/datos/taxonomia.js`
6. `js/datos/campanas.js`
7. `js/nucleo/registro-misiones.js`
8. scripts de misiones (4 archivos)
9. `js/crios.js`

### Carga dinamica desde `js/crios.js`

`ensureDomainModulesLoaded()` inyecta en este orden:

1. `js/release/release-model.js`
2. `js/release/release-validator.js`
3. `js/release/release-factory.js`
4. `js/session/session-model.js`
5. `js/session/session-validator.js`
6. `js/session/session-factory.js`
7. `js/player-state/player-state-validator.js`
8. `js/player-state/player-state-service.js`
9. `js/runtime/runtime-core.js`
10. `js/navigation/navigation-core.js`

## 6) Flujo directo completo

### BOOT

1. `bootstrapCrios()` (IIFE, `js/crios.js`) crea estado en memoria:
   - `campanaActiva`, `misionesActivas`, `missionIds`
   - `progress`, `sessionStats`, `sessionData`, `missionData`
   - estado de dominio: `domainReady`, `domainRelease`, `domainSession`, `domainRuntime`, `domainNavigation`
2. Lee persistencia:
   - `sessionStorage[campaignId]`
   - `sessionStorage[campaignProgress]`
   - `sessionStorage[progress]` legado
3. `inicializarCampana()`:
   - resuelve campania solicitada/publicada
   - fallback a `CAMPANA_INICIAL_ID`
   - levanta misiones activas por campania
   - escribe `campaignId` y `campaignProgress`
4. Inicializa UI base:
   - `setupMissionUI()`
   - `actualizarCabeceraCampana()`
   - `renderCampaignSelector()`
   - `updateMap()`
5. Inicializa identidad/grupos y red:
   - `loadUserName()`
   - `loadGroups()`
   - `retryPendingResult()`
   - listeners `online`, `pagehide`, `visibilitychange`
6. Inicia carga dinamica de dominio:
   - `ensureDomainModulesLoaded().then(() => { domainReady = true; rebuildDomainStateForActiveCampaign(); })`

### Recuperacion o creacion de partida

- Si hay identidad guardada, se precarga formulario y bloque de bienvenida.
- El alta real de partida ocurre en `identifyUser()`:
  1. valida nombre real, personaje y grupo
  2. persiste identidad (`realName`, `groupName`, `characterName`)
  3. `startSession(realName, characterName, groupName)`
  4. envio incremental inicial `sendSessionUpdate(false)`
  5. `ensureMissionData()` para variantes

### Pantalla inicial o mapa

- Flujo visual inicia en `intro`.
- `activateIntro()` (pointer/keyboard) transiciona a `aria`.
- Desde narrativa, se llega a `reveal`.
- Desde `reveal`, tras identidad confirmada, usuario abre selector (`abrirSelectorCampanas`) y luego `seleccionarCampana(id)` puede navegar a `map`.

### Seleccion y apertura de mision

1. `openMission(id)`:
   - resuelve id coherente con dominio: `resolveMissionIdUsingDomain(id)`
   - renderiza contenido: `renderMission(resolvedId)`
   - marca inicio temporal: `missionOpenedAt[id]=Date.now()`
   - navega: `go('mission-'+id)`

### Interaccion del jugador y envio de respuesta

#### Procedimiento

- `validateProcedure(id)`:
  - incrementa `sessionStats[id].procedureAttempts`
  - guarda `sessionData.misiones[id].procedure`
  - evalua expresion (`safeEvaluate`) y uso de datos esenciales
  - actualiza `procedureCorrect`
  - habilita/deshabilita paso de resultado
  - `queueSessionUpdate()`

#### Resultado de mision

- `validateMissionResult(id)`:
  - incrementa `sessionStats[id].attempts`
  - guarda respuesta en `sessionData.misiones[id]`
  - compara con `expected`
  - bifurcacion:
    - Correcta:
      - `applyDomainEvaluationForMission(id,true)`
      - `progress[id]=true`
      - `sessionStats[id].completed=true`
      - acumula `timeMs`
      - `save()` (persistencia + render mapa)
      - `setTimeout(go('map'))`
    - Incorrecta:
      - `applyDomainEvaluationForMission(id,false)`
      - `answerCorrect=false`
  - `queueSessionUpdate()`

### Evaluacion final

1. `go('final')` llama `renderFinal()`.
2. `validateFinalProcedure()`:
   - valida expresion final y datos esenciales
   - habilita paso de resultado final
3. `validateFinal()`:
   - compara contra `getFinalExpected()`
   - Correcta:
     - marca `sessionData.final.answerCorrect=true`
     - `sessionStorage[complete]='true'`
     - `renderEvaluationSummary()`
     - `transmitResults()` (cierre + envio final)
     - `go('credits')` diferido
   - Incorrecta:
     - feedback de error
     - `queueSessionUpdate()`

### Persistencia

- Sesion y progreso:
  - `sessionStorage`: `campaignId`, `campaignProgress`, `progress`, `sessionStats`, `sessionData`, identidad
- Resultado pendiente:
  - `localStorage[pendingResult]`
- Red:
  - `sendSessionUpdate(false/true)` por `fetch`
  - snapshot de salida: `sendExitSnapshot()` con `sendBeacon`/`fetch`

### Regreso al mapa y desbloqueo

- `updateMap()` calcula completadas vs total y habilita `finalBtn` cuando `done === total`.
- `save()` refresca mapa y selector tras mision correcta.
- `go('map')` se usa tanto manualmente como tras mision correcta.

### Final del juego

- Condicion observable: `validateFinal()` correcta.
- Efecto: creditos + estado transmitido/finalizado en `sessionData`.

### Manejo de errores o estados invalidos

- Tecnicos (try/catch + warn + fallback):
  - parseo JSON en almacenamiento
  - carga de modulos dominio
  - resolucion de mision via dominio
  - evaluacion PlayerState
  - envio de red
  - carga de grupos
- Estados invalidos con excepcion directa:
  - mision inexistente (`obtenerMision`)
  - campania inicial no publicada/ausente (`inicializarCampana`)
  - validaciones estrictas en dominio modular (`release/session/runtime/navigation/player-state validators`)

## 7) Flujo inverso completo

### A) Desde pantalla de resultado (`credits`)

- `go('credits')` se dispara solo por `validateFinal()` correcta (setTimeout).
- `validateFinal()` correcta exige:
  - entrada numerica final igual a `getFinalExpected()`
  - `getFinalExpected()` depende de `missionData` generado con identidad
  - `missionData` depende de `ensureMissionData()` y `missionIds` de campania activa
  - `missionIds` depende de campania seleccionada/inicializada

### B) Desde progreso persistido por mision (`sessionStorage[campaignProgress]`)

- Escritura en `save()` y en `establecerCampanaActiva()`.
- `save()` solo se alcanza por rama correcta de `validateMissionResult()`.
- Por lo tanto, un progreso marcado implica:
  - hubo mision abierta
  - hubo respuesta evaluada correcta
  - se ejecuto persistencia y rerender de mapa

### C) Desde estado final de mision (`sessionData.misiones[id]` + `sessionStats[id]`)

- Es producido por:
  - `validateProcedure(id)` para procedimiento y bandera de validez
  - `validateMissionResult(id)` para respuesta final y completitud
  - `registerHint(id)` para uso de pista
- Prerrequisitos:
  - `sessionData` existente (sesion iniciada)
  - `missionData[id]` disponible
  - interaccion de usuario en pantalla de mision

### D) Desde estado final de juego (`sessionData.finISO`, `sessionData.enviada`, `sessionData.evaluacion`)

- Es producido por `sendSessionUpdate(true)` llamado por `transmitResults()`.
- `transmitResults()` se llama solo desde rama correcta de `validateFinal()`.
- Condiciones previas:
  - respuesta final correcta
  - sesion en curso
  - capacidad de construir payload (`buildPayload`)

### Contraste directo vs inverso

- Coherencia general: alta; los estados terminales retrotraen al flujo directo esperado.
- Observacion relevante:
  - `playerState` puede marcar `gameOver`, pero en la integracion actual se restaura continuidad inmediatamente (`restorePlayerState`) cuando no puede continuar; no emerge un flujo visible de game over en UI.

## 8) Tabla de funciones principales

| Funcion | Archivo | Invocada por | Lee | Escribe | Efectos | Siguiente |
|---|---|---|---|---|---|---|
| `inicializarCampana` | `js/crios.js` | bootstrap IIFE | campanias, storage | campania activa, missionIds, storage | puede lanzar error si no hay publicada | init UI |
| `establecerCampanaActiva` | `js/crios.js` | `seleccionarCampana` | campania + progreso guardado | campania, misiones, progress, sessionData | render selector/mapa, opcional `go('map')` | flujo mapa |
| `go` | `js/crios.js` | botones y flujo interno | id pantalla, estado sesion | `currentScreen`, registro de pantallas | activa pantalla DOM, `updateMap`/`renderFinal` segun caso | segun pantalla |
| `openMission` | `js/crios.js` | boton modulo | id mision, dominio opcional | `missionOpenedAt` | render mision + navegacion pantalla | interaccion mision |
| `validateProcedure` | `js/crios.js` | boton verificar | input DOM, `missionData` | `sessionStats`, `sessionData` | feedback DOM, habilita resultado | `validateMissionResult` |
| `validateMissionResult` | `js/crios.js` | boton ejecutar reparacion | input DOM, esperado | `sessionStats`, `sessionData`, `progress` | feedback, `save`, retorno mapa diferido | `go('map')` o reintento |
| `save` | `js/crios.js` | rama correcta mision | `progress` | `campaignProgress`, `progress` | rerender mapa/selector | mapa |
| `validateFinalProcedure` | `js/crios.js` | boton verificar final | expresion final + datos | `sessionData.final` | feedback DOM, desbloquea resultado final | `validateFinal` |
| `validateFinal` | `js/crios.js` | boton estabilizar | respuesta final + esperado | `sessionData.final`, `complete` | creditos, sonido, envio final | cierre |
| `sendSessionUpdate` | `js/crios.js` | cola + cierre final | sessionData + endpoint | sessionData final/pending | red `fetch`, estado envio, fallback local | continua o reintenta |
| `retryPendingResult` | `js/crios.js` | init + `online` | `localStorage.pendingResult` | limpia pending si envia | red | sincronia pendiente |
| `resetProgress` | `js/crios.js` | boton usuario | confirm + storage | borra estado en memoria y storage | vuelve a reveal, recarga grupos | nueva sesion |

## 9) Matriz de responsabilidades

| Area | Archivos responsables | Responsabilidades actuales | Superposiciones | Dependencias entrantes | Dependencias salientes | Riesgo |
|---|---|---|---|---|---|---|
| Bootstrap | `index.html`, `js/crios.js` | arranque, init estado y UI | mezcla init dominio + UI + red | scripts estaticos | dominio dinamico, storage, DOM | Alto |
| Navegacion | `js/crios.js`, `js/navigation/navigation-core.js` | cambio pantallas, mision actual coherente | navegacion UI + navegacion dominio coexistiendo | UI onclick | runtime/session/release + DOM | Alto |
| Flujo del juego | `js/crios.js` | orquesta partida completa | eval + persist + render en mismas rutas | UI eventos | misiones, storage, red, dominio | Alto |
| Estado | `js/crios.js`, `js/session/*` | estado legacy y estado dominio paralelo | `progress` legacy vs `domainSession.progress` | bootstrap/acciones usuario | validadores, runtime/navigation | Alto |
| Evaluacion | `js/crios.js`, `js/player-state/*` | evaluacion matematica + consecuencias de vidas | evaluacion y consecuencia acopladas en flujo | input usuario | player-state, persistencia, render | Alto |
| Misiones | `js/nucleo/registro-misiones.js`, `js/misiones/*` | datos, generacion variante, contenido | render consumido directo por flujo | campania activa | DOM via `renderMission` | Medio |
| Progreso | `js/crios.js` | completitud por mision y desbloqueo final | progreso en varios contenedores | resultados de mision | storage + mapa + selector | Alto |
| Persistencia | `js/crios.js`, `js/config.js` | lectura/escritura session/local storage + red | persistencia y telemetria unidas | todos los eventos clave | fetch/sendBeacon/storage | Alto |
| Renderizado | `js/crios.js`, `index.html`, `css/*` | manipula clases/innerHTML/textos | render y reglas de negocio mezcladas | estado de juego | DOM completo | Alto |
| Audio | `js/crios.js` | ambiente, clicks, feedback | acoplado a navegacion y eventos de juego | interacciones | WebAudio API | Medio |
| Telemetria | `js/crios.js` | payload incremental/final, reintentos | se cruza con persistencia y cierre | cambios de estado/pantalla | endpoint remoto | Medio |
| Errores | `js/crios.js`, `js/*validator*` | try/catch con fallback + throw en validadores | errores tecnicos y de negocio conviven | todos los modulos | consola/UI feedback | Medio |

## 10) Estado compartido y variables globales

### Estado mutable principal (`js/crios.js`)

- `campanaActiva`, `campanaActivaId`, `misionesActivas`, `missionIds`
- `progresosCampanas`, `progress`
- `sessionStats`, `sessionData`, `missionData`
- `currentScreen`, `hintRegistered`, `missionOpenedAt`
- colas/transmision: `progressSendTimer`, `transmissionBusy`, `transmissionQueued`
- audio: `audioCtx`, `suspenseRunning`, etc.

### Exposiciones globales

- `Object.assign(window, publicApi)`:
  - `go`, `openMission`, `validateProcedure`, `validateMissionResult`, `registerHint`, `validateFinalProcedure`, `validateFinal`, `resetProgress`, `identifyUser`, `loadGroups`, `toggleFullscreen`, `toggleAmbientAudio`, `abrirSelectorCampanas`, `seleccionarCampana`, `detalleCampana`
- `window.CRIOS` (API de consulta)
- `window.CRIOS_DOMAIN` (registro de contratos dominio)
- `window.__CRIOS_REGISTER_DOMAIN_MODULE__` (temporal durante carga dinamica)
- `globalThis.REGISTRO_ESCENARIOS`, `globalThis.ESCENARIO_ANTARTIDA`

## 11) Dependencias entre modulos

- `js/crios.js` depende de:
  - config (`CRIOS_CONFIG`)
  - datos (`obtenerCampanaPorId`, `listarCampanas`)
  - registro de misiones (`REGISTRO_MISIONES`)
  - dominio modular via `window.CRIOS_DOMAIN`
  - DOM/browser APIs
- `runtime-core` depende de `releaseValidator`, `sessionValidator`, `releaseModel`.
- `navigation-core` depende de `runtimeCore`, `releaseValidator`, `releaseModel`.
- `player-state-service` depende de `player-state-validator`.
- `player-state-validator` depende de `session-validator` y `session-model`.

### Ciclos potenciales

- No se observa ciclo directo confirmado `runtime <-> navigation` a nivel import/llamada mutua.
- Existe acoplamiento indirecto fuerte por registro global `window.CRIOS_DOMAIN` y carga ordenada por strings de ruta.

## 12) Persistencia

### SessionStorage

- Claves (`js/config.js`):
  - `crios-progress-v2`
  - `crios-complete-v2`
  - `crios-user-name`
  - `crios-character-name`
  - `crios-group-name`
  - `crios-session-stats`
  - `crios-session-data`
  - `crios-campana-activa`
  - `crios-progreso-campanas-v1`

### LocalStorage

- `crios-pending-result` para payload pendiente de envio.

### Red

- `sendSessionUpdate(false)` incremental.
- `sendSessionUpdate(true)` final.
- `sendExitSnapshot()` en `pagehide`/`visibilitychange(hidden)`.
- `retryPendingResult()` al iniciar y al volver online.

## 13) Evaluacion

### Evaluacion de mision

- `validateProcedure(id)`:
  - parseo/normalizacion de expresion
  - equivalencia numerica
  - uso de datos esenciales
- `validateMissionResult(id)`:
  - comparacion numerica final
  - actualizacion de progreso en caso correcto

### Consecuencias de jugador

- `applyDomainEvaluationForMission(id,isCorrect)` usa `playerStateService.applyEvaluation`.
- Si no puede continuar, ejecuta `restorePlayerState` inmediatamente.

### Evaluacion final

- `validateFinalProcedure()` + `validateFinal()`
- `calculateEvaluation()` produce score/grade/feedback para payload y resumen.

## 14) Navegacion

- Navegacion de pantallas: `go(id)` (DOM class `active`)
- Accesos clave:
  - intro -> aria -> record1 -> record2 -> reveal
  - reveal -> campanas -> map
  - map -> mission-* / final
  - final -> credits
- Navegacion de dominio:
  - `resolveMissionIdUsingDomain`
  - `createNavigation`/`currentMissionId` en `navigation-core`

## 15) Manejo de errores

### Errores tecnicos

- Capturados con fallback:
  - JSON parse/storage read/write
  - carga de modulos dinamicos
  - fetch de grupos
  - envio telemetria
  - `sendBeacon` fallback

### Errores de validacion de dominio

- Validadores lanzan excepciones con mensajes estrictos:
  - release/session/runtime/navigation/player-state

### Errores de juego (feedback al alumno)

- No se lanzan excepciones; se devuelven mensajes UI en `.feedback`.

## 16) Riesgos

1. Orquestacion centralizada en `js/crios.js` con alta mezcla de responsabilidades.
2. Doble estado de progreso/sesion (legacy + dominio) con sincronizacion manual.
3. Acoplamiento global por `window` y orden de carga dinamica por ruta string.
4. Mutacion directa extensa de estado compartido en multiples funciones.
5. Uso de `Function(...)` para evaluar expresiones (controlado por sanitizacion, pero sensible).
6. Persistencia y telemetria acopladas al flujo de UI.
7. Estado `gameOver` del dominio no se materializa como flujo visible (restauracion inmediata).

## 17) Contradicciones encontradas

1. Contradiccion funcional interna de flujo de continuidad:
   - La capa de consecuencias puede marcar `gameOver`.
   - En la integracion actual, si no puede continuar, se restaura inmediatamente el estado (`restorePlayerState`).
   - Resultado: existe transicion tecnica a `gameOver`, pero no hay rama visible dedicada de game over en UI/persistencia como estado terminal de partida.

2. No se detectaron contradicciones directas entre trazado directo e inverso sobre creditos/progreso/persistencia: ambos trazados son coherentes con el codigo.

## 18) Puntos futuros de integracion

### Opcion 1: creacion durante bootstrap

- Ventajas: control temprano del flujo.
- Riesgos: toca ruta critica de arranque.
- Archivos afectados: `js/crios.js`.
- Integracion pasiva: media.
- Reversion: media.

### Opcion 2: instancia global

- Ventajas: acceso simple desde handlers actuales.
- Riesgos: amplia superficie global y acoplamiento.
- Archivos afectados: `js/crios.js`.
- Integracion pasiva: alta.
- Reversion: alta.

### Opcion 3: instancia dentro de runtime

- Ventajas: cerca del dominio de navegacion/sesion.
- Riesgos: runtime actual es contrato validado, no orquestador UI.
- Archivos afectados: `js/runtime/*`, `js/crios.js`.
- Integracion pasiva: baja.
- Reversion: baja.

### Opcion 4: instancia controlada por composition root

- Ventajas: punto unico de composicion; aisla wiring.
- Riesgos: requiere introducir capa de ensamblaje en bootstrap.
- Archivos afectados: `js/crios.js` (y nuevo contenedor en fase posterior).
- Integracion pasiva: alta.
- Reversion: alta.

### Opcion 5: integracion progresiva mediante adaptadores

- Ventajas: reemplazo por tramos sin romper handlers.
- Riesgos: convivencia temporal de caminos duales.
- Archivos afectados: `js/crios.js` + adaptadores futuros.
- Integracion pasiva: alta.
- Reversion: alta.

### Opcion 6: sustitucion gradual de funciones existentes

- Ventajas: control por feature slice.
- Riesgos: riesgo de duplicar orquestacion durante migracion.
- Archivos afectados: `js/crios.js`.
- Integracion pasiva: media.
- Reversion: media.

## 19) Estrategia recomendada

- Estrategia unica recomendada: **composition root en bootstrap + integracion progresiva por adaptadores**.
- Base en codigo real observado:
  - hoy el orquestador real esta concentrado en `js/crios.js`;
  - existe API publica de acciones y contratos de dominio cargados dinamicamente;
  - un punto de composicion permite inyeccion pasiva sin romper rutas de UI existentes;
  - adaptadores permiten revertir ruta por ruta sin renombrar ni sustituir todo de una vez.

## 20) Mejoras reales detectadas

### Necesarias antes del futuro orquestador

1. Trazabilidad unica de propietario de estado de progreso durante migracion (evitar doble fuente activa simultanea).
2. Inventario verificable de mutaciones de `sessionData/progress/sessionStats` por evento de UI.

### Convenientes durante la integracion

1. Encapsular llamadas de persistencia y telemetria en frontera unica de uso (sin cambiar comportamiento).
2. Instrumentar trazas de flujo (solo observabilidad) para validar equivalencia entre rutas legacy y nuevas.

### Postergables

1. Consolidacion de mensajes UI y catalogo de errores de juego.
2. Reduccion de acoplamiento de audio respecto de navegacion.

### Innecesarias en este sprint

- Cambios esteticos, renombres, refactor de misiones o cambios de dependencia.

## 21) Pruebas y comandos ejecutados

- `git rev-parse --abbrev-ref HEAD` -> `main`
- `git rev-parse HEAD` -> `6243979e6216eac496f4a4bb28722d3a64dda45a`
- `git status --short` -> working tree sucio previo
- `Test-Path package.json` -> `False`
- `Get-ChildItem -Recurse -File | Where-Object { $_.Name -match "test" -or $_.Name -match "spec" }` -> sin tests detectados
- `node -v` -> comando no disponible en entorno
- verificacion de `index.html` como entrypoint -> confirmado

## 22) Limitaciones del analisis

1. No se pudo ejecutar chequeo sintactico con Node por ausencia de `node` en el entorno.
2. No se ejecutaron suites de tests porque no existen archivos de test detectables y no hay `package.json`.
3. No se ejecuto servidor de desarrollo/build por tratarse de app estatica sin herramienta de build declarada.
4. El analisis funcional se realizo por inspeccion de codigo ejecutable y trazado de flujo.

## 23) Lista exacta de archivos modificados

- `docs/architecture/CURRENT_GAME_FLOW_BASELINE.md`
  - Motivo: documentacion tecnica de baseline solicitada por el sprint.
