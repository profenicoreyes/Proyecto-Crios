/* CRIOS Domain — session factory */
(function(){
  'use strict';

  function createStudentSession(release) {
    const domain = window.CRIOS_DOMAIN || {};
    const releaseValidator = domain.releaseValidator;
    const releaseModel = domain.releaseModel;
    const sessionModel = domain.sessionModel;
    const sessionValidator = domain.sessionValidator;

    if (!releaseValidator || !releaseModel || !sessionModel || !sessionValidator) {
      throw new Error('No se puede crear Student Session: módulos de dominio no disponibles.');
    }

    try {
      releaseValidator.validateReleaseStructure(release);
    } catch (error) {
      throw new Error('No se puede crear Student Session: release inválido. ' + error.message);
    }

    if (!Array.isArray(release.missions) || release.missions.length === 0) {
      throw new Error('No se puede crear Student Session: el Release debe tener al menos una misión.');
    }

    const firstMissionId = sessionModel.extractFirstMissionId(release);

    const session = {
      sessionId: sessionModel.createStudentSessionId(),
      releaseId: String(release.id).trim(),
      startedAt: sessionModel.createSessionStartedAt(),
      status: 'running',
      currentMissionIndex: 0,
      lives: sessionModel.INITIAL_SESSION_LIVES,
      progress: {
        completedMissionIds: [],
        currentMissionId: firstMissionId
      },
      answers: []
    };

    sessionValidator.validateStudentSession(session);
    return releaseModel.deepFreeze(session);
  }

  window.CRIOS_DOMAIN = window.CRIOS_DOMAIN || {};
  window.CRIOS_DOMAIN.sessionFactory = {
    createStudentSession
  };
})();
