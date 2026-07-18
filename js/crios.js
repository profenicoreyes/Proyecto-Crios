(function bootstrapCrios() {
'use strict';

let campanaActiva = null;
let misionesActivas = [];
let missionIds = [];

function obtenerMision(id) {
  const mision = REGISTRO_MISIONES.obtener(id);
  if (!mision) throw new Error(`No existe una misión registrada con el id: ${id}`);
  return mision;
}
const CRIOS_VERSION = CRIOS_CONFIG.version;
const RESULTS_ENDPOINT = CRIOS_CONFIG.resultsEndpoint;
const STORAGE = CRIOS_CONFIG.storage;

function readJson(storage, key, fallback) {
  try {
    const raw = storage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch (error) {
    console.warn('[CRIOS] No se pudo leer el almacenamiento:', key, error);
    return fallback;
  }
}

function writeJson(storage, key, value) {
  try {
    storage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    console.warn('[CRIOS] No se pudo guardar el almacenamiento:', key, error);
    return false;
  }
}

let campanaActivaId = sessionStorage.getItem(STORAGE.campaignId) || CAMPANA_INICIAL_ID;
let progresosCampanas = readJson(sessionStorage, STORAGE.campaignProgress, {});
const progresoAnterior = readJson(sessionStorage, STORAGE.progress, {});
let progress = {};
let missionData = {};

function establecerCampanaActiva(id, { navegar = false } = {}) {
  const campana = obtenerCampanaPorId(id);
  if (!campana || campana.estado !== 'publicada') return false;

  if (campanaActiva) {
    progresosCampanas[campanaActiva.id] = { ...progress };
  }

  campanaActiva = campana;
  campanaActivaId = campana.id;
  misionesActivas = REGISTRO_MISIONES.obtenerPorCampana(campanaActiva);
  missionIds = misionesActivas.map((mision) => mision.id);
  progress = { ...(progresosCampanas[campanaActiva.id] || {}) };
  missionData = {};
  hintRegistered = {};
  missionOpenedAt = {};

  sessionStorage.setItem(STORAGE.campaignId, campanaActiva.id);
  writeJson(sessionStorage, STORAGE.campaignProgress, progresosCampanas);
  writeJson(sessionStorage, STORAGE.progress, progress);

  if (sessionData) {
    sessionData.campana = {
      id: campana.id,
      titulo: campana.titulo,
      clasificacion: campana.clasificacion
    };
    sessionData.misiones = sessionData.misiones || {};
    missionIds.forEach((missionId) => {
      sessionData.misiones[missionId] = sessionData.misiones[missionId] || {
        procedure:'', answer:'', procedureCorrect:false, answerCorrect:false
      };
    });
    persistSession();
  }

  setupMissionUI();
  actualizarCabeceraCampana();
  updateMap();
  renderCampaignSelector();
  if (navegar) go('map');
  return true;
}

function inicializarCampana() {
  const solicitada = obtenerCampanaPorId(campanaActivaId);
  const inicial = solicitada && solicitada.estado === 'publicada'
    ? solicitada
    : obtenerCampanaPorId(CAMPANA_INICIAL_ID) || listarCampanas().find((c) => c.estado === 'publicada');
  if (!inicial) throw new Error('CRIOS no tiene campañas publicadas.');

  if (!progresosCampanas[inicial.id] && Object.keys(progresoAnterior).length) {
    progresosCampanas[inicial.id] = { ...progresoAnterior };
  }
  campanaActiva = inicial;
  campanaActivaId = inicial.id;
  misionesActivas = REGISTRO_MISIONES.obtenerPorCampana(inicial);
  missionIds = misionesActivas.map((mision) => mision.id);
  progress = { ...(progresosCampanas[inicial.id] || {}) };
  sessionStorage.setItem(STORAGE.campaignId, inicial.id);
  writeJson(sessionStorage, STORAGE.campaignProgress, progresosCampanas);
}

inicializarCampana();
let sessionStats = readJson(sessionStorage, STORAGE.sessionStats, {});
let missionOpenedAt = {};
let hintRegistered = {};
let sessionData = readJson(sessionStorage, STORAGE.sessionData, null);
let currentScreen='intro';
let audioCtx=null, soundOn=true;
let introTimer=null;
let ambientNodes=[];
let ambientStarted=false;

function createSessionId(){
  if(window.crypto&&typeof window.crypto.randomUUID==='function') return window.crypto.randomUUID();
  return 'crios-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,10);
}
function persistSession(){
  if(sessionData) writeJson(sessionStorage, STORAGE.sessionData, sessionData);
}
function startSession(realName,characterName,groupName){
  sessionData={
    idSesion:createSessionId(),nombre:realName,personaje:characterName,grupo:groupName,version:CRIOS_VERSION,
    inicioISO:new Date().toISOString(),inicioMs:Date.now(),finISO:null,
    variante:variantIdFor(characterName),pantallas:[],misiones:{},final:{procedureAttempts:0,attempts:0},
    enviada:false,
    campana:{id:campanaActiva.id,titulo:campanaActiva.titulo,clasificacion:campanaActiva.clasificacion}
  };
  missionIds.forEach(id=>sessionData.misiones[id]={procedure:'',answer:'',procedureCorrect:false,answerCorrect:false});
  sessionStats={};progress={};hintRegistered={};missionOpenedAt={};
  writeJson(sessionStorage, STORAGE.progress, {});
  persistStats();persistSession();
}
function recordScreen(id){
  if(!sessionData) return;
  sessionData.pantallas.push({id,at:new Date().toISOString()});
  if(sessionData.pantallas.length>80) sessionData.pantallas.shift();
  persistSession();
  queueSessionUpdate();
}
function missionRecord(id){
  if(!sessionData) return null;
  sessionData.misiones[id]=sessionData.misiones[id]||{};
  return sessionData.misiones[id];
}
function calculateEvaluation(){
  const stats=missionIds.map(id=>sessionStats[id]||{});
  const resultAttempts=stats.reduce((n,x)=>n+(x.attempts||0),0)+(sessionData?.final?.attempts||0);
  const procedureAttempts=stats.reduce((n,x)=>n+(x.procedureAttempts||0),0)+(sessionData?.final?.procedureAttempts||0);
  const hints=stats.reduce((n,x)=>n+(x.hints||0),0);
  const completed=stats.filter(x=>x.completed).length;
  const finalCorrect=Boolean(sessionData?.final?.answerCorrect);
  let score=100;
  score-=Math.max(0,resultAttempts-5)*4;
  score-=Math.max(0,procedureAttempts-5)*2;
  score-=hints*4;
  if(completed<missionIds.length) score-=((missionIds.length-completed)*15);
  if(!finalCorrect) score-=20;
  score=Math.max(0,Math.min(100,Math.round(score)));
  const grade=Math.max(1,Math.min(12,Math.round(1+(score*11/100))));
  let feedback='Operación completada. Procedimientos consistentes y revisión adecuada de los datos.';
  if(score<90) feedback='Operación completada. El sistema recomienda revisar algunos procedimientos y reducir los intentos innecesarios.';
  if(score<70) feedback='Operación completada. Se recomienda revisar la selección de datos y la construcción de las expresiones.';
  if(score<50) feedback='Registro incompleto o con dificultades importantes. Se recomienda rehacer las expresiones con apoyo docente.';
  return {score,grade,feedback,resultAttempts,procedureAttempts,hints,completed,aciertos:completed+(finalCorrect?1:0)};
}
let progressSendTimer=null;
let transmissionBusy=false;
let transmissionQueued=false;

function buildPayload(finalized=false){
  const ev=calculateEvaluation();
  const now=Date.now();
  const isFinal=Boolean(finalized||sessionData.finISO||sessionData.enviada);
  const finalISO=sessionData.finISO||(isFinal?new Date(now).toISOString():'');
  const endMs=finalISO?Date.parse(finalISO):now;
  return {
    idSesion:sessionData.idSesion,
    nombre:sessionData.nombre,
    personaje:sessionData.personaje||'',
    grupo:sessionData.grupo||'',
    variante:sessionData.variante,
    horaInicio:sessionData.inicioISO,
    horaFin:finalISO,
    tiempoSegundos:Math.max(0,Math.round((endMs-sessionData.inicioMs)/1000)),
    respuestas:{misiones:sessionData.misiones,final:sessionData.final,pantallas:sessionData.pantallas,estado:isFinal?'FINALIZADA':'EN CURSO'},
    aciertos:ev.aciertos,
    intentos:ev.resultAttempts+ev.procedureAttempts,
    pistas:ev.hints,
    puntaje:isFinal?ev.score:'',
    notaSugerida:isFinal?ev.grade:'',
    devolucion:isFinal?ev.feedback:'Sesión en curso',
    version:CRIOS_VERSION,
    campana:sessionData.campana||{id:campanaActiva.id,titulo:campanaActiva.titulo}
  };
}

async function sendSessionUpdate(finalized=false){
  if(!sessionData) return;
  if(transmissionBusy){transmissionQueued=transmissionQueued||finalized;return;}
  transmissionBusy=true;
  const payload=buildPayload(finalized);
  const status=document.getElementById('sendStatus');
  try{
    await fetch(RESULTS_ENDPOINT,{
      method:'POST',mode:'no-cors',
      headers:{'Content-Type':'text/plain;charset=utf-8'},
      body:JSON.stringify(payload),keepalive:true
    });
    if(finalized){
      sessionData.finISO=payload.horaFin;
      sessionData.enviada=true;
      sessionData.evaluacion={puntaje:payload.puntaje,nota:payload.notaSugerida,devolucion:payload.devolucion};
      localStorage.removeItem(STORAGE.pendingResult);
      if(status) status.textContent='Registro transmitido.';
    }
    persistSession();
  }catch(error){
    writeJson(localStorage, STORAGE.pendingResult, payload);
    if(status) status.textContent='Transmisión pendiente. CRIOS volverá a intentarlo.';
  }finally{
    transmissionBusy=false;
    if(transmissionQueued){const queuedFinal=transmissionQueued;transmissionQueued=false;sendSessionUpdate(queuedFinal);}
  }
}

function queueSessionUpdate(){
  clearTimeout(progressSendTimer);
  progressSendTimer=setTimeout(() => sendSessionUpdate(false), CRIOS_CONFIG.progressSendDelayMs);
}

async function transmitResults(){
  if(!sessionData) return;
  if(!sessionData.finISO) sessionData.finISO=new Date().toISOString();
  sessionData.enviada=true;
  persistSession();
  await sendSessionUpdate(true);
}

function sendExitSnapshot(){
  if(!sessionData||!RESULTS_ENDPOINT) return;
  const payload=buildPayload(Boolean(sessionData.finISO||sessionData.enviada));
  const raw=JSON.stringify(payload);
  try{
    if(navigator.sendBeacon){
      const blob=new Blob([raw],{type:'text/plain;charset=UTF-8'});
      if(navigator.sendBeacon(RESULTS_ENDPOINT,blob)) return;
    }
  }catch(error){}
  try{
    fetch(RESULTS_ENDPOINT,{method:'POST',mode:'no-cors',headers:{'Content-Type':'text/plain;charset=utf-8'},body:raw,keepalive:true});
  }catch(error){
    localStorage.setItem(STORAGE.pendingResult, raw);
  }
}

async function retryPendingResult(){
  const raw = localStorage.getItem(STORAGE.pendingResult);
  if(!raw||!navigator.onLine) return;
  try{
    await fetch(RESULTS_ENDPOINT,{method:'POST',mode:'no-cors',headers:{'Content-Type':'text/plain;charset=utf-8'},body:raw,keepalive:true});
    localStorage.removeItem(STORAGE.pendingResult);
  }catch(error){}
}
function renderEvaluationSummary(){
  if(!sessionData) return;
  const ev=calculateEvaluation();
  const text=document.getElementById('evaluationText');
  if(text) text.innerHTML='Nivel de recuperación: <strong>'+ev.score+' %</strong> · Nota sugerida: <strong>'+ev.grade+'</strong><br>'+ev.feedback;
}

function go(id){
  currentScreen=id;recordScreen(id);
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  const el=document.getElementById(id);
  if(el){
    el.classList.add('active');
    el.querySelectorAll('.hero,.archive,.data-card,.sidepanel,.mission-info,.final-card').forEach(x=>x.scrollTop=0);
    document.documentElement.scrollTop=0;
    document.body.scrollTop=0;
    const focused=document.activeElement;
    if(focused && typeof focused.blur==='function') focused.blur();
  }
  if(soundOn) uiClick();
  if(id==='map') updateMap();
  if(id==='final') renderFinal();
  if(id==='reveal'){
    loadUserName();
    const saved=sessionStorage.getItem(STORAGE.characterName);
    document.getElementById('missionLogin')?.classList.toggle('hidden',!!saved);
    document.getElementById('missionWelcome')?.classList.toggle('hidden',!saved);
  }
}
function openMission(id){
  renderMission(id);
  missionOpenedAt[id]=Date.now();
  go('mission-'+id);
}
function normalize(v){return Number(String(v).replace(',','.').replace(/[^\d.-]/g,''))}

function save(){progresosCampanas[campanaActiva.id]={...progress};writeJson(sessionStorage, STORAGE.campaignProgress, progresosCampanas);writeJson(sessionStorage, STORAGE.progress, progress);updateMap();renderCampaignSelector();persistSession()}
function updateMap(){
  let done=0;
  missionIds.forEach(id=>{
    const isDone=Boolean(progress[id]);
    if(isDone) done++;
    const card=document.getElementById('card-'+id);
    const mini=document.getElementById('mini-'+id);
    if(card) card.classList.toggle('done',isDone);
    if(mini){
      mini.style.color=isDone?'#9affc6':'var(--muted)';
      mini.textContent=(isDone?'✓ ':'● ')+obtenerMision(id).nombreCorto+': '+(isDone?'operativo':'sin respuesta');
    }
  });
  const total=missionIds.length;
  const target=total?Math.round(done*100/total):0;
  const count=document.getElementById('doneCount');
  const bar=document.getElementById('progressBar');
  const finalBtn=document.getElementById('finalBtn');
  if(count) count.textContent=done+'/'+total;
  if(bar){
    const progressBox=bar.parentElement;
    requestAnimationFrame(()=>{bar.style.transform='scaleX('+(target/100)+')';});
    if(progressBox) progressBox.setAttribute('aria-valuenow',String(target));
    const label=document.getElementById('progressLabel');
    if(label) label.textContent=target+' % · '+done+'/'+total+' módulos';
  }
  if(finalBtn) finalBtn.disabled=done<total;
}
function validateFinal(){
  const value=normalize(document.getElementById('finalAnswer').value);
  const fb=document.getElementById('finalFeedback');
  const expected=getFinalExpected();
  if(sessionData){sessionData.final=sessionData.final||{};sessionData.final.attempts=(sessionData.final.attempts||0)+1;sessionData.final.answer=document.getElementById('finalAnswer').value;sessionData.final.expected=expected;}
  if(Math.abs(value-expected)<1e-9){
    if(sessionData) sessionData.final.answerCorrect=true;
    persistSession();
    fb.className='feedback show ok';
    fb.textContent='Coincidencia confirmada. Activando secuencia final…';
    document.getElementById('finalStatus').innerHTML='<div class="result">100 %</div><h2 style="color:var(--ok)">COMPLEJO ESTABLE</h2><p>Superficie controlada: '+expected+' m²</p>';
    document.getElementById('creditsTotal').textContent=expected;
    sessionStorage.setItem(STORAGE.complete, 'true');
    renderEvaluationSummary();
    transmitResults();
    if(soundOn) successSound();
    setTimeout(() => go('credits'), CRIOS_CONFIG.finalTransitionDelayMs);
  }else{
    if(sessionData) sessionData.final.answerCorrect=false;
    persistSession();
    fb.className='feedback show bad';
    fb.textContent='La red permanece inestable. Revisá la expresión final y el resultado.';
    if(soundOn) beep(150,.16);
    queueSessionUpdate();
  }
}
function resetProgress(){
  if(confirm('¿Cerrar esta sesión y comenzar con una identidad nueva? Se borrará el progreso actual.')){
    progress={};
    sessionData=null;
    sessionStats={};
    missionData={};
    hintRegistered={};
    missionOpenedAt={};

    localStorage.removeItem(STORAGE.pendingResult);
    sessionStorage.removeItem(STORAGE.progress);
    sessionStorage.removeItem(STORAGE.complete);
    sessionStorage.removeItem(STORAGE.realName);
    sessionStorage.removeItem(STORAGE.characterName);
    sessionStorage.removeItem(STORAGE.groupName);
    sessionStorage.removeItem(STORAGE.sessionStats);
    sessionStorage.removeItem(STORAGE.sessionData);
    sessionStorage.removeItem(STORAGE.campaignId);
    sessionStorage.removeItem(STORAGE.campaignProgress);
    progresosCampanas={};
    campanaActivaId=CAMPANA_INICIAL_ID;
    inicializarCampana();

    document.querySelectorAll('input').forEach(i=>i.value='');
    document.querySelectorAll('.feedback').forEach(f=>{f.className='feedback';f.textContent=''});
    document.querySelectorAll('[data-user-name]').forEach(el=>el.textContent='operador');

    const login=document.getElementById('missionLogin');
    const welcome=document.getElementById('missionWelcome');
    if(login) login.classList.remove('hidden');
    if(welcome) welcome.classList.add('hidden');

    updateMap();
    go('reveal');
    loadGroups();
    setTimeout(()=>document.getElementById('userNameInput')?.focus(),120);
  }
}
function toast(msg){
  const t=document.getElementById('toast');t.textContent=msg;t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'),1900);
}
function cleanIdentity(value){
  return String(value||'').trim().replace(/\s+/g,' ').slice(0,32);
}
function setCharacterName(name){
  const clean=cleanIdentity(name);
  if(!clean) return false;
  sessionStorage.setItem(STORAGE.characterName, clean);
  document.querySelectorAll('[data-user-name]').forEach(el=>el.textContent=clean);
  return true;
}
function loadUserName(){
  const realName=sessionStorage.getItem(STORAGE.realName);
  const characterName=sessionStorage.getItem(STORAGE.characterName);

  const realInput=document.getElementById('userNameInput');
  const characterInput=document.getElementById('characterNameInput');

  if(realInput&&realName) realInput.value=realName;
  if(characterInput&&characterName) characterInput.value=characterName;
  if(characterName) setCharacterName(characterName);
}
async function loadGroups(){
  const select=document.getElementById('groupInput');
  const status=document.getElementById('groupLoadStatus');
  const button=document.getElementById('identifyButton');
  if(!select||!button) return;

  select.disabled=true;
  button.disabled=true;
  select.innerHTML='<option value="">Cargando grupos…</option>';
  if(status) status.textContent='Consultando la configuración del curso…';

  try{
    const separator=RESULTS_ENDPOINT.includes('?')?'&':'?';
    const response=await fetch(RESULTS_ENDPOINT+separator+'accion=grupos&_='+Date.now(),{
      method:'GET',
      cache:'no-store'
    });
    if(!response.ok) throw new Error('Respuesta '+response.status);

    const data=await response.json();
    const groups=Array.isArray(data.grupos)
      ? data.grupos.map(cleanIdentity).filter(Boolean)
      : [];

    if(!data.ok||!groups.length){
      throw new Error(data.error||'No hay grupos configurados.');
    }

    select.innerHTML='<option value="">Seleccioná tu grupo</option>';
    groups.forEach(group=>{
      const option=document.createElement('option');
      option.value=group;
      option.textContent=group;
      select.appendChild(option);
    });

    const savedGroup=sessionStorage.getItem(STORAGE.groupName);
    if(savedGroup&&groups.includes(savedGroup)) select.value=savedGroup;

    select.disabled=false;
    button.disabled=false;
    if(status) status.textContent='Grupos cargados desde Google Sheets.';
  }catch(error){
    select.innerHTML='<option value="">No se pudieron cargar los grupos</option>';
    if(status){
      status.innerHTML='No fue posible leer la hoja CONFIG. <button type="button" class="btn secondary" style="padding:6px 10px;margin-left:8px" onclick="loadGroups()">Reintentar</button>';
    }
  }
}

function identifyUser(){
  const realInput=document.getElementById('userNameInput');
  const characterInput=document.getElementById('characterNameInput');
  const groupInput=document.getElementById('groupInput');
  const fb=document.getElementById('nameFeedback');

  const realName=cleanIdentity(realInput?.value);
  const characterName=cleanIdentity(characterInput?.value);
  const groupName=cleanIdentity(groupInput?.value);

  if(!realName||!characterName||!groupName){
    fb.className='feedback show bad';
    fb.textContent=!realName
      ? 'Escribí el nombre real para registrar la sesión.'
      : !characterName
        ? 'Elegí un nombre para tu personaje.'
        : 'Seleccioná tu grupo.';
    return;
  }

  sessionStorage.setItem(STORAGE.realName, realName);
  sessionStorage.setItem(STORAGE.groupName, groupName);
  setCharacterName(characterName);
  startSession(realName,characterName,groupName);
  sendSessionUpdate(false);

  audioCtx=audioCtx||new (window.AudioContext||window.webkitAudioContext)();
  if(audioCtx.state==='suspended') audioCtx.resume();
  if(!ambientStarted) startAmbientAudio();
  successSound();

  fb.className='feedback';
  document.getElementById('missionLogin').classList.add('hidden');
  const confirmedGroup=document.getElementById('confirmedGroup');
  if(confirmedGroup) confirmedGroup.textContent=groupName;
  ensureMissionData();
  document.getElementById('missionWelcome').classList.remove('hidden');
}


function progresoDeCampana(campana) {
  const guardado = campana.id === campanaActiva.id ? progress : (progresosCampanas[campana.id] || {});
  const completadas = campana.misiones.filter((id) => Boolean(guardado[id])).length;
  return {
    completadas,
    total: campana.misiones.length,
    porcentaje: campana.misiones.length ? Math.round(completadas * 100 / campana.misiones.length) : 0
  };
}

function actualizarCabeceraCampana() {
  if (!campanaActiva) return;
  const etiquetas = obtenerEtiquetaTaxonomia(campanaActiva.clasificacion);
  const titulo = document.getElementById('mapCampaignTitle');
  const clasificacion = document.getElementById('mapCampaignClass');
  if (titulo) titulo.textContent = campanaActiva.titulo;
  if (clasificacion) clasificacion.textContent = `${etiquetas.materia} · ${etiquetas.tema} · ${etiquetas.subtema}`;
}

function detalleCampana(id) {
  const campana = obtenerCampanaPorId(id);
  const panel = document.getElementById('campaignDetail');
  if (!campana || !panel) return;
  const etiquetas = obtenerEtiquetaTaxonomia(campana.clasificacion);
  const estado = progresoDeCampana(campana);
  const publicada = campana.estado === 'publicada';
  panel.innerHTML = `
    <div class="brand">INFORMACIÓN DEL RECORRIDO</div>
    <h2>${campana.titulo}</h2>
    <p class="subtitle">${campana.descripcion}</p>
    <div class="detail-grid">
      <div class="detail-row"><span>Materia</span>${etiquetas.materia}</div>
      <div class="detail-row"><span>Tema</span>${etiquetas.tema}</div>
      <div class="detail-row"><span>Contenido</span>${etiquetas.subtema}</div>
      <div class="detail-row"><span>Misiones</span>${campana.misiones.length}</div>
      <div class="detail-row"><span>Progreso guardado</span>${estado.completadas}/${estado.total} · ${estado.porcentaje} %</div>
    </div>
    <div class="actions">
      <button class="btn" ${publicada ? '' : 'disabled'} onclick="seleccionarCampana('${campana.id}')">
        ${campana.id === campanaActiva.id ? 'Continuar campaña' : 'Iniciar campaña'}
      </button>
    </div>`;
  document.querySelectorAll('.campaign-card').forEach((card) => card.classList.toggle('selected', card.dataset.campaignId === id));
}

function renderCampaignSelector() {
  const lista = document.getElementById('campaignList');
  const contador = document.getElementById('campaignCount');
  if (!lista) return;
  const campanas = listarCampanas();
  if (contador) contador.textContent = `${campanas.length} ${campanas.length === 1 ? 'campaña' : 'campañas'}`;
  lista.innerHTML = campanas.map((campana) => {
    const etiquetas = obtenerEtiquetaTaxonomia(campana.clasificacion);
    const estado = progresoDeCampana(campana);
    const bloqueada = campana.estado !== 'publicada';
    return `<button type="button" class="campaign-card ${campana.id === campanaActiva.id ? 'selected' : ''} ${bloqueada ? 'locked' : ''}"
      data-campaign-id="${campana.id}" onclick="detalleCampana('${campana.id}')" ${bloqueada ? 'disabled' : ''}>
      <div class="campaign-card-head"><div><h3>${campana.titulo}</h3><p>${campana.descripcion}</p></div><span class="campaign-tag">${bloqueada ? 'Próximamente' : 'Disponible'}</span></div>
      <div class="campaign-meta"><span class="campaign-tag">${etiquetas.materia}</span><span class="campaign-tag">${etiquetas.tema}</span><span class="campaign-tag">${campana.misiones.length} misiones</span></div>
      <div class="campaign-progress">Progreso: ${estado.completadas}/${estado.total}
        <div class="campaign-progress-track"><div class="campaign-progress-fill" style="transform:scaleX(${estado.porcentaje/100})"></div></div>
      </div>
    </button>`;
  }).join('');
  detalleCampana(campanaActiva.id);
}

function abrirSelectorCampanas() {
  renderCampaignSelector();
  go('campanas');
}

function seleccionarCampana(id) {
  const campana = obtenerCampanaPorId(id);
  if (!campana || campana.estado !== 'publicada') return;
  establecerCampanaActiva(id, { navegar: true });
}

async function toggleFullscreen(event){
  if(event) event.stopPropagation();
  try{
    if(!document.fullscreenElement){
      await document.documentElement.requestFullscreen();
    }else{
      await document.exitFullscreen();
    }
  }catch(e){}
  setTimeout(fitCriosToViewport,120);
  updateFullscreenButton();
}
function updateFullscreenButton(){
  const btn=document.getElementById('fullscreenControl');
  if(btn) btn.textContent=document.fullscreenElement?'SALIR DE PANTALLA COMPLETA':'PANTALLA COMPLETA';
}
document.addEventListener('fullscreenchange',()=>{
  updateFullscreenButton();
  setTimeout(fitCriosToViewport,120);
});
let suspenseTimer=null;
let suspenseMaster=null;
let suspenseRunning=false;
let suspenseStep=0;

function createSuspenseVoice(freq,start,duration,gain,type='sine',detune=0){
  if(!audioCtx||!suspenseMaster) return;
  const osc=audioCtx.createOscillator();
  const env=audioCtx.createGain();
  const filter=audioCtx.createBiquadFilter();
  osc.type=type;
  osc.frequency.setValueAtTime(freq,start);
  osc.detune.setValueAtTime(detune,start);
  filter.type='lowpass';
  filter.frequency.setValueAtTime(900,start);
  filter.Q.value=1.2;
  env.gain.setValueAtTime(.0001,start);
  env.gain.exponentialRampToValueAtTime(gain,start+.08);
  env.gain.exponentialRampToValueAtTime(.0001,start+duration);
  osc.connect(filter);filter.connect(env);env.connect(suspenseMaster);
  osc.start(start);osc.stop(start+duration+.05);
}

function scheduleSuspensePhrase(){
  if(!suspenseRunning||!audioCtx) return;
  const now=audioCtx.currentTime+.03;
  const roots=[55,55,58.27,51.91]; // A1, A1, Bb1, G#1
  const root=roots[suspenseStep%roots.length];
  createSuspenseVoice(root,now,3.8,.055,'sawtooth',-5);
  createSuspenseVoice(root*1.5,now+.05,3.5,.025,'triangle',4);
  createSuspenseVoice(root*2,now+.12,3.2,.018,'sine',0);
  const pulse=[root*2,root*2.2449,root*2.3784,root*2.2449];
  pulse.forEach((f,i)=>createSuspenseVoice(f,now+.55+i*.62,.5,.026,i%2?'triangle':'sine'));
  suspenseStep++;
}

function startAmbientAudio(){
  audioCtx=audioCtx||new (window.AudioContext||window.webkitAudioContext)();
  if(audioCtx.state==='suspended') audioCtx.resume();
  if(suspenseRunning) return;
  suspenseMaster=audioCtx.createGain();
  const compressor=audioCtx.createDynamicsCompressor();
  suspenseMaster.gain.value=.72;
  suspenseMaster.connect(compressor);compressor.connect(audioCtx.destination);
  suspenseRunning=true;
  ambientStarted=true;
  scheduleSuspensePhrase();
  suspenseTimer=setInterval(scheduleSuspensePhrase,3600);
  updateAudioButton();
}

function stopSuspenseMusic(){
  suspenseRunning=false;
  ambientStarted=false;
  if(suspenseTimer){clearInterval(suspenseTimer);suspenseTimer=null;}
  if(suspenseMaster){
    try{suspenseMaster.gain.exponentialRampToValueAtTime(.0001,audioCtx.currentTime+.25);}catch(e){}
    setTimeout(()=>{try{suspenseMaster.disconnect()}catch(e){} suspenseMaster=null;},320);
  }
  updateAudioButton();
}

function updateAudioButton(){
  const btn=document.getElementById('audioControl');
  if(!btn) return;
  btn.textContent=suspenseRunning?'SILENCIAR MÚSICA':'ACTIVAR MÚSICA';
  btn.classList.toggle('muted',!suspenseRunning);
}

async function toggleAmbientAudio(event){
  if(event) event.stopPropagation();
  if(suspenseRunning) stopSuspenseMusic();
  else startAmbientAudio();
}

function uiClick(){
  if(!soundOn||!audioCtx) return;
  beep(520,.045,.035);
}

function beep(freq=440,dur=.08,volume=.05){
  if(!soundOn||!audioCtx)return;
  const o=audioCtx.createOscillator(),g=audioCtx.createGain();
  o.frequency.value=freq;o.type='sine';g.gain.setValueAtTime(volume,audioCtx.currentTime);
  g.gain.exponentialRampToValueAtTime(.001,audioCtx.currentTime+dur);
  o.connect(g);g.connect(audioCtx.destination);o.start();o.stop(audioCtx.currentTime+dur);
}
function successSound(){[440,660,880].forEach((f,i)=>setTimeout(()=>beep(f,.11),i*100))}
const VARIANT_COUNT = CRIOS_CONFIG.variantCount;
function hashString(str){let h=2166136261;const s=String(str||'operador').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}return h>>>0}
function seeded(seed){let x=seed>>>0;return function(){x+=0x6D2B79F5;let t=x;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296}}
function pick(arr,r){return arr[Math.floor(r()*arr.length)]}
function variantIdFor(name){return (hashString(name)%VARIANT_COUNT)+1}
function generateMissionData(name){
  const seed=hashString(name),r=seeded(seed),variant=variantIdFor(name);
  const generated={variant};
  missionIds.forEach(id=>{generated[id]=obtenerMision(id).generar(r,variant);});
  generated.adjustMinus=pick([24,28,30,32,35],r);
  generated.adjustPlus=pick([6,8,10,12],r);
  return generated;
}
function ensureMissionData(){missionData=generateMissionData(sessionStorage.getItem(STORAGE.realName)||'operador')}
function renderMission(id){
  ensureMissionData();
  const definition=obtenerMision(id),data=missionData[id];
  if(!definition||!data) return;
  const content=definition.contenido(data);
  document.getElementById('variant-'+id).textContent='CONFIGURACIÓN INDIVIDUAL · VARIANTE '+String(data.variant).padStart(2,'0');
  document.getElementById('missionText-'+id).innerHTML=content.text;
  document.getElementById('question-'+id).textContent=content.question;
  document.getElementById('blueprint-'+id).innerHTML=content.svg;
  document.getElementById('hintText-'+id).innerHTML='<p>'+data.hint+'</p>';
}
function missionScreenTemplate(id,definition){
  return `<section id="mission-${id}" class="screen mission">
    <div class="mission-wrap">
      <div class="mission-head"><div><div class="brand">MISIÓN ${definition.numero}</div><h2>${definition.titulo}</h2><div class="mission-code" id="variant-${id}">VARIANTE —</div></div><button class="btn secondary" onclick="go('map')">Cerrar módulo</button></div>
      <div class="mission-grid"><div class="blueprint panel" id="blueprint-${id}"></div><div class="mission-info panel">
        <div class="brief"><strong>A.R.I.A.:</strong> ${definition.mensajeAria}</div>
        <div id="context-${id}"><p id="missionText-${id}"></p><p><strong id="question-${id}"></strong></p></div>
        <div class="procedure-box"><label for="procedure-${id}">REGISTRO DE PROCEDIMIENTO</label><p class="small">Escribí una única expresión con las operaciones que representan tu razonamiento.</p>
          <div class="procedure-row"><input id="procedure-${id}" autocomplete="off" spellcheck="false" placeholder="${definition.ejemploProcedimiento}"><button class="btn" onclick="validateProcedure('${id}')">Verificar procedimiento</button></div>
          <div id="procedureFeedback-${id}" class="feedback"></div><div id="resultStep-${id}" class="result-step locked"><label for="answer-${id}">RESULTADO FINAL</label><div class="answer"><input id="answer-${id}" inputmode="decimal" placeholder="Resultado en m²"><button class="btn" onclick="validateMissionResult('${id}')">Ejecutar reparación</button></div><div id="feedback-${id}" class="feedback"></div></div>
        </div><details id="hint-${id}" onclick="registerHint('${id}')"><summary>Solicitar asistencia de A.R.I.A.</summary><div id="hintText-${id}"></div></details>
      </div></div>
    </div></section>`;
}
function setupMissionUI(){
  const screens=document.getElementById('missionScreens');
  const modules=document.getElementById('missionMapModules');
  const statusList=document.getElementById('missionStatusList');
  if(screens) screens.innerHTML=missionIds.map(id=>missionScreenTemplate(id,obtenerMision(id))).join('');
  if(modules) modules.innerHTML=missionIds.map(id=>{const m=obtenerMision(id);return `<button class="module ${m.mapa.clase}" id="card-${id}" onclick="openMission('${id}')"><span class="dot"></span><strong>${m.mapa.titulo||m.titulo}</strong><br><span class="small">${m.mapa.subtitulo}</span></button>`;}).join('');
  if(statusList) statusList.innerHTML=missionIds.map(id=>`<div class="mini" id="mini-${id}">● ${obtenerMision(id).nombreCorto}: sin respuesta</div>`).join('');
  const count=document.getElementById('doneCount');
  if(count) count.textContent='0/'+missionIds.length;
}
function sanitizeExpression(raw){let s=String(raw||'').trim().toLowerCase();s=s.replace(/,/g,'.').replace(/π/g,'3').replace(/\bpi\b/g,'3').replace(/[×x·]/g,'*').replace(/[÷:]/g,'/').replace(/\^/g,'**');if(!/^[0-9+\-*/().\s]+$/.test(s))throw new Error();return s}
function safeEvaluate(raw){const s=sanitizeExpression(raw);if(!s||s.length>180)throw new Error();const value=Function('"use strict";return ('+s+')')();if(!Number.isFinite(value))throw new Error();return value}
function extractNumbers(raw){const s=String(raw||'').replace(/,/g,'.').replace(/π/gi,'3').replace(/\bpi\b/gi,'3');return (s.match(/\d+(?:\.\d+)?/g)||[]).map(Number)}
function containsRequiredNumbers(raw,required){const nums=extractNumbers(raw);return required.every(req=>nums.some(n=>Math.abs(n-req)<1e-9))}
function procedureUsesEssentialData(id,raw){const d=missionData[id];if(containsRequiredNumbers(raw,d.required))return true;return Array.isArray(d.alternatives)&&d.alternatives.some(set=>containsRequiredNumbers(raw,set))}
function validateProcedure(id){
  ensureMissionData();const input=document.getElementById('procedure-'+id),fb=document.getElementById('procedureFeedback-'+id),d=missionData[id];
  sessionStats[id]=sessionStats[id]||{attempts:0,hints:0,procedureAttempts:0};sessionStats[id].procedureAttempts++;
  const rec=missionRecord(id);if(rec){rec.procedure=input.value;rec.procedureAttempts=sessionStats[id].procedureAttempts;rec.expected=d.expected;}
  persistStats();
  try{
    const value=safeEvaluate(input.value),usesData=procedureUsesEssentialData(id,input.value),equivalent=Math.abs(value-d.expected)<1e-9;
    if(rec) rec.procedureCorrect=equivalent&&usesData;
    persistSession();
    if(equivalent&&usesData){fb.className='feedback show ok';fb.textContent='Procedimiento compatible. A.R.I.A. habilitó el ingreso del resultado final.';document.getElementById('resultStep-'+id).classList.remove('locked');if(soundOn)successSound()}
    else if(equivalent){fb.className='feedback show bad';fb.textContent='La expresión llega al valor esperado, pero no registra los datos esenciales del plano.'}
    else{fb.className='feedback show bad';fb.textContent='La expresión no representa todavía la superficie solicitada. Revisá signos, paréntesis y orden de operaciones.'}
  }catch(e){if(rec) rec.procedureCorrect=false;persistSession();fb.className='feedback show bad';fb.textContent='No pude interpretar la expresión. Usá números, +, −, *, / y paréntesis.'}
  queueSessionUpdate();
}
function validateMissionResult(id){
  ensureMissionData();const input=document.getElementById('answer-'+id),value=normalize(input.value),fb=document.getElementById('feedback-'+id),expected=missionData[id].expected;
  sessionStats[id]=sessionStats[id]||{attempts:0,hints:0,procedureAttempts:0};sessionStats[id].attempts++;
  const rec=missionRecord(id);if(rec){rec.answer=input.value;rec.answerAttempts=sessionStats[id].attempts;rec.expected=expected;}
  persistStats();
  if(Math.abs(value-expected)<1e-9){
    fb.className='feedback show ok';fb.textContent='Resultado compatible. Módulo recuperado. Regresando al mapa…';progress[id]=true;sessionStats[id].completed=true;
    sessionStats[id].timeMs=(sessionStats[id].timeMs||0)+(Date.now()-(missionOpenedAt[id]||Date.now()));
    if(rec){rec.answerCorrect=true;rec.timeMs=sessionStats[id].timeMs;}
    persistStats();save();if(soundOn)successSound();setTimeout(() => go('map'), CRIOS_CONFIG.missionReturnDelayMs)
  }else{
    if(rec) rec.answerCorrect=false;persistSession();fb.className='feedback show bad';fb.textContent='El resultado no coincide con la simulación. Revisá el procedimiento antes de volver a intentarlo.'
  }
  queueSessionUpdate();
}
function registerHint(id){if(hintRegistered[id])return;hintRegistered[id]=true;sessionStats[id]=sessionStats[id]||{attempts:0,hints:0,procedureAttempts:0};sessionStats[id].hints++;const rec=missionRecord(id);if(rec) rec.hintUsed=true;persistStats();persistSession();queueSessionUpdate()}
function persistStats(){writeJson(sessionStorage, STORAGE.sessionStats, sessionStats);persistSession()}
function getFinalExpected(){ensureMissionData();return missionIds.reduce((sum,id)=>sum+missionData[id].expected,0)-missionData.adjustMinus+missionData.adjustPlus}
function renderFinal(){
  ensureMissionData();
  document.getElementById('finalSystems').innerHTML=missionIds.map(id=>obtenerMision(id).nombreCorto.toUpperCase()+' = '+missionData[id].expected+' m²').join('<br>')+`<br>AJUSTES = −${missionData.adjustMinus} m² + ${missionData.adjustPlus} m²`;
  document.getElementById('finalInstruction').innerHTML=`Sumen las ${missionIds.length} superficies recuperadas. Luego resten <strong>${missionData.adjustMinus} m²</strong> de corredores aislados y agreguen <strong>${missionData.adjustPlus} m²</strong> de reserva térmica.`;
}
function validateFinalProcedure(){
  ensureMissionData();const raw=document.getElementById('finalProcedure').value,fb=document.getElementById('finalProcedureFeedback'),expected=getFinalExpected(),required=[...missionIds.map(id=>missionData[id].expected),missionData.adjustMinus,missionData.adjustPlus];
  if(sessionData){sessionData.final=sessionData.final||{};sessionData.final.procedureAttempts=(sessionData.final.procedureAttempts||0)+1;sessionData.final.procedure=raw;sessionData.final.expected=expected;}
  try{
    const value=safeEvaluate(raw),ok=Math.abs(value-expected)<1e-9&&containsRequiredNumbers(raw,required);
    if(sessionData) sessionData.final.procedureCorrect=ok;persistSession();
    if(ok){fb.className='feedback show ok';fb.textContent='Procedimiento final compatible. Secuencia de estabilización habilitada.';document.getElementById('finalResultStep').classList.remove('locked');if(soundOn)successSound()}
    else if(Math.abs(value-expected)<1e-9){fb.className='feedback show bad';fb.textContent='El valor coincide, pero faltan datos esenciales de los módulos o de los ajustes.'}
    else{fb.className='feedback show bad';fb.textContent='La expresión final no coincide con la red de superficies recuperadas.'}
  }catch(e){if(sessionData) sessionData.final.procedureCorrect=false;persistSession();fb.className='feedback show bad';fb.textContent='No pude interpretar la expresión final.'}
  queueSessionUpdate();
}


let introActivated=false;
let introReady=false;

async function activateIntro(){
  if(!introReady||introActivated) return;
  introActivated=true;

  const intro=document.getElementById('intro');
  intro.classList.remove('intro-ready');
  intro.classList.add('connection-started');
  const prompt=document.getElementById('tapPrompt');
  if(prompt) prompt.textContent='SEÑAL RECIBIDA';

  audioCtx=audioCtx||new (window.AudioContext||window.webkitAudioContext)();
  if(audioCtx.state==='suspended'){
    try{ await audioCtx.resume(); }catch(e){}
  }

  startAmbientAudio();

  // Secuencia audible de arranque
  beep(180,.18,.08);
  setTimeout(()=>beep(360,.12,.07),220);
  setTimeout(()=>beep(540,.12,.065),430);
  setTimeout(()=>successSound(),650);

  setTimeout(()=>{
      intro.classList.add('connection-fading');
    },1750);
    setTimeout(()=>go('aria'),2850);
}

const bootStart=performance.now();
const bootDuration=4100;
const bootFill=document.getElementById('bootProgressFill');
const bootBox=bootFill?bootFill.parentElement:null;
function animateBootProgress(now){
  const pct=Math.min(100,Math.max(0,((now-bootStart)/bootDuration)*100));
  if(bootFill) bootFill.style.transform='scaleX('+(pct/100)+')';
  if(bootBox) bootBox.setAttribute('aria-valuenow',String(Math.round(pct)));
  if(pct<100){
    requestAnimationFrame(animateBootProgress);
  }else{
    introReady=true;
    const intro=document.getElementById('intro');
    intro.classList.add('intro-ready');
    const prompt=document.getElementById('tapPrompt');
    if(prompt) prompt.textContent='TOCÁ CUALQUIER PUNTO PARA ESTABLECER LA CONEXIÓN';
  }
}
requestAnimationFrame(animateBootProgress);

document.getElementById('intro').addEventListener('pointerdown',activateIntro);
document.getElementById('intro').addEventListener('keydown',(event)=>{
  if(event.key==='Enter'||event.key===' '){
    event.preventDefault();
    activateIntro();
  }
});
document.getElementById('intro').setAttribute('tabindex','0');
document.getElementById('intro').setAttribute('role','button');
document.getElementById('intro').setAttribute('aria-label','Tocar para establecer la conexión');

setupMissionUI();
actualizarCabeceraCampana();
renderCampaignSelector();
updateMap();
loadUserName();
loadGroups();
retryPendingResult();
window.addEventListener('online',retryPendingResult);
window.addEventListener('pagehide',sendExitSnapshot);
document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState==='hidden') sendExitSnapshot();
});



