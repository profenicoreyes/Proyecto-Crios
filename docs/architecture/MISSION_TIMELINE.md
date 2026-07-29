# MISSION_TIMELINE

Objetivo: cronologia completa de una mision del flujo real actual.

Convenciones:
- Tiempo logico T0..Tn.
- Se muestran dos ramas cuando corresponda: correcta e incorrecta.

## Cronologia detallada

### T0

- Evento: Jugador pulsa un modulo en el mapa.
- Estado antes:
  - Campania activa definida.
  - missionIds cargados.
  - progress con estado actual de completitud.
- Estado despues:
  - Se solicita apertura de mision objetivo.
- Render:
  - Aun en mapa.
- Persistencia:
  - Ninguna directa en este instante.
- Siguiente evento:
  - Resolucion de id de mision y render de contenido.

### T1

- Evento: Resolucion de mision activa (incluye coherencia con dominio si esta disponible).
- Estado antes:
  - id solicitado por click.
  - domainReady puede ser true o false.
- Estado despues:
  - id final de mision a abrir confirmado.
- Render:
  - Todavia sin cambio visible final.
- Persistencia:
  - Ninguna.
- Siguiente evento:
  - Render de mision.

### T2

- Evento: Render de mision.
- Estado antes:
  - missionData puede no estar generado para la identidad actual.
- Estado despues:
  - missionData garantizado/regenerado.
  - Contenido textual, pregunta, SVG y pista cargados en DOM.
- Render:
  - Se completa pantalla de mision con variante individual.
- Persistencia:
  - Ninguna.
- Siguiente evento:
  - Registro de hora de apertura y navegacion a pantalla de mision.

### T3

- Evento: Registro de inicio temporal de la mision.
- Estado antes:
  - missionOpenedAt sin marca para esta mision o con marca anterior.
- Estado despues:
  - missionOpenedAt[mision] = tiempo actual.
- Render:
  - Sin cambio adicional.
- Persistencia:
  - Ninguna.
- Siguiente evento:
  - Cambio de pantalla a mission-X.

### T4

- Evento: Cambio de pantalla a mission-X.
- Estado antes:
  - currentScreen en map.
  - sessionData puede existir (si sesion iniciada).
- Estado despues:
  - currentScreen actualizado.
  - Si hay sesion: se agrega registro en historial de pantallas.
- Render:
  - Pantalla de mision activa, mapa oculto.
- Persistencia:
  - Si hay sesion: persiste sessionData y se encola envio incremental.
- Siguiente evento:
  - Interaccion del jugador (pista, procedimiento o cierre manual).

### T5 (opcional)

- Evento: Jugador solicita pista.
- Estado antes:
  - hintRegistered[mision] false o indefinido.
- Estado despues:
  - hintRegistered[mision] true.
  - sessionStats[mision].hints +1.
  - sessionData.misiones[mision].hintUsed true.
- Render:
  - Se visualiza contenido de pista.
- Persistencia:
  - Se persiste sessionStats/sessionData y se encola envio.
- Siguiente evento:
  - Jugador escribe procedimiento.

### T6

- Evento: Jugador pulsa verificar procedimiento.
- Estado antes:
  - Campo procedure con expresion.
  - sessionStats/sessionData existentes o inicializables por mision.
- Estado despues:
  - sessionStats[mision].procedureAttempts +1.
  - sessionData.misiones[mision].procedure actualizado.
  - sessionData.misiones[mision].expected actualizado.
- Render:
  - Aun sin feedback definitivo.
- Persistencia:
  - Persistencia inicial de intento (stats/sesion).
- Siguiente evento:
  - Evaluacion de expresion.

### T7

- Evento: Evaluacion de procedimiento.
- Estado antes:
  - Expresion normalizable y expected disponible.
- Estado despues (subcasos):
  1) Procedimiento compatible:
     - procedureCorrect true.
     - Paso de resultado desbloqueado.
  2) Valor coincide pero faltan datos esenciales:
     - procedureCorrect false.
     - Paso de resultado permanece bloqueado.
  3) Valor no coincide o expresion invalida:
     - procedureCorrect false.
