'use strict';

const fs=require('fs'),path=require('path'),vm=require('vm'),crypto=require('crypto');

function displayValue(value){
  if(value==null)return '';
  if(value instanceof Date)return value.toISOString();
  const text=String(value);
  return text.startsWith("'")?text.slice(1):text;
}

class MockFinder{
  constructor(range,text){this.range=range;this.text=String(text);this.entire=false}
  matchEntireCell(value){this.entire=value;return this}
  findNext(){
    for(let row=0;row<this.range.numRows;row+=1){
      for(let column=0;column<this.range.numCols;column+=1){
        const realRow=this.range.row-1+row,realColumn=this.range.col-1+column;
        const value=displayValue(this.range.sheet.getCell(realRow,realColumn));
        if(this.entire?value===this.text:value.includes(this.text))return{getRow:()=>realRow+1,getColumn:()=>realColumn+1};
      }
    }
    return null;
  }
}

class MockRange{
  constructor(sheet,row,column,numRows=1,numCols=1){Object.assign(this,{sheet,row,col:column,numRows,numCols})}
  getDisplayValues(){
    const output=[];
    for(let row=0;row<this.numRows;row+=1){
      const values=[];
      for(let column=0;column<this.numCols;column+=1)values.push(displayValue(this.sheet.getCell(this.row-1+row,this.col-1+column)));
      output.push(values);
    }
    return output;
  }
  getDisplayValue(){return this.getDisplayValues()[0][0]}
  getValue(){return this.sheet.getCell(this.row-1,this.col-1)??''}
  setValues(values){
    if(values.length!==this.numRows)throw new Error('row mismatch');
    for(let row=0;row<this.numRows;row+=1){
      if(values[row].length!==this.numCols)throw new Error('column mismatch');
      for(let column=0;column<this.numCols;column+=1)this.sheet.setCell(this.row-1+row,this.col-1+column,values[row][column]);
    }
    return this;
  }
  setFontWeight(){return this}
  createTextFinder(text){return new MockFinder(this,text)}
}

class MockSheet{
  constructor(name){this.name=name;this.rows=[];this.frozen=0}
  getName(){return this.name}
  getCell(row,column){return(this.rows[row]||[])[column]}
  setCell(row,column,value){
    while(this.rows.length<=row)this.rows.push([]);
    while(this.rows[row].length<=column)this.rows[row].push('');
    this.rows[row][column]=value;
  }
  getLastRow(){
    let last=0;
    for(let row=0;row<this.rows.length;row+=1)if(this.rows[row].some(value=>value!==''&&value!=null))last=row+1;
    return last;
  }
  getRange(row,column,numRows=1,numCols=1){return new MockRange(this,row,column,numRows,numCols)}
  setFrozenRows(value){this.frozen=value}
}

class MockBook{
  constructor(){this.sheets=new Map()}
  getSheetByName(name){return this.sheets.get(name)||null}
  insertSheet(name){const sheet=new MockSheet(name);this.sheets.set(name,sheet);return sheet}
}

function publication(campaignId,publicationId,missionOrder,missionSpecs){
  return{publication:{campaignId,publicationId,content:{runtimeExecutionManifest:{missionOrder:missionOrder.slice()},missionSpecs:(missionSpecs||missionOrder.map(missionId=>({missionId})))}}};
}

const repo=path.resolve(process.argv[2]||path.join(__dirname,'..'));
const book=new MockBook();
let now='2026-08-18T12:00:00.000Z',uuid=0,lockHeld=0,lockWaits=0,lockReleases=0;
const order=['energy','greenhouse','ice','hangar'];
const publications=new Map([
  ['pub-1',publication('campaign-1','pub-1',order)],
  ['pub-bad',publication('campaign-bad','pub-bad',['energy'],[{missionId:'other'}])],
  ['pub-formula',publication('=campaign','pub-formula',['=mission'])]
]);

