# FLOW_TRACEABILITY_AUDIT

## 1) Objetivo, alcance y metodo

Objetivo: auditar trazabilidad real del flujo de juego contra codigo ejecutable actual y contrastar afirmaciones de estos documentos (sin modificarlos):
- docs/architecture/CURRENT_GAME_FLOW_BASELINE.md
- docs/architecture/STATE_OWNERSHIP_MATRIX.md
- docs/architecture/EVENT_FLOW_MATRIX.md
- docs/architecture/MISSION_TIMELINE.md
- docs/architecture/STATE_MUTATION_MAP.md
- docs/architecture/GAME_TRANSACTIONS.md

Reglas aplicadas:
- Toda evidencia usa ruta exacta, funcion/bloque exacto y rango de lineas.
- No se marca VERIFICADO solo por busqueda textual; se exige lectura de funcion y coherencia de flujo.
- Si una afirmacion no puede probarse con evidencia exacta, se clasifica INFERENCIA NO DEMOSTRADA.
- Clasificaciones usadas: VERIFICADO, PARCIAL, NO ENCONTRADO, CONTRADICCION, INFERENCIA NO DEMOSTRADA.

## 2) Estado previo

Resultado Git previo (git status --short):
- M index.html
- M js/crios.js
- ?? SPRINT_F1-004_REPORT.md
- ?? WORKFLOW.md
- ?? css/studio.css
- ?? docs/
- ?? js/escenarios/
- ?? js/navigation/
- ?? js/player-state/
- ?? js/publish/
- ?? js/release/
- ?? js/runtime/
- ?? js/servicios/
- ?? js/session/
- ?? js/share/
- ?? js/studio/
- ?? studio/

Evidencia SHA-256 inicial obligatoria (timestamp baseline: 2026-07-23T16:54:52-03:00):

