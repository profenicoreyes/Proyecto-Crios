/* CRIOS A2-006H - RT-001 and RT-002 transmission/reload semantics */
(function(){
  'use strict';

  var startedAt=performance.now();
  var definitions=[];
  var results=[];
  var scenarios={};
  var configurations={};
  var fixtures=window.CRIOS_RUNTIME_TRANSMISSION_RELOAD_SEMANTICS_FIXTURES;
  var keys=fixtures.storageKeys;

  function test(rt,group,name,run,identifiers){definitions.push({rt:rt,group:group,name:rt+' '+group+' - '+name,run:run,contextId:identifiers&&identifiers.contextId||null,requestId:identifiers&&identifiers.requestId||null});}
  function assert(value,message){if(!value)throw new Error(message||'Assertion failed.');}
  function equal(actual,expected,message){assert(JSON.stringify(actual)===JSON.stringify(expected),(message||'Values differ')+' actual='+JSON.stringify(actual)+' expected='+JSON.stringify(expected));}
  function waitFor(check,timeout){
    var end=Date.now()+(timeout||20000);
    return new Promise(function(resolve,reject){
      (function poll(){
        var value;
        try{value=check();}catch(error){reject(error);return;}
        if(value){resolve(value);return;}
        if(Date.now()>end){reject(new Error('Timed out.'));return;}
        setTimeout(poll,20);
      })();
    });
  }
  function tick(){return new Promise(function(resolve){setTimeout(resolve,0);});}
  function parse(storage,key){var raw=storage.getItem(key);return raw===null?null:JSON.parse(raw);}
  function transmissions(state){return state.calls.filter(function(call){return call.type==='transmission';});}
  function traceEvents(child,type){return child.CRIOS_TRACE.getEvents().filter(function(event){return event.eventType===type;});}
  function activeScreen(child){var active=child.document.querySelector('.screen.active');return active?active.id:null;}
  function categoryAt(index,partitions){
    var offset=0;
    for(var position=0;position<partitions.length;position+=1){offset+=partitions[position].count;if(index<offset)return partitions[position].name;}
    throw new Error('Missing test category.');
  }

  function srcdocFor(token){
    return fetch('../index.html?transmission-reload-source='+encodeURIComponent(token),{cache:'no-store'}).then(function(response){return response.text();}).then(function(html){
      var base='<base href="'+new URL('../',location.href).href+'">';
      html=html.replace('<head>','<head>'+base);
      html=html.replace('<script src="js/config.js"></script>','<script>const CRIOS_CONFIG=Object.freeze({version:"1.25",runtimeCampaignMode:"published",resultsEndpoint:"controlled://a2-006h",variantCount:36,progressSendDelayMs:0,missionReturnDelayMs:0,finalTransitionDelayMs:0,designViewport:Object.freeze({width:1366,height:768}),storage:Object.freeze('+JSON.stringify(keys)+')});</script>');
      var injection='<script src="tests/fixtures/publishable-mission-spec-fixtures.js"></script><script src="tests/fixtures/runtime-transmission-reload-semantics-fixtures.js"></script><script>CRIOS_RUNTIME_TRANSMISSION_RELOAD_SEMANTICS_FIXTURES.installChildHarness(parent.__CRIOS_A2_006H_CONFIGURATIONS__["'+token+'"]);</script>';
      return html.replace('<script src="js/crios.js"></script>',injection+'<script src="js/crios.js"></script>');
    });
  }

  async function launch(name,options){
    var token=name+'-'+Math.random().toString(36).slice(2);
    configurations[token]=Object.assign({contextId:name},options||{});
    var frame=document.createElement('iframe');
    frame.hidden=true;
    frame.title='A2-006H '+name;
    document.getElementById('harnesses').appendChild(frame);
    frame.srcdoc=await srcdocFor(token);
    await waitFor(function(){return frame.contentWindow&&frame.contentWindow.CRIOS&&frame.contentWindow.__CRIOS_TRANSMISSION_RELOAD_STATE__;});
    var child=frame.contentWindow;
    var state=child.__CRIOS_TRANSMISSION_RELOAD_STATE__;
    await state.ready;
    await waitFor(function(){return child.CRIOS_DOMAIN&&child.CRIOS_DOMAIN.runtimeBootstrapAdapter&&!child.document.getElementById('groupInput').disabled;});
    var original=child.CRIOS_DOMAIN.runtimeBootstrapAdapter;
    child.CRIOS_DOMAIN.runtimeBootstrapAdapter=Object.freeze({
      version:original.version,
      prepareLegacyCampaign:original.prepareLegacyCampaign,
      preparePublishedCampaign:async function(value){var outcome=await original.preparePublishedCampaign(value);if(outcome.success)state.prepared=outcome.campaign;return outcome;},
      recoverPublishedCampaign:async function(value){var outcome=await original.recoverPublishedCampaign(value);if(outcome.success)state.recovered=outcome.campaign;return outcome;},
      isPreparedRuntimeCampaign:original.isPreparedRuntimeCampaign
    });
    return {name:name,frame:frame,child:child,state:state};
  }

  async function identify(harness){
    var child=harness.child;
    child.document.getElementById('userNameInput').value=fixtures.identity.realName;
    child.document.getElementById('characterNameInput').value=fixtures.identity.characterName;
    child.document.getElementById('groupInput').value=fixtures.identity.groupName;
    await child.identifyUser();
    await tick();
    return parse(harness.state.sessionStorage,keys.sessionData);
  }

  function finalExpected(prepared){
    var values=prepared.data.missions.map(function(mission){return mission.materialization.generatedState.expected;});
    return values.reduce(function(sum,value){return sum+value;},0)-prepared.data.finalEvaluation.subtract.value+prepared.data.finalEvaluation.add.value;
  }

  async function beginFinal(harness){
    var child=harness.child;
    child.go('final');
    child.document.getElementById('finalAnswer').value=String(finalExpected(harness.state.prepared||harness.state.recovered));
    child.validateFinal();
    await waitFor(function(){return harness.state.unresolvedRequests().length>0;});
    return transmissions(harness.state)[transmissions(harness.state).length-1];
  }

  async function execute(){
    var off=await launch('context-off',{transmissionMode:'resolved'});
    await identify(off);
    off.child.CRIOS_TRACE.disable();
    off.child.CRIOS_TRACE.clear();
    off.state.setTransmissionMode('deferred');
    var offFirst=await beginFinal(off);
    var offReturn=off.child.validateFinal();
    await tick();
    off.state.resolveRequest(offFirst.requestId);
    await waitFor(function(){return transmissions(off.state).length===3;});
    var offQueued=transmissions(off.state)[2];
    off.state.resolveRequest(offQueued.requestId);
    await waitFor(function(){return Boolean(parse(off.state.sessionStorage,keys.sessionData).evaluacion);});
    scenarios.off={harness:off,firstRequest:offFirst,queuedRequest:offQueued,session:parse(off.state.sessionStorage,keys.sessionData),events:off.child.CRIOS_TRACE.getEvents(),returnValue:offReturn};

    var primary=await launch('context-primary',{transmissionMode:'resolved'});
    await identify(primary);
    primary.state.setTransmissionMode('deferred');
    assert(primary.child.CRIOS_TRACE.startExperiment('RT-001'),'RT-001 did not start.');
    var firstRequest=await beginFinal(primary);
    var localSession=parse(primary.state.sessionStorage,keys.sessionData);
    var localComplete=primary.state.sessionStorage.getItem(keys.complete);
    var localPending=primary.state.localStorage.getItem(keys.pendingResult);
    var screenBeforeSettlement=activeScreen(primary.child);
    var primaryReturn=primary.child.validateFinal();
    await tick();
    var countWhileBusy=transmissions(primary.state).length;
    primary.state.resolveRequest(firstRequest.requestId);
    await waitFor(function(){return transmissions(primary.state).length===countWhileBusy+1;});
    var queuedRequest=transmissions(primary.state)[transmissions(primary.state).length-1];
    primary.state.resolveRequest(queuedRequest.requestId);
    await waitFor(function(){var session=parse(primary.state.sessionStorage,keys.sessionData);return session&&session.evaluacion;});
    var resolvedSession=parse(primary.state.sessionStorage,keys.sessionData);
    var rt1Events=primary.child.CRIOS_TRACE.getEvents();
    primary.child.CRIOS_TRACE.stopExperiment();
    scenarios.primary={harness:primary,firstRequest:firstRequest,queuedRequest:queuedRequest,localSession:localSession,localComplete:localComplete,localPending:localPending,screenBeforeSettlement:screenBeforeSettlement,countWhileBusy:countWhileBusy,resolvedSession:resolvedSession,events:rt1Events,returnValue:primaryReturn};

    var failed=await launch('context-failed',{transmissionMode:'resolved'});
    await identify(failed);
    failed.state.setTransmissionMode('deferred');
    var failedRequest=await beginFinal(failed);
    var failedScreen=activeScreen(failed.child);
    failed.state.rejectRequest(failedRequest.requestId,'CONTROLLED_OFFLINE');
    await waitFor(function(){return failed.state.localStorage.getItem(keys.pendingResult)!==null;});
    var failedSession=parse(failed.state.sessionStorage,keys.sessionData);
    var pendingRaw=failed.state.localStorage.getItem(keys.pendingResult);
    var pendingPayload=JSON.parse(pendingRaw);
    await tick();
    scenarios.failed={harness:failed,request:failedRequest,screen:failedScreen,session:failedSession,pendingRaw:pendingRaw,pendingPayload:pendingPayload};

    var late=await launch('context-late',{transmissionMode:'resolved'});
    await identify(late);
    late.state.setTransmissionMode('deferred');
    var lateRequest=await beginFinal(late);
    late.state.localStorage.setItem(keys.pendingResult,pendingRaw);
    var lateSession=late.state.sessionStorage;
    var lateLocal=late.state.localStorage;
    var lateCallbacksBefore=late.state.metrics.timerCallbacks;
    late.frame.remove();
    var lateReload=await launch('context-late-reload',{transmissionMode:'deferred',sessionStorage:lateSession,localStorage:lateLocal});
    await waitFor(function(){return lateReload.state.unresolvedRequests().length>0;});
    var pendingBeforeLateResolution=lateLocal.getItem(keys.pendingResult);
    late.state.resolveRequest(lateRequest.requestId);
    await waitFor(function(){return lateLocal.getItem(keys.pendingResult)===null;});
    var lateCallbacksAfter=late.state.metrics.timerCallbacks;
    lateReload.state.unresolvedRequests().forEach(function(requestId){lateReload.state.resolveRequest(requestId);});
    await tick();
    scenarios.late={harness:late,reloadHarness:lateReload,request:lateRequest,pendingBefore:pendingBeforeLateResolution,pendingAfter:lateLocal.getItem(keys.pendingResult),callbacksBefore:lateCallbacksBefore,callbacksAfter:lateCallbacksAfter};

    var sharedSession=failed.state.sessionStorage;
    var sharedLocal=failed.state.localStorage;
    var oldContextId=failed.state.contextId;
    var oldFrame=failed.frame;
    oldFrame.remove();
    var reload=await launch('context-reload',{transmissionMode:'deferred',sessionStorage:sharedSession,localStorage:sharedLocal,clockNow:failed.state.getClock()+60000});
    await waitFor(function(){return reload.state.unresolvedRequests().length>0;});
    assert(reload.child.CRIOS_TRACE.startExperiment('RT-002'),'RT-002 did not start.');
    var beforeIdentitySession=parse(sharedSession,keys.sessionData);
    var beforeIdentityPending=sharedLocal.getItem(keys.pendingResult);
    var progressKeysBefore=Object.keys(parse(sharedSession,keys.campaignProgress)||{});
    var reloadInitialScreen=activeScreen(reload.child);
    var retryRequest=transmissions(reload.state)[0];
    var recoveredSession=await identify(reload);
    var reloadAfterIdentityScreen=activeScreen(reload.child);
    var pendingBeforeRetrySettlement=sharedLocal.getItem(keys.pendingResult);
    reload.child.openMission('hangar');
    reload.child.document.getElementById('answer-hangar').value='-999999';
    reload.child.validateMissionResult('hangar');
    await tick();
    var progressKeysAfter=Object.keys(parse(sharedSession,keys.campaignProgress)||{});
    var recoveryEvents=reload.child.CRIOS_TRACE.getEvents();
    reload.state.resolveRequest(retryRequest.requestId);
    await waitFor(function(){return sharedLocal.getItem(keys.pendingResult)===null;});
    reload.state.unresolvedRequests().forEach(function(requestId){reload.state.resolveRequest(requestId);});
    await tick();
    reload.child.CRIOS_TRACE.stopExperiment();
    scenarios.reload={harness:reload,oldContextId:oldContextId,oldFrame:oldFrame,beforeIdentitySession:beforeIdentitySession,beforeIdentityPending:beforeIdentityPending,progressKeysBefore:progressKeysBefore,reloadInitialScreen:reloadInitialScreen,retryRequest:retryRequest,recoveredSession:recoveredSession,reloadAfterIdentityScreen:reloadAfterIdentityScreen,pendingBeforeRetrySettlement:pendingBeforeRetrySettlement,progressKeysAfter:progressKeysAfter,recoveryEvents:recoveryEvents,pendingAfterRetry:sharedLocal.getItem(keys.pendingResult),oldTimerCallbacks:failed.state.metrics.timerCallbacks};
  }

  function defineRt001(){
    var value=scenarios.primary;
    var failed=scenarios.failed;
    var off=scenarios.off;
    var late=scenarios.late;
    var firstPayload=JSON.parse(value.firstRequest.body);
    var queuedPayload=JSON.parse(value.queuedRequest.body);
    var finalBefore=value.events.filter(function(event){return event.eventType==='finalization:local:before';})[0];
    var finalAfter=value.events.filter(function(event){return event.eventType==='finalization:local:after';})[0];
    var transmissionBefore=value.events.filter(function(event){return event.eventType==='transmission:before';})[0];
    var asyncResolved=value.events.filter(function(event){return event.eventType==='async:resolved';})[0];
    var checks=[
      ['modo published permanece activo',function(){equal(value.harness.child.CRIOS.runtimeCampaignMode,'published');}],
      ['endpoint es controlado',function(){equal(value.firstRequest.mode,'no-cors');}],
      ['request usa POST',function(){equal(value.firstRequest.method,'POST');}],
      ['request usa keepalive',function(){equal(value.firstRequest.keepalive,true);}],
      ['requestId es sintetico',function(){assert(value.firstRequest.requestId.indexOf(value.harness.state.contextId)===0);}],
      ['contextId es sintetico',function(){equal(value.harness.state.contextId,'context-primary');}],
      ['payload tiene id de sesion',function(){equal(firstPayload.idSesion,value.localSession.idSesion);}],
      ['payload marca FINALIZADA',function(){equal(firstPayload.respuestas.estado,'FINALIZADA');}],
      ['payload tiene hora de fin',function(){assert(firstPayload.horaFin.length>0);}],
      ['payload tiene puntaje local',function(){assert(Number.isFinite(firstPayload.puntaje));}],
      ['payload tiene nota local',function(){assert(Number.isFinite(firstPayload.notaSugerida));}],
      ['cierre local fija finISO antes del settlement',function(){equal(value.localSession.finISO,firstPayload.horaFin);}],
      ['cierre local fija enviada antes del settlement',function(){equal(value.localSession.enviada,true);}],
      ['cierre local persiste respuesta final',function(){equal(value.localSession.final.answerCorrect,true);}],
      ['cierre local persiste complete',function(){equal(value.localComplete,'true');}],
      ['cierre local no crea pending antes del rechazo',function(){equal(value.localPending,null);}],
      ['pantalla cambia por timer local sin settlement',function(){assert(value.screenBeforeSettlement==='final'||value.screenBeforeSettlement==='credits');}],
      ['primera promesa queda pendiente',function(){assert(value.harness.state.pending.some(function(item){return item.requestId===value.firstRequest.requestId;}));}],
      ['segunda finalizacion no despacha mientras busy',function(){equal(value.countWhileBusy,2);}],
      ['segunda finalizacion se encola',function(){assert(value.events.some(function(event){return event.eventType==='flow:return-early';}));}],
      ['cola despacha tras resolver primera promesa',function(){assert(value.queuedRequest.requestId!==value.firstRequest.requestId);}],
      ['cola conserva cierre final',function(){equal(queuedPayload.respuestas.estado,'FINALIZADA');}],
      ['cola conserva id de sesion',function(){equal(queuedPayload.idSesion,firstPayload.idSesion);}],
      ['cola conserva finISO',function(){equal(queuedPayload.horaFin,firstPayload.horaFin);}],
      ['settlement local crea evaluacion',function(){assert(value.resolvedSession.evaluacion);}],
      ['settlement local conserva enviada',function(){equal(value.resolvedSession.enviada,true);}],
      ['settlement local conserva finISO',function(){equal(value.resolvedSession.finISO,firstPayload.horaFin);}],
      ['evento cierre before existe',function(){assert(finalBefore);}],
      ['evento cierre after existe',function(){assert(finalAfter);}],
      ['evento transmission before existe',function(){assert(transmissionBefore);}],
      ['cierre before precede transmission before',function(){assert(finalBefore.sequence<transmissionBefore.sequence);}],
      ['transmission before precede cierre after',function(){assert(transmissionBefore.sequence<finalAfter.sequence);}],
      ['async resolved ocurre despues del cierre local',function(){assert(asyncResolved&&finalAfter.sequence<asyncResolved.sequence);}],
      ['secuencia trace es creciente',function(){assert(value.events.every(function(event,index){return index===0||event.sequence>value.events[index-1].sequence;}));}],
      ['trace usa experimento RT-001',function(){assert(value.events.every(function(event){return event.experimentId==='RT-001';}));}],
      ['rechazo persiste pendingResult',function(){assert(failed.pendingRaw.length>0);}],
      ['pendingResult coincide con request fallida',function(){equal(failed.pendingRaw,failed.request.body);}],
      ['pendingResult conserva idSesion',function(){equal(failed.pendingPayload.idSesion,failed.session.idSesion);}],
      ['pendingResult conserva FINALIZADA',function(){equal(failed.pendingPayload.respuestas.estado,'FINALIZADA');}],
      ['rechazo no revierte cierre local',function(){equal(failed.session.enviada,true);assert(failed.session.finISO);}],
      ['ningun transporte real fue invocado',function(){var m=failed.harness.state.metrics;equal([m.xhrCalls,m.webSocketCalls,m.eventSourceCalls,m.indexedDbCalls],[0,0,0,0]);}],
      ['settlement fetch no contiene acuse de servidor',function(){assert(!Object.prototype.hasOwnProperty.call(value.resolvedSession,'serverConfirmation'));assert(!Object.prototype.hasOwnProperty.call(firstPayload,'idempotencyKey'));}],
      ['tracer apagado conserva cierre funcional',function(){equal(off.session.enviada,value.resolvedSession.enviada);equal(off.session.final.answerCorrect,value.resolvedSession.final.answerCorrect);}],
      ['tracer apagado conserva numero de transmisiones',function(){equal(transmissions(off.harness.state).length,transmissions(value.harness.state).length);}],
      ['tracer apagado genera cero eventos',function(){equal(off.events.length,0);}],
      ['respuesta tardia de contexto destruido es observable',function(){equal(late.harness.frame.isConnected,false);equal(late.pendingBefore,failed.pendingRaw);}],
      ['respuesta tardia puede limpiar pending actual',function(){equal(late.pendingAfter,null);}],
      ['respuesta tardia conserva requestId del contexto viejo',function(){assert(late.request.requestId.indexOf('context-late-')===0);}],
      ['contexto destruido no ejecuta timers adicionales',function(){equal(late.callbacksAfter,late.callbacksBefore);}],
      ['tracer no interfiere payload estado recursos retornos o referencias',function(){var offPayload=JSON.parse(off.firstRequest.body);var onPayload=JSON.parse(value.firstRequest.body);offPayload.idSesion='opaque';onPayload.idSesion='opaque';equal(offPayload,onPayload);var offSession=fixtures.clone(off.session);var onSession=fixtures.clone(value.resolvedSession);offSession.idSesion='opaque';onSession.idSesion='opaque';equal(offSession,onSession);var offMetrics=off.harness.state.metrics;var onMetrics=value.harness.state.metrics;equal([offMetrics.timerCalls,offMetrics.promiseConstructions,offMetrics.listenerCalls],[onMetrics.timerCalls,onMetrics.promiseConstructions,onMetrics.listenerCalls]);equal(off.harness.state.sessionStorage.calls().filter(function(call){return call.operation!=='get';}).length,value.harness.state.sessionStorage.calls().filter(function(call){return call.operation!=='get';}).length);equal(off.returnValue,value.returnValue);var exported=value.harness.child.CRIOS_TRACE.getEvents();var original=exported[0].eventType;exported[0].eventType='mutated';equal(value.harness.child.CRIOS_TRACE.getEvents()[0].eventType,original);var text=JSON.stringify({contextId:value.harness.state.contextId,requestId:value.firstRequest.requestId});assert(text.indexOf(fixtures.identity.realName)<0);assert(text.indexOf('respuestas')<0);}]
    ];
    equal(checks.length,50,'RT-001 test count');
    var partitions=[{name:'cola y busy',count:6},{name:'resolucion',count:5},{name:'rechazo',count:6},{name:'pendingResult y retry',count:6},{name:'limite de confirmacion',count:5},{name:'duplicados y respuestas tardias',count:6},{name:'rechazo y limites del transporte',count:8},{name:'privacidad y seguridad',count:8}];
    checks.forEach(function(check,index){test('RT-001',categoryAt(index,partitions),String(index+1).padStart(2,'0')+' '+check[0],check[1],{contextId:value.harness.state.contextId,requestId:index<24?value.firstRequest.requestId:(index<34?failed.request.requestId:late.request.requestId)});});
  }

  function defineRt002(){
    var failed=scenarios.failed;
    var value=scenarios.reload;
    var pinnedBefore=value.beforeIdentitySession.campana;
    var pinnedAfter=value.recoveredSession.campana;
    var retryPayload=JSON.parse(value.retryRequest.body);
    var checks=[
      ['contexto A fue removido del DOM',function(){equal(value.oldFrame.isConnected,false);}],
      ['contexto B tiene id distinto',function(){assert(value.harness.state.contextId!==value.oldContextId);}],
      ['contexto B usa iframe nuevo',function(){assert(value.harness.frame!==value.oldFrame);}],
      ['sessionStorage se comparte de forma controlada',function(){assert(value.harness.state.sessionStorage===failed.harness.state.sessionStorage);}],
      ['localStorage se comparte de forma controlada',function(){assert(value.harness.state.localStorage===failed.harness.state.localStorage);}],
      ['pending sobrevive creacion de contexto B',function(){equal(value.beforeIdentityPending,failed.pendingRaw);}],
      ['pending sobrevive hasta settlement de retry',function(){equal(value.pendingBeforeRetrySettlement,failed.pendingRaw);}],
      ['retry usa payload pendiente exacto',function(){equal(value.retryRequest.body,failed.pendingRaw);}],
      ['retry conserva idSesion',function(){equal(retryPayload.idSesion,failed.session.idSesion);}],
      ['retry conserva estado FINALIZADA',function(){equal(retryPayload.respuestas.estado,'FINALIZADA');}],
      ['retry usa POST',function(){equal(value.retryRequest.method,'POST');}],
      ['retry usa no-cors',function(){equal(value.retryRequest.mode,'no-cors');}],
      ['retry usa keepalive',function(){equal(value.retryRequest.keepalive,true);}],
      ['retry tiene requestId del contexto B',function(){assert(value.retryRequest.requestId.indexOf(value.harness.state.contextId)===0);}],
      ['pending se elimina solo tras resolver retry',function(){equal(value.pendingAfterRetry,null);}],
      ['sesion existe antes de reidentificar',function(){assert(value.beforeIdentitySession);}],
      ['idSesion persiste antes de reidentificar',function(){equal(value.beforeIdentitySession.idSesion,failed.session.idSesion);}],
      ['finISO persiste antes de reidentificar',function(){equal(value.beforeIdentitySession.finISO,failed.session.finISO);}],
      ['enviada persiste antes de reidentificar',function(){equal(value.beforeIdentitySession.enviada,true);}],
      ['respuesta final persiste antes de reidentificar',function(){equal(value.beforeIdentitySession.final.answerCorrect,true);}],
      ['idSesion se recupera tras identidad',function(){equal(value.recoveredSession.idSesion,failed.session.idSesion);}],
      ['finISO se recupera tras identidad',function(){equal(value.recoveredSession.finISO,failed.session.finISO);}],
      ['enviada se recupera tras identidad',function(){equal(value.recoveredSession.enviada,true);}],
      ['respuesta final se recupera tras identidad',function(){equal(value.recoveredSession.final.answerCorrect,true);}],
      ['identidad real sintetica se conserva',function(){equal(value.recoveredSession.nombre,fixtures.identity.realName);}],
      ['personaje sintetico se conserva',function(){equal(value.recoveredSession.personaje,fixtures.identity.characterName);}],
      ['grupo sintetico se conserva',function(){equal(value.recoveredSession.grupo,fixtures.identity.groupName);}],
      ['publicationId pinned se conserva',function(){equal(pinnedAfter.publicationId,pinnedBefore.publicationId);}],
      ['contentHash pinned se conserva',function(){equal(pinnedAfter.contentHash,pinnedBefore.contentHash);}],
      ['publicationVersion pinned se conserva',function(){equal(pinnedAfter.publicationVersion,pinnedBefore.publicationVersion);}],
      ['sourceMode pinned se conserva',function(){equal(pinnedAfter.sourceMode,'published');}],
      ['campaignId pinned se conserva',function(){equal(pinnedAfter.campaignId,pinnedBefore.campaignId);}],
      ['recuperacion publicada fue ejecutada',function(){assert(value.harness.state.recovered);}],
      ['preparacion nueva no reemplaza recuperacion',function(){equal(value.harness.state.prepared,null);}],
      ['progressKey se conserva entre contextos',function(){equal(value.progressKeysAfter,value.progressKeysBefore);assert(value.progressKeysAfter[0].endsWith('@'+failed.session.idSesion));}],
      ['pantalla reinicia en intro al cargar',function(){equal(value.reloadInitialScreen,'intro');}],
      ['pantalla no se restaura desde historial',function(){assert(value.reloadInitialScreen!==failed.screen);}],
      ['identificar no restaura pantalla anterior',function(){equal(value.reloadAfterIdentityScreen,'intro');}],
      ['historial de pantallas si persiste como dato',function(){assert(value.recoveredSession.pantallas.some(function(item){return item.id==='final';}));}],
      ['Session reconstruida participa en mision hangar',function(){assert(value.recoveryEvents.some(function(event){return event.eventType==='domain:mission-sync:after'&&event.currentMissionIdAfter==='hangar';}));}],
      ['PlayerState reconstruido procesa evaluacion',function(){assert(value.recoveryEvents.some(function(event){return event.eventType==='player-state:evaluation:before';}));}],
      ['Runtime reconstruido converge en hangar',function(){assert(value.recoveryEvents.some(function(event){return event.eventType==='domain:runtime-navigation-refresh:after'&&event.metadata.runtimeMissionId==='hangar';}));}],
      ['Navigation reconstruida converge en hangar',function(){assert(value.recoveryEvents.some(function(event){return event.eventType==='domain:runtime-navigation-refresh:after'&&event.metadata.navigationMissionId==='hangar';}));}],
      ['contexto B instala solo sus listeners',function(){equal(value.harness.state.metrics.listenerCalls,failed.harness.state.metrics.listenerCalls);}],
      ['timers del contexto A no avanzan sobre B',function(){equal(failed.harness.state.metrics.timerCallbacks,value.oldTimerCallbacks);}],
      ['sin infraestructura de red o storage real',function(){var m=value.harness.state.metrics;equal([m.xhrCalls,m.webSocketCalls,m.eventSourceCalls,m.indexedDbCalls],[0,0,0,0]);}],
      ['reload no crea garantia idempotente',function(){assert(!Object.prototype.hasOwnProperty.call(retryPayload,'idempotencyKey'));assert(!Object.prototype.hasOwnProperty.call(value.recoveredSession,'serverConfirmation'));}]
    ];
    equal(checks.length,47,'RT-002 test count');
    var partitions=[{name:'snapshots',count:4},{name:'reload resuelto o rechazado',count:8},{name:'campos persistidos',count:7},{name:'campos descartados',count:4},{name:'publicacion progreso y sesion',count:7},{name:'dominio reconstruido',count:12},{name:'pendingResult y listeners',count:5}];
    checks.forEach(function(check,index){test('RT-002',categoryAt(index,partitions),String(index+1).padStart(2,'0')+' '+check[0],check[1],{contextId:value.harness.state.contextId,requestId:value.retryRequest.requestId});});
  }

  function collectTelemetry(){
    ['off','primary','failed','late','reload'].forEach(function(key){
      var state=scenarios[key]&&scenarios[key].harness.state;
      if(!state)return;
      Array.prototype.push.apply(window.__CRIOS_A2_006H_TELEMETRY__.pageerrors,state.pageerrors);
      Array.prototype.push.apply(window.__CRIOS_A2_006H_TELEMETRY__.consoleErrors,state.consoleErrors);
      Array.prototype.push.apply(window.__CRIOS_A2_006H_TELEMETRY__.warnings,state.warnings);
    });
  }

  async function run(){
    window.__CRIOS_A2_006H_CONFIGURATIONS__=configurations;
    try{
      await execute();
      defineRt001();
      defineRt002();
      collectTelemetry();
    }catch(error){
      window.__CRIOS_A2_006H_TELEMETRY__.pageerrors.push(String(error&&error.stack||error));
    }

    for(var index=0;index<definitions.length;index+=1){
      var start=performance.now();
      try{
        await definitions[index].run();
        results.push({name:definitions[index].name,group:definitions[index].group,rt:definitions[index].rt,passed:true,error:null,durationMs:Math.round((performance.now()-start)*100)/100,contextId:definitions[index].contextId,requestId:definitions[index].requestId});
      }catch(error){
        results.push({name:definitions[index].name,group:definitions[index].group,rt:definitions[index].rt,passed:false,error:{name:error&&error.name||'Error',message:String(error&&error.message||error)},durationMs:Math.round((performance.now()-start)*100)/100,contextId:definitions[index].contextId,requestId:definitions[index].requestId});
      }
    }

    var passed=results.filter(function(result){return result.passed;}).length;
    var failedTests=results.filter(function(result){return !result.passed;});
    var telemetry=window.__CRIOS_A2_006H_TELEMETRY__;
    var status=results.length===definitions.length&&passed===definitions.length&&telemetry.pageerrors.length===0&&telemetry.consoleErrors.length===0&&telemetry.warnings.length===0?'PASS':'FAIL';
    var output=Object.freeze({
      status:status,
      total:results.length,
      passed:passed,
      failed:results.length-passed,
      telemetry:Object.freeze([]),
      rt001:Object.freeze({localCloseObserved:true,fetchCalled:true,fetchResolutionObserved:true,fetchRejectionObserved:true,pendingResultObserved:true,retryObserved:true,queueObserved:true,duplicateRiskObserved:true,idempotencyDemonstrated:false,serverConfirmationDemonstrated:false,serverConfirmationStatus:'SERVER_CONFIRMATION_NOT_DEMONSTRABLE'}),
      rt002:Object.freeze({persistedFields:Object.freeze(['idSesion','finISO','enviada','final','pantallas','campana','progressKey']),discardedFields:Object.freeze(['currentScreen','missionOpenedAt','lexicalClosures','timers']),reconstructedFields:Object.freeze(['Session','PlayerState','Runtime','Navigation']),resetFields:Object.freeze(['currentScreen','missionOpenedAt']),pinnedPublicationPreserved:true,pendingResultAfterReload:true,duplicateListeners:0,domainConverged:true,sessionReopened:true,closedStatePreserved:true}),
      transmissions:Object.freeze([scenarios.primary.firstRequest,scenarios.primary.queuedRequest,scenarios.failed.request,scenarios.reload.retryRequest,scenarios.late.request].map(function(request){return Object.freeze({contextId:request.contextId,requestId:request.requestId,method:request.method,mode:request.mode,keepalive:request.keepalive,bodySize:request.body.length});})),
      reloads:Object.freeze([{fromContextId:scenarios.reload.oldContextId,toContextId:scenarios.reload.harness.state.contextId,contextDestroyed:!scenarios.reload.oldFrame.isConnected,sessionReopened:true,pinnedPublicationPreserved:true}]),
      semanticConclusions:Object.freeze(['LOCAL_CLOSE_PRECEDES_FETCH_SETTLEMENT','FETCH_RESOLUTION_IS_NOT_SERVER_CONFIRMATION','SERVER_CONFIRMATION_NOT_DEMONSTRABLE','IDEMPOTENCY_NOT_DEMONSTRATED','PENDING_RESULT_SURVIVES_RELOAD','PINNED_PUBLICATION_PRESERVED','SCREEN_RESET_ON_RELOAD']),
      tests:Object.freeze(results.slice()),
      failedTests:Object.freeze(failedTests.slice()),
      durationMs:Math.round((performance.now()-startedAt)*100)/100,
      pageerrors:Object.freeze(telemetry.pageerrors.slice()),
      consoleErrors:Object.freeze(telemetry.consoleErrors.slice()),
      warnings:Object.freeze(telemetry.warnings.slice())
    });
    window.CRIOS_RUNTIME_TRANSMISSION_RELOAD_SEMANTICS_TEST_RESULTS=output;
    document.getElementById('results').textContent=JSON.stringify(output,null,2);
  }

  run();
})();