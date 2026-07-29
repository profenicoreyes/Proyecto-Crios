# GAME_TRANSACTIONS

Objetivo: identificar transacciones logicas del motor actual en terminos de procesos, no de diseno nuevo.

## Transaccion 1: Arranque operativo de partida

- Inicio:
  - Carga de aplicacion en navegador.
- Pasos obligatorios:
  1. Leer configuracion y datos base.
  2. Resolver campania inicial valida.
  3. Reconstruir lista de misiones activas.
  4. Recuperar progreso persistido.
  5. Construir pantalla de mapa/misiones.
  6. Cargar identidad previa y grupos.
  7. Iniciar carga dinamica del dominio.
- Puntos de decision:
  - Si no existe campania publicada: aborta con error tecnico.
  - Si falla carga de grupos: habilita reintento manual.
  - Si falla carga de dominio: continua flujo legacy con warning.
- Efectos secundarios:
  - Lecturas y primeras escrituras en sessionStorage.
  - Listeners de red/salida.
- Estado final esperado:
  - Aplicacion lista para identificacion y seleccion de campania.
- Si se interrumpe:
  - Puede quedar UI parcial sin datos de grupos o sin dominio cargado; el flujo principal puede continuar de forma degradada.

## Transaccion 2: Alta de identidad y apertura de sesion

- Inicio:
  - Envio de identificacion por usuario.
- Pasos obligatorios:
  1. Validar nombre real, personaje y grupo.
  2. Persistir identidad.
  3. Crear sesion de juego nueva.
  4. Reiniciar contadores y progreso de sesion.
  5. Generar datos individuales de misiones.
  6. Enviar snapshot incremental inicial.
- Puntos de decision:
  - Si falta algun campo: no abre sesion y muestra feedback.
- Efectos secundarios:
  - Audio de confirmacion.
  - Cambio visual de login a bienvenida.
- Estado final esperado:
  - Sesion activa con estado inicial consistente.
- Si se interrumpe:
  - Puede quedar identidad guardada sin sesion plenamente actualizada.

## Transaccion 3: Cambio de campania activa

- Inicio:
  - Usuario elige campania publicada.
- Pasos obligatorios:
  1. Guardar avance de campania saliente.
  2. Reemplazar campania y misiones activas.
  3. Cargar progreso de campania elegida.
  4. Reconfigurar estado de mision temporal y pistas.
  5. Actualizar cabecera, selector y mapa.
  6. Sincronizar dominio para nueva campania.
- Puntos de decision:
  - Si campania no publicada: no se aplica cambio.
- Efectos secundarios:
  - Si hay sesion, actualiza contexto de campania dentro de sesion.
- Estado final esperado:
  - Mapa y progreso coherentes con campania seleccionada.
- Si se interrumpe:
  - Riesgo de desalineacion temporal entre vista, sesion y progreso por campania.

## Transaccion 4: Resolver mision

- Inicio:
  - Usuario abre modulo y envia procedimiento/respuesta.
- Pasos obligatorios:
  1. Abrir mision y registrar instante de entrada.
  2. Validar procedimiento.
  3. Registrar intento y feedback.
  4. Validar resultado numerico.
  5. Aplicar consecuencias de evaluacion.
  6. Si es correcta: marcar progreso, acumular tiempo, guardar.
  7. Encolar envio incremental.
  8. Volver al mapa (rama correcta o cierre manual).
- Puntos de decision:
  - Procedimiento compatible o no.
  - Respuesta correcta o incorrecta.
  - Uso de pista antes/durante el intento.
- Efectos secundarios:
  - Actualiza estadisticas, respuestas y tiempos.
  - Puede alterar vidas/continuidad del estado de dominio.
- Estado final esperado:
  - Correcta: mision completada y visible en mapa.
  - Incorrecta: mision pendiente con intentos registrados.
- Si se interrumpe:
  - Quedan intentos parciales persistidos; progreso puede no haberse marcado.

## Transaccion 5: Envio incremental de sesion