GROUP | PATH | STATUS | SHA256
---|---|---|---
DOC | docs/architecture/CURRENT_GAME_FLOW_BASELINE.md | OK | 2708BCC59819D049289226845A36CDA93B781E447058A29C404AA57258C63B33
DOC | docs/architecture/STATE_OWNERSHIP_MATRIX.md | OK | ADF3E8E68A48B1E2DA37E5142E31E6F5C464BF6C98499B041FD006641467321D
DOC | docs/architecture/EVENT_FLOW_MATRIX.md | OK | D97BF15320410C937F8B6CA8D130FABA61D575A30A8E4EF05D5D8D2B26E4BC00
DOC | docs/architecture/MISSION_TIMELINE.md | OK | EE2F75DC3BC217EA1413907ECB77DDB1D890DB4993F670958C80CA2141A6ECF9
DOC | docs/architecture/STATE_MUTATION_MAP.md | OK | 2868AB94B3B70BEDD329BCFC4B2F70D7ABB65A304BFE47D6606C318C627A7857
DOC | docs/architecture/GAME_TRANSACTIONS.md | OK | 8A9085E32076A6337818F7CCA8FCF1BD41730038051B7F73D3F348A7C45EBD42
DOC | docs/architecture/FLOW_TRACEABILITY_AUDIT.md | OK | 17EF2EBB1E1D78041DDAFF88AF67BF51577E9207D267EB01C08917396E6D4F17
EXEC | css/crios.css | OK | E1BB3882F0301B3DBA102B942B7EC8058C845B59E4A18E3EA30E18193FCC04BB
EXEC | css/studio.css | OK | E400D53D2C491C5F521EDF47B4829A7987ED72327C0F36D42C76620F9FA8ED33
EXEC | index.html | OK | B03C5E37231C7E6869FA11C7159CE18BA7485E86E8C63298CF3A9B1D28655DC6
EXEC | js/config.js | OK | 14F95DD81DD2085ADA25A4B3AFD05CE3A8EE0E35C70C6769C1FA6381E0731E8E
EXEC | js/crios.js | OK | 7254F6DD488DEDC731108798B0DCED6C876A5659FB38F96F71CADC0CECE94B11
EXEC | js/datos/campanas.js | OK | BB453824D14A8403488BF57EED2C6C8F4BB779DC52DB33D80C44B06C57246883
EXEC | js/datos/taxonomia.js | OK | AD91F63675FC51948B657DEBAD4B266510B551D2BF4F4118AF0A81E717DCAA8A
EXEC | js/escenarios/antartida.js | OK | 5C37A3B61C2CE1000F99A40617629EB114A0C283D3E6FB96990CF3EDA8DAF1FA
EXEC | js/escenarios/registro-carga.js | OK | 6834580349AE3CC5430A4170DDFE417DD49B478EBA5580E752EFD5CBBC4A4B91
EXEC | js/escenarios/registro-escenarios.js | OK | 0D76D8B751B2E38226EF07379581FD9CFEEF6600537A8F8188C31F82A2B9FE5B
EXEC | js/misiones/matematica/geometria/areas/banco-hielo.js | OK | B9A6D06D628ED33A3997C5A12FBA1475DC60F9CC8C0852130CD6834E7D6800EC
EXEC | js/misiones/matematica/geometria/areas/centro-energia.js | OK | BD8D342A59D4F79E3989DBFB0A4C2605109F5192DE493F8908D381D7618C876A
EXEC | js/misiones/matematica/geometria/areas/hangar-perforacion.js | OK | 60FC0B128749713ABA51E65FC20113E5FECF599A5832276F51CAE643066A0636
EXEC | js/misiones/matematica/geometria/areas/invernadero.js | OK | EDBC1B21EA8E9A0D881452CE066CDF69D15E377E9B4333733EF9F54B76610CC7
EXEC | js/navigation/navigation-core.js | OK | 3781278DC6A318D29F3EEA61969F73A9CDBA5094E345295F7920A86C42397E7F
EXEC | js/nucleo/registro-misiones.js | OK | 8BF9D6B2F6EC22F765094910F01D9CCF2B35571940627EB5124037BE5B1B0292
EXEC | js/player-state/player-state-service.js | OK | 789DC62ECB02739B947C85BE99B3CD936E873A12AC0FCD2A5EF4A8D6B8D67B1C
EXEC | js/player-state/player-state-validator.js | OK | 4593A3F0B44F316CF6827E123FE153E28EBC15B1068335D8F44D1E9645526A5F
EXEC | js/publish/publish-service.js | OK | C23AA56900B9803C5D0AB5A74C6C8A08282E163DEBB1E163F8876034261CEE9D
EXEC | js/release/release-factory.js | OK | C66B8DF941702BA01BDEA558E05FE34DAE1B7075D69825BD53D5901B9C82AC70
EXEC | js/release/release-model.js | OK | 3FC04E354DE4F3C3322FC6588278C0AC0F015813CB4B1343FEF0FAD354835376
EXEC | js/release/release-validator.js | OK | F25FF6D2EA744217BE6F773546763B677497AD15AD3A845D87FA513A574AA9C0
EXEC | js/runtime/runtime-core.js | OK | FE4F0E23C1708FEF9B80F7692DE8067837062F5CA303C2AC7A1D3A257208897C
EXEC | js/servicios/campaign-validator.js | OK | 2B95DCF4E405D93E9619AC27A19C0D84199E7B103C3EA1D593C65977C8E02ADF
EXEC | js/session/session-factory.js | OK | 3FD18835524DF23795CB91477E0066D3AC84B6F7A49320B8184219CE036CAB4B
EXEC | js/session/session-model.js | OK | 59148D26C94A31F41FE688BE69C63871A0C5EE78725D2206A8C1C14C05B702AF
EXEC | js/session/session-validator.js | OK | 186368586992457E9EC0749B07DFCDCEDAFFCDC64482EE0098B32A64352CAF27
EXEC | js/share/share-model.js | OK | CD2C57D05AC42196A3F1D0C38B29C6ED6181AC55DB86DADDAF6F2C07B86FB246
EXEC | js/share/share-service.js | OK | CA1DEEAEB61BD30DBC515DEF5BF32005A1FD6675A66CAF2DEE5F690EBA5483EE
EXEC | js/share/share-validator.js | OK | 751662241CE0A33A5D215064774888699816761AA3B86DDC9F8368E424690DA9
EXEC | js/studio/acciones/campaign-actions.js | OK | AC5AC3AA326A09199F91B4D6986DC9E3C53F1BFD04F8718349FA2D2F3B28DF61
EXEC | js/studio/adapter.js | OK | 8549C8ED4D51C8DF2EA9F8607C78727CC765BFA8CD2B070C68AE18A9B8D3FF3D
EXEC | js/studio/modelo/campaign-draft.js | OK | C64C4CFE485A4AEE3526B93346ABE71674E1F75109F8A8FF67C4299D258C99A3
EXEC | js/studio/render/studio-renderer.js | OK | A9640D04A07130D5F4EA0F39E429C794115693DFEB8CE134FA129247105829CE
EXEC | js/studio/studio.js | OK | CA5D3DFD9025260FB0BFA42553AAD683C9DF508C2E06B9F7C23ECAE68A8C37F0
EXEC | js/studio/validacion/campaign-validator.js | OK | 18E9332D387FFFA59EAAC08ECCCC9283322A6F0D6EE840C9D4BF5C99C80C10AA
EXEC | studio/index.html | OK | DEFE01F9993CC499433D8B29519B2EB8748BBD7CF4DE8AA1E8275ECFA0DC394C

Conteos baseline:
- docs_total=7
- docs_missing=0
- executables_total=37

## 3) Inventario de fuentes ejecutables auditadas

Fuentes principales de runtime juego:
- index.html (lineas 1-399)
- js/crios.js (lineas 1-1106)
- js/config.js (lineas 1-27)
- js/datos/campanas.js (lineas 1-37)

Fuentes de dominio usadas por carga dinamica:
- js/release/release-model.js (1-70)
- js/release/release-factory.js (1-49)
- js/session/session-model.js (1-46)
- js/session/session-factory.js (1-50)
- js/player-state/player-state-service.js (1-65)
- js/runtime/runtime-core.js (1-185)
- js/navigation/navigation-core.js (1-247)

## 4) Matriz completa de afirmaciones (documentos auditados)

Columnas obligatorias por afirmacion:
- FuenteDoc
- Afirmacion
- Evidencia (archivo, funcion, lineas)
- Evento inicia
- Estado leido
- Estado escrito
- Llamadas siguientes
- Render
- Persistencia
- Bifurcaciones
- Clasificacion

