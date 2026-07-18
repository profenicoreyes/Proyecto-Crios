# Fase 3A — Selector de campañas

## Objetivo

Permitir que CRIOS trabaje con varios recorridos educativos sin mezclar sus misiones ni su progreso.

## Implementación

- Se agregó una pantalla de selección de campañas.
- Cada campaña muestra título, descripción, materia, tema, contenido, cantidad de misiones y progreso.
- El progreso queda guardado por identificador de campaña.
- El mapa se reconstruye con las misiones de la campaña seleccionada.
- La sesión enviada a Google Sheets incluye la campaña activa.
- Las campañas pueden declararse como `publicada` o como no disponibles.
- Se mantiene la compatibilidad con el progreso anterior de la campaña original.

## Agregar una campaña

Las campañas se declaran en `js/datos/campanas.js`.

```javascript
nuevaCampana: Object.freeze({
  id: 'geometria-figuras-compuestas',
  titulo: 'Geometría: figuras compuestas',
  descripcion: 'Recorrido de cálculo de áreas por descomposición.',
  estado: 'publicada',
  orden: 2,
  clasificacion: Object.freeze({
    materia: 'matematica',
    tema: 'geometria',
    subtema: 'calculoAreas'
  }),
  narrativa: Object.freeze({
    lugar: 'Sector de comunicaciones',
    objetivo: 'Restablecer las placas de protección.'
  }),
  misiones: Object.freeze(['identificador-de-mision'])
})
```

La misión indicada debe estar registrada antes de que cargue `crios.js`.

## Almacenamiento

- Campaña activa: `crios-campana-activa`
- Progreso por campañas: `crios-progreso-campanas-v1`

El progreso anterior de `crios-progress-v2` se migra automáticamente a la campaña inicial cuando corresponde.