global.SpreadsheetApp={getActiveSpreadsheet:()=>book};
global.LockService={getScriptLock:()=>({waitLock(){lockHeld+=1;lockWaits+=1},releaseLock(){lockHeld-=1;lockReleases+=1}})};
global.Utilities={
  DigestAlgorithm:{SHA_256:'sha256'},Charset:{UTF_8:'utf8'},
  computeDigest(_algorithm,text){return Array.from(crypto.createHash('sha256').update(String(text),'utf8').digest()).map(value=>value>127?value-256:value)},
  getUuid(){uuid+=1;return`20000000-0000-4000-8000-${String(uuid).padStart(12,'0')}`}
};
global.ContentService={MimeType:{JSON:'json'},createTextOutput:text=>({text,setMimeType(){return this}})};
global.leerPublicacionVerificadaRemota=(_book,publicationId)=>publications.get(publicationId)||null;
global.esEnvelopePostPublicacionRemota=()=>false;
global.window=global;

for(const file of[
  'backend/google-apps-script/LiveRoomBackend.gs',
  'backend/google-apps-script/LiveRoomGameStateBackend.gs',
  'backend/google-apps-script/Code.gs'
])vm.runInThisContext(fs.readFileSync(path.join(repo,file),'utf8'),{filename:file});
global.ahoraIsoLiveRoomRemota=()=>now;

let total=0,failed=0;
function check(value,message){total+=1;if(!value){failed+=1;console.error('FAIL='+message)}}
function equal(actual,expected,message){check(JSON.stringify(actual)===JSON.stringify(expected),message+' actual='+JSON.stringify(actual)+' expected='+JSON.stringify(expected))}
function request(operation,requestId,payload){return{protocolVersion:'1.0',operation,requestId,payload}}
function token(seed){return`${seed}-`.padEnd(40,'x')}
function call(value){return procesarSolicitudLiveRoomRemota(value)}

equal(CRIOS_LIVE_ROOM_GAME_STATE_OPERATIONS,{GET:'getLiveRoomGameState',COMPLETE_MISSION:'completeLiveRoomMission'},'game-state operation set exact');
equal(CRIOS_LIVE_ROOM_GAME_STATE_HEADERS,['ROOM_ID','CAMPAIGN_ID','PUBLICATION_ID','SCHEMA_VERSION','REVISION','COMPLETED_MISSION_IDS_JSON','UPDATED_AT'],'state sheet headers exact');
equal(CRIOS_LIVE_ROOM_GAME_STATE_SCHEMA_VERSION,'1.0','state schema exact');
check(!Object.values(CRIOS_LIVE_ROOM_GAME_STATE_OPERATIONS).includes('putLiveRoomGameState'),'generic state replacement absent');
check(!Object.values(CRIOS_LIVE_ROOM_GAME_STATE_OPERATIONS).includes('resetLiveRoomProgress'),'progress reset absent');

const hostToken=token('host'),playerOneToken=token('player-one'),playerTwoToken=token('player-two');
const createRequest=request('createLiveRoom','create-1',{campaignId:'campaign-1',publicationId:'pub-1',participantId:'host-1',capabilityToken:hostToken});
let response=call(createRequest);
check(response.success,'room created through existing operation');
const roomId=response.data.room.roomId;

now='2026-08-18T12:01:00.000Z';
response=call(request('joinLiveRoom','join-1',{roomId,participantId:'player-1',capabilityToken:playerOneToken}));
check(response.success,'first player joined');
now='2026-08-18T12:02:00.000Z';
response=call(request('joinLiveRoom','join-2',{roomId,participantId:'player-2',capabilityToken:playerTwoToken}));
check(response.success,'second player joined');
const roomBeforeState={...leerLiveRoomRemota(book,roomId).room};
const playerOneBeforeState={...leerPresenciaLiveRoomRemota(book,roomId,'player-1').presence};
const requestSheet=book.getSheetByName('CRIOS_SALA_SOLICITUDES');
const requestsBeforeGet=requestSheet.getLastRow();

