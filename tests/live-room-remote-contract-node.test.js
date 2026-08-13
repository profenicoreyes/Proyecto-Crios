const fs=require('fs'),path=require('path'),vm=require('vm');
const repo=process.argv[2]||path.resolve(__dirname,'..');
const ctx={window:{},console,Date,Object,Array,String,Number,Boolean,Math,JSON,RegExp,Error,Uint8Array};vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(repo,'js/live-room/remote/live-room-contract.js'),'utf8'),ctx);
const c=ctx.window.CRIOS_REMOTE_LIVE_ROOM_CONTRACT;
let total=0,failed=0;
function ok(v,m){total++;if(!v){failed++;console.error('FAIL '+m)}}
function eq(a,b,m){ok(JSON.stringify(a)===JSON.stringify(b),m+' expected='+JSON.stringify(b)+' actual='+JSON.stringify(a))}
function throws(fn,code,m){let e=null;try{fn()}catch(x){e=x}ok(Boolean(e)&&e.code===code,m)}
const token='a'.repeat(64), iso='2026-08-13T20:00:00.000Z', exp='2026-08-13T20:10:00.000Z';
const room={roomId:'room-1',campaignId:'campaign-1',publicationId:'pub-1',createdAt:iso,lastActivityAt:iso,expiresAt:exp,status:'active'};
const host={roomId:'room-1',participantId:'host-1',role:'host',joinedAt:iso,lastSeenAt:iso};

ok(c.version==='1.0.0','version');ok(c.protocolVersion==='1.0','protocol');ok(c.idleTimeoutMs===600000,'timeout');ok(c.maxParticipants===64,'cap');
eq(c.operations,{CREATE:'createLiveRoom',JOIN:'joinLiveRoom',HEARTBEAT:'heartbeatLiveRoom',GET:'getLiveRoom'},'ops');
ok(!Object.values(c.operations).includes('deleteLiveRoom'),'no delete');ok(!Object.values(c.operations).includes('activateLiveRoom'),'no activate');

const create=c.createLiveRoomRequest({campaignId:'campaign-1',publicationId:'pub-1',participantId:'host-1',capabilityToken:token},'r1');
ok(Object.isFrozen(create)&&Object.isFrozen(create.payload),'create frozen');ok(c.validateRequest(create).valid,'create valid');eq(create.operation,'createLiveRoom','create op');
const join=c.createJoinLiveRoomRequest({roomId:'room-1',participantId:'p1',capabilityToken:token},'r2');ok(c.validateRequest(join).valid,'join valid');eq(join.operation,'joinLiveRoom','join op');
const hb=c.createHeartbeatLiveRoomRequest({roomId:'room-1',participantId:'p1',capabilityToken:token},'r3');ok(c.validateRequest(hb).valid,'hb valid');eq(hb.operation,'heartbeatLiveRoom','hb op');
const get=c.createGetLiveRoomRequest('room-1','r4');ok(c.validateRequest(get).valid,'get valid');eq(get.operation,'getLiveRoom','get op');

throws(()=>c.createLiveRoomRequest({campaignId:'',publicationId:'pub-1',participantId:'h',capabilityToken:token},'x'),'INVALID_REQUEST','empty campaign');
ok(!c.validateRequest({protocolVersion:'1.0',operation:'createLiveRoom',requestId:'x',payload:{campaignId:' campaign',publicationId:'pub-1',participantId:'h',capabilityToken:token}}).valid,'whitespace campaign rejected by validator');
throws(()=>c.createLiveRoomRequest({campaignId:'campaign',publicationId:'',participantId:'h',capabilityToken:token},'x'),'INVALID_REQUEST','empty publication');
throws(()=>c.createLiveRoomRequest({campaignId:'campaign',publicationId:'pub',participantId:'',capabilityToken:token},'x'),'INVALID_REQUEST','empty participant');
throws(()=>c.createLiveRoomRequest({campaignId:'campaign',publicationId:'pub',participantId:'h',capabilityToken:'short'},'x'),'INVALID_REQUEST','short capability');
throws(()=>c.createJoinLiveRoomRequest({roomId:'',participantId:'p',capabilityToken:token},'x'),'INVALID_REQUEST','empty room join');
throws(()=>c.createHeartbeatLiveRoomRequest({roomId:'room',participantId:'',capabilityToken:token},'x'),'INVALID_REQUEST','empty heartbeat participant');
throws(()=>c.createGetLiveRoomRequest('','x'),'INVALID_REQUEST','empty get room');

