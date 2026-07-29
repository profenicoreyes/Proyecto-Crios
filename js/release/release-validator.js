/* CRIOS Domain — release validator */
(function(){
  'use strict';

  function validateReleaseStructure(release) {
    if (!release || typeof release !== 'object') {
      throw new Error('Campaign Release invalida: la estructura debe ser un objeto.');
    }

    if (release.id === null || release.id === undefined || String(release.id).trim() === '') {
      throw new Error('Campaign Release invalida: falta id.');
    }

    if (release.title === null || release.title === undefined || String(release.title).trim() === '') {
      throw new Error('Campaign Release invalida: falta title.');
    }

    if (release.scenario === null || release.scenario === undefined || String(release.scenario).trim() === '') {
      throw new Error('Campaign Release invalida: falta scenario.');
    }

    if (!Array.isArray(release.missions)) {
      throw new Error('Campaign Release invalida: missions debe ser un arreglo.');
    }

    if (!release.metadata || typeof release.metadata !== 'object') {
      throw new Error('Campaign Release invalida: falta metadata.');
    }

    const metadataKeys = Object.keys(release.metadata).sort();
    const expectedMetadataKeys = ['averageDifficulty', 'createdAt', 'estimatedDuration', 'missionCount', 'schemaVersion'];

    const hasExactMetadataShape = metadataKeys.length === expectedMetadataKeys.length
      && expectedMetadataKeys.every((key, index) => key === metadataKeys[index]);

    if (!hasExactMetadataShape) {
      throw new Error('Campaign Release invalida: metadata debe contener solo createdAt, schemaVersion, missionCount, estimatedDuration y averageDifficulty.');
    }
  }

  window.CRIOS_DOMAIN = window.CRIOS_DOMAIN || {};
  window.CRIOS_DOMAIN.releaseValidator = {
    validateReleaseStructure
  };
})();