| ID | FuenteDoc | Afirmacion | Evidencia | Evento inicia | Estado leido | Estado escrito | Llamadas siguientes | Render | Persistencia | Bifurcaciones | Clasificacion |
|---|---|---|---|---|---|---|---|---|---|---|---|
| A01 | STATE_OWNERSHIP_MATRIX.md:L9 | campanaActiva nace en init y cambia en seleccion/reinicio | js/crios.js -> inicializarCampana 254-283, establecerCampanaActiva 209-253, resetProgress 528-565 | carga o seleccionar campania o reset | campaignId, campanias | campanaActiva, campanaActivaId | setupMissionUI, rebuildDomainStateForActiveCampaign, updateMap | cabecera/mapa/selector | sessionStorage campaignId/campaignProgress/progress | campania publicada o no | VERIFICADO |
| A02 | STATE_OWNERSHIP_MATRIX.md:L13 | progress se modifica en inicio/cambio/respuesta correcta/reset | js/crios.js -> inicializarCampana 254-283, establecerCampanaActiva 209-253, validateMissionResult 936-952, resetProgress 528-565 | init, cambio, enviar, reset | campaignProgress/progress, expected | progress, progresosCampanas | save, updateMap | mapa, mini estado, boton final | writeJson sessionStorage progress/campaignProgress | correcta vs incorrecta | VERIFICADO |
| A03 | STATE_OWNERSHIP_MATRIX.md:L16 | sessionData se muta en casi todo el flujo | js/crios.js -> startSession 291-304, recordScreen 305-311, missionRecord 312-316, validateProcedure 921-935, validateMissionResult 936-952, validateFinalProcedure 961-977, validateFinal 502-527 | identificar, navegar, verificar/enviar, final | inputs, missionData, stats | sessionData.* | persistSession, queueSessionUpdate, sendSessionUpdate | feedback, map/final/credits | writeJson sessionStorage sessionData + fetch | multiples | VERIFICADO |
| A04 | STATE_OWNERSHIP_MATRIX.md:L26 | domainSession convive con sessionData legacy | js/crios.js -> rebuildDomainStateForActiveCampaign 92-122, applyDomainEvaluationForMission 160-182 | cambio campania o enviar mision | campanaActiva, missionIds, domain modules | domainSession, domainSession.progress.currentMissionId | refreshDomainRuntimeAndNavigation | no render directo | sin storage directo | domain ready o no; canContinue true/false | VERIFICADO |
| A05 | STATE_OWNERSHIP_MATRIX.md:L30 | transmissionQueued se usa para serializar envios | js/crios.js -> sendSessionUpdate 369-397 | queue o envio final concurrente | transmissionBusy, finalized | transmissionQueued, transmissionBusy | sendSessionUpdate recursivo | texto sendStatus opcional | fetch + pendingResult fallback | busy true/false | VERIFICADO |
| A06 | EVENT_FLOW_MATRIX.md:L10 | introReady cambia al finalizar boot visual | js/crios.js -> animateBootProgress 1011-1061 | requestAnimationFrame | bootStart/bootDuration | introReady=true | none | prompt habilitado intro | ninguna | pct<100 o >=100 | VERIFICADO |
| A07 | EVENT_FLOW_MATRIX.md:L16 | identifyUser crea sesion y envio inicial incremental | js/crios.js -> identifyUser 641-680, startSession 291-304, sendSessionUpdate 369-397 | click identify | inputs + group select | sessionData/sessionStats/progress + storage identidad | startSession, sendSessionUpdate(false), ensureMissionData | oculta login/muestra welcome | setItem realName/groupName/characterName, writeJson sessionData/stats/progress | campos completos o incompletos | VERIFICADO |
| A08 | EVENT_FLOW_MATRIX.md:L20 | seleccionar campania fija campania activa y navega mapa | js/crios.js -> seleccionarCampana 753-758, establecerCampanaActiva 209-253 | click en campania | campania.estado | campanaActiva/missionIds/progress | setupMissionUI, updateMap, renderCampaignSelector, go(map) | campanas->mapa | setItem campaignId + writeJson progress/campaignProgress + persistSession | publicada o no | VERIFICADO |
| A09 | EVENT_FLOW_MATRIX.md:L24 | enviar respuesta de mision actualiza stats/sesion y progress en correcta | js/crios.js -> validateMissionResult 936-952 | click ejecutar reparacion | missionData[id].expected, answer input | sessionStats.*, sessionData.misiones.*, progress[id] (si correcta) | applyDomainEvaluationForMission, persistStats/save/queue | feedback en mision; posible go(map) diferido | writeJson sessionStats + progress/campaignProgress + sessionData | correcta vs incorrecta | VERIFICADO |
| A10 | EVENT_FLOW_MATRIX.md:L30 | estabilizar correcto cierra y envia final | js/crios.js -> validateFinal 502-527, transmitResults 403-410, sendSessionUpdate 369-397 | click estabilizar | finalAnswer, expected final | sessionData.final.*, complete, finISO, enviada, evaluacion | renderEvaluationSummary, transmitResults, go(credits) | panel final/credits | sessionStorage complete + fetch final + remove pendingResult | correcto vs incorrecto | VERIFICADO |
| A11 | EVENT_FLOW_MATRIX.md:L34 | online reintenta pendingResult | js/crios.js -> retryPendingResult 428-435 + listener 1052 | evento online | localStorage.pendingResult + navigator.onLine | remove pendingResult (si exito) | fetch | no render obligatorio | fetch keepalive + localStorage remove | pending existe y online | VERIFICADO |
| A12 | EVENT_FLOW_MATRIX.md:L35-L36 | pagehide/hidden hace snapshot de salida | js/crios.js -> sendExitSnapshot 411-427 + listeners 1053-1056 | pagehide o visibility hidden | sessionData, endpoint | pendingResult local (fallback) | navigator.sendBeacon o fetch | no render | sendBeacon/fetch/localStorage.setItem | beacon ok/falla; fetch ok/falla | VERIFICADO |
| A13 | MISSION_TIMELINE.md:L63 | missionOpenedAt[mision] se registra al abrir | js/crios.js -> openMission 465-470 | click modulo | missionId | missionOpenedAt[id]=Date.now | go(mission-id) | pantalla mision activa | recordScreen->persistSession->queue | none | VERIFICADO |
| A14 | MISSION_TIMELINE.md:L95 | hintUsed se registra una sola vez por mision | js/crios.js -> registerHint 953-953 | click pista | hintRegistered[id], sessionStats, rec | hintRegistered true, stats.hints++, rec.hintUsed | persistStats/persistSession/queue | apertura details pista | writeJson sessionStats + sessionData | ya registrada o no | VERIFICADO |
| A15 | MISSION_TIMELINE.md:L166-L170 | rama correcta marca progress y tiempo | js/crios.js -> validateMissionResult 936-952 | enviar correcto | missionOpenedAt, expected | progress[id], completed, timeMs, answerCorrect | save, setTimeout go(map) | feedback ok y retorno mapa | progress/sessionStats/sessionData + queue | correcta/incorrecta | VERIFICADO |
| A16 | MISSION_TIMELINE.md:L204 | rama incorrecta mantiene mision y answerCorrect false | js/crios.js -> validateMissionResult 936-952 | enviar incorrecto | expected | rec.answerCorrect=false | applyDomainEvaluationForMission, persistSession, queue | feedback bad en misma pantalla | sessionData + queue | correcta/incorrecta | VERIFICADO |
| A17 | STATE_MUTATION_MAP.md:L31 | complete storage set y remove en reset | js/crios.js -> validateFinal 502-527; resetProgress 528-565 | finalizar correcto o reset | final result | sessionStorage.complete set/remove | renderEvaluationSummary/transmitResults o init | credits o reveal | setItem/removeItem | correcto/incorrecto/confirm reset | VERIFICADO |
| A18 | STATE_MUTATION_MAP.md:L32 | pendingResult set/remove/get en rutas de red | js/crios.js -> sendSessionUpdate 369-397; sendExitSnapshot 411-427; retryPendingResult 428-435; resetProgress 528-565 | fallo envio, salida, retry, reset | pending local | set/remove/get pending | fetch, sendBeacon | sendStatus opcional | localStorage set/remove/get | exito/falla red | VERIFICADO |
| A19 | STATE_MUTATION_MAP.md:L36-L42 | metricas de storage/red son conteos exactos | evidencia parcial: llamadas visibles en js/crios.js pero conteo exacto depende de criterio de conteo | n/a | n/a | n/a | n/a | n/a | n/a | n/a | PARCIAL |
| A20 | GAME_TRANSACTIONS.md:L18 | sin campania publicada aborta con error tecnico | js/crios.js -> inicializarCampana 254-283 lanza Error si no inicial | carga app | listarCampanas/obtenerCampanaPorId | no estado de juego utilizable | throw Error | no render valido posterior | ninguna | inicial encontrada/no encontrada | VERIFICADO |
| A21 | GAME_TRANSACTIONS.md:L19 | fallo carga grupos habilita reintento manual | js/crios.js -> loadGroups 591-640 | fetch grupos falla | endpoint grupos | DOM status con boton Reintentar onclick loadGroups | none | mensaje error y boton | sin persistencia extra | response ok/fail | VERIFICADO |
| A22 | GAME_TRANSACTIONS.md:L20 | si falla dominio continua flujo legacy con warning | js/crios.js -> ensureDomainModulesLoaded catch 1042-1048; resolve/apply domain guards 146-182 | carga dominio falla | domainReady false | no usa domain* para resolver/aplicar | go/openMission legacy | juego sigue | ninguna | domain ready/no ready | VERIFICADO |
| A23 | GAME_TRANSACTIONS.md:L89 | evaluacion puede alterar vidas/continuidad | js/player-state/player-state-service.js -> applyEvaluation 16-37; js/crios.js -> applyDomainEvaluationForMission 160-182 | enviar respuesta | session.lives/status | lives-- y status gameOver/running; luego posible restore | canContinue/restore | no render directo | no storage directo | isCorrect / canContinue | VERIFICADO |
| A24 | GAME_TRANSACTIONS.md:L169 | perdida total de progreso en reset | js/crios.js -> resetProgress 528-565 | confirmar reset | confirm dialog | limpia memoria + removeItem masivo | inicializarCampana, go(reveal), loadGroups | vuelve a identificacion | removeItem de progreso/identidad/sesion/pending | confirm true/false | VERIFICADO |
| A25 | CURRENT_GAME_FLOW_BASELINE.md:L287 | gameOver no emerge como flujo visible por restauracion inmediata | js/player-state/player-state-service.js 16-51 + js/crios.js 160-182 + ausencia de pantalla/branch gameOver en index.html 283-370 | respuesta incorrecta extrema | domainSession.status/lives | gameOver transitorio posible y restore a running | refreshDomainRuntimeAndNavigation | sin pantalla gameOver dedicada | sin persistencia gameOver dedicada | canContinue false -> restore | CONTRADICCION |
| A26 | CURRENT_GAME_FLOW_BASELINE.md:L285 | coherencia alta entre flujo directo e inverso | evidencia distribuida pero juicio global no binario | n/a | n/a | n/a | n/a | n/a | n/a | n/a | INFERENCIA NO DEMOSTRADA |
| A27 | CURRENT_GAME_FLOW_BASELINE.md:L318 | render y reglas mezcladas en crios.js | js/crios.js -> go 443-464, updateMap 474-501, validate* 921-977 mezclan mutacion+DOM | eventos UI | estado runtime + DOM | estado + DOM | persist/update/render | multiple pantallas | queue/fetch/storage | multiples | VERIFICADO |
| A28 | CURRENT_GAME_FLOW_BASELINE.md:L317 | persistencia y telemetria acopladas al flujo | js/crios.js -> recordScreen 305-311, persistStats 954, queueSessionUpdate 398-402, sendSessionUpdate 369-397 | casi todo evento UI | sessionData/sessionStats | pending/fin/evaluacion | fetch/sendBeacon | sendStatus | session/local + red | busy/queued, exito/falla | VERIFICADO |
| A29 | CURRENT_GAME_FLOW_BASELINE.md:L303 | retryPendingResult limpia pending en exito | js/crios.js -> retryPendingResult 428-435 | online o init | localStorage.getItem pending | removeItem pending | fetch | none | localStorage/fetch | online+pending vs no | VERIFICADO |
| A30 | EVENT_FLOW_MATRIX.md:L31 | estabilizar incorrecto incrementa attempts y persiste | js/crios.js -> validateFinal 502-527 | click estabilizar incorrecto | finalAnswer, expected | sessionData.final.attempts++, answerCorrect=false | persistSession, queueSessionUpdate | feedback bad final | sessionData + queue | correcto/incorrecto | VERIFICADO |

