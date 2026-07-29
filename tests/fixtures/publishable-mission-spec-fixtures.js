/* CRIOS A2-006B - publishable mission fixtures */
(function(){
  'use strict';

  function number(value){ return { type:'number', value:value }; }
  function variable(name){ return { type:'variable', name:name }; }
  function operation(type,left,right){ return { type:type, left:left, right:right }; }
  function add(left,right){ return operation('add',left,right); }
  function subtract(left,right){ return operation('subtract',left,right); }
  function multiply(left,right){ return operation('multiply',left,right); }
  function divide(left,right){ return operation('divide',left,right); }

  function metadata(numberValue,title,shortTitle,mapSubtitle,styleToken,location,objective,difficulty,duration,tags){
    return {number:numberValue,title:title,shortTitle:shortTitle,map:{title:title,subtitle:mapSubtitle,styleToken:styleToken},classification:{subject:'matematica',topic:'geometria',subtopic:'calculoAreas',level:'educacion-media',difficulty:difficulty},narrative:{location:location,objective:objective},activity:{type:'respuesta-numerica-con-procedimiento',durationMinutes:duration,tags:tags.slice()}};
  }
  function spec(missionId,payload){return {missionId:missionId,handlerId:'crios.geometry.declarative-area',handlerVersion:'1.0.0',payload:payload};}

  function energy(){return spec('energy',{
    metadata:metadata('01','Centro de Energia','Energia','Calefaccion','m-energy','Centro de Energia','Determinar la superficie activa para distribuir la calefaccion.',2,12,['areas','rectangulo','sustraccion-de-areas','resolucion-de-problemas']),
    generation:{rngPolicy:'SEEDED_SEQUENCE_V1',variables:[{name:'totalW',values:[20,22,24,26,28]},{name:'height',values:[6,7,8,9]},{name:'west',values:[7,8,9,10,11]},{name:'damageW',values:[3,4,5,6]},{name:'damageH',values:[2,3,4]}],constants:[],derived:[{name:'east',expression:subtract(variable('totalW'),variable('west'))}]},
    assessment:{responseType:'NUMERIC_WITH_PROCEDURE',tolerance:1e-9,unit:'m2',answerExpression:subtract(multiply(variable('totalW'),variable('height')),multiply(variable('damageW'),variable('damageH'))),operands:['totalW','height','damageW','damageH'],alternativeOperands:[]},
    presentation:{ariaMessage:'Sin conocer la superficie activa no puedo distribuir correctamente la calefaccion.',statement:'El modulo ocupa un rectangulo de {totalW} m de ancho y {height} m de altura. El sector oeste ocupa {west} m. Una zona danada de {damageW} m por {damageH} m no debe calefaccionarse.',question:'Que superficie continua calefaccionandose?',hint:'La superficie activa es el rectangulo completo menos la zona danada.',procedurePlaceholder:'Ejemplo: 24*8 - 5*3',scene:{width:700,height:430,primitives:[{type:'rect',role:'primary',x:120,y:105,width:460,height:210},{type:'line',role:'primary',x1:add(number(120),multiply(number(460),divide(variable('west'),variable('totalW')))),y1:105,x2:add(number(120),multiply(number(460),divide(variable('west'),variable('totalW')))),y2:315},{type:'rect',role:'danger',x:420,y:210,width:96,height:72},{type:'text',role:'label',x:350,y:60,text:'{totalW} m'},{type:'text',role:'label',x:205,y:205,text:'{west} m'},{type:'text',role:'danger',x:468,y:266,text:'{damageW} m por {damageH} m'}]}}
  });}

  function greenhouse(){return spec('greenhouse',{
    metadata:metadata('02','Invernadero','Invernadero','Cultivos','m-green','Invernadero','Determinar la superficie que puede destinarse a cultivos.',2,12,['areas','rectangulo','triangulo','ajustes-de-superficie']),
    generation:{rngPolicy:'SEEDED_SEQUENCE_V1',variables:[{name:'width',values:[16,18,20,22]},{name:'height',values:[10,12,14]},{name:'base',values:[4,6,8]},{name:'triH',values:[3,4,5,6]},{name:'loss',values:[12,15,18,20]},{name:'recovered',values:[4,6,7,9]}],constants:[],derived:[]},
    assessment:{responseType:'NUMERIC_WITH_PROCEDURE',tolerance:1e-9,unit:'m2',answerExpression:add(subtract(subtract(multiply(variable('width'),variable('height')),divide(multiply(variable('base'),variable('triH')),number(2))),variable('loss')),variable('recovered')),operands:['width','height','base','triH','loss','recovered'],alternativeOperands:[]},
    presentation:{ariaMessage:'Necesito determinar la superficie que puede destinarse a alimentos.',statement:'El invernadero mide {width} m por {height} m. El estanque triangular tiene {base} m de base y {triH} m de altura. Se perdieron {loss} m2 y se recuperaron {recovered} m2.',question:'Que superficie puede cultivarse actualmente?',hint:'Calcula el rectangulo, resta el triangulo y la perdida, luego suma la recuperacion.',procedurePlaceholder:'Ejemplo: 20*12 - 6*4/2 - 15 + 6',scene:{width:700,height:430,primitives:[{type:'rect',role:'primary',x:120,y:90,width:460,height:260},{type:'polygon',role:'accent',points:[{x:270,y:295},{x:430,y:295},{x:350,y:175}]},{type:'line',role:'accent',x1:350,y1:175,x2:350,y2:295},{type:'text',role:'label',x:350,y:48,text:'{width} m'},{type:'text',role:'accent',x:350,y:340,text:'base {base} m'},{type:'text',role:'accent',x:385,y:235,text:'altura {triH} m'}]}}
  });}

  function ice(){return spec('ice',{
    metadata:metadata('03','Banco de Hielo','Banco de Hielo','Muestras','m-ice','Banco de Hielo','Calcular la superficie exterior operativa.',2,12,['areas','cuadrado','circulo','radio-y-diametro','sustraccion-de-areas']),
    generation:{rngPolicy:'SEEDED_SEQUENCE_V1',variables:[{name:'side',values:[14,16,18,20]},{name:'diam',values:[8,10,12]},{name:'recovered',values:[8,10,12,14]},{name:'sealed',values:[4,6,8,10]}],constants:[{name:'pi',value:3}],derived:[{name:'rad',expression:divide(variable('diam'),number(2))}]},
    assessment:{responseType:'NUMERIC_WITH_PROCEDURE',tolerance:1e-9,unit:'m2',answerExpression:subtract(add(subtract(multiply(variable('side'),variable('side')),multiply(variable('pi'),multiply(variable('rad'),variable('rad')))),variable('recovered')),variable('sealed')),operands:['side','diam','pi','recovered','sealed'],alternativeOperands:[['side','side','pi','rad','rad','recovered','sealed']]},
    presentation:{ariaMessage:'La camara circular contiene las muestras y la superficie exterior debe calcularse.',statement:'La sala cuadrada mide {side} m de lado. La camara circular tiene {diam} m de diametro. Use pi igual a {pi}. Se recuperaron {recovered} m2 y se sellaron {sealed} m2.',question:'Que superficie exterior queda operativa?',hint:'El radio es la mitad del diametro. Resta el circulo al cuadrado y aplica los ajustes.',procedurePlaceholder:'Ejemplo: 16*16 - 3*5*5 + 10 - 6',scene:{width:700,height:430,primitives:[{type:'rect',role:'primary',x:180,y:55,width:340,height:340},{type:'circle',role:'accent',cx:350,cy:225,r:112},{type:'line',role:'accent',x1:238,y1:225,x2:462,y2:225},{type:'text',role:'label',x:350,y:35,text:'{side} m'},{type:'text',role:'accent',x:350,y:244,text:'{diam} m'},{type:'text',role:'label',x:560,y:380,text:'pi = {pi}'}]}}
  });}

  function hangar(){return spec('hangar',{
    metadata:metadata('04','Hangar de Perforacion','Hangar','Perforacion','m-hangar','Hangar de Perforacion','Determinar la superficie libre segura.',3,15,['areas','figura-compuesta','planta-en-l','ajustes-de-superficie']),
    generation:{rngPolicy:'SEEDED_SEQUENCE_V1',variables:[{name:'width',values:[20,22,24,26]},{name:'height',values:[12,14,16]},{name:'upper',values:[11,12,13,14,15]},{name:'lowerH',values:[5,6,7]},{name:'blockW',values:[3,4,5]},{name:'blockH',values:[3,4,5]},{name:'recovered',values:[4,6,8]}],constants:[],derived:[{name:'missingW',expression:subtract(variable('width'),variable('upper'))},{name:'missingH',expression:subtract(variable('height'),variable('lowerH'))}]},
    assessment:{responseType:'NUMERIC_WITH_PROCEDURE',tolerance:1e-9,unit:'m2',answerExpression:add(subtract(subtract(multiply(variable('width'),variable('height')),multiply(variable('upper'),variable('lowerH'))),multiply(variable('blockW'),variable('blockH'))),variable('recovered')),operands:['width','height','upper','lowerH','blockW','blockH','recovered'],alternativeOperands:[]},
    presentation:{ariaMessage:'El vehiculo perforador necesita una superficie libre segura para maniobrar.',statement:'La planta en L mide {width} m por {height} m. El brazo horizontal mide {upper} m y el vertical {lowerH} m. Una zona de {blockW} m por {blockH} m esta bloqueada y se recuperaron {recovered} m2.',question:'Que superficie queda disponible para maniobrar?',hint:'Calcula el exterior, resta el brazo indicado y el bloqueo, luego suma el corredor recuperado.',procedurePlaceholder:'Ejemplo: 24*14 - 13*6 - 4*3 + 6',scene:{width:700,height:430,primitives:[{type:'polygon',role:'primary',points:[{x:130,y:80},{x:570,y:80},{x:570,y:190},{x:390,y:190},{x:390,y:350},{x:130,y:350}]},{type:'rect',role:'danger',x:185,y:245,width:100,height:72},{type:'text',role:'label',x:350,y:35,text:'{width} m'},{type:'text',role:'label',x:480,y:235,text:'{upper} m'},{type:'text',role:'danger',x:235,y:298,text:'{blockW} m por {blockH} m'}]}}
  });}

  function get(missionId){var factories={energy:energy,greenhouse:greenhouse,ice:ice,hangar:hangar};return factories[missionId]?factories[missionId]():null;}
  function createAll(){return [energy(),greenhouse(),ice(),hangar()];}
  window.CRIOS_RUNTIME_MISSION_FIXTURES=Object.freeze({get:get,createAll:createAll});
})();