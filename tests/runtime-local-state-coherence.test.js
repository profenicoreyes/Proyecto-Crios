/* CRIOS A2-006G - RT-003 and RT-004 local state coherence */
(function(){
  'use strict';

  var startedAt=performance.now();
  var definitions=[];
  var results=[];
  var telemetry=[];
  var scenarios={};
  var fixtures=window.CRIOS_RUNTIME_LOCAL_STATE_COHERENCE_FIXTURES;

  function test(group,name,run){definitions.push({group:group,name:group+' - '+name,run:run});}
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
  function eventOf(events,type,index){
    var matches=events.filter(function(event){return event.eventType===type;});
    return matches[index||0]||null;
  }
  function eventsOf(events,type){return events.filter(function(event){return event.eventType===type;});}
  function metricDelta(after,before){
    return {
      timerCalls:after.timerCalls-before.timerCalls,
      intervalCalls:after.intervalCalls-before.intervalCalls,
      listenerCalls:after.listenerCalls-before.listenerCalls,
      promiseConstructions:after.promiseConstructions-before.promiseConstructions,
      storageReads:after.storageReads-before.storageReads,
      storageWrites:after.storageWrites-before.storageWrites,
      fetchCalls:after.fetchCalls-before.fetchCalls,
      realNetworkCalls:after.realNetworkCalls-before.realNetworkCalls,
      realStorageCalls:after.realStorageCalls-before.realStorageCalls
    };
  }
  function visibleSnapshot(child){
    var active=child.document.querySelector('.screen.active');
    return {
      activeScreenId:active?active.id:null,
      gameOverElement:Boolean(child.document.getElementById('gameOver')),
      gameOverRoute:child.location.pathname.toLowerCase().indexOf('gameover')>=0||child.location.hash.toLowerCase().indexOf('gameover')>=0,
      missionIds:child.CRIOS.obtenerMisionesActivas().slice(),
      mapActive:Boolean(child.document.getElementById('map')&&child.document.getElementById('map').classList.contains('active')),
      feedback:child.document.getElementById('feedback-energy').textContent
    };
  }

  async function buildHarness(name,configuration){
    var response=await fetch('../index.html?local-coherence-source='+encodeURIComponent(name),{cache:'no-store'});
    var html=await response.text();
    var base='<base href="'+new URL('../',location.href).href+'">';
    html=html.replace('<head>','<head>'+base);
    html=html.replace('<script src="js/config.js"></script>','<script>const CRIOS_CONFIG=Object.freeze({version:"1.25",runtimeCampaignMode:"published",resultsEndpoint:"controlled://local-coherence",variantCount:36,progressSendDelayMs:0,missionReturnDelayMs:0,finalTransitionDelayMs:0,designViewport:Object.freeze({width:1366,height:768}),storage:Object.freeze({progress:"a2g-progress",complete:"a2g-complete",realName:"a2g-real-name",characterName:"a2g-character-name",groupName:"a2g-group-name",sessionStats:"a2g-session-stats",sessionData:"a2g-session-data",pendingResult:"a2g-pending-result",campaignId:"a2g-campaign-id",campaignProgress:"a2g-campaign-progress"})});</script>');
    var injection='<script src="tests/fixtures/publishable-mission-spec-fixtures.js"></script><script src="tests/fixtures/runtime-local-state-coherence-fixtures.js"></script><script>CRIOS_RUNTIME_LOCAL_STATE_COHERENCE_FIXTURES.installChildHarness(CRIOS_RUNTIME_LOCAL_STATE_COHERENCE_FIXTURES.configurations.'+configuration+');</script>';
    html=html.replace('<script src="js/crios.js"></script>',injection+'<script src="js/crios.js"></script>');
    var frame=document.createElement('iframe');
    frame.hidden=true;
    frame.title='Harness '+name;
    document.getElementById('harnesses').appendChild(frame);
    frame.srcdoc=html;
    await waitFor(function(){return frame.contentWindow&&frame.contentWindow.CRIOS&&frame.contentWindow.__CRIOS_LOCAL_COHERENCE_STATE__;});
    var child=frame.contentWindow;
    var state=child.__CRIOS_LOCAL_COHERENCE_STATE__;
    await state.ready;
    await waitFor(function(){return child.CRIOS_DOMAIN&&child.CRIOS_DOMAIN.runtimeBootstrapAdapter&&!child.document.getElementById('groupInput').disabled;});
    var identity=fixtures.identity;
    child.document.getElementById('userNameInput').value=identity.realName;
    child.document.getElementById('characterNameInput').value=identity.characterName;
    child.document.getElementById('groupInput').value=identity.groupName;
    await child.identifyUser();
    await waitFor(function(){return child.CRIOS.obtenerMisionesActivas().length===4&&child.document.getElementById('mission-energy');});
    return {name:name,frame:frame,child:child,state:state};
  }

  function applyIncorrect(child,missionId){
    child.openMission(missionId);
    child.document.getElementById('answer-'+missionId).value='-999999';
    child.validateMissionResult(missionId);
  }

  async function executeRt003(name,recording){
    var harness=await buildHarness(name,recording?'rt003':'off');
    var child=harness.child;
    applyIncorrect(child,'energy');
    applyIncorrect(child,'energy');
    if(recording){
      assert(child.CRIOS_TRACE.startExperiment('RT-003'),'RT-003 did not start.');
    }else{
      child.CRIOS_TRACE.disable();
      child.CRIOS_TRACE.clear();
    }
    var before=fixtures.clone(harness.state.metrics);
    applyIncorrect(child,'energy');
    var after=fixtures.clone(harness.state.metrics);
    var events=child.CRIOS_TRACE.getEvents();
    var status=child.CRIOS_TRACE.status();
    if(recording)child.CRIOS_TRACE.stopExperiment();
    return Object.assign(harness,{
      events:events,
      traceStatus:status,
      metricsDelta:metricDelta(after,before),
      visible:visibleSnapshot(child)
    });
  }

  async function executeRt004(name,recording){
    var harness=await buildHarness(name,recording?'rt004':'off');
    var child=harness.child;
    child.go('map');
    if(recording){
      assert(child.CRIOS_TRACE.startExperiment('RT-004'),'RT-004 did not start.');
    }else{
      child.CRIOS_TRACE.disable();
      child.CRIOS_TRACE.clear();
    }
    var before=fixtures.clone(harness.state.metrics);
    fixtures.expected.nonSequential.forEach(function(missionId){child.openMission(missionId);});
    child.document.getElementById('answer-energy').value='-999999';
    child.validateMissionResult('energy');
    child.go('map');
    var after=fixtures.clone(harness.state.metrics);
    var events=child.CRIOS_TRACE.getEvents();
    var status=child.CRIOS_TRACE.status();
    if(recording)child.CRIOS_TRACE.stopExperiment();
    return Object.assign(harness,{
      events:events,
      traceStatus:status,
      metricsDelta:metricDelta(after,before),
      visible:visibleSnapshot(child)
    });
  }

  function defineTests(){
    var off003=scenarios.off003;
    var rt003=scenarios.rt003;
    var off004=scenarios.off004;
    var rt004=scenarios.rt004;
    var rt3=rt003.events;
    var rt4=rt004.events;
    var evaluationAfter=eventOf(rt3,'domain:evaluation:apply:after');
    var entered=eventOf(rt3,'gameOver:entered');
    var restored=eventOf(rt3,'gameOver:restored');
    var integrationAfter=eventOf(rt3,'domain:integration:after');
    var selectBefore=eventsOf(rt4,'mission:select:before');
    var selectAfter=eventsOf(rt4,'mission:select:after');
    var openAfter=eventsOf(rt4,'mission:open:after');
    var syncAfter=eventsOf(rt4,'domain:mission-sync:after');
    var refreshAfter=eventsOf(rt4,'domain:runtime-navigation-refresh:after');

    test('contrato y precondiciones','modo published controlado',function(){equal(rt003.child.CRIOS.runtimeCampaignMode,'published');});
    test('contrato y precondiciones','cuatro misiones sinteticas exactas',function(){equal(rt003.child.CRIOS.obtenerMisionesActivas(),fixtures.missionIds);});
    test('contrato y precondiciones','tracer real versionado y acotado',function(){equal(rt003.child.CRIOS_TRACE.version,'1.0.0');equal(rt003.traceStatus.capacity,2000);});
    test('contrato y precondiciones','dependencias reales sin Studio ni registro legacy',function(){assert(rt003.child.CRIOS_DOMAIN.playerStateService&&rt003.child.CRIOS_DOMAIN.runtimeCore&&rt003.child.CRIOS_DOMAIN.navigationCore);assert(!rt003.child.CRIOS_STUDIO);equal(rt003.state.metrics.registryReads,0);});

    test('RT-003 transicion tecnica gameOver','estado inicial running con una vida',function(){var before=eventOf(rt3,'player-state:evaluation:before');equal(before.evaluationBefore.status,fixtures.expected.initial.status);equal(before.evaluationBefore.lives,fixtures.expected.initial.lives);});
    test('RT-003 transicion tecnica gameOver','applyEvaluation reduce vidas a cero',function(){equal(evaluationAfter.evaluationAfter.lives,0);});
    test('RT-003 transicion tecnica gameOver','applyEvaluation entra en estado tecnico',function(){equal(evaluationAfter.evaluationAfter.status,'gameOver');equal(evaluationAfter.gameOverAfter,true);});
    test('RT-003 transicion tecnica gameOver','evento entered conserva par before after',function(){equal(entered.gameOverBefore,false);equal(entered.gameOverAfter,true);});
    test('RT-003 transicion tecnica gameOver','entered precede a restored',function(){assert(entered.sequence<restored.sequence);});
    test('RT-003 transicion tecnica gameOver','restore recupera tres vidas',function(){equal(restored.evaluationAfter.lives,3);});
    test('RT-003 transicion tecnica gameOver','restore retorna a running',function(){equal(restored.evaluationAfter.status,'running');equal(restored.gameOverAfter,false);});
    test('RT-003 transicion tecnica gameOver','integracion final conserva mision coherente',function(){equal(integrationAfter.currentMissionIdAfter,'energy');equal(integrationAfter.metadata.runtimeMissionId,'energy');equal(integrationAfter.metadata.navigationMissionId,'energy');});

    test('RT-003 ausencia visible','pantalla activa permanece en mision',function(){equal(rt003.visible.activeScreenId,'mission-energy');});
    test('RT-003 ausencia visible','no existe elemento dedicado gameOver',function(){equal(rt003.visible.gameOverElement,false);equal(entered.visibleEffect.dedicatedGameOverScreen,false);});
    test('RT-003 ausencia visible','ruta no contiene gameOver',function(){equal(rt003.visible.gameOverRoute,false);assert(entered.visibleEffect.routePath.toLowerCase().indexOf('gameover')<0);});
    test('RT-003 ausencia visible','snapshot visible conserva seccion activa',function(){equal(restored.visibleEffect.activeScreenId,'mission-energy');});
    test('RT-003 ausencia visible','feedback funcional sigue siendo reintento',function(){assert(rt003.visible.feedback.indexOf('no coincide')>=0);});

    test('RT-004 cluster inicial','pantalla inicial del experimento es mapa',function(){equal(selectBefore[0].screenBefore,'map');});
    test('RT-004 cluster inicial','Session comienza en energy',function(){equal(selectBefore[0].metadata.sessionMissionId,'energy');});
    test('RT-004 cluster inicial','Runtime comienza en energy',function(){equal(selectBefore[0].metadata.runtimeMissionId,'energy');});
    test('RT-004 cluster inicial','Navigation comienza en energy',function(){equal(selectBefore[0].metadata.navigationMissionId,'energy');});
    test('RT-004 cluster inicial','representaciones se capturan como campos separados',function(){var keys=Object.keys(selectBefore[0].metadata).sort();equal(keys,['navigationMissionId','runtimeMissionId','sessionMissionId','sessionMissionIndex']);});

    fixtures.missionIds.forEach(function(missionId,index){
      test('RT-004 cuatro misiones',missionId+' converge en seleccion',function(){var event=selectAfter.filter(function(item){return item.missionId===missionId;})[0];equal(event.currentMissionIdAfter,missionId);equal(event.metadata.runtimeMissionId,missionId);equal(event.metadata.navigationMissionId,missionId);});
      test('RT-004 cuatro misiones',missionId+' abre su pantalla exacta',function(){var event=openAfter.filter(function(item){return item.missionId===missionId;})[0];equal(event.screenAfter,'mission-'+missionId);assert(Number.isFinite(event.metadata.missionOpenedAt));equal(event.currentMissionIndexAfter,index);});
    });

    test('RT-004 no secuencial y mapa','orden solicitado conserva saltos no secuenciales',function(){equal(selectAfter.slice(0,6).map(function(event){return event.missionId;}),fixtures.expected.nonSequential);});
    test('RT-004 no secuencial y mapa','sync expone divergencia temporal',function(){var event=syncAfter.filter(function(item){return item.missionId==='hangar'&&item.metadata.runtimeMissionId!=='hangar';})[0];assert(event);equal(event.metadata.sessionMissionId,'hangar');});
    test('RT-004 no secuencial y mapa','refresh produce convergencia exacta',function(){assert(refreshAfter.every(function(event){return event.metadata.sessionMissionId===event.metadata.runtimeMissionId&&event.metadata.runtimeMissionId===event.metadata.navigationMissionId;}));});
    test('RT-004 no secuencial y mapa','evaluacion mantiene convergencia',function(){var events=eventsOf(rt4,'domain:integration:after');var event=events[events.length-1];equal(event.currentMissionIdAfter,'energy');equal(event.metadata.runtimeMissionId,'energy');equal(event.metadata.navigationMissionId,'energy');});
    test('RT-004 no secuencial y mapa','regreso final deja mapa coherente',function(){equal(rt004.visible.activeScreenId,'map');equal(rt004.visible.mapActive,true);});

    test('orden traceId sequence snapshots','RT-003 inicia sequence en uno',function(){equal(rt3[0].sequence,1);});
    test('orden traceId sequence snapshots','RT-003 sequence es estrictamente creciente',function(){assert(rt3.every(function(event,index){return index===0||event.sequence>rt3[index-1].sequence;}));});
    test('orden traceId sequence snapshots','RT-004 sequence es estrictamente creciente',function(){assert(rt4.every(function(event,index){return index===0||event.sequence>rt4[index-1].sequence;}));});
    test('orden traceId sequence snapshots','traceIds son estables y distintos',function(){assert(rt3.every(function(event){return event.traceId===rt3[0].traceId;}));assert(rt4.every(function(event){return event.traceId===rt4[0].traceId;}));assert(rt3[0].traceId!==rt4[0].traceId);});
    test('orden traceId sequence snapshots','experimentos no se contaminan y caben en buffer',function(){assert(rt3.every(function(event){return event.experimentId==='RT-003';}));assert(rt4.every(function(event){return event.experimentId==='RT-004';}));assert(rt3.length<=2000&&rt4.length<=2000);});
    test('orden traceId sequence snapshots','getEvents entrega copias defensivas',function(){var exported=rt003.child.CRIOS_TRACE.getEvents();var original=exported[0].metadata;exported[0].metadata={mutated:true};var reread=rt003.child.CRIOS_TRACE.getEvents();equal(reread[0].metadata,original);});

    test('no interferencia y seguridad','tracer apagado produce cero eventos',function(){equal(off003.events.length,0);equal(off004.events.length,0);});
    test('no interferencia y seguridad','RT-003 conserva resultado funcional off on',function(){equal(rt003.visible,off003.visible);});
    test('no interferencia y seguridad','RT-004 conserva resultado funcional off on',function(){equal(rt004.visible,off004.visible);});
    test('no interferencia y seguridad','tracer no agrega timers promesas listeners storage o red',function(){equal(rt003.metricsDelta,off003.metricsDelta);equal(rt004.metricsDelta,off004.metricsDelta);equal(rt003.metricsDelta.realNetworkCalls,0);equal(rt004.metricsDelta.realStorageCalls,0);});
    test('no interferencia y seguridad','trazas excluyen identidad respuestas expected operands y payload',function(){var text=JSON.stringify(rt3.concat(rt4));assert(text.indexOf(fixtures.identity.realName)<0);assert(text.indexOf(fixtures.identity.characterName)<0);assert(text.indexOf('answerRaw')<0);assert(text.indexOf('expected')<0);assert(text.indexOf('operands')<0);assert(text.indexOf('publishedSpec')<0);});
  }

  function collectChildTelemetry(){
    ['off003','rt003','off004','rt004'].forEach(function(key){
      var state=scenarios[key].state;
      Array.prototype.push.apply(window.__CRIOS_A2_006G_TELEMETRY__.pageerrors,state.pageerrors);
      Array.prototype.push.apply(window.__CRIOS_A2_006G_TELEMETRY__.consoleErrors,state.consoleErrors);
      Array.prototype.push.apply(window.__CRIOS_A2_006G_TELEMETRY__.warnings,state.warnings);
    });
  }

  async function run(){
    try{
      scenarios.off003=await executeRt003('off003',false);
      scenarios.rt003=await executeRt003('rt003',true);
      scenarios.off004=await executeRt004('off004',false);
      scenarios.rt004=await executeRt004('rt004',true);
      defineTests();
      collectChildTelemetry();
    }catch(error){
      window.__CRIOS_A2_006G_TELEMETRY__.pageerrors.push(String(error&&error.stack||error));
    }

    for(var index=0;index<definitions.length;index+=1){
      var start=performance.now();
      try{
        var outcome=await definitions[index].run();
        results.push({name:definitions[index].name,group:definitions[index].group,passed:outcome!==false,error:null,durationMs:Math.round((performance.now()-start)*100)/100});
      }catch(error){
        results.push({name:definitions[index].name,group:definitions[index].group,passed:false,error:{name:error&&error.name||'Error',message:String(error&&error.message||error)},durationMs:Math.round((performance.now()-start)*100)/100});
      }
    }

    var passed=results.filter(function(item){return item.passed;}).length;
    var failedTests=results.filter(function(item){return !item.passed;});
    var captured=window.__CRIOS_A2_006G_TELEMETRY__;
    var status=results.length>=46&&passed===results.length&&captured.pageerrors.length===0&&captured.consoleErrors.length===0&&captured.warnings.length===0?'PASS':'FAIL';
    var output=Object.freeze({
      status:status,
      total:results.length,
      passed:passed,
      failed:results.length-passed,
      tests:Object.freeze(results.slice()),
      failedTests:Object.freeze(failedTests.slice()),
      durationMs:Math.round((performance.now()-startedAt)*100)/100,
      pageerrors:Object.freeze(captured.pageerrors.slice()),
      consoleErrors:Object.freeze(captured.consoleErrors.slice()),
      warnings:Object.freeze(captured.warnings.slice()),
      telemetry:Object.freeze(telemetry.slice()),
      rt003:Object.freeze({traceId:scenarios.rt003&&scenarios.rt003.traceStatus.traceId||null,eventCount:scenarios.rt003&&scenarios.rt003.events.length||0,visible:scenarios.rt003&&scenarios.rt003.visible||null}),
      rt004:Object.freeze({traceId:scenarios.rt004&&scenarios.rt004.traceStatus.traceId||null,eventCount:scenarios.rt004&&scenarios.rt004.events.length||0,visible:scenarios.rt004&&scenarios.rt004.visible||null})
    });
    window.CRIOS_RUNTIME_LOCAL_STATE_COHERENCE_TEST_RESULTS=output;
    document.getElementById('results').textContent=JSON.stringify(output,null,2);
  }

  run();
})();
