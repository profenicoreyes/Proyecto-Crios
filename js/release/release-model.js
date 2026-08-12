/* CRIOS Domain — release model */
(function(){
  'use strict';

  let publicationSequence = 1;

  function safeClone(value) {
    try {
      if (typeof structuredClone === 'function') return structuredClone(value);
    } catch (ignore) {}
    return JSON.parse(JSON.stringify(value));
  }

  function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.getOwnPropertyNames(value).forEach(key => {
      deepFreeze(value[key]);
    });
    return Object.freeze(value);
  }

  function createReleaseId() {
    const id = 'release-temp-' + publicationSequence;
    publicationSequence += 1;
    return id;
  }

  function createPublishedAt() {
    return new Date().toISOString();
  }

  function getMissionDifficulty(mission) {
    const level = Number(mission && (mission.dificultadNivel ?? mission.dificultad ?? mission.clasificacion?.dificultad));
    if (!Number.isFinite(level) || level <= 0) return 1;
    return Math.max(1, Math.min(6, Math.round(level)));
  }

  function getMissionDuration(mission) {
    const minutes = Number(mission && (mission.duracionMinutos ?? mission.duracionEstimadaMinutos ?? mission.duracion));
    if (!Number.isFinite(minutes) || minutes < 0) return 0;
    return Math.max(0, Math.round(minutes));
  }

  function calculateReleaseMetadata(missions) {
    const list = Array.isArray(missions) ? missions : [];
    const missionCount = list.length;
    const estimatedDuration = list.reduce((acc, mission) => acc + getMissionDuration(mission), 0);

    const difficultyTotal = list.reduce((acc, mission) => acc + getMissionDifficulty(mission), 0);
    const averageDifficulty = missionCount > 0
      ? Math.max(1, Math.min(6, Math.round((difficultyTotal / missionCount) * 10) / 10))
      : 0;

    return {
      createdAt: createPublishedAt(),
      schemaVersion: '2.0',
      missionCount,
      estimatedDuration,
      averageDifficulty
    };
  }

  window.CRIOS_DOMAIN = window.CRIOS_DOMAIN || {};
  window.CRIOS_DOMAIN.releaseModel = {
    safeClone,
    deepFreeze,
    createReleaseId,
    calculateReleaseMetadata
  };
})();
