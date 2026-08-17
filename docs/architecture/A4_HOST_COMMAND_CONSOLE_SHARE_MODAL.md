# A4-003D — Refinamiento de Consola de mando y modal Compartir

## Objetivo

Consolidar la Consola de mando como superficie operativa del docente y sacar del dashboard el enlace técnico permanente. Compartir pasa a ser una acción explícita en el encabezado.

## Decisiones

- `Studio` continúa creando/recuperando la `LiveRoom` y redirige a `/host/`.
- La consola muestra el nombre de campaña guardado en el contexto del anfitrión cuando está disponible; los identificadores técnicos quedan fuera de la jerarquía principal.
- El panel principal prioriza presencia: métricas, participantes y actividad reciente.
- La gráfica de conexiones incorpora marcas de cambios y una lista breve de entradas/salidas inferidas del conteo. No representa desempeño académico.
- El enlace del estudiante deja de ocupar una tarjeta permanente en el dashboard.
- El botón `Compartir` abre un modal dedicado.

## Modal Compartir

El modal usa exclusivamente `playerHref`, que contiene la referencia pública a campaña, publicación y sala.

Incluye:

- QR generado localmente en el navegador;
- enlace completo de estudiantes;
- copiar al portapapeles con fallback;
- Web Share API cuando esté disponible;
- correo mediante `mailto:`;
- acceso a WhatsApp;
- cierre por botón, fondo o tecla Escape;
- feedback accesible de copiado/compartido.

Nunca lee ni expone la capability del anfitrión ni su `participantId`.

## QR local

Se incorpora `qrcode-generator` de Kazuhiko Arase como dependencia vendorizada, bajo licencia MIT, junto con su archivo de licencia. La generación del QR no requiere servicios externos ni envía el enlace a terceros.

## Presencia y tiempo real

A4-003D no cambia el transporte. El roster continúa con el intervalo transitorio de 15 s validado en A4-003B/C. El requisito de actualización prácticamente inmediata queda diferido a un tramo específico de transporte, sin acoplar la UI a esta frecuencia.

## Estado de juego

No se sincronizan todavía progreso, vidas, respuestas ni resultados. La única información remota compartida sigue siendo presencia de la `LiveRoom`.

## Seguridad

- capability del host: solo almacenamiento interno del cliente;
- URL de consola: sin secretos;
- modal: solo enlace público del jugador;
- QR: generado localmente;
- sin operaciones de borrado, cierre o reactivación de sala.

## Siguiente tramo

Tras el smoke manual de A4-003D:

1. cerrar checkpoint de consola/compartir;
2. diseñar transporte de presencia de baja latencia;
3. migrar la consola desde polling transitorio a actualización prácticamente inmediata;
4. recién después incorporar estado pedagógico compartido.
