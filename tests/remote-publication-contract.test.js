(function(){
  'use strict';

  var startedAt = performance.now();
  var definitions = [];
  var results = [];
  var telemetry = { pageErrors: [], consoleErrors: [], consoleWarnings: [], unhandledRejections: [] };
  var originalConsoleError = console.error;
  var originalConsoleWarn = console.warn;

  console.error = function(){
    telemetry.consoleErrors.push(Array.prototype.slice.call(arguments).map(String).join(' '));
    return originalConsoleError.apply(console, arguments);
  };
  console.warn = function(){
    telemetry.consoleWarnings.push(Array.prototype.slice.call(arguments).map(String).join(' '));
    return originalConsoleWarn.apply(console, arguments);
  };
  window.addEventListener('error', function(event){ telemetry.pageErrors.push(String(event && event.message || 'error')); });
  window.addEventListener('unhandledrejection', function(event){ telemetry.unhandledRejections.push(String(event && event.reason || 'unhandledrejection')); });

  function test(name, run){ definitions.push({ name: name, run: run }); }
  function assert(condition, message){ if (!condition) throw new Error(message || 'Assertion failed'); }
  function equal(actual, expected, message){ if (actual !== expected) throw new Error((message || 'Values differ') + ' actual=' + actual + ' expected=' + expected); }
  function deepEqual(actual, expected, message){
    if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error((message || 'Structures differ') + ' actual=' + JSON.stringify(actual) + ' expected=' + JSON.stringify(expected));
  }
  function exactKeys(value, expected){ deepEqual(Object.keys(value).sort(), expected.slice().sort(), 'Key set differs'); }
  function api(){ return window.CRIOS_REMOTE_PUBLICATION_CONTRACT; }
  function clone(value){ return JSON.parse(JSON.stringify(value)); }
  function deepFreeze(value){ if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; Object.keys(value).forEach(function(key){ deepFreeze(value[key]); }); return Object.freeze(value); }
  function hash(character){ return String(character || 'a').repeat(64); }
  function timestamp(){ return '2026-08-07T20:00:00.000Z'; }

  function publishInput(change){
    var value = {
      campaignId: 'campana-remota',
      draftRevision: 'rev-7',
      schemaVersion: '2.0',
      contentHash: hash('a'),
      content: { nombre: 'Campaña remota', misiones: [{ id: 'energy' }] }
    };
    if (change) change(value);
    return value;
  }

  function publication(change){
    var value = {
      campaignId: 'campana-remota',
      publicationId: 'publication-7',
      version: 7,
      schemaVersion: '2.0',
      contentHash: hash('a'),
      content: { nombre: 'Campaña remota', misiones: [{ id: 'energy' }] }
    };
    if (change) change(value);
    return value;
  }

  function publicationRecord(change){
    var value = {
      publicationId: 'publication-7',
      campaignId: 'campana-remota',
      version: 7,
      schemaVersion: '2.0',
      contentHash: hash('a'),
      sourceDraftRevision: 'rev-7',
      createdAt: timestamp(),
      status: 'PUBLISHED'
    };
    if (change) change(value);
    return value;
  }

  function activeReference(change){
    var value = {
      campaignId: 'campana-remota',
      publicationId: 'publication-7',
      version: 7,
      contentHash: hash('a'),
      activatedAt: timestamp()
    };
    if (change) change(value);
    return value;
  }

  function activationRecord(action, change){
    var value = {
      activationId: 'activation-7',
      action: action,
      campaignId: 'campana-remota',
      previousPublicationId: action === 'ACTIVATE' ? null : 'publication-7',
      nextPublicationId: action === 'ACTIVATE' ? 'publication-7' : null,
      occurredAt: timestamp()
    };
    if (change) change(value);
    return value;
  }

  function response(operation, requestId, success, data, error){
    return { protocolVersion:'1.0', operation:operation, requestId:requestId, success:success, data:data, error:error };
  }

  function remoteError(code){ return { code:code, message:'Operación no disponible.', retryable:false }; }
  function firstCode(validation){ return validation.issues[0] && validation.issues[0].code; }
  function expectRequestFailure(value, code){ var result = api().validateRequest(value); assert(!result.valid, 'Expected request validation failure'); equal(firstCode(result), code); return result; }
  function expectResponseFailure(value, request, code){ var result = api().validateResponse(value, request); assert(!result.valid, 'Expected response validation failure'); assert(result.issues.some(function(issue){ return issue.code === code; }), 'Expected response code ' + code); return result; }

  test('001 API pública exacta y congelada', function(){
    exactKeys(api(), ['version','constants','createPublishRequest','createActivateRequest','createDeactivateRequest','createGetPublicationRequest','validateRequest','validateResponse','parseResponse','isRequest','isResponse','isParsedResponse','measureJsonBytes']);
    assert(Object.isFrozen(api())); equal(api().version, '1.0.0');
  });
  test('002 constantes exactas', function(){ exactKeys(api().constants, ['protocolVersion','operations','errorCodes','limits']); equal(api().constants.protocolVersion, '1.0'); assert(Object.isFrozen(api().constants)); });
  test('003 operaciones exactas', function(){ deepEqual(api().constants.operations, {PUBLISH:'publishPublication',ACTIVATE:'activatePublication',DEACTIVATE:'deactivatePublication',GET:'getPublication'}); });
  test('004 límites explícitos', function(){ equal(api().constants.limits.MAX_CAMPAIGN_ID_LENGTH,160); equal(api().constants.limits.MAX_CONTENT_BYTES,524288); assert(Object.isFrozen(api().constants.limits)); });
  test('005 códigos incluyen neutral unavailable', function(){ equal(api().constants.errorCodes.PUBLICATION_UNAVAILABLE,'PUBLICATION_UNAVAILABLE'); });

  test('006 publish request canónico', function(){ var request=api().createPublishRequest(publishInput(),'req-1'); deepEqual(request,{protocolVersion:'1.0',operation:'publishPublication',requestId:'req-1',payload:publishInput()}); assert(api().isRequest(request)); });
  test('007 publish normaliza bordes de ids', function(){ var input=publishInput(function(value){value.campaignId=' campana-remota ';value.draftRevision=' rev-7 ';value.schemaVersion=' 2.0 ';value.contentHash=' '+hash('a')+' ';}); var request=api().createPublishRequest(input,' req-1 '); equal(request.payload.campaignId,'campana-remota');equal(request.payload.draftRevision,'rev-7');equal(request.requestId,'req-1'); });
  test('008 publish request congelado en profundidad', function(){ var request=api().createPublishRequest(publishInput(),'req-1'); assert(Object.isFrozen(request)&&Object.isFrozen(request.payload)&&Object.isFrozen(request.payload.content)&&Object.isFrozen(request.payload.content.misiones)); });
  test('009 publish no modifica input', function(){ var input=publishInput();var before=JSON.stringify(input);api().createPublishRequest(input,'req-1');equal(JSON.stringify(input),before); });
  test('010 publish requiere requestId', function(){ var thrown=null;try{api().createPublishRequest(publishInput(),'');}catch(error){thrown=error;}equal(thrown&&thrown.code,'INVALID_REQUEST'); });
  test('011 publish requiere campaignId', function(){ var thrown=null;try{api().createPublishRequest(publishInput(function(value){value.campaignId='';}),'req-1');}catch(error){thrown=error;}equal(thrown&&thrown.code,'INVALID_REQUEST'); });
  test('012 publish requiere draftRevision', function(){ var thrown=null;try{api().createPublishRequest(publishInput(function(value){value.draftRevision='';}),'req-1');}catch(error){thrown=error;}equal(thrown&&thrown.code,'INVALID_REQUEST'); });
  test('013 publish requiere schemaVersion', function(){ var thrown=null;try{api().createPublishRequest(publishInput(function(value){value.schemaVersion='';}),'req-1');}catch(error){thrown=error;}equal(thrown&&thrown.code,'INVALID_REQUEST'); });
  test('014 publish requiere hash lowercase SHA-256', function(){ var thrown=null;try{api().createPublishRequest(publishInput(function(value){value.contentHash=hash('A');}),'req-1');}catch(error){thrown=error;}equal(thrown&&thrown.code,'INVALID_REQUEST'); });
  test('015 publish requiere content object', function(){ var thrown=null;try{api().createPublishRequest(publishInput(function(value){value.content=[];}),'req-1');}catch(error){thrown=error;}equal(thrown&&thrown.code,'INVALID_REQUEST'); });

  test('016 activate request canónico', function(){ deepEqual(api().createActivateRequest('campana-remota','publication-7','req-2'),{protocolVersion:'1.0',operation:'activatePublication',requestId:'req-2',payload:{campaignId:'campana-remota',publicationId:'publication-7'}}); });
  test('017 deactivate request canónico', function(){ deepEqual(api().createDeactivateRequest('campana-remota','req-3'),{protocolVersion:'1.0',operation:'deactivatePublication',requestId:'req-3',payload:{campaignId:'campana-remota'}}); });
  test('018 get request canónico', function(){ deepEqual(api().createGetPublicationRequest('campana-remota','publication-7','req-4'),{protocolVersion:'1.0',operation:'getPublication',requestId:'req-4',payload:{campaignId:'campana-remota',publicationId:'publication-7'}}); });
  test('019 activate rechaza publicationId vacío', function(){ var thrown=null;try{api().createActivateRequest('campana-remota','','req-2');}catch(error){thrown=error;}equal(thrown&&thrown.code,'INVALID_REQUEST'); });
  test('020 get rechaza campaignId sobre límite', function(){ var thrown=null;try{api().createGetPublicationRequest('x'.repeat(161),'publication-7','req-4');}catch(error){thrown=error;}equal(thrown&&thrown.code,'INVALID_REQUEST'); });
  test('021 ids Unicode son válidos', function(){ var request=api().createGetPublicationRequest('campaña ártica','publicación 7','req-4');equal(request.payload.campaignId,'campaña ártica');equal(request.payload.publicationId,'publicación 7'); });
  test('022 controles en ids son inválidos', function(){ var thrown=null;try{api().createGetPublicationRequest('campana\nremota','publication-7','req-4');}catch(error){thrown=error;}equal(thrown&&thrown.code,'INVALID_REQUEST'); });

  test('023 validateRequest rechaza claves extra envelope', function(){ var request=clone(api().createDeactivateRequest('campana-remota','req-3'));request.extra=true;expectRequestFailure(request,'INVALID_REQUEST'); });
  test('024 validateRequest rechaza protocolo desconocido', function(){ var request=clone(api().createDeactivateRequest('campana-remota','req-3'));request.protocolVersion='2.0';expectRequestFailure(request,'UNSUPPORTED_PROTOCOL'); });
  test('025 validateRequest rechaza operación desconocida', function(){ var request=clone(api().createDeactivateRequest('campana-remota','req-3'));request.operation='deletePublication';expectRequestFailure(request,'UNSUPPORTED_OPERATION'); });
  test('026 validateRequest rechaza payload extra', function(){ var request=clone(api().createDeactivateRequest('campana-remota','req-3'));request.payload.extra=true;expectRequestFailure(request,'INVALID_REQUEST'); });
  test('027 validateRequest requiere payload object', function(){ var request=clone(api().createDeactivateRequest('campana-remota','req-3'));request.payload=null;expectRequestFailure(request,'INVALID_REQUEST'); });
  test('028 validateRequest exige valor ya normalizado', function(){ var request=clone(api().createDeactivateRequest('campana-remota','req-3'));request.payload.campaignId=' campana-remota ';expectRequestFailure(request,'INVALID_REQUEST'); });
  test('029 isRequest rechaza copia mutable válida', function(){ var mutable=clone(api().createDeactivateRequest('campana-remota','req-3'));assert(api().validateRequest(mutable).valid);assert(!api().isRequest(mutable)); });

  test('030 measureJsonBytes ASCII exacto', function(){ equal(api().measureJsonBytes({a:'x'}),9); });
  test('031 measureJsonBytes UTF-8', function(){ equal(api().measureJsonBytes({a:'á'}),10); });
  test('032 content debajo del límite es aceptado', function(){ var input=publishInput(function(value){value.content={text:'x'.repeat(api().constants.limits.MAX_CONTENT_BYTES-32)};}); assert(api().createPublishRequest(input,'req-size-ok')); });
  test('033 content sobre límite se rechaza', function(){ var thrown=null;try{api().createPublishRequest(publishInput(function(value){value.content={text:'x'.repeat(api().constants.limits.MAX_CONTENT_BYTES)};}),'req-size-bad');}catch(error){thrown=error;}equal(thrown&&thrown.code,'CONTENT_TOO_LARGE'); });
  test('034 content con función se rechaza', function(){ var thrown=null;try{api().createPublishRequest(publishInput(function(value){value.content.bad=function(){};}),'req-bad');}catch(error){thrown=error;}equal(thrown&&thrown.code,'INVALID_REQUEST'); });
  test('035 content circular se rechaza', function(){ var content={};content.self=content;var thrown=null;try{api().createPublishRequest(publishInput(function(value){value.content=content;}),'req-bad');}catch(error){thrown=error;}equal(thrown&&thrown.code,'INVALID_REQUEST'); });
  test('036 content con prototipo custom se rechaza', function(){ var content=Object.create({x:1});content.a=1;var thrown=null;try{api().createPublishRequest(publishInput(function(value){value.content=content;}),'req-bad');}catch(error){thrown=error;}equal(thrown&&thrown.code,'INVALID_REQUEST'); });
  test('037 content con accessor se rechaza sin ejecutar getter', function(){ var called=0;var content={};Object.defineProperty(content,'x',{enumerable:true,get:function(){called+=1;return 1;}});var thrown=null;try{api().createPublishRequest(publishInput(function(value){value.content=content;}),'req-bad');}catch(error){thrown=error;}equal(thrown&&thrown.code,'INVALID_REQUEST');equal(called,0); });
  test('038 content JSON con __proto__ se rechaza', function(){ var content=JSON.parse('{"__proto__":{"polluted":true}}');var thrown=null;try{api().createPublishRequest(publishInput(function(value){value.content=content;}),'req-bad');}catch(error){thrown=error;}equal(thrown&&thrown.code,'INVALID_REQUEST');assert(!({}).polluted); });
  test('039 sparse arrays se rechazan', function(){ var sparse=[];sparse.length=1;var thrown=null;try{api().createPublishRequest(publishInput(function(value){value.content={list:sparse};}),'req-bad');}catch(error){thrown=error;}equal(thrown&&thrown.code,'INVALID_REQUEST'); });
  test('040 propiedades extra de arrays se rechazan', function(){ var list=[1];list.extra=2;var thrown=null;try{api().createPublishRequest(publishInput(function(value){value.content={list:list};}),'req-bad');}catch(error){thrown=error;}equal(thrown&&thrown.code,'INVALID_REQUEST'); });

  test('041 publish response válido', function(){ var request=api().createPublishRequest(publishInput(),'req-1');var value=response('publishPublication','req-1',true,{publication:publication(),record:publicationRecord()},null);assert(api().validateResponse(value,request).valid); });
  test('042 publish response record debe coincidir con publication', function(){ var request=api().createPublishRequest(publishInput(),'req-1');var value=response('publishPublication','req-1',true,{publication:publication(),record:publicationRecord(function(record){record.version=8;})},null);expectResponseFailure(value,request,'REMOTE_IDENTITY_MISMATCH'); });
  test('043 publish response campaign debe coincidir con request', function(){ var request=api().createPublishRequest(publishInput(),'req-1');var value=response('publishPublication','req-1',true,{publication:publication(function(item){item.campaignId='otra';}),record:publicationRecord(function(item){item.campaignId='otra';})},null);expectResponseFailure(value,request,'REMOTE_IDENTITY_MISMATCH'); });
  test('044 publish response hash debe coincidir con request', function(){ var request=api().createPublishRequest(publishInput(),'req-1');var value=response('publishPublication','req-1',true,{publication:publication(function(item){item.contentHash=hash('b');}),record:publicationRecord(function(item){item.contentHash=hash('b');})},null);expectResponseFailure(value,request,'REMOTE_IDENTITY_MISMATCH'); });
  test('045 publish response draftRevision debe coincidir', function(){ var request=api().createPublishRequest(publishInput(),'req-1');var value=response('publishPublication','req-1',true,{publication:publication(),record:publicationRecord(function(item){item.sourceDraftRevision='rev-8';})},null);expectResponseFailure(value,request,'REMOTE_IDENTITY_MISMATCH'); });
  test('046 publication shape exacta', function(){ var request=api().createPublishRequest(publishInput(),'req-1');var p=publication();p.extra=true;var value=response('publishPublication','req-1',true,{publication:p,record:publicationRecord()},null);expectResponseFailure(value,request,'REMOTE_RESPONSE_INVALID'); });
  test('047 publication record timestamp canónico', function(){ var request=api().createPublishRequest(publishInput(),'req-1');var value=response('publishPublication','req-1',true,{publication:publication(),record:publicationRecord(function(item){item.createdAt='2026-08-07';})},null);expectResponseFailure(value,request,'REMOTE_RESPONSE_INVALID'); });

  test('048 activate response changed válido', function(){ var request=api().createActivateRequest('campana-remota','publication-7','req-2');var value=response('activatePublication','req-2',true,{changed:true,reference:activeReference(),record:activationRecord('ACTIVATE')},null);assert(api().validateResponse(value,request).valid); });
  test('049 activate response no-op válido', function(){ var request=api().createActivateRequest('campana-remota','publication-7','req-2');var value=response('activatePublication','req-2',true,{changed:false,reference:activeReference(),record:null},null);assert(api().validateResponse(value,request).valid); });
  test('050 activate changed requiere record', function(){ var request=api().createActivateRequest('campana-remota','publication-7','req-2');var value=response('activatePublication','req-2',true,{changed:true,reference:activeReference(),record:null},null);expectResponseFailure(value,request,'REMOTE_RESPONSE_INVALID'); });
  test('051 activate reference debe coincidir con request', function(){ var request=api().createActivateRequest('campana-remota','publication-7','req-2');var value=response('activatePublication','req-2',true,{changed:false,reference:activeReference(function(item){item.publicationId='publication-8';}),record:null},null);expectResponseFailure(value,request,'REMOTE_IDENTITY_MISMATCH'); });
  test('052 activate record debe apuntar a reference', function(){ var request=api().createActivateRequest('campana-remota','publication-7','req-2');var value=response('activatePublication','req-2',true,{changed:true,reference:activeReference(),record:activationRecord('ACTIVATE',function(item){item.nextPublicationId='publication-8';})},null);expectResponseFailure(value,request,'REMOTE_IDENTITY_MISMATCH'); });

  test('053 deactivate response changed válido', function(){ var request=api().createDeactivateRequest('campana-remota','req-3');var value=response('deactivatePublication','req-3',true,{changed:true,reference:null,record:activationRecord('DEACTIVATE')},null);assert(api().validateResponse(value,request).valid); });
  test('054 deactivate response no-op válido', function(){ var request=api().createDeactivateRequest('campana-remota','req-3');var value=response('deactivatePublication','req-3',true,{changed:false,reference:null,record:null},null);assert(api().validateResponse(value,request).valid); });
  test('055 deactivate no puede devolver active reference', function(){ var request=api().createDeactivateRequest('campana-remota','req-3');var value=response('deactivatePublication','req-3',true,{changed:false,reference:activeReference(),record:null},null);expectResponseFailure(value,request,'REMOTE_RESPONSE_INVALID'); });
  test('056 deactivate record debe ser DEACTIVATE', function(){ var request=api().createDeactivateRequest('campana-remota','req-3');var value=response('deactivatePublication','req-3',true,{changed:true,reference:null,record:activationRecord('ACTIVATE')},null);expectResponseFailure(value,request,'REMOTE_IDENTITY_MISMATCH'); });

  test('057 get response válido y activo', function(){ var request=api().createGetPublicationRequest('campana-remota','publication-7','req-4');var value=response('getPublication','req-4',true,{publication:publication(),activeReference:activeReference()},null);assert(api().validateResponse(value,request).valid); });
  test('058 get activeReference debe coincidir con publication', function(){ var request=api().createGetPublicationRequest('campana-remota','publication-7','req-4');var value=response('getPublication','req-4',true,{publication:publication(),activeReference:activeReference(function(item){item.version=8;})},null);expectResponseFailure(value,request,'REMOTE_IDENTITY_MISMATCH'); });
  test('059 get publicationId debe coincidir con link/request', function(){ var request=api().createGetPublicationRequest('campana-remota','publication-7','req-4');var value=response('getPublication','req-4',true,{publication:publication(function(item){item.publicationId='publication-8';}),activeReference:activeReference(function(item){item.publicationId='publication-8';})},null);expectResponseFailure(value,request,'REMOTE_IDENTITY_MISMATCH'); });
  test('060 get no acepta publication sin activeReference', function(){ var request=api().createGetPublicationRequest('campana-remota','publication-7','req-4');var value=response('getPublication','req-4',true,{publication:publication(),activeReference:null},null);expectResponseFailure(value,request,'REMOTE_RESPONSE_INVALID'); });

  test('061 failure neutral PUBLICATION_UNAVAILABLE válido', function(){ var request=api().createGetPublicationRequest('campana-remota','publication-7','req-4');var value=response('getPublication','req-4',false,null,remoteError('PUBLICATION_UNAVAILABLE'));assert(api().validateResponse(value,request).valid); });
  test('062 failure WRITE_UNAUTHORIZED válido', function(){ var request=api().createActivateRequest('campana-remota','publication-7','req-2');var value=response('activatePublication','req-2',false,null,remoteError('WRITE_UNAUTHORIZED'));assert(api().validateResponse(value,request).valid); });
  test('063 failure no puede incluir data', function(){ var request=api().createGetPublicationRequest('campana-remota','publication-7','req-4');var value=response('getPublication','req-4',false,{},remoteError('PUBLICATION_UNAVAILABLE'));expectResponseFailure(value,request,'REMOTE_RESPONSE_INVALID'); });
  test('064 failure requiere error conocido', function(){ var request=api().createGetPublicationRequest('campana-remota','publication-7','req-4');var value=response('getPublication','req-4',false,null,remoteError('SECRET_INTERNAL_ERROR'));expectResponseFailure(value,request,'REMOTE_RESPONSE_INVALID'); });
  test('065 success requiere error null', function(){ var request=api().createGetPublicationRequest('campana-remota','publication-7','req-4');var value=response('getPublication','req-4',true,{publication:publication(),activeReference:activeReference()},remoteError('SERVER_ERROR'));expectResponseFailure(value,request,'REMOTE_RESPONSE_INVALID'); });
  test('066 requestId de response debe coincidir', function(){ var request=api().createGetPublicationRequest('campana-remota','publication-7','req-4');var value=response('getPublication','req-other',true,{publication:publication(),activeReference:activeReference()},null);expectResponseFailure(value,request,'REMOTE_IDENTITY_MISMATCH'); });
  test('067 operation de response debe coincidir', function(){ var request=api().createGetPublicationRequest('campana-remota','publication-7','req-4');var value=response('activatePublication','req-4',true,{changed:false,reference:activeReference(),record:null},null);expectResponseFailure(value,request,'REMOTE_IDENTITY_MISMATCH'); });
  test('068 protocolo de response debe coincidir', function(){ var request=api().createGetPublicationRequest('campana-remota','publication-7','req-4');var value=response('getPublication','req-4',true,{publication:publication(),activeReference:activeReference()},null);value.protocolVersion='2.0';expectResponseFailure(value,request,'UNSUPPORTED_PROTOCOL'); });
  test('069 response envelope no admite extra', function(){ var request=api().createGetPublicationRequest('campana-remota','publication-7','req-4');var value=response('getPublication','req-4',true,{publication:publication(),activeReference:activeReference()},null);value.extra=true;expectResponseFailure(value,request,'REMOTE_RESPONSE_INVALID'); });

  test('070 parseResponse acepta y congela copia', function(){ var request=api().createGetPublicationRequest('campana-remota','publication-7','req-4');var raw=response('getPublication','req-4',true,{publication:publication(),activeReference:activeReference()},null);var parsed=api().parseResponse(raw,request);assert(parsed.accepted);assert(parsed.response!==raw);assert(Object.isFrozen(parsed)&&Object.isFrozen(parsed.response)&&Object.isFrozen(parsed.response.data.publication));assert(api().isParsedResponse(parsed)); });
  test('071 parseResponse rechaza envelope malformado neutralmente', function(){ var request=api().createGetPublicationRequest('campana-remota','publication-7','req-4');var parsed=api().parseResponse({bad:true},request);assert(!parsed.accepted);equal(parsed.error.code,'REMOTE_RESPONSE_INVALID');assert(api().isParsedResponse(parsed)); });
  test('072 parseResponse separa identity mismatch', function(){ var request=api().createGetPublicationRequest('campana-remota','publication-7','req-4');var raw=response('getPublication','otro',true,{publication:publication(),activeReference:activeReference()},null);var parsed=api().parseResponse(raw,request);assert(!parsed.accepted);equal(parsed.error.code,'REMOTE_IDENTITY_MISMATCH'); });
  test('073 isResponse exige congelado', function(){ var request=api().createGetPublicationRequest('campana-remota','publication-7','req-4');var raw=response('getPublication','req-4',true,{publication:publication(),activeReference:activeReference()},null);assert(api().validateResponse(raw,request).valid);assert(!api().isResponse(raw,request));assert(api().isResponse(deepFreeze(raw),request)); });
  test('074 validateResponse rechaza expected request inválido', function(){ var raw=response('getPublication','req-4',false,null,remoteError('PUBLICATION_UNAVAILABLE'));var badRequest=clone(api().createGetPublicationRequest('campana-remota','publication-7','req-4'));badRequest.payload.extra=true;expectResponseFailure(raw,badRequest,'INVALID_REQUEST'); });
  test('075 API no genera requestId ni identidad server-side', function(){ var source=[api().createPublishRequest,api().createActivateRequest,api().createDeactivateRequest,api().createGetPublicationRequest].join('\n');assert(source.indexOf('randomUUID')<0);assert(source.indexOf('getNextVersion')<0);assert(source.indexOf('publicationIdFactory')<0); });
  test('076 funciones públicas no contienen red/storage/DOM/timers', function(){ var source=Object.keys(api()).filter(function(key){return typeof api()[key]==='function';}).map(function(key){return api()[key].toString();}).join('\n');['fetch(','XMLHttpRequest','localStorage','sessionStorage','indexedDB','document.','querySelector','getElementById','setTimeout','setInterval','sendBeacon'].forEach(function(token){assert(source.indexOf(token)<0,'Unexpected dependency: '+token);}); });
  test('077 builders no tocan red, storage ni timers', function(){
    var counters={fetch:0,storage:0,timeout:0,interval:0};
    var originalFetch=window.fetch,originalTimeout=window.setTimeout,originalInterval=window.setInterval;
    var storagePrototype=typeof Storage!=='undefined'?Storage.prototype:null;
    var originalStorageGet=storagePrototype&&storagePrototype.getItem;
    window.fetch=function(){counters.fetch+=1;return Promise.reject(new Error('unexpected'));};
    if(storagePrototype) storagePrototype.getItem=function(){counters.storage+=1;return null;};
    window.setTimeout=function(){counters.timeout+=1;return 0;};window.setInterval=function(){counters.interval+=1;return 0;};
    try{api().createPublishRequest(publishInput(),'req-1');api().createActivateRequest('campana-remota','publication-7','req-2');api().createDeactivateRequest('campana-remota','req-3');api().createGetPublicationRequest('campana-remota','publication-7','req-4');}
    finally{window.fetch=originalFetch;if(storagePrototype)storagePrototype.getItem=originalStorageGet;window.setTimeout=originalTimeout;window.setInterval=originalInterval;}
    deepEqual(counters,{fetch:0,storage:0,timeout:0,interval:0});
  });
  test('078 no page errors', function(){ equal(telemetry.pageErrors.length,0,telemetry.pageErrors.join(' | ')); });
  test('079 no console errors', function(){ equal(telemetry.consoleErrors.length,0,telemetry.consoleErrors.join(' | ')); });
  test('080 no unhandled rejections', function(){ equal(telemetry.unhandledRejections.length,0,telemetry.unhandledRejections.join(' | ')); });

  async function run(){
    for (var index=0; index<definitions.length; index+=1) {
      try { await definitions[index].run(); results.push(Object.freeze({name:definitions[index].name,passed:true,error:null})); }
      catch (error) { results.push(Object.freeze({name:definitions[index].name,passed:false,error:String(error && error.message || error)})); }
    }
    var passed=results.filter(function(item){return item.passed;}).length;
    var output=Object.freeze({
      status:passed===results.length&&telemetry.pageErrors.length===0&&telemetry.consoleErrors.length===0&&telemetry.unhandledRejections.length===0?'PASS':'FAIL',
      total:results.length,passed:passed,failed:results.length-passed,tests:Object.freeze(results.slice()),durationMs:Math.round((performance.now()-startedAt)*100)/100,
      pageErrors:Object.freeze(telemetry.pageErrors.slice()),consoleErrors:Object.freeze(telemetry.consoleErrors.slice()),consoleWarnings:Object.freeze(telemetry.consoleWarnings.slice()),unhandledRejections:Object.freeze(telemetry.unhandledRejections.slice())
    });
    window.CRIOS_REMOTE_PUBLICATION_CONTRACT_TEST_RESULTS=output;
    document.getElementById('results').textContent=JSON.stringify(output,null,2);
  }

  run();
})();