now='2026-08-18T12:02:30.000Z';
const hostGet=request('getLiveRoomGameState','state-get-host',{roomId,participantId:'host-1',capabilityToken:hostToken});
response=call(hostGet);
check(response.success,'host can read initial game state');
equal(response.data.gameState,{schemaVersion:'1.0',roomId,campaignId:'campaign-1',publicationId:'pub-1',revision:0,completedMissionIds:[],updatedAt:'2026-08-18T12:00:00.000Z'},'missing state row derives canonical revision zero');
equal(Object.keys(response.data),['gameState'],'get response contains only state');
check(!book.getSheetByName('CRIOS_SALA_ESTADO'),'state read does not create physical row');
equal(requestSheet.getLastRow(),requestsBeforeGet,'state read creates no idempotency record');
equal(leerLiveRoomRemota(book,roomId).room,roomBeforeState,'state read does not extend room activity');
equal(leerPresenciaLiveRoomRemota(book,roomId,'player-1').presence,playerOneBeforeState,'state read does not touch presence');
check(!JSON.stringify(response).includes(hostToken),'state read response omits capability');

response=call(request('getLiveRoomGameState','state-get-player',{roomId,participantId:'player-1',capabilityToken:playerOneToken}));
check(response.success&&response.data.gameState.revision===0,'player can read game state');
response=call(request('getLiveRoomGameState','state-get-wrong-cap',{roomId,participantId:'player-1',capabilityToken:token('wrong')}));
equal(response.error.code,'CAPABILITY_INVALID','state read requires matching capability');
response=call(request('getLiveRoomGameState','state-get-missing',{roomId,participantId:'missing',capabilityToken:token('missing')}));
equal(response.error.code,'PARTICIPANT_UNAVAILABLE','state read requires registered participant');
response=call(request('getLiveRoomGameState','state-get-public',{roomId}));
equal(response.error.code,'INVALID_REQUEST','room id alone cannot read state');
response=call(request('getLiveRoomGameState','state-get-extra',{roomId,participantId:'host-1',capabilityToken:hostToken,extra:true}));
equal(response.error.code,'INVALID_REQUEST','state get payload rejects extras');

response=JSON.parse(doPost({postData:{contents:JSON.stringify({liveRoomRequest:hostGet})}}).text);
check(response.success&&response.data.gameState.roomId===roomId,'Code.gs routes state operation through existing LiveRoom envelope');

now='2026-08-18T12:03:00.000Z';
response=call(request('completeLiveRoomMission','state-host-complete',{roomId,participantId:'host-1',capabilityToken:hostToken,missionId:'energy'}));
equal(response.error.code,'PLAYER_REQUIRED','host cannot complete mission');
check(!book.getSheetByName('CRIOS_SALA_ESTADO'),'rejected host command creates no state row');
response=call(request('completeLiveRoomMission','state-invalid-mission',{roomId,participantId:'player-1',capabilityToken:playerOneToken,missionId:'unknown'}));
equal(response.error.code,'MISSION_UNAVAILABLE','mission outside immutable publication rejected');
check(!book.getSheetByName('CRIOS_SALA_ESTADO'),'invalid mission creates no state row');
response=call(request('completeLiveRoomMission','state-cas-rejected',{roomId,participantId:'player-1',capabilityToken:playerOneToken,missionId:'energy',expectedRevision:0}));
equal(response.error.code,'INVALID_REQUEST','compare-and-swap field rejected');
response=call(request('completeLiveRoomMission','state-answer-rejected',{roomId,participantId:'player-1',capabilityToken:playerOneToken,missionId:'energy',answer:'42'}));
equal(response.error.code,'INVALID_REQUEST','answer data rejected');

now='2026-08-18T12:04:00.000Z';
const energyRequest=request('completeLiveRoomMission','state-energy',{roomId,participantId:'player-1',capabilityToken:playerOneToken,missionId:'energy'});
const requestsBeforeEnergy=requestSheet.getLastRow();
response=call(energyRequest);
check(response.success&&response.data.changed===true,'first completion changes shared state');
equal(response.data.gameState.completedMissionIds,['energy'],'first completion recorded');
equal(response.data.gameState.revision,1,'first completion increments revision once');
equal(response.data.gameState.updatedAt,now,'completion timestamp uses server clock');
equal(Object.keys(response.data).sort(),['changed','gameState'],'completion response shape exact');
check(!Object.prototype.hasOwnProperty.call(response.data.gameState,'participantId'),'state does not attribute completion to participant');
check(!JSON.stringify(response).includes(playerOneToken),'completion response omits capability');
equal(requestSheet.getLastRow(),requestsBeforeEnergy+1,'successful completion stores idempotency response');
equal(leerLiveRoomRemota(book,roomId).room,roomBeforeState,'completion does not extend room activity');
equal(leerPresenciaLiveRoomRemota(book,roomId,'player-1').presence,playerOneBeforeState,'completion does not touch presence');

