/* CRIOS Domain — player state service */
(function(){
  'use strict';

  function getPlayerStateValidator() {
    const domain = window.CRIOS_DOMAIN || {};
    const validator = domain.playerStateValidator;

    if (!validator || typeof validator.validatePlayerSession !== 'function') {
      throw new Error('No se puede aplicar PlayerState: PlayerStateValidator no disponible.');
    }

    return validator;
  }

  function applyEvaluation(session, evaluation) {
    const validator = getPlayerStateValidator();
    validator.validateEvaluationCoherence(session, evaluation);

    if (session.status !== 'running') {
      throw new Error('No se puede aplicar Evaluation: session.status debe ser running.');
    }

    if (evaluation.isCorrect === true) {
      session.status = 'running';
      validator.validatePlayerSession(session);
      return session;
    }

    const nextLives = Math.max(0, session.lives - 1);
    session.lives = nextLives;
    session.status = nextLives === 0 ? 'gameOver' : 'running';

    validator.validatePlayerSession(session);
    return session;
  }

  function restorePlayerState(session) {
    const validator = getPlayerStateValidator();
    validator.validatePlayerSession(session);

    session.lives = validator.getMaxLivesAllowed();

    if (session.status === 'gameOver') {
      session.status = 'running';
    }

    validator.validatePlayerSession(session);
    return session;
  }

  function canContinue(session) {
    const validator = getPlayerStateValidator();
    validator.validatePlayerSession(session);

    return session.status === 'running';
  }

  window.CRIOS_DOMAIN = window.CRIOS_DOMAIN || {};
  window.CRIOS_DOMAIN.playerStateService = {
    applyEvaluation,
    restorePlayerState,
    canContinue
  };
})();