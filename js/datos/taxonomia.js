/*
 * CRIOS OS — Taxonomía académica
 * Define las materias, temas y subtemas disponibles para clasificar misiones.
 */
'use strict';

const TAXONOMIA_CRIOS = Object.freeze({
  materias: Object.freeze({
    matematica: Object.freeze({
      etiqueta: 'Matemática',
      temas: Object.freeze({
        geometria: Object.freeze({
          etiqueta: 'Geometría',
          subtemas: Object.freeze({
            calculoAreas: Object.freeze({
              etiqueta: 'Cálculo de áreas'
            })
          })
        })
      })
    })
  })
});

function obtenerEtiquetaTaxonomia(clasificacion) {
  const materia = TAXONOMIA_CRIOS.materias[clasificacion.materia];
  const tema = materia && materia.temas[clasificacion.tema];
  const subtema = tema && tema.subtemas[clasificacion.subtema];

  return {
    materia: materia ? materia.etiqueta : clasificacion.materia,
    tema: tema ? tema.etiqueta : clasificacion.tema,
    subtema: subtema ? subtema.etiqueta : clasificacion.subtema
  };
}
