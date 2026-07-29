# EVENT_FLOW_MATRIX

Base utilizada: flujo real del juego en codigo ejecutable actual.

## Matriz completa de eventos

| Evento | Quien lo genera | Que estado necesita | Que procesos dispara | Que estados modifica | Que render provoca | Que persistencia provoca | Que evento ocurre despues |
|---|---|---|---|---|---|---|---|
| Carga de documento | Navegador al abrir index | Scripts base disponibles | Bootstrap del motor, lectura de storage, init campania y UI | campaniaActiva, missionIds, progress, sessionData inicial | Pantalla intro activa, mapa y selector preconstruidos | Lee campaignId, campaignProgress, progress, sessionStats, sessionData | Inicio de progreso de intro y carga dinamica de dominio |
| Finaliza progreso de boot visual | requestAnimationFrame de intro | bootStart/bootDuration | Marca intro lista para activacion | introReady=true | Texto de prompt habilitado | Ninguna | Espera gesto del usuario |
| Click/Enter en intro | Usuario | introReady=true e introActivated=false | Activa secuencia intro, audio, transicion temporizada | introActivated=true, estado audio | Cambio intro -> aria | Ninguna | Navegacion a pantalla aria |
| Click iniciar analisis historico | Usuario | Pantalla aria activa | Navegacion a record1 | currentScreen, historial de pantallas | record1 activa | Guarda sessionData si existe, cola envio incremental | Evento de siguiente boton historico |
| Click procesar siguiente registro | Usuario | record1 activo | Navegacion a record2 | currentScreen, historial | record2 activa | Igual que arriba | Evento ejecutar correlacion |
| Click ejecutar correlacion | Usuario | record2 activo | Navegacion reveal | currentScreen, historial | reveal activa; alterna bloques login/welcome segun identidad | Guarda pantalla en sesion + cola de envio | Identificacion o seleccion campania |
| Carga de grupos remota | Proceso automatico al iniciar/reiniciar | endpoint de resultados disponible | fetch grupos, poblar select | Estado visual de grupo y habilitacion boton | Mensaje de carga/exito/error | Ninguna persistencia de grupos completa, solo eventual seleccion guardada | Evento identifyUser o reintento loadGroups |
| Submit de identificacion valido | Usuario (boton o Enter) | realName, characterName, groupName no vacios | Crear sesion, envio incremental inicial, audio, generar datos de mision | sessionData, sessionStats, progress, identity storages | Oculta login, muestra bienvenida | setItem realName/groupName/characterName; sessionData/sessionStats/progress | Evento abrir selector de campanias |
| Submit de identificacion invalido | Usuario | Campos incompletos | Mostrar feedback de validacion | Ningun estado central de juego cambia | Mensaje de error en formulario | Ninguna | Reintento identify |
| Click seleccionar campania | Usuario | reveal con sesion/identidad | Render selector y navegacion campanas | currentScreen/historial | Pantalla campanas activa | Registro de pantalla en sesion + cola envio | Evento detalle campania |
| Click tarjeta de campania | Usuario | Catalogo campanias | Mostrar detalle campania | Estado visual de seleccion | Panel detalle actualizado | Ninguna | Evento iniciar/continuar campania |
| Click iniciar/continuar campania | Usuario | Campania publicada elegida | Establecer campania activa y opcional navegar mapa | campaniaActiva, missionIds, progress, missionData reset, hintRegistered reset, missionOpenedAt reset | Cabecera/mapa/selector actualizados, mapa activo | setItem campaignId; write campaignProgress/progress; persistSession si existe | Evento abrir mision o final |
| Click abrir modulo de mision | Usuario | missionIds activos, mision disponible | Resolver mision via dominio, render mision, marcar hora apertura, navegar | missionOpenedAt[mision] | Pantalla mission-X activa con contenido individual | Registro de pantalla + cola envio | Eventos pista/procedimiento/respuesta |
| Click solicitar asistencia | Usuario | Mision abierta y pista no registrada | Marcar uso de pista | hintRegistered[mision], sessionStats.hints, sessionData.misiones[mision].hintUsed | Estado details/feedback de pista visible | persist sessionStats/sessionData + cola envio | Continua en mision |
| Click verificar procedimiento (mision) | Usuario | Mision abierta, missionData disponible | Evaluar expresion y datos esenciales | sessionStats.procedureAttempts, sessionData.misiones.procedure/procedureCorrect | Feedback ok/bad y posible desbloqueo de resultado | persist sessionStats/sessionData + cola envio | Evento ejecutar reparacion o reintento procedimiento |
| Click ejecutar reparacion (respuesta mision) | Usuario | Resultado ingresado, expected disponible | Comparar respuesta, aplicar consecuencias de jugador, actualizar progreso segun rama | sessionStats.attempts, sessionData.misiones.answer/answerCorrect, progress en rama correcta, sessionStats.completed/timeMs en rama correcta | Feedback ok/bad; en correcta retorno diferido al mapa | persist sessionStats/sessionData; save en correcta; cola envio | Rama correcta: go map; rama incorrecta: reintento en mision |
| Evento interno evaluacion correcta | Proceso de validacion de respuesta | Respuesta == expected | Marcar completada y guardar | progress[mision]=true, sessionStats.completed=true | Mapa mostrara modulo recuperado | write campaignProgress/progress/sessionData | Evento updateMap y habilitacion potencial final |
| Evento interno evaluacion incorrecta | Proceso de validacion de respuesta | Respuesta != expected | Registrar fallo y mantener mision abierta | answerCorrect=false, player-state dominio puede restar vidas | Feedback de error | persistSession + cola envio | Reintento en mision |
| Cambio de pantalla go(map) | Flujo interno o usuario | Cualquier estado | Registro de pantalla, updateMap | currentScreen, sessionData.pantallas | Mapa activo, barra progreso, boton final habilitado o no | persistSession + cola envio | Abrir otra mision o final |
| Click ejecutar protocolo final | Usuario | done==total en mapa | Navegar final + render consolidado | currentScreen | Pantalla final activa con instrucciones individuales | registro de pantalla + cola envio | Verificar procedimiento final |
| Click verificar procedimiento final | Usuario | Datos finales disponibles | Validar expresion final y datos esenciales | sessionData.final.procedure/procedureAttempts/procedureCorrect | Feedback final y desbloqueo de resultado final | persistSession + cola envio | Estabilizar o reintentar |
| Click estabilizar (resultado final) correcto | Usuario | Resultado final correcto | Cierre de sesion, evaluacion resumen, transmision final, transicion creditos | sessionData.final.answerCorrect, complete flag, sessionData.finISO/enviada/evaluacion | Estado final exitoso y luego creditos | setItem complete, persistSession, fetch final, remove pendingResult si exito | Evento creditos |
| Click estabilizar incorrecto | Usuario | Resultado final incorrecto | Feedback de fallo final | sessionData.final.answerCorrect=false, attempts++ | Mensaje de red inestable | persistSession + cola envio | Reintento resultado final |
| Evento cola envio incremental | Debounce interno | sessionData existente | sendSessionUpdate(false) | transmissionBusy/transmissionQueued | Texto de estado de envio puede cambiar | fetch incremental, fallback pendingResult | Puede encolar nuevo envio |
| Evento envio final | Flujo cierre final | sessionData finalizable | sendSessionUpdate(true) | finISO/enviada/evaluacion/pendingResult | Mensaje transmitido o pendiente | fetch final + remove/set pending | Transicion a creditos |
| Evento online | Navegador | pendingResult presente + online | retry pendiente | pendingResult puede eliminarse | Ningun render obligatorio | fetch pending y remove localStorage en exito | Retorno a flujo normal |
| Evento pagehide | Navegador al salir | sessionData y endpoint | Snapshot de salida | No muta juego principal | Ningun render | sendBeacon o fetch keepalive, fallback pendingResult | Salida completa |
| Evento visibilitychange hidden | Navegador | sessionData y endpoint | Snapshot de salida | Igual que pagehide | Ningun render | Igual que pagehide | Salida/ocultamiento |
| Click nueva sesion/cambiar identidad | Usuario confirma | confirm true | Limpieza integral de estado y storage, reinicializacion campania, retorno reveal, recarga grupos | progress/sessionData/sessionStats/missionData/hints/timers/campaign flags | Limpia inputs/feedback, reveal activa | removeItem masivo + write inicial campania | Nuevo ciclo de identificacion |
| Click abrir mapa desde creditos | Usuario | creditos activo | Navegacion al mapa | currentScreen | Mapa activo con progreso persistido | registro de pantalla + cola envio | Continuacion de campania |

## Eventos internos no visibles pero obligatorios

1. Carga dinamica de contratos de dominio al iniciar.
2. Rebuild de estado de dominio al quedar listo el dominio y al cambiar campania.
3. Sincronizacion de mision en session de dominio antes de evaluar.
4. Recalculo de runtime/navigation de dominio luego de cada evaluacion aplicada.
5. Debounce de envio incremental por temporizador.
6. Cola de envio para evitar concurrencia entre updates y cierre final.

## Cadena principal de eventos de partida (resumen)

Carga -> Intro lista -> Activacion intro -> Narrativa -> Identificacion -> Seleccion campania -> Mapa -> Mision -> Procedimiento -> Respuesta -> Guardado/retorno -> Repeticion -> Final -> Cierre -> Creditos.
