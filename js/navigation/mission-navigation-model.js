import { isEvaluationModel } from '../evaluation/evaluation-model.js';

const MISSION_NAVIGATION_ACTIONS = Object.freeze({
  RETURN_TO_MAP: 'RETURN_TO_MAP',
  RETRY_MISSION: 'RETRY_MISSION'
});

function createMissionNavigationDecision(evaluation) {
  if (!isEvaluationModel(evaluation)) {
    throw new TypeError('evaluation must be an EvaluationModel.');
  }

  return Object.freeze({
    action: evaluation.success
      ? MISSION_NAVIGATION_ACTIONS.RETURN_TO_MAP
      : MISSION_NAVIGATION_ACTIONS.RETRY_MISSION,
    target: evaluation.success ? 'map' : null
  });
}

function isMissionNavigationModel(value) {
  return value !== null
    && typeof value === 'object'
    && !Array.isArray(value)
    && typeof value.status === 'string'
    && value.status.trim() !== ''
    && typeof value.action === 'string'
    && value.action.trim() !== ''
    && Object.prototype.hasOwnProperty.call(value, 'target')
    && value.target !== undefined;
}

export {
  MISSION_NAVIGATION_ACTIONS,
  createMissionNavigationDecision,
  isMissionNavigationModel
};