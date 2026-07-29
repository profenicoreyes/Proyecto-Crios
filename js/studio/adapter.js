/* CRIOS Studio — adapter (lectura) */
(function(){
  'use strict';

  function safeListar(registro){
    try{
      if(!registro || typeof registro.listar !== 'function') return [];
      return registro.listar();
    }catch(e){
      console.warn('[Studio adapter] listar failed', e);
      return [];
    }
  }

  window.CRIOS_STUDIO_ADAPTER = {
    getMissions(){
      if(typeof REGISTRO_MISIONES === 'undefined') return [];
      return safeListar(REGISTRO_MISIONES);
    },
    getTaxonomy(){
      if(typeof TAXONOMIA_CRIOS === 'undefined') return null;
      return TAXONOMIA_CRIOS;
    },
    getCampaigns(){
      try{
        if(typeof CAMPANAS_CRIOS === 'undefined') return [];
        return Object.values(CAMPANAS_CRIOS || {});
      }catch(e){
        console.warn('[Studio adapter] getCampaigns failed', e);
        return [];
      }
    }
  };
})();
