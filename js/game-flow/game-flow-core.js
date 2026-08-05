/* CRIOS Game Flow - pure orchestration core */

import { isEvaluationModel } from '../evaluation/evaluation-model.js';
import {
  isPlayerStateResultModel,
  isGameOverPlayerStateResult
} from '../player-state/player-state-result-model.js';
import { isProgressModel } from '../progress/progress-model.js';
import { isRuntimeResultModel } from '../runtime/runtime-result-model.js';
import { isMissionNavigationModel } from '../navigation/mission-navigation-model.js';

const STAGES = Object.freeze({
  VALIDATION: 'VALIDATION',
  PLAYER_STATE: 'PLAYER_STATE',
  PROGRESS: 'PROGRESS',
  RUNTIME: 'RUNTIME',
  NAVIGATION: 'NAVIGATION',
  COMPLETED: 'COMPLETED'
});

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function has(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function validCommand(command) {
  if (!isObject(command)) return false;
  const required = ['evaluation', 'session', 'mission', 'campaign'];
  if (!required.every(key => has(command, key) && isObject(command[key]))) return false;
  return isEvaluationModel(command.evaluation);
}

function validPorts(ports) {
  return isObject(ports)
    && isObject(ports.playerState) && typeof ports.playerState.applyEvaluation === 'function'
    && isObject(ports.progress) && typeof ports.progress.update === 'function'
    && isObject(ports.runtime) && typeof ports.runtime.rebuild === 'function'
    && isObject(ports.navigation) && typeof ports.navigation.resolve === 'function';
}

function validPlayerState(value) {
  return isPlayerStateResultModel(value);
}

function validProgress(value) {
  return isProgressModel(value);
}

function validRuntime(value) {
  return isRuntimeResultModel(value);
}

function validNavigation(value) {
  return isMissionNavigationModel(value);
}

function errorText(error) {
  if (error && typeof error.message === 'string' && error.message.trim() !== '') {
    return error.message;
  }
  const text = String(error);
  return text.trim() === '' ? 'Unknown port failure.' : text;
}

function result(values) {
  return Object.freeze(Object.assign({
    status: null,
    success: false,
    action: null,
    target: null,
    stage: STAGES.VALIDATION,
    error: null,
    evaluation: null,
    playerState: null,
    progress: null,
    runtime: null,
    navigation: null
  }, values));
}

function invalid(status, stage, error, evidence) {
  return result(Object.assign({ status, stage, error }, evidence));
}

export function executeGameFlow(command, ports) {
  if (!validCommand(command)) {
    return invalid('INVALID_COMMAND', STAGES.VALIDATION, 'GameFlowCommand or EvaluationModel is invalid.');
  }
  if (!validPorts(ports)) {
    return invalid('INVALID_PORTS', STAGES.VALIDATION, 'Game Flow ports are invalid.', {
      evaluation: command.evaluation
    });
  }

  const common = {
    evaluation: command.evaluation,
    session: command.session,
    mission: command.mission,
    campaign: command.campaign
  };
  let playerState;
  let progress;
  let runtime;
  let navigation;

  try {
    playerState = ports.playerState.applyEvaluation({
      evaluation: common.evaluation,
      session: common.session,
      mission: common.mission,
      campaign: common.campaign
    });
  } catch (error) {
    return invalid('PORT_FAILURE', STAGES.PLAYER_STATE, errorText(error), {
      evaluation: common.evaluation
    });
  }
  if (!validPlayerState(playerState)) {
    return invalid('INVALID_PLAYER_STATE_RESULT', STAGES.PLAYER_STATE, 'PlayerState result is invalid.', {
      evaluation: common.evaluation
    });
  }
  if (isGameOverPlayerStateResult(playerState)) {
    return result({
      status: 'GAME_OVER', success: false, action: 'GAME_OVER', stage: STAGES.PLAYER_STATE,
      evaluation: common.evaluation, playerState
    });
  }

  try {
    progress = ports.progress.update({
      evaluation: common.evaluation,
      playerState,
      session: common.session,
      mission: common.mission,
      campaign: common.campaign
    });
  } catch (error) {
    return invalid('PORT_FAILURE', STAGES.PROGRESS, errorText(error), {
      evaluation: common.evaluation, playerState
    });
  }
  if (!validProgress(progress)) {
    return invalid('INVALID_PROGRESS_RESULT', STAGES.PROGRESS, 'Progress result is invalid.', {
      evaluation: common.evaluation, playerState
    });
  }
  if (progress.campaignCompleted === true) {
    return result({
      status: 'CAMPAIGN_COMPLETED', success: true, action: 'CAMPAIGN_COMPLETED', stage: STAGES.PROGRESS,
      evaluation: common.evaluation, playerState, progress
    });
  }

  try {
    runtime = ports.runtime.rebuild({
      evaluation: common.evaluation,
      playerState,
      progress,
      session: common.session,
      mission: common.mission,
      campaign: common.campaign
    });
  } catch (error) {
    return invalid('PORT_FAILURE', STAGES.RUNTIME, errorText(error), {
      evaluation: common.evaluation, playerState, progress
    });
  }
  if (!validRuntime(runtime)) {
    return invalid('INVALID_RUNTIME_RESULT', STAGES.RUNTIME, 'Runtime result is invalid.', {
      evaluation: common.evaluation, playerState, progress
    });
  }

  try {
    navigation = ports.navigation.resolve({
      evaluation: common.evaluation,
      playerState,
      progress,
      runtime,
      session: common.session,
      mission: common.mission,
      campaign: common.campaign
    });
  } catch (error) {
    return invalid('PORT_FAILURE', STAGES.NAVIGATION, errorText(error), {
      evaluation: common.evaluation, playerState, progress, runtime
    });
  }
  if (!validNavigation(navigation)) {
    return invalid('INVALID_NAVIGATION_RESULT', STAGES.NAVIGATION, 'Navigation result is invalid.', {
      evaluation: common.evaluation, playerState, progress, runtime
    });
  }

  return result({
    status: 'FLOW_COMPLETED',
    success: true,
    action: navigation.action,
    target: navigation.target,
    stage: STAGES.COMPLETED,
    evaluation: common.evaluation,
    playerState,
    progress,
    runtime,
    navigation
  });
}

export const GAME_FLOW_STAGES = STAGES;