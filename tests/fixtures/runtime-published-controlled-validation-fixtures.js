/* CRIOS A2-006F - isolated published runtime fixtures */
(function(){
  'use strict';

  function freeze(value){if(!value||typeof value!=='object'||Object.isFrozen(value))return value;Object.keys(value).forEach(function(key){freeze(value[key]);});return Object.freeze(value);}
  function clone(value){return JSON.parse(JSON.stringify(value));}
  function createMemoryStorage(seed){var values=Object.assign({},seed||{});return Object.freeze({getItem:function(key){return Object.prototype.hasOwnProperty.call(values,key)?values[key]:null;},setItem:function(key,value){values[key]=String(value);},removeItem:function(key){delete values[key];},clear:function(){values={};},key:function(index){return Object.keys(values)[index]||null;},snapshot:function(){return clone(values);},get length(){return Object.keys(values).length;}});}
  function finalEvaluation(){return {responseType:'NUMERIC_WITH_PROCEDURE',rngPolicy:'SEEDED_SEQUENCE_V1',unit:'m2',instruction:'Integra los cuatro resultados.',adjustments:[{name:'reserve',operation:'add',values:[6,8,10]},{name:'loss',operation:'subtract',values:[24,28,30]}]};}
  async function createPublication(options){var settings=options||{};var version=settings.version||1;var publicationId=settings.publicationId||'controlled-publication-v'+version;var specs=window.CRIOS_RUNTIME_MISSION_FIXTURES.createAll();var value={campaignId:'reactivacion-base-antartica',publicationId:publicationId,version:version,schemaVersion:'2.0',contentHash:'',content:{nombre:'Campana publicada controlada',descripcion:'Datos sinteticos A2-006F',escenario:'antartida',clasificacion:{materia:'matematica',tema:'geometria',subtema:'calculoAreas'},missionSpecs:specs,runtimeExecutionManifest:{runtimeContractVersion:'1.0.0',requiredHandlers:[{handlerId:'crios.geometry.declarative-area',handlerVersion:'1.0.0'}],missionCount:4,missionOrder:['energy','greenhouse','ice','hangar']},finalEvaluation:finalEvaluation()}};if(settings.mutate)settings.mutate(value);value.contentHash=await window.CRIOS_PUBLICATION_CORE.calculateContentHash(window.CRIOS_PUBLICATION_CORE.buildCanonicalContent({schemaVersion:value.schemaVersion,content:value.content}));return freeze(value);}
  function reference(publication){return freeze({campaignId:publication.campaignId,publicationId:publication.publicationId,version:publication.version,contentHash:publication.contentHash});}
  function installChildHarness(options){var settings=options||{};var calls=[];var sessionStorage=settings.sessionStorage||createMemoryStorage(settings.sessionSeed);var localStorage=settings.localStorage||createMemoryStorage(settings.localSeed);var state={publication:null,alternative:null,reference:null,calls:calls,sessionStorage:sessionStorage,localStorage:localStorage,prepared:null,recovered:null,expectedWarnings:[],realStorageCalls:0,realNetworkCalls:0,registryReads:0};var originalWarn=console.warn;console.warn=function(){var key=arguments[1];if(arguments[0]==='[CRIOS] No se pudo leer el almacenamiento:'&&(key==='test-session-data'||key==='test-campaign-progress')){state.expectedWarnings.push({code:'EXPECTED_STORAGE_READ_WARNING',key:key});return;}return originalWarn.apply(console,arguments);};Object.defineProperty(window,'sessionStorage',{configurable:true,value:sessionStorage});Object.defineProperty(window,'localStorage',{configurable:true,value:localStorage});window.open=function(){throw new Error('REAL_WINDOW_OPEN_BLOCKED');};window.WebSocket=function(){throw new Error('REAL_WEBSOCKET_BLOCKED');};window.EventSource=function(){throw new Error('REAL_EVENTSOURCE_BLOCKED');};window.XMLHttpRequest=function(){throw new Error('REAL_XHR_BLOCKED');};Object.defineProperty(window,'indexedDB',{configurable:true,value:{open:function(){throw new Error('REAL_INDEXEDDB_BLOCKED');}}});try{Object.defineProperty(navigator,'sendBeacon',{configurable:true,value:function(){state.realNetworkCalls+=1;throw new Error('REAL_BEACON_BLOCKED');}});}catch(ignore){}
    window.fetch=function(url,options){var text=String(url);calls.push({type:'fetch-spy',url:text.indexOf('accion=grupos')>=0?'groups':'transmission',method:options&&options.method||'GET'});if(text.indexOf('accion=grupos')>=0)return Promise.resolve({ok:true,json:function(){return Promise.resolve({ok:true,grupos:['ALUMNO_A','ALUMNO_B']});}});return Promise.resolve({ok:true,json:function(){return Promise.resolve({ok:true});}});};
    state.ready=Promise.all([createPublication(settings.publicationOptions||{version:1}),createPublication(settings.alternativeOptions||{version:2,publicationId:'controlled-publication-v2'})]).then(function(values){state.publication=values[0];state.alternative=values[1];state.reference=settings.activePublication==='none'?null:reference(settings.activePublication==='alternative'?values[1]:values[0]);return state;});
    window.CRIOS_PUBLICATION_PERSISTENCE=Object.freeze({
      version:'1.0.0',
      createPersistenceCoordinator:function(){
        calls.push({type:'coordinator-created'});
        return Object.freeze({
          activationStore:Object.freeze({
            getActiveReference:function(id){calls.push({type:'active-reference-read',campaignId:id});return state.reference;}
          }),
          publicationStore:Object.freeze({
            getPublication:function(id){
              calls.push({type:'publication-read',publicationId:id});
              if((settings.missingPublicationIds||[]).indexOf(id)>=0)return null;
              if(state.publication&&state.publication.publicationId===id)return state.publication;
              if(state.alternative&&state.alternative.publicationId===id)return state.alternative;
              return null;
            }
          })
        });
      }
    });
    window.__CRIOS_CONTROLLED_STATE__=state;return state;
  }
  window.CRIOS_RUNTIME_PUBLISHED_CONTROLLED_FIXTURES=Object.freeze({createMemoryStorage:createMemoryStorage,createPublication:createPublication,reference:reference,installChildHarness:installChildHarness,clone:clone,freeze:freeze,students:freeze({a:{realName:'Alumno A Falso',characterName:'Operador A',groupName:'ALUMNO_A'},b:{realName:'Alumno B Falso',characterName:'Operador B',groupName:'ALUMNO_B'}})});
})();
