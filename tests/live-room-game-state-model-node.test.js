const fs=require('fs'),path=require('path'),vm=require('vm');
const repo=process.argv[2]||path.resolve(__dirname,'..');
const context={window:{},console,Date,Object,Array,String,Number,Boolean,Math,JSON,RegExp,Error,Set,Map};
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(repo,'js/live-room/live-room-game-state-model.js'),'utf8'),context);
const model=context.window.CRIOS_LIVE_ROOM_GAME_STATE_MODEL;
let total=0,failed=0;
function ok(value,message){total++;if(!value){failed++;console.error('FAIL '+message)}}
function eq(actual,expected,message){ok(JSON.stringify(actual)===JSON.stringify(expected),message+' expected='+JSON.stringify(expected)+' actual='+JSON.stringify(actual))}
function throws(fn,text,message){let error=null;try{fn()}catch(caught){error=caught}ok(Boolean(error)&&String(error.message).includes(text),message)}

const order=['energy','greenhouse','ice','hangar'];
const createdAt='2026-08-18T12:00:00.000Z';
const input={roomId:'room-1',campaignId:'campaign-1',publicationId:'publication-1',missionOrder:order,createdAt};
const initial=model.createGameState(input);

ok(model.VERSION==='1.0.0','model version');
ok(model.SCHEMA_VERSION==='1.0','schema version');
eq(initial,{schemaVersion:'1.0',roomId:'room-1',campaignId:'campaign-1',publicationId:'publication-1',revision:0,completedMissionIds:[],updatedAt:createdAt},'initial snapshot');
ok(Object.isFrozen(initial)&&Object.isFrozen(initial.completedMissionIds),'initial snapshot deeply frozen');
ok(model.validateGameState(initial,order)===initial,'initial snapshot validates');
ok(model.validateMissionOrder([]).length===0,'empty publication order remains structurally valid');

const energyResult=model.completeMission(initial,{missionId:'energy',missionOrder:order,completedAt:'2026-08-18T12:01:00.000Z'});
ok(energyResult.changed===true,'first completion changes state');
eq(energyResult.state.completedMissionIds,['energy'],'first completion recorded');
ok(energyResult.state.revision===1,'first completion increments revision once');
ok(energyResult.state.updatedAt==='2026-08-18T12:01:00.000Z','first completion uses server timestamp');
ok(Object.isFrozen(energyResult)&&Object.isFrozen(energyResult.state)&&Object.isFrozen(energyResult.state.completedMissionIds),'completion result deeply frozen');
ok(initial.revision===0&&initial.completedMissionIds.length===0,'completion does not mutate source');

const duplicate=model.completeMission(energyResult.state,{missionId:'energy',missionOrder:order,completedAt:'2026-08-18T12:02:00.000Z'});
ok(duplicate.changed===false,'duplicate completion is idempotent');
eq(duplicate.state,energyResult.state,'duplicate completion preserves snapshot exactly');

const hangar=model.completeMission(energyResult.state,{missionId:'hangar',missionOrder:order,completedAt:'2026-08-18T12:03:00.000Z'}).state;
const greenhouse=model.completeMission(hangar,{missionId:'greenhouse',missionOrder:order,completedAt:'2026-08-18T12:04:00.000Z'}).state;
eq(greenhouse.completedMissionIds,['energy','greenhouse','hangar'],'completion order follows publication rather than arrival');
ok(greenhouse.revision===3,'revision equals unique completion count');