const stateSheet=book.getSheetByName('CRIOS_SALA_ESTADO');
check(Boolean(stateSheet),'first changed completion creates separate state sheet');
equal(stateSheet.getRange(1,1,1,CRIOS_LIVE_ROOM_GAME_STATE_HEADERS.length).getDisplayValues()[0],CRIOS_LIVE_ROOM_GAME_STATE_HEADERS,'physical state headers exact');
equal(stateSheet.getLastRow(),2,'one state row stored for room');
check(!stateSheet.rows.flat().join('|').includes(playerOneToken),'state storage contains no capability plaintext');
equal(leerEstadoJuegoLiveRoomRemota(book,leerLiveRoomRemota(book,roomId).room,order).gameState,response.data.gameState,'stored state roundtrips canonically');

now='2026-08-18T12:05:00.000Z';
const duplicateRequest=request('completeLiveRoomMission','state-energy-duplicate',{roomId,participantId:'player-1',capabilityToken:playerOneToken,missionId:'energy'});
const requestsBeforeDuplicate=requestSheet.getLastRow();
response=call(duplicateRequest);
check(response.success&&response.data.changed===false,'new duplicate request is successful no-op');
equal(response.data.gameState.revision,1,'duplicate does not increment revision');
equal(response.data.gameState.updatedAt,'2026-08-18T12:04:00.000Z','duplicate does not change updatedAt');
equal(stateSheet.getLastRow(),2,'duplicate creates no additional state row');
equal(requestSheet.getLastRow(),requestsBeforeDuplicate+1,'successful no-op remains idempotently recorded');

now='2026-08-18T12:05:30.000Z';
const requestsBeforeReplay=requestSheet.getLastRow();
response=call(energyRequest);
check(response.success&&response.data.changed===true,'exact replay returns original completion response');
equal(response.data.gameState.updatedAt,'2026-08-18T12:04:00.000Z','replay preserves original response timestamp');
equal(requestSheet.getLastRow(),requestsBeforeReplay,'replay creates no request row');
response=call(request('completeLiveRoomMission','state-energy',{roomId,participantId:'player-1',capabilityToken:token('wrong-replay'),missionId:'energy'}));
equal(response.error.code,'CAPABILITY_INVALID','exact replay requires the current participant capability');
response=call(request('completeLiveRoomMission','state-energy',{roomId,participantId:'player-1',capabilityToken:playerOneToken,missionId:'greenhouse'}));
equal(response.error.code,'REQUEST_CONFLICT','request id reuse with different mission rejected');
response=call(request('completeLiveRoomMission','create-1',{roomId,participantId:'player-1',capabilityToken:playerOneToken,missionId:'greenhouse'}));
equal(response.error.code,'REQUEST_CONFLICT','state command conflicts with lifecycle request id reuse');

now='2026-08-18T12:03:30.000Z';
response=call(request('completeLiveRoomMission','state-greenhouse',{roomId,participantId:'player-2',capabilityToken:playerTwoToken,missionId:'greenhouse'}));
equal(response.data.gameState.completedMissionIds,['energy','greenhouse'],'second player completion unions with first');
equal(response.data.gameState.updatedAt,'2026-08-18T12:04:00.000Z','new revision cannot regress authoritative updatedAt when server time moves backwards');
equal(response.data.gameState.revision,2,'concurrent-style second command advances revision');
now='2026-08-18T12:07:00.000Z';
response=call(request('completeLiveRoomMission','state-hangar',{roomId,participantId:'player-2',capabilityToken:playerTwoToken,missionId:'hangar'}));
equal(response.data.gameState.completedMissionIds,['energy','greenhouse','hangar'],'out-of-order arrival accepted');
now='2026-08-18T12:08:00.000Z';
response=call(request('completeLiveRoomMission','state-ice',{roomId,participantId:'player-1',capabilityToken:playerOneToken,missionId:'ice'}));
equal(response.data.gameState.completedMissionIds,order,'stored completions follow publication order');
equal(response.data.gameState.revision,4,'revision equals unique completion count');
equal(stateSheet.getLastRow(),2,'all updates reuse one room state row');

