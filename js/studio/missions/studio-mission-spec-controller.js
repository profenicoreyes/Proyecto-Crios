/* CRIOS Studio - mission spec controller */
(function(){
  'use strict';
  var STATUS=Object.freeze({IDLE:'IDLE',VALIDATING:'VALIDATING',READY:'READY',INVALID:'INVALID',ERROR:'ERROR'});
  function freeze(value){if(!value||typeof value!=='object'||Object.isFrozen(value))return value;Object.keys(value).forEach(function(key){freeze(value[key]);});return Object.freeze(value);}
  function copy(value){return value==null?value:JSON.parse(JSON.stringify(value));}
  function createStudioMissionSpecController(options){
    var draftApi=options&&options.draftApi;var adapter=options&&options.adapter;var onStateChange=options&&typeof options.onStateChange==='function'?options.onStateChange:function(){};
    if(!draftApi||!adapter)throw new Error('Draft API and mission spec adapter are required.');
    var state={status:STATUS.IDLE,busy:false,missionCount:0,validSpecCount:0,invalidSpecCount:0,requiredHandlers:[],manifest:null,issues:[],lastValidation:null};
    function snapshot(){return typeof draftApi.getCampaign==='function'?draftApi.getCampaign():draftApi.obtenerCampana();}
    function update(result,status){var missionCount=result&&result.manifest?result.manifest.missionCount:((snapshot().misiones||[]).length);var validCount=result&&result.specs?result.specs.length:0;state={status:status,busy:false,missionCount:missionCount,validSpecCount:validCount,invalidSpecCount:Math.max(0,missionCount-validCount),requiredHandlers:result&&result.manifest?copy(result.manifest.requiredHandlers):[],manifest:result&&result.manifest?copy(result.manifest):null,issues:result?copy(result.issues):[],lastValidation:result?copy(result):null};onStateChange();return result;}
    function validateCurrentDraft(){state=Object.assign({},state,{status:STATUS.VALIDATING,busy:true});onStateChange();try{var result=adapter.validateAndAdapt(snapshot());return update(result,result.valid?STATUS.READY:STATUS.INVALID);}catch(error){return update({valid:false,issues:[{code:error.code||'MISSION_SPEC_VALIDATION_FAILED',severity:'ERROR',path:'$',message:error.message}],specs:null,manifest:null,finalEvaluation:null,snapshot:null},STATUS.ERROR);}}
    function current(){return state.lastValidation||validateCurrentDraft();}
    function listCurrentSpecs(){var result=current();return freeze(copy(result.specs||[]));}
    function getCurrentSpec(missionId){var id=String(missionId||'');var found=listCurrentSpecs().filter(function(spec){return spec.missionId===id;})[0];return found?freeze(copy(found)):null;}
    function getExecutionManifest(){var result=current();return result.manifest?freeze(copy(result.manifest)):null;}
    function getState(){return freeze(copy(state));}
    return Object.freeze({validateCurrentDraft:validateCurrentDraft,listCurrentSpecs:listCurrentSpecs,getCurrentSpec:getCurrentSpec,getExecutionManifest:getExecutionManifest,getState:getState});
  }
  window.CRIOS_STUDIO_MISSION_SPEC_CONTROLLER=Object.freeze({createStudioMissionSpecController:createStudioMissionSpecController,status:STATUS});
})();