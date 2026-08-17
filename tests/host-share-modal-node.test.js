const fs=require('fs');
const path=require('path');
const vm=require('vm');

const repo=process.argv[2]||path.resolve(__dirname,'..');
const sourcePath=path.join(repo,'js','host','host-share.js');
const vendorPath=path.join(repo,'js','vendor','qrcode-generator','qrcode.js');
const htmlPath=path.join(repo,'host','index.html');
const cssPath=path.join(repo,'css','host-console.css');
const licensePath=path.join(repo,'licenses','qrcode-generator','LICENSE.txt');
const source=fs.readFileSync(sourcePath,'utf8');
const vendor=fs.readFileSync(vendorPath,'utf8');
const html=fs.readFileSync(htmlPath,'utf8');
const css=fs.readFileSync(cssPath,'utf8');
const license=fs.readFileSync(licensePath,'utf8');

let total=0,failed=0;
function check(condition,message){total+=1;if(!condition){failed+=1;console.error('FAIL '+message);}}
function equal(actual,expected,message){check(actual===expected,`${message} expected=${expected} actual=${actual}`);}

function element(id){
  const listeners={};
  return {
    id,hidden:false,disabled:false,value:'',href:'#',textContent:'',dataset:{},
    listeners,
    addEventListener(name,fn){listeners[name]=fn;},
    focus(){this.focused=true;},
    select(){this.selected=true;},
    setSelectionRange(){},
    hasAttribute(name){return Object.prototype.hasOwnProperty.call(this.attributes||{},name);},
    setAttribute(name,value){this.attributes=this.attributes||{};this.attributes[name]=String(value);}
  };
}
const ids=[
  'hostShareModal','hostConsoleShareButton','hostShareCloseButton','hostShareLink','hostShareQr',
  'hostShareCopyButton','hostShareNativeButton','hostShareEmailLink','hostShareWhatsAppLink',
  'hostShareFeedback','hostConsolePlayerLink','hostConsoleCampaignLabel'
];
const nodes=Object.fromEntries(ids.map(id=>[id,element(id)]));
nodes.hostShareModal.hidden=true;
nodes.hostConsolePlayerLink.value='https://example.test/index.html?source=published&campaignId=camp-1&publicationId=pub-1&roomId=room-1';
nodes.hostConsoleCampaignLabel.textContent='Campaña Polar · sala room-1';
nodes.hostShareQr.querySelector=function(selector){
  if(selector==='svg'&&this.innerHTML&&this.innerHTML.includes('<svg')) return element('qr-svg');
  return null;
};
const docListeners={};
const documentStub={
  readyState:'loading',
  activeElement:nodes.hostConsoleShareButton,
  getElementById(id){return nodes[id]||null;},
  addEventListener(name,fn){docListeners[name]=fn;},
  execCommand(){return true;}
};
let clipboardValue='';
let sharedPayload=null;
const navigatorStub={
  clipboard:{async writeText(value){clipboardValue=value;}},
  async share(payload){sharedPayload=payload;}
};
const windowStub={document:documentStub,navigator:navigatorStub};
const context={window:windowStub,document:documentStub,navigator:navigatorStub,URL,URLSearchParams,Object,Array,String,Number,Boolean,JSON,Math,Date,encodeURIComponent,decodeURIComponent,console};
windowStub.window=windowStub;
vm.createContext(context);
vm.runInContext(vendor,context,{filename:vendorPath});
windowStub.qrcode=context.qrcode;
vm.runInContext(source,context,{filename:sourcePath});
const api=windowStub.CRIOS_HOST_SHARE;

