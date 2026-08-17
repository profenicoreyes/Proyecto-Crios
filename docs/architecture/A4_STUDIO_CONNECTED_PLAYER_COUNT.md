# A4-003B — Conteo visible de jugadores conectados en Studio

## Objetivo

Hacer visible al anfitrión el primer estado compartido de una `LiveRoom`: la presencia de jugadores conectados, sin convertir el progreso pedagógico local en estado remoto.

## Flujo

1. `LiveRoomBackend.gs` mantiene la fuente autoritativa de presencia.
2. El contrato remoto incorpora `getLiveRoomRoster`.
3. El cliente remoto obtiene la capability efímera del anfitrión desde `sessionStorage` y la usa solo en la solicitud.
4. Studio consulta el roster al crear o recuperar una sala y luego cada 15 segundos mientras la sala está activa.
5. Studio muestra `Jugadores conectados: N`, donde `N` es `activePlayerCount` y no incluye al anfitrión.

## Propiedades de seguridad y ciclo de vida

- `getLiveRoomRoster` requiere capability válida del participante con rol `host`.
- La capability no forma parte del snapshot ni del estado visible de Studio.
- Leer el roster no actualiza `lastActivityAt`, `expiresAt` ni `lastSeenAt`.
- El polling del roster no puede mantener viva una sala.
- La regla de expiración sigue siendo estrictamente: más de 10 minutos sin actividad válida de host ni jugadores.
- Si la sala expira, Studio elimina el contexto efímero del anfitrión y no intenta reactivarla.

## Alcance deliberadamente excluido

A4-003B no sincroniza:

- vidas;
- respuestas;
- misión actual;
- progreso de misión o campaña;
- `StudentSession`;
- `sessionData/sessionStats` legacy;
- `idSesion` del backend de resultados.

Esos estados siguen teniendo una sola fuente de verdad local hasta que un bloque posterior defina explícitamente su ownership remoto.