now='2026-08-18T12:12:00.000Z';
response=call(request('getLiveRoomGameState','state-exact-boundary',{roomId,participantId:'host-1',capabilityToken:hostToken}));
check(response.success&&response.data.gameState.revision===4,'state remains readable at exact room expiry boundary');
equal(leerLiveRoomRemota(book,roomId).room.lastActivityAt,'2026-08-18T12:02:00.000Z','boundary state read still does not touch liveness');
now='2026-08-18T12:12:00.001Z';
response=call(request('getLiveRoomGameState','state-after-expiry',{roomId,participantId:'host-1',capabilityToken:hostToken}));
equal(response.error.code,'ROOM_EXPIRED','state read rejects expired room');
response=call(request('completeLiveRoomMission','state-write-after-expiry',{roomId,participantId:'player-1',capabilityToken:playerOneToken,missionId:'energy'}));
equal(response.error.code,'ROOM_EXPIRED','state command rejects expired room');
response=call(energyRequest);
equal(response.error.code,'ROOM_EXPIRED','exact completion replay cannot bypass room expiry');
equal(leerLiveRoomRemota(book,roomId).room.status,'expired','state access persists logical room expiry');

now='2026-08-18T13:00:00.000Z';
response=call(request('createLiveRoom','create-corruption',{campaignId:'campaign-1',publicationId:'pub-1',participantId:'host-corruption',capabilityToken:token('host-corruption')}));
const corruptionRoom=response.data.room.roomId;
now='2026-08-18T13:01:00.000Z';
response=call(request('joinLiveRoom','join-corruption',{roomId:corruptionRoom,participantId:'player-corruption',capabilityToken:token('player-corruption')}));
check(response.success,'corruption fixture player joined');
now='2026-08-18T13:02:00.000Z';
response=call(request('completeLiveRoomMission','complete-corruption',{roomId:corruptionRoom,participantId:'player-corruption',capabilityToken:token('player-corruption'),missionId:'energy'}));
check(response.success,'corruption fixture state created');
const corruptionRow=buscarFilaEstadoJuegoLiveRoomRemota(stateSheet,corruptionRoom);
stateSheet.setCell(corruptionRow-1,4,99);
response=call(request('getLiveRoomGameState','get-corruption',{roomId:corruptionRoom,participantId:'host-corruption',capabilityToken:token('host-corruption')}));
equal(response.error.code,'SERVER_ERROR','corrupt revision fails closed');
equal(response.error.retryable,true,'corrupt storage reports server failure');
equal(displayValue(stateSheet.getCell(corruptionRow-1,4)),'99','corrupt state is not silently overwritten');
stateSheet.setCell(corruptionRow-1,4,1);
stateSheet.rows.push(stateSheet.rows[corruptionRow-1].slice());
response=call(request('getLiveRoomGameState','get-duplicate-row',{roomId:corruptionRoom,participantId:'host-corruption',capabilityToken:token('host-corruption')}));
equal(response.error.code,'SERVER_ERROR','duplicate room state rows fail closed');
stateSheet.rows.pop();

publications.delete('pub-1');
response=call(request('getLiveRoomGameState','get-publication-missing',{roomId:corruptionRoom,participantId:'host-corruption',capabilityToken:token('host-corruption')}));
equal(response.error.code,'PUBLICATION_UNAVAILABLE','missing immutable publication blocks state access');
publications.set('pub-1',publication('campaign-1','pub-1',order));

