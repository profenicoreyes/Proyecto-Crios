/* CRIOS Domain — player state validator */
(function(){
  'use strict';

  const PLAYER_SESSION_STATUSES = ['running', 'finished', 'gameOver'];

  function getSessionValidator() {
    const domain = window.CRIOS_DOMAIN || {};
    const sessionValidator = domain.sessionValidator;
    if (!sessionValidator || typeof sessionValidator.validateStudentSession !== 'function') {
      throw new Error('PlayerState inválido: SessionValidator no disponible.');
    }
    return sessionValidator.validateStudentSession;
  }

  function getSessionModel() {
    const domain = window.CRIOS_DOMAIN || {};
    const sessionModel = domain.sessionModel;
    if (!sessionModel) {
      throw new Error('PlayerState inválido: SessionModel no disponible.');
    }
    return sessionModel;
  }

  function getMaxLivesAllowed() {
    const sessionModel = getSessionModel();
    const maxLives = sessionModel.INITIAL_SESSION_LIVES;

    if (!Number.isInteger(maxLives) || maxLives <= 0) {
      throw new Error('PlayerState inválido: INITIAL_SESSION_LIVES debe ser entero positivo.');
    }

    return maxLives;
  }

  function validatePlayerSession(session) {
    const validateStudentSession = getSessionValidator();

    try {
      validateStudentSession(session);
    } catch (error) {
      throw new Error('PlayerState inválido: session inválida. ' + error.message);
    }

    const maxLives = getMaxLivesAllowed();

    if (!Number.isInteger(session.lives)) {
      throw new Error('PlayerState inválido: session.lives debe ser entero.');
    }

    if (session.lives < 0) {
      throw new Error('PlayerState inválido: session.lives no puede ser negativa.');
    }

    if (session.lives > maxLives) {
      throw new Error('PlayerState inválido: session.lives supera el máximo permitido (' + maxLives + ').');
    }

    if (!PLAYER_SESSION_STATUSES.includes(session.status)) {
      throw new Error('PlayerState inválido: session.status no permitido. Valores válidos: running, finished, gameOver.');
    }
  }

  function validateEvaluationModel(evaluation) {
    const expectedKeys = ['missionId', 'isCorrect'];

    if (!evaluation || typeof evaluation !== 'object' || Array.isArray(evaluation)) {
      throw new Error('EvaluationModel inválido: debe ser un objeto.');
    }

    const evaluationKeys = Object.keys(evaluation);
    const missingKeys = expectedKeys.filter(key => !Object.prototype.hasOwnProperty.call(evaluation, key));
    if (missingKeys.length > 0) {
      throw new Error('EvaluationModel inválido: falta(n) campo(s) obligatorio(s): ' + missingKeys.join(', ') + '.');
    }

    const extraKeys = evaluationKeys.filter(key => !expectedKeys.includes(key));
    if (extraKeys.length > 0) {
      throw new Error('EvaluationModel inválido: contiene campo(s) no permitido(s): ' + extraKeys.join(', ') + '.');
    }

    if (evaluation.missionId === null || evaluation.missionId === undefined || String(evaluation.missionId).trim() === '') {
      throw new Error('EvaluationModel inválido: missionId es obligatorio.');
    }

    if (typeof evaluation.isCorrect !== 'boolean') {
      throw new Error('EvaluationModel inválido: isCorrect debe ser booleano.');
    }
  }

  function validateEvaluationCoherence(session, evaluation) {
    validatePlayerSession(session);
    validateEvaluationModel(evaluation);

    const currentMissionId = String(session.progress.currentMissionId).trim();
    const evaluatedMissionId = String(evaluation.missionId).trim();

    if (evaluatedMissionId !== currentMissionId) {
      throw new Error(
        'EvaluationModel inválido: missionId incoherente con la sesión actual. ' +
        'Se esperaba ' + currentMissionId + ' y se recibió ' + evaluatedMissionId + '.'
      );
    }
  }

  window.CRIOS_DOMAIN = window.CRIOS_DOMAIN || {};
  window.CRIOS_DOMAIN.playerStateValidator = {
    validatePlayerSession,
    validateEvaluationModel,
    validateEvaluationCoherence,
    getMaxLivesAllowed
  };
})();