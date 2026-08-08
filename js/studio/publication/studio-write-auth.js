/* CRIOS Studio - ephemeral teacher write authorization */
(function(){
  'use strict';

  var VERSION = '1.0.0';
  var MIN_TOKEN_LENGTH = 32;
  var MAX_TOKEN_LENGTH = 256;

  function normalizeToken(value) {
    if (typeof value !== 'string') return '';
    if (/[\u0000-\u001F\u007F]/.test(value)) return '';
    var token = value.trim();
    if (token.length < MIN_TOKEN_LENGTH || token.length > MAX_TOKEN_LENGTH) return '';
    return token;
  }

  function createPromptProvider(options) {
    var opts = options && typeof options === 'object' ? options : {};
    var promptImpl = typeof opts.promptImpl === 'function'
      ? opts.promptImpl
      : (typeof window.prompt === 'function' ? window.prompt.bind(window) : null);
    var message = typeof opts.message === 'string' && opts.message.trim()
      ? opts.message.trim()
      : 'Clave docente para publicar. No se guarda en este dispositivo.';

    return function provideWriteToken() {
      if (!promptImpl) return '';
      return normalizeToken(promptImpl(message));
    };
  }

  window.CRIOS_STUDIO_WRITE_AUTH = Object.freeze({
    version: VERSION,
    createPromptProvider: createPromptProvider
  });
})();
