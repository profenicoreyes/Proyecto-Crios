const fs=require('fs'),path=require('path'),vm=require('vm');
const repo=process.argv[2]||path.resolve(__dirname,'..');
const context={window:{},console,Date,Object,Array,String,Number,Boolean,Math,JSON,RegExp,Error};
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(repo,'js/live-room/remote/live-room-game-state-contract.js'),'utf8'),context);
const contract=context.window.CRIOS_REMOTE_LIVE_ROOM_GAME_STATE_CONTRACT;
let total=0,failed=0;
function ok(value,message){total++;if(!value){failed++;console.error('FAIL '+message)}}
function eq(actual,expected,message){ok(JSON.stringify(actual)===JSON.stringify(expected),message+' expected='+JSON.stringify(expected)+' actual='+JSON.stringify(actual))}
function throws(fn,code,message){let error=null;try{fn()}catch(caught){error=caught}ok(Boolean(error)&&error.code===code,message)}

const token='a'.repeat(64);
const participant={roomId:'room-1',participantId:'player-1',capabilityToken:token};
const initial={schemaVersion:'1.0',roomId:'room-1',campaignId:'campaign-1',publicationId:'publication-1',revision:0,completedMissionIds:[],updatedAt:'2026-08-18T12:00:00.000Z'};
const completed={...initial,revision:1,completedMissionIds:['energy'],updatedAt:'2026-08-18T12:01:00.000Z'};

ok(contract.version==='1.0.0','contract version');
ok(contract.protocolVersion==='1.0','shared LiveRoom protocol version');
ok(contract.gameStateSchemaVersion==='1.0','game-state schema version');
eq(contract.operations,{GET:'getLiveRoomGameState',COMPLETE_MISSION:'completeLiveRoomMission'},'operation set is exact');
ok(Object.isFrozen(contract.operations)&&Object.isFrozen(contract.errorCodes)&&Object.isFrozen(contract.limits),'constants frozen');
ok(!Object.values(contract.operations).includes('putLiveRoomGameState'),'no generic state replacement');
ok(!Object.values(contract.operations).includes('resetLiveRoomProgress'),'no reset operation');

const getRequest=contract.createGetLiveRoomGameStateRequest(participant,'get-1');
ok(contract.validateRequest(getRequest).valid,'authenticated get request valid');
ok(getRequest.operation==='getLiveRoomGameState','get operation');
ok(Object.isFrozen(getRequest)&&Object.isFrozen(getRequest.payload),'get request deeply frozen');
eq(Object.keys(getRequest.payload).sort(),['capabilityToken','participantId','roomId'],'get payload excludes publication and state');

const completeRequest=contract.createCompleteLiveRoomMissionRequest({...participant,missionId:'energy'},'complete-1');
ok(contract.validateRequest(completeRequest).valid,'completion request valid');
ok(completeRequest.operation==='completeLiveRoomMission','completion operation');
ok(Object.isFrozen(completeRequest)&&Object.isFrozen(completeRequest.payload),'completion request deeply frozen');
eq(Object.keys(completeRequest.payload).sort(),['capabilityToken','missionId','participantId','roomId'],'completion payload is minimal');
ok(!Object.prototype.hasOwnProperty.call(completeRequest.payload,'expectedRevision'),'completion has no compare-and-swap field');

throws(()=>contract.createGetLiveRoomGameStateRequest({...participant,roomId:''},'x'),'INVALID_REQUEST','empty room rejected');
throws(()=>contract.createGetLiveRoomGameStateRequest({...participant,participantId:''},'x'),'INVALID_REQUEST','empty participant rejected');
throws(()=>contract.createGetLiveRoomGameStateRequest({...participant,capabilityToken:'short'},'x'),'INVALID_REQUEST','short capability rejected');
throws(()=>contract.createCompleteLiveRoomMissionRequest({...participant,missionId:''},'x'),'INVALID_REQUEST','empty mission rejected');
ok(contract.createCompleteLiveRoomMissionRequest({...participant,missionId:' energy '},'x').payload.missionId==='energy','builder normalizes mission id');
throws(()=>contract.createCompleteLiveRoomMissionRequest({...participant,missionId:'energy'},''),'INVALID_REQUEST','empty request id rejected');

ok(!contract.validateRequest({protocolVersion:'2.0',operation:'getLiveRoomGameState',requestId:'x',payload:participant}).valid,'unsupported protocol rejected');
ok(!contract.validateRequest({protocolVersion:'1.0',operation:'putLiveRoomGameState',requestId:'x',payload:{}}).valid,'unknown operation rejected');
ok(!contract.validateRequest({protocolVersion:'1.0',operation:'getLiveRoomGameState',requestId:'x',payload:{...participant,extra:true}}).valid,'extra get payload rejected');
ok(!contract.validateRequest({protocolVersion:'1.0',operation:'completeLiveRoomMission',requestId:'x',payload:{...participant,missionId:'energy',answer:'42'}}).valid,'answer data rejected');
ok(!contract.validateRequest({protocolVersion:'1.0',operation:'completeLiveRoomMission',requestId:'x',payload:{...participant,missionId:' energy '}}).valid,'non-normalized mission payload rejected');
ok(!contract.validateRequest({protocolVersion:'1.0',operation:'completeLiveRoomMission',requestId:'x',payload:{...participant,missionId:'energy',expectedRevision:0}}).valid,'expected revision rejected');

