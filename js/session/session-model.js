/* CRIOS Domain — session model */
(function(){
  'use strict';

  const STUDENT_SESSION_STATUSES = ['running', 'finished', 'gameOver'];
  const INITIAL_SESSION_LIVES = 3;

  function createStudentSessionId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return window.crypto.randomUUID();
    }
    return 'session-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }

  function createSessionStartedAt() {
    return new Date().toISOString();
  }

  function extractFirstMissionId(release) {
    const mission = Array.isArray(release && release.missions) ? release.missions[0] : null;
    if (!mission || typeof mission !== 'object') {
      throw new Error('No se puede crear Student Session: el Release no contiene una primera misión válida.');
    }

    const missionId = mission.id;
    if (missionId === null || missionId === undefined || String(missionId).trim() === '') {
      throw new Error('No se puede crear Student Session: la primera misión del Release no tiene id.');
    }

    return String(missionId).trim();
  }

  function isAllowedStatus(status) {
    return STUDENT_SESSION_STATUSES.includes(status);
  }

  window.CRIOS_DOMAIN = window.CRIOS_DOMAIN || {};
  window.CRIOS_DOMAIN.sessionModel = {
    STUDENT_SESSION_STATUSES,
    INITIAL_SESSION_LIVES,
    createStudentSessionId,
    createSessionStartedAt,
    extractFirstMissionId,
    isAllowedStatus
  };
})();
