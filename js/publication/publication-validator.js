/* CRIOS Publication Core — validation and candidate */
(function(){
  'use strict';

  var core = window.CRIOS_PUBLICATION_CORE || {};
  var internals = core.__internals;
  if (!internals || typeof internals.normalizeDraft !== 'function') {
    throw new Error('CRIOS Publication Core: normalizer must be loaded before validator.');
  }

  var CONSTANTS = internals.constants;
  var ERROR_CODES = CONSTANTS.errorCodes;
  var SEVERITY = CONSTANTS.severity;

  var SUPPORTED_SCHEMA_VERSIONS = Object.freeze({
    '2.0': true,
    '1.0.0': true
  });

  function createIssue(code, severity, level, path, message, metadata) {
    return internals.createValidationIssueModel({
      code: code,
      severity: severity,
      level: level,
      path: path,
      message: message,
      metadata: metadata || null
    });
  }

  function collectMissionIds(content) {
    var ids = [];
    if (!content || !Array.isArray(content.misiones)) return ids;
    for (var i = 0; i < content.misiones.length; i += 1) {
      var item = content.misiones[i];
      if (item && typeof item === 'object' && item.id != null && String(item.id).trim() !== '') {
        ids.push(String(item.id).trim());
      } else if ((typeof item === 'string' || typeof item === 'number') && String(item).trim() !== '') {
        ids.push(String(item).trim());
      }
    }
    return ids;
  }

  function validateStructural(normalized) {
    var issues = [];

    if (!internals.isPlainObject(normalized)) {
      issues.push(createIssue(ERROR_CODES.INVALID_DRAFT, SEVERITY.ERROR, 'structural', '$', 'Normalized draft must be a plain object.'));
      return issues;
    }

    if (typeof normalized.campaignId !== 'string' || normalized.campaignId.trim() === '') {
      issues.push(createIssue(ERROR_CODES.CAMPAIGN_ID_MISSING, SEVERITY.ERROR, 'structural', '$.campaignId', 'campaignId is required.'));
    }

    if (typeof normalized.draftRevision !== 'string' || normalized.draftRevision.trim() === '') {
      issues.push(createIssue(ERROR_CODES.INVALID_DRAFT, SEVERITY.ERROR, 'structural', '$.draftRevision', 'draftRevision is required.'));
    }

    if (typeof normalized.schemaVersion !== 'string' || normalized.schemaVersion.trim() === '') {
      issues.push(createIssue(ERROR_CODES.SCHEMA_VERSION_UNSUPPORTED, SEVERITY.ERROR, 'structural', '$.schemaVersion', 'schemaVersion is required.'));
    } else if (!SUPPORTED_SCHEMA_VERSIONS[normalized.schemaVersion]) {
      issues.push(createIssue(ERROR_CODES.SCHEMA_VERSION_UNSUPPORTED, SEVERITY.ERROR, 'structural', '$.schemaVersion', 'schemaVersion is not supported.'));
    }

    if (!internals.isPlainObject(normalized.content)) {
      issues.push(createIssue(ERROR_CODES.INVALID_DRAFT, SEVERITY.ERROR, 'structural', '$.content', 'content must be a plain object.'));
      return issues;
    }

    if (!Array.isArray(normalized.content.misiones)) {
      issues.push(createIssue(ERROR_CODES.INVALID_DRAFT, SEVERITY.ERROR, 'structural', '$.content.misiones', 'misiones must be an array.'));
      return issues;
    }

    for (var i = 0; i < normalized.content.misiones.length; i += 1) {
      var item = normalized.content.misiones[i];
      if (!item || typeof item !== 'object') {
        issues.push(createIssue(ERROR_CODES.INVALID_DRAFT, SEVERITY.ERROR, 'structural', '$.content.misiones[' + i + ']', 'each mission must be an object.'));
        continue;
      }
      if (item.id == null || String(item.id).trim() === '') {
        issues.push(createIssue(ERROR_CODES.INVALID_DRAFT, SEVERITY.ERROR, 'structural', '$.content.misiones[' + i + '].id', 'mission id is required.'));
      }
    }

    return issues;
  }

  function collectEmbeddedMissionSpecIds(content) {
    var ids = {};
    var specs = content && Array.isArray(content.missionSpecs) ? content.missionSpecs : null;
    var manifest = content && content.runtimeExecutionManifest;
    var order = manifest && Array.isArray(manifest.missionOrder) ? manifest.missionOrder : null;

    if (!specs || !order || specs.length !== order.length) return ids;

    for (var i = 0; i < specs.length; i += 1) {
      var spec = specs[i];
      var specId = spec && spec.missionId != null ? String(spec.missionId).trim() : '';
      var orderId = order[i] != null ? String(order[i]).trim() : '';
      if (!specId || specId !== orderId) return {};
      ids[specId] = true;
    }

    return ids;
  }

  function validateReferential(normalized) {
    var issues = [];
    var ids = collectMissionIds(normalized.content);
    var embeddedMissionSpecIds = collectEmbeddedMissionSpecIds(normalized.content);
    var seen = {};

    for (var i = 0; i < ids.length; i += 1) {
      var id = ids[i];
      if (seen[id]) {
        issues.push(createIssue(ERROR_CODES.DUPLICATE_ID, SEVERITY.ERROR, 'referential', '$.content.misiones[' + i + '].id', 'duplicate mission id: ' + id));
      }
      seen[id] = true;

      if (!embeddedMissionSpecIds[id] && typeof REGISTRO_MISIONES !== 'undefined' && REGISTRO_MISIONES && typeof REGISTRO_MISIONES.obtener === 'function') {
        var mission = REGISTRO_MISIONES.obtener(id);
        if (!mission) {
          issues.push(createIssue(ERROR_CODES.MISSING_REFERENCE, SEVERITY.ERROR, 'referential', '$.content.misiones[' + i + '].id', 'mission id is not registered: ' + id));
        }
      }
    }

    return issues;
  }

  function validateSemantic(normalized) {
    var issues = [];
    var content = normalized.content;

    if (typeof content.nombre !== 'string' || content.nombre.trim() === '') {
      issues.push(createIssue(ERROR_CODES.VALIDATION_FAILED, SEVERITY.WARNING, 'semantic', '$.content.nombre', 'Campaign name is empty.'));
    }

    if (typeof content.escenario !== 'string' || content.escenario.trim() === '') {
      issues.push(createIssue(ERROR_CODES.VALIDATION_FAILED, SEVERITY.ERROR, 'semantic', '$.content.escenario', 'Campaign scenario is required.'));
    }

    if (Array.isArray(content.misiones) && content.misiones.length === 0) {
      issues.push(createIssue(ERROR_CODES.VALIDATION_FAILED, SEVERITY.ERROR, 'semantic', '$.content.misiones', 'At least one mission is required.'));
    }

    if (typeof window.CRIOS_CAMPAIGN_VALIDATOR !== 'undefined' && window.CRIOS_CAMPAIGN_VALIDATOR && typeof window.CRIOS_CAMPAIGN_VALIDATOR.validarCampaignDraft === 'function') {
      try {
        var escenarios = [];
        if (typeof REGISTRO_ESCENARIOS !== 'undefined' && REGISTRO_ESCENARIOS && typeof REGISTRO_ESCENARIOS.listar === 'function') {
          escenarios = REGISTRO_ESCENARIOS.listar();
        }
        var legacyResult = window.CRIOS_CAMPAIGN_VALIDATOR.validarCampaignDraft(content, escenarios);
        if (legacyResult && Array.isArray(legacyResult.errores)) {
          for (var i = 0; i < legacyResult.errores.length; i += 1) {
            issues.push(createIssue(ERROR_CODES.VALIDATION_FAILED, SEVERITY.WARNING, 'semantic', '$.content', String(legacyResult.errores[i])));
          }
        }
      } catch (error) {
        issues.push(createIssue(ERROR_CODES.VALIDATION_FAILED, SEVERITY.WARNING, 'semantic', '$.content', 'Legacy campaign validator raised an exception.', { message: String(error && error.message || error) }));
      }
    }

    return issues;
  }

  function validateRuntimeCompatibility(normalized) {
    var issues = [];
    var content = normalized.content;

    if (typeof content.nombre !== 'string' || content.nombre.trim() === '') {
      issues.push(createIssue(ERROR_CODES.RUNTIME_INCOMPATIBLE, SEVERITY.ERROR, 'runtimeCompatibility', '$.content.nombre', 'Runtime-compatible release requires a non-empty title source (nombre).'));
    }

    if (typeof content.escenario !== 'string' || content.escenario.trim() === '') {
      issues.push(createIssue(ERROR_CODES.RUNTIME_INCOMPATIBLE, SEVERITY.ERROR, 'runtimeCompatibility', '$.content.escenario', 'Runtime-compatible release requires scenario.'));
    }

    if (!Array.isArray(content.misiones)) {
      issues.push(createIssue(ERROR_CODES.RUNTIME_INCOMPATIBLE, SEVERITY.ERROR, 'runtimeCompatibility', '$.content.misiones', 'Runtime-compatible release requires missions array.'));
      return issues;
    }

    for (var i = 0; i < content.misiones.length; i += 1) {
      var mission = content.misiones[i];
      if (!mission || typeof mission !== 'object' || mission.id == null || String(mission.id).trim() === '') {
        issues.push(createIssue(ERROR_CODES.RUNTIME_INCOMPATIBLE, SEVERITY.ERROR, 'runtimeCompatibility', '$.content.misiones[' + i + '].id', 'Runtime-compatible release requires mission.id.'));
      }
    }

    return issues;
  }

  function createLevel(issues) {
    var safe = issues.slice();
    var valid = safe.every(function(issue){ return issue.severity !== SEVERITY.ERROR; });
    return internals.deepFreeze({ valid: valid, issues: safe });
  }

  function groupBySeverity(issues) {
    var errors = [];
    var warnings = [];
    var info = [];
    for (var i = 0; i < issues.length; i += 1) {
      var issue = issues[i];
      if (issue.severity === SEVERITY.ERROR) errors.push(issue);
      else if (issue.severity === SEVERITY.WARNING) warnings.push(issue);
      else info.push(issue);
    }
    return { errors: errors, warnings: warnings, info: info };
  }

  function validateDraft(draft, options) {
    var normalized;
    var preIssues = [];

    try {
      normalized = internals.normalizeDraft(draft, options || {});
    } catch (error) {
      preIssues.push(createIssue(
        error && error.code ? error.code : ERROR_CODES.INVALID_DRAFT,
        SEVERITY.ERROR,
        'structural',
        '$',
        error && error.message ? error.message : 'Failed to normalize draft.'
      ));
    }

    var structuralIssues = normalized ? validateStructural(normalized) : [];
    var referentialIssues = normalized ? validateReferential(normalized) : [];
    var semanticIssues = normalized ? validateSemantic(normalized) : [];
    var runtimeIssues = normalized ? validateRuntimeCompatibility(normalized) : [];

    var publishabilityIssues = [];
    var allCandidateIssues = preIssues.concat(structuralIssues, referentialIssues, semanticIssues, runtimeIssues);
    var hasErrors = allCandidateIssues.some(function(issue){ return issue.severity === SEVERITY.ERROR; });

    if (!normalized || hasErrors) {
      publishabilityIssues.push(createIssue(ERROR_CODES.VALIDATION_FAILED, SEVERITY.ERROR, 'publishability', '$', 'Draft is not publishable because validation has blocking errors.'));
    }

    if (normalized && (!normalized.campaignId || !normalized.draftRevision)) {
      publishabilityIssues.push(createIssue(ERROR_CODES.VALIDATION_FAILED, SEVERITY.ERROR, 'publishability', '$', 'campaignId and draftRevision are required to publish.'));
    }

    var levelStructural = createLevel(preIssues.concat(structuralIssues));
    var levelReferential = createLevel(referentialIssues);
    var levelSemantic = createLevel(semanticIssues);
    var levelRuntime = createLevel(runtimeIssues);
    var levelPublishability = createLevel(publishabilityIssues);

    var allIssues = preIssues
      .concat(structuralIssues)
      .concat(referentialIssues)
      .concat(semanticIssues)
      .concat(runtimeIssues)
      .concat(publishabilityIssues);

    var grouped = groupBySeverity(allIssues);
    var valid = grouped.errors.length === 0;

    return internals.deepFreeze({
      valid: valid,
      issues: allIssues,
      errors: grouped.errors,
      warnings: grouped.warnings,
      info: grouped.info,
      levels: {
        structural: levelStructural,
        referential: levelReferential,
        semantic: levelSemantic,
        runtimeCompatibility: levelRuntime,
        publishability: levelPublishability
      },
      normalized: normalized || null
    });
  }

  function buildPublicationCandidate(draft, options) {
    var validation = validateDraft(draft, options || {});
    if (!validation.valid || !validation.normalized) {
      return internals.deepFreeze({
        ok: false,
        candidate: null,
        validation: validation,
        error: {
          code: ERROR_CODES.VALIDATION_FAILED,
          message: 'Draft is not publishable.',
          metadata: null
        }
      });
    }

    var candidate = internals.createPublicationCandidateModel({
      campaignId: validation.normalized.campaignId,
      draftRevision: validation.normalized.draftRevision,
      schemaVersion: validation.normalized.schemaVersion,
      content: validation.normalized.content
    });

    return internals.deepFreeze({
      ok: true,
      candidate: candidate,
      validation: validation,
      error: null
    });
  }

  internals.validateDraft = validateDraft;
  internals.buildPublicationCandidate = buildPublicationCandidate;
  window.CRIOS_PUBLICATION_CORE = core;
})();
