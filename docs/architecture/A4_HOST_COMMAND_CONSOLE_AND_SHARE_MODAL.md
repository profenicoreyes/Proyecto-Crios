# A4 — Consola de mando del host y modal de compartir

## 1. Propósito

La nueva consola de mando del docente es una superficie operativa separada de Studio.

La decisión arquitectónica es clara:

- Studio queda como entorno de autoría, validación y publicación.
- La consola de mando queda como entorno operativo en vivo del docente.
- El docente no se queda en Studio después de iniciar partida.
- Al pulsar “Iniciar partida”, CRIOS crea o recupera la LiveRoom y redirige al docente a la consola de mando en la misma pestaña.
- Desde la consola se monitorea la sala activa y se comparte el acceso para estudiantes.
- La consola no reemplaza la publicación persistente ni la edición de campañas; sólo opera la sesión efímera asociada.

La separación es funcional y de responsabilidad:

- publicación persistente: `campaignId + publicationId`;
- sala efímera: `roomId` + presencia + actividad;
- entorno docente: Studio y consola de mando;
- entorno estudiante: acceso público a la partida con enlace de jugador.

## 2. Flujo UX principal

### 2.1 Flujo exacto

1. El docente publica una campaña desde Studio.
2. El docente pulsa “Iniciar partida”.
3. CRIOS valida la publicación y crea o recupera la LiveRoom asociada.
4. Se redirige en la misma pestaña a la consola de mando.
5. La consola muestra el estado en vivo de la sala y permite compartir el enlace del estudiante.
6. El docente monitorea presencia y actividad desde la consola.

### 2.2 Regla de recuperación

Si ya existe una sala recuperable para la misma publicación, la consola debe reutilizar esa sala en lugar de crear otra nueva.

Esto implica:

- misma `campaignId` y `publicationId`;
- misma room válida y no expirada;
- contexto del host recuperable en la pestaña actual.

La recuperación no debe crear duplicados ni abrir una sala nueva si la sala actual todavía es válida.

### 2.3 Sala expirada

Si la sala expiró por inactividad, la consola debe mostrar el estado de expiración explícito y no reactivar la misma room.

La señal visible debe ser consistente con la regla contractual: “Esta sesión finalizó por inactividad.”

Una vez expirada, el host debe crear una nueva room sólo cuando reaccione explícitamente a la situación.

### 2.4 Reapertura por recarga

La consola debe poder reabrirse por recarga de pestaña sin perder el contexto del host, mientras la sala siga válida.

La condición es:

- conservar la identidad del host y el contexto de la sala en `sessionStorage` del lado del host;
- restaurar la room desde `roomId` + `campaignId` + `publicationId`;
- reanudar la sesión operativa sin crear una room duplicada.

Si la room ya no es válida, la consola debe salir al estado de expiración o inconsistencia y no debe mantener un contexto operativo falso.

## 3. Frontera de seguridad

La capability del host sigue siendo interna.

Reglas no negociables:

- La capability del host nunca viaja en la URL.
- La capability se conserva en `sessionStorage` del lado del host.
- La URL de la consola puede incluir `roomId`, `publicationId` y `campaignId` si hace falta, pero nunca secretos.
- El modal de compartir nunca expone la capability del host.
- El enlace compartido para estudiantes sólo abre como jugador y no incluye capability del host.
- El host usa internamente un identificador de participante y un token de capacidad, pero esa información no debe ser visible ni serializable en una URL pública.
- El enlace público del estudiante debe ser el enlace de acceso al jugador, no un enlace administrativo ni una URL con credenciales.

Cualquier elemento visual o compartir del modal debe evitar transportar datos internos del docente. La capa de seguridad sigue siendo del backend y del cliente, no de la URL ni del DOM visible.

## 4. Superficie nueva: “Consola de mando”

### 4.1 Nombre sugerido

Consola de mando

### 4.2 Propósito de la pantalla

Es una pantalla dedicada al host y separada de Studio.

Debe ser un entorno de operación en vivo, no un panel de edición ni una vista de autoría.

Su misión es:

- verificar si la room sigue activa;
- confirmar la campaña y la publicación asociadas;
- observar jugadores conectados;
- comprobar actividad reciente;
- compartir el acceso para estudiantes;
- mantener contexto operativo incluso tras recarga de pestaña.

Debe ser visualmente coherente con CRIOS, sin perder legibilidad ni claridad operativa.

## 5. Datos en tiempo real a mostrar

### 5.1 Primera versión de la consola

La primera versión debe mostrar, con prioridad, estos datos:

A. Estado de la sala
- `active` / `expired` / `unavailable`;
- hora de última actividad;
- expiración prevista.

B. Identificadores
- `roomId`;
- `campaignId`;
- `publicationId`.

C. Participantes
- jugadores conectados;
- lista de participantes activos;
- roles y estado conectado/desconectado.

D. Actividad reciente
- última actividad / heartbeat;
- indicador de presencia reciente;
- cambios en la roster del host.

E. Acceso del estudiante
- enlace público del jugador;
- estado de acceso y visibilidad del enlace.

### 5.2 Datos diferidos

Estos datos quedan para tramos posteriores y no forman parte de la primera entrega operativa:

- progreso por misión;
- respuestas del alumnado;
- resultados individuales o agregados;
- estado pedagógico agregado;
- telemetría avanzada;
- métricas de desempeño por alumno;
- visualizaciones complejas que requieran datos del juego y no solo de presencia.

La primera consola debe resolver presencia y operación, no cargar una capa de analítica avanzada.

## 6. Requisito de “tiempo real”

