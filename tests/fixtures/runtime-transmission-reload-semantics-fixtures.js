/* CRIOS A2-006H - isolated transmission and reload semantics fixtures */
(function(){
  'use strict';

  function freeze(value){
    if(!value||typeof value!=='object'||Object.isFrozen(value))return value;
    Object.keys(value).forEach(function(key){freeze(value[key]);});
    return Object.freeze(value);
  }

  function clone(value){return JSON.parse(JSON.stringify(value));}

  function createMemoryStorage(seed){
    var values=Object.assign({},seed||{});
    var calls=[];
    return Object.freeze({
      getItem:function(key){calls.push({operation:'get',key:key});return Object.prototype.hasOwnProperty.call(values,key)?values[key]:null;},
      setItem:function(key,value){calls.push({operation:'set',key:key});values[key]=String(value);},
      removeItem:function(key){calls.push({operation:'remove',key:key});delete values[key];},
      clear:function(){calls.push({operation:'clear'});values={};},
      key:function(index){return Object.keys(values)[index]||null;},
      snapshot:function(){return clone(values);},
      calls:function(){return clone(calls);},
      get length(){return Object.keys(values).length;}
    });
  }

  function createDeferred(NativePromise){
    var resolveValue;
    var rejectValue;
    var settled=false;
    var promise=new NativePromise(function(resolve,reject){resolveValue=resolve;rejectValue=reject;});
    return {
      promise:promise,
      resolve:function(value){if(settled)return false;settled=true;resolveValue(value);return true;},
      reject:function(error){if(settled)return false;settled=true;rejectValue(error);return true;},
      isSettled:function(){return settled;}
    };
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
      publicationId:'a2-006h-controlled-publication',
      version:1,
      schemaVersion:'2.0',
      contentHash:'',
      content:{
        nombre:'Campana sintetica A2-006H',
        descripcion:'Cierre y reconstruccion sin infraestructura real',
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
    var settings=configuration||{};
    var NativePromise=window.Promise;
    var NativeDate=window.Date;
    var contextId=String(settings.contextId||'context-unknown');
    var sessionStorage=settings.sessionStorage||createMemoryStorage(settings.sessionSeed);
    var localStorage=settings.localStorage||createMemoryStorage(settings.localSeed);
    var transmissionMode=settings.transmissionMode||'resolved';
    var clockNow=Number(settings.clockNow)||1770000000000;
    var requestSequence=0;
    var pending=[];
    var calls=[];
    var pageerrors=[];
    var consoleErrors=[];
    var warnings=[];
    var metrics={fetchCalls:0,transmissionCalls:0,groupCalls:0,beaconCalls:0,xhrCalls:0,webSocketCalls:0,eventSourceCalls:0,indexedDbCalls:0,timerCalls:0,timerCallbacks:0,promiseConstructions:0,listenerCalls:0};
    var state={
      contextId:contextId,
      publication:null,
      reference:null,
      prepared:null,
      recovered:null,
      sessionStorage:sessionStorage,
      localStorage:localStorage,
      calls:calls,
      pending:pending,
      metrics:metrics,
      pageerrors:pageerrors,
      consoleErrors:consoleErrors,
      warnings:warnings,
      setTransmissionMode:function(mode){transmissionMode=mode;},
      advanceClock:function(milliseconds){clockNow+=Number(milliseconds)||0;return clockNow;},
      getClock:function(){return clockNow;},
      resolveRequest:function(requestId){var item=pending.filter(function(entry){return entry.requestId===requestId;})[0];return Boolean(item&&item.deferred.resolve({type:'opaque'}));},
      rejectRequest:function(requestId,message){var item=pending.filter(function(entry){return entry.requestId===requestId;})[0];return Boolean(item&&item.deferred.reject(new Error(message||'CONTROLLED_FETCH_REJECTION')));},
      unresolvedRequests:function(){return pending.filter(function(entry){return !entry.deferred.isSettled();}).map(function(entry){return entry.requestId;});}
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

    function ControlledDate(){
      var args=Array.prototype.slice.call(arguments);
      if(!(this instanceof ControlledDate))return NativeDate.apply(null,args.length?args:[clockNow]);
      return new (Function.prototype.bind.apply(NativeDate,[null].concat(args.length?args:[clockNow])))();
    }
    ControlledDate.now=function(){return clockNow;};
    ControlledDate.parse=NativeDate.parse;
    ControlledDate.UTC=NativeDate.UTC;
    ControlledDate.prototype=NativeDate.prototype;
    window.Date=ControlledDate;

    var nativeSetTimeout=window.setTimeout;
    var nativeAddEventListener=window.EventTarget.prototype.addEventListener;
    window.setTimeout=function(callback,delay){
      metrics.timerCalls+=1;
      var args=Array.prototype.slice.call(arguments,2);
      return nativeSetTimeout(function(){metrics.timerCallbacks+=1;return callback.apply(window,args);},delay);
    };
    window.EventTarget.prototype.addEventListener=function(){metrics.listenerCalls+=1;return nativeAddEventListener.apply(this,arguments);};
    function CountingPromise(executor){metrics.promiseConstructions+=1;return new NativePromise(executor);}
    CountingPromise.prototype=NativePromise.prototype;
    Object.setPrototypeOf(CountingPromise,NativePromise);
    window.Promise=CountingPromise;

    Object.defineProperty(window,'sessionStorage',{configurable:true,value:sessionStorage});
    Object.defineProperty(window,'localStorage',{configurable:true,value:localStorage});
    try{Object.defineProperty(navigator,'onLine',{configurable:true,value:true});}catch(ignore){}
    try{Object.defineProperty(navigator,'sendBeacon',{configurable:true,value:function(){metrics.beaconCalls+=1;return false;}});}catch(ignore){}
    Object.defineProperty(window,'indexedDB',{configurable:true,value:{open:function(){metrics.indexedDbCalls+=1;throw new Error('REAL_INDEXEDDB_BLOCKED');}}});
    window.open=function(){throw new Error('REAL_WINDOW_OPEN_BLOCKED');};
    window.XMLHttpRequest=function(){metrics.xhrCalls+=1;throw new Error('REAL_XHR_BLOCKED');};
    window.WebSocket=function(){metrics.webSocketCalls+=1;throw new Error('REAL_WEBSOCKET_BLOCKED');};
    window.EventSource=function(){metrics.eventSourceCalls+=1;throw new Error('REAL_EVENTSOURCE_BLOCKED');};

    window.fetch=function(url,options){
      var text=String(url);
      metrics.fetchCalls+=1;
      if(text.indexOf('accion=grupos')>=0){
        metrics.groupCalls+=1;
        calls.push({type:'groups',contextId:contextId});
        return NativePromise.resolve({ok:true,status:200,json:function(){return NativePromise.resolve({ok:true,grupos:['GRUPO_SINTETICO']});}});
      }
      metrics.transmissionCalls+=1;
      requestSequence+=1;
      var requestId=contextId+'-request-'+requestSequence;
      var body=options&&options.body?String(options.body):'';
      var request={type:'transmission',contextId:contextId,requestId:requestId,method:options&&options.method||'GET',mode:options&&options.mode||null,keepalive:Boolean(options&&options.keepalive),body:body};
      calls.push(request);
      if(transmissionMode==='rejected')return NativePromise.reject(new Error('CONTROLLED_FETCH_REJECTION'));
      if(transmissionMode==='resolved')return NativePromise.resolve({type:'opaque'});
      var deferred=createDeferred(NativePromise);
      pending.push({requestId:requestId,deferred:deferred,request:request});
      return deferred.promise;
    };

    state.ready=createPublication().then(function(publication){
      state.publication=publication;
      state.reference=freeze({campaignId:publication.campaignId,publicationId:publication.publicationId,version:publication.version,contentHash:publication.contentHash});
      return state;
    });

    window.CRIOS_PUBLICATION_PERSISTENCE=Object.freeze({
      version:'1.0.0',
      createPersistenceCoordinator:function(){
        calls.push({type:'coordinator-created',contextId:contextId});
        return Object.freeze({
          activationStore:Object.freeze({getActiveReference:function(campaignId){calls.push({type:'active-reference-read',contextId:contextId,campaignId:campaignId});return state.reference;}}),
          publicationStore:Object.freeze({getPublication:function(publicationId){calls.push({type:'publication-read',contextId:contextId,publicationId:publicationId});return publicationId===state.publication.publicationId?state.publication:null;}})
        });
      }
    });

    window.__CRIOS_TRANSMISSION_RELOAD_STATE__=state;
    return state;
  }

  var identity=freeze({realName:'Persona Sintetica',characterName:'Operador Controlado',groupName:'GRUPO_SINTETICO'});
  var storageKeys=freeze({progress:'a2h-progress',complete:'a2h-complete',realName:'a2h-real-name',characterName:'a2h-character-name',groupName:'a2h-group-name',sessionStats:'a2h-session-stats',sessionData:'a2h-session-data',pendingResult:'a2h-pending-result',campaignId:'a2h-campaign-id',campaignProgress:'a2h-campaign-progress'});

  window.CRIOS_RUNTIME_TRANSMISSION_RELOAD_SEMANTICS_FIXTURES=Object.freeze({
    clone:clone,
    freeze:freeze,
    createMemoryStorage:createMemoryStorage,
    installChildHarness:installChildHarness,
    identity:identity,
    storageKeys:storageKeys,
    missionIds:freeze(['energy','greenhouse','ice','hangar'])
  });
})();