/* CRIOS LiveRoom Remote - browser composition bootstrap */
(function(){
  'use strict';

  var VERSION = '1.0.0';
  var ALLOWED_CONFIG_KEYS = Object.freeze(['endpoint', 'timeoutMs']);

  function text(value) {
    return value == null ? '' : String(value).trim();
  }

  function hasOwn(value, key) {
    return Boolean(value && Object.prototype.hasOwnProperty.call(value, key));
  }

  function freeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.keys(value).forEach(function(key){ freeze(value[key]); });
    return Object.freeze(value);
  }

  function frozenError(code, message, metadata) {
    return freeze({
      code: String(code || 'LIVE_ROOM_BROWSER_BOOTSTRAP_FAILED'),
      message: String(message || code || 'LiveRoom browser bootstrap failed.'),
      metadata: metadata && typeof metadata === 'object' ? Object.assign({}, metadata) : null
    });
  }

  function selection(configured, model, client, error) {
    return Object.freeze({
      configured: Boolean(configured),
      model: model || null,
      client: client || null,
      error: error || null
    });
  }

  function resolveDefaultConfig() {
    if (typeof CRIOS_CONFIG === 'undefined' || !CRIOS_CONFIG || typeof CRIOS_CONFIG !== 'object') {
      return {present: false, value: null};
    }
    return {
      present: true,
      value: {
        endpoint: text(CRIOS_CONFIG.publicationEndpoint),
        timeoutMs: Number(CRIOS_CONFIG.publicationTimeoutMs)
      }
    };
  }

  function resolveConfig(options) {
    if (hasOwn(options, 'config')) return {present: true, value: options.config};
    return resolveDefaultConfig();
  }

  function validateConfig(config) {
    if (!config || typeof config !== 'object' || Array.isArray(config)) {
      return frozenError('LIVE_ROOM_REMOTE_CONFIG_INVALID', 'LiveRoom remote configuration must be an object.', null);
    }

    var keys = Object.keys(config);
    var unknown = keys.filter(function(key){ return ALLOWED_CONFIG_KEYS.indexOf(key) < 0; });
    if (unknown.length) {
      return frozenError(
        'LIVE_ROOM_REMOTE_CONFIG_INVALID',
        'LiveRoom remote configuration contains unsupported keys.',
        {keys: unknown.slice().sort().join(',')}
      );
    }

    if (!text(config.endpoint)) {
      return frozenError('LIVE_ROOM_REMOTE_ENDPOINT_REQUIRED', 'LiveRoom remote endpoint is required.', null);
    }

    if (hasOwn(config, 'timeoutMs')) {
      var timeoutMs = Number(config.timeoutMs);
      if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
        return frozenError('LIVE_ROOM_REMOTE_CONFIG_INVALID', 'timeoutMs must be a positive finite number.', null);
      }
    }

    return null;
  }

  function createClientSelection(options) {
    var opts = options && typeof options === 'object' ? options : {};
    var configState = resolveConfig(opts);

    if (!configState.present) return selection(false, null, null, null);

    var configError = validateConfig(configState.value);
    if (configError) return selection(true, null, null, configError);

    var model = hasOwn(opts, 'model') ? opts.model : (window.CRIOS_LIVE_ROOM_MODEL || null);
    var contract = hasOwn(opts, 'contract') ? opts.contract : (window.CRIOS_REMOTE_LIVE_ROOM_CONTRACT || null);
    var clientFactory = hasOwn(opts, 'clientFactory') ? opts.clientFactory : (window.CRIOS_REMOTE_LIVE_ROOM_CLIENT || null);

    if (!model ||
        !contract ||
        !clientFactory || typeof clientFactory.createClient !== 'function') {
      return selection(
        true,
        model,
        null,
        frozenError(
          'LIVE_ROOM_REMOTE_MODULE_UNAVAILABLE',
          'LiveRoom browser modules are not available.',
          null
        )
      );
    }

    var client;
    try {
      client = clientFactory.createClient({
        contract: contract,
        endpoint: text(configState.value.endpoint),
        timeoutMs: hasOwn(configState.value, 'timeoutMs') ? Number(configState.value.timeoutMs) : undefined
      });
    } catch (error) {
      return selection(
        true,
        model,
        null,
        frozenError(
          'LIVE_ROOM_REMOTE_CLIENT_CREATE_FAILED',
          String(error && error.message || error || 'LiveRoom remote client creation failed.'),
          null
        )
      );
    }

    if (!client || typeof client.available !== 'function' || client.available() !== true ||
        typeof client.createLiveRoom !== 'function' ||
        typeof client.joinLiveRoom !== 'function' ||
        typeof client.heartbeatLiveRoom !== 'function' ||
        typeof client.getLiveRoom !== 'function') {
      return selection(
        true,
        model,
        null,
        frozenError(
          'LIVE_ROOM_REMOTE_CLIENT_INVALID',
          'LiveRoom remote client does not expose the required interface.',
          null
        )
      );
    }

    return selection(true, model, client, null);
  }

  var defaultSelection = createClientSelection({});

  window.CRIOS_LIVE_ROOM_BROWSER_BOOTSTRAP = Object.freeze({
    version: VERSION,
    createClientSelection: createClientSelection
  });
  window.CRIOS_LIVE_ROOM_BROWSER = defaultSelection;
})();
