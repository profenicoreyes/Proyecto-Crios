import { isEvaluationModel } from '../evaluation/evaluation-model.js';

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function has(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim() !== '';
}

function validOptionalTime(value) {
  return value === undefined
    || value === null
    || (typeof value === 'number' && Number.isFinite(value));
}

function createMissionProgressUpdate({
  evaluation,
  missionId,
  progress,
  sessionStats,
  missionRecord = null,
  openedAt,
  now
}) {
  if (!isEvaluationModel(evaluation)) {
    throw new TypeError('evaluation must be a valid Evaluation model.');
  }
  if (!nonEmptyString(missionId)) {
    throw new TypeError('missionId must be a non-empty string.');
  }
  if (!isObject(progress)) {
    throw new TypeError('progress must be an object.');
  }
  if (!isObject(sessionStats)) {
    throw new TypeError('sessionStats must be an object.');
  }
  if (missionRecord !== null && !isObject(missionRecord)) {
    throw new TypeError('missionRecord must be an object or null.');
  }
  if (!validOptionalTime(openedAt)) {
    throw new TypeError('openedAt must be a finite number, null or undefined.');
  }
  if (typeof now !== 'number' || !Number.isFinite(now)) {
    throw new TypeError('now must be a finite number.');
  }

  const nextProgress = { ...progress };
  const nextSessionStats = { ...sessionStats };
  const nextMissionRecord = missionRecord === null ? null : { ...missionRecord };

  if (evaluation.success) {
    const currentStats = sessionStats[missionId];
    if (!isObject(currentStats)) {
      throw new TypeError('sessionStats must contain the mission record.');
    }

    const previousTimeMs = currentStats.timeMs ?? 0;
    if (typeof previousTimeMs !== 'number' || !Number.isFinite(previousTimeMs)) {
      throw new TypeError('sessionStats mission timeMs must be finite when present.');
    }

    const startedAt = openedAt || now;
    const nextTimeMs = previousTimeMs + (now - startedAt);

    nextProgress[missionId] = true;
    nextSessionStats[missionId] = {
      ...currentStats,
      completed: true,
      timeMs: nextTimeMs
    };

    if (nextMissionRecord) {
      nextMissionRecord.answerCorrect = true;
      nextMissionRecord.timeMs = nextTimeMs;
    }
  } else if (nextMissionRecord) {
    nextMissionRecord.answerCorrect = false;
  }

  return {
    progress: nextProgress,
    sessionStats: nextSessionStats,
    missionRecord: nextMissionRecord,
    campaignCompleted: false
  };
}

function isProgressModel(value) {
  return isObject(value)
    && nonEmptyString(value.status)
    && typeof value.campaignCompleted === 'boolean'
    && has(value, 'progress')
    && isObject(value.progress);
}

export {
  createMissionProgressUpdate,
  isProgressModel
};