function fitCriosToViewport(){
  const app=document.querySelector('.app');
  if(!app) return;
  const { width: designW, height: designH } = CRIOS_CONFIG.designViewport;
  const scale=Math.min(window.innerWidth/designW,window.innerHeight/designH);
  const left=(window.innerWidth-designW*scale)/2;
  const top=(window.innerHeight-designH*scale)/2;
  app.style.transform=`scale(${scale})`;
  app.style.left=`${left}px`;
  app.style.top=`${top}px`;
}
window.addEventListener('resize',fitCriosToViewport);
window.addEventListener('orientationchange',()=>setTimeout(fitCriosToViewport,120));
fitCriosToViewport();
updateAudioButton();
updateFullscreenButton();

const publicApi = Object.freeze({
  go,
  openMission,
  validateProcedure,
  validateMissionResult,
  registerHint,
  validateFinalProcedure,
  validateFinal,
  resetProgress,
  identifyUser,
  loadGroups,
  toggleFullscreen,
  toggleAmbientAudio,
  abrirSelectorCampanas,
  seleccionarCampana,
  detalleCampana
});

Object.assign(window, publicApi);
window.CRIOS = Object.freeze({
  version: CRIOS_VERSION,
  obtenerCampanaActiva: () => campanaActiva,
  obtenerMisionesActivas: () => Object.freeze([...missionIds]),
  listarCampanas: () => Object.freeze([...listarCampanas()]),
  api: publicApi
});

})();
