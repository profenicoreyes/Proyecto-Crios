/* CRIOS Runtime - remote publication reader composition */
(function(){
  'use strict';

  var VERSION = '1.0.0';
  var CONFIG_GLOBAL = 'CRIOS_RUNTIME_REMOTE_PUBLICATION_CONFIG';
  var ALLOWED_CONFIG_KEYS = Object.freeze(['endpoint', 'timeoutMs']);

  function text(value) {
    return value == null ? '' : String(value).trim();
  }

  function hasOwn(value, key) {
    return Boolean(value && Object.prototype.hasOwnProperty.call(value, key));
  }

  function frozenError(code, message, metadata) {
    return Object.freeze({
      code: String(code || 'RUNTIME_REMOTE_PUBLICATION_BOOTSTRAP_FAILED'),
      message: String(message || code || 'Runtime remote publication bootstrap failed.'),
      metadata: metadata && typeof metadata === 'object'
        ? Object.freeze(Object.assign({}, metadata))
        : null
    });
  }

  function selection(configured, readers, client, error) {
    return Object.freeze({
      configured: Boolean(configured),
      readers: readers || null,
      client: client || null,
      error: error || null
    });
  }

  function resolveConfig(options) {
    if (hasOwn(options, 'config')) return { present: true, value: options.config };
    if (hasOwn(window, CONFIG_GLOBAL)) return { present: true, value: window[CONFIG_GLOBAL] };
    return { present: false, value: null };
  }

  function validateConfig(config) {
    if (!config || typeof config !== 'object' || Array.isArray(config)) {
      return frozenError('RUNTIME_REMOTE_PUBLICATION_CONFIG_INVALID', 'Runtime remote publication configuration must be an object.', null);
    }

    if (hasOwn(config, 'writeToken') || hasOwn(config, 'writeTokenProvider')) {
      return frozenError(
        'RUNTIME_REMOTE_PUBLICATION_SECRET_NOT_ALLOWED',
        'Runtime remote publication configuration is read-only and must not contain teacher authorization.',
        null
      );
    }

    var keys = Object.keys(config);
    var unknown = keys.filter(function(key){ return ALLOWED_CONFIG_KEYS.indexOf(key) < 0; });
    if (unknown.length) {
      return frozenError(
        'RUNTIME_REMOTE_PUBLICATION_CONFIG_INVALID',
        'Runtime remote publication configuration contains unsupported keys.',
        { keys: unknown.slice().sort().join(',') }
      );
    }

    if (!text(config.endpoint)) {
      return frozenError('RUNTIME_REMOTE_PUBLICATION_ENDPOINT_REQUIRED', 'Runtime remote publication endpoint is required.', null);
    }

    if (hasOwn(config, 'timeoutMs')) {
      var timeoutMs = Number(config.timeoutMs);
      if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
        return frozenError('RUNTIME_REMOTE_PUBLICATION_CONFIG_INVALID', 'timeoutMs must be a positive finite number.', null);
      }
    }

    return null;
  }

  function validReaders(value) {
    return Boolean(value &&
      typeof value.activeReferenceReader === 'function' &&
      typeof value.publicationReader === 'function');
  }

  function createReaderSelection(options) {
    var opts = options && typeof options === 'object' ? options : {};
    var configState = resolveConfig(opts);

    if (!configState.present) return selection(false, null, null, null);

    var configError = validateConfig(configState.value);
    if (configError) return selection(true, null, null, configError);

    var campaignId = text(opts.campaignId);
    var publicationId = text(opts.publicationId);
    if (!campaignId || !publicationId) {
      return selection(
        true,
        null,
        null,
        frozenError(
          'RUNTIME_REMOTE_PUBLICATION_IDENTITY_INVALID',
          'campaignId and publicationId are required for remote Runtime publication reads.',
          null
        )
      );
    }

    var contract = opts.contract || window.CRIOS_REMOTE_PUBLICATION_CONTRACT || null;
    var clientFactory = opts.clientFactory || window.CRIOS_REMOTE_PUBLICATION_CLIENT || null;
    var readersFactory = opts.readersFactory || window.CRIOS_RUNTIME_REMOTE_PUBLICATION_READERS || null;

    if (!contract ||
        !clientFactory || typeof clientFactory.createClient !== 'function' ||
        !readersFactory || typeof readersFactory.createRemotePublicationReaders !== 'function') {
      return selection(
        true,
        null,
        null,
        frozenError(
          'RUNTIME_REMOTE_PUBLICATION_MODULE_UNAVAILABLE',
          'Runtime remote publication modules are not available.',
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
    } catch (clientError) {
      return selection(
        true,
        null,
        null,
        frozenError(
          'RUNTIME_REMOTE_PUBLICATION_CLIENT_CREATE_FAILED',
          String(clientError && clientError.message || clientError || 'Runtime remote publication client creation failed.'),
          null
        )
      );
    }

    var readers;
    try {
      readers = readersFactory.createRemotePublicationReaders({
        remoteClient: client,
        campaignId: campaignId,
        publicationId: publicationId
      });
    } catch (readersError) {
      return selection(
        true,
        null,
        client,
        frozenError(
          'RUNTIME_REMOTE_PUBLICATION_READERS_CREATE_FAILED',
          String(readersError && readersError.message || readersError || 'Runtime remote publication readers creation failed.'),
          null
        )
      );
    }

    if (!validReaders(readers)) {
      return selection(
        true,
        null,
        client,
        frozenError(
          'RUNTIME_REMOTE_PUBLICATION_READERS_INVALID',
          'Runtime remote publication readers do not expose the required interface.',
          null
        )
      );
    }

    return selection(true, readers, client, null);
  }

  window.CRIOS_RUNTIME_REMOTE_PUBLICATION_BOOTSTRAP = Object.freeze({
    version: VERSION,
    configGlobal: CONFIG_GLOBAL,
    createReaderSelection: createReaderSelection
  });
})();
