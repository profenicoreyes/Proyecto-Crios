const EVALUATION_STATUSES = Object.freeze({
  CORRECT: 'CORRECT',
  INCORRECT: 'INCORRECT'
});

function createMissionEvaluation(isCorrect) {
  if (typeof isCorrect !== 'boolean') {
    throw new TypeError('isCorrect must be a boolean.');
  }

  return Object.freeze({
    status: isCorrect ? EVALUATION_STATUSES.CORRECT : EVALUATION_STATUSES.INCORRECT,
    success: isCorrect,
    score: isCorrect ? 1 : 0,
    completed: isCorrect
  });
}

function isEvaluationModel(value) {
  return value !== null
    && typeof value === 'object'
    && !Array.isArray(value)
    && typeof value.status === 'string'
    && value.status.trim() !== ''
    && typeof value.success === 'boolean'
    && Number.isFinite(value.score)
    && typeof value.completed === 'boolean';
}

export {
  EVALUATION_STATUSES,
  createMissionEvaluation,
  isEvaluationModel
};