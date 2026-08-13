const fs = require('fs');
const vm = require('vm');
const crypto = require('crypto');

function displayValue(v){
  if (v == null) return '';
  if (v instanceof Date) return v.toISOString();
  const s=String(v);
  return s.startsWith("'") ? s.slice(1) : s;
}
class MockFinder {
  constructor(range, text){this.range=range;this.text=String(text);this.entire=false;}
  matchEntireCell(v){this.entire=v;return this;}
  findNext(){
    for(let r=0;r<this.range.numRows;r++) for(let c=0;c<this.range.numCols;c++){
      const rr=this.range.row-1+r, cc=this.range.col-1+c;
      const v=displayValue(this.range.sheet.getCell(rr,cc));
      if(this.entire ? v===this.text : v.includes(this.text)) return {getRow:()=>rr+1,getColumn:()=>cc+1};
    }
    return null;
  }
}
class MockRange {
  constructor(sheet,row,col,numRows=1,numCols=1){Object.assign(this,{sheet,row,col,numRows,numCols});}
  getDisplayValues(){
    const out=[]; for(let r=0;r<this.numRows;r++){const row=[];for(let c=0;c<this.numCols;c++)row.push(displayValue(this.sheet.getCell(this.row-1+r,this.col-1+c)));out.push(row);}return out;
  }
  getDisplayValue(){return this.getDisplayValues()[0][0];}
  getValue(){return this.sheet.getCell(this.row-1,this.col-1) ?? ''}
  setValues(values){
    if(values.length!==this.numRows) throw new Error('row mismatch');
    for(let r=0;r<this.numRows;r++){
      if(values[r].length!==this.numCols) throw new Error('col mismatch');
      for(let c=0;c<this.numCols;c++)this.sheet.setCell(this.row-1+r,this.col-1+c,values[r][c]);
    }
    return this;
  }
  setFontWeight(){return this;}
  createTextFinder(text){return new MockFinder(this,text);}
}
class MockSheet {
  constructor(name){this.name=name;this.rows=[];this.frozen=0;}
  getName(){return this.name;}
  getCell(r,c){return (this.rows[r]||[])[c];}
  setCell(r,c,v){while(this.rows.length<=r)this.rows.push([]);while(this.rows[r].length<=c)this.rows[r].push('');this.rows[r][c]=v;}
  getLastRow(){let last=0;for(let r=0;r<this.rows.length;r++){if(this.rows[r].some(v=>v!==''&&v!=null))last=r+1;}return last;}
  getRange(row,col,numRows=1,numCols=1){return new MockRange(this,row,col,numRows,numCols);}
  setFrozenRows(n){this.frozen=n;}
  deleteRow(row){this.rows.splice(row-1,1);}
}
class MockBook {
  constructor(){this.sheets=new Map();}
  getSheetByName(n){return this.sheets.get(n)||null;}
  insertSheet(n){const s=new MockSheet(n);this.sheets.set(n,s);return s;}
}

const path=require('path');
const repo=path.resolve(process.argv[2]||path.join(__dirname,'..'));
const book=new MockBook();
const props=new Map();
let lockHeld=0, lockWaits=0, lockReleases=0, uuid=0;
global.SpreadsheetApp={getActiveSpreadsheet:()=>book};
global.PropertiesService={getScriptProperties:()=>({getProperty:k=>props.get(k)||null})};
global.LockService={getScriptLock:()=>({waitLock(){lockHeld++;lockWaits++;},releaseLock(){lockHeld--;lockReleases++;}})};
global.Utilities={
  DigestAlgorithm:{SHA_256:'sha256'}, Charset:{UTF_8:'utf8'},
  newBlob(data){const b=Buffer.isBuffer(data)?data: Array.isArray(data)?Buffer.from(data.map(x=>x<0?x+256:x)):Buffer.from(String(data),'utf8');return {getBytes:()=>Array.from(b).map(x=>x>127?x-256:x),getDataAsString:()=>b.toString('utf8')}} ,
  computeDigest(alg,text){return Array.from(crypto.createHash('sha256').update(String(text),'utf8').digest()).map(x=>x>127?x-256:x)},
  base64EncodeWebSafe(text){return Buffer.from(String(text),'utf8').toString('base64url')},
  base64DecodeWebSafe(text){return Array.from(Buffer.from(String(text),'base64url')).map(x=>x>127?x-256:x)},
  getUuid(){uuid++;return `00000000-0000-4000-8000-${String(uuid).padStart(12,'0')}`}
};
global.ContentService={MimeType:{JSON:'json'},createTextOutput:s=>({text:s,setMimeType(){return this;}})};
global.window=global;

