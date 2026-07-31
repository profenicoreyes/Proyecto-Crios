/* CRIOS A2-006K - RT-006 runtime contradiction matrix */
(function(){
  'use strict';

  var fixtures=window.CRIOS_RT006_FIXTURES;
  var startedAt=new Date().toISOString();
  var startedPerformance=performance.now();
  var assertions=[];
  var evidenceRuns=[];
  var sourceRecords=[];
  var claimResults=[];
  var controlledResults=[];
  var pageErrors=[];
  var consoleErrors=[];
  var warnings=[];
  var unexpectedWarnings=[];
  var originalConsoleError=console.error;
  var originalConsoleWarn=console.warn;
  var instrumentationRestored=false;
  var externalResources=[];
  var storageChecks=[];
  var framesCreated=[];
  var activeFrame=null;
  var privacyControlResults=[];
  var privacyScanResult={detected:false,matches:[],ignoredTechnicalDescriptors:[]};

  function freeze(value){if(!value||typeof value!=='object'||Object.isFrozen(value))return value;Object.keys(value).forEach(function(key){freeze(value[key]);});return Object.freeze(value);}
  function clone(value){return JSON.parse(JSON.stringify(value));}
  function assert(condition,message){if(!condition)throw new Error(message||'Assertion failed');}
  function equal(actual,expected,message){if(JSON.stringify(actual)!==JSON.stringify(expected))throw new Error((message||'Values differ')+' actual='+JSON.stringify(actual)+' expected='+JSON.stringify(expected));}
  function byId(list,id){return list.filter(function(item){return item.id===id||item.claimId===id||item.controlId===id;})[0]||null;}
  function runById(id){return evidenceRuns.filter(function(item){return item.id===id;})[0]||null;}
  function containsForbidden(value){var text=JSON.stringify(value);return fixtures.forbiddenConclusions.some(function(token){return text.indexOf(token)>=0;});}
  function safeArray(value){return Array.isArray(value)?value:[];}
  function compactError(error){return {name:error&&error.name||'Error',message:String(error&&error.message||error)};}
  function normalizedKey(key){return String(key||'').replace(/[^a-z0-9]/gi,'').toLowerCase();}
  function isSensitiveKey(key){return ['username','realname','email','emailaddress','phone','phonenumber','identity','personalid','documentid','studentanswer','answerraw','respuestas'].indexOf(normalizedKey(key))>=0;}
  function isTechnicalDescriptor(value){return /^(?:crios[-_.])?[a-z][a-z0-9]*(?:[-_.][a-z0-9]+)*$/i.test(value)&&!/@/.test(value);}
  function scanPrivacy(value){
    var matches=[];
    var ignoredTechnicalDescriptors=[];
    var seen=[];
    function addMatch(path,category){matches.push({path:path,category:category});}
    function walk(current,path,parentKey,context){
      var keySensitive=isSensitiveKey(parentKey);
      if(current===null||current===undefined)return;
      if(typeof current==='string'){
        if(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(current)){addMatch(path,'EMAIL');return;}
        if(/(?:\+\d{1,3}[ .-]?)?\d{3}[ .-]\d{3}[ .-]\d{4}\b/.test(current)){addMatch(path,'PHONE');return;}
        if(keySensitive&&current.length>0){addMatch(path,'SENSITIVE_FIELD_VALUE');return;}
        if(isTechnicalDescriptor(current))ignoredTechnicalDescriptors.push({path:path,category:'TECHNICAL_DESCRIPTOR'});
        return;
      }
      if(typeof current==='number'||typeof current==='boolean'){
        if(keySensitive&&context==='identity')addMatch(path,'STRUCTURED_PERSONAL_IDENTIFIER');
        return;
      }
      if(typeof current!=='object')return;
      if(seen.indexOf(current)>=0)return;
      seen.push(current);
      if(keySensitive&&(Array.isArray(current)?current.length>0:Object.keys(current).length>0)){addMatch(path,'SENSITIVE_FIELD_PAYLOAD');return;}
      Object.keys(current).forEach(function(key){
        var nextContext=isSensitiveKey(key)?(normalizedKey(key).indexOf('answer')>=0||normalizedKey(key)==='respuestas'?'student-answer':'identity'):context;
        walk(current[key],path+(Array.isArray(current)?'['+key+']':'.'+key),key,nextContext);
      });
    }
    walk(value,'$','',null);
    return {detected:matches.length>0,matches:matches,ignoredTechnicalDescriptors:ignoredTechnicalDescriptors};
  }
  function runPrivacyControls(){
    var controls=[
      {id:'PRIV-TECHNICAL-DESCRIPTORS',category:'TECHNICAL_DESCRIPTORS',expectedDetected:false,value:{fieldName:'userName',storageKey:'crios-user-name',payloadType:'identityField',descriptor:'studentAnswerKey'}},
      {id:'PRIV-SYNTHETIC-EMAIL',category:'EMAIL',expectedDetected:true,value:{diagnostic:'privacy-sentinel@example.invalid'}},
      {id:'PRIV-SYNTHETIC-PHONE',category:'PHONE',expectedDetected:true,value:{diagnostic:'+1 202-555-0147'}},
      {id:'PRIV-SENSITIVE-FIELD',category:'SENSITIVE_FIELD_VALUE',expectedDetected:true,value:{userName:'ephemeral-sensitive-sentinel'}},
      {id:'PRIV-SYNTHETIC-REAL-NAME',category:'REAL_NAME',expectedDetected:true,value:{realName:'Persona Sintetica'}},
      {id:'PRIV-SYNTHETIC-IDENTITY',category:'IDENTITY',expectedDetected:true,value:{identity:'synthetic-user-001'}},
      {id:'PRIV-SYNTHETIC-STUDENT-ANSWER',category:'STUDENT_ANSWER',expectedDetected:true,value:{studentAnswer:'respuesta-sintetica'}},
      {id:'PRIV-SENSITIVE-PAYLOAD',category:'SENSITIVE_PAYLOAD',expectedDetected:true,value:{respuestas:['respuesta-sintetica']}}
    ];
    privacyControlResults=controls.map(function(control){var actual=scanPrivacy(control.value).detected;return freeze({controlId:control.id,expectedDetected:control.expectedDetected,actualDetected:actual,pass:actual===control.expectedDetected,category:control.category});});
  }
  function warningDisposition(message,expectedTokens){return expectedTokens.some(function(token){return String(message).indexOf(token)>=0;})?'EXPECTED':'UNEXPECTED';}
  function updateDisplay(stage){
    var node=document.getElementById('status');
    if(node)node.textContent=stage;
    var progress=document.getElementById('progress');
    if(progress)progress.textContent=evidenceRuns.length+' / '+fixtures.harnesses.length+' harnesses';
  }

  function errorHandler(event){pageErrors.push(String(event.message||event.error||'error'));}
  function unhandledRejectionHandler(event){pageErrors.push(String(event.reason||'unhandled rejection'));}
  function consoleErrorWrapper(){consoleErrors.push(Array.prototype.join.call(arguments,' '));return originalConsoleError.apply(console,arguments);}
  function consoleWarnWrapper(){var message=Array.prototype.join.call(arguments,' ');warnings.push(message);if(warningDisposition(message,[])==='UNEXPECTED')unexpectedWarnings.push(message);return originalConsoleWarn.apply(console,arguments);}
  function restoreInstrumentation(){
    if(instrumentationRestored)return;
    window.removeEventListener('error',errorHandler);
    window.removeEventListener('unhandledrejection',unhandledRejectionHandler);
    if(console.error===consoleErrorWrapper)console.error=originalConsoleError;
    if(console.warn===consoleWarnWrapper)console.warn=originalConsoleWarn;
    instrumentationRestored=true;
  }
  window.addEventListener('error',errorHandler);
  window.addEventListener('unhandledrejection',unhandledRejectionHandler);
  console.error=consoleErrorWrapper;
  console.warn=consoleWarnWrapper;

  function snapshotStorage(storage){
    var keys=[];
    var output={};
    for(var index=0;index<storage.length;index+=1){keys.push(storage.key(index));}
    keys.sort();
    keys.forEach(function(key){output[key]=storage.getItem(key);});
    return output;
  }
  function restoreStorage(storage,snapshot){
    storage.clear();
    Object.keys(snapshot).forEach(function(key){storage.setItem(key,snapshot[key]);});
  }
  function storageSnapshot(){return {local:snapshotStorage(localStorage),session:snapshotStorage(sessionStorage)};}
  function restoreAllStorage(snapshot){restoreStorage(localStorage,snapshot.local);restoreStorage(sessionStorage,snapshot.session);}

  async function sha256(text){
    var bytes=new TextEncoder().encode(text);
    var digest=await crypto.subtle.digest('SHA-256',bytes);
    return Array.prototype.map.call(new Uint8Array(digest),function(value){return value.toString(16).padStart(2,'0');}).join('');
  }

  async function loadSources(){
    var paths=[];
    fixtures.claims.concat(fixtures.exclusions).forEach(function(claim){if(paths.indexOf(claim.sourcePath)<0)paths.push(claim.sourcePath);});
    var contentByPath={};
    var accessibilityByPath={};
    for(var index=0;index<paths.length;index+=1){
      var response=await fetch(paths[index],{cache:'no-store'});
      accessibilityByPath[paths[index]]={sourceAccessible:response.ok===true,httpStatus:response.status};
      assert(response.ok,'Source unavailable: '+paths[index]);
      contentByPath[paths[index]]=await response.text();
    }
    var allClaims=fixtures.claims.concat(fixtures.exclusions);
    for(var claimIndex=0;claimIndex<allClaims.length;claimIndex+=1){
      var claim=allClaims[claimIndex];
      var content=contentByPath[claim.sourcePath];
      var occurrences=content.split(claim.sourceLocator).length-1;
      var digest=await sha256(claim.sourceLocator);
      var digestMatches=digest===claim.claimDigest;
      sourceRecords.push(freeze({claimId:claim.claimId,sourcePath:claim.sourcePath,sourceAccessible:accessibilityByPath[claim.sourcePath].sourceAccessible,httpStatus:accessibilityByPath[claim.sourcePath].httpStatus,locatorFound:occurrences===1,occurrences:occurrences,digest:digest,digestMatches:digestMatches,documentIntegrity:digestMatches?'DOCUMENT_INTEGRITY_VALID':'DOCUMENT_INTEGRITY_INVALID'}));
    }
  }

  function readPath(object,path){return path?object&&object[path]:null;}
  function sanitizeAssertions(items){return safeArray(items).map(function(item){return freeze({name:String(item.name||''),group:String(item.group||''),passed:item.passed===true,error:item.error?compactError(item.error):null});});}
  function normalizeHarness(descriptor,result,durationMs,resourceBoundaryMs,storageBefore,storageAfter){
    var adapter=descriptor.adapter;
    var errors=[];
    adapter.errors.forEach(function(path){safeArray(readPath(result,path)).forEach(function(error){errors.push(String(error));});});
    var resources=performance.getEntriesByType('resource').filter(function(entry){return entry.startTime>=resourceBoundaryMs;}).map(function(entry){return entry.name;});
    var external=resources.filter(function(url){try{return new URL(url,location.href).origin!==location.origin;}catch(error){return true;}});
    Array.prototype.push.apply(externalResources,external);
    var normalized=freeze({
      id:descriptor.id,
      covers:descriptor.covers,
      role:descriptor.role,
      status:result.status,
      total:Number(result.total),
      passed:Number(result.passed),
      failed:Number(result.failed),
      assertions:sanitizeAssertions(result[adapter.assertions]),
      eventCount:safeArray(readPath(result,adapter.events)).length,
      relationshipCount:safeArray(readPath(result,adapter.relationships)).length,
      contradictions:safeArray(readPath(result,adapter.contradictions)).map(function(item){return clone(item);}),
      warnings:safeArray(readPath(result,adapter.warnings)).map(String),
      errors:errors,
      storageTelemetryCount:safeArray(readPath(result,adapter.storage)).length,
      networkTelemetryCount:safeArray(readPath(result,adapter.network)).length,
      references:adapter.references.reduce(function(output,path){var value=readPath(result,path);if(value!==undefined)output[path]=Array.isArray(value)?{count:value.length}:clone(value);return output;},{}),
      durationMs:durationMs,
      storageRestored:JSON.stringify(storageBefore)===JSON.stringify(storageAfter),
      externalResources:external
    });
    return normalized;
  }

  function productionInterferenceDetectedForRun(run){
    var referenceInterference=Object.keys(run.references||{}).some(function(key){var reference=run.references[key];return reference&&reference.productionInterferenceDetected===true;});
    var storageInterference=Object.prototype.hasOwnProperty.call(run,'storageRestored')&&run.storageRestored!==true;
    return referenceInterference||safeArray(run.externalResources).length>0||storageInterference;
  }

  function runtimeIndicators(){
    return {
      realNetworkDetected:externalResources.length>0,
      realStorageDetected:storageChecks.some(function(item){return !item.restored;}),
      productionInterferenceDetected:evidenceRuns.some(productionInterferenceDetectedForRun)
    };
  }

  function waitForTerminal(frame,descriptor){
    return new Promise(function(resolve,reject){
      var began=performance.now();
      var timer=setInterval(function(){
        try{
          var result=frame.contentWindow[descriptor.resultGlobal];
          if(result&&descriptor.terminalStates.indexOf(result.status)>=0){clearInterval(timer);resolve(result);return;}
          if(performance.now()-began>descriptor.timeoutMs){clearInterval(timer);reject(new Error('HARNESS_TIMEOUT '+descriptor.id));}
        }catch(error){clearInterval(timer);reject(error);}
      },100);
    });
  }

  async function runHarness(descriptor,index){
    updateDisplay('Ejecutando '+descriptor.id);
    var before=storageSnapshot();
    var frame=document.createElement('iframe');
    var token='a2-006k-'+index+'-'+Math.random().toString(36).slice(2);
    frame.hidden=true;
    frame.dataset.harness=descriptor.id;
    var resourceBoundaryMs=performance.now();
    frame.src=descriptor.html+'?run=a2-006k-focal&cache='+encodeURIComponent(token);
    framesCreated.push(frame);
    activeFrame=frame;
    document.getElementById('harnesses').appendChild(frame);
    var began=performance.now();
    try{
      var result=await waitForTerminal(frame,descriptor);
      restoreAllStorage(before);
      var after=storageSnapshot();
      storageChecks.push({id:descriptor.id,before:before,after:after,restored:JSON.stringify(before)===JSON.stringify(after)});
      evidenceRuns.push(normalizeHarness(descriptor,result,Math.round((performance.now()-began)*100)/100,resourceBoundaryMs,before,after));
    }finally{
      restoreAllStorage(before);
      frame.remove();
      activeFrame=null;
    }
  }

  function classifySynthetic(control){
    if(control.scopeBoundary)return 'OUT_OF_SCOPE';
    if(!control.observable)return 'NOT_DEMONSTRATED';
    if(control.ambiguous||!control.causal||(control.directlyIncompatible&&!control.reproducible))return 'INDETERMINATE';
    if(control.directlyIncompatible&&control.causal&&control.reproducible)return 'CONTRADICTED';
    if(control.applicableComplete)return 'NO_CONTRADICTION_OBSERVED';
    return 'INDETERMINATE';
  }

  function classifySemanticEvidence(evidence){
    if(evidence.scopeBoundary===true)return 'OUT_OF_SCOPE';
    if(evidence.documentIntegrity==='DOCUMENT_INTEGRITY_INVALID')return 'INDETERMINATE';
    if(evidence.evidenceAvailable!==true)return 'NOT_DEMONSTRATED';
    if(evidence.evidenceValid!==true||evidence.internallyConsistent!==true)return 'INDETERMINATE';
    if(evidence.contradiction===true&&evidence.direct===true&&evidence.specific===true&&evidence.causal===true&&evidence.reproducible===true)return 'CONTRADICTED';
    if(evidence.contradiction===false&&evidence.complete===true&&evidence.direct===true&&evidence.specific===true&&evidence.causal===true&&evidence.reproducible===true)return 'NO_CONTRADICTION_OBSERVED';
    return 'NOT_DEMONSTRATED';
  }

  function assertionPassed(run,name){
    return Boolean(run&&run.assertions.some(function(item){return item.name===name&&item.passed;}));
  }

  function claimResult(claimId,status,evidenceRefs,observedRelations,limitations,reproducibility){
    var claim=fixtures.claims.filter(function(item){return item.claimId===claimId;})[0];
    return freeze({claimId:claim.claimId,sourcePath:claim.sourcePath,sourceLocator:claim.sourceLocator,claimDigest:claim.claimDigest,claimType:claim.claimType,applicableRTs:claim.applicableRTs,evidenceRefs:evidenceRefs,observedRelations:observedRelations,contradictionCount:status==='CONTRADICTED'?1:0,status:status,limitations:limitations,reproducibility:reproducibility,privacyImpact:'NONE',productionInterference:false});
  }

  function classifyClaims(){
    var transmission=runById('transmission-reload');
    var coherence=runById('local-coherence');
    var asyncRun=runById('async-ordering');
    var degraded=runById('degraded-availability');
    var rt001=transmission.references.rt001||{};
    var rt002=transmission.references.rt002||{};
    var rt003=coherence.references.rt003||{};
    var rt004=coherence.references.rt004||{};
    var rt005=asyncRun.references.rt005||{};
    var rt007=degraded.references.rt007||{};
    var dc022Evidence={
      evidenceAvailable:assertionPassed(asyncRun,'late callback puede mutar storage compartido')&&assertionPassed(asyncRun,'conclusion tardia se reproduce sin corregir'),
      evidenceValid:rt005.causalGraphsAcyclic===true,
      internallyConsistent:asyncRun.contradictions.length===0,
      direct:false,
      specific:false,
      causal:asyncRun.relationshipCount>0,
      reproducible:assertionPassed(asyncRun,'conclusion tardia se reproduce sin corregir'),
      complete:false,
      contradiction:false,
      documentIntegrity:'NOT_APPLICABLE'
    };
    var dc026Evidence={
      evidenceAvailable:assertionPassed(transmission,'pendingResult coincide con request fallida')&&assertionPassed(asyncRun,'late callback puede mutar storage compartido'),
      evidenceValid:transmission.contradictions.length===0&&asyncRun.contradictions.length===0,
      internallyConsistent:true,
      direct:false,
      specific:false,
      causal:false,
      reproducible:assertionPassed(transmission,'pendingResult coincide con request fallida'),
      complete:false,
      contradiction:false,
      documentIntegrity:'NOT_APPLICABLE'
    };
    var dc027Source=byId(sourceRecords,'DC-027');
    var dc027Evidence={
      evidenceAvailable:false,
      evidenceValid:true,
      internallyConsistent:true,
      direct:false,
      specific:false,
      causal:false,
      reproducible:false,
      complete:false,
      contradiction:false,
      documentIntegrity:dc027Source.documentIntegrity
    };
    claimResults.push(claimResult('DC-013',rt001.localCloseObserved&&!rt001.serverConfirmationDemonstrated?'CONTRADICTED':'INDETERMINATE',['transmission-reload:rt001.localCloseObserved','transmission-reload:rt001.serverConfirmationStatus'],['LOCAL_CLOSE_PRECEDES_FETCH_SETTLEMENT','SERVER_CONFIRMATION_NOT_DEMONSTRABLE'],['no server-side observer'],'INTERNAL_INDEPENDENT_REFERENCES'));
    claimResults.push(claimResult('DC-015',rt002.closedStatePreserved&&rt002.sessionReopened?'NO_CONTRADICTION_OBSERVED':'CONTRADICTED',['transmission-reload:rt002.closedStatePreserved','transmission-reload:rt002.sessionReopened'],['PENDING_RESULT_SURVIVES_RELOAD'],['finite controlled reload'],'ONE_COMPLETE_RUN'));
    claimResults.push(claimResult('DC-018',rt003.visible&&rt003.visible.gameOverElement===false?'NO_CONTRADICTION_OBSERVED':'CONTRADICTED',['local-coherence:rt003.visible','local-coherence:rt003.eventCount'],['gameOver:entered','gameOver:restored'],['finite front-end universe'],'ONE_COMPLETE_RUN'));
    claimResults.push(claimResult('DC-020',rt004.eventCount>0?'NO_CONTRADICTION_OBSERVED':'NOT_DEMONSTRATED',['local-coherence:rt004.eventCount','local-coherence:assertions'],['domain:mission-sync:after','domain:runtime-navigation-refresh:after'],['executed mission sequence only'],'ONE_COMPLETE_RUN'));
    claimResults.push(claimResult('DC-024',rt005.causalGraphsAcyclic&&asyncRun.relationshipCount>0?'NO_CONTRADICTION_OBSERVED':'INDETERMINATE',['async-ordering:relationships','async-ordering:rt005'],['explicit causal edges','ORDER_NOT_CONTRACTUALLY_DETERMINED'],['scheduler internals excluded'],'ONE_COMPLETE_RUN'));
    claimResults.push(claimResult('DC-029',rt007.outcomeDifferencesObserved?'NO_CONTRADICTION_OBSERVED':'INDETERMINATE',['degraded-availability:rt007','degraded-availability:comparisons'],['controlled baseline-to-degraded comparisons'],['contextual and non-retroactive'],'ONE_COMPLETE_RUN'));
    claimResults.push(claimResult('DC-022',classifySemanticEvidence(dc022Evidence),['async-ordering:assertion:late callback puede mutar storage compartido','async-ordering:assertion:conclusion tardia se reproduce sin corregir','async-ordering:relationships'],['late callback and storage mutation observed without mission-resolution atomicity binding'],['evidence does not directly or specifically demonstrate the atomicity premise'],'TWO_SPECIFIC_ASSERTIONS_WITH_CAUSAL_GRAPH'));
    claimResults.push(claimResult('DC-026',classifySemanticEvidence(dc026Evidence),['transmission-reload:assertion:pendingResult coincide con request fallida','async-ordering:assertion:late callback puede mutar storage compartido'],['pending-result observations exist in independent harnesses'],['no direct comparison of documented and runtime serialized representations'],'TWO_SPECIFIC_ASSERTIONS_WITHOUT_REPRESENTATION_COMPARISON'));
    claimResults.push(claimResult('DC-027',classifySemanticEvidence(dc027Evidence),['source:DC-027:document-integrity'],[],[dc027Source.documentIntegrity==='DOCUMENT_INTEGRITY_INVALID'?'DOCUMENT_INTEGRITY_INVALID':'no independent documentary locators or explicit mismatch evidence'],'DOCUMENT_INTEGRITY_PLUS_SEMANTIC_EVIDENCE'));
    var priorContradictions=claimResults.filter(function(item){return item.status==='CONTRADICTED';}).length;
    claimResults.push(claimResult('DC-028',priorContradictions>0?'CONTRADICTED':'NO_CONTRADICTION_OBSERVED',claimResults.map(function(item){return 'claim:'+item.claimId;}),['canonical matrix reverse review'],['finite execution cannot prove universal absence'],'DERIVED_FROM_CANONICAL_CLASSIFICATIONS'));
  }

  function defineTests(){
    function test(caseId,run){var metadata=fixtures.cases.filter(function(item){return item.id===caseId;})[0];assert(metadata,'Missing case '+caseId);assertions.push({metadata:metadata,run:run});}
    function reverseExpectedStatus(claimId){
      var transmission=runById('transmission-reload');
      var coherence=runById('local-coherence');
      var asyncRun=runById('async-ordering');
      var degraded=runById('degraded-availability');
      var rt001=transmission.references.rt001||{};
      var rt002=transmission.references.rt002||{};
      var rt003=coherence.references.rt003||{};
      var rt004=coherence.references.rt004||{};
      var rt005=asyncRun.references.rt005||{};
      var rt007=degraded.references.rt007||{};
      if(claimId==='DC-013')return rt001.localCloseObserved===true&&rt001.serverConfirmationDemonstrated!==true?'CONTRADICTED':'INDETERMINATE';
      if(claimId==='DC-015')return rt002.closedStatePreserved===true&&rt002.sessionReopened===true?'NO_CONTRADICTION_OBSERVED':'CONTRADICTED';
      if(claimId==='DC-018')return rt003.visible&&rt003.visible.gameOverElement===false?'NO_CONTRADICTION_OBSERVED':'CONTRADICTED';
      if(claimId==='DC-020')return Number(rt004.eventCount)>0?'NO_CONTRADICTION_OBSERVED':'NOT_DEMONSTRATED';
      if(claimId==='DC-024')return rt005.causalGraphsAcyclic===true&&asyncRun.relationshipCount>0?'NO_CONTRADICTION_OBSERVED':'INDETERMINATE';
      if(claimId==='DC-029')return rt007.outcomeDifferencesObserved===true?'NO_CONTRADICTION_OBSERVED':'INDETERMINATE';
      if(claimId==='DC-022')return classifySemanticEvidence({evidenceAvailable:assertionPassed(asyncRun,'late callback puede mutar storage compartido')&&assertionPassed(asyncRun,'conclusion tardia se reproduce sin corregir'),evidenceValid:rt005.causalGraphsAcyclic===true,internallyConsistent:asyncRun.contradictions.length===0,direct:false,specific:false,causal:asyncRun.relationshipCount>0,reproducible:assertionPassed(asyncRun,'conclusion tardia se reproduce sin corregir'),complete:false,contradiction:false,documentIntegrity:'NOT_APPLICABLE'});
      if(claimId==='DC-026')return classifySemanticEvidence({evidenceAvailable:assertionPassed(transmission,'pendingResult coincide con request fallida')&&assertionPassed(asyncRun,'late callback puede mutar storage compartido'),evidenceValid:transmission.contradictions.length===0&&asyncRun.contradictions.length===0,internallyConsistent:true,direct:false,specific:false,causal:false,reproducible:assertionPassed(transmission,'pendingResult coincide con request fallida'),complete:false,contradiction:false,documentIntegrity:'NOT_APPLICABLE'});
      if(claimId==='DC-027'){var source=byId(sourceRecords,'DC-027');return classifySemanticEvidence({evidenceAvailable:false,evidenceValid:true,internallyConsistent:true,direct:false,specific:false,causal:false,reproducible:false,complete:false,contradiction:false,documentIntegrity:source.documentIntegrity});}
      if(claimId==='DC-028'){var related=['DC-013','DC-015','DC-018','DC-020','DC-024','DC-029','DC-022','DC-026','DC-027'];return related.some(function(id){return reverseExpectedStatus(id)==='CONTRADICTED';})?'CONTRADICTED':'NO_CONTRADICTION_OBSERVED';}
      throw new Error('Unknown claim '+claimId);
    }
    var classifications=claimResults.map(function(item){return item.status;});
    var privacyCandidate={claims:claimResults,evidenceRuns:evidenceRuns,sources:sourceRecords};
    var candidatePrivacyScan=scanPrivacy(privacyCandidate);
    var direct=byId(fixtures.syntheticControls,'SYN-DIRECT');
    var noCausal=byId(fixtures.syntheticControls,'SYN-NO-CAUSAL');
    var notReproducible=byId(fixtures.syntheticControls,'SYN-NOT-REPRODUCIBLE');
    var finite=byId(fixtures.syntheticControls,'SYN-FINITE-ABSENCE');
    var notDemonstrated=byId(fixtures.syntheticControls,'SYN-NOT-DEMONSTRATED');
    var ambiguous=byId(fixtures.syntheticControls,'SYN-INDETERMINATE');
    var outOfScope=byId(fixtures.syntheticControls,'SYN-OUT-OF-SCOPE');
    var semanticEventCount=byId(fixtures.semanticCases,'SYN-EVENTCOUNT-WITHOUT-CAUSALITY');
    var semanticTotals=byId(fixtures.semanticCases,'SYN-TOTALS-WITHOUT-SEMANTIC-EVIDENCE');
    var semanticDigestMatch=byId(fixtures.semanticCases,'SYN-DIGEST-MATCH-WITHOUT-SEMANTIC-EVIDENCE');
    var semanticDigestMismatch=byId(fixtures.semanticCases,'SYN-DIGEST-MISMATCH');
    var semanticDirect=byId(fixtures.semanticCases,'SYN-SEMANTIC-DIRECT');
    var semanticFinite=byId(fixtures.semanticCases,'SYN-SEMANTIC-FINITE-COMPLETE');

    test('G1-01',function(){equal(fixtures.classifications,['CONTRADICTED','NO_CONTRADICTION_OBSERVED','NOT_DEMONSTRATED','INDETERMINATE','OUT_OF_SCOPE']);});
    test('G1-02',function(){assert(!containsForbidden(claimResults));});
    test('G1-03',function(){equal(fixtures.harnesses.map(function(item){return item.id;}),['transmission-reload','local-coherence','async-ordering','degraded-availability']);});
    test('G1-04',function(){equal(fixtures.watchdogMs,600000);});
    test('G2-01',function(){equal(sourceRecords.length,11);assert(sourceRecords.every(function(item){return item.sourcePath&&item.sourceAccessible===true&&item.httpStatus===200;}));});
    test('G2-02',function(){assert(sourceRecords.every(function(item){return item.occurrences===1;}));});
    test('G2-03',function(){assert(sourceRecords.every(function(item){return item.digestMatches;}));});
    test('G2-04',function(){var ids=fixtures.claims.map(function(item){return item.claimId;});var locators=fixtures.claims.map(function(item){return item.sourcePath+'#'+item.sourceLocator;});equal(new Set(ids).size,10);equal(new Set(locators).size,10);});
    test('G3-01',function(){equal(fixtures.harnesses[0].covers,['RT-001','RT-002']);});
    test('G3-02',function(){equal(fixtures.harnesses[1].covers,['RT-003','RT-004']);});
    test('G3-03',function(){equal(fixtures.harnesses[2].covers,['RT-005']);});
    test('G3-04',function(){equal(fixtures.harnesses[3].covers,['RT-007']);equal(fixtures.harnesses[3].role,'contextual');});
    test('G3-05',function(){assert(fixtures.claims.filter(function(item){return item.claimId!=='DC-029'&&item.claimId!=='DC-027';}).every(function(item){return item.applicableRTs.every(function(rt){return rt!=='RT-007';});}));});
    test('G3-06',function(){equal(byId(fixtures.claims,'DC-029').applicableRTs,['RT-007']);});
    test('G3-07',function(){equal(byId(fixtures.claims,'DC-027').applicableRTs,[]);});
    fixtures.harnesses.forEach(function(harness,index){test('G4-0'+(index+1),function(){var run=runById(harness.id);equal(run.status,'PASS');equal(run.total,harness.expectedTotal);equal(run.passed,harness.expectedTotal);equal(run.failed,0);});});
    test('G5-01',function(){var incomplete=JSON.parse(JSON.stringify(semanticDirect));incomplete.complete=false;equal(classifySynthetic(direct),'CONTRADICTED');equal(classifySemanticEvidence(semanticDirect),semanticDirect.expected);equal(classifySemanticEvidence(incomplete),'CONTRADICTED');['contradiction','direct','specific','causal','reproducible'].forEach(function(field,index){var malformed=JSON.parse(JSON.stringify(semanticDirect));malformed[field]=index%2?[]:{};assert(classifySemanticEvidence(malformed)!=='CONTRADICTED');});});
    test('G5-02',function(){var nonCausal=JSON.parse(JSON.stringify(semanticDirect));nonCausal.causal=false;assert(classifySemanticEvidence(nonCausal)!=='CONTRADICTED');});
    test('G5-03',function(){equal(classifySynthetic(notReproducible),'INDETERMINATE');});
    test('G6-01',function(){equal(classifySynthetic(finite),'NO_CONTRADICTION_OBSERVED');equal(classifySemanticEvidence(semanticFinite),semanticFinite.expected);['contradiction','complete','direct','specific','causal','reproducible'].forEach(function(field,index){var malformed=JSON.parse(JSON.stringify(semanticFinite));malformed[field]=index%2?[]:{};assert(classifySemanticEvidence(malformed)!=='NO_CONTRADICTION_OBSERVED');});});
    test('G6-02',function(){assert(fixtures.forbiddenConclusions.every(function(token){return JSON.stringify(finite).indexOf(token)<0;}));});
    test('G7-01',function(){var transmissionSummary=byId(semanticTotals.observedHarnessSummaries,'transmission-reload');var asyncSummary=byId(semanticTotals.observedHarnessSummaries,'async-ordering');equal(classifySynthetic(notDemonstrated),'NOT_DEMONSTRATED');assert(semanticEventCount.observedEventCount>0);assert(Array.isArray(semanticEventCount.observedCausalRelationships));equal(semanticEventCount.observedCausalRelationships.length,0);equal(classifySemanticEvidence(semanticEventCount),'NOT_DEMONSTRATED');equal(semanticTotals.observedHarnessSummaries.length,2);equal(transmissionSummary.status,'PASS');equal(transmissionSummary.total,97);equal(transmissionSummary.passed,97);equal(transmissionSummary.failed,0);equal(asyncSummary.status,'PASS');equal(asyncSummary.total,78);equal(asyncSummary.passed,78);equal(asyncSummary.failed,0);equal(semanticTotals.evidenceAvailable,false);equal(classifySemanticEvidence(semanticTotals),'NOT_DEMONSTRATED');});
    test('G7-02',function(){var malformedAvailability=JSON.parse(JSON.stringify(semanticDirect));var malformedScope=JSON.parse(JSON.stringify(semanticDigestMatch));malformedAvailability.evidenceAvailable={};malformedScope.scopeBoundary={};assert(classifySynthetic(notDemonstrated)!=='CONTRADICTED'&&classifySynthetic(notDemonstrated)!=='NO_CONTRADICTION_OBSERVED');equal(classifySemanticEvidence(semanticDigestMatch),semanticDigestMatch.expected);equal(classifySemanticEvidence(malformedAvailability),'NOT_DEMONSTRATED');assert(classifySemanticEvidence(malformedScope)!=='OUT_OF_SCOPE');});
    test('G8-01',function(){var malformedValidity=JSON.parse(JSON.stringify(semanticDirect));var malformedConsistency=JSON.parse(JSON.stringify(semanticDirect));malformedValidity.evidenceValid={};malformedConsistency.internallyConsistent=[];equal(classifySynthetic(ambiguous),'INDETERMINATE');equal(classifySemanticEvidence(semanticDigestMismatch),semanticDigestMismatch.expected);equal(classifySemanticEvidence(malformedValidity),'INDETERMINATE');equal(classifySemanticEvidence(malformedConsistency),'INDETERMINATE');});
    test('G8-02',function(){equal(classifySynthetic(noCausal),'INDETERMINATE');});
    test('G9-01',function(){equal(classifySynthetic(outOfScope),'OUT_OF_SCOPE');});
    test('G9-02',function(){assert(!byId(fixtures.claims,'DC-030'));equal(fixtures.exclusions[0].reservedFor,'RT-008');});
    test('G10-01',function(){var first=JSON.parse(JSON.stringify(semanticEventCount));var second=JSON.parse(JSON.stringify(semanticEventCount));first.observedEvents=[{id:'EVENT-A'},{id:'EVENT-B'}];second.observedEvents=[{id:'EVENT-B'},{id:'EVENT-A'}];first.causal=false;second.causal=false;first.observedCausalRelationships=[];second.observedCausalRelationships=[];equal(classifySemanticEvidence(first),classifySemanticEvidence(second));equal(classifySemanticEvidence(first),'NOT_DEMONSTRATED');});
    test('G10-02',function(){assert(claimResults.every(function(item){return item.observedRelations.indexOf('timestamp')<0;}));});
    test('G10-03',function(){var namedEvent=JSON.parse(JSON.stringify(semanticEventCount));namedEvent.observedEvents=[{name:'MISSION_RESOLUTION_CAUSAL_CONFIRMED'}];namedEvent.causal=false;namedEvent.direct=false;namedEvent.specific=false;equal(classifySemanticEvidence(namedEvent),'NOT_DEMONSTRATED');assert(classifySemanticEvidence(namedEvent)!=='CONTRADICTED');});
    test('G10-04',function(){assert(claimResults.filter(function(item){return item.status==='CONTRADICTED';}).every(function(item){return item.evidenceRefs.length>1&&item.reproducibility!=='NONE';}));});
    test('G11-01',function(){assert(byId(privacyControlResults,'PRIV-SYNTHETIC-REAL-NAME').pass);assert(!candidatePrivacyScan.matches.some(function(match){return match.path.indexOf('realName')>=0;}));});
    test('G11-02',function(){assert(byId(privacyControlResults,'PRIV-SYNTHETIC-IDENTITY').pass);assert(!candidatePrivacyScan.matches.some(function(match){return ['userName','identity','personalId','documentId'].some(function(key){return match.path.indexOf(key)>=0;});}));});
    test('G11-03',function(){assert(byId(privacyControlResults,'PRIV-SYNTHETIC-STUDENT-ANSWER').pass);assert(!candidatePrivacyScan.matches.some(function(match){return ['studentAnswer','answerRaw','respuestas'].some(function(key){return match.path.indexOf(key)>=0;});}));});
    test('G11-04',function(){assert(byId(privacyControlResults,'PRIV-SENSITIVE-PAYLOAD').pass);assert(byId(privacyControlResults,'PRIV-TECHNICAL-DESCRIPTORS').pass);privacyScanResult=candidatePrivacyScan;assert(privacyScanResult.detected===false);});
    test('G12-01',function(){equal(externalResources,[]);});
    test('G12-02',function(){equal(fixtures.harnesses.map(function(item){return item.adapter.network;}),['transmissions',null,'fetches','fetches']);assert(evidenceRuns.every(function(item){return Number.isFinite(item.networkTelemetryCount)&&item.networkTelemetryCount>=0&&item.externalResources.length===0;}));});
    test('G12-03',function(){assert(runtimeIndicators().realNetworkDetected===false);});
    test('G13-01',function(){equal(storageChecks.length,4);});
    test('G13-02',function(){assert(storageChecks.every(function(item){return JSON.stringify(item.before)===JSON.stringify(item.after);}));});
    test('G13-03',function(){assert(evidenceRuns.every(function(item){return item.storageRestored;}));});
    test('G14-01',function(){assert(evidenceRuns.every(function(item){return productionInterferenceDetectedForRun(item)===false;}));assert(runtimeIndicators().productionInterferenceDetected===false);});
    test('G14-02',function(){var seen=new WeakSet();(function walk(value){if(!value||typeof value!=='object')return;assert(!value.nodeType&&!value.window);if(seen.has(value))return;seen.add(value);Object.keys(value).forEach(function(key){assert(typeof value[key]!=='function');walk(value[key]);});})(evidenceRuns);});
    test('G14-03',function(){assert(framesCreated.every(function(frame){return !frame.isConnected;}));});
    test('G14-04',function(){assert(evidenceRuns.every(function(item){return item.assertions.length===item.total&&item.assertions.every(function(assertion){return assertion.name.length>0&&assertion.passed===true;});}));});
    test('G15-01',function(){equal(classifySynthetic(direct),direct.expected);});
    test('G15-02',function(){equal(new Set(framesCreated.map(function(frame){return frame.src;})).size,4);});
    test('G15-03',function(){assert(claimResults.every(function(item){return !Object.prototype.hasOwnProperty.call(item,'timestamp');}));});
    test('G16-01',function(){['sprint','test','status','verdict','total','passed','failed','assertions','claims','evidenceRuns','contradictions'].forEach(function(key){assert(document.documentElement.dataset.resultContract.indexOf(key)>=0,key);});});
    test('G16-02',function(){equal(fixtures.cases.length,63);equal(assertions.length,63);});
    test('G16-03',function(){equal(claimResults.length,10);assert(claimResults.every(function(item){return fixtures.classifications.indexOf(item.status)>=0;}));});
    test('G16-04',function(){equal(countStatus('CONTRADICTED')+countStatus('NO_CONTRADICTION_OBSERVED')+countStatus('NOT_DEMONSTRATED')+countStatus('INDETERMINATE')+countStatus('OUT_OF_SCOPE'),10);});
    test('G16-05',function(){assert(JSON.stringify({claims:claimResults,evidenceRuns:evidenceRuns}).length>0);assert(Object.isFrozen(claimResults[0]));});
    test('G17-01',function(){equal(warningDisposition('expected controlled warning',['controlled warning']),'EXPECTED');equal(warningDisposition('different warning',['controlled warning']),'UNEXPECTED');});
    test('G17-02',function(){equal(unexpectedWarnings,[]);});
    test('G17-03',function(){var warned=JSON.parse(JSON.stringify(semanticEventCount));warned.warnings=['synthetic-warning'];equal(classifySemanticEvidence(warned),classifySemanticEvidence(semanticEventCount));assert(classifySemanticEvidence(warned)!=='CONTRADICTED');});
    test('G18-01',function(){assert(claimResults.every(function(item){return item.evidenceRefs.length>0;}));});
    test('G18-02',function(){var refs=claimResults.reduce(function(all,item){return all.concat(item.evidenceRefs);},[]);assert(evidenceRuns.every(function(run){return refs.some(function(ref){return ref.indexOf(run.id)>=0;})||run.role==='contextual';}));});
    test('G18-03',function(){assert(claimResults.filter(function(item){return item.status==='CONTRADICTED';}).every(function(item){return item.sourcePath&&item.sourceLocator;}));});
    test('G18-04',function(){claimResults.forEach(function(item){equal(item.status,reverseExpectedStatus(item.claimId));equal(item.contradictionCount,item.status==='CONTRADICTED'?1:0);});});
  }

  function countStatus(status){return claimResults.filter(function(item){return item.status===status;}).length;}
  function compactAssertions(results){return results.map(function(result){return freeze({id:result.id,groupId:result.groupId,description:result.description,passed:result.passed,error:result.error,durationMs:result.durationMs});});}
  function publish(status,results,error){
    try{
      var contradictionClaims=claimResults.filter(function(item){return item.status==='CONTRADICTED';});
      var finishedAt=new Date().toISOString();
      var indicators=runtimeIndicators();
      var output=freeze({
        sprint:'A2-006K',test:'RT-006',status:status,verdict:status==='PASS'?'RUNTIME_CONTRADICTION_MATRIX_EVALUATED':'RUNTIME_CONTRADICTION_MATRIX_INVALID',
        total:results.length,passed:results.filter(function(item){return item.passed;}).length,failed:results.filter(function(item){return !item.passed;}).length,
        assertions:freeze(compactAssertions(results)),claims:freeze(claimResults.slice()),evidenceRuns:freeze(evidenceRuns.slice()),contradictions:freeze(contradictionClaims.slice()),
        contradictionCount:countStatus('CONTRADICTED'),noContradictionObservedCount:countStatus('NO_CONTRADICTION_OBSERVED'),notDemonstratedCount:countStatus('NOT_DEMONSTRATED'),indeterminateCount:countStatus('INDETERMINATE'),outOfScopeCount:countStatus('OUT_OF_SCOPE'),
        controlledContradictionTests:freeze(controlledResults.slice()),sourceIntegrity:sourceRecords.length===11&&sourceRecords.every(function(item){return item.locatorFound&&item.digestMatches;})?'PASS':'FAIL',
        executionIntegrity:evidenceRuns.length===4&&evidenceRuns.every(function(item,index){return item.status==='PASS'&&item.total===fixtures.harnesses[index].expectedTotal&&item.storageRestored;})?'PASS':'FAIL',
        privacyControls:freeze(privacyControlResults.slice()),
        pageErrors:freeze(pageErrors.slice()),consoleErrors:freeze(consoleErrors.slice()),warnings:freeze(warnings.slice()),unexpectedWarnings:freeze(unexpectedWarnings.slice()),
        realNetworkDetected:indicators.realNetworkDetected,realStorageDetected:indicators.realStorageDetected,productionInterferenceDetected:indicators.productionInterferenceDetected,
        piiDetected:privacyScanResult.detected,startedAt:startedAt,finishedAt:finishedAt,durationMs:Math.round((performance.now()-startedPerformance)*100)/100,error:error?compactError(error):null
      });
      window.__CRIOS_RUNTIME_CONTRADICTION_MATRIX_RESULT__=output;
      render(output);
    }finally{
      restoreInstrumentation();
    }
  }

  function render(output){
    document.getElementById('status').textContent=output.status+' / '+output.verdict;
    document.getElementById('progress').textContent=output.evidenceRuns.length+' harnesses; '+output.passed+'/'+output.total+' casos';
    document.getElementById('counts').textContent='Claims '+output.claims.length+' | contradicted '+output.contradictionCount+' | no contradiction observed '+output.noContradictionObservedCount+' | not demonstrated '+output.notDemonstratedCount+' | indeterminate '+output.indeterminateCount+' | out of scope '+output.outOfScopeCount;
    document.getElementById('limits').textContent='Una muestra finita no confirma garantias universales. RT-007 es evidencia contextual no retroactiva.';
    document.getElementById('diagnostics').textContent='Errores '+output.pageErrors.length+'/'+output.consoleErrors.length+' | warnings '+output.warnings.length+' | duracion '+output.durationMs+' ms';
  }

  async function run(){
    var results=[];
    window.__CRIOS_RUNTIME_CONTRADICTION_MATRIX_RESULT__=freeze({sprint:'A2-006K',test:'RT-006',status:'RUNNING',verdict:null,total:63,passed:0,failed:0,assertions:freeze([]),claims:freeze([]),evidenceRuns:freeze([]),contradictions:freeze([]),contradictionCount:0,noContradictionObservedCount:0,notDemonstratedCount:0,indeterminateCount:0,outOfScopeCount:0,controlledContradictionTests:freeze([]),privacyControls:freeze([]),sourceIntegrity:'PENDING',executionIntegrity:'PENDING',pageErrors:freeze([]),consoleErrors:freeze([]),warnings:freeze([]),unexpectedWarnings:freeze([]),realNetworkDetected:false,realStorageDetected:false,productionInterferenceDetected:false,piiDetected:false,startedAt:startedAt,finishedAt:null,durationMs:0});
    try{
      assert(fixtures&&Object.isFrozen(fixtures),'Fixture missing or mutable');
      equal(fixtures.claims.length,10,'Canonical claim count');
      equal(fixtures.harnesses.length,4,'Harness count');
      equal(fixtures.groupSpecs.length,18,'Group count');
      equal(fixtures.cases.length,63,'Case count');
      await loadSources();
      for(var index=0;index<fixtures.harnesses.length;index+=1){
        if(performance.now()-startedPerformance>fixtures.watchdogMs)throw new Error('GLOBAL_WATCHDOG_TIMEOUT');
        await runHarness(fixtures.harnesses[index],index);
      }
      fixtures.syntheticControls.forEach(function(control){controlledResults.push(freeze({controlId:control.id,classification:classifySynthetic(control),expected:control.expected,passed:classifySynthetic(control)===control.expected}));});
      runPrivacyControls();
      classifyClaims();
      defineTests();
      for(var testIndex=0;testIndex<assertions.length;testIndex+=1){
        var began=performance.now();
        try{await assertions[testIndex].run();results.push({id:assertions[testIndex].metadata.id,groupId:assertions[testIndex].metadata.groupId,description:assertions[testIndex].metadata.description,passed:true,error:null,durationMs:Math.round((performance.now()-began)*100)/100});}
        catch(error){results.push({id:assertions[testIndex].metadata.id,groupId:assertions[testIndex].metadata.groupId,description:assertions[testIndex].metadata.description,passed:false,error:compactError(error),durationMs:Math.round((performance.now()-began)*100)/100});}
      }
      var technicalPass=results.length===63&&results.every(function(item){return item.passed;})&&evidenceRuns.length===4&&sourceRecords.every(function(item){return item.locatorFound&&item.digestMatches;})&&externalResources.length===0&&storageChecks.every(function(item){return item.restored;})&&pageErrors.length===0&&consoleErrors.length===0&&unexpectedWarnings.length===0&&!privacyScanResult.detected&&privacyControlResults.every(function(item){return item.pass;});
      publish(technicalPass?'PASS':'FAIL',results,null);
    }catch(error){
      if(activeFrame)activeFrame.remove();
      pageErrors.push(String(error&&error.message||error));
      publish('FAIL',results,error);
    }
  }

  run();
})();