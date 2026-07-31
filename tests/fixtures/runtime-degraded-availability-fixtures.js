/* CRIOS A2-006J - RT-007 degraded availability fixtures */
(function(){
  'use strict';

  function clone(value){return JSON.parse(JSON.stringify(value));}
  function freeze(value){if(!value||typeof value!=='object'||Object.isFrozen(value))return value;Object.keys(value).forEach(function(key){freeze(value[key]);});return Object.freeze(value);}  

  function createSyntheticError(code, operation, phase, storageName, key){
    return freeze({ code: String(code), operation: String(operation), phase: String(phase), storage: String(storageName || 'unknown'), key: key === undefined ? null : String(key) });
  }

  var controlledWarningFamilies = freeze({
    domain: { family: 'domain', prefix: 'No se pudo reconstruir el dominio de campaña', alternatePrefix: 'Módulos de dominio no disponibles' },
    storageRead: { family: 'storage-read', prefix: 'No se pudo leer el almacenamiento', operation: 'getItem' },
    storageWrite: { family: 'storage-write', prefix: 'No se pudo guardar el almacenamiento', operation: 'setItem' },
    storageQuota: { family: 'storage-quota', prefix: 'No se pudo guardar el almacenamiento', operation: 'setItem', errorCode: 'STORAGE_QUOTA_EXCEEDED' }
  });

  function createDeferred(NativePromise){
    var resolveValue;
    var rejectValue;
    var settled = false;
    var promise = new NativePromise(function(resolve, reject){resolveValue = resolve; rejectValue = reject;});
    return {
      promise: promise,
      resolve: function(value){if(settled)return false; settled=true; resolveValue(value); return true;},
      reject: function(error){if(settled)return false; settled=true; rejectValue(error); return true;},
      isSettled: function(){return settled;}
    };
  }

  function createControlledStorage(name, seed, events, initialRules, observe, relate){
    var values = Object.assign({}, seed || {});
    var calls = [];
    var rules = (initialRules || []).map(function(rule){ return Object.assign({}, rule); });

    function emit(operation, key, phase, outcome, errorCode){
      events.push(freeze({ storage: name, key: key === undefined ? null : String(key), operation: operation, phase: phase, outcome: outcome, errorCode: errorCode || null }));
      return observe ? observe('storage', phase, operation, {
        dependency: 'storage',
        availabilityBefore: phase.indexOf('before') >= 0 ? 'unknown' : 'available',
        availabilityAfter: outcome === 'failed' ? 'unavailable' : 'available',
        outcome: outcome,
        errorCode: errorCode || null
      }) : null;
    }

    function matchingRule(operation, key){
      return rules.find(function(rule){ return rule.operation === operation && (rule.key === '*' || String(rule.key) === String(key)); }) || null;
    }

    function fail(code, operation, phase, key, beforeEvent){
      var error = createSyntheticError(code, operation, phase, name, key);
      var failedEvent = emit(operation, key, phase + '-failed', 'failed', code);
      if(relate) relate(beforeEvent, failedEvent, 'STORAGE_BEFORE_PRECEDES_FAILURE');
      var ex = new Error(code);
      ex.code = code;
      ex.synthetic = error;
      throw ex;
    }

    function before(operation, key, phase){
      calls.push({ operation: operation, key: key === undefined ? null : String(key) });
      var beforeEvent = emit(operation, key, phase + '-before', 'started', null);
      var rule = matchingRule(operation, key);
      if(rule) fail(rule.errorCode, operation, phase, key, beforeEvent);
      return beforeEvent;
    }

    function after(operation, key, phase, beforeEvent){
      var afterEvent = emit(operation, key, phase + '-after', 'succeeded', null);
      if(relate) relate(beforeEvent, afterEvent, 'STORAGE_BEFORE_PRECEDES_AFTER');
    }

    var api = {
      getItem: function(key){
        var beforeEvent = before('getItem', key, 'read');
        var result = Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null;
        after('getItem', key, 'read', beforeEvent);
        return result;
      },
      setItem: function(key, value){
        var beforeEvent = before('setItem', key, 'write');
        values[key] = String(value);
        after('setItem', key, 'write', beforeEvent);
      },
      removeItem: function(key){
        var beforeEvent = before('removeItem', key, 'remove');
        delete values[key];
        after('removeItem', key, 'remove', beforeEvent);
      },
      clear: function(){
        var beforeEvent = before('clear', '*', 'write');
        values = {};
        after('clear', '*', 'write', beforeEvent);
      },
      key: function(index){return Object.keys(values)[index] || null;},
      snapshot: function(){return clone(values);},
      calls: function(){return clone(calls);},
      activeRules: function(){return clone(rules);},
      setFailure: function(operation, key, errorCode, warningFamily){ rules.push({ operation: operation, key: String(key), errorCode: String(errorCode), warningFamily: warningFamily ? String(warningFamily) : null }); },
      clearFailure: function(operation, key){ rules = rules.filter(function(rule){ return !(rule.operation === operation && String(rule.key) === String(key)); }); },
      setAvailable: function(){rules=[];},
      setReadFailure: function(){rules=[{operation:'getItem',key:'*',errorCode:'STORAGE_READ_FAILURE',warningFamily:'storage-read'}];},
      setWriteFailure: function(){rules=[{operation:'setItem',key:'*',errorCode:'STORAGE_WRITE_FAILURE',warningFamily:'storage-write'}];},
      setQuotaExceeded: function(){rules=[{operation:'setItem',key:'*',errorCode:'STORAGE_QUOTA_EXCEEDED',warningFamily:'storage-quota'}];},
      setRemoveFailure: function(){rules=[{operation:'removeItem',key:'*',errorCode:'STORAGE_REMOVE_FAILURE'}];},
      restore: function(){rules=[];}
    };

    Object.defineProperty(api, 'length', { get: function(){ return Object.keys(values).length; } });
    return freeze(api);
  }

  async function createPublication(){
    var publication = {
      campaignId: 'reactivacion-base-antartica',
      publicationId: 'a2-006j-controlled-publication',
      version: 1,
      schemaVersion: '2.0',
      contentHash: '',
      content: {
        nombre: 'Campaña sintética A2-006J',
        descripcion: 'Disponibilidad degradada controlada',
        escenario: 'antartida',
        clasificacion: { materia: 'matematica', tema: 'geometria', subtema: 'calculoAreas' },
        missionSpecs: window.CRIOS_RUNTIME_MISSION_FIXTURES.createAll(),
        runtimeExecutionManifest: {
          runtimeContractVersion: '1.0.0',
          requiredHandlers: [{ handlerId: 'crios.geometry.declarative-area', handlerVersion: '1.0.0' }],
          missionCount: 4,
          missionOrder: ['energy', 'greenhouse', 'ice', 'hangar']
        },
        finalEvaluation: {
          responseType: 'NUMERIC_WITH_PROCEDURE',
          rngPolicy: 'SEEDED_SEQUENCE_V1',
          unit: 'm2',
          instruction: 'Integra los cuatro resultados sinteticos.',
          adjustments: [
            { name: 'reserve', operation: 'add', values: [6, 8, 10] },
            { name: 'loss', operation: 'subtract', values: [24, 28, 30] }
          ]
        }
      }
    };

    publication.contentHash = await window.CRIOS_PUBLICATION_CORE.calculateContentHash(
      window.CRIOS_PUBLICATION_CORE.buildCanonicalContent({ schemaVersion: publication.schemaVersion, content: publication.content })
    );
    return freeze(publication);
  }

  function installChildHarness(configuration){
    var settings = configuration || {};
    var NativePromise = window.Promise;
    var contextId = String(settings.contextId || 'rt007-context');
    var events = [];
    var snapshots = [];
    var storageOperations = [];
    var recoveryAttempts = [];
    var fetches = [];
    var listeners = [];
    var timers = [];
    var relationships = [];
    var pageerrors = [];
    var consoleErrors = [];
    var warnings = [];
    var expectedScenarioWarnings = [];

    var controller = {
      sequence: 0,
      online: settings.initialOnline !== false,
      domainState: settings.initialDomainState || 'ready',
      requestMode: settings.initialRequestMode || 'resolved',
      pendingRequests: [],
      domainScriptsFail: Boolean(settings.domainScriptsFail),
      referenceMissing: Boolean(settings.referenceMissing),
      publicationMissing: Boolean(settings.publicationMissing),
      publicationMismatched: Boolean(settings.publicationMismatched),
      forceCorruptRecovery: Boolean(settings.forceCorruptRecovery),
      listeners: {},
      lastDispatch: {}
    };

    function nextSequence(){controller.sequence += 1; return controller.sequence;}

    function safeEvent(source, phase, operation, payload){
      var event = {
        sequence: nextSequence(),
        contextId: contextId,
        eventId: contextId + '-event-' + controller.sequence,
        parentEventId: payload && payload.parentEventId ? payload.parentEventId : null,
        source: String(source || 'harness'),
        phase: String(phase || 'none'),
        dependency: payload && payload.dependency ? String(payload.dependency) : null,
        availabilityBefore: payload && payload.availabilityBefore !== undefined ? payload.availabilityBefore : null,
        availabilityAfter: payload && payload.availabilityAfter !== undefined ? payload.availabilityAfter : null,
        operation: String(operation || 'none'),
        outcome: payload && payload.outcome ? String(payload.outcome) : null,
        requestId: payload && payload.requestId ? String(payload.requestId) : null,
        timerId: payload && payload.timerId ? String(payload.timerId) : null,
        listenerId: payload && payload.listenerId ? String(payload.listenerId) : null,
        traceId: contextId + '-trace',
        errorCode: payload && payload.errorCode ? String(payload.errorCode) : null
      };
      events.push(freeze(event));
      return event;
    }

    function relate(fromEvent, toEvent, type){
      if(!fromEvent || !toEvent) return;
      relationships.push(freeze({ from: fromEvent.eventId, to: toEvent.eventId, type: String(type || 'HAPPENS_BEFORE') }));
    }
    var contextCreatedEvent = safeEvent('lifecycle', 'created', 'context-created', { dependency: 'context', outcome: 'created' });

    function snapshot(label){
      var screen = null;
      try {
        var active = document.querySelector('.screen.active');
        screen = active ? active.id : null;
      } catch(ignore){}

      var session = null;
      var progress = null;
      var pending = null;
      var transmissionState = controller.pendingRequests.length > 0 ? 'busy' : 'idle';
      try {
        session = JSON.parse(sessionStorage.getItem(settings.storageKeys.sessionData));
      } catch(ignore) { session = null; }
      try {
        progress = JSON.parse(sessionStorage.getItem(settings.storageKeys.campaignProgress));
      } catch(ignore) { progress = null; }
      try {
        pending = localStorage.getItem(settings.storageKeys.pendingResult);
      } catch(ignore) { pending = null; }

      var value = freeze({
        label: String(label || 'snapshot'),
        sessionCreated: Boolean(session && session.idSesion),
        progressCreated: Boolean(progress),
        activeMission: session && session.misiones ? Object.keys(session.misiones).find(function(key){ return session.misiones[key] && session.misiones[key].answer; }) || null : null,
        currentScreen: screen,
        playerStatus: window.CRIOS_DOMAIN && window.CRIOS_DOMAIN.playerStateService ? 'domain-available' : 'domain-missing',
        lives: window.CRIOS_DOMAIN && window.CRIOS_DOMAIN.sessionModel ? window.CRIOS_DOMAIN.sessionModel.INITIAL_SESSION_LIVES : null,
        pendingResult: pending,
        transmissionState: transmissionState,
        recoveryState: controller.forceCorruptRecovery ? 'corrupt' : 'available',
        tracePhases: events.map(function(item){ return item.phase; }),
        finalOutcome: session && session.final && session.final.answerCorrect ? 'SUCCESS' : (session ? 'SESSION_CREATED' : 'BLOCKED_BEFORE_SESSION')
      });
      snapshots.push(value);
      return value;
    }

    var sessionStorageControl = settings.sessionStorage || createControlledStorage('sessionStorage', settings.sessionSeed || {}, storageOperations, settings.initialSessionStorageRules || [], safeEvent, relate);
    var localStorageControl = settings.localStorage || createControlledStorage('localStorage', settings.localSeed || {}, storageOperations, settings.initialLocalStorageRules || [], safeEvent, relate);

    Object.defineProperty(window, 'sessionStorage', { configurable: true, value: sessionStorageControl });
    Object.defineProperty(window, 'localStorage', { configurable: true, value: localStorageControl });

    try {
      Object.defineProperty(navigator, 'onLine', {
        configurable: true,
        get: function(){ return controller.online; }
      });
    } catch(ignore) {}

    window.XMLHttpRequest = function(){ throw new Error('REAL_XHR_BLOCKED'); };
    window.WebSocket = function(){ throw new Error('REAL_WEBSOCKET_BLOCKED'); };
    window.EventSource = function(){ throw new Error('REAL_EVENTSOURCE_BLOCKED'); };
    Object.defineProperty(window, 'indexedDB', { configurable: true, value: { open: function(){ throw new Error('REAL_INDEXEDDB_BLOCKED'); } } });
    try {
      Object.defineProperty(navigator, 'sendBeacon', { configurable: true, value: function(){ throw new Error('REAL_SENDBEACON_BLOCKED'); } });
    } catch(ignore){}

    window.addEventListener('error', function(event){pageerrors.push(String(event.message || event.error || 'error'));});
    window.addEventListener('unhandledrejection', function(event){pageerrors.push(String(event.reason || 'rejection'));});

    var originalWarn = console.warn;
    var originalError = console.error;
    function matchesActiveStorageWarning(descriptor, text){
      var rules = sessionStorageControl.activeRules().concat(localStorageControl.activeRules());
      return text.indexOf(descriptor.prefix) >= 0 && rules.some(function(rule){
        if(rule.warningFamily !== descriptor.family || rule.operation !== descriptor.operation || text.indexOf(rule.errorCode) < 0) return false;
        return descriptor.errorCode ? rule.errorCode === descriptor.errorCode : true;
      });
    }
    function expectedWarningFamily(text){
      var domain = controlledWarningFamilies.domain;
      var domainActive = controller.domainScriptsFail || controller.domainState === 'unavailable' || controller.domainState === 'lost';
      if(domainActive && (text.indexOf(domain.prefix) >= 0 || text.indexOf(domain.alternatePrefix) >= 0)) return domain.family;
      if(matchesActiveStorageWarning(controlledWarningFamilies.storageRead, text)) return controlledWarningFamilies.storageRead.family;
      if(matchesActiveStorageWarning(controlledWarningFamilies.storageQuota, text)) return controlledWarningFamilies.storageQuota.family;
      if(matchesActiveStorageWarning(controlledWarningFamilies.storageWrite, text)) return controlledWarningFamilies.storageWrite.family;
      return null;
    }
    console.warn = function(){
      var text = Array.prototype.join.call(arguments, ' ');
      var expectedFamily = expectedWarningFamily(text);
      if(expectedFamily) expectedScenarioWarnings.push(freeze({ operation: 'product-warning', warning: text }));
      else warnings.push(text);
      return originalWarn.apply(console, arguments);
    };
    console.error = function(){
      consoleErrors.push(Array.prototype.join.call(arguments, ' '));
      return originalError.apply(console, arguments);
    };

    var nativeSetTimeout = window.setTimeout;
    var nativeClearTimeout = window.clearTimeout;
    window.setTimeout = function(callback, delay){
      var timerId = contextId + '-timer-' + (timers.length + 1);
      var before = safeEvent('timer', 'scheduled', 'setTimeout', { timerId: timerId, dependency: 'scheduler' });
      var nativeId = nativeSetTimeout(function(){
        var started = safeEvent('timer', 'callback', 'setTimeout', { timerId: timerId, dependency: 'scheduler' });
        relate(before, started, 'TIMER_SCHEDULE_BEFORE_CALLBACK');
        record.callbackEventId = started.eventId;
        callback();
      }, delay);
      var record = { timerId: timerId, nativeId: nativeId, delayMs: Number(delay) || 0, scheduleEventId: before.eventId, callbackEventId: null, contextId: contextId };
      timers.push(record);
      return nativeId;
    };
    window.clearTimeout = function(id){ return nativeClearTimeout(id); };

    var nativeAddEventListener = window.EventTarget.prototype.addEventListener;
    window.EventTarget.prototype.addEventListener = function(type, callback, options){
      var listenerId = contextId + '-listener-' + (listeners.length + 1);
      var registered = safeEvent('listener', 'registered', String(type), { listenerId: listenerId, dependency: 'listener', outcome: 'registered' });
      var record = { listenerId: listenerId, eventType: String(type), contextId: contextId, registerEventId: registered.eventId, callbackEventIds: [] };
      listeners.push(record);
      function wrapped(event){
        var callbackEvent = safeEvent('listener', 'callback', String(type), { listenerId: listenerId, dependency: 'listener', outcome: 'called' });
        record.callbackEventIds.push(callbackEvent.eventId);
        relate(registered, callbackEvent, 'LISTENER_REGISTER_BEFORE_CALLBACK');
        var dispatchEvent = controller.lastDispatch[String(type)];
        if(dispatchEvent) relate(dispatchEvent, callbackEvent, 'DISPATCH_PRECEDES_LISTENER_CALLBACK');
        return callback.call(this, event);
      }
      return nativeAddEventListener.call(this, type, wrapped, options);
    };

    var nativeAppendChild = document.head.appendChild.bind(document.head);
    document.head.appendChild = function(node){
      if(node && node.tagName === 'SCRIPT' && node.src){
        var src = String(node.src);
        var isDomain = src.indexOf('/js/release/') >= 0 || src.indexOf('/js/session/') >= 0 || src.indexOf('/js/player-state/') >= 0 || src.indexOf('/js/runtime/runtime-core.js') >= 0 || src.indexOf('/js/navigation/navigation-core.js') >= 0 || src.indexOf('/js/runtime/bootstrap/runtime-bootstrap-adapter.js') >= 0;
        if(isDomain && (controller.domainState === 'unavailable' || controller.domainScriptsFail)){
          safeEvent('domain', 'load', 'script-blocked', { dependency: 'domain', availabilityBefore: 'unavailable', availabilityAfter: 'unavailable', outcome: 'blocked' });
          nativeSetTimeout(function(){ if(typeof node.onerror === 'function') node.onerror(new Error('DOMAIN_UNAVAILABLE')); }, 0);
          return node;
        }
      }
      return nativeAppendChild(node);
    };

    function emitFetchCallback(record, settled, outcome){
      NativePromise.resolve().then(function(){
        var callback = safeEvent('fetch', 'callback', record.kind, {
          dependency: 'network',
          requestId: record.requestId,
          outcome: outcome,
          availabilityBefore: controller.online ? 'online' : 'offline',
          availabilityAfter: controller.online ? 'online' : 'offline'
        });
        record.callbackEventIds.push(callback.eventId);
        relate(settled, callback, 'FETCH_SETTLEMENT_PRECEDES_CALLBACK');
      });
    }

    window.fetch = function(url, options){
      var text = String(url || '');
      var requestId = contextId + '-request-' + (fetches.length + 1);
      var requestKind = text.indexOf('accion=grupos') >= 0 ? 'groups' : 'transmission';
      var called = safeEvent('fetch', 'called', requestKind, {
        dependency: 'network',
        availabilityBefore: controller.online ? 'online' : 'offline',
        availabilityAfter: controller.online ? 'online' : 'offline',
        requestId: requestId,
        outcome: 'called'
      });

      var record = {
        requestId: requestId,
        kind: requestKind,
        mode: controller.requestMode,
        contextId: contextId,
        settled: false,
        settledAs: null,
        callEventId: called.eventId,
        settlementEventId: null,
        callbackEventIds: []
      };
      fetches.push(record);

      if(requestKind === 'groups'){
        var settledGroups = safeEvent('fetch', 'settled', 'groups', { dependency: 'network', requestId: requestId, outcome: 'resolved', availabilityBefore: controller.online ? 'online' : 'offline', availabilityAfter: controller.online ? 'online' : 'offline' });
        record.settled = true;
        record.settledAs = 'resolved';
        record.settlementEventId = settledGroups.eventId;
        relate(called, settledGroups, 'FETCH_CALL_PRECEDES_SETTLEMENT');
        emitFetchCallback(record, settledGroups, 'resolved');
        return NativePromise.resolve({ ok: true, status: 200, json: function(){ return NativePromise.resolve({ ok: true, grupos: ['GRUPO_SINTETICO'] }); } });
      }

      if(!controller.online || controller.requestMode === 'rejected'){
        record.settled = true;
        record.settledAs = 'rejected';
        var settledRejected = safeEvent('fetch', 'settled', 'transmission', { dependency: 'network', requestId: requestId, outcome: 'rejected', availabilityBefore: controller.online ? 'online' : 'offline', availabilityAfter: controller.online ? 'online' : 'offline', errorCode: 'NETWORK_REJECTED' });
        record.settlementEventId = settledRejected.eventId;
        relate(called, settledRejected, 'FETCH_CALL_PRECEDES_SETTLEMENT');
        emitFetchCallback(record, settledRejected, 'rejected');
        return NativePromise.reject(new Error('CONTROLLED_FETCH_REJECTED'));
      }

      if(controller.requestMode === 'pending'){
        var deferred = createDeferred(NativePromise);
        controller.pendingRequests.push({ requestId: requestId, deferred: deferred, record: record, callEvent: called });
        return deferred.promise;
      }

      record.settled = true;
      record.settledAs = 'resolved';
      var settledResolved = safeEvent('fetch', 'settled', 'transmission', { dependency: 'network', requestId: requestId, outcome: 'resolved', availabilityBefore: 'online', availabilityAfter: 'online' });
      record.settlementEventId = settledResolved.eventId;
      relate(called, settledResolved, 'FETCH_CALL_PRECEDES_SETTLEMENT');
      emitFetchCallback(record, settledResolved, 'resolved');
      return NativePromise.resolve({ type: 'opaque' });
    };

    function settlePending(requestId, outcome){
      var found = controller.pendingRequests.find(function(item){ return item.requestId === requestId; });
      if(!found || found.record.settled) return false;
      found.record.settled = true;
      found.record.settledAs = outcome;
      var settled = safeEvent('fetch', 'settled', 'transmission', {
        dependency: 'network',
        requestId: requestId,
        outcome: outcome,
        availabilityBefore: controller.online ? 'online' : 'offline',
        availabilityAfter: controller.online ? 'online' : 'offline',
        errorCode: outcome === 'rejected' ? 'NETWORK_REJECTED' : null
      });
      found.record.settlementEventId = settled.eventId;
      relate(found.callEvent, settled, 'FETCH_CALL_PRECEDES_SETTLEMENT');
      var result = outcome === 'resolved' ? found.deferred.resolve({ type: 'opaque' }) : found.deferred.reject(new Error('CONTROLLED_FETCH_REJECTED'));
      emitFetchCallback(found.record, settled, outcome);
      return result;
    }

    var publicationPromise = createPublication();
    var reference = null;
    var publication = null;

    var persistenceApi = {
      createPersistenceCoordinator: function(){
        return freeze({
          activationStore: freeze({
            getActiveReference: function(){
              safeEvent('recovery', 'read', 'active-reference', {
                dependency: 'recovery',
                availabilityBefore: 'available',
                availabilityAfter: controller.referenceMissing ? 'publication-missing' : 'available',
                outcome: controller.referenceMissing ? 'missing' : 'found'
              });
              if(controller.referenceMissing) return null;
              return reference;
            }
          }),
          publicationStore: freeze({
            getPublication: function(publicationId){
              safeEvent('recovery', 'read', 'publication', {
                dependency: 'recovery',
                availabilityBefore: 'available',
                availabilityAfter: controller.publicationMissing ? 'publication-missing' : (controller.publicationMismatched ? 'publication-mismatched' : 'available'),
                outcome: controller.publicationMissing ? 'missing' : 'found'
              });
              if(controller.publicationMissing) return null;
              if(controller.publicationMismatched){
                var mismatched = clone(publication);
                mismatched.contentHash = 'mismatch-' + publication.contentHash;
                return freeze(mismatched);
              }
              return publicationId === publication.publicationId ? publication : null;
            }
          })
        });
      }
    };

    window.CRIOS_PUBLICATION_PERSISTENCE = freeze({
      version: '1.0.0',
      createPersistenceCoordinator: persistenceApi.createPersistenceCoordinator
    });

    function setDomainState(nextState){
      var before = controller.domainState;
      controller.domainState = String(nextState);
      safeEvent('domain', 'state', 'set-domain-state', {
        dependency: 'domain',
        availabilityBefore: before,
        availabilityAfter: controller.domainState,
        outcome: 'updated'
      });
    }

    function loseDomain(){
      setDomainState('lost');
      controller.domainScriptsFail = true;
    }

    function restoreDomain(){
      controller.domainScriptsFail = false;
      setDomainState('ready-for-new-context');
    }

    function setOnline(){
      var before = controller.online;
      controller.online = true;
      safeEvent('network', 'state', 'set-online', { dependency: 'network', availabilityBefore: before ? 'online' : 'offline', availabilityAfter: 'online', outcome: 'updated' });
    }

    function setOffline(){
      var before = controller.online;
      controller.online = false;
      safeEvent('network', 'state', 'set-offline', { dependency: 'network', availabilityBefore: before ? 'online' : 'offline', availabilityAfter: 'offline', outcome: 'updated' });
    }

    function dispatchOnline(){
      var dispatched = safeEvent('network', 'dispatch', 'online-event', { dependency: 'network', availabilityBefore: controller.online ? 'online' : 'offline', availabilityAfter: controller.online ? 'online' : 'offline', outcome: 'dispatched' });
      controller.lastDispatch.online = dispatched;
      var event = new Event('online');
      window.dispatchEvent(event);
    }

    function dispatchOffline(){
      var dispatched = safeEvent('network', 'dispatch', 'offline-event', { dependency: 'network', availabilityBefore: controller.online ? 'online' : 'offline', availabilityAfter: controller.online ? 'online' : 'offline', outcome: 'dispatched' });
      controller.lastDispatch.offline = dispatched;
      var event = new Event('offline');
      window.dispatchEvent(event);
    }

    function setRequestMode(mode){
      var before = controller.requestMode;
      controller.requestMode = String(mode);
      safeEvent('network', 'state', 'set-request-mode', { dependency: 'network', availabilityBefore: before, availabilityAfter: controller.requestMode, outcome: 'updated' });
    }

    function unresolvedRequests(){
      return controller.pendingRequests.filter(function(item){ return !item.record.settled; }).map(function(item){ return item.requestId; });
    }

    function resolveRequest(requestId){ return settlePending(requestId, 'resolved'); }
    function rejectRequest(requestId){ return settlePending(requestId, 'rejected'); }

    function runRecoveryProbe(label){
      var attempt = {
        label: String(label || 'recovery'),
        sessionPresent: false,
        progressPresent: false,
        pendingPresent: false,
        publication: null,
        outcome: 'unknown',
        error: null
      };
      try { attempt.sessionPresent = sessionStorage.getItem(settings.storageKeys.sessionData) !== null; } catch(error){ attempt.error = createSyntheticError('RECOVERY_SESSION_READ_FAILURE', 'getItem', 'read', 'sessionStorage'); }
      try { attempt.progressPresent = sessionStorage.getItem(settings.storageKeys.campaignProgress) !== null; } catch(error){ attempt.error = createSyntheticError('RECOVERY_PROGRESS_READ_FAILURE', 'getItem', 'read', 'sessionStorage'); }
      try { attempt.pendingPresent = localStorage.getItem(settings.storageKeys.pendingResult) !== null; } catch(error){ attempt.error = createSyntheticError('RECOVERY_PENDING_READ_FAILURE', 'getItem', 'read', 'localStorage'); }
      attempt.publication = controller.publicationMissing ? null : (controller.publicationMismatched ? 'mismatched' : 'present');
      attempt.outcome = attempt.error ? 'blocked' : 'observed';
      recoveryAttempts.push(freeze(attempt));
      safeEvent('recovery', 'probe', 'run-recovery-probe', {
        dependency: 'recovery',
        availabilityBefore: 'available',
        availabilityAfter: controller.forceCorruptRecovery ? 'corrupt' : 'available',
        outcome: attempt.outcome,
        errorCode: attempt.error ? attempt.error.code : null
      });
      return attempt;
    }

    var ready = publicationPromise.then(function(value){
      publication = value;
      reference = freeze({
        campaignId: publication.campaignId,
        publicationId: publication.publicationId,
        version: publication.version,
        contentHash: publication.contentHash
      });
      return true;
    });

    window.__CRIOS_DEGRADED_AVAILABILITY_STATE__ = Object.freeze({
      contextId: contextId,
      contextCreatedEvent: contextCreatedEvent,
      emitControlled: safeEvent,
      relateControlled: relate,
      ready: ready,
      events: events,
      snapshots: snapshots,
      relationships: relationships,
      fetches: fetches,
      timers: timers,
      listeners: listeners,
      storageOperations: storageOperations,
      recoveryAttempts: recoveryAttempts,
      pageerrors: pageerrors,
      consoleErrors: consoleErrors,
      warnings: warnings,
      expectedScenarioWarnings: expectedScenarioWarnings,
      sessionStorage: sessionStorageControl,
      localStorage: localStorageControl,
      storageKeys: settings.storageKeys,
      publicationReference: function(){ return reference ? clone(reference) : null; },
      setDomainUnavailable: function(){ controller.domainScriptsFail = true; setDomainState('unavailable'); },
      beginDomainInitialization: function(){ controller.domainScriptsFail = false; setDomainState('initializing'); },
      setDomainReady: function(){ controller.domainScriptsFail = false; setDomainState('ready'); },
      loseDomain: loseDomain,
      restoreDomain: restoreDomain,
      setOnline: setOnline,
      setOffline: setOffline,
      dispatchOnline: dispatchOnline,
      dispatchOffline: dispatchOffline,
      setRequestPending: function(){ setRequestMode('pending'); },
      setRequestResolved: function(){ setRequestMode('resolved'); },
      setRequestRejected: function(){ setRequestMode('rejected'); },
      resolveRequest: resolveRequest,
      rejectRequest: rejectRequest,
      unresolvedRequests: unresolvedRequests,
      setStorageAvailable: function(){ sessionStorageControl.setAvailable(); localStorageControl.setAvailable(); },
      setStorageFailure: function(storage, operation, key, errorCode){ (storage === 'localStorage' ? localStorageControl : sessionStorageControl).setFailure(operation, key, errorCode); },
      clearStorageFailure: function(storage, operation, key){ (storage === 'localStorage' ? localStorageControl : sessionStorageControl).clearFailure(operation, key); },
      setSessionReadFailure: function(){ sessionStorageControl.setReadFailure(); },
      setSessionWriteFailure: function(){ sessionStorageControl.setWriteFailure(); },
      setLocalReadFailure: function(){ localStorageControl.setReadFailure(); },
      setLocalWriteFailure: function(){ localStorageControl.setWriteFailure(); },
      setQuotaExceeded: function(){ sessionStorageControl.setQuotaExceeded(); localStorageControl.setQuotaExceeded(); },
      setRemoveFailure: function(){ localStorageControl.setRemoveFailure(); },
      restoreStorage: function(){ sessionStorageControl.restore(); localStorageControl.restore(); },
      setRecoveryAbsent: function(){ controller.referenceMissing = true; controller.publicationMissing = true; },
      setRecoveryCorrupt: function(){ controller.forceCorruptRecovery = true; },
      setRecoveryPublicationMissing: function(){ controller.publicationMissing = true; },
      setRecoveryPublicationMismatched: function(){ controller.publicationMismatched = true; },
      restoreRecovery: function(){ controller.referenceMissing = false; controller.publicationMissing = false; controller.publicationMismatched = false; controller.forceCorruptRecovery = false; },
      runRecoveryProbe: runRecoveryProbe,
      snapshot: snapshot,
      sleep: function(ms){ return new NativePromise(function(resolve){ setTimeout(resolve, Number(ms) || 0); }); }
    });
  }

  var identity = freeze({ realName: 'Persona Sintetica', characterName: 'Operador Controlado', groupName: 'GRUPO_SINTETICO' });
  var storageKeys = freeze({
    progress: 'a2j-progress',
    complete: 'a2j-complete',
    realName: 'a2j-real-name',
    characterName: 'a2j-character-name',
    groupName: 'a2j-group-name',
    sessionStats: 'a2j-session-stats',
    sessionData: 'a2j-session-data',
    pendingResult: 'a2j-pending-result',
    campaignId: 'a2j-campaign-id',
    campaignProgress: 'a2j-campaign-progress'
  });

  window.CRIOS_RUNTIME_DEGRADED_AVAILABILITY_FIXTURES = freeze({
    clone: clone,
    freeze: freeze,
    createDeferred: createDeferred,
    createControlledStorage: createControlledStorage,
    createSyntheticError: createSyntheticError,
    installChildHarness: installChildHarness,
    identity: identity,
    storageKeys: storageKeys,
    missionIds: freeze(['energy', 'greenhouse', 'ice', 'hangar'])
  });
})();