now='2026-08-18T14:00:00.000Z';
response=call(request('createLiveRoom','create-bad-publication',{campaignId:'campaign-bad',publicationId:'pub-bad',participantId:'host-bad',capabilityToken:token('host-bad')}));
const badPublicationRoom=response.data.room.roomId;
response=call(request('getLiveRoomGameState','get-bad-publication',{roomId:badPublicationRoom,participantId:'host-bad',capabilityToken:token('host-bad')}));
equal(response.error.code,'PUBLICATION_UNAVAILABLE','manifest/spec mission mismatch blocks state access');

now='2026-08-18T15:00:00.000Z';
response=call(request('createLiveRoom','create-formula-state',{campaignId:'=campaign',publicationId:'pub-formula',participantId:'host-formula-state',capabilityToken:token('host-formula-state')}));
const formulaRoom=response.data.room.roomId;
now='2026-08-18T15:01:00.000Z';
response=call(request('joinLiveRoom','join-formula-state',{roomId:formulaRoom,participantId:'player-formula-state',capabilityToken:token('player-formula-state')}));
now='2026-08-18T15:02:00.000Z';
response=call(request('completeLiveRoomMission','complete-formula-state',{roomId:formulaRoom,participantId:'player-formula-state',capabilityToken:token('player-formula-state'),missionId:'=mission'}));
check(response.success,'formula-leading mission id completes safely');
equal(response.data.gameState.completedMissionIds,['=mission'],'formula-leading mission id roundtrips');
const formulaStateRow=buscarFilaEstadoJuegoLiveRoomRemota(stateSheet,formulaRoom);
equal(displayValue(stateSheet.getCell(formulaStateRow-1,1)),'=campaign','formula-leading campaign stored as text');
equal(displayValue(stateSheet.getCell(formulaStateRow-1,5)),'["=mission"]','mission JSON stored without formula execution');

vm.runInThisContext(fs.readFileSync(path.join(repo,'js/live-room/remote/live-room-game-state-contract.js'),'utf8'),{filename:'live-room-game-state-contract.js'});
const wireContract=global.CRIOS_REMOTE_LIVE_ROOM_GAME_STATE_CONTRACT;
const wireGet=wireContract.createGetLiveRoomGameStateRequest({roomId:formulaRoom,participantId:'host-formula-state',capabilityToken:token('host-formula-state')},'wire-get');
response=call(wireGet);
check(wireContract.validateResponse(response,wireGet).valid,'backend get response satisfies browser wire contract');
const wireComplete=wireContract.createCompleteLiveRoomMissionRequest({roomId:formulaRoom,participantId:'player-formula-state',capabilityToken:token('player-formula-state'),missionId:'=mission'},'wire-complete');
response=call(wireComplete);
check(response.data.changed===false&&wireContract.validateResponse(response,wireComplete).valid,'backend idempotent completion satisfies browser wire contract');
check(!requestSheet.rows.flat().join('|').includes(playerOneToken),'request storage contains no capability plaintext');

check(lockHeld===0,'all state locks released');
equal(lockWaits,lockReleases,'state locks balanced');
check(CRIOS_LIVE_ROOM_OPERATIONS.GET_ROSTER==='getLiveRoomRoster','existing presence operation set preserved');
check(typeof procesarGetRosterLiveRoomRemota==='function','existing roster backend preserved');
check(!book.getSheetByName('CRIOS_SALA_ESTADO').rows.flat().join('|').includes('capabilityToken'),'state sheet contains no capability field');

console.log('LIVE_ROOM_GAME_STATE_BACKEND_TEST_STATUS='+(failed?'FAIL':'PASS'));
console.log('LIVE_ROOM_GAME_STATE_BACKEND_TEST_TOTAL='+total);
console.log('LIVE_ROOM_GAME_STATE_BACKEND_TEST_FAILED='+failed);
console.log('LIVE_ROOM_GAME_STATE_BACKEND_SERVER_AUTHORITY=true');
console.log('LIVE_ROOM_GAME_STATE_BACKEND_NO_LIVENESS_TOUCH=true');
console.log('LIVE_ROOM_GAME_STATE_BACKEND_NOT_DEPLOYED=true');
if(failed)process.exit(1);
