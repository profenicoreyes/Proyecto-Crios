# Evidencia de publicación: sincronización de estado y progreso (2026-09-03)

## Estado

Este documento registra el cierre documental de la publicación acumulada del candidato de sincronización de estado/progreso en CRIOS.

No asigna identificador definitivo de etapa.

## Alcance de publicación

- rama candidata validada: `codex/game-state-progress-sync`;
- commit publicado en `main`: `9971b46d603090246e2d7e3356ecfd8d5dfaeca2`;
- estrategia Git: push por fast-forward sin force-push;
- backend Apps Script y Firebase: sin cambios en este cierre (ya desplegados);
- versión Apps Script informada por el operador: `10`.

## Verificaciones previas y externas

### Gate externo de presencia v10

Resultado: PASS.

Observación reportada tras `310000 ms` sin heartbeat:

- `registeredParticipantCount=2`
- `activeParticipantCount=0`
- `activePlayerCount=0`
- `playerConnected=false`

La versión 10 fue informada por el operador; el comportamiento de cinco minutos fue verificado externamente contra el endpoint desplegado.

### Firebase real

- `presence-change`: PASS
- `game-state-change`: PASS

### Smoke remoto multi-actor (Host + P1 + P2)

- resultado agregado: `25/25 PASS`;
- ingreso tardío: PASS;
- progreso compartido: `0/2 -> 1/2 -> 2/2` PASS;
- señal hacia Host: PASS;
- recuperación de outbox tras falla transitoria: PASS.

## Verificación local de regresión

- Node: `38/38` suites, `3038/3038` comprobaciones;
- browser local: `125/125` comprobaciones.

## Verificación pública post-push (GitHub Pages, cache-busting)

Base pública validada:

- `https://profenicoreyes.github.io/Proyecto-Crios/`

Smokes públicos ejecutados con query `cb=`:

1. `tests/runtime-live-room-game-state-browser-smoke.test.html`
- resultado: `PASS 39/39`

2. `tests/host-live-room-game-state-browser-smoke.test.html`
- resultado: `PASS 25/25`

3. `tests/live-room-foreground-browser-smoke.test.html`
- resultado: `PASS 36/36`

4. `tests/runtime-live-room-game-state-game-projection-browser-smoke.test.html`
- resultado: `PASS 25/25`

No se registraron capabilities, tokens ni payloads sensibles en esta evidencia.

## Relación con evidencia histórica

La evidencia previa del 2026-08-31 se conserva intacta y separada:

- `docs/evidence/GAME_STATE_PROGRESS_SYNC_REMOTE_EVIDENCE_2026-08-31.md`

Este cierre no modifica ese documento histórico.

## Conclusión

La publicación acumulada del candidato de sincronización de estado/progreso en `9971b46d603090246e2d7e3356ecfd8d5dfaeca2` queda validada documentalmente con resultados PASS en verificación externa, Firebase real, smoke remoto multi-actor, regresión local y smokes públicos en GitHub Pages.
