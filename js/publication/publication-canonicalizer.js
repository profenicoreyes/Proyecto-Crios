/* CRIOS Publication Core — canonical content */
(function(){
  'use strict';

  var core = window.CRIOS_PUBLICATION_CORE || {};
  var internals = core.__internals;
  if (!internals || typeof internals.buildPublicationCandidate !== 'function') {
    throw new Error('CRIOS Publication Core: validator must be loaded before canonicalizer.');
  }

  var ERROR_CODES = internals.constants.errorCodes;

  function sortObjectRecursively(value, seen, path) {
    var type = typeof value;

    if (value === null) return null;
    if (type === 'string' || type === 'boolean') return value;
    if (type === 'number') {
      if (!Number.isFinite(value)) {
        throw internals.createCoreError(ERROR_CODES.CANONICALIZATION_FAILED, 'Non-finite number at ' + path + '.');
      }
      return value;
    }

    if (type === 'undefined' || type === 'function' || type === 'symbol' || type === 'bigint') {
      throw internals.createCoreError(ERROR_CODES.CANONICALIZATION_FAILED, 'Unsupported value at ' + path + '.');
    }

    if (value && (typeof value.then === 'function' || typeof value.nodeType === 'number')) {
      throw internals.createCoreError(ERROR_CODES.CANONICALIZATION_FAILED, 'Unsupported object type at ' + path + '.');
    }

    if (seen.has(value)) {
      throw internals.createCoreError(ERROR_CODES.CANONICALIZATION_FAILED, 'Circular reference at ' + path + '.');
    }
    seen.add(value);

    if (Array.isArray(value)) {
      var outArray = new Array(value.length);
      for (var i = 0; i < value.length; i += 1) {
        outArray[i] = sortObjectRecursively(value[i], seen, path + '[' + i + ']');
      }
      seen.delete(value);
      return outArray;
    }

    if (!internals.isPlainObject(value)) {
      throw internals.createCoreError(ERROR_CODES.CANONICALIZATION_FAILED, 'Only plain objects are allowed at ' + path + '.');
    }

    var out = {};
    var keys = Object.keys(value).sort();
    for (var j = 0; j < keys.length; j += 1) {
      var key = keys[j];
      var child = value[key];
      if (typeof child === 'undefined') {
        throw internals.createCoreError(ERROR_CODES.CANONICALIZATION_FAILED, 'Undefined value at ' + path + '.' + key + '.');
      }
      out[key] = sortObjectRecursively(child, seen, path + '.' + key);
    }

    seen.delete(value);
    return out;
  }

  function buildCanonicalContent(candidate) {
    if (!candidate || typeof candidate !== 'object') {
      throw internals.createCoreError(ERROR_CODES.CANONICALIZATION_FAILED, 'Candidate is required.');
    }

    var source = {
      schemaVersion: candidate.schemaVersion,
      content: candidate.content
    };

    var sorted = sortObjectRecursively(source, new Set(), '$');

    try {
      return JSON.stringify(sorted);
    } catch (error) {
      throw internals.createCoreError(ERROR_CODES.SERIALIZATION_FAILED, 'Failed to serialize canonical content.', { message: String(error && error.message || error) });
    }
  }

  internals.buildCanonicalContent = buildCanonicalContent;
  window.CRIOS_PUBLICATION_CORE = core;
})();
