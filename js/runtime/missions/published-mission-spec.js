/* CRIOS Runtime Missions - PublishedMissionSpec model */
(function(){
  'use strict';

  var internal = window.__CRIOS_RUNTIME_MISSION_INTERNAL__ = window.__CRIOS_RUNTIME_MISSION_INTERNAL__ || {};
  var DANGEROUS_KEYS = Object.freeze({ '__proto__': true, prototype: true, constructor: true });
  var ROOT_KEYS = Object.freeze(['handlerId', 'handlerVersion', 'missionId', 'payload']);

  var ERROR_CODES = Object.freeze({
    MISSION_SPEC_INVALID: 'MISSION_SPEC_INVALID',
    MISSION_HANDLER_ID_MISSING: 'MISSION_HANDLER_ID_MISSING',
    MISSION_HANDLER_VERSION_MISSING: 'MISSION_HANDLER_VERSION_MISSING',
    MISSION_HANDLER_NOT_FOUND: 'MISSION_HANDLER_NOT_FOUND',
    MISSION_HANDLER_VERSION_UNSUPPORTED: 'MISSION_HANDLER_VERSION_UNSUPPORTED',
    MISSION_HANDLER_DUPLICATE: 'MISSION_HANDLER_DUPLICATE',
    MISSION_HANDLER_REPLACEMENT_FORBIDDEN: 'MISSION_HANDLER_REPLACEMENT_FORBIDDEN',
    MISSION_PAYLOAD_INVALID: 'MISSION_PAYLOAD_INVALID',
    MISSION_PAYLOAD_INCOMPLETE: 'MISSION_PAYLOAD_INCOMPLETE',
    MISSION_MATERIALIZATION_FAILED: 'MISSION_MATERIALIZATION_FAILED',
    MATERIALIZED_MISSION_INVALID: 'MATERIALIZED_MISSION_INVALID',
    NONDETERMINISTIC_GENERATION_UNDECLARED: 'NONDETERMINISTIC_GENERATION_UNDECLARED',
    LEGACY_CONTENT_MIX_FORBIDDEN: 'LEGACY_CONTENT_MIX_FORBIDDEN'
  });

  var CONSTANTS = {
    VERSION: '1.0.0',
    DEFAULT_HANDLER_ID: 'crios.geometry.declarative-area',
    DEFAULT_HANDLER_VERSION: '1.0.0',
    RNG_POLICY: 'SEEDED_SEQUENCE_V1',
    astTypes: Object.freeze(['number', 'variable', 'add', 'subtract', 'multiply', 'divide']),
    scenePrimitives: Object.freeze(['rect', 'circle', 'polygon', 'line', 'text']),
    severities: Object.freeze({ ERROR: 'ERROR', WARNING: 'WARNING' }),
    limits: Object.freeze({ AST_MAX_DEPTH: 32, AST_MAX_NODES: 256, TEMPLATE_MAX_LENGTH: 4000, SCENE_MAX_PRIMITIVES: 64 }),
    errorCodes: ERROR_CODES
  };

  function isPlainObject(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    var prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }

  function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.keys(value).forEach(function(key){ deepFreeze(value[key]); });
    return Object.freeze(value);
  }

  function issue(code, path, message) {
    return deepFreeze({ code: code, severity: 'ERROR', path: path, message: message });
  }

  function result(issues) {
    var copy = issues.slice();
    return deepFreeze({ valid: copy.length === 0, issues: copy });
  }

  function exactKeys(value, expected) {
    if (!isPlainObject(value)) return false;
    var actual = Object.keys(value).sort();
    var sortedExpected = expected.slice().sort();
    return actual.length === sortedExpected.length && actual.every(function(key, index){ return key === sortedExpected[index]; });
  }

  function inspectSerializable(value, path, seen, issues) {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) issues.push(issue(ERROR_CODES.MISSION_SPEC_INVALID, path, 'Numbers must be finite.'));
      return;
    }
    if (typeof value !== 'object') {
      issues.push(issue(ERROR_CODES.MISSION_SPEC_INVALID, path, 'Value is not serializable.'));
      return;
    }
    if (typeof Node !== 'undefined' && value instanceof Node) {
      issues.push(issue(ERROR_CODES.MISSION_SPEC_INVALID, path, 'DOM nodes are forbidden.'));
      return;
    }
    if (seen.indexOf(value) >= 0) {
      issues.push(issue(ERROR_CODES.MISSION_SPEC_INVALID, path, 'Circular references are forbidden.'));
      return;
    }
    if (!Array.isArray(value) && !isPlainObject(value)) {
      issues.push(issue(ERROR_CODES.MISSION_SPEC_INVALID, path, 'Custom prototypes are forbidden.'));
      return;
    }
    seen.push(value);
    Object.keys(value).forEach(function(key){
      var descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (DANGEROUS_KEYS[key]) issues.push(issue(ERROR_CODES.MISSION_SPEC_INVALID, path + '.' + key, 'Dangerous key is forbidden.'));
      if (!descriptor || typeof descriptor.get === 'function' || typeof descriptor.set === 'function') {
        issues.push(issue(ERROR_CODES.MISSION_SPEC_INVALID, path + '.' + key, 'Accessor properties are forbidden.'));
      } else {
        inspectSerializable(descriptor.value, path + (Array.isArray(value) ? '[' + key + ']' : '.' + key), seen, issues);
      }
    });
    seen.pop();
  }

  function cloneStrict(value, seen) {
    if (value === null || typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number') return value;
    if (seen.indexOf(value) >= 0) throw new Error('Circular value.');
    seen.push(value);
    var output = Array.isArray(value) ? [] : {};
    Object.keys(value).forEach(function(key){ output[key] = cloneStrict(value[key], seen); });
    seen.pop();
    return output;
  }

  function validatePublishedMissionSpec(input) {
    var issues = [];
    if (!isPlainObject(input)) return result([issue(ERROR_CODES.MISSION_SPEC_INVALID, '$', 'Spec must be a plain object.')]);
    inspectSerializable(input, '$', [], issues);
    if (issues.length) return result(issues);
    if (!exactKeys(input, ROOT_KEYS)) issues.push(issue(ERROR_CODES.MISSION_SPEC_INVALID, '$', 'Spec root keys must be exact.'));
    if (typeof input.missionId !== 'string' || !input.missionId.trim()) issues.push(issue(ERROR_CODES.MISSION_SPEC_INVALID, '$.missionId', 'missionId is required.'));
    if (typeof input.handlerId !== 'string' || !input.handlerId.trim()) issues.push(issue(ERROR_CODES.MISSION_HANDLER_ID_MISSING, '$.handlerId', 'handlerId is required.'));
    if (typeof input.handlerVersion !== 'string' || !input.handlerVersion.trim()) {
      issues.push(issue(ERROR_CODES.MISSION_HANDLER_VERSION_MISSING, '$.handlerVersion', 'handlerVersion is required.'));
    } else if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(input.handlerVersion)) {
      issues.push(issue(ERROR_CODES.MISSION_SPEC_INVALID, '$.handlerVersion', 'handlerVersion must be exact semantic version.'));
    }
    if (!isPlainObject(input.payload)) issues.push(issue(ERROR_CODES.MISSION_PAYLOAD_INVALID, '$.payload', 'payload must be a plain object.'));
    return result(issues);
  }

  function createPublishedMissionSpec(input) {
    var validation = validatePublishedMissionSpec(input);
    if (!validation.valid) return deepFreeze({ success: false, spec: null, error: validation.issues[0], validation: validation });
    var spec = deepFreeze(cloneStrict(input, []));
    return deepFreeze({ success: true, spec: spec, error: null, validation: validation });
  }

  function isPublishedMissionSpec(value) { return validatePublishedMissionSpec(value).valid && Object.isFrozen(value); }

  internal.constants = deepFreeze(CONSTANTS);
  internal.isPlainObject = isPlainObject;
  internal.exactKeys = exactKeys;
  internal.deepFreeze = deepFreeze;
  internal.cloneStrict = cloneStrict;
  internal.issue = issue;
  internal.validationResult = result;
  internal.createPublishedMissionSpec = createPublishedMissionSpec;
  internal.validatePublishedMissionSpec = validatePublishedMissionSpec;
  internal.isPublishedMissionSpec = isPublishedMissionSpec;
})();