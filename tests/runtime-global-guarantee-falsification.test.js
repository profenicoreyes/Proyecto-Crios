/* CRIOS A2-012 - RT-008 closed-evidence global guarantee falsification */
(function(){
  'use strict';

  var startedAt=new Date().toISOString();
  var startedPerformance=performance.now();
  var assertions=[];
  var results=[];
  var pageErrors=[];
  var consoleErrors=[];
  var nativeConsoleError=console.error;

  function freeze(value){
    if(!value||typeof value!=='object'||Object.isFrozen(value))return value;
    Object.keys(value).forEach(function(key){freeze(value[key]);});
    return Object.freeze(value);
  }
  function equal(actual,expected,message){
    var left=JSON.stringify(actual);
    var right=JSON.stringify(expected);
    if(left!==right)throw new Error((message||'Values differ')+' actual='+left+' expected='+right);
  }
  function assert(condition,message){if(!condition)throw new Error(message||'Assertion failed');}
  function test(id,description,run){assertions.push({id:id,description:description,run:run});}
  function compactError(error){return {name:String(error&&error.name||'Error'),message:String(error&&error.message||error),stack:String(error&&error.stack||'')};}

  window.addEventListener('error',function(event){pageErrors.push(String(event.message||event.error||'page error'));});
  window.addEventListener('unhandledrejection',function(event){pageErrors.push(String(event.reason&&event.reason.message||event.reason||'unhandled rejection'));});
  console.error=function(){consoleErrors.push(Array.prototype.map.call(arguments,String).join(' '));return nativeConsoleError.apply(console,arguments);};

  var claim=freeze({
    claimId:'DC-030',
    text:'Las afirmaciones globales de completitud documental implican garantia del comportamiento real.',
    source:'docs/architecture/DEMONSTRABLE_CLAIMS_MATRIX.md',
    reservedFor:'RT-008',
    asymmetry:'ONE_COUNTEREXAMPLE_REFUTES_FINITE_MATCHES_DO_NOT_PROVE'
  });

  var closedEvidence=freeze({
    sourceCommit:'0c839e05e1cf219a7b17dbc0c03fda8d33e17eff',
    sourceCommitSubject:'test(runtime): complete RT-006 contradiction matrix',
    sourceRunner:'tests/runtime-contradiction-matrix.test.html',
    status:'PASS',
    total:63,
    passed:63,
    failed:0,
    sourceIntegrity:'PASS',
    executionIntegrity:'PASS',
    contradictionCount:2,
    claimCounts:{CONTRADICTED:2,NO_CONTRADICTION_OBSERVED:5,NOT_DEMONSTRATED:3,INDETERMINATE:0,OUT_OF_SCOPE:0},
    rows:[
      {experimentId:'RT-001',claimId:'DC-013',claimStatus:'CONTRADICTED',relation:'DEVIATION',direct:true,specific:true,reproducible:true,sourceBound:true,observation:'LOCAL_CLOSE_WITHOUT_VERIFIABLE_SERVER_CONFIRMATION',limitation:'NO_CORS_SERVER_PROCESSING_OUTSIDE_CLIENT_OBSERVER'},
      {experimentId:'RT-002',claimId:'DC-015',claimStatus:'NO_CONTRADICTION_OBSERVED',relation:'FINITE_MATCH',direct:true,specific:true,reproducible:true,sourceBound:true,observation:'CLOSED_STATE_PRESERVED_AND_SESSION_REOPENED',limitation:'FINITE_CONTROLLED_RELOAD'},
      {experimentId:'RT-003',claimId:'DC-018',claimStatus:'NO_CONTRADICTION_OBSERVED',relation:'FINITE_MATCH',direct:true,specific:true,reproducible:true,sourceBound:true,observation:'NO_DEDICATED_VISIBLE_GAMEOVER_ELEMENT',limitation:'EXECUTED_FRONT_END_UNIVERSE_ONLY'},
      {experimentId:'RT-004',claimId:'DC-020',claimStatus:'NO_CONTRADICTION_OBSERVED',relation:'FINITE_MATCH',direct:true,specific:true,reproducible:true,sourceBound:true,observation:'MISSION_OWNERSHIP_CLUSTERS_OBSERVED',limitation:'EXECUTED_MISSION_SEQUENCE_ONLY'},
      {experimentId:'RT-005',claimId:'DC-024',claimStatus:'NO_CONTRADICTION_OBSERVED',relation:'FINITE_MATCH',direct:true,specific:true,reproducible:true,sourceBound:true,observation:'DEFERRED_TASKS_AND_CAUSAL_RELATIONSHIPS_OBSERVED',limitation:'SCHEDULER_INTERNALS_EXCLUDED'},
      {experimentId:'RT-006',claimId:'DC-028',claimStatus:'CONTRADICTED',relation:'DEVIATION',direct:true,specific:true,reproducible:true,sourceBound:true,observation:'CANONICAL_MATRIX_FOUND_CONTRADICTED_CLAIMS',limitation:'DOES_NOT_ENUMERATE_EVERY_POSSIBLE_CONTRADICTION'},
      {experimentId:'RT-007',claimId:'DC-029',claimStatus:'NO_CONTRADICTION_OBSERVED',relation:'FINITE_MATCH',direct:true,specific:true,reproducible:true,sourceBound:true,observation:'OUTCOME_DIFFERENCES_UNDER_DEGRADED_AVAILABILITY',limitation:'CONTEXTUAL_NON_RETROACTIVE_EVIDENCE'}
    ]
  });

  var classifications=freeze(['CONTRADICTED','NO_CONTRADICTION_OBSERVED','NOT_DEMONSTRATED','INDETERMINATE','OUT_OF_SCOPE']);
  var forbiddenPositiveConclusions=freeze(['CONFIRMED','PROVEN','ALWAYS_TRUE','GARANTIZADO_GLOBALMENTE','UNIVERSALLY_VALIDATED','DOCUMENTATION_GUARANTEES_RUNTIME']);

  function classifyGlobalGuarantee(input){
    if(input&&input.scopeBoundary===true)return 'OUT_OF_SCOPE';
    if(!input||input.claimPresent!==true||input.evidenceAvailable!==true)return 'NOT_DEMONSTRATED';
    if(input.evidenceValid!==true||input.internallyConsistent!==true||input.ambiguous===true)return 'INDETERMINATE';
    var counterexamples=Array.isArray(input.counterexamples)?input.counterexamples:[];
    var validCounterexample=counterexamples.some(function(item){
      return item&&item.relation==='DEVIATION'&&item.direct===true&&item.specific===true&&item.reproducible===true&&item.sourceBound===true;
    });
    if(validCounterexample)return 'CONTRADICTED';
    return 'NO_CONTRADICTION_OBSERVED';
  }

  function evaluate(){
    var counterexamples=closedEvidence.rows.filter(function(row){return row.relation==='DEVIATION';});
    var finiteMatches=closedEvidence.rows.filter(function(row){return row.relation==='FINITE_MATCH';});
    var classification=classifyGlobalGuarantee({
      claimPresent:Boolean(claim.claimId&&claim.text),
      evidenceAvailable:closedEvidence.status==='PASS',
      evidenceValid:closedEvidence.failed===0&&closedEvidence.sourceIntegrity==='PASS'&&closedEvidence.executionIntegrity==='PASS',
      internallyConsistent:closedEvidence.rows.length===7&&closedEvidence.contradictionCount===counterexamples.length,
      ambiguous:false,
      counterexamples:counterexamples
    });
    return freeze({
      claim:claim,
      classification:classification,
      verdict:classification==='CONTRADICTED'?'GLOBAL_DOCUMENTATION_GUARANTEE_FALSIFIED':'GLOBAL_DOCUMENTATION_GUARANTEE_NOT_FALSIFIED_IN_FINITE_EVIDENCE',
      evidence:closedEvidence,
      counterexamples:freeze(counterexamples.slice()),
      finiteMatches:freeze(finiteMatches.slice()),
      epistemicLimit:'FINITE_MATCHES_CANNOT_ESTABLISH_UNIVERSAL_RUNTIME_GUARANTEE'
    });
  }

  var evaluation=evaluate();

  test('G1-01','cinco clasificaciones exactas',function(){equal(classifications,['CONTRADICTED','NO_CONTRADICTION_OBSERVED','NOT_DEMONSTRATED','INDETERMINATE','OUT_OF_SCOPE']);});
  test('G1-02','DC-030 es la unica afirmacion evaluada',function(){equal(evaluation.claim.claimId,'DC-030');});
  test('G1-03','RT-008 conserva la asimetria epistemologica',function(){equal(evaluation.claim.asymmetry,'ONE_COUNTEREXAMPLE_REFUTES_FINITE_MATCHES_DO_NOT_PROVE');});
  test('G1-04','el veredicto no usa conclusiones positivas prohibidas',function(){assert(forbiddenPositiveConclusions.every(function(term){return evaluation.verdict.indexOf(term)<0;}));});

  test('G2-01','la evidencia cerrada apunta al commit canonico de RT-006',function(){equal(closedEvidence.sourceCommit,'0c839e05e1cf219a7b17dbc0c03fda8d33e17eff');});
  test('G2-02','el asunto del commit RT-006 queda preservado',function(){equal(closedEvidence.sourceCommitSubject,'test(runtime): complete RT-006 contradiction matrix');});
  test('G2-03','RT-006 queda cerrado en PASS 63 de 63',function(){equal([closedEvidence.status,closedEvidence.total,closedEvidence.passed,closedEvidence.failed],['PASS',63,63,0]);});
  test('G2-04','integridad de fuente y ejecucion quedan preservadas',function(){equal([closedEvidence.sourceIntegrity,closedEvidence.executionIntegrity],['PASS','PASS']);});
  test('G2-05','los conteos cerrados suman diez claims',function(){var counts=closedEvidence.claimCounts;equal(counts.CONTRADICTED+counts.NO_CONTRADICTION_OBSERVED+counts.NOT_DEMONSTRATED+counts.INDETERMINATE+counts.OUT_OF_SCOPE,10);});

  test('G3-01','la tabla cubre RT-001 a RT-007 una sola vez',function(){equal(closedEvidence.rows.map(function(row){return row.experimentId;}),['RT-001','RT-002','RT-003','RT-004','RT-005','RT-006','RT-007']);});
  test('G3-02','cada fila tiene claim, observacion y limite',function(){assert(closedEvidence.rows.every(function(row){return row.claimId&&row.observation&&row.limitation;}));});
  test('G3-03','cada fila queda vinculada a fuente y es reproducible',function(){assert(closedEvidence.rows.every(function(row){return row.sourceBound===true&&row.reproducible===true;}));});
  test('G3-04','las relaciones solo son desviacion o coincidencia finita',function(){assert(closedEvidence.rows.every(function(row){return row.relation==='DEVIATION'||row.relation==='FINITE_MATCH';}));});
  test('G3-05','la tabla es inmutable y serializable',function(){assert(Object.isFrozen(closedEvidence.rows)&&Object.isFrozen(closedEvidence.rows[0]));assert(JSON.stringify(closedEvidence.rows).length>0);});

  test('G4-01','RT-001 conserva el contraejemplo de cierre sin confirmacion verificable',function(){var row=closedEvidence.rows[0];equal([row.experimentId,row.claimId,row.claimStatus,row.relation],['RT-001','DC-013','CONTRADICTED','DEVIATION']);equal(row.observation,'LOCAL_CLOSE_WITHOUT_VERIFIABLE_SERVER_CONFIRMATION');});
  test('G4-02','RT-006 conserva el contraejemplo global de DC-028',function(){var row=closedEvidence.rows[5];equal([row.experimentId,row.claimId,row.claimStatus,row.relation],['RT-006','DC-028','CONTRADICTED','DEVIATION']);});
  test('G4-03','hay exactamente dos contraejemplos cerrados',function(){equal(evaluation.counterexamples.map(function(row){return row.experimentId;}),['RT-001','RT-006']);});
  test('G4-04','un contraejemplo directo basta para clasificar contradiccion',function(){equal(classifyGlobalGuarantee({claimPresent:true,evidenceAvailable:true,evidenceValid:true,internallyConsistent:true,ambiguous:false,counterexamples:[closedEvidence.rows[0]]}),'CONTRADICTED');});
  test('G4-05','la clasificacion canonica de DC-030 es contradicha',function(){equal(evaluation.classification,'CONTRADICTED');equal(evaluation.verdict,'GLOBAL_DOCUMENTATION_GUARANTEE_FALSIFIED');});

  test('G5-01','RT-002 a RT-005 y RT-007 quedan como coincidencias finitas',function(){equal(evaluation.finiteMatches.map(function(row){return row.experimentId;}),['RT-002','RT-003','RT-004','RT-005','RT-007']);});
  test('G5-02','las coincidencias finitas no se convierten en garantia positiva',function(){equal(classifyGlobalGuarantee({claimPresent:true,evidenceAvailable:true,evidenceValid:true,internallyConsistent:true,ambiguous:false,counterexamples:[]}),'NO_CONTRADICTION_OBSERVED');assert(evaluation.epistemicLimit.indexOf('CANNOT_ESTABLISH_UNIVERSAL')>=0);});
  test('G5-03','RT-007 conserva su limite contextual',function(){equal(closedEvidence.rows[6].limitation,'CONTEXTUAL_NON_RETROACTIVE_EVIDENCE');});
  test('G5-04','ninguna coincidencia finita tiene status contradicho',function(){assert(evaluation.finiteMatches.every(function(row){return row.claimStatus==='NO_CONTRADICTION_OBSERVED';}));});

  test('G6-01','sin claim la garantia queda no demostrada',function(){equal(classifyGlobalGuarantee({claimPresent:false,evidenceAvailable:true,evidenceValid:true,internallyConsistent:true,ambiguous:false,counterexamples:[]}),'NOT_DEMONSTRATED');});
  test('G6-02','sin evidencia la garantia queda no demostrada',function(){equal(classifyGlobalGuarantee({claimPresent:true,evidenceAvailable:false,evidenceValid:true,internallyConsistent:true,ambiguous:false,counterexamples:[]}),'NOT_DEMONSTRATED');});
  test('G6-03','evidencia invalida queda indeterminada',function(){equal(classifyGlobalGuarantee({claimPresent:true,evidenceAvailable:true,evidenceValid:false,internallyConsistent:true,ambiguous:false,counterexamples:[closedEvidence.rows[0]]}),'INDETERMINATE');});
  test('G6-04','evidencia ambigua queda indeterminada',function(){equal(classifyGlobalGuarantee({claimPresent:true,evidenceAvailable:true,evidenceValid:true,internallyConsistent:true,ambiguous:true,counterexamples:[closedEvidence.rows[0]]}),'INDETERMINATE');});
  test('G6-05','una frontera explicita queda fuera de alcance',function(){equal(classifyGlobalGuarantee({scopeBoundary:true}),'OUT_OF_SCOPE');});
  test('G6-06','una desviacion sin vinculo de fuente no contradice',function(){var row=Object.assign({},closedEvidence.rows[0],{sourceBound:false});equal(classifyGlobalGuarantee({claimPresent:true,evidenceAvailable:true,evidenceValid:true,internallyConsistent:true,ambiguous:false,counterexamples:[row]}),'NO_CONTRADICTION_OBSERVED');});
  test('G6-07','una desviacion no reproducible no contradice',function(){var row=Object.assign({},closedEvidence.rows[0],{reproducible:false});equal(classifyGlobalGuarantee({claimPresent:true,evidenceAvailable:true,evidenceValid:true,internallyConsistent:true,ambiguous:false,counterexamples:[row]}),'NO_CONTRADICTION_OBSERVED');});

  test('G7-01','el recorrido inverso recompone los dos claims contradichos',function(){equal(evaluation.counterexamples.map(function(row){return row.claimId;}),['DC-013','DC-028']);});
  test('G7-02','el conteo de contraejemplos coincide con RT-006',function(){equal(evaluation.counterexamples.length,closedEvidence.contradictionCount);});
  test('G7-03','cada contraejemplo es directo, especifico, reproducible y vinculado',function(){assert(evaluation.counterexamples.every(function(row){return row.direct&&row.specific&&row.reproducible&&row.sourceBound;}));});
  test('G7-04','el resultado no contiene DOM ni funciones',function(){(function walk(value,seen){if(value===null||typeof value!=='object')return;assert(!value.nodeType&&!value.window);if(seen.has(value))return;seen.add(value);Object.keys(value).forEach(function(key){assert(typeof value[key]!=='function');walk(value[key],seen);});})(evaluation,new Set());});
  test('G7-05','la evaluacion es inmutable',function(){assert(Object.isFrozen(evaluation)&&Object.isFrozen(evaluation.claim)&&Object.isFrozen(evaluation.counterexamples));});

  test('G8-01','no se ejecutan runners cerrados',function(){equal(document.querySelectorAll('iframe').length,0);});
  test('G8-02','no se cargan scripts de produccion',function(){equal(Array.prototype.map.call(document.scripts,function(script){return script.getAttribute('src');}).filter(Boolean),['./runtime-global-guarantee-falsification.test.js']);});
  test('G8-03','no hay recursos externos',function(){assert(performance.getEntriesByType('resource').every(function(entry){return new URL(entry.name,location.href).origin===location.origin;}));});
  test('G8-04','el contrato publico minimo esta declarado',function(){['sprint','test','status','verdict','total','passed','failed','assertions','claim','evidence','counterexamples','finiteMatches'].forEach(function(key){assert(document.documentElement.dataset.resultContract.indexOf(key)>=0,key);});});

  function publish(status,error){
    var finishedAt=new Date().toISOString();
    var output=freeze({
      sprint:'A2-012',
      test:'RT-008',
      status:status,
      verdict:status==='PASS'?evaluation.verdict:'RT_008_CLOSED_EVIDENCE_CLASSIFIER_INVALID',
      total:results.length,
      passed:results.filter(function(item){return item.passed;}).length,
      failed:results.filter(function(item){return !item.passed;}).length,
      assertions:freeze(results.slice()),
      claim:freeze({claimId:evaluation.claim.claimId,status:evaluation.classification,text:evaluation.claim.text}),
      evidence:evaluation.evidence,
      counterexamples:evaluation.counterexamples,
      finiteMatches:evaluation.finiteMatches,
      epistemicLimit:evaluation.epistemicLimit,
      sourceIntegrity:closedEvidence.sourceIntegrity,
      executionIntegrity:closedEvidence.executionIntegrity,
      closedEvidenceOnly:true,
      closedRunnersExecuted:0,
      productionScriptsLoaded:0,
      iframesCreated:0,
      storageWrites:0,
      externalNetworkRequests:0,
      pageErrors:freeze(pageErrors.slice()),
      consoleErrors:freeze(consoleErrors.slice()),
      startedAt:startedAt,
      finishedAt:finishedAt,
      durationMs:Math.round((performance.now()-startedPerformance)*100)/100,
      error:error?compactError(error):null
    });
    window.__CRIOS_RUNTIME_GLOBAL_GUARANTEE_FALSIFICATION_RESULT__=output;
    document.getElementById('status').textContent=output.status;
    document.getElementById('verdict').textContent=output.verdict+' / '+output.claim.status;
    document.getElementById('counts').textContent=output.passed+' / '+output.total;
    document.getElementById('diagnostics').textContent='Contraejemplos '+output.counterexamples.length+' | coincidencias finitas '+output.finiteMatches.length+' | runners cerrados '+output.closedRunnersExecuted;
  }

  async function run(){
    window.__CRIOS_RUNTIME_GLOBAL_GUARANTEE_FALSIFICATION_RESULT__=freeze({sprint:'A2-012',test:'RT-008',status:'RUNNING',verdict:null,total:assertions.length,passed:0,failed:0,assertions:freeze([]),claim:freeze({claimId:'DC-030',status:null}),evidence:closedEvidence,counterexamples:freeze([]),finiteMatches:freeze([]),closedEvidenceOnly:true,closedRunnersExecuted:0,productionScriptsLoaded:0,iframesCreated:0,storageWrites:0,externalNetworkRequests:0,pageErrors:freeze([]),consoleErrors:freeze([]),startedAt:startedAt,finishedAt:null,durationMs:0,error:null});
    try{
      for(var index=0;index<assertions.length;index+=1){
        var began=performance.now();
        try{await assertions[index].run();results.push(freeze({id:assertions[index].id,description:assertions[index].description,passed:true,error:null,durationMs:Math.round((performance.now()-began)*100)/100}));}
        catch(error){results.push(freeze({id:assertions[index].id,description:assertions[index].description,passed:false,error:compactError(error),durationMs:Math.round((performance.now()-began)*100)/100}));}
      }
      var pass=results.length===assertions.length&&results.every(function(item){return item.passed;})&&pageErrors.length===0&&consoleErrors.length===0;
      publish(pass?'PASS':'FAIL',null);
    }catch(error){pageErrors.push(String(error&&error.message||error));publish('FAIL',error);}
  }

  run();
})();
