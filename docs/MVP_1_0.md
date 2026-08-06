# CRIOS MVP 1.0 — contrato de alcance y aceptación

## 1. Propósito

CRIOS MVP 1.0 será la primera versión cerrada, recuperable y utilizable en una clase real.

El objetivo no es eliminar toda la arquitectura legacy ni completar todas las capacidades futuras. El objetivo es garantizar un recorrido `published` completo, visible y estable, desde la creación de una campaña hasta su finalización y reanudación.

## 2. Recorrido funcional obligatorio

La versión se considera funcional únicamente si una persona puede completar este recorrido sin intervenir en consola ni modificar archivos:

1. abrir Studio;
2. crear o seleccionar una campaña compatible;
3. configurar al menos dos misiones ejecutables;
4. publicar y persistir la campaña;
5. abrir la campaña publicada en CRIOS;
6. confirmar la identidad del operador;
7. crear o reanudar una sesión `published`;
8. ejecutar la misión actual;
9. obtener un resultado de evaluación;
10. actualizar PlayerState y Progress;
11. reconstruir Runtime;
12. obtener Navigation y la decisión de transición;
13. avanzar a la misión siguiente o finalizar la campaña;
14. recargar la aplicación;
15. reanudar la misma publicación, sesión y progreso de forma coherente.

## 3. Capacidades incluidas

CRIOS MVP 1.0 incluye:

- Studio base y Campaign Draft;
- publicación, activación y persistencia local;
- lanzamiento explícito de campañas `published`;
- validación de referencias, versiones y contenido publicado;
- identidad de operador y sesión;
- ejecución de misiones compatibles;
- Evaluation, PlayerState, Progress, Runtime y Navigation integrados mediante Game Flow;
- decisión declarativa de avance, repetición o finalización;
- reanudación después de recargar;
- bloqueo de publicaciones desactivadas, corruptas o incompatibles;
- compatibilidad con el camino legacy mientras siga siendo necesario;
- respaldo Git verificable de la versión cerrada.

## 4. Criterios funcionales de aceptación

Todos los criterios siguientes son obligatorios:

### 4.1 Publicación y lanzamiento

- Existe al menos una campaña de demostración completa con dos o más misiones ejecutables.
- Studio solo ofrece abrir publicaciones activas, persistidas y coherentes.
- El lanzamiento `published` utiliza el constructor canónico de referencia.
- Una referencia `published` inválida no produce fallback silencioso hacia legacy.
- Una entrada explícita `legacy` no reutiliza una sesión `published` anterior.

### 4.2 Identidad y sesión

- El operador puede confirmar su identidad mediante la interfaz.
- La sesión conserva campaña, publicación, versión, escenario e identidad.
- Una recarga solicita la confirmación necesaria sin perder el identificador ni el progreso de la sesión válida.
- Dos campañas o publicaciones diferentes no comparten estado accidentalmente.

### 4.3 Ejecución y Game Flow

- La misión actual se obtiene desde el contenido publicado validado.
- Game Flow mantiene el orden:
  Evaluation → PlayerState → Progress → Runtime → Navigation → decisión.
- Runtime se reconstruye una sola vez por ejecución.
- Navigation recibe un Runtime validado y coherente con la publicación.
- Un fallo intermedio no deja progreso, estado o navegación parcialmente actualizados.
- La última misión produce una finalización explícita y estable.

### 4.4 Persistencia y recuperación

- El progreso válido sobrevive a una recarga.
- Una publicación desactivada deja de ser lanzable.
- Datos persistidos corruptos se bloquean sin sustituirse silenciosamente.
- La limpieza de una sesión o campaña no elimina información de otras campañas.
- El sistema puede comenzar una sesión nueva después de cerrar o invalidar la anterior.

### 4.5 Interfaz de uso

- Todo el recorrido principal puede realizarse desde controles visibles.
- No se requiere abrir herramientas de desarrollo.
- Los mensajes de bloqueo indican qué ocurrió y qué acción puede realizar la persona.
- Las acciones principales son accesibles en una pantalla de notebook común y en el viewport angosto ya cubierto por las regresiones.
- No existen controles esenciales ocultos por scroll, superposición o falta de contraste.
- A.R.I.A. mantiene frases breves, claras y no infantiles.