## 5) Flujo directo completo con lineas (desde apertura de campania hasta cierre)

| Paso | Archivo | Funcion/Bloque | Lineas | Evento inicia | Estado leido | Estado escrito | Llamadas siguientes | Render provocado | Persistencia provocada | Bifurcaciones |
|---|---|---|---|---|---|---|---|---|---|---|
| D01 | index.html | scripts + intro | 373-397, 31-39 | abrir pagina | n/a | n/a | carga js/crios.js | intro activa | ninguna | n/a |
| D02 | js/crios.js | bootstrap init + inicializarCampana | 203-283, 1038-1051 | carga documento | campaignId/campaignProgress/progress/sessionStats/sessionData | campanaActiva, missionIds, progress | setupMissionUI, renderCampaignSelector, updateMap, loadGroups, retryPendingResult | intro + UI base preconstruida | read/write sessionStorage inicial | campania valida o error |
| D03 | js/crios.js | activateIntro / go('aria') | 978-1010, 443-464 | pointerdown/Enter en intro | introReady/introActivated | introActivated, currentScreen | go('aria') | aria activa | recordScreen si hay sesion | introReady true/false |
| D04 | index.html + js/crios.js | identifyUser + startSession | index 245; crios 641-680 y 291-304 | click identificar | inputs + grupos | sessionData/sessionStats/progress + identity storage | sendSessionUpdate(false), ensureMissionData | reveal login->welcome | setItem identity + writeJson sesion/stats/progress | campos validos/invalidos |
| D05 | index.html + js/crios.js | abrirSelectorCampanas/go('campanas') | index 255; crios 748-752, 443-464 | click seleccionar campania | campanas | currentScreen | renderCampaignSelector | pantalla campanas | recordScreen + queue | n/a |
| D06 | index.html + js/crios.js | seleccionarCampana/establecerCampanaActiva | index boton dinamico; crios 753-758, 209-253 | click iniciar/continuar | campania y progreso guardado | campanaActiva, missionIds, progress, reset temporales | setupMissionUI, rebuildDomainStateForActiveCampaign, updateMap, go('map') | mapa de campania | campaignId/progress/campaignProgress + persistSession | publicada/no publicada |
| D07 | js/crios.js | openMission + renderMission | 465-470, 881-891 | click modulo | mission id + missionData | missionOpenedAt[id], currentScreen | resolveMissionIdUsingDomain, go(mission-id) | pantalla mission-X | recordScreen + queue | domain ready/no ready |
| D08 | js/crios.js | validateProcedure | 921-935 | click verificar procedimiento | input expresion, missionData[id] | sessionStats[id].procedureAttempts, rec.procedure/procedureCorrect | persistStats, persistSession, queueSessionUpdate | feedback + posible unlock resultStep | writeJson stats + sessionData | expresion valida/invalid; equivalente/insuficiente |
| D09 | js/crios.js | validateMissionResult (rama correcta) | 936-952 | click ejecutar reparacion | input answer, expected, missionOpenedAt | progress[id]=true, stats completed/time, rec.answerCorrect=true | applyDomainEvaluationForMission, save, setTimeout go(map), queue | feedback ok y retorno mapa | progress/campaignProgress/sessionStats/sessionData + queue/fetch | correcta |
| D10 | js/crios.js | validateMissionResult (rama incorrecta) | 936-952 | click ejecutar reparacion | input answer, expected | rec.answerCorrect=false, stats attempts | applyDomainEvaluationForMission, persistSession, queue | feedback bad y permanencia en mision | sessionData + queue/fetch | incorrecta |
| D11 | js/crios.js | updateMap + go('final') + renderFinal | 474-501, 443-464, 956-960 | completar todas y click protocolo final | progress, missionData | currentScreen | renderFinal | pantalla final y resumen sistemas | recordScreen + queue | done<total o done==total |
| D12 | js/crios.js | validateFinalProcedure | 961-977 | click verificar procedimiento final | finalProcedure, missionData | sessionData.final.procedure*, procedureCorrect | persistSession, queue | feedback + unlock finalResultStep | sessionData + queue/fetch | ok/valor coincide sin datos/error |
| D13 | js/crios.js | validateFinal (correcto) | 502-527 | click estabilizar | finalAnswer, expected | sessionData.final.answerCorrect, complete, evaluacion | renderEvaluationSummary, transmitResults, go(credits) | final status + credits | setItem complete + sendSessionUpdate(true) | correcto |
| D14 | js/crios.js | validateFinal (incorrecto) | 502-527 | click estabilizar | finalAnswer, expected | answerCorrect=false, attempts++ | persistSession, queue | feedback bad | sessionData + queue/fetch | incorrecto |
| D15 | js/crios.js | sendSessionUpdate/transmitResults/retryPending/sendExitSnapshot | 369-435, 411-427 | queue/final/online/salida | sessionData, pendingResult | finISO/enviada/evaluacion, pending set/remove | fetch, sendBeacon | sendStatus opcional | red + local/session storage | busy/queued, exito/falla |

