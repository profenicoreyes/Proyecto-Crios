/* CRIOS A2-006G - isolated local state coherence fixtures */
(function(){
  'use strict';

  function freeze(value){
    if(!value||typeof value!=='object'||Object.isFrozen(value))return value;
    Object.keys(value).forEach(function(key){freeze(value[key]);});
    return Object.freeze(value);
  }

  function clone(value){return JSON.parse(JSON.stringify(value));}

  function createMemoryStorage(seed,metrics){
    var values=Object.assign({},seed||{});
    return Object.freeze({
      getItem:function(key){metrics.storageReads+=1;return Object.prototype.hasOwnProperty.call(values,key)?values[key]:null;},
      setItem:function(key,value){metrics.storageWrites+=1;values[key]=String(value);},
      removeItem:function(key){metrics.storageWrites+=1;delete values[key];},
      clear:function(){metrics.storageWrites+=1;values={};},
      key:function(index){return Object.keys(values)[index]||null;},
      snapshot:function(){return clone(values);},
      get length(){return Object.keys(values).length;}
    });
  }

  function finalEvaluation(){
    return {
      responseType:'NUMERIC_WITH_PROCEDURE',
      rngPolicy:'SEEDED_SEQUENCE_V1',
      unit:'m2',
      instruction:'Integra los cuatro resultados sinteticos.',
      adjustments:[
        {name:'reserve',operation:'add',values:[6,8,10]},
        {name:'loss',operation:'subtract',values:[24,28,30]}
      ]
    };
  }

  async function createPublication(){
    var publication={
      campaignId:'reactivacion-base-antartica',
      publicationId:'a2-006g-controlled-publication',
      version:1,
      schemaVersion:'2.0',
      contentHash:'',
      content:{
        nombre:'Campana sintetica de coherencia local',
        descripcion:'Fixtures locales sin datos personales',
        escenario:'antartida',
        clasificacion:{materia:'matematica',tema:'geometria',subtema:'calculoAreas'},
        missionSpecs:window.CRIOS_RUNTIME_MISSION_FIXTURES.createAll(),
        runtimeExecutionManifest:{
          runtimeContractVersion:'1.0.0',
          requiredHandlers:[{handlerId:'crios.geometry.declarative-area',handlerVersion:'1.0.0'}],
          missionCount:4,
          missionOrder:['energy','greenhouse','ice','hangar']
        },
        finalEvaluation:finalEvaluation()
      }
    };
    publication.contentHash=await window.CRIOS_PUBLICATION_CORE.calculateContentHash(
      window.CRIOS_PUBLICATION_CORE.buildCanonicalContent({schemaVersion:publication.schemaVersion,content:publication.content})
    );
    return freeze(publication);
  }

  function installChildHarness(configuration){
    var settings=configuration||configurations.off;
    var metrics={
      timerCalls:0,
      intervalCalls:0,
      listenerCalls:0,
      promiseConstructions:0,
      storageReads:0,
      storageWrites:0,
      fetchCalls:0,
      realNetworkCalls:0,
      realStorageCalls:0,
      registryReads:0
    };
    var calls=[];
    var pageerrors=[];
    var consoleErrors=[];
    var warnings=[];
    var sessionStorage=createMemoryStorage(null,metrics);
    var localStorage=createMemoryStorage(null,metrics);
    var state={
      configuration:settings,
      publication:null,
      reference:null,
      calls:calls,
      metrics:metrics,
      sessionStorage:sessionStorage,
      localStorage:localStorage,
      pageerrors:pageerrors,
      consoleErrors:consoleErrors,
      warnings:warnings
    };

    window.addEventListener('error',function(event){pageerrors.push(String(event.message||event.error||'error'));});
    window.addEventListener('unhandledrejection',function(event){pageerrors.push(String(event.reason||'rejection'));});
    var originalError=console.error;
    var originalWarn=console.warn;
    console.error=function(){consoleErrors.push(Array.prototype.join.call(arguments,' '));return originalError.apply(console,arguments);};
    console.warn=function(){
      var text=Array.prototype.join.call(arguments,' ');
      if(text.indexOf('No se pudo reconstruir el dominio de campaña')>=0&&text.indexOf('al menos una misión')>=0)return;
      warnings.push(text);
      return originalWarn.apply(console,arguments);
    };

    Object.defineProperty(window,'sessionStorage',{configurable:true,value:sessionStorage});
    Object.defineProperty(window,'localStorage',{configurable:true,value:localStorage});
    Object.defineProperty(window,'indexedDB',{configurable:true,value:{open:function(){metrics.realStorageCalls+=1;throw new Error('REAL_INDEXEDDB_BLOCKED');}}});
    window.open=function(){throw new Error('REAL_WINDOW_OPEN_BLOCKED');};
    window.WebSocket=function(){metrics.realNetworkCalls+=1;throw new Error('REAL_WEBSOCKET_BLOCKED');};
    window.EventSource=function(){metrics.realNetworkCalls+=1;throw new Error('REAL_EVENTSOURCE_BLOCKED');};
    window.XMLHttpRequest=function(){metrics.realNetworkCalls+=1;throw new Error('REAL_XHR_BLOCKED');};
    try{Object.defineProperty(navigator,'sendBeacon',{configurable:true,value:function(){metrics.realNetworkCalls+=1;throw new Error('REAL_BEACON_BLOCKED');}});}catch(ignore){}

    var nativeSetTimeout=window.setTimeout;
    var nativeSetInterval=window.setInterval;
    var nativeAddEventListener=window.EventTarget.prototype.addEventListener;
    var NativePromise=window.Promise;
    window.setTimeout=function(){metrics.timerCalls+=1;return nativeSetTimeout.apply(window,arguments);};
    window.setInterval=function(){metrics.intervalCalls+=1;return nativeSetInterval.apply(window,arguments);};
    window.EventTarget.prototype.addEventListener=function(){metrics.listenerCalls+=1;return nativeAddEventListener.apply(this,arguments);};
    function CountingPromise(executor){metrics.promiseConstructions+=1;return new NativePromise(executor);}
    CountingPromise.prototype=NativePromise.prototype;
    Object.setPrototypeOf(CountingPromise,NativePromise);
    window.Promise=CountingPromise;

    window.fetch=function(url,options){
      var text=String(url);
      metrics.fetchCalls+=1;
      calls.push({type:text.indexOf('accion=grupos')>=0?'groups':'transmission',method:options&&options.method||'GET'});
      if(text.indexOf('accion=grupos')>=0){
        return NativePromise.resolve({ok:true,json:function(){return NativePromise.resolve({ok:true,grupos:['GRUPO_FALSO']});}});
      }
      return NativePromise.resolve({ok:true,json:function(){return NativePromise.resolve({ok:true});}});
    };

    state.ready=createPublication().then(function(publication){
      state.publication=publication;
      state.reference=freeze({
        campaignId:publication.campaignId,
        publicationId:publication.publicationId,
        version:publication.version,
        contentHash:publication.contentHash
      });
      return state;
    });

    window.CRIOS_PUBLICATION_PERSISTENCE=Object.freeze({
      version:'1.0.0',
      createPersistenceCoordinator:function(){
        calls.push({type:'coordinator-created'});
        return Object.freeze({
          activationStore:Object.freeze({
            getActiveReference:function(campaignId){calls.push({type:'active-reference-read',campaignId:campaignId});return state.reference;}
          }),
          publicationStore:Object.freeze({
            getPublication:function(publicationId){calls.push({type:'publication-read',publicationId:publicationId});return publicationId===state.publication.publicationId?state.publication:null;}
          })
        });
      }
    });

    window.__CRIOS_LOCAL_COHERENCE_STATE__=state;
    return state;
  }

  var missionIds=freeze(['energy','greenhouse','ice','hangar']);
  var identity=freeze({realName:'Persona Falsa',characterName:'Operador Sintetico',groupName:'GRUPO_FALSO'});
  var configurations=freeze({
    off:{name:'off',experimentId:null},
    rt003:{name:'rt003',experimentId:'RT-003'},
    rt004:{name:'rt004',experimentId:'RT-004'}
  });
  var expected=freeze({
    initial:{status:'running',lives:1,screen:'mission-energy'},
    technical:{status:'gameOver',lives:0},
    restored:{status:'running',lives:3},
    routes:{map:'map',energy:'mission-energy',greenhouse:'mission-greenhouse',ice:'mission-ice',hangar:'mission-hangar'},
    nonSequential:['energy','hangar','greenhouse','ice','hangar','energy']
  });
  var falsification=freeze({persistentGameOver:{status:'gameOver',lives:0},divergentClusters:{sessionMissionId:'ice',runtimeMissionId:'energy',navigationMissionId:'hangar'}});

  window.CRIOS_RUNTIME_LOCAL_STATE_COHERENCE_FIXTURES=Object.freeze({
    clone:clone,
    freeze:freeze,
    installChildHarness:installChildHarness,
    configurations:configurations,
    identity:identity,
    missionIds:missionIds,
    expected:expected,
    falsification:falsification
  });
})();
