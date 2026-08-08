/* CRIOS Runtime - controlled bootstrap adapter */
(function(){
  'use strict';

  var registerDomainModule=window.__CRIOS_REGISTER_DOMAIN_MODULE__;
  if(typeof registerDomainModule!=='function')throw new Error('No se pudo registrar RuntimeBootstrapAdapter: registrador de composicion no disponible.');

  var VERSION='1.0.0';
  var MODES=Object.freeze(['legacy','published']);
  function isObject(value){return Boolean(value)&&typeof value==='object'&&!Array.isArray(value);}
  function clone(value){if(value===null||typeof value==='string'||typeof value==='boolean')return value;if(typeof value==='number'){if(!Number.isFinite(value))throw new Error('NON_FINITE_VALUE');return value;}if(Array.isArray(value))return value.map(clone);if(!isObject(value))throw new Error('UNSUPPORTED_VALUE');var output={};Object.keys(value).forEach(function(key){output[key]=clone(value[key]);});return output;}
  function freeze(value){if(!value||typeof value!=='object'||Object.isFrozen(value))return value;Object.keys(value).forEach(function(key){freeze(value[key]);});return Object.freeze(value);}
  function copy(value){return freeze(clone(value));}
  function error(code,path,metadata){return freeze({code:String(code||'RUNTIME_BOOTSTRAP_ERROR'),path:path||'$',metadata:metadata?clone(metadata):null});}
  function failure(code,path,metadata){return freeze({success:false,campaign:null,error:error(code,path,metadata)});}
  function emit(callback,type,payload){if(typeof callback!=='function')return;var allowed=['mode','phase','campaignId','publicationId','publicationVersion','contentHash','missionId','code','result'];var safe={};allowed.forEach(function(key){if(payload&&payload[key]!==undefined&&payload[key]!==null)safe[key]=payload[key];});try{callback('bootstrap-runtime:'+type,freeze(safe));}catch(ignore){}}
  function text(value){return typeof value==='string'?value.trim():'';}
  function mode(value){return MODES.indexOf(value)>=0?value:null;}
  function hashSeed(parts){var value=parts.join('\u001f');var hash=2166136261;for(var index=0;index<value.length;index+=1){hash^=value.charCodeAt(index);hash=Math.imul(hash,16777619);}return hash>>>0;}
  function createRng(parts){var state=hashSeed(parts)||0x6d2b79f5;return function(){state=(state+0x6d2b79f5)>>>0;var value=state;value=Math.imul(value^(value>>>15),value|1);value^=value+Math.imul(value^(value>>>7),value|61);return((value^(value>>>14))>>>0)/4294967296;};}
  function select(values,rng){if(!Array.isArray(values)||!values.length)return null;var value=rng();if(typeof value!=='number'||!Number.isFinite(value)||value<0||value>=1)return null;return values[Math.floor(value*values.length)];}
  function campaignMetadata(publication,resolved){var content=publication.content||{};return {sourceMode:'published',campaignId:resolved.campaignId,id:resolved.campaignId,publicationId:resolved.publicationId,publicationVersion:resolved.publicationVersion,contentHash:resolved.contentHash,runtimeContractVersion:resolved.runtimeContractVersion,titulo:text(content.nombre)||resolved.campaignId,descripcion:text(content.descripcion),escenario:text(content.escenario)||'antartida',clasificacion:isObject(content.clasificacion)?clone(content.clasificacion):{}};}
  function validateFinalEvaluation(value,rng){
    if(!isObject(value)||Object.keys(value).sort().join(',')!=='adjustments,instruction,responseType,rngPolicy,unit')return failure('FINAL_EVALUATION_INCOMPATIBLE','$.finalEvaluation',null);
    if(value.responseType!=='NUMERIC_WITH_PROCEDURE'||value.rngPolicy!=='SEEDED_SEQUENCE_V1'||!text(value.unit)||!text(value.instruction)||!Array.isArray(value.adjustments)||value.adjustments.length!==2)return failure('FINAL_EVALUATION_INCOMPATIBLE','$.finalEvaluation',null);
    var add=null;var subtract=null;
    for(var index=0;index<value.adjustments.length;index+=1){var adjustment=value.adjustments[index];if(!isObject(adjustment)||Object.keys(adjustment).sort().join(',')!=='name,operation,values'||!text(adjustment.name)||!Array.isArray(adjustment.values)||!adjustment.values.length||adjustment.values.some(function(item){return typeof item!=='number'||!Number.isFinite(item);}))return failure('FINAL_EVALUATION_INCOMPATIBLE','$.finalEvaluation.adjustments['+index+']',null);if(adjustment.operation==='add'&&!add)add=adjustment;else if(adjustment.operation==='subtract'&&!subtract)subtract=adjustment;else return failure('FINAL_EVALUATION_INCOMPATIBLE','$.finalEvaluation.adjustments['+index+'].operation',null);}
    if(!add||!subtract)return failure('FINAL_EVALUATION_INCOMPATIBLE','$.finalEvaluation.adjustments',null);
    var addValue=select(add.values,rng);var subtractValue=select(subtract.values,rng);if(addValue===null||subtractValue===null)return failure('RNG_INVALID','$.rngFactory.finalEvaluation',null);
    return {success:true,value:freeze({responseType:value.responseType,rngPolicy:value.rngPolicy,unit:value.unit,instruction:value.instruction,add:{name:add.name,value:addValue},subtract:{name:subtract.name,value:subtractValue}})};
  }
  function missionData(item,resolved){return {missionId:item.missionId,position:item.missionIndex,handlerId:item.handlerId,handlerVersion:item.handlerVersion,publicationId:resolved.publicationId,contentHash:resolved.contentHash,publishedSpec:clone(item.publishedSpec),materialization:clone(item.materialization)};}
  function bridgeMission(item){var metadata=clone(item.materialization.mission);var generated=clone(item.materialization.generatedState);var content=clone(item.materialization.content);var bridge={};Object.keys(metadata).forEach(function(key){bridge[key]=metadata[key];});bridge.generar=function(){return clone(generated);};bridge.contenido=function(){return clone(content);};return Object.freeze(bridge);}
  function buildPrepared(publication,resolved,finalEvaluation){
    var metadata=campaignMetadata(publication,resolved);var structuralMissions=resolved.missions.map(function(item){return missionData(item,resolved);});var bridgeMissions=resolved.missions.map(bridgeMission);var byId={};bridgeMissions.forEach(function(item){byId[item.id]=item;});
    var data=copy({sourceMode:'published',campaign:metadata,missionOrder:resolved.missionOrder,missions:structuralMissions,finalEvaluation:finalEvaluation,progressKey:resolved.campaignId+'@'+resolved.publicationId+'@'+resolved.contentHash});
    var bridge=Object.freeze({missions:Object.freeze(bridgeMissions),missionById:Object.freeze(byId),finalEvaluation:Object.freeze({adjustPlus:finalEvaluation.add.value,adjustMinus:finalEvaluation.subtract.value})});
    return Object.freeze({version:VERSION,data:data,bridge:bridge});
  }
  function isPreparedRuntimeCampaign(value){return Boolean(value&&value.version===VERSION&&value.data&&Object.isFrozen(value.data)&&value.bridge&&Array.isArray(value.bridge.missions)&&value.data.missionOrder.length===value.bridge.missions.length&&value.data.missions.every(function(item,index){return item.missionId===value.data.missionOrder[index]&&value.bridge.missions[index].id===item.missionId;}));}
  function prepareLegacyCampaign(options){var campaign=options&&options.campaign;var missions=options&&options.missions;if(!isObject(campaign)||!Array.isArray(missions))return failure('LEGACY_CAMPAIGN_INVALID','$',null);return freeze({success:true,campaign:Object.freeze({version:VERSION,data:copy({sourceMode:'legacy',campaign:clone(campaign),missionOrder:missions.map(function(item){return item.id;})}),bridge:Object.freeze({missions:Object.freeze(missions.slice())})}),error:null});}
  function hasOwn(value,key){return Boolean(value&&Object.prototype.hasOwnProperty.call(value,key));}
  function validReaders(value){return Boolean(value&&typeof value.activeReferenceReader==='function'&&typeof value.publicationReader==='function');}
  function baseDependencies(options){return Boolean(options&&options.runtimePublicationApi&&options.publicationCore&&options.missionHandlersApi);}
  function codedError(code,message){var value=new Error(String(message||code));value.code=String(code);return value;}
  function contextParts(identity,publication,missionId,index){return [text(identity),publication.campaignId,publication.publicationId,String(publication.version),publication.contentHash,missionId,String(index)];}
  async function prepare(options,fixedIdentity){
    var telemetry=options&&options.telemetry;var selectedMode=mode(options&&options.mode);emit(telemetry,'mode-selected',{mode:options&&options.mode,result:selectedMode?'accepted':'blocked'});if(selectedMode!=='published')return failure(selectedMode?'MODE_NOT_PUBLISHED':'INVALID_RUNTIME_CAMPAIGN_MODE','$.mode',null);
    var campaignId=text(options&&options.campaignId);var requestedPublicationId=text(options&&options.publicationId);var identity=text(options&&options.identity);
    if(!campaignId)return failure('INVALID_CAMPAIGN_ID','$.campaignId',null);
    if(!requestedPublicationId)return failure('INVALID_PUBLICATION_ID','$.publicationId',null);
    if(!identity)return failure('INVALID_STUDENT_IDENTITY','$.identity',null);
    if(!baseDependencies(options))return failure('BOOTSTRAP_DEPENDENCY_MISSING','$.dependencies',null);
    var pinned=fixedIdentity||null;
    if(pinned&&text(pinned.publicationId)!==requestedPublicationId)return failure('PINNED_PUBLICATION_MISMATCH','$.pinnedPublication.publicationId',{expected:requestedPublicationId,actual:text(pinned.publicationId)});
    var sourceReaders=null;var coordinator=null;var explicitReaders=hasOwn(options,'publicationReaders');
    if(explicitReaders){
      if(!validReaders(options.publicationReaders))return failure('BOOTSTRAP_DEPENDENCY_MISSING','$.publicationReaders',null);
      sourceReaders=options.publicationReaders;
    }else{
      if(!options.persistenceApi||typeof options.persistenceApi.createPersistenceCoordinator!=='function')return failure('BOOTSTRAP_DEPENDENCY_MISSING','$.dependencies.persistenceApi',null);
      try{coordinator=options.persistenceApi.createPersistenceCoordinator(options.persistenceOptions||{});}catch(cause){return failure('PERSISTENCE_COORDINATOR_UNAVAILABLE','$.persistence',null);}
      if(!coordinator||!coordinator.activationStore||!coordinator.publicationStore||typeof coordinator.activationStore.getActiveReference!=='function'||typeof coordinator.publicationStore.getPublication!=='function')return failure('PERSISTENCE_COORDINATOR_UNAVAILABLE','$.persistence',null);
      sourceReaders={
        activeReferenceReader:function(id){return coordinator.activationStore.getActiveReference(id);},
        publicationReader:function(publicationId){return coordinator.publicationStore.getPublication(publicationId);}
      };
    }
    var publication=null;
    var referenceReader=async function(id){
      var reference;
      if(pinned){
        reference={campaignId:pinned.campaignId,publicationId:pinned.publicationId,version:pinned.publicationVersion,contentHash:pinned.contentHash};
      }else{
        reference=await sourceReaders.activeReferenceReader(id);
      }
      if(reference&&text(reference.publicationId)!==requestedPublicationId)throw codedError('PUBLICATION_IDENTITY_MISMATCH','Active publication does not match requested publicationId.');
      emit(telemetry,'active-reference-read',{mode:'published',campaignId:id,publicationId:reference&&reference.publicationId,result:reference?'found':'missing'});
      return reference;
    };
    var publicationReader=async function(publicationId){
      if(text(publicationId)!==requestedPublicationId)throw codedError('PUBLICATION_IDENTITY_MISMATCH','Resolver requested a publication outside the launch identity.');
      publication=await sourceReaders.publicationReader(publicationId,campaignId);
      emit(telemetry,'publication-read',{mode:'published',campaignId:campaignId,publicationId:publicationId,publicationVersion:publication&&publication.version,contentHash:publication&&publication.contentHash,result:publication?'found':'missing'});
      return publication;
    };
    var rngFactory=function(missionId,index,publicationValue){return createRng(contextParts(identity,publicationValue,missionId,index));};
    emit(telemetry,pinned?'recovery-started':'resolution-started',{mode:'published',campaignId:campaignId,publicationId:requestedPublicationId});
    var resolver;var result;try{resolver=options.runtimePublicationApi.createRuntimePublicationResolver({activeReferenceReader:referenceReader,publicationReader:publicationReader,publicationCore:options.publicationCore,missionHandlersApi:options.missionHandlersApi,rngFactory:rngFactory});result=await resolver.resolveActiveCampaign(campaignId);}catch(cause){result={success:false,error:{code:'RUNTIME_BOOTSTRAP_ERROR',path:'$'}};}
    if(!result||!result.success){var causeError=result&&result.error||{code:'RUNTIME_BOOTSTRAP_ERROR',path:'$'};emit(telemetry,'blocked',{mode:'published',phase:pinned?'recovery':'resolution',campaignId:campaignId,publicationId:requestedPublicationId,code:causeError.code,result:'blocked'});return failure(causeError.code,causeError.path,causeError.metadata);}
    var resolved=result.campaign;emit(telemetry,'publication-resolved',{mode:'published',campaignId:resolved.campaignId,publicationId:resolved.publicationId,publicationVersion:resolved.publicationVersion,contentHash:resolved.contentHash,result:'resolved'});
    if(resolved.publicationId!==requestedPublicationId)return failure('PUBLICATION_IDENTITY_MISMATCH','$.publicationId',{expected:requestedPublicationId,actual:resolved.publicationId});
    if(pinned&&(resolved.publicationId!==pinned.publicationId||resolved.publicationVersion!==pinned.publicationVersion||resolved.contentHash!==pinned.contentHash||resolved.runtimeContractVersion!==pinned.runtimeContractVersion))return failure('PINNED_PUBLICATION_MISMATCH','$.pinnedPublication',null);
    var finalRng=createRng(contextParts(identity,publication,'finalEvaluation',-1));var finalResult=validateFinalEvaluation(resolved.finalEvaluation,finalRng);if(!finalResult.success){emit(telemetry,'blocked',{mode:'published',phase:'final-evaluation',campaignId:campaignId,publicationId:resolved.publicationId,code:finalResult.error.code,result:'blocked'});return finalResult;}
    var prepared;try{prepared=buildPrepared(publication,resolved,finalResult.value);}catch(cause){return failure('CAMPAIGN_ADAPTATION_FAILED','$.campaign',null);}if(!isPreparedRuntimeCampaign(prepared))return failure('PREPARED_CAMPAIGN_INVALID','$',null);
    emit(telemetry,'campaign-adapted',{mode:'published',campaignId:resolved.campaignId,publicationId:resolved.publicationId,publicationVersion:resolved.publicationVersion,contentHash:resolved.contentHash,result:'adapted'});emit(telemetry,pinned?'recovery-completed':'completed',{mode:'published',campaignId:resolved.campaignId,publicationId:resolved.publicationId,publicationVersion:resolved.publicationVersion,contentHash:resolved.contentHash,result:'completed'});return freeze({success:true,campaign:prepared,error:null});
  }
  function preparePublishedCampaign(options){return prepare(options,null);}
  function recoverPublishedCampaign(options){var pinned=options&&options.pinnedPublication;if(!isObject(pinned))return Promise.resolve(failure('PINNED_PUBLICATION_INVALID','$.pinnedPublication',null));return prepare(options,pinned);}

  registerDomainModule('runtimeBootstrapAdapter',Object.freeze({version:VERSION,prepareLegacyCampaign:prepareLegacyCampaign,preparePublishedCampaign:preparePublishedCampaign,recoverPublishedCampaign:recoverPublishedCampaign,isPreparedRuntimeCampaign:isPreparedRuntimeCampaign}));
})();