## 6) Flujo inverso independiente (desde estados terminales)

| Estado terminal | Archivo | Funcion/Bloque | Lineas | Reconstruccion hacia atras | Clasificacion |
|---|---|---|---|---|---|
| credits visible | js/crios.js | validateFinal -> go('credits') | 502-527 | proviene de final correcto, que exige expected correcto y persistencia final | VERIFICADO |
| complete=true en sessionStorage | js/crios.js | validateFinal | 514 | implica rama correcta de estabilizar; no ocurre en rama incorrecta | VERIFICADO |
| sessionData.finISO/sessionData.enviada | js/crios.js | transmitResults + sendSessionUpdate(true) | 403-410, 382-384 | implica cierre final disparado por validateFinal correcto | VERIFICADO |
| pendingResult presente | js/crios.js | sendSessionUpdate catch o sendExitSnapshot fallback | 390, 424 | implica fallo de red en envio incremental/final o salida | VERIFICADO |
| progress[mision]=true + campaignProgress persistido | js/crios.js | validateMissionResult correcta + save | 943-945, 473 | implica respuesta correcta de mision | VERIFICADO |
| sessionData.misiones[id].answerCorrect=false | js/crios.js | validateMissionResult incorrecta | 949-951 | implica rama incorrecta o reintentos fallidos | VERIFICADO |

