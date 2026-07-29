/* CRIOS Runtime Executable Publication - atomic resolver */
(function(){
  'use strict';
  var internal=window.__CRIOS_RUNTIME_EXECUTABLE_PUBLICATION_INTERNAL__;
  if(!internal||typeof internal.validateExecutablePublication!=='function')throw new Error('Runtime publication validator must load before resolver.');
  var C=internal.constants;var E=C.errorCodes;
  function knownCode(code){return Object.keys(E).some(function(key){return E[key]===code;});}
  function failure(code,message,path,metadata){return internal.result(false,null,internal.issue(code,message,path,metadata));}
  function missionSnapshot(mission){var snapshot={};Object.keys(mission).forEach(function(key){if(key!=='generar'&&key!=='contenido')snapshot[key]=internal.deepClone(mission[key]);});return snapshot;}
  function validateDependencies(options){return options&&typeof options.activeReferenceReader==='function'&&typeof options.publicationReader==='function'&&options.publicationCore&&options.missionHandlersApi;}
  function createRuntimePublicationResolver(options){
    if(!validateDependencies(options))throw new Error('activeReferenceReader, publicationReader, publicationCore and missionHandlersApi are required.');
    var activeReferenceReader=options.activeReferenceReader;var publicationReader=options.publicationReader;var publicationCore=options.publicationCore;var handlers=options.missionHandlersApi;var defaultRngFactory=options.rngFactory;
    async function resolveActiveCampaign(campaignId,resolveOptions){
      var id=typeof campaignId==='string'?campaignId.trim():'';if(!id)return failure(E.INVALID_CAMPAIGN_ID,'campaignId is required.','$.campaignId',null);
      try{
        var reference=await activeReferenceReader(id);if(!reference)return failure(E.ACTIVE_REFERENCE_NOT_FOUND,'Active publication reference was not found.','$.activeReference',{campaignId:id});
        if(reference.campaignId!==id)return failure(E.ACTIVE_REFERENCE_MISMATCH,'Active reference belongs to another campaign.','$.activeReference.campaignId',{expected:id,actual:reference.campaignId});
        var publication=await publicationReader(reference.publicationId,id);if(!publication)return failure(E.PUBLICATION_NOT_FOUND,'Active publication was not found.','$.publication',{publicationId:reference.publicationId});
        if(publication.campaignId!==id||publication.publicationId!==reference.publicationId||publication.version!==reference.version||publication.contentHash!==reference.contentHash)return failure(E.PUBLICATION_IDENTITY_MISMATCH,'Publication identity does not match active reference.','$.publication',{campaignId:publication.campaignId,publicationId:publication.publicationId,version:publication.version});
        var validation=await internal.validateExecutablePublication(publication,{publicationCore:publicationCore,missionHandlersApi:handlers});if(!validation.valid)return internal.result(false,null,validation.issues[0]);
        var rngFactory=resolveOptions&&typeof resolveOptions.rngFactory==='function'?resolveOptions.rngFactory:defaultRngFactory;if(typeof rngFactory!=='function')return failure(E.MISSION_MATERIALIZATION_FAILED,'An explicit rngFactory is required.','$.rngFactory',null);
        var manifest=publication.content.runtimeExecutionManifest;var specs=publication.content.missionSpecs;var materializer=handlers.createMissionMaterializer();var missions=[];
        for(var index=0;index<specs.length;index+=1){
          var spec=specs[index];var materialized=materializer.materialize(spec,{});if(!materialized.success)return failure(E.MISSION_MATERIALIZATION_FAILED,'Mission materialization failed.','$.content.missionSpecs['+index+']',{missionId:spec.missionId,causeCode:materialized.error&&materialized.error.code||null});
          var rng=rngFactory(spec.missionId,index,internal.frozenCopy(publication));if(typeof rng!=='function')return failure(E.MISSION_MATERIALIZATION_FAILED,'rngFactory must return a function.','$.rngFactory',{missionId:spec.missionId,missionIndex:index});
          var generated;var content;try{generated=materialized.mission.generar(rng,index);content=materialized.mission.contenido(generated);}catch(error){return failure(E.MISSION_MATERIALIZATION_FAILED,'Mission generation failed.','$.content.missionSpecs['+index+']',{missionId:spec.missionId,causeCode:error&&error.code?String(error.code):null});}
          missions.push({missionId:spec.missionId,handlerId:spec.handlerId,handlerVersion:spec.handlerVersion,missionIndex:index,publishedSpec:internal.deepClone(spec),materialization:{mission:missionSnapshot(materialized.mission),generatedState:internal.deepClone(generated),content:internal.deepClone(content)}});
        }
        var campaign=internal.deepFreeze({campaignId:publication.campaignId,publicationId:publication.publicationId,publicationVersion:publication.version,contentHash:publication.contentHash,runtimeContractVersion:manifest.runtimeContractVersion,requiredHandlers:internal.deepClone(manifest.requiredHandlers),missionOrder:internal.deepClone(manifest.missionOrder),missions:missions,finalEvaluation:internal.deepClone(publication.content.finalEvaluation),resolutionMetadata:{missionCount:missions.length,handlerCount:manifest.requiredHandlers.length,rngPolicy:C.RNG_POLICY}});
        if(!internal.isResolvedRuntimeCampaign(campaign))return failure(E.INVALID_RESOLVED_CAMPAIGN,'Resolved campaign contract is invalid.','$',null);
        return internal.result(true,campaign,null);
      }catch(error){var code=error&&knownCode(error.code)?error.code:E.RUNTIME_PUBLICATION_RESOLUTION_ERROR;return failure(code,'Runtime publication resolution failed.','$',{causeCode:error&&error.code?String(error.code):null,message:error&&error.message?String(error.message):null});}
    }
    return Object.freeze({resolveActiveCampaign:resolveActiveCampaign});
  }
  internal.createRuntimePublicationResolver=createRuntimePublicationResolver;
})();