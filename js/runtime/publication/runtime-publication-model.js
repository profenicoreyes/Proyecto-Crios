/* CRIOS Runtime Executable Publication - model and primitives */
(function(){
  'use strict';

  var internal=window.__CRIOS_RUNTIME_EXECUTABLE_PUBLICATION_INTERNAL__=window.__CRIOS_RUNTIME_EXECUTABLE_PUBLICATION_INTERNAL__||{};
  var ERROR_CODES=Object.freeze({
    INVALID_CAMPAIGN_ID:'INVALID_CAMPAIGN_ID',
    ACTIVE_REFERENCE_NOT_FOUND:'ACTIVE_REFERENCE_NOT_FOUND',
    ACTIVE_REFERENCE_MISMATCH:'ACTIVE_REFERENCE_MISMATCH',
    PUBLICATION_NOT_FOUND:'PUBLICATION_NOT_FOUND',
    PUBLICATION_IDENTITY_MISMATCH:'PUBLICATION_IDENTITY_MISMATCH',
    CONTENT_HASH_MISMATCH:'CONTENT_HASH_MISMATCH',
    UNSUPPORTED_RUNTIME_CONTRACT:'UNSUPPORTED_RUNTIME_CONTRACT',
    INVALID_EXECUTION_MANIFEST:'INVALID_EXECUTION_MANIFEST',
    MISSION_COUNT_MISMATCH:'MISSION_COUNT_MISMATCH',
    MISSION_ORDER_MISMATCH:'MISSION_ORDER_MISMATCH',
    DUPLICATE_MISSION_ID:'DUPLICATE_MISSION_ID',
    INVALID_MISSION_SPEC:'INVALID_MISSION_SPEC',
    HANDLER_NOT_AVAILABLE:'HANDLER_NOT_AVAILABLE',
    HANDLER_VERSION_NOT_AVAILABLE:'HANDLER_VERSION_NOT_AVAILABLE',
    MISSION_MATERIALIZATION_FAILED:'MISSION_MATERIALIZATION_FAILED',
    INVALID_FINAL_EVALUATION:'INVALID_FINAL_EVALUATION',
    INVALID_RESOLVED_CAMPAIGN:'INVALID_RESOLVED_CAMPAIGN',
    RUNTIME_PUBLICATION_RESOLUTION_ERROR:'RUNTIME_PUBLICATION_RESOLUTION_ERROR'
  });
  var CONSTANTS=Object.freeze({
    VERSION:'1.0.0',
    RUNTIME_CONTRACT_VERSION:'1.0.0',
    RNG_POLICY:'INJECTED_PER_MISSION_V1',
    errorCodes:ERROR_CODES
  });
  var CAMPAIGN_KEYS=['campaignId','contentHash','finalEvaluation','missionOrder','missions','publicationId','publicationVersion','requiredHandlers','resolutionMetadata','runtimeContractVersion'];
  var MISSION_KEYS=['handlerId','handlerVersion','materialization','missionId','missionIndex','publishedSpec'];
  var MATERIALIZATION_KEYS=['content','generatedState','mission'];
  var METADATA_KEYS=['handlerCount','missionCount','rngPolicy'];

  function isPlainObject(value){if(!value||typeof value!=='object'||Array.isArray(value))return false;var prototype=Object.getPrototypeOf(value);return prototype===Object.prototype||prototype===null;}
  function exactKeys(value,expected){if(!isPlainObject(value))return false;var actual=Object.keys(value).sort();var sorted=expected.slice().sort();return actual.length===sorted.length&&actual.every(function(key,index){return key===sorted[index];});}
  function clone(value,seen,path){
    var type=typeof value;
    if(value===null||type==='string'||type==='boolean')return value;
    if(type==='number'){if(!Number.isFinite(value))throw new Error('Non-finite number at '+path+'.');return value;}
    if(type!=='object')throw new Error('Non-serializable value at '+path+'.');
    if(seen.indexOf(value)>=0)throw new Error('Circular value at '+path+'.');
    if(!Array.isArray(value)&&!isPlainObject(value))throw new Error('Only plain objects are supported at '+path+'.');
    seen.push(value);var output=Array.isArray(value)?[]:{};
    Object.keys(value).forEach(function(key){output[key]=clone(value[key],seen,path+(Array.isArray(value)?'['+key+']':'.'+key));});
    seen.pop();return output;
  }
  function deepClone(value){return clone(value,[],'$');}
  function deepFreeze(value){if(!value||typeof value!=='object'||Object.isFrozen(value))return value;Object.keys(value).forEach(function(key){deepFreeze(value[key]);});return Object.freeze(value);}
  function frozenDeep(value){if(!value||typeof value!=='object')return true;return Object.isFrozen(value)&&Object.keys(value).every(function(key){return frozenDeep(value[key]);});}
  function frozenCopy(value){return deepFreeze(deepClone(value));}
  function nonEmpty(value){return typeof value==='string'&&value.trim()!=='';}
  function issue(code,message,path,metadata){return deepFreeze({code:String(code),message:String(message||code),path:String(path||'$'),metadata:metadata==null?null:deepClone(metadata)});}
  function result(success,campaign,error){return deepFreeze({success:Boolean(success),campaign:campaign==null?null:deepClone(campaign),error:error==null?null:deepClone(error)});}
  function validation(valid,issues){return deepFreeze({valid:Boolean(valid),issues:deepClone(issues||[])});}
  function serializable(value){try{deepClone(value);return true;}catch(ignore){return false;}}

  function isResolvedMission(value,index,order){
    if(!exactKeys(value,MISSION_KEYS)||value.missionIndex!==index||value.missionId!==order[index]||!nonEmpty(value.handlerId)||!nonEmpty(value.handlerVersion))return false;
    if(!exactKeys(value.publishedSpec,['handlerId','handlerVersion','missionId','payload']))return false;
    if(value.publishedSpec.missionId!==value.missionId||value.publishedSpec.handlerId!==value.handlerId||value.publishedSpec.handlerVersion!==value.handlerVersion)return false;
    if(!exactKeys(value.materialization,MATERIALIZATION_KEYS)||!isPlainObject(value.materialization.mission)||!isPlainObject(value.materialization.generatedState)||!isPlainObject(value.materialization.content))return false;
    if(value.materialization.mission.id!==value.missionId||value.materialization.mission.handlerId!==value.handlerId||value.materialization.mission.handlerVersion!==value.handlerVersion)return false;
    return serializable(value);
  }
  function isResolvedRuntimeCampaign(value){
    if(!exactKeys(value,CAMPAIGN_KEYS)||!nonEmpty(value.campaignId)||!nonEmpty(value.publicationId)||!Number.isInteger(value.publicationVersion)||value.publicationVersion<=0||!/^[0-9a-f]{64}$/.test(value.contentHash)||value.runtimeContractVersion!==CONSTANTS.RUNTIME_CONTRACT_VERSION)return false;
    if(!Array.isArray(value.requiredHandlers)||!Array.isArray(value.missionOrder)||!Array.isArray(value.missions)||value.missionOrder.length!==value.missions.length)return false;
    var handlerKeys={};for(var handlerIndex=0;handlerIndex<value.requiredHandlers.length;handlerIndex+=1){var handler=value.requiredHandlers[handlerIndex];if(!exactKeys(handler,['handlerId','handlerVersion'])||!nonEmpty(handler.handlerId)||!nonEmpty(handler.handlerVersion))return false;var handlerKey=handler.handlerId+'@'+handler.handlerVersion;if(handlerKeys[handlerKey])return false;handlerKeys[handlerKey]=true;}
    var missionIds={};for(var orderIndex=0;orderIndex<value.missionOrder.length;orderIndex+=1){if(!nonEmpty(value.missionOrder[orderIndex])||missionIds[value.missionOrder[orderIndex]])return false;missionIds[value.missionOrder[orderIndex]]=true;}
    if(!exactKeys(value.resolutionMetadata,METADATA_KEYS)||value.resolutionMetadata.missionCount!==value.missions.length||value.resolutionMetadata.handlerCount!==value.requiredHandlers.length||value.resolutionMetadata.rngPolicy!==CONSTANTS.RNG_POLICY)return false;
    if(!isPlainObject(value.finalEvaluation)||!serializable(value))return false;
    var usedHandlerKeys={};for(var index=0;index<value.missions.length;index+=1){if(!isResolvedMission(value.missions[index],index,value.missionOrder)||!handlerKeys[value.missions[index].handlerId+'@'+value.missions[index].handlerVersion])return false;usedHandlerKeys[value.missions[index].handlerId+'@'+value.missions[index].handlerVersion]=true;}
    if(Object.keys(usedHandlerKeys).length!==Object.keys(handlerKeys).length)return false;
    return frozenDeep(value);
  }

  internal.constants=CONSTANTS;
  internal.isPlainObject=isPlainObject;
  internal.exactKeys=exactKeys;
  internal.deepClone=deepClone;
  internal.deepFreeze=deepFreeze;
  internal.frozenDeep=frozenDeep;
  internal.frozenCopy=frozenCopy;
  internal.nonEmpty=nonEmpty;
  internal.issue=issue;
  internal.result=result;
  internal.validation=validation;
  internal.isResolvedRuntimeCampaign=isResolvedRuntimeCampaign;
})();