const getSuccess={protocolVersion:'1.0',operation:'getLiveRoomGameState',requestId:'get-1',success:true,data:{gameState:initial},error:null};
ok(contract.validateResponse(getSuccess,getRequest).valid,'get success valid');
let parsed=contract.parseResponse(getSuccess,getRequest);
ok(parsed.accepted&&parsed.response.success,'get response parsed');
ok(Object.isFrozen(parsed.response)&&Object.isFrozen(parsed.response.data)&&Object.isFrozen(parsed.response.data.gameState)&&Object.isFrozen(parsed.response.data.gameState.completedMissionIds),'parsed get response deeply frozen');
const prototypeIdState={...initial,revision:1,completedMissionIds:['__proto__'],updatedAt:'2026-08-18T12:00:30.000Z'};
ok(contract.validateResponse({...getSuccess,data:{gameState:prototypeIdState}},getRequest).valid,'mission ids cannot collide with object prototype');

const completeSuccess={protocolVersion:'1.0',operation:'completeLiveRoomMission',requestId:'complete-1',success:true,data:{gameState:completed,changed:true},error:null};
ok(contract.validateResponse(completeSuccess,completeRequest).valid,'changed completion response valid');
parsed=contract.parseResponse(completeSuccess,completeRequest);
ok(parsed.accepted&&parsed.response.data.changed===true,'completion response parsed');
const duplicateSuccess={...completeSuccess,data:{gameState:completed,changed:false}};
ok(contract.validateResponse(duplicateSuccess,completeRequest).valid,'idempotent no-op response valid');

const expired={protocolVersion:'1.0',operation:'getLiveRoomGameState',requestId:'get-1',success:false,data:null,error:{code:'ROOM_EXPIRED',message:'Esta sesión finalizó por inactividad.',retryable:false}};
ok(contract.validateResponse(expired,getRequest).valid,'expired response valid');
const playerRequired={protocolVersion:'1.0',operation:'completeLiveRoomMission',requestId:'complete-1',success:false,data:null,error:{code:'PLAYER_REQUIRED',message:'Only a player can complete a LiveRoom mission.',retryable:false}};
ok(contract.validateResponse(playerRequired,completeRequest).valid,'player-required response valid');
const missionUnavailable={...playerRequired,error:{code:'MISSION_UNAVAILABLE',message:'Mission is unavailable for this LiveRoom publication.',retryable:false}};
ok(contract.validateResponse(missionUnavailable,completeRequest).valid,'mission-unavailable response valid');

ok(!contract.validateResponse({...getSuccess,data:{gameState:{...initial,extra:true}}},getRequest).valid,'state extra field rejected');
ok(!contract.validateResponse({...getSuccess,data:{gameState:{...initial,schemaVersion:'2.0'}}},getRequest).valid,'state schema rejected');
ok(!contract.validateResponse({...getSuccess,data:{gameState:{...initial,revision:1}}},getRequest).valid,'revision/count mismatch rejected');
ok(!contract.validateResponse({...completeSuccess,data:{gameState:{...completed,completedMissionIds:['energy','energy'],revision:2},changed:true}},completeRequest).valid,'duplicate mission ids rejected');
ok(!contract.validateResponse({...completeSuccess,data:{gameState:{...completed,completedMissionIds:['ice']},changed:true}},completeRequest).valid,'response must contain requested mission');
ok(!contract.validateResponse({...completeSuccess,data:{gameState:{...completed,roomId:'room-2'},changed:true}},completeRequest).valid,'response room must match request');
ok(!contract.validateResponse({...completeSuccess,data:{gameState:completed,changed:'yes'}},completeRequest).valid,'changed must be boolean');
ok(!contract.validateResponse({...completeSuccess,data:{gameState:{...completed,answers:{energy:'42'}},changed:true}},completeRequest).valid,'answers rejected from state');
ok(!contract.validateResponse({...completeSuccess,requestId:'other'},completeRequest).valid,'response request id mismatch rejected');
ok(!contract.validateResponse({...expired,error:{...expired.error,code:'UNKNOWN'}},getRequest).valid,'unknown error code rejected');
ok(!contract.validateResponse({...expired,error:{...expired.error,retryable:'no'}},getRequest).valid,'retryable must be boolean');
let malformedRequestValidation=null;
try{malformedRequestValidation=contract.validateResponse(getSuccess,{operation:'getLiveRoomGameState',requestId:'get-1'})}catch(error){malformedRequestValidation=null}
ok(Boolean(malformedRequestValidation)&&!malformedRequestValidation.valid,'malformed reference request cannot crash response validation');

for(const code of Object.values(contract.errorCodes))ok(typeof code==='string'&&code.length>0,'error code '+code);
ok(contract.limits.MIN_CAPABILITY_LENGTH===32,'capability minimum');
ok(contract.limits.MAX_CAPABILITY_LENGTH===256,'capability maximum');
ok(contract.limits.MAX_MISSION_ID_LENGTH===160,'mission id maximum');

console.log('LIVE_ROOM_GAME_STATE_REMOTE_CONTRACT_TEST_STATUS='+(failed?'FAIL':'PASS'));
console.log('LIVE_ROOM_GAME_STATE_REMOTE_CONTRACT_TEST_TOTAL='+total);
console.log('LIVE_ROOM_GAME_STATE_REMOTE_CONTRACT_TEST_FAILED='+failed);
console.log('LIVE_ROOM_GAME_STATE_REMOTE_CONTRACT_SIGNAL_ONLY=true');
if(failed)process.exit(1);