(async()=>{
check(Boolean(api),'share API exported');
equal(api.version,'1.0.0','share version');
check(typeof api.buildEmailHref==='function','email builder exported');
check(typeof api.buildWhatsAppHref==='function','WhatsApp builder exported');
check(typeof api.buildShareData==='function','native share payload builder exported');
check(typeof api.renderQr==='function','QR renderer exported');
check(typeof api.copyText==='function','copy helper exported');
check(typeof api.createController==='function','controller factory exported');
check(Boolean(docListeners.DOMContentLoaded),'share bootstrap waits for DOM');

const publicLink=nodes.hostConsolePlayerLink.value;
const email=api.buildEmailHref(publicLink,'Campaña Polar');
check(email.startsWith('mailto:?'),'email uses mailto scheme');
check(email.includes(encodeURIComponent(publicLink)),'email contains encoded public student link');
check(email.includes(encodeURIComponent('CRIOS · Campaña Polar')),'email contains campaign title');
const whatsapp=api.buildWhatsAppHref(publicLink,'Campaña Polar');
check(whatsapp.startsWith('https://wa.me/?text='),'WhatsApp uses share URL');
check(whatsapp.includes(encodeURIComponent(publicLink)),'WhatsApp contains encoded public student link');
const shareData=api.buildShareData(publicLink,'Campaña Polar');
equal(shareData.url,publicLink,'native share uses exact student link');
equal(shareData.title,'Campaña Polar','native share title');
check(Object.isFrozen(shareData),'native share payload frozen');

const qrTarget=nodes.hostShareQr;
check(api.renderQr(qrTarget,publicLink,windowStub.qrcode),'real local QR renderer succeeds');
check(qrTarget.innerHTML.includes('<svg'),'QR renderer produces SVG');
equal(qrTarget.dataset.status,'ready','QR renderer status ready');
check(!qrTarget.innerHTML.includes(publicLink),'QR SVG does not print raw link as visible text');

const controller=api.createController({document:documentStub,navigator:navigatorStub,qrFactory:windowStub.qrcode});
check(typeof controller.open==='function','modal open available');
check(typeof controller.close==='function','modal close available');
check(controller.open(),'modal opens with valid player link');
equal(nodes.hostShareModal.hidden,false,'modal becomes visible');
equal(nodes.hostShareLink.value,publicLink,'modal shows exact student link');
check(nodes.hostShareEmailLink.href.startsWith('mailto:'),'modal email action prepared');
check(nodes.hostShareWhatsAppLink.href.startsWith('https://wa.me/'),'modal WhatsApp action prepared');
equal(nodes.hostShareNativeButton.hidden,false,'native share visible when API available');
check(nodes.hostShareQr.innerHTML.includes('<svg'),'modal prepares QR');
await controller.copy();
equal(clipboardValue,publicLink,'copy writes exact public student link');
equal(nodes.hostShareFeedback.dataset.state,'success','copy reports success');
await controller.nativeShare();
equal(sharedPayload.url,publicLink,'native share receives exact public link');
check(controller.close(),'modal closes');
equal(nodes.hostShareModal.hidden,true,'modal hidden after close');

const noNativeNavigator={clipboard:navigatorStub.clipboard};
const controllerNoNative=api.createController({document:documentStub,navigator:noNativeNavigator,qrFactory:windowStub.qrcode});
controllerNoNative.prepare();
equal(nodes.hostShareNativeButton.hidden,true,'native share hidden when unsupported');

check(html.includes('id="hostConsoleShareButton"'),'header share trigger in HTML');
check(html.includes('id="hostShareModal"'),'modal in HTML');
check(html.includes('id="hostShareQr"'),'QR target in HTML');
check(html.includes('id="hostShareCopyButton"'),'copy action in HTML');
check(html.includes('id="hostShareNativeButton"'),'native share action in HTML');
check(html.includes('id="hostShareEmailLink"'),'email action in HTML');
check(html.includes('id="hostShareWhatsAppLink"'),'WhatsApp action in HTML');
check(html.indexOf('qrcode-generator/qrcode.js')<html.indexOf('host-share.js'),'QR generator loads before share controller');
check(html.indexOf('host-share.js')<html.indexOf('host-console.js'),'share controller loads before console controller');
check(css.includes('.host-share__dialog'),'modal styled');
check(css.includes('.host-share__qr-frame'),'QR receives high-contrast frame');
check(css.includes('.host-console__share-trigger'),'header share trigger styled');
check(license.includes('MIT License'),'vendored QR license retained');
check(license.includes('Copyright (c) 2009 Kazuhiko Arase'),'vendored QR attribution retained');
check(!/sessionStorage/.test(source),'share module never reads host session storage');
check(!/capability/i.test(source),'share module contains no capability handling');
check(!/participantId/.test(source),'share module contains no host participant identity');
check(!/fetch\s*\(/.test(source),'QR/share modal makes no network request');
check(source.includes("navigator||window.navigator")||source.includes("opts.navigator||window.navigator"),'share uses browser APIs through injected navigator');

console.log('HOST_SHARE_MODAL_TEST_TOTAL='+total);
console.log('HOST_SHARE_MODAL_TEST_FAILED='+failed);
console.log('HOST_SHARE_MODAL_TEST_STATUS='+(failed===0?'PASS':'FAIL'));
process.exitCode=failed===0?0:1;
})().catch(error=>{console.error(error&&error.stack||error);process.exitCode=1;});
