# Evidencia remota parcial de sincronización de progreso

## Estado y alcance

Este documento separa el despliegue base observado del candidato local posterior de resiliencia. No asigna un identificador de roadmap, no declara cerrada la sincronización remota integral y no autoriza commit, bundle, push ni despliegues adicionales.

## Publicación aportada por el operador

El operador informó la publicación de Apps Script versión 9 el 21 de agosto de 2026 sobre el endpoint público ya configurado:

`https://script.google.com/macros/s/AKfycbwq4tKzIuPfJJ2tOEAHpEhLsg7tmWvPYQ5fJ8jLgo74lo1BT0Fw_eNgtE53VsMb_e33bA/exec`

También aportó desde Firebase Console las reglas posteriores a la publicación. Ese contenido coincide estructuralmente con `firebase/realtime-database.rules.json`: denegación explícita en raíz, validación cerrada del payload y enum limitado a `presence-change` o `game-state-change`. Esta procedencia es evidencia del operador; no se realizó una lectura autenticada independiente de las reglas remotas.

El smoke manual posterior observó host y jugadores conectados, y un Runtime mostró progreso `1/2`. La captura disponible de la consola permaneció en `0/2` y se observaron timeouts transitorios. Por eso esa ejecución demuestra disponibilidad parcial, pero no cierra propagación extremo a extremo, recuperación ni carga real.

## Consulta independiente de solo lectura

El 31 de agosto de 2026 se envió una única solicitud `getLiveRoomGameState` con:

- `roomId` deliberadamente inexistente;
- `participantId` sintético;
- capability falsa de longitud válida;
- `requestId` `codex-readonly-game-state-preflight-20260831`.

La respuesta exacta relevante fue:

```json
{
  "protocolVersion": "1.0",
  "operation": "getLiveRoomGameState",
  "requestId": "codex-readonly-game-state-preflight-20260831",
  "success": false,
  "data": null,
  "error": {
    "code": "ROOM_UNAVAILABLE",
    "message": "LiveRoom is unavailable.",
    "retryable": false
  }
}
```

La consulta no crea sala, no renueva presencia, no escribe progreso y no registra idempotencia. El resultado prueba que el endpoint publicado reconoce la operación; no prueba lectura autorizada de una sala real, `completeLiveRoomMission`, señal Firebase, actualización de consola ni capacidad concurrente.

## Separación del candidato actual

La publicación base anterior no incluye necesariamente el perfil local posterior documentado en `LIVE_ROOM_NETWORK_RESILIENCE.md`: timeout HTTP de 30 segundos, presencia derivada de cinco minutos, polling de roster de 30 segundos, gate de foreground, guards de generación y cobertura browser 36/36. Ese candidato continúa local y requiere aprobación y smoke remoto propios.

## Gates pendientes

1. Reconfirmar de forma autenticada las reglas Firebase antes de cualquier publicación adicional.
2. Publicar de manera coherente el frontend acumulado y el backend exacto solo con aprobación separada.
3. Ejecutar un smoke con host y al menos dos jugadores en navegadores o dispositivos independientes.
4. Verificar avance `0/2 -> 1/2 -> 2/2` en Runtime y consola, señales tipadas, entrada tardía, pestaña oculta y retorno a foco.
5. Registrar latencias, timeouts, errores de lock y rollback exacto.
