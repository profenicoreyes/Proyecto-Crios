/* CRIOS Runtime Executable Publication - contract validation */
(function(){
  'use strict';
  var internal=window.__CRIOS_RUNTIME_EXECUTABLE_PUBLICATION_INTERNAL__;
  if(!internal||!internal.constants)throw new Error('Runtime publication model must load before validator.');
  var C=internal.constants;var E=C.errorCodes;

  function finalEvaluationIssues(value){
    var issues=[];
    if(!internal.exactKeys(value,['adjustments','instruction','responseType','rngPolicy','unit']))return[internal.issue(E.INVALID_FINAL_EVALUATION,'Final evaluation shape is invalid.','$.content.finalEvaluation',null)];
    if(value.responseType!=='NUMERIC_WITH_PROCEDURE'||value.rngPolicy!=='SEEDED_SEQUENCE_V1'||!internal.nonEmpty(value.unit)||!internal.nonEmpty(value.instruction))issues.push(internal.issue(E.INVALID_FINAL_EVALUATION,'Final evaluation values are invalid.','$.content.finalEvaluation',null));
    if(!Array.isArray(value.adjustments)||value.adjustments.length!==2){issues.push(internal.issue(E.INVALID_FINAL_EVALUATION,'Exactly two final adjustments are required.','$.content.finalEvaluation.adjustments',null));return issues;}
    var names={};value.adjustments.forEach(function(adjustment,index){var path='$.content.finalEvaluation.adjustments['+index+']';if(!internal.exactKeys(adjustment,['name','operation','values'])||!internal.nonEmpty(adjustment.name)||names[adjustment.name]||['add','subtract'].indexOf(adjustment.operation)<0||!Array.isArray(adjustment.values)||!adjustment.values.length||adjustment.values.some(function(item){return!Number.isFinite(item);}))issues.push(internal.issue(E.INVALID_FINAL_EVALUATION,'Final adjustment is invalid.',path,null));else names[adjustment.name]=true;});
    return issues;
  }
  function handlerIssue(api,spec,index){
    if(api.has(spec.handlerId,spec.handlerVersion))return null;
    var idExists=api.list().some(function(handler){return handler.handlerId===spec.handlerId;});
    return internal.issue(idExists?E.HANDLER_VERSION_NOT_AVAILABLE:E.HANDLER_NOT_AVAILABLE,'Exact mission handler is unavailable.','$.content.missionSpecs['+index+'].'+(idExists?'handlerVersion':'handlerId'),{handlerId:spec.handlerId,handlerVersion:spec.handlerVersion});
  }
  async function validateExecutablePublication(publication,options){
    var opts=options&&typeof options==='object'?options:{};var core=opts.publicationCore;var handlers=opts.missionHandlersApi;var issues=[];
    if(!core||typeof core.isPublishedCampaign!=='function'||typeof core.buildCanonicalContent!=='function'||typeof core.calculateContentHash!=='function')return internal.validation(false,[internal.issue(E.RUNTIME_PUBLICATION_RESOLUTION_ERROR,'Publication core dependency is invalid.','$',null)]);
    if(!handlers||typeof handlers.validatePublishedMissionSpec!=='function'||typeof handlers.createMissionMaterializer!=='function'||typeof handlers.has!=='function'||typeof handlers.list!=='function')return internal.validation(false,[internal.issue(E.RUNTIME_PUBLICATION_RESOLUTION_ERROR,'Mission handlers dependency is invalid.','$',null)]);
    if(!core.isPublishedCampaign(publication))return internal.validation(false,[internal.issue(E.PUBLICATION_IDENTITY_MISMATCH,'PublishedCampaign contract is invalid.','$',null)]);
    var canonical;var calculatedHash;
    try{canonical=core.buildCanonicalContent({schemaVersion:publication.schemaVersion,content:publication.content});calculatedHash=await core.calculateContentHash(canonical);}catch(error){return internal.validation(false,[internal.issue(E.RUNTIME_PUBLICATION_RESOLUTION_ERROR,'Publication integrity could not be calculated.','$',{causeCode:error&&error.code?String(error.code):null})]);}
    if(calculatedHash!==publication.contentHash)return internal.validation(false,[internal.issue(E.CONTENT_HASH_MISMATCH,'Published content hash does not match.','$.contentHash',{expected:publication.contentHash,actual:calculatedHash})]);
    var content=publication.content;var manifest=content&&content.runtimeExecutionManifest;var specs=content&&content.missionSpecs;
    if(!internal.exactKeys(manifest,['missionCount','missionOrder','requiredHandlers','runtimeContractVersion']))return internal.validation(false,[internal.issue(E.INVALID_EXECUTION_MANIFEST,'Execution manifest shape is invalid.','$.content.runtimeExecutionManifest',null)]);
    if(manifest.runtimeContractVersion!==C.RUNTIME_CONTRACT_VERSION)issues.push(internal.issue(E.UNSUPPORTED_RUNTIME_CONTRACT,'Runtime contract version is unsupported.','$.content.runtimeExecutionManifest.runtimeContractVersion',{actual:manifest.runtimeContractVersion}));
    if(!Array.isArray(manifest.requiredHandlers)||manifest.requiredHandlers.some(function(handler){return!internal.exactKeys(handler,['handlerId','handlerVersion'])||!internal.nonEmpty(handler.handlerId)||!internal.nonEmpty(handler.handlerVersion);}))issues.push(internal.issue(E.INVALID_EXECUTION_MANIFEST,'requiredHandlers is invalid.','$.content.runtimeExecutionManifest.requiredHandlers',null));
    if(!Number.isInteger(manifest.missionCount)||manifest.missionCount<0||!Array.isArray(specs)||manifest.missionCount!==specs.length)issues.push(internal.issue(E.MISSION_COUNT_MISMATCH,'Mission count does not match published specs.','$.content.runtimeExecutionManifest.missionCount',{manifestCount:manifest.missionCount,specCount:Array.isArray(specs)?specs.length:null}));
    if(!Array.isArray(manifest.missionOrder)||manifest.missionOrder.length!==manifest.missionCount||manifest.missionOrder.some(function(id){return!internal.nonEmpty(id);}))issues.push(internal.issue(E.MISSION_ORDER_MISMATCH,'Mission order is invalid.','$.content.runtimeExecutionManifest.missionOrder',null));
    if(issues.length)return internal.validation(false,issues);
    var ids={};var required=[];var requiredSeen={};var materializer=handlers.createMissionMaterializer();
    specs.forEach(function(spec,index){
      var path='$.content.missionSpecs['+index+']';var structural=handlers.validatePublishedMissionSpec(spec);
      if(!structural.valid){issues.push(internal.issue(E.INVALID_MISSION_SPEC,structural.issues[0].message,path+structural.issues[0].path.slice(1),{causeCode:structural.issues[0].code}));return;}
      if(ids[spec.missionId])issues.push(internal.issue(E.DUPLICATE_MISSION_ID,'Mission id is duplicated.',path+'.missionId',{missionId:spec.missionId}));ids[spec.missionId]=true;
      if(manifest.missionOrder[index]!==spec.missionId)issues.push(internal.issue(E.MISSION_ORDER_MISMATCH,'Mission spec does not match missionOrder.',path+'.missionId',{expected:manifest.missionOrder[index],actual:spec.missionId}));
      var unavailable=handlerIssue(handlers,spec,index);if(unavailable)issues.push(unavailable);
      var payloadValidation=materializer.validate(spec);if(!payloadValidation.valid)issues.push(internal.issue(E.INVALID_MISSION_SPEC,payloadValidation.issues[0].message,path+payloadValidation.issues[0].path.slice(1),{causeCode:payloadValidation.issues[0].code}));
      var key=spec.handlerId+'@'+spec.handlerVersion;if(!requiredSeen[key]){requiredSeen[key]=true;required.push({handlerId:spec.handlerId,handlerVersion:spec.handlerVersion});}
    });
    if(JSON.stringify(required)!==JSON.stringify(manifest.requiredHandlers))issues.push(internal.issue(E.INVALID_EXECUTION_MANIFEST,'requiredHandlers does not match mission specs.','$.content.runtimeExecutionManifest.requiredHandlers',{expected:required,actual:manifest.requiredHandlers}));
    Array.prototype.push.apply(issues,finalEvaluationIssues(content.finalEvaluation));
    return internal.validation(issues.length===0,issues);
  }
  internal.validateFinalEvaluation=finalEvaluationIssues;
  internal.validateExecutablePublication=validateExecutablePublication;
})();