/* CRIOS A2-011 - first active legacy Game Flow integration */
(function(){
  'use strict';

  var startedAt=performance.now();
  var definitions=[];
  var results=[];
  var scenarios={};
  var sourceContract=null;
  var harnessCounter=0;
  var STORAGE={
    progress:'a2-011-first-progress',
    complete:'a2-011-first-complete',
    realName:'a2-011-first-real-name',
    characterName:'a2-011-first-character-name',
    groupName:'a2-011-first-group-name',
    sessionStats:'a2-011-first-session-stats',
    sessionData:'a2-011-first-session-data',
    pendingResult:'a2-011-first-pending-result',
    campaignId:'a2-011-first-campaign-id',
    campaignProgress:'a2-011-first-campaign-progress'
  };

  function test(group,name,run){definitions.push({group:group,name:group+' - '+name,run:run});}
  function assert(value,message){if(!value)throw new Error(message||'Assertion failed.');}
  function equal(actual,expected,message){assert(JSON.stringify(actual)===JSON.stringify(expected),(message||'Values differ')+' actual='+JSON.stringify(actual)+' expected='+JSON.stringify(expected));}
  function count(text,pattern){var matches=String(text).match(pattern);return matches?matches.length:0;}
  function eventsOf(events,type){return events.filter(function(event){return event.eventType===type;});}
  function activeScreen(child){var element=child.document.querySelector('.screen.active');return element?element.id:null;}
  function parseJson(value,fallback){try{return JSON.parse(value);}catch(error){return fallback;}}
  function parentTelemetry(){return document.getElementById('results').__criosTelemetry;}
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
  function settle(delay){return new Promise(function(resolve){setTimeout(resolve,delay||280);});}

  function childControl(){
    var state=window.__CRIOS_A2_011_CHILD__={
      fetchBodies:[],fetchCalls:[],storageWrites:[],pageerrors:[],consoleErrors:[],warnings:[],beacons:[],oscillatorStarts:0
    };
    var originalError=console.error;
    var originalWarn=console.warn;
    console.error=function(){state.consoleErrors.push(Array.prototype.join.call(arguments,' '));return originalError.apply(console,arguments);};
    console.warn=function(){state.warnings.push(Array.prototype.join.call(arguments,' '));return originalWarn.apply(console,arguments);};
    window.addEventListener('error',function(event){state.pageerrors.push(String(event.message||event.error||'error'));});
    window.addEventListener('unhandledrejection',function(event){state.pageerrors.push(String(event.reason||'rejection'));});

    var originalSetItem=Storage.prototype.setItem;
    Storage.prototype.setItem=function(key,value){
      if(this===window.sessionStorage)state.storageWrites.push({key:String(key),value:String(value)});
      return originalSetItem.call(this,key,value);
    };

    function response(json){
      return Promise.resolve({
        ok:true,status:200,
        json:function(){return Promise.resolve(json||{ok:true});},
        text:function(){return Promise.resolve(JSON.stringify(json||{ok:true}));}
      });
    }
    window.fetch=function(url,options){
      var entry={url:String(url),method:String(options&&options.method||'GET'),body:options&&options.body!==undefined?String(options.body):null};
      state.fetchCalls.push(entry);
      if(entry.body!==null)state.fetchBodies.push(entry.body);
      if(entry.url.indexOf('accion=grupos')>=0)return response({ok:true,grupos:['A2-011']});
      return response({ok:true});
    };
    try{
      Object.defineProperty(window.navigator,'sendBeacon',{configurable:true,value:function(url,body){state.beacons.push({url:String(url),body:String(body||'')});return true;}});
    }catch(error){window.navigator.sendBeacon=function(){return true;};}

    function fakeAudioParam(value){
      return {
        value:value||0,
        setValueAtTime:function(next){this.value=next;},
        exponentialRampToValueAtTime:function(next){this.value=next;}
      };
    }
    function fakeAudioNode(){return {connect:function(){return this;},disconnect:function(){}};}
    function FakeAudioContext(){this.state='running';this.destination={};this.currentTime=0;}
    FakeAudioContext.prototype.createOscillator=function(){
      var node=fakeAudioNode();
      node.frequency=fakeAudioParam(0);
      node.detune=fakeAudioParam(0);
      node.type='sine';
      node.start=function(){state.oscillatorStarts+=1;};
      node.stop=function(){};
      return node;
    };
    FakeAudioContext.prototype.createGain=function(){var node=fakeAudioNode();node.gain=fakeAudioParam(0);return node;};
    FakeAudioContext.prototype.createBiquadFilter=function(){var node=fakeAudioNode();node.frequency=fakeAudioParam(0);node.Q=fakeAudioParam(0);node.type='lowpass';return node;};
    FakeAudioContext.prototype.createDynamicsCompressor=function(){return fakeAudioNode();};
    FakeAudioContext.prototype.resume=function(){this.state='running';return Promise.resolve();};
    FakeAudioContext.prototype.close=function(){return Promise.resolve();};
    window.AudioContext=FakeAudioContext;
    window.webkitAudioContext=FakeAudioContext;
  }

  function controlledConfig(){
    return '<script>const CRIOS_CONFIG=Object.freeze({version:"1.25",runtimeCampaignMode:"legacy",resultsEndpoint:"controlled://a2-011-first-integration",variantCount:36,progressSendDelayMs:0,missionReturnDelayMs:0,finalTransitionDelayMs:0,designViewport:Object.freeze({width:1366,height:768}),storage:Object.freeze('+JSON.stringify(STORAGE)+')});<\/script>';
  }

  async function buildHarness(name){
    var response=await fetch('../index.html?a2-011-source='+encodeURIComponent(name),{cache:'no-store'});
    var html=await response.text();
    var base='<base href="'+new URL('../',location.href).href+'">';
    html=html.replace('<head>','<head>'+base);
    html=html.replace('<script src="js/config.js"></script>',controlledConfig());
    var control='<script>('+childControl.toString()+')();<\/script>';
    html=html.replace('<script src="js/crios.js"></script>',control+'<script src="js/crios.js"></script>');

    var frame=document.createElement('iframe');
    frame.hidden=true;
    frame.title='A2-011 harness '+name;
    frame.dataset.harness=String(++harnessCounter);
    document.getElementById('harnesses').appendChild(frame);
    frame.srcdoc=html;
    await waitFor(function(){
      var child=frame.contentWindow;
      return child&&child.CRIOS&&child.CRIOS_DOMAIN&&child.CRIOS_DOMAIN.playerStateService&&child.CRIOS_DOMAIN.runtimeCore&&child.CRIOS_DOMAIN.navigationCore&&child.document.getElementById('groupInput')&&!child.document.getElementById('groupInput').disabled&&!child.document.getElementById('identifyButton').disabled;
    });

    var child=frame.contentWindow;
    var harness={name:name,frame:frame,child:child,state:child.__CRIOS_A2_011_CHILD__,restore:null};
    installInstrumentation(harness);
    child.document.getElementById('userNameInput').value='Equipo A2-011';
    child.document.getElementById('characterNameInput').value='Operador A2-011';
    child.document.getElementById('groupInput').value='A2-011';
    await child.identifyUser();
    await waitFor(function(){return child.CRIOS.obtenerMisionesActivas().length===4&&child.document.getElementById('mission-energy');});
    await waitFor(function(){return harness.metrics.createRuntime.length>=1&&harness.metrics.createNavigation.length>=1;});
    await settle();
    return harness;
  }

  function installInstrumentation(harness){
    var child=harness.child;
    var domain=child.CRIOS_DOMAIN;
    var originals={
      playerStateService:domain.playerStateService,
      runtimeCore:domain.runtimeCore,
      navigationCore:domain.navigationCore
    };
    var metrics={applyEvaluation:[],restorePlayerState:[],createRuntime:[],createNavigation:[]};
    var player=Object.assign({},originals.playerStateService);
    var runtime=Object.assign({},originals.runtimeCore);
    var navigation=Object.assign({},originals.navigationCore);

    player.applyEvaluation=function(){
      var args=Array.prototype.slice.call(arguments);metrics.applyEvaluation.push(args);
      return originals.playerStateService.applyEvaluation.apply(originals.playerStateService,args);
    };
    player.restorePlayerState=function(){
      var args=Array.prototype.slice.call(arguments);metrics.restorePlayerState.push(args);
      return originals.playerStateService.restorePlayerState.apply(originals.playerStateService,args);
    };
    runtime.createRuntime=function(){
      var args=Array.prototype.slice.call(arguments);metrics.createRuntime.push(args);
      return originals.runtimeCore.createRuntime.apply(originals.runtimeCore,args);
    };
    navigation.createNavigation=function(){
      var args=Array.prototype.slice.call(arguments);metrics.createNavigation.push(args);
      return originals.navigationCore.createNavigation.apply(originals.navigationCore,args);
    };
    domain.playerStateService=player;
    domain.runtimeCore=runtime;
    domain.navigationCore=navigation;
    harness.metrics=metrics;
    harness.wrapped={player:player,runtime:runtime,navigation:navigation};
    harness.restore=function(){
      domain.playerStateService=originals.playerStateService;
      domain.runtimeCore=originals.runtimeCore;
      domain.navigationCore=originals.navigationCore;
    };
    return metrics;
  }

  function resetMeasurement(harness,experimentId){
    Object.keys(harness.metrics).forEach(function(key){harness.metrics[key].length=0;});
    harness.state.fetchBodies.length=0;
    harness.state.fetchCalls.length=0;
    harness.state.storageWrites.length=0;
    harness.state.pageerrors.length=0;
    harness.state.consoleErrors.length=0;
    harness.state.warnings.length=0;
    harness.state.beacons.length=0;
    harness.state.oscillatorStarts=0;
    harness.child.CRIOS_TRACE.clear();
    if(harness.child.CRIOS_TRACE.isRecording())harness.child.CRIOS_TRACE.stopExperiment();
    assert(harness.child.CRIOS_TRACE.startExperiment('RT-008'),'Trace did not start for '+experimentId+'.');
  }

  function openEnergyMission(child){
    child.openMission('energy');
  }

  function submitCurrentIncorrect(child){
    child.document.getElementById('answer-energy').value='-999999';
    child.validateMissionResult('energy');
  }

  function submitIncorrect(child){
    openEnergyMission(child);
    submitCurrentIncorrect(child);
  }

  async function discoverExpected(harness){
    submitIncorrect(harness.child);
    await settle();
    var session=parseJson(harness.child.sessionStorage.getItem(STORAGE.sessionData),null);
    assert(session&&session.misiones&&Number.isFinite(session.misiones.energy.expected),'Expected was not persisted.');
    return session.misiones.energy.expected;
  }

  function snapshot(harness){
    var child=harness.child;
    var trace=child.CRIOS_TRACE.getEvents();
    var data={
      metrics:{
        applyEvaluation:harness.metrics.applyEvaluation.length,
        restorePlayerState:harness.metrics.restorePlayerState.length,
        createRuntime:harness.metrics.createRuntime.length,
        createNavigation:harness.metrics.createNavigation.length
      },
      metricArguments:harness.metrics,
      progress:parseJson(child.sessionStorage.getItem(STORAGE.progress),{}),
      campaignProgress:parseJson(child.sessionStorage.getItem(STORAGE.campaignProgress),{}),
      sessionStats:parseJson(child.sessionStorage.getItem(STORAGE.sessionStats),{}),
      sessionData:parseJson(child.sessionStorage.getItem(STORAGE.sessionData),{}),
      storageWrites:harness.state.storageWrites.slice(),
      fetchBodies:harness.state.fetchBodies.map(function(body){return parseJson(body,body);}),
      activeScreen:activeScreen(child),
      feedback:child.document.getElementById('feedback-energy').textContent,
      events:trace,
      warnings:harness.state.warnings.slice(),
      errors:harness.state.pageerrors.concat(harness.state.consoleErrors),
      oscillatorStarts:harness.state.oscillatorStarts,
      operational:Boolean(child.CRIOS&&child.CRIOS.obtenerMisionesActivas().length===4&&child.document.getElementById('answer-energy'))
    };
    if(child.CRIOS_TRACE.isRecording())child.CRIOS_TRACE.stopExperiment();
    return data;
  }

  async function withHarness(name,run){
    var harness=await buildHarness(name);
    try{
      return await run(harness);
    }finally{
      try{
        if(harness.restore)harness.restore();
        Object.keys(STORAGE).forEach(function(key){harness.child.sessionStorage.removeItem(STORAGE[key]);});
        harness.child.localStorage.removeItem(STORAGE.pendingResult);
      }finally{harness.frame.remove();}
    }
  }

  async function runCorrect(){
    return withHarness('correct',async function(harness){
      var expected=await discoverExpected(harness);
      openEnergyMission(harness.child);
      await settle();
      resetMeasurement(harness,'A2-011-CORRECT');
      harness.child.document.getElementById('answer-energy').value=String(expected);
      harness.child.validateMissionResult('energy');
      await settle();
      return snapshot(harness);
    });
  }

  async function runIncorrect(){
    return withHarness('incorrect',async function(harness){
      openEnergyMission(harness.child);
      await settle();
      resetMeasurement(harness,'A2-011-INCORRECT');
      submitCurrentIncorrect(harness.child);
      await settle();
      return snapshot(harness);
    });
  }

  async function runGameOver(){
    return withHarness('game-over',async function(harness){
      submitIncorrect(harness.child);
      await settle();
      submitIncorrect(harness.child);
      await settle();
      openEnergyMission(harness.child);
      await settle();
      resetMeasurement(harness,'A2-011-GAME-OVER');
      submitCurrentIncorrect(harness.child);
      await settle();
      return snapshot(harness);
    });
  }

  async function runDownstreamFailure(){
    return withHarness('downstream-failure',async function(harness){
      var expected=await discoverExpected(harness);
      openEnergyMission(harness.child);
      await settle();
      resetMeasurement(harness,'A2-011-DOWNSTREAM-FAILURE');
      harness.wrapped.runtime.createRuntime=function(){
        var args=Array.prototype.slice.call(arguments);
        harness.metrics.createRuntime.push(args);
        throw new Error('A2_011_FORCED_RUNTIME_FAILURE');
      };
      harness.child.document.getElementById('answer-energy').value=String(expected);
      harness.child.validateMissionResult('energy');
      await settle();
      return snapshot(harness);
    });
  }

  async function readSourceContract(){
    var response=await fetch('../js/crios.js?source-contract=a2-011',{cache:'no-store'});
    var source=await response.text();
    source=source.replace(/\r\n?/g,'\n');
    var validate=(source.match(/function validateMissionResult\(id\)\{[\s\S]*?\n\}\nfunction registerHint/)||[''])[0];
    var finalProcedure=(source.match(/function validateFinalProcedure\(\)[\s\S]*?\n\}/)||[''])[0];
    var finalFlow=(source.match(/function validateFinal\(\)[\s\S]*?\n\}/)||[''])[0];
    return {
      source:source,
      importCount:count(source,/import\('\.\/game-flow\/game-flow-legacy-adapter\.js'\)/g),
      promiseCacheCount:count(source,/let gameFlowLegacyAdapterPromise\s*=\s*null/g),
      executeCount:count(source,/missionGameFlowAdapter\.execute\(command\)/g),
      validateAsync:/async\s+function\s+validateMissionResult/.test(source),
      queueCount:count(validate,/queueSessionUpdate\(\)/g),
      saveCount:count(validate,/save\(\)/g),
      delegatedCampaignCompletedCount:count(source,/campaignCompleted:\s*result\.campaignCompleted/g),
      finalUsesGameFlow:/GameFlow|applyDomainEvaluationForMission|missionGameFlowAdapter/.test(finalProcedure+finalFlow)
    };
  }

  function defineTests(){
    var correct=scenarios.correct;
    var incorrect=scenarios.incorrect;
    var gameOver=scenarios.gameOver;
    var failure=scenarios.failure;

    test('contrato y carga','index real inicia legacy con cuatro misiones y contratos reales',function(){equal(correct.activeScreen,'map');assert(correct.operational);});
    test('contrato y carga','adaptador se importa una vez mediante Promise cacheada',function(){equal(sourceContract.importCount,1);equal(sourceContract.promiseCacheCount,1);});
    test('contrato y carga','Game Flow se ejecuta una vez y validateMissionResult permanece sincrona',function(){equal(sourceContract.executeCount,1);equal(sourceContract.validateAsync,false);});
    test('contrato y carga','validateMissionResult conserva una cola y un save',function(){equal(sourceContract.queueCount,1);equal(sourceContract.saveCount,1);});
    test('contrato y carga','Progress delega campaignCompleted y flujo final no usa Game Flow',function(){equal(sourceContract.delegatedCampaignCompletedCount,1);equal(sourceContract.finalUsesGameFlow,false);});

    test('respuesta correcta','PlayerState evalua una vez sin restauracion',function(){equal(correct.metrics.applyEvaluation,1);equal(correct.metrics.restorePlayerState,0);});
    test('respuesta correcta','Runtime y Navigation se reconstruyen una vez',function(){equal(correct.metrics.createRuntime,1);equal(correct.metrics.createNavigation,1);});
    test('respuesta correcta','progreso energy se completa una sola vez',function(){equal(correct.progress.energy,true);var writes=correct.storageWrites.filter(function(item){return item.key===STORAGE.progress&&parseJson(item.value,{}).energy===true;});equal(writes.length,1);});
    test('respuesta correcta','estadisticas y registro conservan finalizacion tiempo y acierto',function(){equal(correct.sessionStats.energy.completed,true);assert(Number.isFinite(correct.sessionStats.energy.timeMs)&&correct.sessionStats.energy.timeMs>=0);equal(correct.sessionData.misiones.energy.answerCorrect,true);equal(correct.sessionData.misiones.energy.timeMs,correct.sessionStats.energy.timeMs);});
    test('respuesta correcta','feedback compatible termina en mapa',function(){assert(correct.feedback.indexOf('Resultado compatible')>=0);equal(correct.activeScreen,'map');});
    test('respuesta correcta','no entra en game over ni duplica propietarios',function(){equal(eventsOf(correct.events,'gameOver:entered').length,0);equal(correct.errors.length,0);});

    test('respuesta incorrecta','PlayerState evalua una vez sin restauracion',function(){equal(incorrect.metrics.applyEvaluation,1);equal(incorrect.metrics.restorePlayerState,0);});
    test('respuesta incorrecta','Runtime y Navigation se reconstruyen una vez',function(){equal(incorrect.metrics.createRuntime,1);equal(incorrect.metrics.createNavigation,1);});
    test('respuesta incorrecta','progreso sigue incompleto y answerCorrect es false',function(){assert(incorrect.progress.energy!==true);equal(incorrect.sessionData.misiones.energy.answerCorrect,false);});
    test('respuesta incorrecta','permanece en mision con mensaje de reintento',function(){equal(incorrect.activeScreen,'mission-energy');assert(incorrect.feedback.indexOf('no coincide')>=0);});
    test('respuesta incorrecta','no entra en game over',function(){equal(eventsOf(incorrect.events,'gameOver:entered').length,0);equal(incorrect.errors.length,0);});

    test('game over','PlayerState evalua y restaura exactamente una vez',function(){equal(gameOver.metrics.applyEvaluation,1);equal(gameOver.metrics.restorePlayerState,1);});
    test('game over','Runtime y Navigation se reconstruyen externamente una vez',function(){equal(gameOver.metrics.createRuntime,1);equal(gameOver.metrics.createNavigation,1);});
    test('game over','entered y restored aparecen una vez y en orden',function(){var entered=eventsOf(gameOver.events,'gameOver:entered');var restored=eventsOf(gameOver.events,'gameOver:restored');equal(entered.length,1);equal(restored.length,1);assert(entered[0].sequence<restored[0].sequence);});
    test('game over','estado vuelve a running con vidas maximas',function(){var restored=eventsOf(gameOver.events,'gameOver:restored')[0];equal(restored.evaluationAfter.status,'running');equal(restored.evaluationAfter.lives,3);});
    test('game over','progreso y pantalla permanecen en reintento sin mapa',function(){assert(gameOver.progress.energy!==true);equal(gameOver.activeScreen,'mission-energy');assert(gameOver.feedback.indexOf('no coincide')>=0);equal(eventsOf(gameOver.events,'screen:render:after').some(function(event){return event.screenAfter==='map';}),false);});

    test('fallo posterior a Progress','PlayerState y Runtime se intentan una vez sin Navigation',function(){equal(failure.metrics.applyEvaluation,1);equal(failure.metrics.createRuntime,1);equal(failure.metrics.createNavigation,0);});
    test('fallo posterior a Progress','muestra asistencia no navega ni reproduce exito y sigue operativo',function(){assert(failure.feedback.indexOf('No fue posible actualizar el estado de la misión')>=0);equal(failure.activeScreen,'mission-energy');equal(failure.oscillatorStarts,0);assert(failure.operational);var caught=eventsOf(failure.events,'error:caught').filter(function(event){return event.sourceFile==='js/crios.js'&&(event.error==='A2_011_FORCED_RUNTIME_FAILURE'||event.error&&event.error.message==='A2_011_FORCED_RUNTIME_FAILURE');});equal(caught.length,1);});
    test('fallo posterior a Progress','no persiste ni transmite estado parcial completado',function(){assert(failure.progress.energy!==true);assert(JSON.stringify(failure.campaignProgress).indexOf('"energy":true')<0);assert(failure.sessionData.misiones.energy.answerCorrect!==true);assert(failure.fetchBodies.every(function(payload){return !payload||!payload.respuestas||!payload.respuestas.misiones||!payload.respuestas.misiones.energy||payload.respuestas.misiones.energy.answerCorrect!==true;}));});
  }

  async function run(){
    try{
      sourceContract=await readSourceContract();
      scenarios.correct=await runCorrect();
      scenarios.incorrect=await runIncorrect();
      scenarios.gameOver=await runGameOver();
      scenarios.failure=await runDownstreamFailure();
      defineTests();
    }catch(error){
      parentTelemetry().pageerrors.push(String(error&&error.stack||error));
      document.querySelectorAll('iframe').forEach(function(frame){frame.remove();});
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

    document.querySelectorAll('#harnesses iframe').forEach(function(frame){frame.remove();});
    var telemetry=parentTelemetry();
    var unexpectedWarnings=[];
    [scenarios.correct,scenarios.incorrect,scenarios.gameOver].forEach(function(scenario){if(scenario)Array.prototype.push.apply(unexpectedWarnings,scenario.warnings);});
    if(scenarios.failure){Array.prototype.push.apply(unexpectedWarnings,scenarios.failure.warnings.filter(function(message){return message.indexOf('A2_011_FORCED_RUNTIME_FAILURE')<0;}));}
    var passed=results.filter(function(item){return item.passed;}).length;
    var output=Object.freeze({
      status:definitions.length===24&&passed===24&&telemetry.pageerrors.length===0&&telemetry.consoleErrors.length===0&&telemetry.warnings.length===0&&unexpectedWarnings.length===0?'PASS':'FAIL',
      total:definitions.length,
      passed:passed,
      failed:definitions.length-passed,
      tests:Object.freeze(results.slice()),
      failedTests:Object.freeze(results.filter(function(item){return !item.passed;})),
      durationMs:Math.round((performance.now()-startedAt)*100)/100,
      pageerrors:Object.freeze(telemetry.pageerrors.slice()),
      consoleErrors:Object.freeze(telemetry.consoleErrors.slice()),
      warnings:Object.freeze(telemetry.warnings.slice()),
      unexpectedChildWarnings:Object.freeze(unexpectedWarnings.slice()),
      framesRemaining:document.querySelectorAll('#harnesses iframe').length
    });
    window.CRIOS_GAME_FLOW_FIRST_LEGACY_INTEGRATION_TEST_RESULTS=output;
    document.getElementById('results').textContent=JSON.stringify(output,null,2);
  }

  run();
})();