for(const file of [
  require('path').join(repo,'js/publication/remote/remote-publication-contract.js'),
  require('path').join(repo,'backend/google-apps-script/PublicationBackend.gs'),
  require('path').join(repo,'backend/google-apps-script/Code.gs')
]) vm.runInThisContext(fs.readFileSync(file,'utf8'),{filename:file});

let total=0;
function ok(cond,msg){total++;if(!cond)throw new Error('FAIL '+msg);}
function eq(a,b,msg){ok(JSON.stringify(a)===JSON.stringify(b),msg+`\n${JSON.stringify(a)} !== ${JSON.stringify(b)}`)}
function canonical(schemaVersion,content){
 function sort(v){if(v===null||typeof v!=='object')return v;if(Array.isArray(v))return v.map(sort);const o={};Object.keys(v).sort().forEach(k=>o[k]=sort(v[k]));return o}
 return JSON.stringify(sort({schemaVersion,content}));
}
function hash(schemaVersion,content){return crypto.createHash('sha256').update(canonical(schemaVersion,content),'utf8').digest('hex')}
function makePub(content,campaign='camp-a',draft='rev-1',id='req-pub-1'){
 return CRIOS_REMOTE_PUBLICATION_CONTRACT.createPublishRequest({campaignId:campaign,draftRevision:draft,schemaVersion:'2.0',contentHash:hash('2.0',content),content},id)
}
const TEACHER_TOKEN='teacher-token-ssssssssssssssssssssssssssssssssssssssss';
function callRemote(req,token=TEACHER_TOKEN){return procesarSolicitudPublicacionRemota(req,{writeToken:token})}
function validate(resp,req,msg){const r=CRIOS_REMOTE_PUBLICATION_CONTRACT.validateResponse(resp,req);ok(r.valid,msg+' '+JSON.stringify(r.issues));}
function retiredRequest(operation,payload,id){return {protocolVersion:'1.0',operation,requestId:id,payload};}
function validateRetired(resp,req,msg){ok(resp&&resp.protocolVersion==='1.0',msg+' protocol');eq(resp.operation,req.operation,msg+' operation');eq(resp.requestId,req.requestId,msg+' requestId');eq(resp.success,false,msg+' success false');eq(resp.data,null,msg+' data null');eq(resp.error&&resp.error.code,'UNSUPPORTED_OPERATION',msg+' unsupported');eq(resp.error&&resp.error.retryable,false,msg+' nonretryable');}

props.set('CRIOS_PUBLICATION_WRITE_TOKEN_SHA256',crypto.createHash('sha256').update(TEACHER_TOKEN,'utf8').digest('hex'));

// unauthorized
const c1={mission:{text:'Hola'},arr:[3,1],nested:{b:2,a:1}};
const p1=makePub(c1);
let r=procesarSolicitudPublicacionRemota(p1,{writeToken:'bad'});
eq(r.error.code,'WRITE_UNAUTHORIZED','wrong token denied'); validate(r,p1,'unauthorized response contract');
ok(book.sheets.size===0,'unauthorized creates no sheets');

// public GET on an empty backend is side-effect free
const emptyGet=CRIOS_REMOTE_PUBLICATION_CONTRACT.createGetPublicationRequest('missing-campaign','missing-publication','req-empty-get');
r=callRemote(emptyGet,'');eq(r.error.code,'PUBLICATION_UNAVAILABLE','empty public get unavailable');validate(r,emptyGet,'empty get response contract');ok(book.sheets.size===0,'empty public get creates no sheets');

// direct malicious content rejected server-side even if client contract is bypassed
const dangerousContent=JSON.parse('{"constructor":{"x":1}}');
const dangerousReq={protocolVersion:'1.0',operation:'publishPublication',requestId:'req-danger',payload:{campaignId:'camp-danger',draftRevision:'rev-danger',schemaVersion:'2.0',contentHash:hash('2.0',dangerousContent),content:dangerousContent}};
r=callRemote(dangerousReq);eq(r.error.code,'INVALID_REQUEST','dangerous content rejected');ok(book.sheets.size===0,'invalid dangerous content creates no sheets');

// hash mismatch
const bad={...p1,payload:{...p1.payload,contentHash:'0'.repeat(64)}};
r=callRemote(bad); eq(r.error.code,'SERVER_HASH_MISMATCH','server recalculates hash');validate(r,bad,'hash mismatch response');

// publish
r=callRemote(p1);ok(r.success,'publish success');validate(r,p1,'publish response contract');
const pub1=r.data.publication;eq(pub1.version,1,'first version');eq(pub1.campaignId,'camp-a','campaign');eq(pub1.content,c1,'content roundtrip response');
ok(r.data.record.createdAt.endsWith('Z'),'createdAt iso');
ok(lockHeld===0&&lockWaits===2&&lockReleases===2,'locks balanced incl hash mismatch write');