Resultado de flujo inverso: la reconstruccion hacia atras es consistente para estados terminales observables del juego.

## 7) Arbol funcional completo de ejecucion principal

Arbol (runtime alumno):
- bootstrapCrios IIFE [js/crios.js:1-1106]
- init campania: inicializarCampana [254-283]
- init UI: setupMissionUI [906-915], actualizarCabeceraCampana [691-699], renderCampaignSelector [726-747], updateMap [474-501]
- intro: animateBootProgress [1011-1061] -> activateIntro [978-1010] -> go('aria') [443-464]
- identidad: loadGroups [591-640], identifyUser [641-680], startSession [291-304]
- campanias: abrirSelectorCampanas [748-752], detalleCampana [700-725], seleccionarCampana [753-758], establecerCampanaActiva [209-253]
- misiones: openMission [465-470] -> renderMission [881-891] -> validateProcedure [921-935] -> validateMissionResult [936-952]
- final: renderFinal [956-960] -> validateFinalProcedure [961-977] -> validateFinal [502-527]
- persistencia/telemetria: persistSession [288-290], persistStats [954], queueSessionUpdate [398-402], sendSessionUpdate [369-397], transmitResults [403-410], retryPendingResult [428-435], sendExitSnapshot [411-427]
- reset: resetProgress [528-565]

## 8) Puntos de decision (branches)

Decisiones criticas verificadas:
- intro activable: introReady && !introActivated (js/crios.js:978-1010).
- identidad valida/invalida (js/crios.js:651-659).
- campania publicada/no publicada (js/crios.js:211-212, 755-756).
- dominio disponible/no disponible (js/crios.js:92-122, 146-159, 160-182, 1042-1048).
- procedimiento de mision: valido+esencial / valido no esencial / invalido (js/crios.js:926-934).
- respuesta mision correcta/incorrecta (js/crios.js:941-951).
- resultado final correcto/incorrecto (js/crios.js:507-523).
- envio: transmissionBusy cola o envio directo + exito/falla (js/crios.js:371-397).
- snapshot salida: beacon exito/falla, fetch exito/falla (js/crios.js:416-425).
- reset confirmado/cancelado (js/crios.js:529).

## 9) Auditoria de mutaciones - motor legacy (js/crios.js)

Cobertura aplicada: asignacion de raiz, propiedades, indices, incrementos, push/shift, spreads/recreacion, storage writes/removes.

Mutaciones de raiz verificadas:
- campanaActivaId, progresosCampanas, progress, missionData (203-207, 221-222, 268, 300, 530-547).
- sessionData, sessionStats, hintRegistered, missionOpenedAt, currentScreen (274-278, 292-304, 300, 444, 531-535).
- transmissionBusy/transmissionQueued (339-340, 371-372, 393-394).
- domainRelease/domainSession/domainRuntime/domainNavigation (31-34, 107-118, 141-142).

Mutaciones de propiedades/indices verificadas:
- sessionData.campana, sessionData.misiones[missionId] (231-239).
- sessionData.pantallas.push + shift (307-308).
- sessionData.final.* (506-521, 963-970).
- sessionStats[id].procedureAttempts/attempts/completed/timeMs/hints (923, 938, 943-944, 953).
- progress[id]=true (943).
- hintRegistered[id]=true (953).
- missionOpenedAt[id]=Date.now() (468).
- domainSession.currentMissionIndex / domainSession.progress.currentMissionId (129-130).

Array mutators:
- push: sessionData.pantallas.push (307).
- shift: sessionData.pantallas.shift (308).
- reduce/map/filter usados para derivacion, no mutacion in-place del estado compartido.
- pop/splice/unshift: NO ENCONTRADO en runtime alumno.

