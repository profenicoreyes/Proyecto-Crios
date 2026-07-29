/* CRIOS Runtime Missions - mission materializer */
(function(){
  'use strict';
  var internal=window.__CRIOS_RUNTIME_MISSION_INTERNAL__;if(!internal)throw new Error('Mission modules must load first.');var E=internal.constants.errorCodes;
  var MATERIALIZED_KEYS=['clasificacion','contenido','duracionEstimadaMinutos','ejemploProcedimiento','etiquetas','generar','handlerId','handlerVersion','id','mapa','mensajeAria','narrativa','nombreCorto','numero','tipoActividad','titulo'];
  function isMaterializedRuntimeMission(value){return internal.isPlainObject(value)&&internal.exactKeys(value,MATERIALIZED_KEYS)&&typeof value.id==='string'&&value.id.trim()&&typeof value.handlerId==='string'&&typeof value.handlerVersion==='string'&&typeof value.generar==='function'&&typeof value.contenido==='function'&&Object.isFrozen(value);}
  function createMissionMaterializer(options){
    var registry=options&&options.registry;if(!registry||typeof registry.get!=='function')throw new Error('A handler registry is required.');
    function validate(spec){var base=internal.validatePublishedMissionSpec(spec);if(!base.valid)return base;var handler=registry.get(spec.handlerId,spec.handlerVersion);if(!handler){var code=registry.list().some(function(item){return item.handlerId===spec.handlerId;})?E.MISSION_HANDLER_VERSION_UNSUPPORTED:E.MISSION_HANDLER_NOT_FOUND;return internal.validationResult([internal.issue(code,'$.handlerId','Exact handler is unavailable.')]);}return handler.validateSpec(spec);}
    function materialize(spec,context){
      var validation=validate(spec);if(!validation.valid)return internal.deepFreeze({success:false,mission:null,error:validation.issues[0],validation:validation});
      var before=JSON.stringify(spec);var handler=registry.get(spec.handlerId,spec.handlerVersion);var mission;
      try{mission=handler.materialize(spec,context||{});}catch(error){return internal.deepFreeze({success:false,mission:null,error:{code:error.code||E.MISSION_MATERIALIZATION_FAILED,severity:'ERROR',path:'$',message:String(error.message||error)},validation:validation});}
      if(JSON.stringify(spec)!==before)return internal.deepFreeze({success:false,mission:null,error:internal.issue(E.MISSION_MATERIALIZATION_FAILED,'$','Handler mutated the spec.'),validation:validation});
      if(!isMaterializedRuntimeMission(mission)||mission.id!==spec.missionId||mission.handlerId!==spec.handlerId||mission.handlerVersion!==spec.handlerVersion)return internal.deepFreeze({success:false,mission:null,error:internal.issue(E.MATERIALIZED_MISSION_INVALID,'$','Materialized mission contract is invalid.'),validation:validation});
      return internal.deepFreeze({success:true,mission:mission,error:null,validation:validation});
    }
    return Object.freeze({validate:validate,materialize:materialize});
  }
  internal.isMaterializedRuntimeMission=isMaterializedRuntimeMission;internal.createMissionMaterializer=createMissionMaterializer;
})();