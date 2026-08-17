/* CRIOS host share modal - public student link only */
(function(){
  'use strict';

  var VERSION='1.0.0';

  function text(value){return typeof value==='string'?value.trim():'';}

  function buildEmailHref(link,title){
    var subject='CRIOS · '+(text(title)||'Partida en vivo');
    var body='Ingresá a la partida desde este enlace:\n\n'+text(link);
    return 'mailto:?subject='+encodeURIComponent(subject)+'&body='+encodeURIComponent(body);
  }

  function buildWhatsAppHref(link,title){
    var message=(text(title)||'CRIOS · Partida en vivo')+'\n'+text(link);
    return 'https://wa.me/?text='+encodeURIComponent(message);
  }

  function buildShareData(link,title){
    return Object.freeze({
      title:text(title)||'CRIOS · Partida en vivo',
      text:'Ingresá a esta partida de CRIOS.',
      url:text(link)
    });
  }

  function renderQr(target,link,qrFactory){
    if(!target)return false;
    target.innerHTML='';
    var href=text(link);
    var factory=qrFactory||window.qrcode;
    if(!href||typeof factory!=='function'){
      target.textContent='QR no disponible';
      target.dataset.status='unavailable';
      return false;
    }
    try{
      var qr=factory(0,'M');
      qr.addData(href);
      qr.make();
      target.innerHTML=qr.createSvgTag({cellSize:5,margin:4,scalable:true});
      var svg=target.querySelector&&target.querySelector('svg');
      if(svg){
        svg.setAttribute('role','img');
        svg.setAttribute('aria-label','Código QR para abrir la partida de CRIOS');
        svg.setAttribute('focusable','false');
      }
      target.dataset.status='ready';
      return true;
    }catch(error){
      target.textContent='No se pudo generar el QR';
      target.dataset.status='error';
      return false;
    }
  }

  async function copyText(value,navigatorObj,documentObj){
    var link=text(value);
    if(!link)return false;
    var nav=navigatorObj||window.navigator;
    var doc=documentObj||window.document;
    try{
      if(nav&&nav.clipboard&&typeof nav.clipboard.writeText==='function'){
        await nav.clipboard.writeText(link);
        return true;
      }
    }catch(ignore){}
    try{
      var input=doc&&doc.getElementById&&doc.getElementById('hostShareLink');
      if(!input||typeof input.select!=='function')return false;
      input.focus();
      input.select();
      if(typeof input.setSelectionRange==='function')input.setSelectionRange(0,input.value.length);
      return doc.execCommand&&doc.execCommand('copy')===true;
    }catch(ignore){return false;}
  }

  function createController(options){
    var opts=options&&typeof options==='object'?options:{};
    var doc=opts.document||window.document;
    var nav=opts.navigator||window.navigator;
    var qrFactory=opts.qrFactory||window.qrcode;
    var playerLinkProvider=typeof opts.playerLinkProvider==='function'
      ? opts.playerLinkProvider
      : function(){
          var source=doc.getElementById('hostConsolePlayerLink');
          return source&&text(source.value);
        };
    var titleProvider=typeof opts.titleProvider==='function'
      ? opts.titleProvider
      : function(){
          var source=doc.getElementById('hostConsoleCampaignLabel');
          return source&&text(source.textContent);
        };

    var modal=doc.getElementById('hostShareModal');
    var openButton=doc.getElementById('hostConsoleShareButton');
    var closeButton=doc.getElementById('hostShareCloseButton');
    var linkInput=doc.getElementById('hostShareLink');
    var qrTarget=doc.getElementById('hostShareQr');
    var copyButton=doc.getElementById('hostShareCopyButton');
    var nativeButton=doc.getElementById('hostShareNativeButton');
    var emailLink=doc.getElementById('hostShareEmailLink');
    var whatsappLink=doc.getElementById('hostShareWhatsAppLink');
    var feedback=doc.getElementById('hostShareFeedback');
    var previousFocus=null;

    function setFeedback(message,state){
      if(!feedback)return;
      feedback.textContent=text(message);
      feedback.dataset.state=text(state);
    }

    function currentPayload(){
      var link=text(playerLinkProvider());
      var title=text(titleProvider())||'CRIOS · Partida en vivo';
      return {link:link,title:title};
    }

    function prepare(){
      var payload=currentPayload();
      if(linkInput)linkInput.value=payload.link;
      if(emailLink)emailLink.href=payload.link?buildEmailHref(payload.link,payload.title):'#';
      if(whatsappLink)whatsappLink.href=payload.link?buildWhatsAppHref(payload.link,payload.title):'#';
      if(nativeButton){
        var supported=Boolean(nav&&typeof nav.share==='function');
        nativeButton.hidden=!supported;
        nativeButton.disabled=!supported||!payload.link;
      }
      if(copyButton)copyButton.disabled=!payload.link;
      renderQr(qrTarget,payload.link,qrFactory);
      setFeedback(payload.link?'':'Todavía no hay un enlace de estudiantes disponible.',payload.link?'':'error');
      return payload;
    }

    function open(){
      if(!modal)return false;
      var payload=prepare();
      if(!payload.link)return false;
      previousFocus=doc.activeElement||null;
      modal.hidden=false;
      if(closeButton&&typeof closeButton.focus==='function')closeButton.focus();
      return true;
    }

    function close(){
      if(!modal)return false;
      modal.hidden=true;
      setFeedback('','');
      if(previousFocus&&typeof previousFocus.focus==='function'){try{previousFocus.focus();}catch(ignore){}}
      previousFocus=null;
      return true;
    }

    async function copy(){
      var payload=currentPayload();
      var ok=await copyText(payload.link,nav,doc);
      setFeedback(ok?'Enlace copiado.':'No se pudo copiar automáticamente. Seleccioná el enlace y copialo manualmente.',ok?'success':'error');
      return ok;
    }

    async function nativeShare(){
      var payload=currentPayload();
      if(!payload.link||!nav||typeof nav.share!=='function')return false;
      try{
        await nav.share(buildShareData(payload.link,payload.title));
        setFeedback('Opciones de compartir abiertas.','success');
        return true;
      }catch(error){
        if(error&&error.name==='AbortError')return false;
        setFeedback('No se pudo abrir el menú de compartir.','error');
        return false;
      }
    }

    function onKeydown(event){
      if(event&&event.key==='Escape'&&modal&&!modal.hidden){event.preventDefault();close();}
    }

    function bind(){
      if(openButton)openButton.addEventListener('click',open);
      if(closeButton)closeButton.addEventListener('click',close);
      if(copyButton)copyButton.addEventListener('click',copy);
      if(nativeButton)nativeButton.addEventListener('click',nativeShare);
      if(modal)modal.addEventListener('click',function(event){
        if(event&&event.target&&event.target.hasAttribute&&event.target.hasAttribute('data-host-share-close'))close();
      });
      doc.addEventListener('keydown',onKeydown);
      return true;
    }

    return Object.freeze({
      prepare:prepare,
      open:open,
      close:close,
      copy:copy,
      nativeShare:nativeShare,
      currentPayload:currentPayload,
      bind:bind
    });
  }

  function bootstrap(){
    var controller=createController();
    controller.bind();
    window.CRIOS_HOST_SHARE_CONTROLLER=controller;
  }

  window.CRIOS_HOST_SHARE=Object.freeze({
    version:VERSION,
    buildEmailHref:buildEmailHref,
    buildWhatsAppHref:buildWhatsAppHref,
    buildShareData:buildShareData,
    renderQr:renderQr,
    copyText:copyText,
    createController:createController
  });

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bootstrap);else bootstrap();
})();
