/* CRIOS A2-006K - RT-006 contradiction matrix fixtures */
(function(){
  'use strict';

  function freeze(value){
    if(!value||typeof value!=='object'||Object.isFrozen(value))return value;
    Object.keys(value).forEach(function(key){freeze(value[key]);});
    return Object.freeze(value);
  }

  var classifications=['CONTRADICTED','NO_CONTRADICTION_OBSERVED','NOT_DEMONSTRATED','INDETERMINATE','OUT_OF_SCOPE'];
  var forbiddenConclusions=['CONFIRMED','PROVEN','ALWAYS_TRUE','GARANTIZADO_GLOBALMENTE','UNIVERSALLY_VALIDATED'];
  var sourcePath='../docs/architecture/DEMONSTRABLE_CLAIMS_MATRIX.md';

  var harnesses=[
    {id:'transmission-reload',html:'./runtime-transmission-reload-semantics.test.html',resultGlobal:'CRIOS_RUNTIME_TRANSMISSION_RELOAD_SEMANTICS_TEST_RESULTS',covers:['RT-001','RT-002'],role:'normative',expectedTotal:97,timeoutMs:60000,terminalStates:['PASS','FAIL'],adapter:{assertions:'tests',events:null,relationships:null,contradictions:null,warnings:'warnings',errors:['pageerrors','consoleErrors'],storage:null,network:'transmissions',references:['rt001','rt002','semanticConclusions','reloads']}},
    {id:'local-coherence',html:'./runtime-local-state-coherence.test.html',resultGlobal:'CRIOS_RUNTIME_LOCAL_STATE_COHERENCE_TEST_RESULTS',covers:['RT-003','RT-004'],role:'normative',expectedTotal:46,timeoutMs:60000,terminalStates:['PASS','FAIL'],adapter:{assertions:'tests',events:'telemetry',relationships:null,contradictions:null,warnings:'warnings',errors:['pageerrors','consoleErrors'],storage:null,network:null,references:['rt003','rt004']}},
    {id:'async-ordering',html:'./runtime-async-ordering.test.html',resultGlobal:'CRIOS_RUNTIME_ASYNC_ORDERING_TEST_RESULTS',covers:['RT-005'],role:'normative',expectedTotal:78,timeoutMs:90000,terminalStates:['PASS','FAIL'],adapter:{assertions:'tests',events:'events',relationships:'relationships',contradictions:'contradictions',warnings:'warnings',errors:['pageerrors','consoleErrors'],storage:null,network:'fetches',references:['rt005','graphs','undeterminedRelationships','semanticConclusions']}},
    {id:'degraded-availability',html:'./runtime-degraded-availability.test.html',resultGlobal:'CRIOS_RUNTIME_DEGRADED_AVAILABILITY_TEST_RESULTS',covers:['RT-007'],role:'contextual',expectedTotal:96,timeoutMs:360000,terminalStates:['PASS','FAIL'],adapter:{assertions:'tests',events:'events',relationships:'relationships',contradictions:'contradictions',warnings:'warnings',errors:['pageerrors','consoleErrors'],storage:'storageOperations',network:'fetches',references:['rt007','scenarios','comparisons','graphs','undeterminedRelationships','semanticConclusions','recoveryAttempts']} }
  ];

  var claims=[
    {claimId:'DC-013',sourcePath:sourcePath,sourceLocator:'La finalizacion tecnica equivale a cierre transmitido exitoso de extremo a extremo.',claimDigest:'2e9671852b7ea74465fef3cb51f0dc7a206c380685d297ca3253d407b130a95c',claimType:'terminality',scope:'client-and-server',preconditions:['final session','controlled transmission'],applicableRTs:['RT-001'],evidenceRequirements:['local close','fetch settlement','server confirmation boundary'],limitations:['no-cors cannot prove server processing']},
    {claimId:'DC-015',sourcePath:sourcePath,sourceLocator:'La finalizacion queda persistida y recuperable tras recarga.',claimDigest:'4e6cc19a667a668f12a950aec9a48b1164bdb2f6d5304596811cbce4749cee65',claimType:'persistence',scope:'browser-local',preconditions:['finalized session','reload'],applicableRTs:['RT-002'],evidenceRequirements:['before/after storage','reconstructed domain'],limitations:['active screen and timers reset']},
    {claimId:'DC-018',sourcePath:sourcePath,sourceLocator:'No existe una rama visible dedicada de gameOver para usuario final.',claimDigest:'856e02c3279b883603dcff5bdbca11dd3479b5976e62e2eb316a15db07eb354a',claimType:'visible-absence',scope:'executed-front-end',preconditions:['one life','incorrect evaluation'],applicableRTs:['RT-003'],evidenceRequirements:['gameOver entered/restored','visible DOM snapshot'],limitations:['finite executed UI universe']},
    {claimId:'DC-020',sourcePath:sourcePath,sourceLocator:'El ownership de mision actual convive en varios clusters legacy/dominio.',claimDigest:'7a44aebda39b2e6e974a3db4ac5539284e7dbd7f36010475dfc414ccd3429a5f',claimType:'state-ownership',scope:'client-domain-clusters',preconditions:['domain ready','mission navigation'],applicableRTs:['RT-004'],evidenceRequirements:['separate mission fields','divergence and convergence events'],limitations:['only exercised mission sequence']},
    {claimId:'DC-024',sourcePath:sourcePath,sourceLocator:'Callbacks, promesas, timers y tareas diferidas participan del flujo principal.',claimDigest:'97caefeae11267298b80c2e4171f3ec6e0f3c9e1fc45547ee824a65a832f3e53',claimType:'temporal-order',scope:'instrumented-client-flow',preconditions:['fresh page','tracer active'],applicableRTs:['RT-005'],evidenceRequirements:['events','causal relationships','undetermined relationships'],limitations:['browser scheduler policy is not observable in full']},
    {claimId:'DC-028',sourcePath:sourcePath,sourceLocator:'No hay contradicciones entre documentos y codigo en todos los temas auditados.',claimDigest:'f1be1871ece0188dd656b030ed5fe3a437f551cd1454e42afcee62e339808a22',claimType:'global-completeness',scope:'audited-documents-and-code',preconditions:['valid RT-001 through RT-005 evidence'],applicableRTs:['RT-001','RT-002','RT-003','RT-004','RT-005'],evidenceRequirements:['canonical classifications','reproducible contradiction references'],limitations:['finite evidence cannot establish universal absence']},
    {claimId:'DC-029',sourcePath:sourcePath,sourceLocator:'Hay dependencias de integracion que solo pueden cerrarse en runtime.',claimDigest:'58c2c5abd6469b1bc3c9a7a7b0a4397521d49c209512e6e84116b36dd07db35b',claimType:'integration-dependency',scope:'degraded-runtime-context',preconditions:['controlled availability matrix'],applicableRTs:['RT-007'],evidenceRequirements:['baseline comparisons','changed outcomes','causal evidence'],limitations:['contextual evidence does not redefine normative claims']},
    {claimId:'DC-022',sourcePath:sourcePath,sourceLocator:'La transaccion de resolver mision es atomica segun la documentacion.',claimDigest:'0959da0887f72fe574574c26ca2034088c2b9a926e6b11b8650cd6e77cb40a6c',claimType:'atomicity',scope:'mission-resolution',preconditions:['mission evaluation'],applicableRTs:['RT-005'],evidenceRequirements:['multi-step observable flow','deferred persistence'],limitations:['not an ACID transaction']},
    {claimId:'DC-026',sourcePath:sourcePath,sourceLocator:'La persistencia real coincide totalmente con la persistencia documentada.',claimDigest:'4302471bbf4bf7832329c5b791abfb6be93968c26e8404bc1b2d29e9fe7656d3',claimType:'persistence-completeness',scope:'pending-result-writes',preconditions:['failed send or exit snapshot'],applicableRTs:['RT-001','RT-005'],evidenceRequirements:['independent pending-result paths','serialized representation'],limitations:['different paths intentionally expose different representations']},
    {claimId:'DC-027',sourcePath:sourcePath,sourceLocator:'No hay contradicciones entre documentos de arquitectura.',claimDigest:'33bffefc2a0d58ef33d38fa3a1c47d18c1bb10dcb3d4ef15ecc291f7e4257ed2',claimType:'documentary-absence',scope:'architecture-documents',preconditions:['document corpus loaded'],applicableRTs:[],evidenceRequirements:['independent documentary locators','explicit mismatch'],limitations:['runtime cannot repair documentary inconsistency']}
  ];

  var exclusions=[{claimId:'DC-030',reservedFor:'RT-008',classification:'OUT_OF_SCOPE',sourcePath:sourcePath,sourceLocator:'Las afirmaciones globales de completitud documental implican garantia del comportamiento real.',claimDigest:'13bd722528c15607ed322bb6e558e5ec5ca3adf23712ab77a49b9a0da3dc1ef9',reason:'RT-008 owns the universal documentation guarantee experiment.'}];

  var syntheticControls=[
    {id:'SYN-DIRECT',observable:true,directlyIncompatible:true,causal:true,reproducible:true,scopeBoundary:false,expected:'CONTRADICTED'},
    {id:'SYN-NO-CAUSAL',observable:true,directlyIncompatible:true,causal:false,reproducible:true,scopeBoundary:false,expected:'INDETERMINATE'},
    {id:'SYN-NOT-REPRODUCIBLE',observable:true,directlyIncompatible:true,causal:true,reproducible:false,scopeBoundary:false,expected:'INDETERMINATE'},
    {id:'SYN-FINITE-ABSENCE',observable:true,directlyIncompatible:false,causal:true,reproducible:true,applicableComplete:true,scopeBoundary:false,expected:'NO_CONTRADICTION_OBSERVED'},
    {id:'SYN-NOT-DEMONSTRATED',observable:false,directlyIncompatible:false,causal:false,reproducible:false,applicableComplete:false,scopeBoundary:false,expected:'NOT_DEMONSTRATED'},
    {id:'SYN-INDETERMINATE',observable:true,directlyIncompatible:false,causal:false,reproducible:false,ambiguous:true,scopeBoundary:false,expected:'INDETERMINATE'},
    {id:'SYN-OUT-OF-SCOPE',observable:false,directlyIncompatible:false,causal:false,reproducible:false,scopeBoundary:true,expected:'OUT_OF_SCOPE'}
  ];

  var semanticCases=[
    {id:'SYN-EVENTCOUNT-WITHOUT-CAUSALITY',observedEventCount:3,observedCausalRelationships:[],evidenceAvailable:true,evidenceValid:true,internallyConsistent:true,direct:false,specific:false,causal:false,reproducible:true,complete:false,contradiction:false,documentIntegrity:'NOT_APPLICABLE',expected:'NOT_DEMONSTRATED'},
    {id:'SYN-TOTALS-WITHOUT-SEMANTIC-EVIDENCE',observedHarnessSummaries:[{id:'transmission-reload',status:'PASS',total:97,passed:97,failed:0},{id:'async-ordering',status:'PASS',total:78,passed:78,failed:0}],evidenceAvailable:false,evidenceValid:true,internallyConsistent:true,direct:false,specific:false,causal:false,reproducible:true,complete:false,contradiction:false,documentIntegrity:'NOT_APPLICABLE',expected:'NOT_DEMONSTRATED'},
    {id:'SYN-DIGEST-MATCH-WITHOUT-SEMANTIC-EVIDENCE',evidenceAvailable:false,evidenceValid:true,internallyConsistent:true,direct:false,specific:false,causal:false,reproducible:true,complete:false,contradiction:false,documentIntegrity:'DOCUMENT_INTEGRITY_VALID',expected:'NOT_DEMONSTRATED'},
    {id:'SYN-DIGEST-MISMATCH',evidenceAvailable:false,evidenceValid:true,internallyConsistent:true,direct:false,specific:false,causal:false,reproducible:false,complete:false,contradiction:false,documentIntegrity:'DOCUMENT_INTEGRITY_INVALID',expected:'INDETERMINATE'},
    {id:'SYN-SEMANTIC-DIRECT',evidenceAvailable:true,evidenceValid:true,internallyConsistent:true,direct:true,specific:true,causal:true,reproducible:true,complete:true,contradiction:true,documentIntegrity:'DOCUMENT_INTEGRITY_VALID',expected:'CONTRADICTED'},
    {id:'SYN-SEMANTIC-FINITE-COMPLETE',evidenceAvailable:true,evidenceValid:true,internallyConsistent:true,direct:true,specific:true,causal:true,reproducible:true,complete:true,contradiction:false,documentIntegrity:'DOCUMENT_INTEGRITY_VALID',expected:'NO_CONTRADICTION_OBSERVED'}
  ];

  var groupSpecs=[
    ['G1','Contrato y precondiciones',['cinco clasificaciones exactas','conclusiones universales prohibidas','cuatro harnesses en orden contractual','watchdog global acotado']],
    ['G2','Autenticidad de fuentes',['fuente documental accesible','localizador exacto presente','digest SHA-256 coincide','claimId y localizador son unicos']],
    ['G3','Mapeo claim a RT',['RT-001 y RT-002 comparten harness','RT-003 y RT-004 comparten harness','RT-005 usa async ordering','RT-007 es contextual','claims normativos usan RT-001 a RT-005','DC-029 usa RT-007','DC-027 declara ausencia de RT aplicable']],
    ['G4','Ejecucion aislada',['transmission reload terminal y 97','local coherence terminal y 46','async ordering terminal y 78','degraded availability terminal y 96']],
    ['G5','Contradicciones positivas controladas',['contradiccion directa se detecta','sin causalidad no contradice','no reproducible no contradice']],
    ['G6','Ausencia finita de contradiccion',['muestra completa clasifica ausencia finita','ausencia finita no emite conclusion universal']],
    ['G7','Afirmaciones no demostradas',['sin evidencia directa queda no demostrada','no demostrado no equivale a falso ni verdadero']],
    ['G8','Evidencia indeterminada',['evidencia ambigua queda indeterminada','evidencia no causal queda indeterminada']],
    ['G9','Fuera de alcance',['frontera explicita clasifica fuera de alcance','DC-030 queda reservado para RT-008']],
    ['G10','Limites de causalidad',['orden de lista no crea causalidad','timestamp aislado no crea causalidad','nombre de evento no crea causalidad','relacion causal exige arista o referencias independientes']],
    ['G11','Privacidad y ausencia de PII',['nombres reales ausentes','identidades de usuario ausentes','respuestas de alumnos ausentes','payloads sensibles ausentes']],
    ['G12','Ausencia de red real',['recursos externos no detectados','telemetria de harnesses usa transporte controlado','resultado declara red real ausente']],
    ['G13','Aislamiento de storage',['snapshot previo capturado','snapshot posterior restaurado','cero contaminacion persistente']],
    ['G14','Ausencia de interferencia con produccion',['harnesses declaran no interferencia','resultados no contienen DOM ni funciones','iframes se eliminan al terminar','evidencia conserva resultados funcionales']],
    ['G15','Determinismo y repetibilidad',['control directo es reproducible internamente','tokens de iframe son unicos','clasificacion no depende de timestamp absoluto']],
    ['G16','Integridad del resultado',['objeto publico contiene contrato minimo','63 assertions contabilizadas','10 claims tienen una clasificacion','conteos de clasificacion suman 10','resultado es serializable y congelado']],
    ['G17','Clasificacion de warnings',['warnings esperados permanecen separados','warnings inesperados quedan visibles','warning no se convierte en contradiccion']],
    ['G18','Revision inversa',['claim referencia evidencia existente','evidencia referencia al menos un claim','contradiccion referencia fuente','clasificacion satisface condicion contractual']]
  ];

  var cases=[];
  groupSpecs.forEach(function(group){
    group[2].forEach(function(description,index){
      cases.push({id:group[0]+'-'+String(index+1).padStart(2,'0'),groupId:group[0],description:description,evidenceRequired:'observable references for '+description,tautologyRisk:group[0]==='G5'||group[0]==='G10'?'MEDIUM':'LOW',approvalCondition:'the named contract is checked independently'});
    });
  });

  window.CRIOS_RT006_FIXTURES=freeze({
    version:'1.0.0',
    sprint:'A2-006K',
    test:'RT-006',
    classifications:classifications,
    forbiddenConclusions:forbiddenConclusions,
    watchdogMs:600000,
    harnesses:harnesses,
    claims:claims,
    exclusions:exclusions,
    syntheticControls:syntheticControls,
    semanticCases:semanticCases,
    groupSpecs:groupSpecs,
    cases:cases
  });
})();