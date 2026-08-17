# A4-003C — Consola de mando del anfitrión

## Objetivo

Separar el monitoreo operativo de una partida en vivo del entorno de autoría de Studio.

Después de crear una `LiveRoom`, Studio redirige al docente a `/host/`. La consola recupera el contexto del anfitrión desde `sessionStorage`; la capability nunca forma parte de la URL.

## Responsabilidades de este tramo

- Redirigir desde **Iniciar partida** hacia la consola de mando.
- Recuperar la misma sala y la misma identidad interna de host.
- Mantener heartbeat del anfitrión.
- Consultar roster y mostrar presencia en una superficie dedicada.
- Conservar temporalmente el refresco de roster cada 15 s ya validado en A4-003B.
- Mostrar información visual que tenga significado operativo:
  - contador de jugadores activos;
  - lista de participantes y estado de presencia;
  - mapa compacto de nodos de presencia;
  - tendencia local de conexiones recientes;
  - edad del último dato válido.

La tendencia solo representa **cantidad de conexiones observadas por la consola**. No representa progreso, rendimiento ni evaluación.

## URL y seguridad

La URL de la consola puede contener:

- `roomId`;
- `campaignId`;
- `publicationId`.

No contiene capability ni otro secreto. La capability continúa en el almacenamiento efímero de la pestaña y el cliente remoto la recupera desde allí.

Si la URL no coincide con el contexto guardado, la consola falla cerrada.

## Estado y expiración

La publicación continúa siendo persistente.

La sala continúa siendo efímera y vence con la regla ya definida de más de 10 minutos sin actividad válida de host o jugadores. Una sala vencida no se reactiva.

## Alcance diferido

Este tramo no agrega todavía:

- modal Compartir;
- QR;
- Web Share API;
- correo/WhatsApp;
- transporte push o tiempo real definitivo;
- progreso de misión, respuestas o resultados remotos.

El polling de 15 s se mantiene solo como transporte intermedio validado. La consola queda desacoplada visualmente para poder reemplazarlo por una actualización prácticamente inmediata sin rediseñar la interfaz.
