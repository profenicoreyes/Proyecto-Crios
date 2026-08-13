/* CRIOS Publication Remote - deployment configuration bridge */
(function(){
  'use strict';

  var VERSION = '1.0.0';

  function text(value) {
    return value == null ? '' : String(value).trim();
  }

  function timeout(value) {
    var number = Number(value);
    return Number.isFinite(number) && number > 0 ? Math.floor(number) : 15000;
  }

  function getConfig() {
    return typeof CRIOS_CONFIG !== 'undefined' && CRIOS_CONFIG && typeof CRIOS_CONFIG === 'object'
      ? CRIOS_CONFIG
      : null;
  }

  function configure() {
    var config = getConfig();
    var endpoint = config ? text(config.publicationEndpoint) : '';
    if (!endpoint) {
      return Object.freeze({ configured: false, endpoint: '' });
    }

    var timeoutMs = timeout(config.publicationTimeoutMs);

    window.CRIOS_RUNTIME_REMOTE_PUBLICATION_CONFIG = Object.freeze({
      endpoint: endpoint,
      timeoutMs: timeoutMs
    });

    window.CRIOS_STUDIO_REMOTE_PUBLICATION_CONFIG = Object.freeze({
      endpoint: endpoint,
      timeoutMs: timeoutMs
    });

    return Object.freeze({ configured: true, endpoint: endpoint });
  }

  window.CRIOS_REMOTE_PUBLICATION_DEPLOYMENT_CONFIG = Object.freeze({
    version: VERSION,
    configure: configure
  });

  configure();
})();
