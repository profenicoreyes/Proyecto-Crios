/* CRIOS Studio - remote publication composition bootstrap */
(function(){
  'use strict';

  var VERSION = '1.0.0';
  var CONFIG_GLOBAL = 'CRIOS_STUDIO_REMOTE_PUBLICATION_CONFIG';
  var ALLOWED_CONFIG_KEYS = Object.freeze(['endpoint', 'timeoutMs']);

  function text(value) {
    return value == null ? '' : String(value).trim();
  }

  function frozenError(code, message, metadata) {
    return Object.freeze({
      code: String(code || 'REMOTE_PUBLICATION_BOOTSTRAP_FAILED'),
      message: String(message || code || 'Remote publication bootstrap failed.'),
      metadata: metadata && typeof metadata === 'object' ? Object.freeze(Object.assign({}, metadata)) : null
    });
  }

  function selection(configured, service, client, error) {
    return Object.freeze({
      configured: Boolean(configured),
      service: service || null,
      client: client || null,
      error: error || null
    });
  }

  function hasOwn(value, key) {
    return Boolean(value && Object.prototype.hasOwnProperty.call(value, key));
  }

  function resolveConfig(options) {
    if (hasOwn(options, 'config')) {
      return { present: true, value: options.config };
    }
    if (hasOwn(window, CONFIG_GLOBAL)) {
      return { present: true, value: window[CONFIG_GLOBAL] };
    }
    return { present: false, value: null };
  }

  function validateConfig(config) {
    if (!config || typeof config !== 'object' || Array.isArray(config)) {
      return frozenError('REMOTE_PUBLICATION_CONFIG_INVALID', 'Remote publication configuration must be an object.', null);
    }

    if (hasOwn(config, 'writeToken') || hasOwn(config, 'writeTokenProvider')) {
      return frozenError(
        'REMOTE_PUBLICATION_AUTH_RETIRED',
        'Remote publication no longer accepts teacher authorization configuration.',
        null
      );
    }

    var keys = Object.keys(config);
    var unknown = keys.filter(function(key){ return ALLOWED_CONFIG_KEYS.indexOf(key) < 0; });
    if (unknown.length) {
      return frozenError(
        'REMOTE_PUBLICATION_CONFIG_INVALID',
        'Remote publication configuration contains unsupported keys.',
        { keys: unknown.slice().sort().join(',') }
      );
    }

    if (!text(config.endpoint)) {
      return frozenError('REMOTE_PUBLICATION_ENDPOINT_REQUIRED', 'Remote publication endpoint is required.', null);
    }

    if (hasOwn(config, 'timeoutMs')) {
      var timeoutMs = Number(config.timeoutMs);
      if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
        return frozenError('REMOTE_PUBLICATION_CONFIG_INVALID', 'timeoutMs must be a positive finite number.', null);
      }
    }

    return null;
  }

  function isPublicationService(value) {
    return Boolean(value &&
      typeof value.publishCampaign === 'function' &&
      typeof value.listPublications === 'function' &&
      typeof value.getPublication === 'function' &&
      typeof value.getRecord === 'function');
  }

  function createServiceSelection(options) {
    var opts = options && typeof options === 'object' ? options : {};
    var configState = resolveConfig(opts);

    if (!configState.present) {
      return selection(false, null, null, null);
    }

    var config = configState.value;
    var configError = validateConfig(config);
    if (configError) {
      return selection(true, null, null, configError);
    }

    var core = opts.core || window.CRIOS_PUBLICATION_CORE || null;
    var store = hasOwn(opts, 'store') ? opts.store : null;
    var contract = opts.contract || window.CRIOS_REMOTE_PUBLICATION_CONTRACT || null;
    var clientFactory = opts.clientFactory || window.CRIOS_REMOTE_PUBLICATION_CLIENT || null;
    var serviceFactory = opts.serviceFactory || window.CRIOS_STUDIO_REMOTE_PUBLICATION_SERVICE || null;

    if (!core ||
        !contract ||
        !clientFactory || typeof clientFactory.createClient !== 'function' ||
        !serviceFactory || typeof serviceFactory.createRemotePublicationService !== 'function') {
      return selection(
        true,
        null,
        null,
        frozenError(
          'REMOTE_PUBLICATION_MODULE_UNAVAILABLE',
          'Remote publication modules are not available.',
          null
        )
      );
    }

    var client;
    try {
      client = clientFactory.createClient({
        contract: contract,
        endpoint: text(config.endpoint),
        timeoutMs: hasOwn(config, 'timeoutMs') ? Number(config.timeoutMs) : undefined
      });
    } catch (clientError) {
      return selection(
        true,
        null,
        null,
        frozenError(
          'REMOTE_PUBLICATION_CLIENT_CREATE_FAILED',
          String(clientError && clientError.message || clientError || 'Remote publication client creation failed.'),
          null
        )
      );
    }

    var service;
    try {
      var serviceOptions = {
        core: core,
        remoteClient: client,
        store: store || undefined
      };
      if (typeof opts.readDraftRevision === 'function') {
        serviceOptions.readDraftRevision = opts.readDraftRevision;
      }
      service = serviceFactory.createRemotePublicationService(serviceOptions);
    } catch (serviceError) {
      return selection(
        true,
        null,
        null,
        frozenError(
          'REMOTE_PUBLICATION_SERVICE_CREATE_FAILED',
          String(serviceError && serviceError.message || serviceError || 'Remote publication service creation failed.'),
          null
        )
      );
    }

    if (!isPublicationService(service)) {
      return selection(
        true,
        null,
        null,
        frozenError(
          'REMOTE_PUBLICATION_SERVICE_INVALID',
          'Remote publication service does not expose the required Studio publication interface.',
          null
        )
      );
    }

    return selection(true, service, client, null);
  }

  window.CRIOS_STUDIO_REMOTE_PUBLICATION_BOOTSTRAP = Object.freeze({
    version: VERSION,
    configGlobal: CONFIG_GLOBAL,
    createServiceSelection: createServiceSelection
  });
})();
