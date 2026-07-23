// Motor compartido de las pantallas del escaparate / marquesina.
// Cada archivo de pantalla (index.html, <slug>.html) define window.PANTALLA
// y carga este motor. Elige el contenido según fecha/hora; cada cartel se
// gira o no SEGÚN SU PROPIO ajuste (así se pueden mezclar carteles derechos y
// ya-girados en una misma playlist). Las playlists pasan en bucle con fundido.
(function () {
  var SLUG = window.PANTALLA || 'principal';
  var MEDIA = 'media/';   // los carteles están en /tele/media

  function esVideo(n){ return /\.(mp4|webm|mov|m4v)$/i.test(n); }
  function aMin(h){ var p=String(h).split(':'); return (+p[0])*60 + (+p[1]); }
  function ymd(d){ return d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2)+'-'+('0'+d.getDate()).slice(-2); }
  function esFecha(f){ return f.tipo==='fecha'; }

  function coincideSemanal(f, ahora){
    var dia=ahora.getDay(), ayer=(dia+6)%7, min=ahora.getHours()*60+ahora.getMinutes(), desde=aMin(f.desde), hasta=aMin(f.hasta);
    if (desde<hasta) return (f.dias||[]).indexOf(dia)>=0 && min>=desde && min<hasta;
    if ((f.dias||[]).indexOf(dia)>=0 && min>=desde) return true;
    if ((f.dias||[]).indexOf(ayer)>=0 && min<hasta) return true;
    return false;
  }
  function coincideFecha(f, ahora){
    var d1=f.desdeFecha, d2=f.hastaFecha||f.desdeFecha; if(!d1) return false; if(d2<d1){var t=d1;d1=d2;d2=t;}
    var hoy=ymd(ahora), ayer=ymd(new Date(ahora.getTime()-86400000)), min=ahora.getHours()*60+ahora.getMinutes(), desde=aMin(f.desde), hasta=aMin(f.hasta);
    function dentro(x){ return x>=d1 && x<=d2; }
    if (desde<hasta) return dentro(hoy) && min>=desde && min<hasta;
    if (dentro(hoy) && min>=desde) return true;
    if (dentro(ayer) && min<hasta) return true;
    return false;
  }
  // El "por defecto" activo: la versión programada más reciente cuya fecha ya llegó; si no, la base.
  function defaultActivo(p, ahora){
    var hoy=ymd(ahora), mejor=p.porDefecto||null, f='';
    var pr=p.programados||[];
    for (var i=0;i<pr.length;i++){ var x=pr[i]; if(x.desde && (x.archivo||x.lista||x.url) && x.desde<=hoy && x.desde>=f){ mejor=x; f=x.desde; } }
    return mejor;
  }
  function elegir(p, ahora){
    var fr=p.franjas||[];
    for (var i=0;i<fr.length;i++){ if((fr[i].archivo||fr[i].lista||fr[i].url) && esFecha(fr[i])  && coincideFecha(fr[i],ahora))  return fr[i]; }
    for (var j=0;j<fr.length;j++){ if((fr[j].archivo||fr[j].lista||fr[j].url) && !esFecha(fr[j]) && coincideSemanal(fr[j],ahora)) return fr[j]; }
    return defaultActivo(p, ahora);
  }

  // Huecos AUTOMÁTICOS ({auto:true, criterio}): la propia tele los rellena con la
  // cartelera de funciones.json (se refresca cada 30 min). Criterios por hueco:
  //   'proximo'   -> el espectáculo con función más cercana en el tiempo (defecto)
  //   'prioridad' -> el de más prioridad de cartelera (empate: el más próximo)
  //   'azar'      -> uno al azar que cambia CADA DÍA (estable dentro del día)
  // Cada hueco consume su espectáculo: dos huecos nunca repiten el mismo.
  // Solo entran espectáculos con cartel declarado en cfg.robot.map. Así el panel
  // manda y no hace falta ningún robot externo.
  function robotCfg(){ return (cfg && cfg.robot) || {}; }
  function candidatosAuto(usados){
    var r=robotCfg(), ex=r.excluir||[], hoy=ymd(new Date()), out=[];
    for (var k in funcs){ if(!funcs.hasOwnProperty(k)) continue; var s=funcs[k];
      if (!s || ex.indexOf(s.id)>=0 || usados[s.id]) continue;
      var fut=(s.future||[]).filter(function(f){ return f && f.date && f.date>=hoy; });
      if (!fut.length) continue;
      if (!(r.map||{})[s.id]) continue;                     // sin cartel conocido -> no entra
      out.push({id:s.id, prox:fut[0].date, prio:(+s.priority||0)});
    }
    return out;
  }
  function eligeAuto(criterio, idx, usados){
    var c=candidatosAuto(usados); if(!c.length) return null;
    if (criterio==='prioridad') c.sort(function(a,b){ return (b.prio-a.prio) || (a.prox<b.prox?-1:(a.prox>b.prox?1:0)); });
    else c.sort(function(a,b){ return (a.prox<b.prox?-1:(a.prox>b.prox?1:0)) || (b.prio-a.prio); });
    if (criterio==='azar'){
      var s=ymd(new Date())+'#'+idx, seed=0;
      for (var i=0;i<s.length;i++) seed=(seed*31+s.charCodeAt(i))>>>0;
      return c[seed%c.length];
    }
    return c[0];
  }
  function itemAuto(el, base){
    var r=robotCfg(), arch=(r.map||{})[el.id];
    var it={archivo:arch, segundos:base.segundos, girar:base.girar, show:el.id};
    if (esVideo(arch)) it.relleno=el.id+'.jpg';
    else { it.efecto=r.efecto||'kbZoomOut'; it.overlay=r.overlay||'shine'; }
    return it;
  }
  // Cada item lleva su propio "girar" (por defecto true = el archivo está derecho).
  function itemsDe(slot){
    var its=[], usados={};
    if (slot.lista && slot.lista.length){
      for (var i=0;i<slot.lista.length;i++){ var it=slot.lista[i]; if(!it) continue;
        if (it.auto){
          var el=eligeAuto(it.criterio||'proximo', i, usados);
          if (el){ usados[el.id]=1; its.push(itemAuto(el, {segundos:(+it.segundos||0), girar:(it.girar!==false)})); }
          continue;
        }
        if (it.archivo||it.url) its.push({archivo:it.archivo, url:it.url, segundos:(+it.segundos||0), girar:(it.girar!==false), efecto:it.efecto, overlay:it.overlay, relleno:it.relleno, show:it.show}); }
    } else if (slot.archivo || slot.url){
      its.push({archivo:slot.archivo, url:slot.url, segundos:0, girar:(slot.girar!==false), efecto:slot.efecto, overlay:slot.overlay, relleno:slot.relleno, show:slot.show});
    }
    return its;
  }

  var cfg=null, grados=-90, stage=null, capas=null, activa=0, gen=0, timer=null, sig=null, items=[];
  var funcs={}, FUNC_URL='', OVPOS='abajo-izq', funcsCargadas=false;   // "próxima función" desde funciones.json (esquina)

  // ── "Próxima función" (overlay) ───────────────────────────────────────────
  function cargarFunciones(){
    if (!FUNC_URL) return;
    fetch(FUNC_URL + (FUNC_URL.indexOf('?')<0?'?':'&') + 't=' + Date.now())
      .then(function(r){ return r.json(); })
      .then(function(j){ var m={}; ((j&&j.shows)||[]).forEach(function(s){ if(s&&s.id) m[s.id]=s; }); funcs=m; pintar(); })
      .catch(function(){});
  }
  function slugDe(f){ return String(f||'').replace(/\.[^.]+$/,'').toLowerCase(); }
  function showDe(it){ if(!it||!it.archivo) return null; var slug = it.show || slugDe(it.archivo); return funcs[slug] || null; }
  function escapar(x){ return String(x).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function textoBanda(s){
    if (!s) return null;
    if (s.nextDate){
      var hoy=ymd(new Date()), man=ymd(new Date(new Date().getTime()+86400000));
      if (s.nextDate===hoy) return {linea:'Hoy',     hora:s.nextTime||''};
      if (s.nextDate===man) return {linea:'Mañana',  hora:s.nextTime||''};
      return {linea:(s.nextLabel||''), hora:s.nextTime||''};
    }
    if (s.ticketAlarm) return {linea:'Próximamente', hora:''};
    return null;
  }
  function comp(hex,a){   // color complementario VIVO del cartel (acento), con transparencia
    hex=String(hex||'').replace('#',''); if(hex.length===3)hex=hex.replace(/(.)/g,'$1$1');
    if(hex.length!==6) return 'rgba(224,184,90,'+(a==null?1:a)+')';
    var r=parseInt(hex.slice(0,2),16)/255,g=parseInt(hex.slice(2,4),16)/255,b=parseInt(hex.slice(4,6),16)/255;
    var mx=Math.max(r,g,b),mn=Math.min(r,g,b),d=mx-mn,l=(mx+mn)/2,h=0,s=0;
    if(d){ s=l>.5?d/(2-mx-mn):d/(mx+mn); h=mx===r?((g-b)/d+(g<b?6:0)):mx===g?((b-r)/d+2):((r-g)/d+4); h/=6; }
    h=(h+0.5)%1; s=Math.min(1,Math.max(.6,s)); l=Math.min(.58,Math.max(.46,l));
    function f(p,q,t){ if(t<0)t+=1; if(t>1)t-=1; if(t<1/6)return p+(q-p)*6*t; if(t<1/2)return q; if(t<2/3)return p+(q-p)*(2/3-t)*6; return p; }
    var q=l<.5?l*(1+s):l+s-l*s,p=2*l-q;
    return 'rgba('+Math.round(f(p,q,h+1/3)*255)+','+Math.round(f(p,q,h)*255)+','+Math.round(f(p,q,h-1/3)*255)+','+(a==null?1:a)+')';
  }
  function posEsquina(o){ var v=(o.indexOf('arriba')>=0)?'top:3vh':'bottom:3vh'; var hh=(o.indexOf('izq')>=0)?'left:3vh':'right:3vh'; return v+';'+hh; }
  function injectBandaCSS(){ if(document.getElementById('bandaFX'))return; var st=document.createElement('style'); st.id='bandaFX';
    st.textContent='@keyframes ovDrift{from{transform:translateX(0)}to{transform:translateX(var(--dx,38vh))}}'; document.head.appendChild(st); }
  function crearBanda(s){
    var t=textoBanda(s); if(!t || !t.linea) return null;
    injectBandaCSS();
    var d=document.createElement('div');
    var dir=(OVPOS.indexOf('izq')>=0)?'52vh':'-52vh';     // deriva de lado a lado para no tapar nada fijo (recorre ~media pantalla)
    d.style.cssText='position:absolute;'+posEsquina(OVPOS)+';--dx:'+dir+';max-width:44%;background:'+comp(s.accent,0.78)+';color:#fff;padding:1.2vh 1.7vh;border-radius:1.3vh;font-family:system-ui,-apple-system,sans-serif;box-shadow:0 .4vh 1.4vh rgba(0,0,0,.32);z-index:3;animation:ovDrift 9s ease-in-out infinite alternate;text-shadow:0 .15vh .3vh rgba(0,0,0,.45)';
    var l1='<div style="font-size:2.5vh;line-height:1.12;font-weight:600;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden">'+escapar(t.linea)+'</div>';
    var l2=t.hora?'<div style="font-size:3.1vh;font-weight:800;margin-top:.2vh">'+escapar(t.hora)+'</div>':'';
    d.innerHTML=l1+l2;
    return d;
  }

  function laPantalla(){
    if (!cfg || !cfg.pantallas) return null;
    if (cfg.pantallas[SLUG]) return cfg.pantallas[SLUG];
    var k=Object.keys(cfg.pantallas); return k.length ? cfg.pantallas[k[0]] : null;
  }
  function asegurarCapas(){
    if (capas) return;
    stage=document.getElementById('stage'); stage.innerHTML='';
    capas=[document.createElement('div'), document.createElement('div')];
    capas.forEach(function(c){ c.style.cssText='position:absolute;opacity:0;transition:opacity 1.4s ease;overflow:hidden'; stage.appendChild(c); });
    capas[0].style.opacity=1; activa=0;
  }
  function estilarCapa(c, girar){
    if (girar){ c.style.width='100vh'; c.style.height='100vw'; c.style.left='50%'; c.style.top='50%'; c.style.transform='translate(-50%,-50%) rotate('+grados+'deg)'; }
    else { c.style.width='100vw'; c.style.height='100vh'; c.style.left='0'; c.style.top='0'; c.style.transform='none'; }
  }
  // Efectos de movimiento (Ken Burns) para que sea un ESCAPARATE, no un catalogo.
  // Cada cartel usa un efecto distinto (rota por la lista, o it.efecto si viene en el config).
  // Todos los efectos TERMINAN en scale(1) sin desplazar -> el cartel completo
  // (encaja exacto en la pantalla 9:16, asi que al final no se recorta nada).
  // Parten de un ligero zoom/deriva y se "asientan": movimiento sutil de escaparate.
  var FX = ['kbZoomOut', 'kbDriftR', 'kbPop', 'kbDriftL', 'kbDriftU'];
  function injectFX(){
    if (document.getElementById('teleFX')) return;
    var s = document.createElement('style'); s.id = 'teleFX';
    s.textContent =
      '@keyframes kbZoomOut{from{transform:scale(1.06)}to{transform:scale(1.0)}}'
    + '@keyframes kbDriftR{from{transform:scale(1.05) translate(1.8%,0)}to{transform:scale(1.0) translate(0,0)}}'
    + '@keyframes kbDriftL{from{transform:scale(1.05) translate(-1.8%,0)}to{transform:scale(1.0) translate(0,0)}}'
    + '@keyframes kbDriftU{from{transform:scale(1.05) translate(0,1.8%)}to{transform:scale(1.0) translate(0,0)}}'
    + '@keyframes kbPop{from{transform:scale(1.09)}to{transform:scale(1.0)}}'
    // Capa de LUZ (no recorta: va por encima del cartel, mix-blend screen):
    + '@keyframes ovShine{0%{background-position:220% 0;opacity:0}10%{opacity:1}90%{opacity:1}100%{background-position:-70% 0;opacity:0}}'
    + '@keyframes ovGlow{0%{opacity:0}50%{opacity:.9}100%{opacity:0}}'
    + '@keyframes ovSpark{0%,15%,100%{opacity:0}25%{opacity:1}45%{opacity:.25}65%{opacity:1}85%{opacity:.3}}'
    // Efecto ESPECTACULAR (kbWow = zoom+destello de entrada) + flash de luz:
    + '@keyframes kbWow{0%{transform:scale(1.2);filter:brightness(1.7)}18%{filter:brightness(1)}100%{transform:scale(1.0);filter:brightness(1)}}'
    + '@keyframes ovFlash{0%{opacity:.85}100%{opacity:0}}';
    document.head.appendChild(s);
  }
  // Efectos de LUZ por cartel (brillo / destellos / resplandor). No recortan.
  var OVFX = ['shine', 'sparkle', 'glow'];
  function crearOverlay(idx, it){
    var type = it.overlay || OVFX[((idx||0)%OVFX.length+OVFX.length)%OVFX.length];
    if (type === 'none') return null;
    var ov = document.createElement('div');
    var base = 'position:absolute;inset:0;pointer-events:none;';
    var seg = (it.segundos>0?it.segundos:10);
    if (type === 'shine'){
      ov.style.cssText = base + 'background:linear-gradient(115deg,rgba(255,255,255,0) 42%,rgba(255,255,255,.5) 50%,rgba(255,255,255,0) 58%);background-size:250% 250%;animation:ovShine 2.6s ease-in-out .3s';
    } else if (type === 'glow'){
      ov.style.cssText = base + 'background:radial-gradient(circle at 50% 42%,rgba(255,255,255,.22),rgba(255,255,255,0) 60%);animation:ovGlow '+seg+'s ease-in-out';
    } else if (type === 'sparkle'){
      ov.style.cssText = base + 'background:radial-gradient(circle 3px at 22% 28%,#fff,transparent 60%),radial-gradient(circle 2px at 72% 55%,#fff,transparent 60%),radial-gradient(circle 2px at 48% 82%,#fff,transparent 60%),radial-gradient(circle 2px at 83% 20%,#fff,transparent 60%),radial-gradient(circle 2px at 33% 64%,#fff,transparent 60%);animation:ovSpark 3.2s ease-in-out .4s';
    } else if (type === 'flash'){
      ov.style.cssText = base + 'background:radial-gradient(circle at 50% 45%,rgba(255,255,255,.9),rgba(255,255,255,0) 65%);animation:ovFlash 1s ease-out';
    } else return null;
    return ov;
  }
  function crearElemento(it, unico, idx){
    var el;
    if (it.url){            // contenido tipo WEB: incrustar la pagina (p.ej. monitor de taquilla Qwantic)
      el=document.createElement('iframe'); el.src=it.url;
      el.setAttribute('frameborder','0'); el.setAttribute('scrolling','no'); el.allow='autoplay; fullscreen';
      el.style.cssText='width:100%;height:100%;border:0;display:block';
      return el;
    }
    if (esVideo(it.archivo)){
      el=document.createElement('video'); el.src=MEDIA+it.archivo; el.muted=true; el.autoplay=true; el.playsInline=true; el.setAttribute('playsinline',''); if(unico) el.loop=true;
    } else {
      el=document.createElement('img'); el.src=MEDIA+it.archivo;
    }
    el.style.cssText='width:100%;height:100%;object-fit:cover;display:block;transform-origin:center center';
    if (el.tagName==='IMG'){
      injectFX();
      var seg=(it.segundos>0?it.segundos:10);
      var dur=Math.max(5, seg-2);                             // se asienta 2s antes del cambio -> cartel completo visible
      var name=it.efecto || FX[((idx||0)%FX.length+FX.length)%FX.length];
      el.style.animation=name+' '+dur+'s ease-out both';
    }
    return el;
  }
  function programar(i, el, mygen){
    if (items.length<=1) return;
    var it=items[i];
    function avanzar(){ if(mygen!==gen) return; clearTimeout(timer); mostrar((i+1)%items.length); }
    if (el.tagName==='VIDEO'){
      if (it.segundos>0){ clearTimeout(timer); timer=setTimeout(avanzar, it.segundos*1000); }
      else { el.onended=avanzar; clearTimeout(timer); timer=setTimeout(avanzar, 120000); }
    } else {
      var seg=it.segundos>0?it.segundos:10;
      clearTimeout(timer); timer=setTimeout(avanzar, seg*1000);
    }
  }
  function liberarVideo(capa){ if(!capa||!capa.querySelector) return; var v=capa.querySelector('video'); if(v){ try{ v.pause(); v.removeAttribute('src'); v.load(); }catch(e){} } }
  function mostrar(i){
    var mygen=gen, it=items[i]; if(!it) return;
    var unico=items.length<=1;
    var nueva=capas[(activa+1)%2], vieja=capas[activa];
    liberarVideo(nueva);                       // suelta de verdad el vídeo viejo (evita fugas que degradan el aparato)
    nueva.innerHTML=''; estilarCapa(nueva, (it.url || grados===0) ? false : (it.girar!==false));   // pantalla a 0º o una web -> nunca se gira (llena apaisado, sin recortar a vertical)
    var el=crearElemento(it, unico, i); nueva.appendChild(el);
    if (el.tagName==='IMG'){ var ov=crearOverlay(i, it); if(ov) nueva.appendChild(ov); }
    if (OVPOS!=='off'){ var sf=showDe(it); if(sf){ var bn=crearBanda(sf); if(bn) nueva.appendChild(bn); } }
    // Vídeo más corto que su tiempo de slot: al acabar, rellena con su cartel hasta completar.
    if (el.tagName==='VIDEO' && it.relleno){
      el.addEventListener('ended', function(){
        if (mygen!==gen) return;
        var im=document.createElement('img'); im.src=MEDIA+it.relleno;
        im.style.cssText='position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block;opacity:0;transition:opacity .7s ease';
        nueva.appendChild(im);
        requestAnimationFrame(function(){ im.style.opacity=1; });   // fundido suave vídeo->cartel (disimula el reencuadre)
      });
    }
    function activar(){ if(mygen!==gen) return; nueva.style.opacity=1; vieja.style.opacity=0; activa=(activa+1)%2;
      if(items.length>1) setTimeout(function(){ var vv=vieja.querySelector&&vieja.querySelector('video'); if(vv){ try{vv.pause();}catch(e){} } }, 1600); // pausa el oculto: solo 1 vídeo decodificando a la vez
      programar(i, el, mygen); }
    if (el.tagName==='VIDEO'){
      var d1=false, go=function(){ if(!d1){d1=true;activar();} };
      el.oncanplay=go; el.onerror=go; setTimeout(go,1500);          // si un vídeo falla, NO se atasca el bucle: pasa al siguiente
      var pr=el.play&&el.play(); if(pr&&pr.catch) pr.catch(function(){});
    } else {
      if (el.complete){ activar(); }
      else { var d2=false; el.onload=function(){ if(!d2){d2=true;activar();} }; el.onerror=function(){ if(!d2){d2=true;activar();} }; setTimeout(function(){ if(!d2){d2=true;activar();} },1500); }
    }
  }
  function pintar(){
    var p=laPantalla(); if(!p) return;
    grados=(p.grados!=null)?p.grados:-90;
    var slot=elegir(p, new Date());
    var its=slot?itemsDe(slot):[];
    var nuevaSig=JSON.stringify(its)+'|'+grados;
    if (nuevaSig===sig) return;
    sig=nuevaSig; items=its; gen++;
    clearTimeout(timer); timer=null;
    asegurarCapas();
    if (!items.length){ capas[0].innerHTML=''; capas[1].innerHTML=''; return; }
    mostrar(0);
  }
  function cargar(){
    fetch('config.json?t='+Date.now()).then(function(r){ return r.json(); }).then(function(j){
      cfg=j;
      if (j && j.funcionesUrl) FUNC_URL = j.funcionesUrl;
      if (j && j.overlay) OVPOS = j.overlay;
      if (FUNC_URL && !funcsCargadas){ funcsCargadas=true; cargarFunciones(); }
      pintar();
    }).catch(function(){});
  }
  cargar();
  setInterval(cargar, 60000);
  setInterval(pintar, 15000);
  setInterval(cargarFunciones, 1800000);   // refresca "próxima función" cada 30 min (cambia a diario)
})();
