/*
 * CRIOS OS — Registro de misiones
 * Las misiones se registran aquí sin que el motor necesite conocer sus detalles.
 */
'use strict';

const REGISTRO_MISIONES = (() => {
  const catalogo = new Map();

  function validarMision(mision) {
    const camposObligatorios = [
      'id', 'numero', 'titulo', 'nombreCorto', 'mapa', 'clasificacion', 'curriculum',
      'narrativa', 'tipoActividad', 'duracionEstimadaMinutos', 'etiquetas', 'generar', 'contenido'
    ];

    camposObligatorios.forEach((campo) => {
      if (mision[campo] === undefined || mision[campo] === null) {
        throw new Error(`La misión ${mision.id || '(sin id)'} no define el campo obligatorio: ${campo}`);
      }
    });

    if (catalogo.has(mision.id)) {
      throw new Error(`Ya existe una misión registrada con el id: ${mision.id}`);
    }

    const dificultad = Number(mision.clasificacion && mision.clasificacion.dificultad);
    if (!Number.isInteger(dificultad) || dificultad < 1 || dificultad > 6) {
      throw new Error(`La misión ${mision.id} debe definir una dificultad entera entre 1 y 6.`);
    }

    const duracion = Number(mision.duracionEstimadaMinutos);
    if (!Number.isInteger(duracion) || duracion <= 0) {
      throw new Error(`La misión ${mision.id} debe definir una duración estimada positiva en minutos.`);
    }

    if (!window.CRIOS_CURRICULUM || typeof window.CRIOS_CURRICULUM.validateMissionReference !== 'function') {
      throw new Error('El catálogo curricular ANEP debe cargarse antes del registro de misiones.');
    }
    const curriculumValidation = window.CRIOS_CURRICULUM.validateMissionReference(mision.curriculum);
    if (!curriculumValidation.valid) {
      throw new Error(`La misión ${mision.id} tiene una referencia curricular inválida: ${curriculumValidation.issues.join(' ')}`);
    }

    if (typeof mision.generar !== 'function' || typeof mision.contenido !== 'function') {
      throw new Error(`La misión ${mision.id} debe definir generar() y contenido().`);
    }
  }

  function registrar(mision) {
    validarMision(mision);
    catalogo.set(mision.id, Object.freeze(mision));
    return mision;
  }

  function obtener(id) {
    return catalogo.get(id) || null;
  }

  function listar() {
    return Array.from(catalogo.values());
  }

  function filtrar(criterios = {}) {
    return listar().filter((mision) => {
      const clasificacion = mision.clasificacion;
      if (criterios.materia && clasificacion.materia !== criterios.materia) return false;
      if (criterios.tema && clasificacion.tema !== criterios.tema) return false;
      if (criterios.subtema && clasificacion.subtema !== criterios.subtema) return false;
      if (criterios.tipoActividad && mision.tipoActividad !== criterios.tipoActividad) return false;
      if (criterios.etiqueta && !mision.etiquetas.includes(criterios.etiqueta)) return false;
      return true;
    });
  }

  function obtenerPorCampana(campana) {
    if (!campana || !Array.isArray(campana.misiones)) return [];
    return campana.misiones.map(obtener).filter(Boolean);
  }

  return Object.freeze({ registrar, obtener, listar, filtrar, obtenerPorCampana });
})();

function elegirAlAzar(valores, aleatorio) {
  return valores[Math.floor(aleatorio() * valores.length)];
}