Spreads/recreacion:
- progresosCampanas[campanaActiva.id] = { ...progress } (214, 473).
- progress = { ...(progresosCampanas[...]||{}) } (221, 268).
- sessionData = { ... } en startSession (292-299).

Storage mutaciones:
- sessionStorage.setItem: 226, 269, 302, 514, 576, 661, 662.
- sessionStorage.removeItem: 538-546.
- localStorage.setItem/removeItem/getItem: 424, 385/433/537, 429.
- writeJson/readJson wrappers: 183-208.

## 10) Auditoria de mutaciones - modulos de dominio y servicios

Mutaciones indirectas relevantes:
- player state service:
  - js/player-state/player-state-service.js::applyEvaluation 16-37
  - escribe session.lives y session.status (25,31,32).
  - branch gameOver cuando vidas llega a 0.
- restore de continuidad:
  - js/player-state/player-state-service.js::restorePlayerState 38-51
  - session.lives = max y session.status running si gameOver.
- aplicacion desde motor:
  - js/crios.js::applyDomainEvaluationForMission 160-182
  - llama applyEvaluation -> canContinue -> restorePlayerState.

Construccion de objetos por fabrica (no mutacion posterior del freeze original, salvo clon en integracion):
- js/release/release-factory.js::createCampaignRelease 5-44.
- js/session/session-factory.js::createStudentSession 5-45.
- js/runtime/runtime-core.js::createRuntime 153-185.
- js/navigation/navigation-core.js::createNavigation 47-136.

Nota: en integracion legacy se clona sesion congelada y luego si se muta (js/crios.js:109, 129-130, 160-182).

## 11) Comparacion contra STATE_MUTATION_MAP.md

Comparacion puntual:
- progress (doc L9): VERIFICADO.
- missionData (doc L10): VERIFICADO.
- hintRegistered/missionOpenedAt (doc L11-L12): VERIFICADO.
- sessionData/sessionStats con muchas mutaciones internas (doc L19-L20): VERIFICADO.
- pendingResult set/remove/get (doc L32): VERIFICADO.
- metricas numericas exactas storage/red (doc L36-L42): PARCIAL (dependen del criterio de conteo y no todas son invariantes semanticas).

Mutaciones no registradas explicitamente en ese documento:
- sessionData.pantallas.shift (js/crios.js:308).
- transmissionQueued=transmissionQueued||finalized (js/crios.js:371).
- domainSession.currentMissionIndex y domainSession.progress.currentMissionId (js/crios.js:129-130).
- sessionData.evaluacion objeto recreado en cierre final (js/crios.js:384).

## 12) Auditoria de propiedad de estado

Propiedad efectiva observada:
- Propietario legacy central: js/crios.js (campania, progreso, sesion, stats, navegacion UI).
- Propietario de vidas/continuidad: domainSession via player-state-service.
- Persistencia local: sessionStorage/localStorage (claves de js/config.js:11-24).

Cruces de propiedad (riesgo):
- progreso representado en progress + progresosCampanas + campaignProgress/sessionStorage.
- mision actual representada en currentScreen + missionOpenedAt + domainSession.progress.currentMissionId + domainRuntime.mission + domainNavigation.currentMissionId.
- cierre representado en complete + sessionData.final.answerCorrect + finISO + enviada.

## 13) Estados sin propietario unico

Estados sin propietario unico claramente aislado:
- progress/progresosCampanas/storage progress/campaignProgress.
- current mission (legacy + dominio).
- cierre final (bandera complete + campos sessionData.final/finISO/enviada).

Clasificacion global: VERIFICADO.

## 14) Inventario completo de persistencia y telemetria

Persistencia local:
- sessionStorage read:
  - campaignId/progress/campaignProgress/sessionStats/sessionData/realName/characterName/groupName.
  - evidencias: js/crios.js 203-205, 274, 277, 460, 581-582, 627.
- sessionStorage write/remove:
  - evidencias: js/crios.js 226,269,302,514,576,661,662; 538-546.
- localStorage pending:
  - evidencias: js/crios.js 385,424,429,433,537.

Telemetria red:
- incremental/final fetch:
  - js/crios.js 376-381, 432.
- grupos fetch GET:
  - js/crios.js 604-607.
- snapshot salida sendBeacon/fetch keepalive:
  - js/crios.js 416-423.

Cola y concurrencia:
- queueSessionUpdate debounce (398-402).
- transmissionBusy/transmissionQueued (339-340, 371-397).

## 15) Matriz de navegacion y render

| Trigger UI | Archivo | Funcion | Lineas | Pantalla destino/render | Persistencia asociada |
|---|---|---|---|---|---|
| intro pointerdown/Enter | js/crios.js | activateIntro -> go | 978-1010, 443-464 | intro -> aria | recordScreen si sessionData |
| boton analisis historico | index.html/js/crios.js | go('record1') | index 65, crios 443-464 | aria -> record1 | recordScreen + queue |
| boton siguiente registro | index.html/js/crios.js | go('record2') | index 79, crios 443-464 | record1 -> record2 | recordScreen + queue |
| boton correlacion | index.html/js/crios.js | go('reveal') | index 98, crios 443-464 | record2 -> reveal | recordScreen + queue |
| identificar | index.html/js/crios.js | identifyUser | index 245, crios 641-680 | login->welcome | identity + session writes |
| seleccionar campania | index.html/js/crios.js | abrirSelectorCampanas | index 255, crios 748-752 | reveal -> campanas | recordScreen + queue |
| iniciar/continuar campania | html dinamico + js/crios.js | seleccionarCampana/establecerCampanaActiva | 753-758,209-253 | campanas -> map | campaignId/progress/campaignProgress |
| abrir modulo | html dinamico + js/crios.js | openMission/renderMission | 465-470,881-891 | map -> mission-X | recordScreen + queue |
| cerrar modulo | index.html/js/crios.js | go('map') | index 343, crios 443-464 | mission/final -> map | recordScreen + queue |
| protocolo final | index.html/js/crios.js | go('final') | index 312, crios 443-464 | map -> final + renderFinal | recordScreen + queue |
| estabilizar correcto | js/crios.js | validateFinal -> go('credits') | 502-527 | final -> credits | complete + envio final |
| nueva sesion | index.html/js/crios.js | resetProgress | index 256/314/368, crios 528-565 | any -> reveal | limpieza storage total |