- Render:
  - Feedback ok o bad segun subcaso.
- Persistencia:
  - Persiste sessionData y se encola envio.
- Siguiente evento:
  - Si desbloqueado: respuesta final de mision.
  - Si no: reintento de procedimiento.

### T8

- Evento: Jugador pulsa ejecutar reparacion (respuesta mision).
- Estado antes:
  - Campo answer con valor.
  - expected disponible.
- Estado despues:
  - sessionStats[mision].attempts +1.
  - sessionData.misiones[mision].answer actualizado.
  - sessionData.misiones[mision].expected reafirmado.
- Render:
  - Aun sin feedback final.
- Persistencia:
  - Se persisten stats iniciales del intento.
- Siguiente evento:
  - Comparacion numerica de respuesta.

### T9A (rama correcta)

- Evento: Respuesta correcta.
- Estado antes:
  - value == expected.
- Estado despues:
  - Consecuencia de jugador aplicada como correcta en dominio.
  - progress[mision] true.
  - sessionStats[mision].completed true.
  - sessionStats[mision].timeMs acumulado con missionOpenedAt.
  - sessionData.misiones[mision].answerCorrect true.
  - sessionData.misiones[mision].timeMs actualizado.
- Render:
  - Feedback de exito inmediato en mision.
- Persistencia:
  - PersistStats + guardado de progreso por campania + progreso actual + sesion.
  - Encolado de envio incremental.
- Siguiente evento:
  - Retorno diferido al mapa.

### T10A

- Evento: Retorno diferido al mapa.
- Estado antes:
  - mision en pantalla con feedback ok.
- Estado despues:
  - currentScreen map.
  - historial de pantallas actualizado.
- Render:
  - Mapa activo.
  - Modulo aparece recuperado.
  - Barra y contador recalculados.
  - Boton final habilitado si completadas == total.
- Persistencia:
  - Registro de pantalla + encolado envio.
- Siguiente evento:
  - Abrir otra mision o pasar a final.

### T9B (rama incorrecta)

- Evento: Respuesta incorrecta.
- Estado antes:
  - value != expected.
- Estado despues:
  - Consecuencia de jugador aplicada como incorrecta en dominio.
  - sessionData.misiones[mision].answerCorrect false.
  - progress no cambia.
  - sessionStats.completed no cambia.
- Render:
  - Feedback de error y permanencia en la misma mision.
- Persistencia:
  - PersistSession + cola de envio incremental.
- Siguiente evento:
  - Reintento de procedimiento o respuesta.

### T10B

- Evento: Reintento en mision.
- Estado antes:
  - mision sigue abierta.
- Estado despues:
  - Se repite ciclo T6-T9 hasta resolver o cerrar manualmente.
- Render:
  - Misma pantalla de mision.
- Persistencia:
  - Nuevos intentos y envios incrementales.
- Siguiente evento:
  - Respuesta correcta futura o cierre manual al mapa.

### T11 (cierre manual alternativo)

- Evento: Jugador pulsa cerrar modulo sin resolver.
- Estado antes:
  - mision abierta.
- Estado despues:
  - currentScreen map.
  - progress sin cambio.
- Render:
  - Mapa con estado previo.
- Persistencia:
  - Registro de pantalla y cola envio.
- Siguiente evento:
  - Abrir mision (misma u otra).

## Cobertura de cambios de estado de una mision

- Apertura: missionOpenedAt.
- Interaccion: sessionStats.procedureAttempts, sessionStats.attempts, sessionStats.hints.
- Registro de datos: sessionData.misiones[mision].procedure/answer/expected/procedureCorrect/answerCorrect/timeMs/hintUsed.
- Resultado correcto: progress[mision], sessionStats.completed/timeMs.
- Navegacion: currentScreen y sessionData.pantallas.
- Persistencia: sessionStorage progress/campaignProgress/sessionStats/sessionData y envio incremental.
