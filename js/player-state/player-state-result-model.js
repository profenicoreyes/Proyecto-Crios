const PLAYER_STATE_RESULT_STATUS = 'PLAYER_STATE_APPLIED';

const PLAYER_STATE_SNAPSHOT_STATUSES = Object.freeze({
  RUNNING: 'running',
  GAME_OVER: 'gameOver'
});

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasExactKeys(value, expectedKeys) {
  if (!isObject(value)) return false;
  const keys = Object.keys(value);
  return keys.length === expectedKeys.length
    && expectedKeys.every(key => Object.prototype.hasOwnProperty.call(value, key));
}

function isPlayerStateSnapshot(value) {
  if (!hasExactKeys(value, ['status', 'lives'])) return false;
  if (!Number.isInteger(value.lives) || value.lives < 0) return false;

  if (value.status === PLAYER_STATE_SNAPSHOT_STATUSES.GAME_OVER) {
    return value.lives === 0;
  }

  if (value.status === PLAYER_STATE_SNAPSHOT_STATUSES.RUNNING) {
    return value.lives > 0;
  }

  return false;
}

function createPlayerStateResult(session) {
  if (!isObject(session)) {
    throw new TypeError('session must be an object.');
  }

  const state = {
    status: session.status,
    lives: session.lives
  };

  if (!isPlayerStateSnapshot(state)) {
    throw new TypeError('session must contain a coherent PlayerState snapshot.');
  }

  return Object.freeze({
    status: PLAYER_STATE_RESULT_STATUS,
    state: Object.freeze(state)
  });
}

function isPlayerStateResultModel(value) {
  return hasExactKeys(value, ['status', 'state'])
    && value.status === PLAYER_STATE_RESULT_STATUS
    && isPlayerStateSnapshot(value.state);
}

function isGameOverPlayerStateResult(value) {
  return isPlayerStateResultModel(value)
    && value.state.status === PLAYER_STATE_SNAPSHOT_STATUSES.GAME_OVER;
}

export {
  PLAYER_STATE_RESULT_STATUS,
  PLAYER_STATE_SNAPSHOT_STATUSES,
  createPlayerStateResult,
  isPlayerStateResultModel,
  isGameOverPlayerStateResult
};
