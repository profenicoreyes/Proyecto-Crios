const RUNTIME_RESULT_STATUS = 'RUNTIME_REBUILT';

const RUNTIME_SNAPSHOT_STATUSES = Object.freeze({
  INITIALIZED: 'initialized',
  READY: 'ready',
  ERROR: 'error'
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

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim() !== '';
}

function isRuntimeStateSnapshot(value) {
  return hasExactKeys(value, ['status', 'errors'])
    && Object.values(RUNTIME_SNAPSHOT_STATUSES).includes(value.status)
    && Array.isArray(value.errors);
}

function isSnapshotTree(value, ancestors = new Set()) {
  if (typeof value === 'function' || typeof value === 'symbol') return false;
  if (value === null || typeof value !== 'object') return true;
  if (ancestors.has(value)) return false;
  if (!Array.isArray(value)) {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return false;
  }

  ancestors.add(value);
  const valid = Object.keys(value).every(key => isSnapshotTree(value[key], ancestors));
  ancestors.delete(value);
  return valid;
}

function isRuntimeSnapshot(value) {
  if (!hasExactKeys(value, ['session', 'mission', 'state'])) return false;
  if (!isObject(value.session) || !isObject(value.mission)) return false;
  if (!nonEmptyString(value.session.releaseId)) return false;
  if (!Number.isInteger(value.session.currentMissionIndex) || value.session.currentMissionIndex < 0) return false;
  if (!isObject(value.session.progress)) return false;
  if (!nonEmptyString(value.session.progress.currentMissionId)) return false;
  if (!nonEmptyString(value.mission.id)) return false;
  if (value.session.progress.currentMissionId !== value.mission.id) return false;
  return isRuntimeStateSnapshot(value.state) && isSnapshotTree(value);
}

function cloneValue(value, ancestors = new Set()) {
  if (typeof value === 'function' || typeof value === 'symbol') {
    throw new TypeError('runtime must contain only snapshot values.');
  }
  if (value === null || typeof value !== 'object') return value;
  if (ancestors.has(value)) {
    throw new TypeError('runtime must not contain cyclic references.');
  }
  if (!Array.isArray(value)) {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError('runtime must contain only plain objects and arrays.');
    }
  }

  ancestors.add(value);
  const clone = Array.isArray(value) ? [] : {};
  Object.keys(value).forEach(key => {
    clone[key] = cloneValue(value[key], ancestors);
  });
  ancestors.delete(value);
  return clone;
}

function deepFreeze(value) {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.keys(value).forEach(key => deepFreeze(value[key]));
  return Object.freeze(value);
}

function createRuntimeResult(runtime) {
  if (!isRuntimeSnapshot(runtime)) {
    throw new TypeError('runtime must be a coherent Runtime snapshot.');
  }

  const snapshot = cloneValue(runtime);
  if (!isRuntimeSnapshot(snapshot)) {
    throw new TypeError('runtime must be a coherent Runtime snapshot.');
  }

  return Object.freeze({
    status: RUNTIME_RESULT_STATUS,
    runtime: deepFreeze(snapshot)
  });
}

function isRuntimeResultModel(value) {
  return hasExactKeys(value, ['status', 'runtime'])
    && value.status === RUNTIME_RESULT_STATUS
    && isRuntimeSnapshot(value.runtime);
}

export {
  RUNTIME_RESULT_STATUS,
  RUNTIME_SNAPSHOT_STATUSES,
  createRuntimeResult,
  isRuntimeResultModel
};