La consola requiere datos en tiempo real, no solo polling visible lento.

El requisito arquitectónico es explícito:

- la interfaz no puede estar acoplada a un simple polling de baja frecuencia;
- la consola debe diseñarse para actualización prácticamente inmediata sobre cambios de presencia y actividad;
- el desarrollo actual ya validó un paso intermedio de polling cada 15 s en A4-003B, pero ese mecanismo es solo un híbrido de transición;
- la interfaz final debe contemplar una actualización más cercana a eventos o a un canal de sincronización de presencia más directo, sin depender del “polling visible” como único patrón.

La intención de la arquitectura es clara: la consola final no debe ser una pantalla que “refresca cada 15 s” y se queda ahí como solución definitiva. Debe diseñarse para ser operativamente reactiva.

La decisión de transporte final queda diferida, pero el requisito funcional y de experiencia no.

## 7. Diseño visual útil, no decorativo

### 7.1 Principios

- Todo elemento visual debe aportar información operativa.
- La visual debe priorizar legibilidad y rapidez de lectura del estado.
- La estética debe seguir el universo visual de CRIOS sin caer en dashboards genéricos.
- La consola debe mostrar señales de estado de forma directa, no como adornos.

### 7.2 Elementos sugeridos que sí aportan valor

- tarjeta de estado de sala;
- contador grande de jugadores conectados;
- lista o tabla de participantes con estado conectado/desconectado;
- indicador visual de actividad reciente;
- mini timeline o sparkline de conexiones si refleja cambios de presencia reales;
- chips o insignias para estado activo, expiro, desconectado, conectando, etc.;
- iconografía clara alineada al universo del juego.

### 7.3 Lo que no conviene

- gráficos recargados sin significado;
- adornos que resten legibilidad;
- dashboards genéricos ajenos al estilo de CRIOS;
- métricas visuales que no correspondan a decisiones operativas del docente;
- componentes que se vean bien pero no ayuden a decidir si la partida sigue activa o no.

La regla práctica es simple: si no ayuda a decidir el estado operativo de la partida, no debe estar.

## 8. Modal de compartir

El botón “Compartir” abre un modal dedicado para compartir el acceso del estudiante.

### 8.1 Requisitos del modal

Debe incluir:

- QR grande y legible;
- enlace completo del estudiante;
- botón para copiar enlace;
- botón de compartir con Web Share API cuando exista;
- opción de compartir por correo;
- posibilidad de sumar atajos como WhatsApp si es viable;
- cierre claro del modal;
- feedback visual de copiado exitoso.

### 8.2 Reglas de seguridad del modal

El modal no debe mostrar ni derivar la capability del host.

Debe tomar el enlace público del estudiante, no un enlace con secretos ni una URL administrativa.

El enlace del alumno debe abrir la experiencia como jugador, nunca como host ni con permisos de moderación.

## 9. Estructura de la pantalla

La pantalla debe organizarse en bloques concretos, sin maquetar ni programar.

### Propuesta de layout

- Encabezado con nombre de campaña, estado de sala y botón “Compartir”;
- bloque principal con métricas clave;
- bloque de participantes activo con estado y última actividad;
- bloque de actividad reciente;
- bloque de acceso del estudiante con enlace público y QR;
- ajuste visual para mantener la legibilidad en pantallas normales y compactas.

La prioridad es la operación del docente: verdades y señales de presencia antes que decoración.

## 10. Impacto en la arquitectura

### 10.1 Piezas actuales que se preservan

Se mantienen y reutilizan las piezas ya existentes:

- backend LiveRoom ya existente;
- operaciones `createLiveRoom`, `joinLiveRoom`, `heartbeatLiveRoom` y `getLiveRoom`;
- roster del host;
- enlace de estudiante;
- separación entre publicación persistente y sala efímera.

La persistente no se convierte en sala, ni la sala en publicación. La diferencia sigue siendo explícita.

### 10.2 Piezas nuevas que hará falta después

Además del backend actual, la arquitectura necesita nuevas capas:

- shell/page de consola de mando;
- redirección desde Studio al iniciar partida;
- estado y persistencia de contexto del host en la misma pestaña;
- modal de compartir;
- capa de actualización en tiempo real para presencia y futuros datos;
- estado de UI de carga, expiración y restauración.

La consola no es sólo un cambio visual. Es una nueva superficie operativa con contexto propio y flujo de vida diferenciado.

## 11. Trazabilidad del roadmap

Este documento deja el contrato del problema y de la superficie. La subdivisión futura puede ser:

- A4-003C — host command console shell + redirect;
- A4-003D — share modal + QR + copy/share actions;
- A4-003E — host presence live updates in console;
- A4-004 — game-state synchronization.

No se toca el roadmap ni se implementa nada aquí; sólo se deja la orientación de cómo encaja la nueva consola dentro del conjunto de arquitectura.

## 12. Decisiones explícitas y diferidos

### Decisiones fijadas

- La consola de mando es una superficie operativa separada de Studio.
- El docente sale de Studio tras iniciar partida.
- La room se crea o recupera antes de la redirección.
- La capability del host nunca va en la URL ni se expone en el modal.
- La consola se reabre por recarga sin perder contexto si la room sigue válida.
- La primera versión prioriza presencia y estado operativo.

### Diferidos

- la implementación final del transporte en tiempo real;
- la política exacta de sincronización futura de estado del juego;
- la resolución final de métricas pedagógicas avanzadas;
- la decisión definitiva sobre la capa de actualización para datos de misión y resultados.

El documento define la frontera y el requisito operativo, pero no adelanta la implementación final del transporte ni del estado del juego.
