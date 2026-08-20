(function(){
  'use strict';

  var total = 0;
  var failed = 0;
  var messages = [];
  var output = document.getElementById('output');
  var status = document.getElementById('status');

  function render(){ output.textContent = messages.join('\n'); }

  function ok(condition,label){
    total += 1;
    if(condition) messages.push('PASS '+label);
    else { failed += 1; messages.push('FAIL '+label); }
    render();
  }

  function eq(actual,expected,label){
    ok(JSON.stringify(actual)===JSON.stringify(expected),label+
      ' expected='+JSON.stringify(expected)+' actual='+JSON.stringify(actual));
  }

  function waitFor(check,timeout,label){
    var deadline=Date.now()+(timeout||10000);
    return new Promise(function(resolve,reject){
      (function poll(){
        var value;
        try{value=check();}catch(error){reject(error);return;}
        if(value){resolve(value);return;}
        if(Date.now()>deadline){reject(new Error('Timed out: '+label));return;}
        setTimeout(poll,25);
      })();
    });
  }

  function installControlledHostEnvironment(){
    var context={
      roomId:'room-host-browser-smoke',
      participantId:'host-browser-smoke',
      campaignId:'campaign-host-browser-smoke',
      publicationId:'publication-host-browser-smoke',
      campaignName:'Campaña sintética',
      runtimeHref:'http://127.0.0.1/runtime-smoke',
      missionOrder:['energy','greenhouse','ice'],
      playerHref:'http://127.0.0.1/player-smoke?roomId=room-host-browser-smoke'
    };
    sessionStorage.setItem('crios-live-room-host-context-v1',JSON.stringify(context));
    localStorage.removeItem('crios-live-room-host-context-v1');
    history.replaceState(null,'','/host/?roomId='+encodeURIComponent(context.roomId)+
      '&campaignId='+encodeURIComponent(context.campaignId)+
      '&publicationId='+encodeURIComponent(context.publicationId));

    var logicalNow=Date.parse('2026-08-19T12:00:00.000Z');
    var completed=[];
    var activePlayers=2;
    var failNextGameRead=false;
    var signalListener=null;
    var authors=[];
    var calls={room:0,heartbeat:0,roster:0,gameRead:0,gameContexts:[],operations:[],signals:[]};
    Date.now=function(){return logicalNow;};
    Math.random=function(){return 0;};

    function snapshot(){
      return {
        schemaVersion:'1.0',
        roomId:context.roomId,
        campaignId:context.campaignId,
        publicationId:context.publicationId,
        revision:completed.length,
        completedMissionIds:completed.slice(),
        updatedAt:new Date(Date.parse('2026-08-19T12:00:00.000Z')+completed.length*60000).toISOString()
      };
    }

    function roster(){
      return {
        registeredParticipantCount:3,
        activeParticipantCount:activePlayers+1,
        activePlayerCount:activePlayers,
        hostConnected:true,
        participants:[
          {participantId:context.participantId,role:'host',connected:true},
          {participantId:'player-a-browser-smoke',role:'player',connected:activePlayers>=1},
          {participantId:'player-b-browser-smoke',role:'player',connected:activePlayers>=2}
        ]
      };
    }

    var client={
      available:function(){return true;},
      getLiveRoom:async function(){
        calls.room+=1;
        return {success:true,data:{room:{roomId:context.roomId,campaignId:context.campaignId,publicationId:context.publicationId,status:'active'}},error:null};
      },
      heartbeatLiveRoom:async function(){
        calls.heartbeat+=1;
        return {success:true,data:{room:{roomId:context.roomId,campaignId:context.campaignId,publicationId:context.publicationId,status:'active'}},error:null};
      },
      getLiveRoomRoster:async function(){
        calls.roster+=1;
        return {success:true,data:{roster:roster()},error:null};
      },
      createGameStateClient:function(gameContext){
        calls.gameContexts.push(JSON.parse(JSON.stringify(gameContext)));
        return {
          available:function(){return true;},
          getLiveRoomGameState:async function(){
            calls.gameRead+=1;
            calls.operations.push('getLiveRoomGameState');
            if(failNextGameRead){
              failNextGameRead=false;
              return {success:false,data:null,error:{code:'SERVER_ERROR',message:'Falla transitoria sintética',retryable:true}};
            }
            return {success:true,data:{gameState:snapshot(),stateAdvanced:true},error:null};
          }
        };
      },
      forgetCapability:function(){return true;}
    };

    window.CRIOS_LIVE_ROOM_BROWSER=Object.freeze({configured:true,error:null,client:client});
    window.CRIOS_LIVE_ROOM_REALTIME_TRANSPORT=Object.freeze({
      createTransport:function(){
        return {
          subscribeRoom:function(roomId,listener){signalListener=listener;return roomId===context.roomId;},
          unsubscribeRoom:function(){signalListener=null;return true;},
          publishSignal:function(){return true;},
          destroy:function(){signalListener=null;}
        };
      }
    });
    window.__CRIOS_HOST_GAME_STATE_SMOKE__={
      context:context,
      calls:calls,
      authors:authors,
      advance:function(milliseconds){logicalNow+=milliseconds;},
      complete:function(missionId,participantId){
        if(completed.indexOf(missionId)<0){
          completed.push(missionId);
          completed.sort(function(left,right){return context.missionOrder.indexOf(left)-context.missionOrder.indexOf(right);});
          authors.push(participantId);
        }
      },
      emit:function(type){
        calls.signals.push(type);
        if(signalListener)signalListener({type:type,eventId:'event-'+calls.signals.length,emittedAt:new Date(logicalNow).toISOString()});
      },
      failNextGameRead:function(){failNextGameRead=true;},
      setActivePlayers:function(value){activePlayers=value;},
      snapshot:snapshot
    };
  }

  async function buildHarness(){
    var response=await fetch('../host/index.html?host-game-state-smoke-source=browser',{cache:'no-store'});
    if(!response.ok)throw new Error('HOST_INDEX_FETCH_FAILED: '+response.status);
    var html=await response.text();
    var base='<base href="'+new URL('../host/',location.href).href+'">';
    html=html.replace('<head>','<head>'+base);
    html=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
    var scripts='<script>('+installControlledHostEnvironment.toString()+')();<\/script>'+
      '<script src="../js/live-room/live-room-game-state-model.js"><\/script>'+
      '<script src="../js/live-room/live-room-game-state-reconciliation.js"><\/script>'+
      '<script src="../js/host/host-console.js"><\/script>';
    html=html.replace('</body>',scripts+'</body>');

    var frame=document.createElement('iframe');
    frame.title='CRIOS host game-state browser harness';
    document.getElementById('harnesses').appendChild(frame);
    frame.src='./runtime-live-room-game-state-browser-shell.html?host-token='+Math.random().toString(36).slice(2);
    await waitFor(function(){return frame.contentWindow&&frame.contentWindow.location.pathname.endsWith('/tests/runtime-live-room-game-state-browser-shell.html');},10000,'same-origin host shell');
    var child=frame.contentWindow;
    var pageErrors=[];
    var promiseErrors=[];
    child.addEventListener('error',function(event){pageErrors.push(String(event.error&&event.error.stack||event.message||event.error));});
    child.addEventListener('unhandledrejection',function(event){promiseErrors.push(String(event.reason&&event.reason.stack||event.reason));});
    child.document.open();
    child.document.write(html);
    child.document.close();
    await waitFor(function(){
      return child.CRIOS_HOST_CONSOLE_CONTROLLER&&child.CRIOS_HOST_CONSOLE_CONTROLLER.getState().status==='ACTIVE'&&
        child.document.getElementById('hostConsoleProgressValue').textContent==='0 / 3';
    },10000,'active host console');
    return {frame:frame,child:child,control:child.__CRIOS_HOST_GAME_STATE_SMOKE__,pageErrors:pageErrors,promiseErrors:promiseErrors};
  }

  function report(result){
    try{
      fetch('/__crios_smoke_result',{
        method:'POST',credentials:'omit',cache:'no-store',
        headers:{'Content-Type':'application/json;charset=utf-8'},
        body:JSON.stringify(result)
      }).catch(function(){});
    }catch(ignoreReport){}
  }

  async function run(){
    var harness=await buildHarness();
    var child=harness.child;
    var control=harness.control;
    var controller=child.CRIOS_HOST_CONSOLE_CONTROLLER;
    var visibleText=child.document.body.innerText;

    ok(Boolean(child.CRIOS_HOST_CONSOLE&&child.CRIOS_LIVE_ROOM_GAME_STATE_RECONCILIATION),'production host controller and scheduler loaded');
    eq(controller.getState().status,'ACTIVE','real host console starts active');
    eq(child.document.getElementById('hostConsolePlayerCount').textContent,'2','two logical players are visible');
    eq(child.document.getElementById('hostConsoleProgressValue').textContent,'0 / 3','team progress starts empty');
    eq(control.calls.gameRead,1,'initial progress uses one authoritative read');
    eq(control.calls.gameContexts.length,1,'one read-only game-state context is created');
    ok(!Object.prototype.hasOwnProperty.call(control.calls.gameContexts[0],'capabilityToken'),'game-state context exposes no capability');
    ok(!/[?&](participantId|capability|capabilityToken)=/.test(child.location.href),'console URL exposes no participant or capability');
    ok(!child.sessionStorage.getItem('crios-live-room-host-context-v1').includes('capability'),'saved host context exposes no capability');
    ok(visibleText.includes('Misión 1')&&visibleText.includes('Misión 3'),'mission sequence uses generic labels');
    var technicalLeaks=[];
    var technicalPattern=/(^|[^A-Za-z0-9_-])(energy|greenhouse|ice)($|[^A-Za-z0-9_-])/i;
    function isRenderedTextNode(node){
      var element=node&&node.parentElement;
      while(element){
        var tag=String(element.tagName||'').toUpperCase();
        if(tag==='SCRIPT'||tag==='STYLE'||tag==='NOSCRIPT'||tag==='TEMPLATE')return false;
        if(element.hidden||element.getAttribute('aria-hidden')==='true')return false;
        var style=child.getComputedStyle(element);
        if(style.display==='none'||style.visibility==='hidden')return false;
        if(element===child.document.body)break;
        element=element.parentElement;
      }
      return true;
    }
    var walker=child.document.createTreeWalker(child.document.body,child.NodeFilter.SHOW_TEXT);
    var textNode;
    while((textNode=walker.nextNode())){
      var candidate=String(textNode.nodeValue||'').trim();
      if(candidate&&isRenderedTextNode(textNode)&&technicalPattern.test(candidate)){
        var parent=textNode.parentElement;
        technicalLeaks.push({text:candidate,id:parent&&parent.id||'',className:parent&&parent.className||''});
      }
    }
    ok(technicalLeaks.length===0,'visible console contains no exact technical mission IDs leaks='+JSON.stringify(technicalLeaks));

    control.setActivePlayers(1);
    control.emit('presence-change');
    await waitFor(function(){return child.document.getElementById('hostConsolePlayerCount').textContent==='1';},2000,'presence-only refresh');
    eq(control.calls.gameRead,1,'presence signal does not read game state');

    control.setActivePlayers(2);
    control.complete('energy','player-a-browser-smoke');
    control.complete('greenhouse','player-b-browser-smoke');
    control.emit('game-state-change');
    await waitFor(function(){return child.document.getElementById('hostConsoleProgressValue').textContent==='2 / 3';},2500,'two-player progress signal');
    eq(control.authors,['player-a-browser-smoke','player-b-browser-smoke'],'two logical players advance shared authority');
    eq(control.calls.gameRead,2,'game-state signal produces one coalesced authoritative read');
    eq(child.document.querySelectorAll('.host-mission-progress[data-completed="true"]').length,2,'two generic mission rows render completed');
    ok(!child.document.getElementById('hostConsoleMissionProgressList').textContent.includes('player-a'),'progress UI contains no author attribution');

    control.advance(31000);
    control.failNextGameRead();
    control.emit('game-state-change');
    await waitFor(function(){return controller.getState().lastGameStateError&&controller.getState().lastGameStateError.code==='SERVER_ERROR';},2500,'transient game-state failure');
    eq(controller.getState().status,'ACTIVE','transient progress failure preserves active room');
    eq(child.document.getElementById('hostConsoleProgressValue').textContent,'2 / 3','transient failure preserves last valid progress');
    ok(child.document.getElementById('hostConsoleProgressHint').textContent.includes('Último progreso válido'),'UI explains preserved progress');

    control.complete('ice','player-a-browser-smoke');
    control.advance(31000);
    control.emit('game-state-change');
    await waitFor(function(){return child.document.getElementById('hostConsoleProgressValue').textContent==='3 / 3';},2500,'progress recovery');
    eq(controller.getState().lastGameStateError,null,'later authoritative read clears transient error');
    eq(child.document.getElementById('hostConsoleProgressLabel').textContent,'completo','aggregate progress reaches complete state');
    eq(child.document.querySelectorAll('.host-mission-progress[data-completed="true"]').length,3,'all generic mission rows render completed');
    ok(control.calls.operations.every(function(operation){return operation==='getLiveRoomGameState';}),'host performs only the read operation');
    eq(harness.pageErrors,[],'real host page produces no page errors');
    eq(harness.promiseErrors,[],'real host page produces no unhandled promises');
    controller.destroy();
    harness.frame.remove();
  }

  run().then(function(){
    var result=Object.freeze({status:failed===0?'PASS':'FAIL',total:total,failed:failed,messages:messages.slice()});
    window.CRIOS_HOST_LIVE_ROOM_GAME_STATE_BROWSER_SMOKE_RESULTS=result;
    status.dataset.state=result.status;
    status.textContent=result.status+' · '+(result.total-result.failed)+'/'+result.total;
    document.title=result.status+' · CRIOS host game-state browser smoke';
    messages.push('HOST_LIVE_ROOM_GAME_STATE_BROWSER_SMOKE_STATUS='+result.status);
    messages.push('HOST_LIVE_ROOM_GAME_STATE_BROWSER_SMOKE_TOTAL='+result.total);
    messages.push('HOST_LIVE_ROOM_GAME_STATE_BROWSER_SMOKE_FAILED='+result.failed);
    render();
    report(result);
  }).catch(function(error){
    failed+=1;
    messages.push('FAIL uncaught '+String(error&&error.stack||error));
    var result=Object.freeze({status:'FAIL',total:total+1,failed:failed,messages:messages.slice()});
    window.CRIOS_HOST_LIVE_ROOM_GAME_STATE_BROWSER_SMOKE_RESULTS=result;
    status.dataset.state='FAIL';
    status.textContent='FAIL · excepción no controlada';
    document.title='FAIL · CRIOS host game-state browser smoke';
    render();
    report(result);
  });
})();
