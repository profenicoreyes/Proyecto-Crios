(function(){
  'use strict';

  var total = 0;
  var failed = 0;
  var messages = [];
  var output = document.getElementById('output');
  var status = document.getElementById('status');
  var harnesses = document.getElementById('harnesses');

  function render() { output.textContent = messages.join('\n'); }

  function ok(condition, label) {
    total += 1;
    if (condition) {
      messages.push('PASS ' + label);
    } else {
      failed += 1;
      messages.push('FAIL ' + label);
    }
    render();
  }

  function eq(actual, expected, label) {
    ok(JSON.stringify(actual) === JSON.stringify(expected), label +
      ' expected=' + JSON.stringify(expected) + ' actual=' + JSON.stringify(actual));
  }

  function waitFor(check, timeout, label) {
    var deadline = Date.now() + (timeout || 10000);
    return new Promise(function(resolve, reject){
      (function poll(){
        var value;
        try { value = check(); }
        catch (error) { reject(error); return; }
        if (value) { resolve(value); return; }
        if (Date.now() > deadline) {
          reject(new Error('Timed out: ' + label));
          return;
        }
        setTimeout(poll, 20);
      })();
    });
  }

  function waitNextTask(child) {
    return new Promise(function(resolve){
      if (child && typeof child.setTimeout === 'function') {
        child.setTimeout(resolve, 0);
        return;
      }
      setTimeout(resolve, 0);
    });
  }

  function report(result) {
    try {
      fetch('/__crios_smoke_result', {
        method: 'POST',
        credentials: 'omit',
        cache: 'no-store',
        headers: {'Content-Type': 'application/json;charset=utf-8'},
        body: JSON.stringify(result)
      }).catch(function(){});
    } catch (ignoreReport) {}
  }

  function createFrame(label) {
    var frame = document.createElement('iframe');
    frame.title = label;
    harnesses.appendChild(frame);
    frame.src = './runtime-live-room-game-state-browser-shell.html?token=' + Math.random().toString(36).slice(2);
    return frame;
  }

  async function waitShell(frame, label) {
    await waitFor(function(){
      return frame.contentWindow && frame.contentWindow.location.pathname.endsWith('/tests/runtime-live-room-game-state-browser-shell.html');
    }, 10000, label + ' same-origin shell');
    return frame.contentWindow;
  }

  function installVisibilityControl(child) {
    var currentVisibility = 'visible';
    var currentHidden = false;
    var fallbackVisibility = child.document.visibilityState;
    var fallbackHidden = child.document.hidden;

    Object.defineProperty(child.document, 'visibilityState', {
      configurable: true,
      enumerable: true,
      get: function(){ return currentVisibility; }
    });
    Object.defineProperty(child.document, 'hidden', {
      configurable: true,
      enumerable: true,
      get: function(){ return currentHidden; }
    });

    return {
      setVisible: function(visible) {
        currentVisibility = visible ? 'visible' : 'hidden';
        currentHidden = !visible;
      },
      restore: function() {
        try {
          delete child.document.visibilityState;
          delete child.document.hidden;
        } catch (ignoreDelete) {}
        Object.defineProperty(child.document, 'visibilityState', {
          configurable: true,
          enumerable: true,
          get: function(){ return fallbackVisibility; }
        });
        Object.defineProperty(child.document, 'hidden', {
          configurable: true,
          enumerable: true,
          get: function(){ return fallbackHidden; }
        });
      }
    };
  }

  async function buildRuntimeHarness() {
    var frame = createFrame('CRIOS runtime foreground harness');
    var child = await waitShell(frame, 'runtime');

    var html = '' +
      '<!doctype html><html lang="es"><head><meta charset="utf-8"><base href="' + new URL('../', location.href).href + '"></head><body>' +
      '<script>(function(){' +
      'var nowValue=Date.parse("2026-08-28T10:00:00.000Z");' +
      'var calls={get:0,join:0,heartbeat:0,gameRead:0,publish:0,network:0,focusDispatch:0,visibilityDispatch:0};' +
      'Date.now=function(){return nowValue;};' +
      'Math.random=function(){return 0;};' +
      'history.replaceState(null,"","/index.html?roomId=runtime-room-foreground");' +
      'window.CRIOS={runtimeLaunch:Object.freeze({sourceMode:"published",blocked:false,error:null,campaignId:"runtime-campaign-foreground",publicationId:"runtime-publication-foreground"}),obtenerMisionesActivas:function(){return ["energy","greenhouse","ice"];},api:{applyLiveRoomSharedGameState:function(){return true;}}};' +
      'window.CRIOS_LIVE_ROOM_BROWSER=Object.freeze({configured:true,error:null,client:{' +
      'available:function(){return true;},' +
      'getLiveRoom:async function(roomId){calls.network+=1;calls.get+=1;return {success:true,data:{room:{roomId:roomId,campaignId:"runtime-campaign-foreground",publicationId:"runtime-publication-foreground",status:"active"}},error:null};},' +
      'joinLiveRoom:async function(roomId,participantId){calls.network+=1;calls.join+=1;return {success:true,data:{room:{roomId:roomId,campaignId:"runtime-campaign-foreground",publicationId:"runtime-publication-foreground",status:"active"},presence:{participantId:participantId,role:"player"}},error:null};},' +
      'heartbeatLiveRoom:async function(){calls.network+=1;calls.heartbeat+=1;return {success:true,data:{room:{roomId:"runtime-room-foreground",campaignId:"runtime-campaign-foreground",publicationId:"runtime-publication-foreground",status:"active"}},error:null};},' +
      'createGameStateClient:function(){return {available:function(){return true;},getLiveRoomGameState:async function(){calls.network+=1;calls.gameRead+=1;return {success:true,data:{gameState:{schemaVersion:"1.0",roomId:"runtime-room-foreground",campaignId:"runtime-campaign-foreground",publicationId:"runtime-publication-foreground",revision:0,completedMissionIds:[],updatedAt:new Date(nowValue).toISOString()},stateAdvanced:true},error:null};}};},' +
      'forgetCapability:function(){return true;}' +
      '}});' +
      'window.CRIOS_LIVE_ROOM_REALTIME_TRANSPORT=Object.freeze({createTransport:function(){return {subscribeRoom:function(){return true;},unsubscribeRoom:function(){return true;},publishSignal:function(){calls.publish+=1;return true;},destroy:function(){}};}});' +
      'window.__CRIOS_RUNTIME_FOREGROUND_SMOKE__={' +
      'calls:calls,' +
      'advance:function(ms){nowValue+=ms;},' +
      'setNow:function(value){nowValue=value;},' +
      'controller:function(){return window.CRIOS_RUNTIME_LIVE_ROOM_PLAYER_CONTROLLER;},' +
      'markFocus:function(){calls.focusDispatch+=1;},' +
      'markVisibility:function(){calls.visibilityDispatch+=1;}' +
      '};' +
      '})();<\/script>' +
      '<script src="js/live-room/live-room-model.js"><\/script>' +
      '<script src="js/live-room/live-room-game-state-model.js"><\/script>' +
      '<script src="js/live-room/live-room-game-state-outbox.js"><\/script>' +
      '<script src="js/runtime/live-room/runtime-live-room-game-state-coordinator.js"><\/script>' +
      '<script src="js/live-room/live-room-game-state-reconciliation.js"><\/script>' +
      '<script src="js/runtime/live-room/runtime-live-room-player.js"><\/script>' +
      '</body></html>';

    child.document.open();
    child.document.write(html);
    child.document.close();

    await waitFor(function(){
      var ctl = child.CRIOS_RUNTIME_LIVE_ROOM_PLAYER_CONTROLLER;
      return ctl && ctl.getState().status === 'ACTIVE';
    }, 10000, 'runtime ACTIVE');

    return {frame: frame, child: child, control: child.__CRIOS_RUNTIME_FOREGROUND_SMOKE__};
  }

  async function buildHostHarness() {
    var response = await fetch('../host/index.html?foreground-smoke=host', {cache: 'no-store'});
    if (!response.ok) throw new Error('HOST_INDEX_FETCH_FAILED: ' + response.status);

    var context = {
      roomId: 'host-room-foreground',
      participantId: 'host-foreground',
      campaignId: 'host-campaign-foreground',
      publicationId: 'host-publication-foreground',
      campaignName: 'Campana sintetica',
      runtimeHref: 'http://127.0.0.1/runtime-smoke',
      missionOrder: ['energy', 'greenhouse', 'ice'],
      playerHref: 'http://127.0.0.1/player-smoke?roomId=host-room-foreground'
    };

    var html = response.text ? await response.text() : '';
    html = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');

    var controlled = '<script>(function(){' +
      'var context=' + JSON.stringify(context) + ';' +
      'var nowValue=Date.parse("2026-08-28T10:10:00.000Z");' +
      'var calls={get:0,heartbeat:0,roster:0,gameRead:0,network:0,focusDispatch:0,visibilityDispatch:0};' +
      'Date.now=function(){return nowValue;};' +
      'Math.random=function(){return 0;};' +
      'sessionStorage.setItem("crios-live-room-host-context-v1",JSON.stringify(context));' +
      'localStorage.removeItem("crios-live-room-host-context-v1");' +
      'history.replaceState(null,"","/host/?roomId="+encodeURIComponent(context.roomId)+"&campaignId="+encodeURIComponent(context.campaignId)+"&publicationId="+encodeURIComponent(context.publicationId));' +
      'window.CRIOS_LIVE_ROOM_BROWSER=Object.freeze({configured:true,error:null,client:{' +
      'available:function(){return true;},' +
      'getLiveRoom:async function(){calls.network+=1;calls.get+=1;return {success:true,data:{room:{roomId:context.roomId,campaignId:context.campaignId,publicationId:context.publicationId,status:"active"}},error:null};},' +
      'heartbeatLiveRoom:async function(){calls.network+=1;calls.heartbeat+=1;return {success:true,data:{room:{roomId:context.roomId,campaignId:context.campaignId,publicationId:context.publicationId,status:"active"}},error:null};},' +
      'getLiveRoomRoster:async function(){calls.network+=1;calls.roster+=1;return {success:true,data:{roster:{registeredParticipantCount:1,activeParticipantCount:1,activePlayerCount:0,hostConnected:true,participants:[{participantId:context.participantId,role:"host",connected:true}]}},error:null};},' +
      'createGameStateClient:function(){return {available:function(){return true;},getLiveRoomGameState:async function(){calls.network+=1;calls.gameRead+=1;return {success:true,data:{gameState:{schemaVersion:"1.0",roomId:context.roomId,campaignId:context.campaignId,publicationId:context.publicationId,revision:0,completedMissionIds:[],updatedAt:new Date(nowValue).toISOString()},stateAdvanced:true},error:null};}};},' +
      'forgetCapability:function(){return true;}' +
      '}});' +
      'window.CRIOS_LIVE_ROOM_REALTIME_TRANSPORT=Object.freeze({createTransport:function(){return {subscribeRoom:function(){return true;},unsubscribeRoom:function(){return true;},publishSignal:function(){return true;},destroy:function(){}};}});' +
      'window.__CRIOS_HOST_FOREGROUND_SMOKE__={calls:calls,advance:function(ms){nowValue+=ms;},setNow:function(value){nowValue=value;},controller:function(){return window.CRIOS_HOST_CONSOLE_CONTROLLER;},markFocus:function(){calls.focusDispatch+=1;},markVisibility:function(){calls.visibilityDispatch+=1;}};' +
      '})();<\/script>';

    html = html.replace('<head>', '<head><base href="' + new URL('../host/', location.href).href + '">' + controlled);
    html = html.replace('</body>',
      '<script src="../js/live-room/live-room-game-state-model.js"><\/script>' +
      '<script src="../js/live-room/live-room-game-state-reconciliation.js"><\/script>' +
      '<script src="../js/host/host-console.js"><\/script></body>');

    var frame = createFrame('CRIOS host foreground harness');
    var child = await waitShell(frame, 'host');
    child.document.open();
    child.document.write(html);
    child.document.close();

    await waitFor(function(){
      var ctl = child.CRIOS_HOST_CONSOLE_CONTROLLER;
      return ctl && ctl.getState().status === 'ACTIVE';
    }, 10000, 'host ACTIVE');

    return {frame: frame, child: child, control: child.__CRIOS_HOST_FOREGROUND_SMOKE__};
  }

  async function buildStudioHarness() {
    var frame = createFrame('CRIOS studio foreground harness');
    var child = await waitShell(frame, 'studio');

    var html = '' +
      '<!doctype html><html lang="es"><head><meta charset="utf-8"><base href="' + new URL('../studio/', location.href).href + '"></head><body>' +
      '<input id="campaign-name-input" value="Campana sintetica">' +
      '<a id="studioRuntimeLaunchLink" href="#">Launch</a>' +
      '<script>(function(){' +
      'var nowValue=Date.parse("2026-08-28T10:20:00.000Z");' +
      'var calls={create:0,get:0,heartbeat:0,roster:0,network:0,focusDispatch:0,visibilityDispatch:0};' +
      'Date.now=function(){return nowValue;};' +
      'Math.random=function(){return 0;};' +
      'window.location.assign=function(){};' +
      'sessionStorage.removeItem("crios-live-room-host-context-v1");' +
      'localStorage.removeItem("crios-live-room-host-context-v1");' +
      'window.CRIOS_STUDIO={runtimeLaunch:{getState:function(){return {available:true,campaignId:"studio-campaign-foreground",publicationId:"studio-publication-foreground",href:"../index.html?source=published&campaignId=studio-campaign-foreground&publicationId=studio-publication-foreground"};}},publication:{getPublication:function(){return {campaignId:"studio-campaign-foreground",publicationId:"studio-publication-foreground",content:{runtimeExecutionManifest:{missionOrder:["energy","greenhouse","ice"]},missionSpecs:[{missionId:"energy"},{missionId:"greenhouse"},{missionId:"ice"}]}};}}};' +
      'window.CRIOS_LIVE_ROOM_BROWSER=Object.freeze({configured:true,error:null,client:{' +
      'available:function(){return true;},' +
      'createLiveRoom:async function(campaignId,publicationId,participantId){calls.network+=1;calls.create+=1;return {success:true,data:{room:{roomId:"studio-room-foreground",campaignId:campaignId,publicationId:publicationId,status:"active"},presence:{participantId:participantId,role:"host"}},error:null};},' +
      'getLiveRoom:async function(roomId){calls.network+=1;calls.get+=1;return {success:true,data:{room:{roomId:roomId,campaignId:"studio-campaign-foreground",publicationId:"studio-publication-foreground",status:"active"}},error:null};},' +
      'heartbeatLiveRoom:async function(){calls.network+=1;calls.heartbeat+=1;return {success:true,data:{room:{roomId:"studio-room-foreground",campaignId:"studio-campaign-foreground",publicationId:"studio-publication-foreground",status:"active"}},error:null};},' +
      'getLiveRoomRoster:async function(){calls.network+=1;calls.roster+=1;return {success:true,data:{roster:{registeredParticipantCount:1,activeParticipantCount:1,activePlayerCount:0,hostConnected:true,participants:[{participantId:"studio-host",role:"host",connected:true}]}},error:null};},' +
      'forgetCapability:function(){return true;}' +
      '}});' +
      'window.__CRIOS_STUDIO_FOREGROUND_SMOKE__={calls:calls,advance:function(ms){nowValue+=ms;},setNow:function(value){nowValue=value;},controller:function(){return window.CRIOS_STUDIO_LIVE_ROOM_HOST_CONTROLLER;},markFocus:function(){calls.focusDispatch+=1;},markVisibility:function(){calls.visibilityDispatch+=1;}};' +
      '})();<\/script>' +
      '<script src="../js/config.js"><\/script>' +
      '<script src="../js/live-room/live-room-model.js"><\/script>' +
      '<script src="../js/live-room/live-room-game-state-model.js"><\/script>' +
      '<script src="../js/studio/live-room/studio-live-room-host.js"><\/script>' +
      '</body></html>';

    child.document.open();
    child.document.write(html);
    child.document.close();

    await waitFor(function(){
      var ctl = child.CRIOS_STUDIO_LIVE_ROOM_HOST_CONTROLLER;
      return ctl && (ctl.getState().status === 'READY' || ctl.getState().status === 'ACTIVE');
    }, 12000, 'studio READY');

    var controller = child.CRIOS_STUDIO_LIVE_ROOM_HOST_CONTROLLER;
    if (controller.getState().status !== 'ACTIVE') {
      await controller.createRoom();
      await waitFor(function(){ return controller.getState().status === 'ACTIVE'; }, 12000, 'studio ACTIVE');
    }

    return {frame: frame, child: child, control: child.__CRIOS_STUDIO_FOREGROUND_SMOKE__};
  }

  async function runRuntime() {
    var harness = await buildRuntimeHarness();
    var child = harness.child;
    var control = harness.control;
    var controller = control.controller();
    var visibility = installVisibilityControl(child);
    var baselineHeartbeat = control.calls.heartbeat;

    try {
      eq(Object.isFrozen(controller), true, 'runtime controller is frozen');
      eq(typeof controller.refreshAfterForeground, 'function', 'runtime foreground gate method exists');
      eq(controller.getState().status, 'ACTIVE', 'runtime ACTIVE before foreground events');

      control.markFocus();
      child.dispatchEvent(new child.Event('focus'));
      await waitFor(function(){ return control.calls.heartbeat === baselineHeartbeat + 1; }, 2000, 'runtime first focus heartbeat');
      await waitNextTask(child);

      visibility.setVisible(true);
      control.markVisibility();
      child.document.dispatchEvent(new child.Event('visibilitychange'));
      await Promise.resolve();
      eq(control.calls.heartbeat, baselineHeartbeat + 1, 'runtime visibilitychange visible is coalesced');

      child.dispatchEvent(new child.Event('focus'));
      await Promise.resolve();
      eq(control.calls.heartbeat, baselineHeartbeat + 1, 'runtime focus under 30000 ms adds no request');

      control.advance(30000);
      child.dispatchEvent(new child.Event('focus'));
      await waitFor(function(){ return control.calls.heartbeat === baselineHeartbeat + 2; }, 2000, 'runtime focus at 30000 ms heartbeat');
      await waitNextTask(child);

      control.setNow(1);
      child.dispatchEvent(new child.Event('focus'));
      await waitFor(function(){ return control.calls.heartbeat === baselineHeartbeat + 3; }, 2000, 'runtime rollback accepts refresh');

      var isolated = child.CRIOS_RUNTIME_LIVE_ROOM_PLAYER.createPlayerController({
        client: child.CRIOS_LIVE_ROOM_BROWSER.client,
        now: function(){ return 9999; }
      });
      eq(isolated.getState().status, 'IDLE', 'runtime non ACTIVE controller exists');
      eq(isolated.refreshAfterForeground(), false, 'runtime non ACTIVE rejects foreground');
      eq(control.calls.heartbeat, baselineHeartbeat + 3, 'runtime non ACTIVE emits no request');

      controller.destroy();
      child.dispatchEvent(new child.Event('focus'));
      child.document.dispatchEvent(new child.Event('visibilitychange'));
      await Promise.resolve();
      eq(control.calls.heartbeat, baselineHeartbeat + 3, 'runtime destroy disables foreground requests');

      ok(control.calls.network === control.calls.get + control.calls.join + control.calls.heartbeat + control.calls.gameRead,
        'runtime no real network: only fake client counters move');
    } finally {
      visibility.restore();
      harness.frame.remove();
    }
  }

  async function runHost() {
    var harness = await buildHostHarness();
    var child = harness.child;
    var control = harness.control;
    var controller = control.controller();
    var visibility = installVisibilityControl(child);
    var baselineHeartbeat = control.calls.heartbeat;
    var baselineRoster = control.calls.roster;

    try {
      eq(Object.isFrozen(controller), true, 'host controller is frozen');
      eq(typeof controller.refreshAfterForeground, 'function', 'host foreground gate method exists');
      eq(controller.getState().status, 'ACTIVE', 'host ACTIVE before foreground events');

      control.markFocus();
      child.dispatchEvent(new child.Event('focus'));
      await waitFor(function(){
        return control.calls.heartbeat === baselineHeartbeat + 1 && control.calls.roster === baselineRoster + 1;
      }, 2000, 'host first focus heartbeat+roster');
      await waitNextTask(child);

      visibility.setVisible(true);
      control.markVisibility();
      child.document.dispatchEvent(new child.Event('visibilitychange'));
      await Promise.resolve();
      eq(control.calls.heartbeat, baselineHeartbeat + 1, 'host visibilitychange visible is coalesced for heartbeat');
      eq(control.calls.roster, baselineRoster + 1, 'host visibilitychange visible is coalesced for roster');

      child.dispatchEvent(new child.Event('focus'));
      await Promise.resolve();
      eq(control.calls.heartbeat, baselineHeartbeat + 1, 'host focus under 30000 ms adds no heartbeat');
      eq(control.calls.roster, baselineRoster + 1, 'host focus under 30000 ms adds no roster');

      control.advance(30000);
      child.dispatchEvent(new child.Event('focus'));
      await waitFor(function(){
        return control.calls.heartbeat === baselineHeartbeat + 2 && control.calls.roster === baselineRoster + 2;
      }, 2000, 'host focus at 30000 ms heartbeat+roster');
      await waitNextTask(child);

      control.setNow(1);
      child.dispatchEvent(new child.Event('focus'));
      await waitFor(function(){
        return control.calls.heartbeat === baselineHeartbeat + 3 && control.calls.roster === baselineRoster + 3;
      }, 2000, 'host rollback accepts refresh');
      await waitNextTask(child);

      control.expire = true;
      child.CRIOS_LIVE_ROOM_BROWSER.client.heartbeatLiveRoom = async function(){
        control.calls.network += 1;
        return {success:false,data:null,error:{code:'ROOM_EXPIRED',message:'expired',retryable:false}};
      };
      await controller.heartbeat();
      eq(controller.getState().status, 'EXPIRED', 'host EXPIRED state reached');

      child.dispatchEvent(new child.Event('focus'));
      child.document.dispatchEvent(new child.Event('visibilitychange'));
      await Promise.resolve();
      eq(control.calls.heartbeat, baselineHeartbeat + 3, 'host EXPIRED blocks foreground requests');
      eq(control.calls.roster, baselineRoster + 3, 'host EXPIRED blocks foreground roster');

      controller.destroy();
      child.dispatchEvent(new child.Event('focus'));
      child.document.dispatchEvent(new child.Event('visibilitychange'));
      await Promise.resolve();
      eq(control.calls.heartbeat, baselineHeartbeat + 3, 'host destroy keeps foreground blocked');

      ok(control.calls.network >= control.calls.get + control.calls.heartbeat + control.calls.roster + control.calls.gameRead,
        'host no real network: requests stayed in fake client');
    } finally {
      visibility.restore();
      harness.frame.remove();
    }
  }

  async function runStudio() {
    var harness = await buildStudioHarness();
    var child = harness.child;
    var control = harness.control;
    var controller = control.controller();
    var visibility = installVisibilityControl(child);
    var baselineHeartbeat = control.calls.heartbeat;
    var baselineRoster = control.calls.roster;

    try {
      eq(Object.isFrozen(controller), true, 'studio controller is frozen');
      eq(typeof controller.refreshAfterForeground, 'function', 'studio foreground gate method exists');
      eq(controller.getState().status, 'ACTIVE', 'studio ACTIVE before foreground events');

      control.markFocus();
      child.dispatchEvent(new child.Event('focus'));
      await waitFor(function(){
        return control.calls.heartbeat === baselineHeartbeat + 1 && control.calls.roster === baselineRoster + 1;
      }, 2000, 'studio first focus heartbeat+roster');
      await waitNextTask(child);

      visibility.setVisible(true);
      control.markVisibility();
      child.document.dispatchEvent(new child.Event('visibilitychange'));
      await Promise.resolve();
      eq(control.calls.heartbeat, baselineHeartbeat + 1, 'studio visibilitychange visible is coalesced for heartbeat');
      eq(control.calls.roster, baselineRoster + 1, 'studio visibilitychange visible is coalesced for roster');

      child.dispatchEvent(new child.Event('focus'));
      await Promise.resolve();
      eq(control.calls.heartbeat, baselineHeartbeat + 1, 'studio focus under 30000 ms adds no heartbeat');
      eq(control.calls.roster, baselineRoster + 1, 'studio focus under 30000 ms adds no roster');

      control.advance(30000);
      child.dispatchEvent(new child.Event('focus'));
      await waitFor(function(){
        return control.calls.heartbeat === baselineHeartbeat + 2 && control.calls.roster === baselineRoster + 2;
      }, 2000, 'studio focus at 30000 ms heartbeat+roster');
      await waitNextTask(child);

      control.setNow(1);
      child.dispatchEvent(new child.Event('focus'));
      await waitFor(function(){
        return control.calls.heartbeat === baselineHeartbeat + 3 && control.calls.roster === baselineRoster + 3;
      }, 2000, 'studio rollback accepts refresh');
      await waitNextTask(child);

      child.CRIOS_LIVE_ROOM_BROWSER.client.heartbeatLiveRoom = async function(){
        control.calls.network += 1;
        return {success:false,data:null,error:{code:'ROOM_EXPIRED',message:'expired',retryable:false}};
      };
      await controller.heartbeat();
      eq(controller.getState().status, 'EXPIRED', 'studio EXPIRED state reached');

      child.dispatchEvent(new child.Event('focus'));
      child.document.dispatchEvent(new child.Event('visibilitychange'));
      await Promise.resolve();
      eq(control.calls.heartbeat, baselineHeartbeat + 3, 'studio EXPIRED blocks foreground requests');
      eq(control.calls.roster, baselineRoster + 3, 'studio EXPIRED blocks foreground roster');

      controller.destroy();
      child.dispatchEvent(new child.Event('focus'));
      child.document.dispatchEvent(new child.Event('visibilitychange'));
      await Promise.resolve();
      eq(control.calls.heartbeat, baselineHeartbeat + 3, 'studio destroy keeps foreground blocked');

      ok(control.calls.network >= control.calls.create + control.calls.get + control.calls.heartbeat + control.calls.roster,
        'studio no real network: requests stayed in fake client');
    } finally {
      visibility.restore();
      harness.frame.remove();
    }
  }

  async function run() {
    ok(typeof window === 'object' && typeof document === 'object', 'executes in real browser document');
    ok(window.sessionStorage instanceof Storage, 'uses native browser storage');

    await runRuntime();
    await runHost();
    await runStudio();
  }

  run().then(function(){
    var result = Object.freeze({status: failed === 0 ? 'PASS' : 'FAIL', total: total, failed: failed, messages: messages.slice()});
    window.CRIOS_LIVE_ROOM_FOREGROUND_BROWSER_SMOKE_RESULTS = result;
    status.dataset.state = result.status;
    status.textContent = result.status + ' · ' + (result.total - result.failed) + '/' + result.total;
    document.title = result.status + ' · CRIOS live-room foreground browser smoke';
    messages.push('LIVE_ROOM_FOREGROUND_BROWSER_SMOKE_STATUS=' + result.status);
    messages.push('LIVE_ROOM_FOREGROUND_BROWSER_SMOKE_TOTAL=' + result.total);
    messages.push('LIVE_ROOM_FOREGROUND_BROWSER_SMOKE_FAILED=' + result.failed);
    render();
    report(result);
  }).catch(function(error){
    failed += 1;
    messages.push('FAIL uncaught ' + String(error && error.stack || error));
    var result = Object.freeze({status: 'FAIL', total: total + 1, failed: failed, messages: messages.slice()});
    window.CRIOS_LIVE_ROOM_FOREGROUND_BROWSER_SMOKE_RESULTS = result;
    status.dataset.state = 'FAIL';
    status.textContent = 'FAIL · excepcion no controlada';
    document.title = 'FAIL · CRIOS live-room foreground browser smoke';
    render();
    report(result);
  });
})();