- Inicio:
  - Cambio de pantalla, pista, procedimiento o respuesta.
- Pasos obligatorios:
  1. Debounce temporal.
  2. Construir payload de estado en curso.
  3. Enviar por red.
  4. Si falla: almacenar pendiente local.
- Puntos de decision:
  - Canal libre u ocupado (cola).
  - Exito o fallo de red.
- Efectos secundarios:
  - Actualiza estado de envio visible.
- Estado final esperado:
  - Estado remoto actualizado o pendiente local registrado.
- Si se interrumpe:
  - Queda pending local para reintento.

## Transaccion 6: Cierre final de campania

- Inicio:
  - Usuario resuelve etapa final con resultado correcto.
- Pasos obligatorios:
  1. Registrar intentos y resultado final.
  2. Marcar bandera de completado.
  3. Calcular evaluacion agregada.
  4. Cerrar sesion (marca de fin).
  5. Enviar estado final.
  6. Transicionar a creditos.
- Puntos de decision:
  - Procedimiento final habilita o no el resultado.
  - Resultado final correcto o incorrecto.
  - Exito o fallo del envio final.
- Efectos secundarios:
  - Actualiza resumen final y estado de transmision.
- Estado final esperado:
  - Sesion finalizada y creditos visibles.
- Si se interrumpe:
  - Puede quedar sesion finalizada localmente con envio pendiente.

## Transaccion 7: Recuperacion de envio pendiente

- Inicio:
  - Inicio de app, reconexion de red, o snapshot de salida con falla.
- Pasos obligatorios:
  1. Leer payload pendiente.
  2. Verificar conectividad.
  3. Reenviar.
  4. Limpiar pendiente en exito.
- Puntos de decision:
  - Hay o no pendiente.
  - Hay o no conectividad.
- Efectos secundarios:
  - Ningun cambio visual obligatorio en juego.
- Estado final esperado:
  - Pendiente borrado o conservado para nuevo intento.
- Si se interrumpe:
  - Permanece pendiente local.

## Transaccion 8: Reinicio total de sesion

- Inicio:
  - Usuario confirma nueva sesion/cambio de identidad.
- Pasos obligatorios:
  1. Limpiar estado en memoria.
  2. Limpiar storage de progreso, identidad, sesion y pendientes.
  3. Reestablecer campania inicial.
  4. Limpiar formularios y feedback de UI.
  5. Volver a pantalla de identificacion y recargar grupos.
- Puntos de decision:
  - Confirmacion positiva o cancelacion.
- Efectos secundarios:
  - Pérdida total del progreso actual de la sesion.
- Estado final esperado:
  - Entorno listo para una sesion nueva.
- Si se interrumpe:
  - Posible limpieza parcial entre memoria y storage.

## Transaccion 9: Snapshot de salida

- Inicio:
  - Ocultar/cerrar pagina.
- Pasos obligatorios:
  1. Construir snapshot de estado actual.
  2. Intentar envio por beacon.
  3. Fallback a fetch keepalive.
  4. Si falla, guardar pendiente.
- Puntos de decision:
  - Beacon disponible o no.
  - Exito/fallo de red.
- Efectos secundarios:
  - Puede crearse pending local aun sin cierre final.
- Estado final esperado:
  - Ultimo estado intentado hacia backend.
- Si se interrumpe:
  - Queda pendiente local para proximo arranque.

## Cobertura transaccional de una partida completa

Las transacciones 1, 2, 3, 4 (repetida por mision), 5 (recurrente), 6 y 9 describen la partida completa de inicio a cierre.

## Comprobacion directa

- Resultado: los procesos documentados cubren arranque, identificacion, seleccion de campania, ciclo de mision, persistencia incremental, cierre final y salida.

## Comprobacion inversa

- Resultado: desde estados terminales (creditos, progreso persistido, cierre final, pending de envio) se puede reconstruir hacia atras la cadena de procesos que los origina.
- Faltantes detectados: ninguno critico para reconstruccion del flujo principal.