## 16) Auditoria detallada de game over

Evidencia de existencia tecnica:
- js/player-state/player-state-service.js::applyEvaluation 16-37
  - setea status='gameOver' cuando lives llega a 0 (linea 32).

Evidencia de no terminalidad visible en este runtime:
- js/crios.js::applyDomainEvaluationForMission 160-182
  - si canContinue false, llama restorePlayerState inmediatamente.
- js/player-state/player-state-service.js::restorePlayerState 38-51
  - restaura vidas maximas y status running.
- index.html
  - no existe seccion de pantalla game over entre map/final/credits (283-370).
- js/crios.js
  - no existe go('gameover') ni render de game over.

Resultado exacto de auditoria game over:
- Estado gameOver existe en dominio como transicion interna, pero se revierte en la misma cadena de evaluacion.
- No hay rama de flujo visible de game over como estado terminal de UI/persistencia.
- Clasificacion: CONTRADICCION frente a una lectura de "game over terminal"; VERIFICADO para "game over transitorio interno".

## 17) Auditoria de transacciones (GAME_TRANSACTIONS)

Transaccion 1 Arranque operativo: VERIFICADO (js/crios.js 203-283, 1038-1056, 591-640).
Transaccion 2 Alta identidad y apertura sesion: VERIFICADO (641-680, 291-304, 369-397).
Transaccion 3 Cambio campania activa: VERIFICADO (753-758, 209-253).
Transaccion 4 Resolver mision: VERIFICADO (465-470, 921-952).
Transaccion 5 Envio incremental: VERIFICADO (398-402, 369-397).
Transaccion 6 Cierre final campania: VERIFICADO (961-977, 502-527, 403-410).
Transaccion 7 Recuperacion pendiente: VERIFICADO (428-435 + listener 1052).
Transaccion 8 Reinicio total: VERIFICADO (528-565).
Transaccion 9 Snapshot salida: VERIFICADO (411-427 + listeners 1053-1056).

Observacion: la frase "ninguno critico faltante" (GAME_TRANSACTIONS.md:L205) es juicio global, no evidencia de codigo por si misma -> INFERENCIA NO DEMOSTRADA.

## 18) Conteos finales de clasificacion

Conteo sobre la matriz de afirmaciones (Seccion 4):
- VERIFICADO: 25
- PARCIAL: 1
- NO ENCONTRADO: 0
- CONTRADICCION: 1
- INFERENCIA NO DEMOSTRADA: 3

Contradicciones detectadas:
- C01: gameOver como estado terminal visible no existe en UI/persistencia; solo transicion interna restaurada.

Omisiones detectadas en documentos auditados:
- O01: no se documenta explicitamente sessionData.pantallas.shift como mutacion de control de tamano.
- O02: no se documenta explicitamente mutacion de domainSession.currentMissionIndex/currentMissionId por syncDomainMissionById.

## 19) Verificacion por hash (obligatoria en estado no versionado)

Regla aplicada:
- Se recalculo SHA-256 final para el mismo universo auditado del baseline inicial:
  - 7 documentos auditados.
  - todos los archivos ejecutables HTML/CSS/JS existentes al inicio.

Resultado esperado de control:
- Los 6 documentos auditados (excepto este archivo) deben conservar hash identico.
- Todos los ejecutables HTML/CSS/JS deben conservar hash identico.
- Solo docs/architecture/FLOW_TRACEABILITY_AUDIT.md puede cambiar.

Resultado de comparacion SHA-256:
- Sin cambios: 43/44 archivos.
- Cambio permitido detectado: docs/architecture/FLOW_TRACEABILITY_AUDIT.md.
- Cambios no permitidos: 0.
- Archivos desaparecidos respecto al baseline: 0.
- Archivos nuevos dentro del universo auditado (docs objetivo + HTML/CSS/JS): 0.

Decision por hashes:
- No BLOQUEADO por integridad de archivos auditados.

## 20) Resultado consolidado (Git vs SHA-256)

1) Resultado de Git:
- Git confirma workspace sucio y mezcla de cambios preexistentes/no versionados.
- Git no permite afirmar por si solo unicidad de cambios en archivos no trackeados.

2) Resultado de comparacion SHA-256:
- Integridad exacta confirmada para:
  - los 6 documentos auditados distintos de FLOW_TRACEABILITY_AUDIT.md.
  - todos los archivos HTML/CSS/JS del universo inicial.
- Unico hash distinto: docs/architecture/FLOW_TRACEABILITY_AUDIT.md.

3) Diferencias entre metodos:
- Git reporta estado de versionado, no equivalencia de contenido en no-trackeados.
- SHA-256 reporta equivalencia byte a byte y detecta cambios reales aunque Git no sea concluyente.
- En este sprint, ambos metodos son consistentes en que hubo actividad; solo SHA-256 permite demostrar que no hubo cambios de contenido fuera de FLOW_TRACEABILITY_AUDIT.md en el universo auditado.
