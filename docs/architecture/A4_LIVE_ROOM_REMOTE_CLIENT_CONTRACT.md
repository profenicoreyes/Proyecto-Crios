# A4-001C — Contrato y cliente remoto de LiveRoom

## Objetivo

A4-001C establece la frontera JavaScript para consumir el backend remoto de salas efímeras agregado en A4-001B. No conecta todavía Studio ni Runtime.

## Separación de dominios

`LiveRoom` permanece separado de:

- la publicación inmutable (`campaignId + publicationId`), que es persistente;
- `StudentSession`, que representa progreso individual local;
- los identificadores legacy de envío de resultados.

La sala es un recurso remoto efímero. Su inactividad se decide exclusivamente con el reloj del servidor y el timeout contractual de 600000 ms.

## Contrato remoto

El contrato JavaScript expone únicamente:

- `createLiveRoom`;
- `joinLiveRoom`;
- `heartbeatLiveRoom`;
- `getLiveRoom`.

No existen operaciones de borrar, reactivar, activar ni desactivar salas.

Las respuestas válidas preservan el vínculo exacto con `campaignId + publicationId`, no incluyen secretos y validan que `expiresAt = lastActivityAt + 600000 ms`.

## Capability interna

La capability no es una contraseña ni un dato que deba escribir el usuario.

El cliente:

1. genera 32 bytes criptográficamente aleatorios;
2. envía la capability solo al crear/unirse/heartbeat;
3. conserva la capability en `sessionStorage` del navegador para sobrevivir recargas de la pestaña;
4. nunca la incluye en el resultado público del cliente;
5. falla en cerrado si no dispone de generación criptográfica o almacenamiento de sesión.

El servidor continúa almacenando solamente SHA-256 de la capability, según A4-001B.

## Transporte

Todas las operaciones LiveRoom usan POST al mismo endpoint remoto de CRIOS con un sobre dedicado:

`{ liveRoomRequest: request }`

Esto mantiene el tráfico de salas disjunto tanto del sobre de publicación `{ request }` como del POST legacy de resultados.

`getLiveRoom` es una lectura lógica: aunque viaje por POST, el backend no actualiza `lastActivityAt`.

## Archivos

- `js/live-room/remote/live-room-contract.js`
- `js/live-room/remote/live-room-client.js`
- `tests/live-room-remote-contract-node.test.js`
- `tests/live-room-remote-client-node.test.js`

## No objetivos

A4-001C no:

- carga estos scripts desde Studio o Runtime;
- crea botones o enlaces de sala;
- inicia heartbeat periódico;
- define todavía la URL compartible de una sala;
- cambia el backend desplegado;
- modifica publicaciones ni sesiones locales existentes.

## Próximo paso

A4-001D debe integrar el contrato/cliente como infraestructura compartida en navegador, manteniendo todavía separada la UI. Luego se podrán construir el flujo host en Studio y el join/heartbeat del jugador en Runtime.