throws(()=>model.createGameState({...input,extra:true}),'forma no permitida','create rejects extra fields');
throws(()=>model.createGameState({...input,roomId:' room-1'}),'no normalizado','create rejects non-normalized identity');
throws(()=>model.createGameState({...input,createdAt:'2026-08-18 12:00:00'}),'ISO canónica','create rejects non-canonical time');
throws(()=>model.createGameState({...input,missionOrder:['energy','energy']}),'duplicados','mission order rejects duplicates');
throws(()=>model.createGameState({...input,missionOrder:['energy',' bad']}),'no normalizado','mission order rejects non-normalized ids');
throws(()=>model.completeMission(initial,{missionId:'unknown',missionOrder:order,completedAt:'2026-08-18T12:01:00.000Z'}),'no pertenece','completion rejects mission outside publication');
throws(()=>model.completeMission(energyResult.state,{missionId:'ice',missionOrder:order,completedAt:createdAt}),'no puede retroceder','completion time cannot move backward');
throws(()=>model.completeMission(initial,{missionId:'energy',missionOrder:order,completedAt:'2026-08-18T12:01:00.000Z',answer:'42'}),'forma no permitida','completion rejects answer data');

throws(()=>model.validateGameState({...initial,extra:true},order),'forma no permitida','state rejects extra fields');
throws(()=>model.validateGameState({...initial,schemaVersion:'2.0'},order),'no soportada','state rejects unknown schema');
throws(()=>model.validateGameState({...energyResult.state,revision:0},order),'cantidad','state rejects revision/count mismatch');
throws(()=>model.validateGameState({...energyResult.state,completedMissionIds:['energy','energy'],revision:2},order),'duplicados','state rejects duplicate completions');
throws(()=>model.validateGameState({...greenhouse,completedMissionIds:['greenhouse','energy','hangar']},order),'orden canónico','state rejects non-canonical completion order');
throws(()=>model.validateGameState({...energyResult.state,completedMissionIds:['unknown']},order),'ajena','state rejects completion outside publication');
throws(()=>model.validateGameState({...initial,updatedAt:'invalid'},order),'ISO canónica','state rejects invalid timestamp');
throws(()=>model.validateGameState({...initial,studentSession:{}},order),'forma no permitida','state rejects StudentSession data');

const ice=model.completeMission(energyResult.state,{missionId:'ice',missionOrder:order,completedAt:'2026-08-18T12:05:00.000Z'}).state;
let reconciled=model.reconcileGameState(energyResult.state,ice,order);
ok(reconciled.changed===true,'higher revision is applied');
eq(reconciled.state,ice,'higher revision becomes current');
reconciled=model.reconcileGameState(ice,energyResult.state,order);
ok(reconciled.changed===false,'lower revision is ignored');
eq(reconciled.state,ice,'lower revision cannot regress state');
reconciled=model.reconcileGameState(ice,{...ice,completedMissionIds:ice.completedMissionIds.slice()},order);
ok(reconciled.changed===false,'identical revision is idempotent');

const greenhouseBranch=model.completeMission(initial,{missionId:'greenhouse',missionOrder:order,completedAt:'2026-08-18T12:01:30.000Z'}).state;
throws(()=>model.reconcileGameState(energyResult.state,greenhouseBranch,order),'misma revision','equal revision divergence rejected');
const branchAhead=model.completeMission(greenhouseBranch,{missionId:'hangar',missionOrder:order,completedAt:'2026-08-18T12:06:00.000Z'}).state;
throws(()=>model.reconcileGameState(energyResult.state,branchAhead,order),'perder misiones','higher revision must be a superset');
throws(()=>model.reconcileGameState(energyResult.state,{...ice,roomId:'room-2'},order),'cruzar sala','room identity cannot change');
throws(()=>model.reconcileGameState(energyResult.state,{...ice,updatedAt:createdAt},order),'retroceder updatedAt','higher revision time cannot regress');

console.log('LIVE_ROOM_GAME_STATE_MODEL_TEST_STATUS='+(failed?'FAIL':'PASS'));
console.log('LIVE_ROOM_GAME_STATE_MODEL_TEST_TOTAL='+total);
console.log('LIVE_ROOM_GAME_STATE_MODEL_TEST_FAILED='+failed);
console.log('LIVE_ROOM_GAME_STATE_MODEL_STUDENT_SESSION_SEPARATION=true');
if(failed)process.exit(1);
