/* CRIOS Runtime Missions - declarative area handler */
(function(){
  'use strict';
  var internal = window.__CRIOS_RUNTIME_MISSION_INTERNAL__;
  if (!internal || typeof internal.evaluateExpression !== 'function') throw new Error('Safe expression module must load first.');
  var C = internal.constants;
  var E = C.errorCodes;
  var PAYLOAD_KEYS = ['assessment', 'generation', 'metadata', 'presentation'];
  var ROLES = Object.freeze(['primary', 'accent', 'danger', 'label', 'muted']);

  function add(issues, code, path, message) { issues.push(internal.issue(code, path, message)); }
  function nonEmpty(value) { return typeof value === 'string' && value.trim() !== ''; }
  function finite(value) { return typeof value === 'number' && Number.isFinite(value); }
  function namesFrom(generation) {
    var names = [];
    (generation.variables || []).forEach(function(item){ names.push(item.name); });
    (generation.constants || []).forEach(function(item){ names.push(item.name); });
    (generation.derived || []).forEach(function(item){ names.push(item.name); });
    return names;
  }
  function validateTemplate(template, allowedNames, path, issues) {
    if (!nonEmpty(template) || template.length > C.limits.TEMPLATE_MAX_LENGTH || /[<>]/.test(template) || /\{\{\{|\}\}\}/.test(template)) {
      add(issues, E.MISSION_PAYLOAD_INVALID, path, 'Template must be bounded plain text.'); return;
    }
    var residue = template.replace(/\{([A-Za-z][A-Za-z0-9_]*)\}/g, function(match, name){
      if (allowedNames.indexOf(name) < 0) add(issues, E.MISSION_PAYLOAD_INVALID, path, 'Unknown placeholder: ' + name + '.');
      return '';
    });
    if (/[{}]/.test(residue)) add(issues, E.MISSION_PAYLOAD_INVALID, path, 'Template placeholder is malformed.');
  }
  function validateExpressionAt(ast, names, path, issues) {
    var validation = internal.validateExpression(ast, names);
    if (!validation.valid) add(issues, E.MISSION_PAYLOAD_INVALID, path, validation.issues[0].message);
  }
  function validateMetadata(value, issues) {
    if (!internal.exactKeys(value, ['activity', 'classification', 'map', 'narrative', 'number', 'shortTitle', 'title'])) { add(issues, E.MISSION_PAYLOAD_INCOMPLETE, '$.payload.metadata', 'metadata keys are invalid.'); return; }
    ['number', 'shortTitle', 'title'].forEach(function(key){ if (!nonEmpty(value[key])) add(issues, E.MISSION_PAYLOAD_INVALID, '$.payload.metadata.' + key, key + ' is required.'); });
    if (!internal.exactKeys(value.map, ['styleToken', 'subtitle', 'title']) || !nonEmpty(value.map.title) || !nonEmpty(value.map.subtitle) || !/^[a-z][a-z0-9-]*$/.test(value.map.styleToken || '')) add(issues, E.MISSION_PAYLOAD_INVALID, '$.payload.metadata.map', 'map is invalid.');
    if (!internal.exactKeys(value.classification, ['difficulty', 'level', 'subject', 'subtopic', 'topic']) || !finite(value.classification.difficulty)) add(issues, E.MISSION_PAYLOAD_INVALID, '$.payload.metadata.classification', 'classification is invalid.');
    if (!internal.exactKeys(value.narrative, ['location', 'objective']) || !nonEmpty(value.narrative.location) || !nonEmpty(value.narrative.objective)) add(issues, E.MISSION_PAYLOAD_INVALID, '$.payload.metadata.narrative', 'narrative is invalid.');
    if (!internal.exactKeys(value.activity, ['durationMinutes', 'tags', 'type']) || !nonEmpty(value.activity.type) || !finite(value.activity.durationMinutes) || value.activity.durationMinutes <= 0 || !Array.isArray(value.activity.tags) || value.activity.tags.some(function(tag){ return !nonEmpty(tag); })) add(issues, E.MISSION_PAYLOAD_INVALID, '$.payload.metadata.activity', 'activity is invalid.');
  }
  function validateGeneration(value, issues) {
    if (!internal.exactKeys(value, ['constants', 'derived', 'rngPolicy', 'variables'])) { add(issues, E.MISSION_PAYLOAD_INCOMPLETE, '$.payload.generation', 'generation keys are invalid.'); return []; }
    if (value.rngPolicy !== C.RNG_POLICY) add(issues, E.NONDETERMINISTIC_GENERATION_UNDECLARED, '$.payload.generation.rngPolicy', 'Unsupported RNG policy.');
    if (!Array.isArray(value.variables) || !Array.isArray(value.constants) || !Array.isArray(value.derived)) { add(issues, E.MISSION_PAYLOAD_INVALID, '$.payload.generation', 'Generation collections are required.'); return []; }
    var names = [];
    value.variables.forEach(function(variable, index){
      if (!internal.exactKeys(variable, ['name', 'values']) || !nonEmpty(variable.name) || !Array.isArray(variable.values) || variable.values.length === 0 || variable.values.some(function(item){ return !finite(item); })) add(issues, E.MISSION_PAYLOAD_INVALID, '$.payload.generation.variables[' + index + ']', 'Variable is invalid.');
      if (names.indexOf(variable.name) >= 0) add(issues, E.MISSION_PAYLOAD_INVALID, '$.payload.generation.variables[' + index + '].name', 'Variable name is duplicated.');
      names.push(variable.name);
    });
    value.constants.forEach(function(constant, index){
      if (!internal.exactKeys(constant, ['name', 'value']) || !nonEmpty(constant.name) || !finite(constant.value)) add(issues, E.MISSION_PAYLOAD_INVALID, '$.payload.generation.constants[' + index + ']', 'Constant is invalid.');
      if (names.indexOf(constant.name) >= 0) add(issues, E.MISSION_PAYLOAD_INVALID, '$.payload.generation.constants[' + index + '].name', 'Constant name is duplicated.');
      names.push(constant.name);
    });
    value.derived.forEach(function(derived, index){
      if (!internal.exactKeys(derived, ['expression', 'name']) || !nonEmpty(derived.name)) { add(issues, E.MISSION_PAYLOAD_INVALID, '$.payload.generation.derived[' + index + ']', 'Derived value is invalid.'); return; }
      if (names.indexOf(derived.name) >= 0) add(issues, E.MISSION_PAYLOAD_INVALID, '$.payload.generation.derived[' + index + '].name', 'Derived name is duplicated.');
      validateExpressionAt(derived.expression, names, '$.payload.generation.derived[' + index + '].expression', issues);
      names.push(derived.name);
    });
    return names;
  }
  function validateAssessment(value, names, issues) {
    if (!internal.exactKeys(value, ['answerExpression', 'alternativeOperands', 'operands', 'responseType', 'tolerance', 'unit'])) { add(issues, E.MISSION_PAYLOAD_INCOMPLETE, '$.payload.assessment', 'assessment keys are invalid.'); return; }
    if (value.responseType !== 'NUMERIC_WITH_PROCEDURE' || !finite(value.tolerance) || value.tolerance < 0 || !nonEmpty(value.unit)) add(issues, E.MISSION_PAYLOAD_INVALID, '$.payload.assessment', 'assessment values are invalid.');
    validateExpressionAt(value.answerExpression, names, '$.payload.assessment.answerExpression', issues);
    if (!Array.isArray(value.operands) || value.operands.some(function(name){ return names.indexOf(name) < 0; })) add(issues, E.MISSION_PAYLOAD_INVALID, '$.payload.assessment.operands', 'Operand reference is invalid.');
    if (!Array.isArray(value.alternativeOperands) || value.alternativeOperands.some(function(set){ return !Array.isArray(set) || set.some(function(name){ return names.indexOf(name) < 0; }); })) add(issues, E.MISSION_PAYLOAD_INVALID, '$.payload.assessment.alternativeOperands', 'Alternative operand reference is invalid.');
  }
  function validateCoordinate(value, names, path, issues) { if (finite(value)) return; validateExpressionAt(value, names, path, issues); }
  function validateScene(scene, names, issues) {
    if (!internal.exactKeys(scene, ['height', 'primitives', 'width']) || !finite(scene.width) || !finite(scene.height) || !Array.isArray(scene.primitives) || scene.primitives.length > C.limits.SCENE_MAX_PRIMITIVES) { add(issues, E.MISSION_PAYLOAD_INVALID, '$.payload.presentation.scene', 'Scene is invalid.'); return; }
    scene.primitives.forEach(function(primitive, index){
      var path = '$.payload.presentation.scene.primitives[' + index + ']';
      if (!internal.isPlainObject(primitive) || C.scenePrimitives.indexOf(primitive.type) < 0 || ROLES.indexOf(primitive.role) < 0) { add(issues, E.MISSION_PAYLOAD_INVALID, path, 'Scene primitive or role is invalid.'); return; }
      var coordinateKeys = [];
      var expected;
      if (primitive.type === 'rect') { expected = ['height','role','type','width','x','y']; coordinateKeys = ['x','y','width','height']; }
      if (primitive.type === 'circle') { expected = ['cx','cy','r','role','type']; coordinateKeys = ['cx','cy','r']; }
      if (primitive.type === 'line') { expected = ['role','type','x1','x2','y1','y2']; coordinateKeys = ['x1','y1','x2','y2']; }
      if (primitive.type === 'polygon') { expected = ['points','role','type']; if (!Array.isArray(primitive.points) || primitive.points.length < 3) add(issues, E.MISSION_PAYLOAD_INVALID, path + '.points', 'Polygon points are invalid.'); else primitive.points.forEach(function(point, pointIndex){ if (!internal.exactKeys(point,['x','y'])) add(issues,E.MISSION_PAYLOAD_INVALID,path+'.points['+pointIndex+']','Point keys are invalid.'); else { validateCoordinate(point.x,names,path+'.points['+pointIndex+'].x',issues);validateCoordinate(point.y,names,path+'.points['+pointIndex+'].y',issues); } }); }
      if (primitive.type === 'text') { expected = ['role','text','type','x','y']; coordinateKeys = ['x','y']; validateTemplate(primitive.text,names,path+'.text',issues); }
      if (!internal.exactKeys(primitive, expected)) add(issues, E.MISSION_PAYLOAD_INVALID, path, 'Primitive keys are invalid.');
      coordinateKeys.forEach(function(key){ validateCoordinate(primitive[key], names, path + '.' + key, issues); });
    });
  }
  function validatePresentation(value, names, issues) {
    if (!internal.exactKeys(value, ['ariaMessage', 'hint', 'procedurePlaceholder', 'question', 'scene', 'statement'])) { add(issues, E.MISSION_PAYLOAD_INCOMPLETE, '$.payload.presentation', 'presentation keys are invalid.'); return; }
    ['ariaMessage','hint','procedurePlaceholder','question','statement'].forEach(function(key){ validateTemplate(value[key], names, '$.payload.presentation.' + key, issues); });
    validateScene(value.scene, names, issues);
  }
  function validateSpec(spec) {
    var base = internal.validatePublishedMissionSpec(spec);
    var issues = base.issues.slice();
    if (!base.valid) return internal.validationResult(issues);
    if (spec.handlerId !== C.DEFAULT_HANDLER_ID) add(issues, E.MISSION_HANDLER_NOT_FOUND, '$.handlerId', 'Handler identity does not match.');
    if (spec.handlerVersion !== C.DEFAULT_HANDLER_VERSION) add(issues, E.MISSION_HANDLER_VERSION_UNSUPPORTED, '$.handlerVersion', 'Handler version does not match.');
    if (!internal.exactKeys(spec.payload, PAYLOAD_KEYS)) { add(issues, E.MISSION_PAYLOAD_INCOMPLETE, '$.payload', 'Payload keys are invalid.'); return internal.validationResult(issues); }
    validateMetadata(spec.payload.metadata, issues);
    var names = validateGeneration(spec.payload.generation, issues);
    validateAssessment(spec.payload.assessment, names, issues);
    validatePresentation(spec.payload.presentation, names, issues);
    return internal.validationResult(issues);
  }
  function escapeText(value) { return String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
  function interpolate(template, environment) {
    var output = template.replace(/\{([A-Za-z][A-Za-z0-9_]*)\}/g,function(match,name){ if (!Object.prototype.hasOwnProperty.call(environment,name)) { var error=new Error('Template value is missing: '+name+'.');error.code=E.MISSION_MATERIALIZATION_FAILED;throw error; } return escapeText(environment[name]); });
    if (/[{}]/.test(output)) { var error = new Error('Template is malformed.'); error.code = E.MISSION_MATERIALIZATION_FAILED; throw error; }
    return output;
  }
  function coordinate(value, environment) { return finite(value) ? value : internal.evaluateExpression(value, environment); }
  function renderScene(scene, environment) {
    var styles = { primary:'fill="none" stroke="#80e8ff" stroke-width="4"',accent:'fill="none" stroke="#ffb62e" stroke-width="4"',danger:'fill="none" stroke="#ff5b6b" stroke-width="4"',label:'fill="#dff9ff"',muted:'fill="#9cb8c2"' };
    var output = ['<svg viewBox="0 0 '+scene.width+' '+scene.height+'" role="img" aria-hidden="true">'];
    scene.primitives.forEach(function(p){
      var style=styles[p.role];
      if(p.type==='rect')output.push('<rect x="'+coordinate(p.x,environment)+'" y="'+coordinate(p.y,environment)+'" width="'+coordinate(p.width,environment)+'" height="'+coordinate(p.height,environment)+'" '+style+'/>');
      if(p.type==='circle')output.push('<circle cx="'+coordinate(p.cx,environment)+'" cy="'+coordinate(p.cy,environment)+'" r="'+coordinate(p.r,environment)+'" '+style+'/>');
      if(p.type==='line')output.push('<line x1="'+coordinate(p.x1,environment)+'" y1="'+coordinate(p.y1,environment)+'" x2="'+coordinate(p.x2,environment)+'" y2="'+coordinate(p.y2,environment)+'" '+style+'/>');
      if(p.type==='polygon')output.push('<polygon points="'+p.points.map(function(point){return coordinate(point.x,environment)+','+coordinate(point.y,environment);}).join(' ')+'" '+style+'/>');
      if(p.type==='text')output.push('<text x="'+coordinate(p.x,environment)+'" y="'+coordinate(p.y,environment)+'" '+style+'>'+interpolate(p.text,environment)+'</text>');
    });
    output.push('</svg>'); return output.join('');
  }
  function materialize(spec) {
    var validation=validateSpec(spec);if(!validation.valid){var invalid=new Error(validation.issues[0].message);invalid.code=validation.issues[0].code;throw invalid;}
    var frozenSpec=internal.deepFreeze(internal.cloneStrict(spec,[]));
    var payload=frozenSpec.payload;
    function generate(random,variant){
      if(typeof random!=='function'){var rngError=new Error('RNG function is required.');rngError.code=E.NONDETERMINISTIC_GENERATION_UNDECLARED;throw rngError;}
      var environment={};
      payload.generation.variables.forEach(function(variable){var sample=random();if(!finite(sample)||sample<0||sample>=1){var sampleError=new Error('RNG must return a finite value in [0, 1).');sampleError.code=E.NONDETERMINISTIC_GENERATION_UNDECLARED;throw sampleError;}environment[variable.name]=variable.values[Math.floor(sample*variable.values.length)];});
      payload.generation.constants.forEach(function(constant){environment[constant.name]=constant.value;});
      payload.generation.derived.forEach(function(derived){environment[derived.name]=internal.evaluateExpression(derived.expression,environment);});
      var expected=internal.evaluateExpression(payload.assessment.answerExpression,environment);
      var required=payload.assessment.operands.map(function(name){return environment[name];});
      var alternatives=payload.assessment.alternativeOperands.map(function(set){return set.map(function(name){return environment[name];});});
      var generated={variant:variant,handlerId:frozenSpec.handlerId,handlerVersion:frozenSpec.handlerVersion,values:internal.cloneStrict(environment,[]),expected:expected,required:required,alternatives:alternatives,hint:payload.presentation.hint};
      return internal.deepFreeze(generated);
    }
    function content(generated){
      if(!internal.isPlainObject(generated)||!internal.isPlainObject(generated.values)){var stateError=new Error('Generated state is invalid.');stateError.code=E.MISSION_MATERIALIZATION_FAILED;throw stateError;}
      var environment=generated.values;
      return internal.deepFreeze({text:interpolate(payload.presentation.statement,environment),question:interpolate(payload.presentation.question,environment),svg:renderScene(payload.presentation.scene,environment)});
    }
    var metadata=payload.metadata;
    return internal.deepFreeze({id:frozenSpec.missionId,numero:metadata.number,titulo:metadata.title,nombreCorto:metadata.shortTitle,mapa:{titulo:metadata.map.title,subtitulo:metadata.map.subtitle,clase:metadata.map.styleToken},clasificacion:{materia:metadata.classification.subject,tema:metadata.classification.topic,subtema:metadata.classification.subtopic,nivel:metadata.classification.level,dificultad:metadata.classification.difficulty},narrativa:{ubicacion:metadata.narrative.location,objetivo:metadata.narrative.objective},tipoActividad:metadata.activity.type,duracionEstimadaMinutos:metadata.activity.durationMinutes,etiquetas:metadata.activity.tags,mensajeAria:payload.presentation.ariaMessage,ejemploProcedimiento:payload.presentation.procedurePlaceholder,handlerId:frozenSpec.handlerId,handlerVersion:frozenSpec.handlerVersion,generar:generate,contenido:content});
  }
  internal.createDeclarativeAreaHandler=function(){return internal.deepFreeze({handlerId:C.DEFAULT_HANDLER_ID,handlerVersion:C.DEFAULT_HANDLER_VERSION,validateSpec:validateSpec,materialize:materialize});};
})();