# A4-002B — Runtime LiveRoom player flow

## Objetivo

Conectar el enlace de estudiante generado por Studio con la `LiveRoom` remota sin mezclarla con `StudentSession`, con el `idSesion` de resultados ni con la publicación inmutable.

## Contrato visible

- Un Runtime sin `roomId` conserva el comportamiento previo y no realiza operaciones de LiveRoom.
- Un enlace de partida requiere una selección Runtime publicada válida más `roomId`.
- Antes de registrar al jugador, Runtime ejecuta `getLiveRoom`; esa lectura no mantiene viva la sala.
- El `campaignId` y `publicationId` de la sala deben coincidir exactamente con la publicación solicitada por el enlace.
- Al unirse, el navegador genera un `participantId` interno y el cliente remoto genera la capability criptográfica. Ninguno se solicita al estudiante.
- La capability continúa almacenada exclusivamente por `live-room-client.js`; el contexto de Runtime solo guarda IDs no secretos.
- La misma pestaña recupera el participante existente mediante heartbeat, evitando un `join` duplicado al recargar.
- Una presencia activa envía heartbeat cada 120 segundos y también solicita recuperación al volver a una pestaña visible o enfocada. Disparos concurrentes comparten la misma solicitud en vuelo.
- `ROOM_EXPIRED` detiene el heartbeat y muestra exactamente: `Esta sesión finalizó por inactividad.`
- Un fallo transitorio de transporte no destruye la presencia local; el siguiente heartbeat puede recuperarla.

El candidato local posterior de resiliencia mantiene esta cadencia, amplía a 30 segundos el timeout HTTP compartido y aplica un gate de foreground por controlador: el primer disparo se acepta, otro anterior a 30000 ms se coalesce, la frontera exacta se acepta y una regresión del reloj no bloquea la recuperación. Todavía no tiene un identificador definitivo de etapa.

## Separación de dominios

La `LiveRoom` solo representa presencia remota de host/jugadores. No altera vidas, progreso, misiones, evaluación, `StudentSession`, historial local ni identidad pedagógica. La publicación sigue siendo persistente y ejecutable aunque la sala asociada haya vencido.

## Fuera de alcance de A4-002B

- conteo/listado de jugadores visible para el host;
- sincronización de progreso entre jugadores;
- cierre manual de sala;
- reactivación de salas vencidas;
- eliminación física inmediata de registros vencidos.
