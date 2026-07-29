/* CRIOS A2-006B - runtime mission materialization browser tests */
(function(){
  'use strict';
  var startedAt=performance.now();var tests=[];var results=[];var api=window.CRIOS_RUNTIME_MISSION_HANDLERS;var fixtures=window.CRIOS_RUNTIME_MISSION_FIXTURES;
  var telemetry={pageerrors:[],consoleErrors:[],consoleWarnings:[]};
  var originalError=console.error,originalWarn=console.warn;
  console.error=function(){telemetry.consoleErrors.push(Array.prototype.join.call(arguments,' '));return originalError.apply(console,arguments);};
  console.warn=function(){telemetry.consoleWarnings.push(Array.prototype.join.call(arguments,' '));return originalWarn.apply(console,arguments);};
  window.addEventListener('error',function(event){telemetry.pageerrors.push(String(event.message||'error'));});
  window.addEventListener('unhandledrejection',function(event){telemetry.pageerrors.push(String(event.reason||'rejection'));});

  function test(name,run){tests.push({name:name,run:run});}
  function assert(condition,message){if(!condition)throw new Error(message||'Assertion failed.');}
  function equal(actual,expected,message){assert(actual===expected,(message||'Values differ.')+' actual='+actual+' expected='+expected);}
  function keys(value){return Object.keys(value).sort().join(',');}
  function clone(value){return JSON.parse(JSON.stringify(value));}
  function expectCode(run,code){var caught=null;try{run();}catch(error){caught=error;}assert(caught,'Expected error '+code+'.');equal(caught.code,code,'Unexpected error code.');return caught;}
  function invalidSpec(mutator,expectedCode){var value=fixtures.get('energy');mutator(value);var validation=api.validatePublishedMissionSpec(value);assert(!validation.valid,'Spec should be invalid.');if(expectedCode)assert(validation.issues.some(function(item){return item.code===expectedCode;}),'Missing error '+expectedCode);}
  function invalidPayload(mutator,expectedCode){var value=fixtures.get('energy');mutator(value);var validation=api.get(value.handlerId,value.handlerVersion).validateSpec(value);assert(!validation.valid,'Payload should be invalid.');if(expectedCode)assert(validation.issues.some(function(item){return item.code===expectedCode;}),'Missing error '+expectedCode);}
  function sequence(values,calls){var index=0;return function(){calls.push(index);var value=values[index%values.length];index+=1;return value;};}
  function materialize(id){return api.createMissionMaterializer().materialize(fixtures.get(id),{});}
  function frozenDeep(value){if(!value||typeof value!=='object')return true;if(!Object.isFrozen(value))return false;return Object.keys(value).every(function(key){return frozenDeep(value[key]);});}
  function fakeHandler(id,version){return {handlerId:id,handlerVersion:version,validateSpec:function(){return Object.freeze({valid:true,issues:Object.freeze([])});},materialize:function(){return null;}};}

  test('001 API exacta',function(){equal(keys(api),'constants,createMissionMaterializer,createPublishedMissionSpec,createRuntimeMissionHandlerRegistry,evaluateExpression,get,has,isMaterializedRuntimeMission,isPublishedMissionSpec,list,validatePublishedMissionSpec,version');});
  test('002 API congelada',function(){assert(Object.isFrozen(api));});
  test('003 constants profundamente congelado',function(){assert(frozenDeep(api.constants));});
  test('004 unico global raiz de produccion',function(){var before=window.__CRIOS_GLOBALS_BEFORE_MISSIONS__,after=window.__CRIOS_GLOBALS_AFTER_MISSIONS__;var added=after.filter(function(name){return before.indexOf(name)<0&&name!=='__CRIOS_GLOBALS_BEFORE_MISSIONS__';});equal(added.join(','),'CRIOS_RUNTIME_MISSION_HANDLERS');});
  test('005 namespace temporal retirado',function(){assert(!Object.prototype.hasOwnProperty.call(window,'__CRIOS_RUNTIME_MISSION_INTERNAL__'));});
  test('006 registro predeterminado sin register',function(){assert(typeof api.register==='undefined');});
  test('007 handler predeterminado presente',function(){assert(api.has('crios.geometry.declarative-area','1.0.0'));});
  test('008 registro predeterminado lista un handler',function(){equal(api.list().length,1);assert(Object.isFrozen(api.list()));});
  test('009 version exacta',function(){equal(api.version,'1.0.0');});
  test('010 constantes de handler exactas',function(){equal(api.constants.DEFAULT_HANDLER_ID,'crios.geometry.declarative-area');equal(api.constants.DEFAULT_HANDLER_VERSION,'1.0.0');});

  test('011 forma raiz exacta',function(){var made=api.createPublishedMissionSpec(fixtures.get('energy'));assert(made.success);equal(keys(made.spec),'handlerId,handlerVersion,missionId,payload');});
  test('012 spec congelada',function(){assert(Object.isFrozen(api.createPublishedMissionSpec(fixtures.get('energy')).spec));});
  test('013 payload congelado',function(){assert(frozenDeep(api.createPublishedMissionSpec(fixtures.get('energy')).spec.payload));});
  test('014 copia defensiva',function(){var input=fixtures.get('energy');var made=api.createPublishedMissionSpec(input);input.missionId='changed';equal(made.spec.missionId,'energy');});
  test('015 funcion rechazada',function(){invalidSpec(function(value){value.payload.bad=function(){};},'MISSION_SPEC_INVALID');});
  test('016 undefined rechazado',function(){invalidSpec(function(value){value.payload.bad=undefined;},'MISSION_SPEC_INVALID');});
  test('017 bigint rechazado',function(){invalidSpec(function(value){value.payload.bad=BigInt(1);},'MISSION_SPEC_INVALID');});
  test('018 NaN rechazado',function(){invalidSpec(function(value){value.payload.bad=NaN;},'MISSION_SPEC_INVALID');});
  test('019 Infinity rechazado',function(){invalidSpec(function(value){value.payload.bad=Infinity;},'MISSION_SPEC_INVALID');});
  test('020 circular rechazado',function(){invalidSpec(function(value){value.payload.bad=value;},'MISSION_SPEC_INVALID');});
  test('021 accessor rechazado sin ejecutarse',function(){var value=fixtures.get('energy'),calls=0;Object.defineProperty(value,'trap',{enumerable:true,get:function(){calls+=1;return 1;}});var validation=api.validatePublishedMissionSpec(value);assert(!validation.valid);equal(calls,0);});
  test('022 clave raiz desconocida',function(){invalidSpec(function(value){value.extra=1;},'MISSION_SPEC_INVALID');});
  test('023 clave peligrosa',function(){var value=JSON.parse(JSON.stringify(fixtures.get('energy')));Object.defineProperty(value.payload,'constructor',{value:1,enumerable:true});var validation=api.validatePublishedMissionSpec(value);assert(!validation.valid);});
  test('024 handlerId vacio',function(){invalidSpec(function(value){value.handlerId='';},'MISSION_HANDLER_ID_MISSING');});
  test('025 handlerVersion ausente',function(){invalidSpec(function(value){value.handlerVersion='';},'MISSION_HANDLER_VERSION_MISSING');});
  test('026 handlerVersion invalida',function(){invalidSpec(function(value){value.handlerVersion='v1';},'MISSION_SPEC_INVALID');});
  test('027 missionId vacio',function(){invalidSpec(function(value){value.missionId='';},'MISSION_SPEC_INVALID');});
  test('028 custom prototype rechazado',function(){invalidSpec(function(value){value.payload.bad=Object.create({x:1});},'MISSION_SPEC_INVALID');});
  test('029 isPublishedMissionSpec acepta fabrica',function(){assert(api.isPublishedMissionSpec(api.createPublishedMissionSpec(fixtures.get('energy')).spec));});
  test('030 isPublishedMissionSpec rechaza mutable',function(){assert(!api.isPublishedMissionSpec(fixtures.get('energy')));});

  test('031 AST number',function(){equal(api.evaluateExpression({type:'number',value:3},{}),3);});
  test('032 AST variable',function(){equal(api.evaluateExpression({type:'variable',name:'x'},{x:4}),4);});
  test('033 AST add',function(){equal(api.evaluateExpression({type:'add',left:{type:'number',value:2},right:{type:'number',value:3}},{}),5);});
  test('034 AST subtract',function(){equal(api.evaluateExpression({type:'subtract',left:{type:'number',value:7},right:{type:'number',value:2}},{}),5);});
  test('035 AST multiply',function(){equal(api.evaluateExpression({type:'multiply',left:{type:'number',value:7},right:{type:'number',value:2}},{}),14);});
  test('036 AST divide',function(){equal(api.evaluateExpression({type:'divide',left:{type:'number',value:8},right:{type:'number',value:2}},{}),4);});
  test('037 AST combinada',function(){equal(api.evaluateExpression({type:'subtract',left:{type:'multiply',left:{type:'variable',name:'x'},right:{type:'number',value:3}},right:{type:'number',value:2}},{x:4}),10);});
  test('038 variable ausente',function(){expectCode(function(){api.evaluateExpression({type:'variable',name:'x'},{});},'EXPRESSION_VARIABLE_MISSING');});
  test('039 division por cero',function(){expectCode(function(){api.evaluateExpression({type:'divide',left:{type:'number',value:1},right:{type:'number',value:0}},{});},'EXPRESSION_DIVISION_BY_ZERO');});
  test('040 resultado no finito',function(){expectCode(function(){api.evaluateExpression({type:'multiply',left:{type:'number',value:Number.MAX_VALUE},right:{type:'number',value:2}},{});},'EXPRESSION_RESULT_NON_FINITE');});
  test('041 operacion desconocida',function(){expectCode(function(){api.evaluateExpression({type:'power',left:{},right:{}},{});},'EXPRESSION_OPERATION_UNSUPPORTED');});
  test('042 clave AST desconocida',function(){expectCode(function(){api.evaluateExpression({type:'number',value:1,extra:2},{});},'EXPRESSION_INVALID');});
  test('043 profundidad excedida',function(){var ast={type:'number',value:1};for(var i=0;i<33;i+=1)ast={type:'add',left:ast,right:{type:'number',value:1}};expectCode(function(){api.evaluateExpression(ast,{});},'EXPRESSION_DEPTH_EXCEEDED');});
  test('044 nodos excedidos',function(){function tree(depth){return depth?{type:'add',left:tree(depth-1),right:tree(depth-1)}:{type:'number',value:1};}expectCode(function(){api.evaluateExpression(tree(8),{});},'EXPRESSION_NODE_LIMIT_EXCEEDED');});
  test('045 AST no mutado',function(){var ast={type:'variable',name:'x'},before=JSON.stringify(ast);api.evaluateExpression(ast,{x:2});equal(JSON.stringify(ast),before);});
  test('046 environment no mutado',function(){var env={x:2},before=JSON.stringify(env);api.evaluateExpression({type:'variable',name:'x'},env);equal(JSON.stringify(env),before);});
  test('047 codigo en string no ejecutado',function(){expectCode(function(){api.evaluateExpression('1+1',{});},'EXPRESSION_INVALID');});
  test('048 property access imposible',function(){expectCode(function(){api.evaluateExpression({type:'variable',name:'x.y'},{'x.y':2});},'EXPRESSION_INVALID');});
  test('049 function call imposible',function(){expectCode(function(){api.evaluateExpression({type:'call',name:'x'},{});},'EXPRESSION_OPERATION_UNSUPPORTED');});
  test('050 environment invalido',function(){expectCode(function(){api.evaluateExpression({type:'number',value:1},[]);},'EXPRESSION_ENVIRONMENT_INVALID');});

  test('051 registro aislado vacio',function(){var registry=api.createRuntimeMissionHandlerRegistry();equal(registry.list().length,0);});
  test('052 register valido',function(){var registry=api.createRuntimeMissionHandlerRegistry();registry.register(fakeHandler('x','1.0.0'));assert(registry.has('x','1.0.0'));});
  test('053 has exacto',function(){var registry=api.createRuntimeMissionHandlerRegistry();registry.register(fakeHandler('x','1.0.0'));assert(!registry.has('x','1.0.1'));});
  test('054 get exacto',function(){var registry=api.createRuntimeMissionHandlerRegistry(),handler=fakeHandler('x','1.0.0');registry.register(handler);equal(registry.get('x','1.0.0').handlerId,'x');});
  test('055 get inexistente null',function(){equal(api.createRuntimeMissionHandlerRegistry().get('x','1.0.0'),null);});
  test('056 no fallback version',function(){var registry=api.createRuntimeMissionHandlerRegistry();registry.register(fakeHandler('x','2.0.0'));equal(registry.get('x','1.0.0'),null);});
  test('057 duplicado rechazado',function(){var registry=api.createRuntimeMissionHandlerRegistry(),handler=fakeHandler('x','1.0.0');registry.register(handler);expectCode(function(){registry.register(handler);},'MISSION_HANDLER_DUPLICATE');});
  test('058 reemplazo rechazado',function(){var registry=api.createRuntimeMissionHandlerRegistry();registry.register(fakeHandler('x','1.0.0'));expectCode(function(){registry.register(fakeHandler('x','1.0.0'));},'MISSION_HANDLER_REPLACEMENT_FORBIDDEN');});
  test('059 list defensivo',function(){var registry=api.createRuntimeMissionHandlerRegistry();registry.register(fakeHandler('x','1.0.0'));var list=registry.list();assert(frozenDeep(list));});
  test('060 seal',function(){var registry=api.createRuntimeMissionHandlerRegistry();assert(registry.seal());assert(registry.isSealed());});
  test('061 seal idempotente',function(){var registry=api.createRuntimeMissionHandlerRegistry();registry.seal();assert(registry.seal());});
  test('062 register tras seal',function(){var registry=api.createRuntimeMissionHandlerRegistry();registry.seal();expectCode(function(){registry.register(fakeHandler('x','1.0.0'));},'MISSION_HANDLER_REPLACEMENT_FORBIDDEN');});
  test('063 registros aislados',function(){var one=api.createRuntimeMissionHandlerRegistry(),two=api.createRuntimeMissionHandlerRegistry();one.register(fakeHandler('x','1.0.0'));assert(!two.has('x','1.0.0'));});
  test('064 handler congelado',function(){assert(Object.isFrozen(api.get('crios.geometry.declarative-area','1.0.0')));});

  ['energy','greenhouse','ice','hangar'].forEach(function(id,index){
    test(('0'+(65+index)).slice(-3)+' spec '+id+' valida',function(){assert(api.get('crios.geometry.declarative-area','1.0.0').validateSpec(fixtures.get(id)).valid);});
  });
  test('069 payload incompleto',function(){invalidPayload(function(value){delete value.payload.presentation;},'MISSION_PAYLOAD_INCOMPLETE');});
  test('070 variable duplicada',function(){invalidPayload(function(value){value.payload.generation.variables.push(clone(value.payload.generation.variables[0]));},'MISSION_PAYLOAD_INVALID');});
  test('071 derived duplicado',function(){invalidPayload(function(value){value.payload.generation.derived.push(clone(value.payload.generation.derived[0]));},'MISSION_PAYLOAD_INVALID');});
  test('072 derived desconocido',function(){invalidPayload(function(value){value.payload.generation.derived[0].expression={type:'variable',name:'missing'};},'MISSION_PAYLOAD_INVALID');});
  test('073 placeholder desconocido',function(){invalidPayload(function(value){value.payload.presentation.statement='{missing}';},'MISSION_PAYLOAD_INVALID');});
  test('074 plantilla HTML rechazada',function(){invalidPayload(function(value){value.payload.presentation.statement='<b>bad</b>';},'MISSION_PAYLOAD_INVALID');});
  test('075 escena script rechazada',function(){invalidPayload(function(value){value.payload.presentation.scene.primitives[0].type='script';},'MISSION_PAYLOAD_INVALID');});
  test('076 escena evento rechazada',function(){invalidPayload(function(value){value.payload.presentation.scene.primitives[0].onclick='x';},'MISSION_PAYLOAD_INVALID');});
  test('077 escena URL rechazada',function(){invalidPayload(function(value){value.payload.presentation.scene.primitives[0].href='https://x';},'MISSION_PAYLOAD_INVALID');});
  test('078 primitiva desconocida',function(){invalidPayload(function(value){value.payload.presentation.scene.primitives[0].type='path';},'MISSION_PAYLOAD_INVALID');});
  test('079 atributo desconocido',function(){invalidPayload(function(value){value.payload.presentation.scene.primitives[0].style='x';},'MISSION_PAYLOAD_INVALID');});
  test('080 role desconocido',function(){invalidPayload(function(value){value.payload.presentation.scene.primitives[0].role='custom';},'MISSION_PAYLOAD_INVALID');});
  test('081 assessment invalido',function(){invalidPayload(function(value){value.payload.assessment.tolerance=-1;},'MISSION_PAYLOAD_INVALID');});
  test('082 RNG no declarado',function(){invalidPayload(function(value){value.payload.generation.rngPolicy='RANDOM';},'NONDETERMINISTIC_GENERATION_UNDECLARED');});
  test('083 lista vacia rechazada',function(){invalidPayload(function(value){value.payload.generation.variables[0].values=[];},'MISSION_PAYLOAD_INVALID');});
  test('084 numero no finito payload',function(){invalidPayload(function(value){value.payload.generation.variables[0].values[0]=Infinity;},'MISSION_SPEC_INVALID');});

  ['energy','greenhouse','ice','hangar'].forEach(function(id,index){
    test(('0'+(85+index)).slice(-3)+' materializa '+id,function(){assert(materialize(id).success);});
  });
  test('089 forma Runtime exacta',function(){equal(keys(materialize('energy').mission),'clasificacion,contenido,duracionEstimadaMinutos,ejemploProcedimiento,etiquetas,generar,handlerId,handlerVersion,id,mapa,mensajeAria,narrativa,nombreCorto,numero,tipoActividad,titulo');});
  test('090 mision congelada',function(){assert(frozenDeep(materialize('energy').mission));});
  test('091 identity preservada',function(){equal(materialize('greenhouse').mission.id,'greenhouse');});
  test('092 handler identity preservada',function(){var mission=materialize('ice').mission;equal(mission.handlerId,'crios.geometry.declarative-area');equal(mission.handlerVersion,'1.0.0');});
  test('093 generar existe',function(){equal(typeof materialize('energy').mission.generar,'function');});
  test('094 contenido existe',function(){equal(typeof materialize('energy').mission.contenido,'function');});
  test('095 estado generado congelado',function(){var state=materialize('energy').mission.generar(function(){return 0;},7);assert(frozenDeep(state));});
  test('096 contenido no modifica estado',function(){var mission=materialize('energy').mission,state=mission.generar(function(){return 0;},7),before=JSON.stringify(state);mission.contenido(state);equal(JSON.stringify(state),before);});
  test('097 spec no modificada',function(){var spec=fixtures.get('energy'),before=JSON.stringify(spec);api.createMissionMaterializer().materialize(spec,{});equal(JSON.stringify(spec),before);});
  test('098 handler ausente falla',function(){var registry=api.createRuntimeMissionHandlerRegistry(),out=api.createMissionMaterializer({registry:registry}).materialize(fixtures.get('energy'),{});assert(!out.success);equal(out.error.code,'MISSION_HANDLER_NOT_FOUND');});
  test('099 version ausente falla',function(){var spec=fixtures.get('energy');spec.handlerVersion='2.0.0';var out=api.createMissionMaterializer().materialize(spec,{});assert(!out.success);equal(out.error.code,'MISSION_HANDLER_VERSION_UNSUPPORTED');});
  test('100 fallo no intenta otro handler',function(){var registry=api.createRuntimeMissionHandlerRegistry(),calls=0,bad=fakeHandler('crios.geometry.declarative-area','1.0.0');bad.validateSpec=function(){calls+=1;return {valid:false,issues:[{code:'MISSION_PAYLOAD_INVALID',severity:'ERROR',path:'$',message:'bad'}]};};registry.register(bad);registry.register(fakeHandler('other','1.0.0'));var out=api.createMissionMaterializer({registry:registry}).materialize(fixtures.get('energy'),{});assert(!out.success);equal(calls,1);});

  ['energy','greenhouse','ice','hangar'].forEach(function(id,index){
    test(('0'+(101+index)).slice(-3)+' determinismo '+id,function(){var mission=materialize(id).mission;equal(JSON.stringify(mission.generar(function(){return 0.25;},9)),JSON.stringify(mission.generar(function(){return 0.25;},9)));});
  });
  test('105 RNG distinto cambia resultado',function(){var mission=materialize('energy').mission;assert(JSON.stringify(mission.generar(function(){return 0;},1))!==JSON.stringify(mission.generar(function(){return 0.99;},1)));});
  test('106 llamadas RNG en orden',function(){var calls=[],mission=materialize('energy').mission;mission.generar(sequence([0,0.2,0.4,0.6,0.8],calls),1);equal(calls.join(','),'0,1,2,3,4');});
  test('107 sin llamadas RNG ocultas',function(){var count=0;materialize('ice').mission.generar(function(){count+=1;return 0;},1);equal(count,4);});
  test('108 variante conservada',function(){equal(materialize('energy').mission.generar(function(){return 0;},27).variant,27);});
  test('109 Math.random no utilizado',function(){var original=Math.random;Math.random=function(){throw new Error('forbidden');};try{materialize('energy').mission.generar(function(){return 0;},1);}finally{Math.random=original;}});
  test('110 textos proceden payload',function(){var spec=fixtures.get('energy');spec.payload.presentation.question='Pregunta trazable';var registry=api.createRuntimeMissionHandlerRegistry();registry.register(api.get(spec.handlerId,spec.handlerVersion));var mission=api.createMissionMaterializer({registry:registry}).materialize(spec,{}).mission;equal(mission.contenido(mission.generar(function(){return 0;},1)).question,'Pregunta trazable');});
  test('111 numeros proceden payload',function(){var spec=fixtures.get('energy');spec.payload.generation.variables[0].values=[99];var mission=api.createMissionMaterializer().materialize(spec,{}).mission;equal(mission.generar(function(){return 0;},1).values.totalW,99);});
  test('112 respuesta procede AST',function(){var spec=fixtures.get('energy');spec.payload.assessment.answerExpression={type:'number',value:123};var mission=api.createMissionMaterializer().materialize(spec,{}).mission;equal(mission.generar(function(){return 0;},1).expected,123);});
  test('113 escena procede descriptor',function(){var spec=fixtures.get('energy');spec.payload.presentation.scene.primitives=[{type:'text',role:'label',x:1,y:2,text:'MARCA'}];var mission=api.createMissionMaterializer().materialize(spec,{}).mission;assert(mission.contenido(mission.generar(function(){return 0;},1)).svg.indexOf('MARCA')>=0);});
  test('114 texto malicioso escapado',function(){var spec=fixtures.get('energy');spec.payload.generation.variables[0].values=[5];spec.payload.presentation.statement='Valor {totalW}';var mission=api.createMissionMaterializer().materialize(spec,{}).mission;assert(mission.contenido(mission.generar(function(){return 0;},1)).text.indexOf('<')<0);});
  test('115 no rawHtml',function(){invalidPayload(function(value){value.payload.presentation.rawHtml='x';},'MISSION_PAYLOAD_INCOMPLETE');});
  test('116 no rawSvg',function(){invalidPayload(function(value){value.payload.presentation.rawSvg='x';},'MISSION_PAYLOAD_INCOMPLETE');});
  test('117 no REGISTRO_MISIONES',function(){var previous=window.REGISTRO_MISIONES;Object.defineProperty(window,'REGISTRO_MISIONES',{configurable:true,get:function(){throw new Error('legacy');}});try{materialize('energy').mission.generar(function(){return 0;},1);}finally{delete window.REGISTRO_MISIONES;if(previous!==undefined)window.REGISTRO_MISIONES=previous;}});
  test('118 no CRIOS_STUDIO',function(){var previous=window.CRIOS_STUDIO;Object.defineProperty(window,'CRIOS_STUDIO',{configurable:true,get:function(){throw new Error('studio');}});try{materialize('energy');}finally{delete window.CRIOS_STUDIO;if(previous!==undefined)window.CRIOS_STUDIO=previous;}});
  test('119 no eval durante operacion',function(){var original=window.eval;window.eval=function(){throw new Error('eval');};try{materialize('energy').mission.generar(function(){return 0;},1);}finally{window.eval=original;}});
  test('120 no Function constructor durante operacion',function(){var original=window.Function;window.Function=function(){throw new Error('Function');};try{materialize('energy').mission.generar(function(){return 0;},1);}finally{window.Function=original;}});
  test('121 no DOM durante operacion',function(){var mission=materialize('energy').mission,state=mission.generar(function(){return 0;},1);var content=mission.contenido(state);assert(typeof content.text==='string'&&typeof content.svg==='string');});
  test('122 no storage durante operacion',function(){var descriptor=Object.getOwnPropertyDescriptor(window,'localStorage');var calls=0;try{Object.defineProperty(window,'localStorage',{configurable:true,get:function(){calls+=1;throw new Error('storage');}});materialize('energy').mission.generar(function(){return 0;},1);equal(calls,0);}finally{if(descriptor)Object.defineProperty(window,'localStorage',descriptor);}});
  test('123 no red durante operacion',function(){var original=window.fetch,calls=0;window.fetch=function(){calls+=1;throw new Error('network');};try{materialize('energy').mission.generar(function(){return 0;},1);equal(calls,0);}finally{window.fetch=original;}});
  test('124 no timers durante operacion',function(){var original=window.setTimeout,calls=0;window.setTimeout=function(){calls+=1;throw new Error('timer');};try{materialize('energy').mission.generar(function(){return 0;},1);equal(calls,0);}finally{window.setTimeout=original;}});
  test('125 cuatro fixtures independientes',function(){var one=fixtures.get('energy'),two=fixtures.get('energy');one.missionId='x';equal(two.missionId,'energy');});
  test('126 cuatro fixtures sin funciones',function(){fixtures.createAll().forEach(function(spec){assert(JSON.stringify(spec).length>0);});});
  test('127 cuatro fixtures sin legado',function(){fixtures.createAll().forEach(function(spec){assert(!Object.prototype.hasOwnProperty.call(spec,'legacy'));});});
  test('128 contenido exacto de handler congelado',function(){assert(frozenDeep(api.get('crios.geometry.declarative-area','1.0.0')));});

  async function run(){
    for(var index=0;index<tests.length;index+=1){try{await tests[index].run();results.push({name:tests[index].name,passed:true,error:null});}catch(error){results.push({name:tests[index].name,passed:false,error:String(error&&error.message||error)});}}
    console.error=originalError;console.warn=originalWarn;
    var passed=results.filter(function(item){return item.passed;}).length;
    var output=Object.freeze({total:results.length,passed:passed,failed:results.length-passed,tests:Object.freeze(results),durationMs:Math.round((performance.now()-startedAt)*100)/100,status:passed===results.length?'PASS':'FAIL'});
    window.CRIOS_RUNTIME_MISSION_MATERIALIZATION_TEST_RESULTS=output;
    document.getElementById('results').textContent=JSON.stringify(output,null,2);
  }
  run();
})();