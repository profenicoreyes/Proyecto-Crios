/* CRIOS Publication Persistence - single-key storage adapter */
(function(){
  'use strict';

  var root = window.CRIOS_PUBLICATION_PERSISTENCE_INTERNAL;
  var internals = root && root.internals;
  if (!internals || typeof internals.validateDocument !== 'function') throw new Error('Persistence model must load before storage adapter.');
  var C = internals.constants;
  var E = C.errorCodes;
  var S = C.status;

  function createStorageAdapter(options) {
    var opts = options && typeof options === 'object' ? options : {};
    var storage = Object.prototype.hasOwnProperty.call(opts, 'storage') ? opts.storage : window.localStorage;
    var key = typeof opts.key === 'string' && opts.key ? opts.key : C.STORAGE_KEY;
    var schemaVersion = Number.isInteger(opts.schemaVersion) ? opts.schemaVersion : C.SCHEMA_VERSION;
    var maxBytes = Number.isInteger(opts.maxBytes) && opts.maxBytes >= 0 ? opts.maxBytes : C.MAX_BYTES;
    var clock = typeof opts.clock === 'function' ? opts.clock : function(){ return new Date().toISOString(); };
    var lastStatus = S.EMPTY;
    var lastError = null;

    function ensureStorage() {
      if (!storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function' || typeof storage.removeItem !== 'function') {
        throw internals.createError(E.PERSISTENCE_UNAVAILABLE, 'Configured storage is unavailable.');
      }
    }
    function rawRead() {
      ensureStorage();
      try { return storage.getItem(key); }
      catch (error) { throw internals.createError(E.PERSISTENCE_READ_FAILED, 'Failed to read persistence storage.', { message: String(error && error.message || error) }); }
    }
    function parse(raw) {
      var documentValue;
      try { documentValue = JSON.parse(raw); }
      catch (error) { throw internals.createError(E.PERSISTENCE_CORRUPTED, 'Persisted JSON is corrupted.'); }
      try { internals.validateDocument(documentValue, schemaVersion); }
      catch (errorValidation) {
        if (errorValidation.code === E.PERSISTENCE_SCHEMA_UNSUPPORTED) throw errorValidation;
        throw internals.createError(E.PERSISTENCE_CORRUPTED, 'Persisted document is inconsistent.', { cause: errorValidation.code });
      }
      return documentValue;
    }
    function read() {
      try {
        var raw = rawRead();
        if (raw === null) { lastStatus = S.EMPTY; lastError = null; return internals.emptyDocument(schemaVersion); }
        var documentValue = parse(raw);
        lastStatus = S.READY; lastError = null;
        return internals.frozenCopy(documentValue);
      } catch (error) {
        lastError = internals.errorPayload(error);
        lastStatus = error.code === E.PERSISTENCE_SCHEMA_UNSUPPORTED ? S.UNSUPPORTED_SCHEMA :
          error.code === E.PERSISTENCE_CORRUPTED ? S.CORRUPTED : S.UNAVAILABLE;
        throw error;
      }
    }
    function transact(mutator) {
      if (typeof mutator !== 'function') throw internals.createError(E.PERSISTENCE_INCONSISTENT, 'Transaction mutator is required.');
      var current = read();
      var observedRevision = current.stateRevision;
      var working = internals.deepClone(current);
      var mutated = mutator(working);
      var candidate = mutated === undefined ? working : mutated;
      internals.validateDocument(candidate, schemaVersion);
      var confirmRaw = rawRead();
      var confirmRevision = confirmRaw === null ? 0 : parse(confirmRaw).stateRevision;
      if (confirmRevision !== observedRevision) throw internals.createError(E.PERSISTENCE_CONFLICT, 'Persistence revision changed during transaction.');
      candidate.stateRevision = observedRevision + 1;
      candidate.updatedAt = String(clock());
      internals.validateDocument(candidate, schemaVersion);
      var serialized = internals.serialize(candidate);
      var bytes = internals.calculateSerializedSize(candidate);
      if (bytes > maxBytes) throw internals.createError(E.PERSISTENCE_SIZE_EXCEEDED, 'Persistence document exceeds maximum size.', { bytes: bytes, maxBytes: maxBytes });
      try { storage.setItem(key, serialized); }
      catch (writeError) {
        var quota = writeError && (writeError.name === 'QuotaExceededError' || writeError.code === 22 || writeError.code === 1014);
        throw internals.createError(quota ? E.PERSISTENCE_QUOTA_EXCEEDED : E.PERSISTENCE_WRITE_FAILED, 'Failed to write persistence storage.');
      }
      var verifiedRaw = rawRead();
      if (verifiedRaw === null) throw internals.createError(E.PERSISTENCE_VERIFICATION_FAILED, 'Persisted document disappeared after write.');
      var verified;
      try { verified = parse(verifiedRaw); }
      catch (verifyError) { throw internals.createError(E.PERSISTENCE_VERIFICATION_FAILED, 'Persisted document failed verification.'); }
      if (verified.stateRevision !== candidate.stateRevision || internals.serialize(verified) !== serialized) {
        throw internals.createError(E.PERSISTENCE_VERIFICATION_FAILED, 'Persisted document differs from transaction result.');
      }
      lastStatus = S.READY; lastError = null;
      return internals.frozenCopy(verified);
    }
    function clear() {
      try { ensureStorage(); storage.removeItem(key); lastStatus = S.EMPTY; lastError = null; return internals.deepFreeze({ success: true, error: null }); }
      catch (error) {
        var wrapped = internals.createError(E.PERSISTENCE_CLEAR_FAILED, 'Failed to clear persistence storage.');
        lastError = internals.errorPayload(wrapped); lastStatus = S.UNAVAILABLE;
        return internals.deepFreeze({ success: false, error: lastError });
      }
    }
    function exportDocument() { return internals.frozenCopy(read()); }
    function getStatus() {
      var documentValue = null;
      try { documentValue = read(); } catch (ignore) {}
      return internals.deepFreeze({
        status: lastStatus, storageKey: key, schemaVersion: schemaVersion,
        stateRevision: documentValue ? documentValue.stateRevision : 0,
        updatedAt: documentValue ? documentValue.updatedAt : null,
        serializedBytes: documentValue ? internals.calculateSerializedSize(documentValue) : 0,
        error: lastError
      });
    }
    return Object.freeze({ read: read, transact: transact, clear: clear, exportDocument: exportDocument, getStatus: getStatus });
  }

  internals.createStorageAdapter = createStorageAdapter;
})();