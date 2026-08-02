/* CRIOS Runtime — launch selection policy */
(function(){
  'use strict';

  var VERSION='1.0.0';
  var ERROR_CODES=Object.freeze({
    LAUNCH_CONTRACT_UNAVAILABLE:'LAUNCH_CONTRACT_UNAVAILABLE',
    INVALID_RUNTIME_CAMPAIGN_MODE:'INVALID_RUNTIME_CAMPAIGN_MODE'
  });
  var KEYS=['explicit','blocked','sourceMode','campaignId','error'];
  var ERROR_KEYS=['code','message','parameter'];

  function isPlainObject(value){
    if(!value||typeof value!=='object'||Array.isArray(value))return false;
    var prototype=Object.getPrototypeOf(value);
    return prototype===Object.prototype||prototype===null;
  }
  function exactKeys(value,expected){
    if(!isPlainObject(value))return false;
    var actual=Object.keys(value).sort();
    var sorted=expected.slice().sort();
    return actual.length===sorted.length&&actual.every(function(key,index){return key===sorted[index];});
  }
  function createError(code,message,parameter){
    return Object.freeze({code:String(code),message:String(message||code),parameter:parameter==null?null:String(parameter)});
  }
  function createSelection(explicit,blocked,sourceMode,campaignId,error){
    return Object.freeze({
      explicit:Boolean(explicit),
      blocked:Boolean(blocked),
      sourceMode:sourceMode==null?null:String(sourceMode),
      campaignId:campaignId==null?null:String(campaignId),
      error:error==null?null:error
    });
  }
  function knownLaunchParameters(search){
    return /(?:^|[?&])(?:source|campaignId)(?:=|&|$)/.test(search==null?'':String(search));
  }
  function validMode(value){return value==='legacy'||value==='published';}
  function blocked(error){return createSelection(false,true,null,null,error);}

  function selectRuntimeLaunch(configuredMode,search,launchApi){
    var api=arguments.length>=3?launchApi:(window.CRIOS_RUNTIME_LAUNCH||null);
    var query=search==null?'':String(search);

    if(!api||typeof api.resolveLaunchRequest!=='function'){
      if(knownLaunchParameters(query)){
        return blocked(createError(ERROR_CODES.LAUNCH_CONTRACT_UNAVAILABLE,'Launch contract is unavailable.',null));
      }
      if(!validMode(configuredMode)){
        return blocked(createError(ERROR_CODES.INVALID_RUNTIME_CAMPAIGN_MODE,'Configured runtime campaign mode is invalid.',null));
      }
      return createSelection(false,false,configuredMode,null,null);
    }

    var resolution=api.resolveLaunchRequest(query);
    if(!resolution||!resolution.success){
      return blocked(resolution&&resolution.error?resolution.error:createError(ERROR_CODES.LAUNCH_CONTRACT_UNAVAILABLE,'Launch request could not be resolved.',null));
    }

    var request=resolution.request;
    var selectedMode=request.explicit?request.sourceMode:configuredMode;
    if(!validMode(selectedMode)){
      return blocked(createError(ERROR_CODES.INVALID_RUNTIME_CAMPAIGN_MODE,'Configured runtime campaign mode is invalid.',null));
    }

    return createSelection(
      request.explicit,
      false,
      selectedMode,
      request.explicit&&selectedMode==='published'?request.campaignId:null,
      null
    );
  }

  function isRuntimeLaunchSelection(value){
    if(!exactKeys(value,KEYS)||!Object.isFrozen(value))return false;
    if(typeof value.explicit!=='boolean'||typeof value.blocked!=='boolean')return false;
    if(value.blocked){
      return value.sourceMode===null&&value.campaignId===null&&value.explicit===false&&
        exactKeys(value.error,ERROR_KEYS)&&Object.isFrozen(value.error)&&typeof value.error.code==='string';
    }
    if(value.error!==null||!validMode(value.sourceMode))return false;
    if(value.sourceMode==='published'&&value.explicit)return typeof value.campaignId==='string'&&value.campaignId.length>0;
    return value.campaignId===null;
  }

  window.CRIOS_RUNTIME_LAUNCH_SELECTION=Object.freeze({
    version:VERSION,
    errorCodes:ERROR_CODES,
    selectRuntimeLaunch:selectRuntimeLaunch,
    isRuntimeLaunchSelection:isRuntimeLaunchSelection
  });
})();