// storage sheets and chunk reconstruction
const stored1=leerPublicacionPorIdRemota(book,pub1.publicationId);eq(stored1.publication,pub1,'stored publication roundtrip');ok(verificarIntegridadPublicacionRemota(pub1),'stored hash integrity');

// idempotent publish
const rowsBefore=book.getSheetByName('CRIOS_PUBLICACIONES').getLastRow();
r=callRemote(p1);ok(r.success&&r.data.publication.publicationId===pub1.publicationId,'publish replay same identity');eq(book.getSheetByName('CRIOS_PUBLICACIONES').getLastRow(),rowsBefore,'publish replay no new row');validate(r,p1,'publish replay response');

// conflict same request different valid hash/content
const cConflict={x:2}; const pConflict=makePub(cConflict,'camp-a','rev-2','req-pub-1');
r=callRemote(pConflict);eq(r.error.code,'WRITE_CONFLICT','publish request id conflict');validate(r,pConflict,'publish conflict response');

// second version large multichunk content
const c2={text:'á'.repeat(65000),mission:{z:1,a:2}};const p2=makePub(c2,'camp-a','rev-2','req-pub-2');
r=callRemote(p2);ok(r.success,'second publish');validate(r,p2,'second publish response');const pub2=r.data.publication;eq(pub2.version,2,'server version authority');
const stored2=leerPublicacionPorIdRemota(book,pub2.publicationId);eq(stored2.publication.content,c2,'unicode chunk roundtrip');ok(stored2.contentBytes===Buffer.byteLength(JSON.stringify(c2)),'utf8 byte count');ok(book.getSheetByName('CRIOS_PUBLICACION_BLOQUES').getLastRow()>3,'multiple chunks stored');

// legacy mutable activation operations are retired from the remote normal path
const sheetsBeforeRetiredOps=[...book.sheets.keys()].sort();
const waitsBeforeRetiredOps=lockWaits;
const a1=retiredRequest('activatePublication',{campaignId:'camp-a',publicationId:pub1.publicationId},'req-act-retired');
eq(CRIOS_REMOTE_PUBLICATION_CONTRACT.validateRequest(a1).issues[0].code,'UNSUPPORTED_OPERATION','JS contract retires activate');
r=callRemote(a1);eq(r.error.code,'UNSUPPORTED_OPERATION','activate is retired');validateRetired(r,a1,'retired activate response');
const d1=retiredRequest('deactivatePublication',{campaignId:'camp-a'},'req-deact-retired');
eq(CRIOS_REMOTE_PUBLICATION_CONTRACT.validateRequest(d1).issues[0].code,'UNSUPPORTED_OPERATION','JS contract retires deactivate');
r=callRemote(d1);eq(r.error.code,'UNSUPPORTED_OPERATION','deactivate is retired');validateRetired(r,d1,'retired deactivate response');
eq([...book.sheets.keys()].sort(),sheetsBeforeRetiredOps,'retired mutable operations create no sheets');
eq(lockWaits,waitsBeforeRetiredOps,'retired mutable operations acquire no write lock');
ok(!book.getSheetByName('CRIOS_PUBLICACION_ACTIVAS'),'active sheet is not created');
ok(!book.getSheetByName('CRIOS_PUBLICACION_EVENTOS'),'activation event sheet is not created');

// direct immutable GET works for every exact publication without activation
const g1=CRIOS_REMOTE_PUBLICATION_CONTRACT.createGetPublicationRequest('camp-a',pub1.publicationId,'req-get-1');
r=callRemote(g1,'');ok(r.success,'first immutable publication readable');validate(r,g1,'first direct get response');eq(r.data.publication,pub1,'first direct publication exact');eq(r.data.activeReference,{campaignId:pub1.campaignId,publicationId:pub1.publicationId,version:pub1.version,contentHash:pub1.contentHash,activatedAt:stored1.record.createdAt},'first compatibility reference derives from immutable publication');
const g2=CRIOS_REMOTE_PUBLICATION_CONTRACT.createGetPublicationRequest('camp-a',pub2.publicationId,'req-get-2');
r=callRemote(g2,'');ok(r.success,'second immutable publication readable');validate(r,g2,'second direct get response');eq(r.data.publication,pub2,'second direct publication exact');

// activation/deactivation remain retired even with invalid teacher authorization
r=procesarSolicitudPublicacionRemota(a1,{writeToken:'bad'});eq(r.error.code,'UNSUPPORTED_OPERATION','retired activate is rejected before auth');validateRetired(r,a1,'retired activate bad auth response');
r=procesarSolicitudPublicacionRemota(d1,{writeToken:''});eq(r.error.code,'UNSUPPORTED_OPERATION','retired deactivate is rejected before auth');validateRetired(r,d1,'retired deactivate no auth response');
const waitsBeforeHttpRetired=lockWaits;
r=JSON.parse(doPost({postData:{contents:JSON.stringify({request:a1,writeToken:TEACHER_TOKEN})}}).text);eq(r.error.code,'UNSUPPORTED_OPERATION','doPost activate is retired');validateRetired(r,a1,'doPost retired activate response');
r=JSON.parse(doPost({postData:{contents:JSON.stringify({request:d1,writeToken:TEACHER_TOKEN})}}).text);eq(r.error.code,'UNSUPPORTED_OPERATION','doPost deactivate is retired');validateRetired(r,d1,'doPost retired deactivate response');
eq(lockWaits,waitsBeforeHttpRetired,'retired doPost operations acquire no write lock');