## 5. Criterios técnicos de aceptación

La versión candidata debe aprobar:

- pruebas focales de los contratos involucrados;
- regresiones de publicación, sesión, Runtime, Navigation y Game Flow;
- un E2E dedicado al recorrido MVP completo;
- recarga y reanudación de la sesión publicada;
- bloqueo de publicación inactiva, corrupta e incompatible;
- validación de finalización de campaña;
- validación en el viewport angosto soportado;
- cero errores de página;
- cero errores de consola;
- cero promesas no controladas;
- cero requests externos inesperados;
- cero frames residuales;
- cleanup confirmado de los recursos creados por los runners;
- `git diff --check` aprobado;
- árbol limpio después de la validación.

El total exacto de comprobaciones se fijará al crear el runner de aceptación. No debe disminuir la cobertura cerrada de los módulos existentes.

## 6. Entregables de CRIOS MVP 1.0

El cierre requiere:

1. una campaña de demostración completa;
2. un runner E2E durable del recorrido principal;
3. corrección de todos los bloqueos funcionales encontrados por ese runner;
4. revisión visual y de mensajes del recorrido soportado;
5. instrucciones breves para abrir Studio, publicar y ejecutar la campaña;
6. documento de alcance y limitaciones;
7. commit funcional final;
8. commit documental de cierre;
9. bundle Git verificado;
10. eliminación controlada de artefactos temporales y respaldos obsoletos.

## 7. Capacidades expresamente fuera del MVP

No son requisitos de CRIOS MVP 1.0:

- declarar `published` como modo predeterminado;
- eliminar el camino legacy;
- convertir RuntimeCore o NavigationCore en factorías puras;
- extraer de `js/crios.js` todos los efectos de aplicación;
- persistencia remota;
- sincronización entre dispositivos;
- colaboración multiusuario;
- autenticación de usuarios;
- servidor backend;
- catálogo remoto de campañas;
- nuevos tipos de misión no necesarios para la campaña de demostración;
- garantías universales de disponibilidad, red, storage o scheduler externo;
- compatibilidad con todos los navegadores y dispositivos posibles.

Estas capacidades podrán formar parte de versiones posteriores, pero no deben bloquear el cierre del MVP.

## 8. Puerta de decisión

Antes de modificar producción se realizará una auditoría de brechas:

- criterio ya demostrado;
- criterio parcialmente demostrado;
- criterio sin evidencia;
- criterio bloqueado por un defecto real;
- criterio que exige únicamente documentación o contenido.

Solo se implementarán cambios para brechas reales del recorrido MVP. No se abrirán refactorizaciones arquitectónicas que no sean necesarias para superar un criterio de aceptación.

## 9. Secuencia de trabajo

### A2-017A — contrato del MVP

Versionar este documento sin cambios productivos.

### A2-017B — matriz de cobertura

Mapear cada criterio del MVP contra código, pruebas y evidencia existentes. Identificar únicamente las brechas reales.

### A2-017C — cierre de brechas

Resolver una brecha por tarea, con prueba focal, regresión relacionada y commit independiente.

### A2-017D — aceptación integral

Crear y ejecutar un runner E2E durable para el recorrido completo del MVP.

### A2-017E — release

Revisión visual final, documentación de uso, commit de cierre, bundle verificado y limpieza de temporales.

## 10. Definición de terminado

CRIOS MVP 1.0 está terminado cuando:

- el recorrido funcional obligatorio puede completarse de principio a fin;
- la recarga conserva correctamente publicación, sesión y progreso;
- los estados inválidos se bloquean sin fallback silencioso;
- las pruebas focales, regresiones y aceptación integral están aprobadas;
- no quedan errores funcionales conocidos dentro del alcance;
- las limitaciones están documentadas;
- el repositorio está limpio;
- existe un único bundle vigente y verificado del commit de cierre.
