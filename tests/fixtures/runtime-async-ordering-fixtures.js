/* CRIOS A2-006I - isolated RT-005 observable ordering fixtures */
(function(){
  'use strict';

  function clone(value){return JSON.parse(JSON.stringify(value));}
  function freeze(value){if(!value||typeof value!=='object'||Object.isFrozen(value))return value;Object.keys(value).forEach(function(key){freeze(value[key]);});return Object.freeze(value);}
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
    return {promise:promise,resolve:function(value){if(settled)return false;settled=true;resolveValue(value);return true;},reject:function(error){if(settled)return false;settled=true;rejectValue(error);return true;},isSettled:function(){return settled;}};
  }
  async function createPublication(){
    var publication={campaignId:'reactivacion-base-antartica',publicationId:'a2-006i-controlled-publication',version:1,schemaVersion:'2.0',contentHash:'',content:{nombre:'Campana sintetica A2-006I',descripcion:'Orden asincronico observable',escenario:'antartida',clasificacion:{materia:'matematica',tema:'geometria',subtema:'calculoAreas'},missionSpecs:window.CRIOS_RUNTIME_MISSION_FIXTURES.createAll(),runtimeExecutionManifest:{runtimeContractVersion:'1.0.0',requiredHandlers:[{handlerId:'crios.geometry.declarative-area',handlerVersion:'1.0.0'}],missionCount:4,missionOrder:['energy','greenhouse','ice','hangar']},finalEvaluation:{responseType:'NUMERIC_WITH_PROCEDURE',rngPolicy:'SEEDED_SEQUENCE_V1',unit:'m2',instruction:'Integra resultados sinteticos.',adjustments:[{name:'reserve',operation:'add',values:[6,8,10]},{name:'loss',operation:'subtract',values:[24,28,30]}]}}};
    publication.contentHash=await window.CRIOS_PUBLICATION_CORE.calculateContentHash(window.CRIOS_PUBLICATION_CORE.buildCanonicalContent({schemaVersion:publication.schemaVersion,content:publication.content}));
    return freeze(publication);
  }
  function assertRequiredGlobals(){
    var missing=[];
    if(!window.CRIOS_PUBLICATION_CORE||typeof window.CRIOS_PUBLICATION_CORE.calculateContentHash!=='function')missing.push('CRIOS_PUBLICATION_CORE');
    if(!window.CRIOS_PUBLICATION_PERSISTENCE||typeof window.CRIOS_PUBLICATION_PERSISTENCE.createPersistenceCoordinator!=='function')missing.push('CRIOS_PUBLICATION_PERSISTENCE');
    if(!window.CRIOS_RUNTIME_MISSION_HANDLERS||typeof window.CRIOS_RUNTIME_MISSION_HANDLERS.createMissionMaterializer!=='function')missing.push('CRIOS_RUNTIME_MISSION_HANDLERS');
    if(!window.CRIOS_RUNTIME_EXECUTABLE_PUBLICATION||typeof window.CRIOS_RUNTIME_EXECUTABLE_PUBLICATION.createRuntimePublicationResolver!=='function')missing.push('CRIOS_RUNTIME_EXECUTABLE_PUBLICATION');
    if(missing.length)throw new Error('RT005_REQUIRED_GLOBALS_MISSING:'+missing.join(','));
  }

  function installChildHarness(configuration){
    var settings=configuration||{};
    var NativePromise=window.Promise;
    var contextId=String(settings.contextId||'context-unknown');
    var sessionStorage=settings.sessionStorage||createMemoryStorage(settings.sessionSeed);
    var localStorage=settings.localStorage||createMemoryStorage(settings.localSeed);
    var transmissionMode=settings.transmissionMode||'resolved';
    var sequence=0;
    var eventSequence=0;
    var timerSequence=0;
    var listenerSequence=0;
    var requestSequence=0;
    var events=[];
    var relationships=[];
    var timers=[];
    var listeners=[];
    var fetches=[];
    var pending=[];
    var pageerrors=[];
    var consoleErrors=[];
    var warnings=[];
    var destroyed=false;
    var recording=settings.recording!==false;
    var currentEventId=null;
    var metrics={fetchCalls:0,realNetworkCalls:0,xhrCalls:0,webSocketCalls:0,eventSourceCalls:0,indexedDbCalls:0,storageWrites:0};

    function emit(source,phase,data,parentEventId){
      sequence+=1;
      eventSequence+=1;
      var event=Object.assign({sequence:sequence,contextId:contextId,eventId:contextId+'-event-'+eventSequence,parentEventId:parentEventId||null,source:source,phase:phase,name:phase,scheduledSequence:null,startedSequence:null,completedSequence:null,cancelled:false,traceId:contextId+'-trace',requestId:null,timerId:null,listenerId:null},data||{});
      if(recording)events.push(event);
      return event;
    }
    function relate(before,after,type){if(recording&&before&&after)relationships.push({from:before.eventId,to:after.eventId,type:type});}
    var contextCreated=emit('lifecycle','CONTEXT_CREATED',{name:'context'});
    function sync(source,name,callback){var start=emit(source,'SYNC_OPERATION_STARTED',{name:name},currentEventId);var prior=currentEventId;currentEventId=start.eventId;try{return callback();}finally{currentEventId=prior;var complete=emit(source,'SYNC_OPERATION_COMPLETED',{name:name,startedSequence:start.sequence},start.eventId);start.completedSequence=complete.sequence;relate(start,complete,'SYNC_START_PRECEDES_COMPLETION');}}
    function scheduleMicrotask(name){
      var scheduled=emit('microtask','MICROTASK_SCHEDULED',{name:name},currentEventId);
      return NativePromise.resolve().then(function(){var started=emit('microtask','MICROTASK_STARTED',{name:name,scheduledSequence:scheduled.sequence},scheduled.eventId);relate(scheduled,started,'SYNC_PRECEDES_CREATED_MICROTASKS');var completed=emit('microtask','MICROTASK_COMPLETED',{name:name,scheduledSequence:scheduled.sequence,startedSequence:started.sequence},started.eventId);started.completedSequence=completed.sequence;relate(started,completed,'MICROTASK_START_PRECEDES_COMPLETION');return completed;});
    }

    window.addEventListener('error',function(event){pageerrors.push(String(event.message||event.error||'error'));});
    window.addEventListener('unhandledrejection',function(event){pageerrors.push(String(event.reason||'rejection'));});
    var originalError=console.error;
    var originalWarn=console.warn;
    console.error=function(){consoleErrors.push(Array.prototype.join.call(arguments,' '));return originalError.apply(console,arguments);};
    console.warn=function(){var text=Array.prototype.join.call(arguments,' ');if(text.indexOf('No se pudo reconstruir el dominio de campaña')>=0&&text.indexOf('al menos una misión')>=0)return;warnings.push(text);return originalWarn.apply(console,arguments);};

    var nativeSetTimeout=window.setTimeout;
    var nativeClearTimeout=window.clearTimeout;
    var timerByNative={};
    window.setTimeout=function(callback,delay){
      timerSequence+=1;
      var timerId=contextId+'-timer-'+timerSequence;
      var scheduled=emit('timer','TIMER_SCHEDULED',{name:'setTimeout',timerId:timerId,delayMs:Number(delay)||0},currentEventId);
      var args=Array.prototype.slice.call(arguments,2);
      var record={timerId:timerId,contextId:contextId,scheduleEventId:scheduled.eventId,startEventId:null,completeEventId:null,cancelled:false};
      timers.push(record);
      var nativeId=nativeSetTimeout(function(){
        if(record.cancelled)return;
        var start=emit('timer','TIMER_CALLBACK_STARTED',{name:'setTimeout',timerId:timerId,scheduledSequence:scheduled.sequence},scheduled.eventId);
        record.startEventId=start.eventId;
        relate(scheduled,start,'TIMER_SCHEDULE_BEFORE_CALLBACK');
        var prior=currentEventId;currentEventId=start.eventId;
        try{return callback.apply(window,args);}finally{currentEventId=prior;var complete=emit('timer','TIMER_CALLBACK_COMPLETED',{name:'setTimeout',timerId:timerId,scheduledSequence:scheduled.sequence,startedSequence:start.sequence},start.eventId);start.completedSequence=complete.sequence;record.completeEventId=complete.eventId;relate(start,complete,'TIMER_CALLBACK_START_PRECEDES_COMPLETION');}
      },delay);
      timerByNative[String(nativeId)]=record;
      return nativeId;
    };
    window.clearTimeout=function(nativeId){var record=timerByNative[String(nativeId)];if(record&&!record.startEventId){record.cancelled=true;var cancelled=emit('timer','TIMER_CANCELLED',{name:'clearTimeout',timerId:record.timerId,cancelled:true},record.scheduleEventId);relate(events.filter(function(item){return item.eventId===record.scheduleEventId;})[0],cancelled,'TIMER_SCHEDULE_PRECEDES_CANCEL');}return nativeClearTimeout(nativeId);};

    var nativeAddEventListener=window.EventTarget.prototype.addEventListener;
    var nativeRemoveEventListener=window.EventTarget.prototype.removeEventListener;
    var listenerMap=[];
    window.EventTarget.prototype.addEventListener=function(type,callback,options){
      if(typeof callback!=='function')return nativeAddEventListener.apply(this,arguments);
      listenerSequence+=1;
      var listenerId=contextId+'-listener-'+listenerSequence;
      var registered=emit('listener','LISTENER_REGISTERED',{name:String(type),listenerId:listenerId,eventType:String(type)},currentEventId);
      var target=this;
      function wrapped(event){
        var dispatch=emit('dispatch','EVENT_DISPATCH_STARTED',{name:String(type),listenerId:listenerId,eventType:String(type)},registered.eventId);
        var start=emit('listener','LISTENER_CALLBACK_STARTED',{name:String(type),listenerId:listenerId,eventType:String(type),scheduledSequence:registered.sequence},dispatch.eventId);
        relate(dispatch,start,'DISPATCH_PRECEDES_LISTENER_CALLBACK');
        relate(registered,start,'LISTENER_REGISTER_BEFORE_CALLBACK');
        var prior=currentEventId;currentEventId=start.eventId;
        try{return callback.call(this,event);}finally{currentEventId=prior;var complete=emit('listener','LISTENER_CALLBACK_COMPLETED',{name:String(type),listenerId:listenerId,eventType:String(type),startedSequence:start.sequence},start.eventId);start.completedSequence=complete.sequence;relate(start,complete,'LISTENER_CALLBACK_START_PRECEDES_COMPLETION');}
      }
      listenerMap.push({target:target,type:type,callback:callback,wrapped:wrapped,listenerId:listenerId,registerEventId:registered.eventId});
      listeners.push({listenerId:listenerId,contextId:contextId,eventType:String(type),registerEventId:registered.eventId,removed:false});
      return nativeAddEventListener.call(target,type,wrapped,options);
    };
    window.EventTarget.prototype.removeEventListener=function(type,callback,options){var match=listenerMap.filter(function(item){return item.target===this&&item.type===type&&item.callback===callback;},this)[0];if(match){var record=listeners.filter(function(item){return item.listenerId===match.listenerId;})[0];record.removed=true;emit('listener','LISTENER_REMOVED',{name:String(type),listenerId:match.listenerId,eventType:String(type)},match.registerEventId);return nativeRemoveEventListener.call(this,type,match.wrapped,options);}return nativeRemoveEventListener.apply(this,arguments);};

    Object.defineProperty(window,'sessionStorage',{configurable:true,value:sessionStorage});
    Object.defineProperty(window,'localStorage',{configurable:true,value:localStorage});
    try{Object.defineProperty(navigator,'onLine',{configurable:true,value:true});}catch(ignore){}
    try{Object.defineProperty(navigator,'sendBeacon',{configurable:true,value:function(){return false;}});}catch(ignore){}
    Object.defineProperty(window,'indexedDB',{configurable:true,value:{open:function(){metrics.indexedDbCalls+=1;throw new Error('REAL_INDEXEDDB_BLOCKED');}}});
    window.XMLHttpRequest=function(){metrics.xhrCalls+=1;throw new Error('REAL_XHR_BLOCKED');};
    window.WebSocket=function(){metrics.webSocketCalls+=1;throw new Error('REAL_WEBSOCKET_BLOCKED');};
    window.EventSource=function(){metrics.eventSourceCalls+=1;throw new Error('REAL_EVENTSOURCE_BLOCKED');};
    window.open=function(){throw new Error('REAL_WINDOW_OPEN_BLOCKED');};
    window.fetch=function(url,options){
      metrics.fetchCalls+=1;
      var text=String(url);
      requestSequence+=1;
      var requestId=contextId+'-request-'+requestSequence;
      var called=emit('fetch','FETCH_CALLED',{name:text.indexOf('accion=grupos')>=0?'groups':'transmission',requestId:requestId,requestKind:text.indexOf('accion=grupos')>=0?'groups':'transmission'},currentEventId);
      var record={requestId:requestId,contextId:contextId,callEventId:called.eventId,settlementEventId:null,callbackEventId:null,mode:transmissionMode,settled:false};
      fetches.push(record);
      if(text.indexOf('accion=grupos')>=0){
        var groupsSettled=emit('fetch','FETCH_SETTLED_RESOLVED',{name:'groups',requestId:requestId,outcome:'resolved'},called.eventId);record.settlementEventId=groupsSettled.eventId;record.settled=true;relate(called,groupsSettled,'FETCH_CALL_PRECEDES_SETTLEMENT');
        return NativePromise.resolve({ok:true,status:200,json:function(){var callback=emit('fetch','FETCH_CALLBACK_STARTED',{name:'groups',requestId:requestId,scheduledSequence:groupsSettled.sequence},groupsSettled.eventId);record.callbackEventId=callback.eventId;relate(groupsSettled,callback,'FETCH_SETTLEMENT_PRECEDES_FETCH_CALLBACK');var completed=emit('fetch','FETCH_CALLBACK_COMPLETED',{name:'groups',requestId:requestId,startedSequence:callback.sequence},callback.eventId);relate(callback,completed,'FETCH_CALLBACK_START_PRECEDES_COMPLETION');return NativePromise.resolve({ok:true,grupos:['GRUPO_SINTETICO']});}});
      }
      var deferred=createDeferred(NativePromise);
      pending.push({requestId:requestId,deferred:deferred,record:record,called:called});
      if(transmissionMode==='resolved')nativeSetTimeout(function(){settle(requestId,'resolved');},0);
      if(transmissionMode==='rejected')nativeSetTimeout(function(){settle(requestId,'rejected');},0);
      deferred.promise.then(function(){completeFetchCallback(record,requestId);},function(){completeFetchCallback(record,requestId);});
      return deferred.promise;
    };
    function completeFetchCallback(record,requestId){var settlement=events.filter(function(item){return item.eventId===record.settlementEventId;})[0];var callback=emit('fetch','FETCH_CALLBACK_STARTED',{name:'transmission',requestId:requestId,scheduledSequence:settlement?settlement.sequence:null},record.settlementEventId);record.callbackEventId=callback.eventId;relate(settlement,callback,'FETCH_SETTLEMENT_PRECEDES_FETCH_CALLBACK');var completed=emit('fetch','FETCH_CALLBACK_COMPLETED',{name:'transmission',requestId:requestId,startedSequence:callback.sequence},callback.eventId);relate(callback,completed,'FETCH_CALLBACK_START_PRECEDES_COMPLETION');}
    function settle(requestId,outcome){var item=pending.filter(function(entry){return entry.requestId===requestId;})[0];if(!item||item.record.settled)return false;var phase=outcome==='resolved'?'FETCH_SETTLED_RESOLVED':'FETCH_SETTLED_REJECTED';var settled=emit('fetch',phase,{name:'transmission',requestId:requestId,outcome:outcome,contextDestroyed:destroyed},item.called.eventId);item.record.settlementEventId=settled.eventId;item.record.settled=true;relate(item.called,settled,'FETCH_CALL_PRECEDES_SETTLEMENT');return outcome==='resolved'?item.deferred.resolve({type:'opaque'}):item.deferred.reject(new Error('CONTROLLED_FETCH_REJECTION'));}

    var resolveReady;
    var rejectReady;
    var state={contextId:contextId,sessionStorage:sessionStorage,localStorage:localStorage,events:events,relationships:relationships,timers:timers,listeners:listeners,fetches:fetches,pending:pending,metrics:metrics,pageerrors:pageerrors,consoleErrors:consoleErrors,warnings:warnings,publication:null,reference:null,prepared:null,recovered:null,contextCreated:contextCreated,sync:sync,scheduleMicrotask:scheduleMicrotask,emit:emit,relate:relate,setRecording:function(value){recording=Boolean(value);},isRecording:function(){return recording;},setTransmissionMode:function(mode){transmissionMode=mode;},settle:settle,unresolvedRequests:function(){return pending.filter(function(item){return !item.record.settled;}).map(function(item){return item.requestId;});},scriptLoadingStarted:function(){return emit('lifecycle','SCRIPT_LOADING_STARTED',{name:'product-scripts'},contextCreated.eventId);},scriptLoadingCompleted:function(started){var completed=emit('lifecycle','SCRIPT_LOADING_COMPLETED',{name:'product-scripts',startedSequence:started.sequence},started.eventId);relate(started,completed,'SCRIPT_LOADING_START_PRECEDES_COMPLETION');try{assertRequiredGlobals();}catch(error){rejectReady(error);return completed;}window.CRIOS_PUBLICATION_PERSISTENCE=persistenceHarness;createPublication().then(function(publication){state.publication=publication;state.reference=freeze({campaignId:publication.campaignId,publicationId:publication.publicationId,version:publication.version,contentHash:publication.contentHash});resolveReady(state);},rejectReady);return completed;},destroy:function(){var started=emit('lifecycle','CONTEXT_DESTROY_STARTED',{name:'context'});destroyed=true;var completed=emit('lifecycle','CONTEXT_DESTROY_COMPLETED',{name:'context',startedSequence:started.sequence},started.eventId);relate(started,completed,'CONTEXT_DESTROY_START_PRECEDES_COMPLETION');state.contextDestroyed=completed;return completed;},isDestroyed:function(){return destroyed;}};
    var persistenceHarness=Object.freeze({version:'1.0.0',createPersistenceCoordinator:function(){return Object.freeze({activationStore:Object.freeze({getActiveReference:function(){return state.reference;}}),publicationStore:Object.freeze({getPublication:function(publicationId){return publicationId===state.publication.publicationId?state.publication:null;}})});}});
    window.CRIOS_PUBLICATION_PERSISTENCE=persistenceHarness;
    state.ready=new NativePromise(function(resolve,reject){resolveReady=resolve;rejectReady=reject;});
    window.__CRIOS_ASYNC_ORDERING_STATE__=state;
    return state;
  }

  var identity=freeze({realName:'Persona Sintetica',characterName:'Operador Controlado',groupName:'GRUPO_SINTETICO'});
  var storageKeys=freeze({progress:'a2i-progress',complete:'a2i-complete',realName:'a2i-real-name',characterName:'a2i-character-name',groupName:'a2i-group-name',sessionStats:'a2i-session-stats',sessionData:'a2i-session-data',pendingResult:'a2i-pending-result',campaignId:'a2i-campaign-id',campaignProgress:'a2i-campaign-progress'});
  window.CRIOS_RUNTIME_ASYNC_ORDERING_FIXTURES=Object.freeze({clone:clone,freeze:freeze,createMemoryStorage:createMemoryStorage,installChildHarness:installChildHarness,identity:identity,storageKeys:storageKeys,missionIds:freeze(['energy','greenhouse','ice','hangar'])});
})();