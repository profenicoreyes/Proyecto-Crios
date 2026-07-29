/* CRIOS Studio - executable mission publication adapter */
(function(){
  'use strict';

  function isPlainObject(value){if(!value||typeof value!=='object'||Array.isArray(value))return false;var prototype=Object.getPrototypeOf(value);return prototype===Object.prototype||prototype===null;}
  function clone(value,seen,path){var kind=typeof value;if(value===null||kind==='string'||kind==='boolean')return value;if(kind==='number'){if(!Number.isFinite(value))throw new Error('Non-finite number at '+path+'.');return value;}if(kind==='undefined'||kind==='function'||kind==='symbol'||kind==='bigint')throw new Error('Unsupported value at '+path+'.');if(seen.indexOf(value)>=0)throw new Error('Circular value at '+path+'.');if(!Array.isArray(value)&&!isPlainObject(value))throw new Error('Only plain data is allowed at '+path+'.');seen.push(value);var output=Array.isArray(value)?[]:{};Object.keys(value).forEach(function(key){output[key]=clone(value[key],seen,path+'.'+key);});seen.pop();return output;}
  function deepClone(value){return clone(value,[],'$');}
  function deepFreeze(value){if(!value||typeof value!=='object'||Object.isFrozen(value))return value;Object.keys(value).forEach(function(key){deepFreeze(value[key]);});return Object.freeze(value);}
  function issue(code,path,message){return deepFreeze({code:code,severity:'ERROR',path:path,message:message});}
  function result(valid,issues,specs,manifest,finalEvaluation,snapshot){return deepFreeze({valid:valid,issues:issues.slice(),specs:specs?deepClone(specs):null,manifest:manifest?deepClone(manifest):null,finalEvaluation:finalEvaluation?deepClone(finalEvaluation):null,snapshot:snapshot?deepClone(snapshot):null});}

  function validateFinalEvaluation(value){
    var issues=[];
    if(!isPlainObject(value)){issues.push(issue('FINAL_EVALUATION_INVALID','$.finalEvaluation','Final evaluation must be a plain object.'));return issues;}
    var keys=Object.keys(value).sort().join(',');
    if(keys!=='adjustments,instruction,responseType,rngPolicy,unit')issues.push(issue('FINAL_EVALUATION_INVALID','$.finalEvaluation','Final evaluation keys are invalid.'));
    if(value.responseType!=='NUMERIC_WITH_PROCEDURE')issues.push(issue('FINAL_EVALUATION_INVALID','$.finalEvaluation.responseType','Unsupported response type.'));
    if(value.rngPolicy!=='SEEDED_SEQUENCE_V1')issues.push(issue('FINAL_EVALUATION_INVALID','$.finalEvaluation.rngPolicy','Unsupported RNG policy.'));
    if(typeof value.unit!=='string'||!value.unit.trim())issues.push(issue('FINAL_EVALUATION_INVALID','$.finalEvaluation.unit','Unit is required.'));
    if(typeof value.instruction!=='string'||!value.instruction.trim())issues.push(issue('FINAL_EVALUATION_INVALID','$.finalEvaluation.instruction','Instruction is required.'));
    if(!Array.isArray(value.adjustments)||value.adjustments.length!==2){issues.push(issue('FINAL_EVALUATION_INVALID','$.finalEvaluation.adjustments','Exactly two final adjustments are required.'));return issues;}
    var names={};value.adjustments.forEach(function(adjustment,index){var path='$.finalEvaluation.adjustments['+index+']';if(!isPlainObject(adjustment)||Object.keys(adjustment).sort().join(',')!=='name,operation,values'){issues.push(issue('FINAL_EVALUATION_INVALID',path,'Adjustment shape is invalid.'));return;}if(typeof adjustment.name!=='string'||!/^[A-Za-z][A-Za-z0-9_]*$/.test(adjustment.name)||names[adjustment.name])issues.push(issue('FINAL_EVALUATION_INVALID',path+'.name','Adjustment name is invalid or duplicated.'));names[adjustment.name]=true;if(['add','subtract'].indexOf(adjustment.operation)<0)issues.push(issue('FINAL_EVALUATION_INVALID',path+'.operation','Adjustment operation is invalid.'));if(!Array.isArray(adjustment.values)||!adjustment.values.length||adjustment.values.some(function(item){return!Number.isFinite(item);}))issues.push(issue('FINAL_EVALUATION_INVALID',path+'.values','Adjustment values must be finite and non-empty.'));});
    return issues;
  }

  function createStudioMissionSpecAdapter(options){
    var runtime=options&&options.runtime;
    var catalog=options&&options.catalog;
    if(!runtime||!catalog)throw new Error('Runtime handlers and migration catalog are required.');
    var materializer=runtime.createMissionMaterializer();

    function validateAndAdapt(snapshot){
      var issues=[];var specs=[];var ids={};var source;
      try{source=deepClone(snapshot);}catch(error){return result(false,[issue('MISSION_SPEC_INVALID','$',error.message)],null,null,null,null);}
      if(!isPlainObject(source)||!Array.isArray(source.misiones)){return result(false,[issue('EXECUTION_MANIFEST_INVALID','$.misiones','Draft missions are required.')],null,null,null,null);}
      source.misiones.forEach(function(mission,index){
        var path='$.misiones['+index+']';var missionId=mission&&mission.id!=null?String(mission.id):'';
        if(!missionId){issues.push(issue('MISSION_SPEC_MISSING',path+'.id','Mission id is required.'));return;}
        if(ids[missionId]){issues.push(issue('MISSION_ID_DUPLICATE',path+'.id','Mission id is duplicated.'));return;}ids[missionId]=true;
        var ownsSpec=mission&&Object.prototype.hasOwnProperty.call(mission,'missionSpec');
        var spec=ownsSpec?mission.missionSpec:null;
        if(ownsSpec&&!spec){issues.push(issue('MISSION_SPEC_MISSING',path+'.missionSpec','Mission spec is missing.'));return;}
        if(!ownsSpec){try{spec=catalog.get(missionId);}catch(error){issues.push(issue('MISSION_SPEC_MISSING',path+'.missionSpec','Mission spec is missing.'));return;}}
        var structural=runtime.validatePublishedMissionSpec(spec);
        if(!structural.valid){structural.issues.forEach(function(item){issues.push(issue(item.code,path+'.missionSpec'+item.path.slice(1),item.message));});return;}
        if(!spec.handlerId){issues.push(issue('MISSION_HANDLER_ID_MISSING',path+'.missionSpec.handlerId','Handler id is required.'));return;}
        if(!spec.handlerVersion){issues.push(issue('MISSION_HANDLER_VERSION_MISSING',path+'.missionSpec.handlerVersion','Handler version is required.'));return;}
        if(!runtime.has(spec.handlerId,spec.handlerVersion)){issues.push(issue('MISSION_HANDLER_NOT_FOUND',path+'.missionSpec.handlerId','Exact handler is unavailable.'));return;}
        var payloadValidation=materializer.validate(spec);
        if(!payloadValidation.valid){payloadValidation.issues.forEach(function(item){issues.push(issue(item.code,path+'.missionSpec'+item.path.slice(1),item.message));});return;}
        if(spec.missionId!==missionId){issues.push(issue('MISSION_ORDER_INCOHERENT',path+'.missionSpec.missionId','Spec missionId does not match draft order.'));return;}
        specs.push(runtime.createPublishedMissionSpec(spec).spec);
      });
      Array.prototype.push.apply(issues,validateFinalEvaluation(source.finalEvaluation));
      if(issues.length)return result(false,issues,specs,null,source.finalEvaluation,null);
      var requiredHandlers=[];var handlerKeys={};specs.forEach(function(spec){var key=spec.handlerId+'@'+spec.handlerVersion;if(!handlerKeys[key]){handlerKeys[key]=true;requiredHandlers.push({handlerId:spec.handlerId,handlerVersion:spec.handlerVersion});}});
      var missionOrder=source.misiones.map(function(mission){return String(mission.id);});
      var manifest={runtimeContractVersion:'1.0.0',requiredHandlers:requiredHandlers,missionCount:specs.length,missionOrder:missionOrder};
      if(manifest.missionCount!==missionOrder.length||specs.some(function(spec,index){return spec.missionId!==missionOrder[index];}))return result(false,[issue('EXECUTION_MANIFEST_INVALID','$.runtimeExecutionManifest','Manifest and specs are incoherent.')],specs,manifest,source.finalEvaluation,null);
      source.misiones=source.misiones.map(function(mission){var copy=deepClone(mission);delete copy.missionSpec;return copy;});
      source.missionSpecs=deepClone(specs);
      source.runtimeExecutionManifest=deepClone(manifest);
      source.finalEvaluation=deepClone(source.finalEvaluation);
      return result(true,[],specs,manifest,source.finalEvaluation,source);
    }

    function adaptSnapshot(snapshot){return validateAndAdapt(snapshot);}
    return Object.freeze({validateAndAdapt:validateAndAdapt,adaptSnapshot:adaptSnapshot});
  }

  window.CRIOS_STUDIO_MISSION_SPEC_ADAPTER=Object.freeze({createStudioMissionSpecAdapter:createStudioMissionSpecAdapter});
})();