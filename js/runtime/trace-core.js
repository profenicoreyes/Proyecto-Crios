(function bootstrapCriosTrace() {
'use strict';

var VERSION = '1.0.0';
var CAPACITY = 2000;
var TRACE_COUNTER = 0;
var CORRELATION_COUNTER = 0;
var VALID_EXPERIMENT_IDS = {
  'RT-001': true,
  'RT-002': true,
  'RT-003': true,
  'RT-004': true,
  'RT-005': true,
  'RT-006': true,
  'RT-007': true,
  'RT-008': true
};

var REQUIRED_EVENT_FIELDS = [
  'sourceFile',
  'sourceFunction',
  'phase',
  'sessionId',
  'missionId',
  'screenBefore',
  'screenAfter',
  'currentMissionIndexBefore',
  'currentMissionIndexAfter',
  'currentMissionIdBefore',
  'currentMissionIdAfter',
  'evaluationBefore',
  'evaluationAfter',
  'finalizedBefore',
  'finalizedAfter',
  'transmissionQueuedBefore',
  'transmissionQueuedAfter',
  'gameOverBefore',
  'gameOverAfter',
  'persisted',
  'transmitted',
  'visibleEffect',
  'error',
  'metadata'
];

var state = {
  available: true,
  armed: false,
  recording: false,
  experimentId: null,
  traceId: null,
  sequence: 0,
  events: []
};

function safeNowIso() {
  try {
    return new Date().toISOString();
  } catch (error) {
    return null;
  }
}

function safePerformanceNow() {
  try {
    if (typeof performance !== 'undefined' && performance && typeof performance.now === 'function') {
      return Number(performance.now());
    }
  } catch (error) {
  }
  return null;
}

function sanitizePrefix(prefix) {
  var text = String(prefix || '').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  return text || 'corr';
}

function createTraceIdInternal() {
  TRACE_COUNTER += 1;
  try {
    if (typeof crypto !== 'undefined' && crypto && typeof crypto.randomUUID === 'function') {
      return 'trace-' + crypto.randomUUID();
    }
  } catch (error) {
  }

  var ts = Date.now().toString(36);
  var seq = TRACE_COUNTER.toString(36);
  var rnd = Math.random().toString(36).slice(2, 10);
  return 'trace-' + ts + '-' + seq + '-' + rnd;
}

function createCorrelationId(prefix) {
  CORRELATION_COUNTER += 1;
  var clean = sanitizePrefix(prefix);
  return clean + '-' + Date.now().toString(36) + '-' + CORRELATION_COUNTER.toString(36);
}

function isDomNode(value) {
  return value && typeof value === 'object' && typeof value.nodeType === 'number' && typeof value.nodeName === 'string';
}

function summarizeDomNode(node) {
  var id = null;
  var className = null;
  try {
    id = node.id ? String(node.id) : null;
  } catch (error) {
  }
  try {
    className = node.className ? String(node.className) : null;
  } catch (error) {
  }
  return {
    nodeType: Number(node.nodeType),
    nodeName: String(node.nodeName || ''),
    id: id,
    className: className
  };
}

function truncateString(value) {
  var str = String(value);
  return str.length > 1000 ? str.slice(0, 1000) : str;
}

function safeClone(value, depth, seen) {
  if (depth > 5) {
    return '[MaxDepth]';
  }

  if (value === null) return null;

  var valueType = typeof value;
  if (valueType === 'string') return truncateString(value);
  if (valueType === 'number' || valueType === 'boolean') return value;
  if (valueType === 'undefined') return '[Undefined]';
  if (valueType === 'function') return '[Function]';
  if (valueType === 'symbol') return '[Symbol]';
  if (valueType === 'bigint') return String(value);

  if (value instanceof Date) {
    var ms = value.getTime();
    return Number.isFinite(ms) ? value.toISOString() : '[InvalidDate]';
  }

  if (value instanceof Error) {
    return {
      name: truncateString(value.name || 'Error'),
      message: truncateString(value.message || ''),
      stack: value.stack ? truncateString(value.stack) : null
    };
  }

  if (isDomNode(value)) {
    return summarizeDomNode(value);
  }

  if (!value || valueType !== 'object') {
    return '[Unserializable]';
  }

  if (seen.has(value)) {
    return '[Circular]';
  }
  seen.set(value, true);

  if (Array.isArray(value)) {
    var outArray = [];
    var maxItems = Math.min(value.length, 100);
    for (var i = 0; i < maxItems; i += 1) {
      outArray.push(safeClone(value[i], depth + 1, seen));
    }
    seen.delete(value);
    return outArray;
  }

  var outObject = {};
  var keys = Object.keys(value);
  var maxKeys = Math.min(keys.length, 100);
  for (var j = 0; j < maxKeys; j += 1) {
    var key = keys[j];
    outObject[key] = safeClone(value[key], depth + 1, seen);
  }

  seen.delete(value);
  return outObject;
}

function cloneEventRecord(eventRecord) {
  return safeClone(eventRecord, 0, new Map());
}

function normalizePayload(payload) {
  var source = payload && typeof payload === 'object' ? payload : {};
  var normalized = {};

  for (var i = 0; i < REQUIRED_EVENT_FIELDS.length; i += 1) {
    normalized[REQUIRED_EVENT_FIELDS[i]] = null;
  }

  for (var k = 0; k < REQUIRED_EVENT_FIELDS.length; k += 1) {
    var field = REQUIRED_EVENT_FIELDS[k];
    if (Object.prototype.hasOwnProperty.call(source, field)) {
      normalized[field] = source[field];
    }
  }

  normalized.evaluationBefore = safeClone(normalized.evaluationBefore, 0, new Map());
  normalized.evaluationAfter = safeClone(normalized.evaluationAfter, 0, new Map());
  normalized.visibleEffect = safeClone(normalized.visibleEffect, 0, new Map());
  normalized.error = safeClone(normalized.error, 0, new Map());
  normalized.metadata = safeClone(normalized.metadata, 0, new Map());

  if (normalized.sourceFile !== null) normalized.sourceFile = String(normalized.sourceFile);
  if (normalized.sourceFunction !== null) normalized.sourceFunction = String(normalized.sourceFunction);
  if (normalized.phase !== null) normalized.phase = String(normalized.phase);

  return normalized;
}

function pushEvent(eventRecord) {
  state.events.push(eventRecord);
  if (state.events.length > CAPACITY) {
    state.events.shift();
  }
}

function isAvailable() {
  return state.available === true;
}

function isArmed() {
  return state.armed === true;
}

function isRecording() {
  return state.recording === true;
}

function enable() {
  state.armed = true;
  if (!VALID_EXPERIMENT_IDS[state.experimentId || '']) {
    state.recording = false;
  }
  return true;
}

function disable() {
  state.armed = false;
  state.recording = false;
  return true;
}

function startExperiment(experimentId) {
  var nextId = String(experimentId || '');
  if (!VALID_EXPERIMENT_IDS[nextId]) {
    return false;
  }

  state.armed = true;
  state.recording = true;
  state.experimentId = nextId;
  state.traceId = createTraceIdInternal();
  state.sequence = 0;
  state.events.length = 0;
  return true;
}

function stopExperiment() {
  state.recording = false;
  state.armed = true;
  return true;
}

function clear() {
  state.events.length = 0;
  state.sequence = 0;
  if (state.recording) {
    state.traceId = createTraceIdInternal();
  }
  return true;
}

function getEvents() {
  var out = [];
  for (var i = 0; i < state.events.length; i += 1) {
    out.push(cloneEventRecord(state.events[i]));
  }
  return out;
}

function exportEvents() {
  return JSON.stringify(getEvents());
}

function status() {
  return {
    available: isAvailable(),
    armed: isArmed(),
    recording: isRecording(),
    experimentId: state.experimentId,
    traceId: state.traceId,
    sequence: state.sequence,
    eventCount: state.events.length,
    capacity: CAPACITY,
    version: VERSION
  };
}

function emit(eventType, payload) {
  try {
    if (!state.recording) return false;

    if (typeof eventType !== 'string') return false;
    var typeText = eventType.trim();
    if (!typeText) return false;

    var normalized = normalizePayload(payload);

    state.sequence += 1;

    var eventRecord = {
      sequence: state.sequence,
      traceId: state.traceId,
      experimentId: state.experimentId,
      timestamp: safeNowIso(),
      performanceTime: safePerformanceNow(),
      eventType: typeText,
      sourceFile: normalized.sourceFile,
      sourceFunction: normalized.sourceFunction,
      phase: normalized.phase,
      sessionId: normalized.sessionId,
      missionId: normalized.missionId,
      screenBefore: normalized.screenBefore,
      screenAfter: normalized.screenAfter,
      currentMissionIndexBefore: normalized.currentMissionIndexBefore,
      currentMissionIndexAfter: normalized.currentMissionIndexAfter,
      currentMissionIdBefore: normalized.currentMissionIdBefore,
      currentMissionIdAfter: normalized.currentMissionIdAfter,
      evaluationBefore: normalized.evaluationBefore,
      evaluationAfter: normalized.evaluationAfter,
      finalizedBefore: normalized.finalizedBefore,
      finalizedAfter: normalized.finalizedAfter,
      transmissionQueuedBefore: normalized.transmissionQueuedBefore,
      transmissionQueuedAfter: normalized.transmissionQueuedAfter,
      gameOverBefore: normalized.gameOverBefore,
      gameOverAfter: normalized.gameOverAfter,
      persisted: normalized.persisted,
      transmitted: normalized.transmitted,
      visibleEffect: normalized.visibleEffect,
      error: normalized.error,
      metadata: normalized.metadata
    };

    pushEvent(eventRecord);
    return true;
  } catch (error) {
    return false;
  }
}

function applyUrlFlags() {
  try {
    var params = new URLSearchParams(window.location.search || '');
    if (params.get('criosTrace') === '1') {
      enable();
      var experimentId = params.get('criosExperiment');
      if (experimentId) {
        startExperiment(experimentId);
      }
    }
  } catch (error) {
  }
}

window.CRIOS_TRACE = Object.freeze({
  version: VERSION,
  isAvailable: isAvailable,
  isArmed: isArmed,
  isRecording: isRecording,
  startExperiment: startExperiment,
  stopExperiment: stopExperiment,
  enable: enable,
  disable: disable,
  emit: emit,
  getEvents: getEvents,
  export: exportEvents,
  clear: clear,
  status: status,
  createCorrelationId: createCorrelationId
});

applyUrlFlags();
})();