// formula-safe campaign id survives sheet roundtrip
const cf={x:'formula'};const pf=makePub(cf,'=danger','rev-form','req-form-pub');
r=callRemote(pf);ok(r.success,'formula campaign publish');const pubf=r.data.publication;eq(leerPublicacionPorIdRemota(book,pubf.publicationId).publication.campaignId,'=danger','formula campaign roundtrip');
const gf=CRIOS_REMOTE_PUBLICATION_CONTRACT.createGetPublicationRequest('=danger',pubf.publicationId,'req-form-get');r=callRemote(gf,'');ok(r.success,'formula campaign get');validate(r,gf,'formula get response');

// corrupt stored content is neutral/unavailable to readers, not exposed as server internals
const chunkSheet=book.getSheetByName('CRIOS_PUBLICACION_BLOQUES');
const chunkRows=chunkSheet.getRange(2,1,chunkSheet.getLastRow()-1,3).getDisplayValues();
const corruptIndex=chunkRows.findIndex(row=>row[0]===pubf.publicationId);
ok(corruptIndex>=0,'formula publication chunk located');
chunkSheet.setCell(1+corruptIndex,2,"'not-valid-base64-@@");
r=callRemote(gf,'');eq(r.error.code,'PUBLICATION_UNAVAILABLE','corrupt publication is neutral unavailable');validate(r,gf,'corrupt get neutral response');

// restore exact publication by leaving corruption isolated; doGet transport uses camp-a/pub2
const gHttp=CRIOS_REMOTE_PUBLICATION_CONTRACT.createGetPublicationRequest('camp-a',pub2.publicationId,'req-http-get');

// doGet transport
r=JSON.parse(doGet({parameter:{accion:'getPublication',protocolVersion:'1.0',requestId:'req-http-get',campaignId:'camp-a',publicationId:pub2.publicationId}}).text);
ok(r.success,'doGet remote');validate(r,gHttp,'doGet response contract');

// doPost transport publish
const c3={p:3};const p3=makePub(c3,'camp-http','rev-http','req-http-pub');
r=JSON.parse(doPost({postData:{contents:JSON.stringify({request:p3,writeToken:TEACHER_TOKEN})}}).text);ok(r.success,'doPost remote publish');validate(r,p3,'doPost remote contract');

// legacy doPost still works
const legacy={idSesion:'sess-1',grupo:'8A',nombre:'Ana',variante:'v',horaInicio:'1',horaFin:'2',tiempoSegundos:1,respuestas:{},aciertos:1,intentos:1,pistas:0,puntaje:10,notaSugerida:8,devolucion:'ok',version:'1',personaje:'x'};
r=JSON.parse(doPost({postData:{contents:JSON.stringify(legacy)}}).text);ok(r.ok&&r.idSesion==='sess-1','legacy results post preserved');ok(book.getSheetByName('Hoja 1')&&book.getSheetByName('GRUPO - 8A'),'legacy sheets created');

// groups GET preserved
const cfg=book.insertSheet('CONFIG');cfg.getRange(1,1,3,1).setValues([['GRUPO'],['8A'],['8B']]);
r=JSON.parse(doGet({parameter:{accion:'grupos'}}).text);eq(r.grupos,['8A','8B'],'groups get preserved');

// no configured write token fail closed
props.delete('CRIOS_PUBLICATION_WRITE_TOKEN_SHA256');const p4=makePub({z:4},'camp-no-token','rev','req-no-token');r=callRemote(p4,TEACHER_TOKEN);eq(r.error.code,'WRITE_UNAUTHORIZED','missing server token fails closed');

ok(lockHeld===0,'all locks released');
console.log('BACKEND_TEST_STATUS=PASS');
console.log('BACKEND_TEST_TOTAL='+total);
console.log('BACKEND_TEST_FAILED=0');
console.log('BACKEND_TEST_SHEETS='+[...book.sheets.keys()].join('|'));
console.log('BACKEND_LOCKS_BALANCED='+(lockHeld===0));
console.log('BACKEND_HASHED_WRITE_AUTH=true');
console.log('BACKEND_PUBLIC_GET_SECRET_FREE=true');
console.log('BACKEND_LEGACY_RESULTS_PRESERVED=true');
