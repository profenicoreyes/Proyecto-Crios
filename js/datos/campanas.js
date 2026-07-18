/*
 * CRIOS OS — Catálogo de campañas
 * Una campaña organiza un conjunto ordenado de misiones y conserva su propio progreso.
 */
'use strict';

const CAMPANAS_CRIOS = Object.freeze({
  reactivacionBaseAntartica: Object.freeze({
    id: 'reactivacion-base-antartica',
    titulo: 'Reactivación de la base antártica',
    descripcion: 'Recuperá los módulos esenciales del complejo mediante cálculos de áreas.',
    estado: 'publicada',
    orden: 1,
    clasificacion: Object.freeze({
      materia: 'matematica',
      tema: 'geometria',
      subtema: 'calculoAreas'
    }),
    narrativa: Object.freeze({
      lugar: 'Base científica CRIOS',
      objetivo: 'Restablecer la red de superficies operativas.'
    }),
    misiones: Object.freeze(['energy', 'greenhouse', 'ice', 'hangar'])
  })
});

const CAMPANA_INICIAL_ID = 'reactivacion-base-antartica';

function listarCampanas() {
  return Object.values(CAMPANAS_CRIOS)
    .slice()
    .sort((a, b) => (a.orden || 0) - (b.orden || 0));
}

function obtenerCampanaPorId(id) {
  return listarCampanas().find((campana) => campana.id === id) || null;
}
