/* CRIOS Runtime Missions - versioned handler registry */
(function(){
  'use strict';
  var internal = window.__CRIOS_RUNTIME_MISSION_INTERNAL__;
  if (!internal) throw new Error('PublishedMissionSpec model must load first.');
  var E = internal.constants.errorCodes;

  function registryError(code, message) { var error = new Error(message); error.code = code; return error; }
  function handlerKey(id, version) { return String(id) + '@' + String(version); }
  function validHandler(handler) {
    return internal.isPlainObject(handler) && internal.exactKeys(handler, ['handlerId', 'handlerVersion', 'materialize', 'validateSpec']) &&
      typeof handler.handlerId === 'string' && handler.handlerId.trim() &&
      typeof handler.handlerVersion === 'string' && /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(handler.handlerVersion) &&
      typeof handler.validateSpec === 'function' && typeof handler.materialize === 'function';
  }

  function createRuntimeMissionHandlerRegistry() {
    var handlers = Object.create(null);
    var sealed = false;
    function register(handler) {
      if (sealed) throw registryError(E.MISSION_HANDLER_REPLACEMENT_FORBIDDEN, 'Registry is sealed.');
      if (!validHandler(handler)) throw registryError(E.MISSION_SPEC_INVALID, 'Handler contract is invalid.');
      var key = handlerKey(handler.handlerId, handler.handlerVersion);
      if (handlers[key]) throw registryError(handlers[key] === handler ? E.MISSION_HANDLER_DUPLICATE : E.MISSION_HANDLER_REPLACEMENT_FORBIDDEN, 'Handler identity is already registered.');
      handlers[key] = internal.deepFreeze(handler);
      return handlers[key];
    }
    function has(id, version) { return Boolean(handlers[handlerKey(id, version)]); }
    function get(id, version) { return handlers[handlerKey(id, version)] || null; }
    function list() {
      return internal.deepFreeze(Object.keys(handlers).sort().map(function(key){
        return { handlerId: handlers[key].handlerId, handlerVersion: handlers[key].handlerVersion };
      }));
    }
    function seal() { sealed = true; return true; }
    function isSealed() { return sealed; }
    return Object.freeze({ register: register, has: has, get: get, list: list, seal: seal, isSealed: isSealed });
  }
  internal.createRuntimeMissionHandlerRegistry = createRuntimeMissionHandlerRegistry;
})();