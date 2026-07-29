/* CRIOS Runtime Missions - public API */
(function(){
  'use strict';
  var internal=window.__CRIOS_RUNTIME_MISSION_INTERNAL__;
  if(!internal||typeof internal.createMissionMaterializer!=='function')throw new Error('Mission materializer must load before API.');
  var defaultRegistry=internal.createRuntimeMissionHandlerRegistry();
  defaultRegistry.register(internal.createDeclarativeAreaHandler());
  defaultRegistry.seal();
  function createMissionMaterializer(options){var opts=options&&typeof options==='object'?options:{};return internal.createMissionMaterializer({registry:opts.registry||defaultRegistry});}
  var api={version:'1.0.0',constants:internal.constants,createPublishedMissionSpec:internal.createPublishedMissionSpec,validatePublishedMissionSpec:internal.validatePublishedMissionSpec,isPublishedMissionSpec:internal.isPublishedMissionSpec,createRuntimeMissionHandlerRegistry:internal.createRuntimeMissionHandlerRegistry,createMissionMaterializer:createMissionMaterializer,evaluateExpression:internal.evaluateExpression,isMaterializedRuntimeMission:internal.isMaterializedRuntimeMission,has:function(id,version){return defaultRegistry.has(id,version);},get:function(id,version){return defaultRegistry.get(id,version);},list:function(){return defaultRegistry.list();}};
  window.CRIOS_RUNTIME_MISSION_HANDLERS=internal.deepFreeze(api);
  try{delete window.__CRIOS_RUNTIME_MISSION_INTERNAL__;}catch(ignore){}
})();