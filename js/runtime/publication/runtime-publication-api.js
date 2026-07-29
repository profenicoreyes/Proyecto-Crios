/* CRIOS Runtime Executable Publication - public API */
(function(){
  'use strict';
  var internal=window.__CRIOS_RUNTIME_EXECUTABLE_PUBLICATION_INTERNAL__;
  if(!internal||typeof internal.createRuntimePublicationResolver!=='function')throw new Error('Runtime publication resolver must load before API.');
  var api={version:'1.0.0',constants:internal.constants,validateExecutablePublication:internal.validateExecutablePublication,createRuntimePublicationResolver:internal.createRuntimePublicationResolver,isResolvedRuntimeCampaign:internal.isResolvedRuntimeCampaign};
  window.CRIOS_RUNTIME_EXECUTABLE_PUBLICATION=internal.deepFreeze(api);
  try{delete window.__CRIOS_RUNTIME_EXECUTABLE_PUBLICATION_INTERNAL__;}catch(ignore){}
})();