# Decisión de seguridad del canal Firebase de señales LiveRoom

## Estado

Esta decisión corresponde al candidato local `626563afd1c1a88ba1905220abe20ded90774186` y responde a la auditoría independiente del salto acumulado desde `81e39c5d89633ca6c13d0f732f3e940533f475b6`. No asigna un identificador de roadmap, no modifica reglas y no autoriza bundle, push ni despliegue.

## Hechos verificados

- Apps Script LiveRoom es la única autoridad de sala, presencia, expiración y progreso compartido.
- Firebase Realtime Database transporta señales de invalidación no autoritativas.
- `roomId` se genera en Apps Script mediante `Utilities.getUuid()` y forma parte del enlace público de acceso del jugador.
- Firebase Anonymous Authentication identifica una conexión Firebase; no demuestra membresía CRIOS ni reemplaza una capability.
- La regla local permite leer `/liveRoomSignals/{roomId}` a cualquier identidad Firebase autenticada que conozca ese `roomId`.
- Cada identidad solo puede escribir bajo su propio `firebaseUid`.
- El payload admite exactamente `type`, `eventId` y `emittedAt`; la ruta contiene `roomId` y `firebaseUid`.
- No se almacenan capability, `participantId` CRIOS, roster, respuestas, resultados, progreso, vidas, intentos, identidad personal ni datos de sesión.

## Riesgo residual

Una persona que obtenga el enlace o el `roomId` y cree una identidad Firebase anónima puede observar que se emitieron señales, su tipo y su hora, sin demostrar previamente que integra la room ante Apps Script. También puede observar los UIDs Firebase efímeros presentes en esa ruta.

La entropía del UUID reduce la enumeración casual, pero no protege un enlace divulgado. El canal no concede capacidad para leer el roster o el progreso, completar misiones, mantener viva la sala ni mutar ninguna fuente autoritativa.

## Decisión

Para la primera versión signal-only se acepta provisionalmente esta exposición acotada de metadatos técnicos. Se clasifica como riesgo residual de confidencialidad bajo, no como autorización de sala ni como fuente de datos pedagógicos.

La aceptación depende de estas condiciones no negociables:

- las señales continúan sin datos pedagógicos, identidad CRIOS, secretos o snapshots;
- recibir una señal solo agenda una lectura autenticada a Apps Script;
- Apps Script revalida sala, participante, capability y rol para cada operación protegida;
- Firebase niega acceso por defecto fuera del namespace exacto;
- la escritura permanece limitada al UID propio y rechaza campos o tipos adicionales;
- la aplicación conserva fallback y degradación segura si Firebase falla.

La expresión «presencia autorizada» se refiere al roster de Apps Script. Una identidad Firebase autenticada no equivale a una presencia LiveRoom autorizada.

## Alternativas no adoptadas en este cierre

No se transportará una capability CRIOS en rutas, payloads o configuración Firebase. Tampoco se duplicará membresía autoritativa en RTDB mediante una regla aislada sin un diseño de emisión, revocación, expiración y rollback.

Si se exige confidencialidad incluso para horarios o tipos de señal, la regla actual deja de ser suficiente. Ese requisito necesita una arquitectura nueva —por ejemplo, credenciales Firebase emitidas desde una autoridad confiable o la eliminación del canal realtime— y evidencia independiente.

## Gate previo a publicar reglas

Antes de modificar Firebase deben cumplirse en orden:

1. leer y conservar desde la consola autenticada las reglas actualmente publicadas;
2. comparar ese snapshot con la regla versionada anterior y con la candidata;
3. confirmar que el único cambio esperado incorpora `game-state-change` al tipo permitido;
4. ejecutar smoke remoto de lectura sin autenticación denegada, escritura propia permitida, UID ajeno denegado, campos extra denegados, tipos inválidos denegados y limpieza completa;
5. verificar que `presence-change` y `game-state-change` nunca contienen datos fuera del contrato;
6. registrar versión, fecha, resultado y rollback exacto.

Este gate no sustituye el despliegue coherente de Apps Script ni el smoke real con host y jugadores independientes.
