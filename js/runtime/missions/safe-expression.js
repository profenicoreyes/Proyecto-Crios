/* CRIOS Runtime Missions - closed numeric AST */
(function(){
  'use strict';
  var internal = window.__CRIOS_RUNTIME_MISSION_INTERNAL__;
  if (!internal) throw new Error('PublishedMissionSpec model must load first.');
  var limits = internal.constants.limits;

  function expressionError(code, message, path) {
    var error = new Error(message);
    error.code = code;
    error.path = path || '$';
    return error;
  }

  function walk(node, environment, state, depth, path) {
    if (depth > limits.AST_MAX_DEPTH) throw expressionError('EXPRESSION_DEPTH_EXCEEDED', 'Expression depth exceeded.', path);
    state.nodes += 1;
    if (state.nodes > limits.AST_MAX_NODES) throw expressionError('EXPRESSION_NODE_LIMIT_EXCEEDED', 'Expression node limit exceeded.', path);
    if (!internal.isPlainObject(node) || typeof node.type !== 'string') throw expressionError('EXPRESSION_INVALID', 'Expression node is invalid.', path);
    if (node.type === 'number') {
      if (!internal.exactKeys(node, ['type', 'value']) || !Number.isFinite(node.value)) throw expressionError('EXPRESSION_INVALID', 'Number node is invalid.', path);
      return node.value;
    }
    if (node.type === 'variable') {
      if (!internal.exactKeys(node, ['name', 'type']) || typeof node.name !== 'string' || !/^[A-Za-z][A-Za-z0-9_]*$/.test(node.name)) throw expressionError('EXPRESSION_INVALID', 'Variable node is invalid.', path);
      if (!Object.prototype.hasOwnProperty.call(environment, node.name)) throw expressionError('EXPRESSION_VARIABLE_MISSING', 'Expression variable is missing: ' + node.name + '.', path);
      if (!Number.isFinite(environment[node.name])) throw expressionError('EXPRESSION_RESULT_NON_FINITE', 'Expression variable is not finite.', path);
      return environment[node.name];
    }
    if (['add', 'subtract', 'multiply', 'divide'].indexOf(node.type) < 0) throw expressionError('EXPRESSION_OPERATION_UNSUPPORTED', 'Expression operation is unsupported.', path);
    if (!internal.exactKeys(node, ['left', 'right', 'type'])) throw expressionError('EXPRESSION_INVALID', 'Binary node keys are invalid.', path);
    var left = walk(node.left, environment, state, depth + 1, path + '.left');
    var right = walk(node.right, environment, state, depth + 1, path + '.right');
    var value;
    if (node.type === 'add') value = left + right;
    if (node.type === 'subtract') value = left - right;
    if (node.type === 'multiply') value = left * right;
    if (node.type === 'divide') {
      if (right === 0) throw expressionError('EXPRESSION_DIVISION_BY_ZERO', 'Division by zero.', path);
      value = left / right;
    }
    if (!Number.isFinite(value)) throw expressionError('EXPRESSION_RESULT_NON_FINITE', 'Expression result is not finite.', path);
    return value;
  }

  function evaluateExpression(ast, environment) {
    if (!internal.isPlainObject(environment)) throw expressionError('EXPRESSION_ENVIRONMENT_INVALID', 'Expression environment must be a plain object.', '$environment');
    return walk(ast, environment, { nodes: 0 }, 1, '$');
  }

  function validateExpression(ast, allowedNames) {
    var environment = {};
    (allowedNames || []).forEach(function(name){ environment[name] = 1; });
    try { evaluateExpression(ast, environment); return internal.validationResult([]); }
    catch (error) { return internal.validationResult([internal.issue('MISSION_PAYLOAD_INVALID', '$expression', error.message)]); }
  }

  internal.evaluateExpression = evaluateExpression;
  internal.validateExpression = validateExpression;
})();