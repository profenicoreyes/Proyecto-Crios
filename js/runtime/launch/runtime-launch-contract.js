/* CRIOS Runtime — pure launch request contract */
(function(){
  'use strict';

  var VERSION = '1.1.0';
  var MODES = Object.freeze({
    LEGACY: 'legacy',
    PUBLISHED: 'published'
  });
  var PARAMETERS = Object.freeze({
    SOURCE: 'source',
    CAMPAIGN_ID: 'campaignId',
    PUBLICATION_ID: 'publicationId'
  });
  var ERROR_CODES = Object.freeze({
    MALFORMED_QUERY: 'MALFORMED_QUERY',
    DUPLICATE_PARAMETER: 'DUPLICATE_PARAMETER',
    SOURCE_REQUIRED: 'SOURCE_REQUIRED',
    INVALID_SOURCE: 'INVALID_SOURCE',
    UNSUPPORTED_SOURCE: 'UNSUPPORTED_SOURCE',
    CAMPAIGN_ID_REQUIRED: 'CAMPAIGN_ID_REQUIRED',
    CAMPAIGN_ID_NOT_ALLOWED: 'CAMPAIGN_ID_NOT_ALLOWED',
    INVALID_CAMPAIGN_ID: 'INVALID_CAMPAIGN_ID',
    PUBLICATION_ID_REQUIRED: 'PUBLICATION_ID_REQUIRED',
    PUBLICATION_ID_NOT_ALLOWED: 'PUBLICATION_ID_NOT_ALLOWED',
    INVALID_PUBLICATION_ID: 'INVALID_PUBLICATION_ID'
  });
  var CONSTANTS = Object.freeze({
    modes: MODES,
    parameters: PARAMETERS,
    errorCodes: ERROR_CODES,
    maxCampaignIdLength: 160,
    maxPublicationIdLength: 200
  });
  var RESOLUTION_KEYS = ['success', 'request', 'error'];
  var REQUEST_KEYS = ['explicit', 'sourceMode', 'campaignId', 'publicationId'];
  var ERROR_KEYS = ['code', 'message', 'parameter'];

  function isPlainObject(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    var prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }

  function exactKeys(value, expected) {
    if (!isPlainObject(value)) return false;
    var actual = Object.keys(value).sort();
    var sorted = expected.slice().sort();
    if (actual.length !== sorted.length) return false;
    for (var index = 0; index < actual.length; index += 1) {
      if (actual[index] !== sorted[index]) return false;
    }
    return true;
  }

  function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.keys(value).forEach(function(key){ deepFreeze(value[key]); });
    return Object.freeze(value);
  }

  function createRequest(explicit, sourceMode, campaignId, publicationId) {
    return deepFreeze({
      explicit: Boolean(explicit),
      sourceMode: sourceMode == null ? null : String(sourceMode),
      campaignId: campaignId == null ? null : String(campaignId),
      publicationId: publicationId == null ? null : String(publicationId)
    });
  }

  function createError(code, message, parameter) {
    return deepFreeze({
      code: String(code),
      message: String(message || code),
      parameter: parameter == null ? null : String(parameter)
    });
  }

  function createResolution(success, request, error) {
    return deepFreeze({
      success: Boolean(success),
      request: request == null ? null : request,
      error: error == null ? null : error
    });
  }

  function failure(code, message, parameter) {
    return createResolution(false, null, createError(code, message, parameter));
  }

  function decodeComponent(value) {
    return decodeURIComponent(String(value).replace(/\+/g, ' '));
  }

  function parseKnownParameters(search) {
    var raw = search == null ? '' : String(search).trim();
    if (raw === '' || raw === '?') return { success: true, values: Object.create(null), counts: Object.create(null) };
    if (raw.charAt(0) === '?') raw = raw.slice(1);
    if (raw.indexOf('#') >= 0) {
      return { success: false, error: failure(ERROR_CODES.MALFORMED_QUERY, 'Launch query must not contain a fragment.', null) };
    }

    var values = Object.create(null);
    var counts = Object.create(null);
    var pairs = raw.split('&');

    try {
      for (var index = 0; index < pairs.length; index += 1) {
        if (pairs[index] === '') continue;
        var separator = pairs[index].indexOf('=');
        var rawKey = separator >= 0 ? pairs[index].slice(0, separator) : pairs[index];
        var rawValue = separator >= 0 ? pairs[index].slice(separator + 1) : '';
        var key = decodeComponent(rawKey);
        if (key !== PARAMETERS.SOURCE && key !== PARAMETERS.CAMPAIGN_ID && key !== PARAMETERS.PUBLICATION_ID) continue;
        counts[key] = (counts[key] || 0) + 1;
        if (counts[key] > 1) {
          return { success: false, error: failure(ERROR_CODES.DUPLICATE_PARAMETER, 'Launch parameter must appear only once.', key) };
        }
        values[key] = decodeComponent(rawValue);
      }
    } catch (error) {
      return { success: false, error: failure(ERROR_CODES.MALFORMED_QUERY, 'Launch query contains invalid percent encoding.', null) };
    }

    return { success: true, values: values, counts: counts };
  }

  function normalizeIdentifier(value, maxLength) {
    if (typeof value !== 'string') return null;
    var normalized = value.trim();
    if (!normalized) return null;
    if (normalized.length > maxLength) return null;
    if (/[\u0000-\u001F\u007F]/.test(normalized)) return null;
    return normalized;
  }

  function normalizeCampaignId(value) {
    return normalizeIdentifier(value, CONSTANTS.maxCampaignIdLength);
  }

  function normalizePublicationId(value) {
    return normalizeIdentifier(value, CONSTANTS.maxPublicationIdLength);
  }

  function resolveLaunchRequest(search) {
    var parsed = parseKnownParameters(search);
    if (!parsed.success) return parsed.error;

    var hasSource = Boolean(parsed.counts[PARAMETERS.SOURCE]);
    var hasCampaignId = Boolean(parsed.counts[PARAMETERS.CAMPAIGN_ID]);
    var hasPublicationId = Boolean(parsed.counts[PARAMETERS.PUBLICATION_ID]);

    if (!hasSource && !hasCampaignId && !hasPublicationId) {
      return createResolution(true, createRequest(false, null, null, null), null);
    }
    if (!hasSource && (hasCampaignId || hasPublicationId)) {
      return failure(ERROR_CODES.SOURCE_REQUIRED, 'source is required when a published launch identifier is present.', PARAMETERS.SOURCE);
    }

    var sourceMode = String(parsed.values[PARAMETERS.SOURCE] || '').trim();
    if (!sourceMode) {
      return failure(ERROR_CODES.INVALID_SOURCE, 'source must not be empty.', PARAMETERS.SOURCE);
    }
    if (sourceMode !== MODES.LEGACY && sourceMode !== MODES.PUBLISHED) {
      return failure(ERROR_CODES.UNSUPPORTED_SOURCE, 'source must be legacy or published.', PARAMETERS.SOURCE);
    }

    if (sourceMode === MODES.LEGACY) {
      if (hasCampaignId) {
        return failure(ERROR_CODES.CAMPAIGN_ID_NOT_ALLOWED, 'campaignId is not allowed for legacy launches.', PARAMETERS.CAMPAIGN_ID);
      }
      if (hasPublicationId) {
        return failure(ERROR_CODES.PUBLICATION_ID_NOT_ALLOWED, 'publicationId is not allowed for legacy launches.', PARAMETERS.PUBLICATION_ID);
      }
      return createResolution(true, createRequest(true, MODES.LEGACY, null, null), null);
    }

    if (!hasCampaignId) {
      return failure(ERROR_CODES.CAMPAIGN_ID_REQUIRED, 'campaignId is required for published launches.', PARAMETERS.CAMPAIGN_ID);
    }
    var campaignId = normalizeCampaignId(parsed.values[PARAMETERS.CAMPAIGN_ID]);
    if (!campaignId) {
      return failure(ERROR_CODES.INVALID_CAMPAIGN_ID, 'campaignId is invalid.', PARAMETERS.CAMPAIGN_ID);
    }

    if (!hasPublicationId) {
      return failure(ERROR_CODES.PUBLICATION_ID_REQUIRED, 'publicationId is required for published launches.', PARAMETERS.PUBLICATION_ID);
    }
    var publicationId = normalizePublicationId(parsed.values[PARAMETERS.PUBLICATION_ID]);
    if (!publicationId) {
      return failure(ERROR_CODES.INVALID_PUBLICATION_ID, 'publicationId is invalid.', PARAMETERS.PUBLICATION_ID);
    }

    return createResolution(true, createRequest(true, MODES.PUBLISHED, campaignId, publicationId), null);
  }

  function invalidCampaignIdError() {
    var error = new Error('campaignId is invalid.');
    error.code = ERROR_CODES.INVALID_CAMPAIGN_ID;
    error.parameter = PARAMETERS.CAMPAIGN_ID;
    return error;
  }

  function invalidPublicationIdError() {
    var error = new Error('publicationId is invalid.');
    error.code = ERROR_CODES.INVALID_PUBLICATION_ID;
    error.parameter = PARAMETERS.PUBLICATION_ID;
    return error;
  }

  function buildPublishedLaunchSearch(campaignId, publicationId) {
    var normalizedCampaign = normalizeCampaignId(campaignId);
    if (!normalizedCampaign) throw invalidCampaignIdError();
    var normalizedPublication = normalizePublicationId(publicationId);
    if (!normalizedPublication) throw invalidPublicationIdError();
    return '?' + PARAMETERS.SOURCE + '=' + MODES.PUBLISHED +
      '&' + PARAMETERS.CAMPAIGN_ID + '=' + encodeURIComponent(normalizedCampaign) +
      '&' + PARAMETERS.PUBLICATION_ID + '=' + encodeURIComponent(normalizedPublication);
  }

  function buildLegacyLaunchSearch() {
    return '?' + PARAMETERS.SOURCE + '=' + MODES.LEGACY;
  }

  function isLaunchResolution(value) {
    if (!exactKeys(value, RESOLUTION_KEYS) || typeof value.success !== 'boolean') return false;
    if (!Object.isFrozen(value)) return false;
    if (value.success) {
      if (value.error !== null || !exactKeys(value.request, REQUEST_KEYS) || !Object.isFrozen(value.request)) return false;
      if (typeof value.request.explicit !== 'boolean') return false;
      if (value.request.sourceMode !== null && value.request.sourceMode !== MODES.LEGACY && value.request.sourceMode !== MODES.PUBLISHED) return false;
      if (value.request.sourceMode === MODES.PUBLISHED) {
        if (normalizeCampaignId(value.request.campaignId) !== value.request.campaignId) return false;
        if (normalizePublicationId(value.request.publicationId) !== value.request.publicationId) return false;
      } else if (value.request.campaignId !== null || value.request.publicationId !== null) {
        return false;
      }
      if (!value.request.explicit && (value.request.sourceMode !== null || value.request.campaignId !== null || value.request.publicationId !== null)) return false;
      if (value.request.explicit && value.request.sourceMode === null) return false;
      return true;
    }
    return value.request === null && exactKeys(value.error, ERROR_KEYS) && Object.isFrozen(value.error) &&
      typeof value.error.code === 'string' && typeof value.error.message === 'string' &&
      (value.error.parameter === null || typeof value.error.parameter === 'string');
  }

  window.CRIOS_RUNTIME_LAUNCH = Object.freeze({
    version: VERSION,
    constants: CONSTANTS,
    resolveLaunchRequest: resolveLaunchRequest,
    buildPublishedLaunchSearch: buildPublishedLaunchSearch,
    buildLegacyLaunchSearch: buildLegacyLaunchSearch,
    isLaunchResolution: isLaunchResolution
  });
})();
