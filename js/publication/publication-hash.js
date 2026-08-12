/* CRIOS Publication Core — SHA-256 hash */
(function(){
  'use strict';

  var core = window.CRIOS_PUBLICATION_CORE || {};
  var internals = core.__internals;
  if (!internals || typeof internals.buildCanonicalContent !== 'function') {
    throw new Error('CRIOS Publication Core: canonicalizer must be loaded before hash module.');
  }

  var ERROR_CODES = internals.constants.errorCodes;
  var SHA256_INITIAL = Object.freeze([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
  ]);
  var SHA256_K = Object.freeze([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ]);

  function rotateRight(value, count) {
    return (value >>> count) | (value << (32 - count));
  }

  function fallbackDigest(data) {
    var bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
    var messageLength = bytes.length;
    var bitLength = messageLength * 8;
    var paddingLength = (64 - ((messageLength + 1 + 8) % 64)) % 64;
    var message = new Uint8Array(messageLength + 1 + paddingLength + 8);
    message.set(bytes, 0);
    message[messageLength] = 0x80;

    var highBits = Math.floor(bitLength / 0x100000000);
    var lowBits = bitLength >>> 0;
    var lengthOffset = message.length - 8;
    message[lengthOffset] = (highBits >>> 24) & 0xff;
    message[lengthOffset + 1] = (highBits >>> 16) & 0xff;
    message[lengthOffset + 2] = (highBits >>> 8) & 0xff;
    message[lengthOffset + 3] = highBits & 0xff;
    message[lengthOffset + 4] = (lowBits >>> 24) & 0xff;
    message[lengthOffset + 5] = (lowBits >>> 16) & 0xff;
    message[lengthOffset + 6] = (lowBits >>> 8) & 0xff;
    message[lengthOffset + 7] = lowBits & 0xff;

    var hash = SHA256_INITIAL.slice();
    var words = new Uint32Array(64);

    for (var offset = 0; offset < message.length; offset += 64) {
      var i;
      for (i = 0; i < 16; i += 1) {
        var wordOffset = offset + (i * 4);
        words[i] = ((message[wordOffset] << 24) | (message[wordOffset + 1] << 16) | (message[wordOffset + 2] << 8) | message[wordOffset + 3]) >>> 0;
      }
      for (i = 16; i < 64; i += 1) {
        var x = words[i - 15];
        var y = words[i - 2];
        var sigma0 = (rotateRight(x, 7) ^ rotateRight(x, 18) ^ (x >>> 3)) >>> 0;
        var sigma1 = (rotateRight(y, 17) ^ rotateRight(y, 19) ^ (y >>> 10)) >>> 0;
        words[i] = (words[i - 16] + sigma0 + words[i - 7] + sigma1) >>> 0;
      }

      var a = hash[0], b = hash[1], c = hash[2], d = hash[3];
      var e = hash[4], f = hash[5], g = hash[6], h = hash[7];
      for (i = 0; i < 64; i += 1) {
        var bigSigma1 = (rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25)) >>> 0;
        var choice = ((e & f) ^ ((~e) & g)) >>> 0;
        var temp1 = (h + bigSigma1 + choice + SHA256_K[i] + words[i]) >>> 0;
        var bigSigma0 = (rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22)) >>> 0;
        var majority = ((a & b) ^ (a & c) ^ (b & c)) >>> 0;
        var temp2 = (bigSigma0 + majority) >>> 0;
        h = g; g = f; f = e; e = (d + temp1) >>> 0; d = c; c = b; b = a; a = (temp1 + temp2) >>> 0;
      }
      hash[0] = (hash[0] + a) >>> 0;
      hash[1] = (hash[1] + b) >>> 0;
      hash[2] = (hash[2] + c) >>> 0;
      hash[3] = (hash[3] + d) >>> 0;
      hash[4] = (hash[4] + e) >>> 0;
      hash[5] = (hash[5] + f) >>> 0;
      hash[6] = (hash[6] + g) >>> 0;
      hash[7] = (hash[7] + h) >>> 0;
    }

    var output = new Uint8Array(32);
    for (var j = 0; j < hash.length; j += 1) {
      var value = hash[j];
      var outOffset = j * 4;
      output[outOffset] = (value >>> 24) & 0xff;
      output[outOffset + 1] = (value >>> 16) & 0xff;
      output[outOffset + 2] = (value >>> 8) & 0xff;
      output[outOffset + 3] = value & 0xff;
    }
    return output;
  }

  function defaultDigest(data) {
    if (window.crypto && window.crypto.subtle && typeof window.crypto.subtle.digest === 'function') {
      return window.crypto.subtle.digest('SHA-256', data);
    }
    return fallbackDigest(data);
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
