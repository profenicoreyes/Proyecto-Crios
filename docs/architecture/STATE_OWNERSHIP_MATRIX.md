# STATE_OWNERSHIP_MATRIX

Base utilizada: codigo ejecutable actual del repositorio (principalmente js/crios.js, js/config.js, js/datos/campanas.js, js/nucleo/registro-misiones.js y modulos de dominio cargados dinamicamente).

## Matriz completa de propiedad de estado

| Dato | Donde nace | Propietario real actual | Quien puede leerlo | Quien puede modificarlo | Cuando cambia | Cuando deja de existir | Existe mas de una copia | Riesgo de inconsistencia |
|---|---|---|---|---|---|---|---|---|
| campanaActiva | Inicializacion de campania | Orquestador de juego en memoria | Render de cabecera/mapa/selector, constructor de dominio | Inicializacion de campania, cambio de campania, reinicio | Al iniciar, al cambiar campania, al reiniciar | Al recargar pagina o reiniciar sesion | Si: tambien queda representada en sessionData.campana y campaignId persistido | Alto |
| campanaActivaId | Lectura de storage o valor inicial | Orquestador de juego en memoria | Inicializacion, seleccion de campania | Inicializacion, seleccion de campania, reinicio | Inicio, cambio de campania, reset | Recarga pagina/reinicio | Si: storage campaignId | Medio |
| misionesActivas | Seleccion de campania | Orquestador de juego en memoria | Armado de UI, render de mapa y final | Inicializacion y cambio de campania | Al fijar campania | Recarga/reinicio | Si: reflejada como missionIds y sessionData.misiones | Medio |
| missionIds | Derivado de misionesActivas | Orquestador de juego en memoria | Mapa, validaciones, evaluacion, payload | Inicializacion y cambio de campania | Al fijar campania | Recarga/reinicio | Si: duplicada semanticamente en release.missions y sessionData.misiones | Alto |
| progress | Lectura de campaignProgress de campania activa | Orquestador de juego en memoria | Mapa, selector, guardado, payload indirecto | Rama correcta de respuesta, inicio/cambio/reinicio | Inicio, cambio de campania, respuesta correcta, reset | Reset o recarga | Si: storage progress y campaignProgress | Alto |
| progresosCampanas | Lectura de campaignProgress en storage | Orquestador de juego en memoria + storage | Selector, calculo de progreso por campania | Guardado de progreso, cambio de campania, reset | Al guardar, al cambiar campania | Reset o limpieza de storage | Si: storage campaignProgress | Alto |
| missionData | Generacion deterministica por identidad | Orquestador de juego en memoria | Render de mision/final, validaciones | Generacion en inicio de sesion y antes de render/validar | Al entrar a sesion y durante flujo de mision/final | Reset/recarga | Si: no persistida, se regenera desde identidad | Medio |
| sessionData | Lectura de sessionData persistido o creacion de sesion | Orquestador de juego en memoria y storage | Navegacion, payload, evaluacion, creditos | Inicio de sesion, respuestas, pistas, pantallas, final, campania, envio final | Casi todo el flujo de partida | Reset/recarga sin persistencia | Si: memoria + sessionStorage + payload enviado | Alto |
| sessionStats | Lectura de sessionStats persistido o init | Orquestador de juego en memoria y storage | Calculo evaluativo, payload | Procedimiento, respuesta, pista, completitud, tiempo | Durante cada interaccion de mision | Reset | Si: memoria + sessionStorage | Alto |
| missionOpenedAt | Mapa temporal por mision abierta | Orquestador de juego en memoria | Calculo de tiempo de mision | Apertura de mision, reset/cambio campania | En cada open de mision | Reset/recarga | No persistida | Medio |
| hintRegistered | Mapa de control de pista por mision | Orquestador de juego en memoria | Registro de pista | Registro de pista, reset/cambio campania | Primer uso de pista por mision | Reset/recarga | Doble representacion parcial con sessionData.misiones[id].hintUsed | Medio |
| currentScreen | Estado de navegacion interna | Orquestador de juego en memoria | Rutina de navegacion y telemetria de pantallas | Cambios de pantalla | En cada cambio de pantalla | Recarga | Duplicacion historica en sessionData.pantallas | Bajo |
| introReady | Timer de progreso de intro | Orquestador de juego en memoria | Activacion de intro | Fin de animacion de boot | Una vez por carga | Recarga | No | Bajo |
| introActivated | Flag anti-reentrada de intro | Orquestador de juego en memoria | Activacion de intro | Primer gesto valido de usuario | Una vez por carga | Recarga | No | Bajo |
| domainModulesPromise | Carga dinamica de contratos de dominio | Cargador de dominio en orquestador | ensureDomainModulesLoaded | ensureDomainModulesLoaded | En primer llamado de carga | Recarga | No | Bajo |
| domainReady | Resolucion de carga de dominio | Orquestador de juego en memoria | Resolucion mision por dominio, evaluacion de jugador, rebuild de dominio | Resolucion de promesa de carga | Al completarse carga dinamica | Recarga | No | Bajo |
| domainRelease | Construccion de release temporal de campania activa | Integracion dominio dentro de orquestador | runtime/navigation de dominio | Rebuild por campania, fallback por error | Al reconstruir dominio | Error/reinicio/recarga | Si: representa misma campania que campanaActiva con forma distinta | Alto |
| domainSession | Creacion de sesion de dominio para navegacion/vidas | Integracion dominio dentro de orquestador | player-state, runtime, navigation | Rebuild de campania, sincronizacion de mision, evaluaciones | En rebuild y en respuestas correctas/incorrectas | Error/reinicio/recarga | Si: convive con sessionData de gameplay | Alto |
| domainRuntime | Runtime de dominio actual | Integracion dominio dentro de orquestador | NavigationCore y resolucion de mision actual | Rebuild/refresco de dominio | Cada refresh de dominio | Error/reinicio/recarga | Si: duplica estado de mision actual ya existente en flujo legacy | Alto |
| domainNavigation | Vista de navegacion de dominio | Integracion dominio dentro de orquestador | open de mision y coherencia de mision actual | Rebuild/refresco de dominio | Cada refresh de dominio | Error/reinicio/recarga | Si: coexiste con navegacion de pantallas legacy | Medio |
| transmissionBusy | Flag de seccion critica de envio | Telemetria en orquestador | Cola de envio | Inicio/fin de envio | Cada intento de envio | Recarga | No | Bajo |
| transmissionQueued | Flag de reintento en cola | Telemetria en orquestador | Finalizador de envio | Si llega nueva actualizacion durante envio | Durante concurrencia de envios | Recarga | No | Bajo |
| progressSendTimer | Temporizador de envio incremental | Telemetria en orquestador | queue de actualizaciones | Cada queueSessionUpdate | Tras eventos de progreso/pantalla | Recarga | No | Bajo |
| identidad realName | Formulario de identificacion | sessionStorage (fuente persistida) + memoria al leer | Formulario, generador de datos, payload | identify, reset | Al identificar o limpiar | reset/removeItem | Si: input DOM + storage + sessionData.nombre | Medio |
| identidad characterName | Formulario de identificacion | sessionStorage + render de nombre de usuario | UI, variante, payload | identify/setCharacterName/reset | Al identificar/cambiar identidad | reset/removeItem | Si: storage + sessionData.personaje + DOM data-user-name | Medio |
| identidad groupName | Formulario de identificacion | sessionStorage + sessionData | UI y payload | identify/reset | Al identificar o reset | reset/removeItem | Si: storage + sessionData.grupo + DOM | Medio |
| bandera complete | Resultado final de campania | sessionStorage | Flujo de cierre/lectura externa potencial | validate final correcto y reset | Al finalizar correctamente y al reset | reset/removeItem | Si: tambien existe sessionData.final.answerCorrect y sessionData.finISO | Medio |
| pendingResult | Payload pendiente de envio | localStorage | retry al iniciar/online y salida | Fallo de red, exito final, reset | Cuando falla envio o se reenvia con exito | removeItem/reset | Si: existe como objeto y como string en distintos caminos de escritura | Alto |
| payload de envio | Construido desde estado de sesion | Proceso de telemetria | Envio incremental/final/salida | build de payload | Cada envio o snapshot | Descartado tras envio | Copia efimera + localStorage.pendingResult | Medio |
| vidas de jugador | Session de dominio (domainSession.lives) | Player-state de dominio dentro de integracion | applyEvaluation/canContinue/restore | Consecuencia de respuesta incorrecta/correcta y restore | En cada evaluacion de respuesta | Recarga/reset | Si: no aparece en sessionData legacy | Alto |
| estado de continuidad de jugador | Session de dominio (running/gameOver) | Player-state de dominio dentro de integracion | canContinue/restore | applyEvaluation y restore | En respuestas incorrectas | Recarga/reset | Si: sessionData legacy usa otra semantica de cierre | Alto |
| historial de pantallas | sessionData.pantallas | sessionData | build payload, analisis de sesion | record de pantalla en cada go | Cada cambio de pantalla | reset/recarga | Si: currentScreen representa estado actual solamente | Medio |
| evaluacion agregada final | calculateEvaluation + cierre final | sessionData.evaluacion | creditos, payload final | cierre final exitoso | Al finalizar correctamente | reset/recarga | Si: tambien se calcula on-demand para renderEvaluationSummary | Medio |
| estado visual de mapa (cards, barra, boton final) | Render en DOM derivado de progress | DOM (derivado) | Usuario, updateMap | updateMap/save/go('map') | Al cambiar progreso/campania/pantalla | Refresco DOM | Si: derivado, no persistente | Bajo |
| lista de grupos cargados | Respuesta remota de endpoint grupos | DOM select de grupos | identifyUser | loadGroups y reintento manual | Carga inicial y reintentos | Recarga/reset visual | Si: valor elegido persiste en storage | Medio |

## Casos sin propietario unico claramente aislado

1. Progreso de partida: conviven representaciones en progress, progresosCampanas, sessionStorage progress/campaignProgress y estructuras de sesion.
2. Mision actual: conviven currentScreen (legacy), missionOpenedAt, domainSession.progress.currentMissionId, domainRuntime.mission y domainNavigation.currentMissionId.
3. Cierre de partida: conviven bandera complete, sessionData.final.answerCorrect, sessionData.finISO y sessionData.enviada.

## Estados con mayor riesgo de inconsistencia (por evidencia de copias y mutaciones)

- progress
- progresosCampanas
- sessionData
- sessionStats
- domainSession
- pendingResult
- missionIds/mision actual (representacion multiple)
