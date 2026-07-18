# CRIOS OS v1.22 — versión refactorizada

Esta versión conserva la experiencia del juego y separa el proyecto en tres partes:

- `index.html`: estructura general y pantallas narrativas.
- `css/crios.css`: todo el diseño visual.
- `js/crios.js`: motor, sesiones, navegación, audio, registro y validaciones.
- `js/missions.js`: catálogo completo de misiones.

## Cambiar una misión

Abrí `js/missions.js`, buscá su identificador (`energy`, `greenhouse`, `ice` o `hangar`) y editá:

- textos y nombre;
- generación de datos;
- resultado esperado;
- datos obligatorios del procedimiento;
- pista;
- dibujo SVG.

## Agregar una misión

1. Copiá uno de los objetos dentro de `MISSION_DEFINITIONS`.
2. Cambiá el identificador y sus propiedades.
3. Asignale una posición con `mapClass`.
4. El motor crea automáticamente la pantalla, el botón del mapa, el indicador de progreso, el registro y su participación en el cálculo final.

No hace falta modificar `index.html` ni las funciones generales de validación.

## Regla de mantenimiento

Los detalles pedagógicos pertenecen a `missions.js`. La lógica común pertenece a `crios.js`. Evitá volver a copiar pantallas completas para crear una misión.