ok(!c.validateRequest({protocolVersion:'2',operation:'getLiveRoom',requestId:'x',payload:{roomId:'r'}}).valid,'protocol reject');
ok(!c.validateRequest({protocolVersion:'1.0',operation:'deleteLiveRoom',requestId:'x',payload:{}}).valid,'unknown operation reject');
ok(!c.validateRequest({protocolVersion:'1.0',operation:'getLiveRoom',requestId:'x',payload:{roomId:'r',extra:1}}).valid,'extra request key reject');

const success={protocolVersion:'1.0',operation:'createLiveRoom',requestId:'r1',success:true,data:{room,presence:host},error:null};
ok(c.validateResponse(success,create).valid,'create response valid');let parsed=c.parseResponse(success,create);ok(parsed.accepted&&parsed.response.success,'parse success');ok(Object.isFrozen(parsed.response),'parsed frozen');
const getSuccess={protocolVersion:'1.0',operation:'getLiveRoom',requestId:'r4',success:true,data:{room},error:null};ok(c.validateResponse(getSuccess,get).valid,'get response valid');
const expired={protocolVersion:'1.0',operation:'getLiveRoom',requestId:'r4',success:false,data:null,error:{code:'ROOM_EXPIRED',message:'Esta sesión finalizó por inactividad.',retryable:false}};ok(c.validateResponse(expired,get).valid,'expired response valid');parsed=c.parseResponse(expired,get);ok(parsed.accepted&&!parsed.response.success,'parse error accepted');

const badRoom={...room,expiresAt:'2026-08-13T20:09:59.999Z'};ok(!c.validateResponse({...getSuccess,data:{room:badRoom}},get).valid,'expiry invariant');
ok(!c.validateResponse({...success,requestId:'other'},create).valid,'request id mismatch');ok(!c.validateResponse({...success,operation:'joinLiveRoom'},create).valid,'operation mismatch');
ok(!c.validateResponse({...success,data:{room:{...room,capabilityToken:token},presence:host}},create).valid,'room secret rejected');
ok(!c.validateResponse({...success,data:{room,presence:{...host,capabilityToken:token}}},create).valid,'presence secret rejected');
ok(!c.validateResponse({...expired,error:{...expired.error,code:'UNKNOWN'}},get).valid,'unknown error reject');
ok(!c.validateResponse({...expired,error:{...expired.error,retryable:'no'}},get).valid,'retryable type reject');
ok(!c.validateResponse({...getSuccess,data:{room:{...room,status:'closed'}}},get).valid,'unknown room status');
ok(!c.validateResponse({...success,data:{room,presence:{...host,role:'teacher'}}},create).valid,'unknown role');
ok(!c.validateResponse({...success,data:{room,presence:{...host,roomId:'other'}}},create).valid,'presence room mismatch');

for(const code of Object.values(c.errorCodes)) ok(typeof code==='string'&&code.length>0,'error code '+code);
ok(c.limits.MIN_CAPABILITY_LENGTH===32,'cap min');ok(c.limits.MAX_CAPABILITY_LENGTH===256,'cap max');ok(c.limits.MAX_ROOM_ID_LENGTH===160,'room id max');

if(failed){console.error('LIVE_ROOM_REMOTE_CONTRACT_TEST_STATUS=FAIL');console.error('LIVE_ROOM_REMOTE_CONTRACT_TEST_TOTAL='+total);console.error('LIVE_ROOM_REMOTE_CONTRACT_TEST_FAILED='+failed);process.exit(1)}
console.log('LIVE_ROOM_REMOTE_CONTRACT_TEST_STATUS=PASS');console.log('LIVE_ROOM_REMOTE_CONTRACT_TEST_TOTAL='+total);console.log('LIVE_ROOM_REMOTE_CONTRACT_TEST_FAILED=0');
