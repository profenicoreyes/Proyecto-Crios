/* CRIOS Publication Core — SHA-256 hash */
(function(){
  'use strict';

  var core = window.CRIOS_PUBLICATION_CORE || {};
  var internals = core.__internals;
  if (!internals || typeof internals.buildCanonicalContent !== 'function') {
    throw new Error('CRIOS Publication Core: canonicalizer must be loaded before hash module.');
  }

  var ERROR_CODES = internals.constants.errorCodes;

  function defaultDigest(data) {
    if (!window.crypto || !window.crypto.subtle || typeof window.crypto.subtle.digest !== 'function') {
      throw internals.createCoreError(ERROR_CODES.HASH_FAILED, 'SHA-256 is not available in this environment.');
    }
    return window.crypto.subtle.digest('SHA-256', data);
  }

  function toHex(buffer) {
    var bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    var hex = '';
    for (var i = 0; i < bytes.length; i += 1) {
      var h = bytes[i].toString(16);
      hex += h.length === 1 ? '0' + h : h;
    }
    return hex;
  }

  async function calculateContentHash(canonicalContent, options) {
    if (typeof canonicalContent !== 'string') {
      throw internals.createCoreError(ERROR_CODES.HASH_FAILED, 'canonicalContent must be a string.');
    }

    var digest = options && typeof options.digest === 'function' ? options.digest : defaultDigest;
    var encoder = new TextEncoder();
    var payload = encoder.encode(canonicalContent);

    var result;
    try {
      result = await digest(payload);
    } catch (error) {
      throw internals.createCoreError(ERROR_CODES.HASH_FAILED, 'Failed to compute SHA-256 digest.', { message: String(error && error.message || error) });
    }

    var hex = toHex(result).toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(hex)) {
      throw internals.createCoreError(ERROR_CODES.HASH_FAILED, 'Invalid SHA-256 digest output format.');
    }

    return hex;
  }

  internals.calculateContentHash = calculateContentHash;
  window.CRIOS_PUBLICATION_CORE = core;
})();
