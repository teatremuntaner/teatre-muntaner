// E267 · Mide qué terceros pide la web del Muntaner (build local en dist/) según el consentimiento.
// Uso: npm run build && node scripts/prueba_terceros_consentimiento.mjs   (CHROME=ruta si no es la de Windows)
// Chrome headless por CDP, un contexto limpio por escenario. Servidor estático propio en 127.0.0.1.
// Analytics y Meta se BLOQUEAN en el navegador (no sale tráfico de prueba a cuentas reales):
// la petición se ve (requestWillBeSent) pero no llega a salir.
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, existsSync, statSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';

const DIST = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9338, WEB = 4399;
const BASE = `http://127.0.0.1:${WEB}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.xml': 'application/xml', '.txt': 'text/plain' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, BASE).pathname);
  let f = join(DIST, p);
  if (existsSync(f) && statSync(f).isDirectory()) f = join(f, 'index.html');
  if (!existsSync(f)) { res.writeHead(404); return res.end('404'); }
  res.writeHead(200, { 'content-type': MIME[extname(f)] || 'application/octet-stream' });
  res.end(readFileSync(f));
}).listen(WEB, '127.0.0.1');

const prof = mkdtempSync(join(tmpdir(), 'cdp-e267-'));
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${prof}`, '--no-first-run', '--no-default-browser-check', '--window-size=1280,900', 'about:blank'], { stdio: 'ignore' });

let ws;
for (let i = 0; i < 60; i++) {
  try { const v = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); ws = new WebSocket(v.webSocketDebuggerUrl); break; } catch { await sleep(250); }
}
await new Promise((r) => ws.addEventListener('open', r));
let id = 0; const pend = new Map(); const listeners = [];
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
  else listeners.forEach((f) => f(m));
});
const send = (method, params = {}, sessionId) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params, sessionId })); });

// Lo que NO puede salir sin consentimiento.
const PROHIBIDO = /fonts\.googleapis|fonts\.gstatic|google\.[a-z.]+\/maps|maps\.google|maps\.gstatic|youtube|ytimg|googlevideo|instagram|cdninstagram|facebook|fbcdn|tiktok|googletagmanager|google-analytics|analytics\.google|doubleclick/;
// Bloqueados en el navegador de prueba (Analytics y Meta reales; GTM por si acaso).
const BLOQUEO = ['*googletagmanager.com*', '*google-analytics.com*', '*analytics.google.com*', '*doubleclick.net*', '*connect.facebook.net*', '*facebook.com*', '*facebook.net*'];

// E271: sin Tag Manager. Analytics (gtag.js) solo con estadística; píxel de Meta (fbevents.js) solo con marketing.
const GTM_JS = /googletagmanager\.com\/gtm\.js/;
const GA = /googletagmanager\.com\/gtag\/js|google-analytics\.com|analytics\.google\.com/;
const META = /connect\.facebook\.net|facebook\.com\/tr/;
const todas = []; // todas las peticiones de la prueba, para comprobar al final que gtm.js no se pide nunca

const resultados = [];
function check(nombre, ok, detalle) { resultados.push({ nombre, ok, detalle }); console.log(`${ok ? 'OK  ' : 'FALLO'} ${nombre}${detalle ? ' — ' + detalle : ''}`); }

async function nuevaPestana() {
  const { result: ctx } = await send('Target.createBrowserContext', { disposeOnDetach: true });
  const { result: t } = await send('Target.createTarget', { url: 'about:blank', browserContextId: ctx.browserContextId });
  const { result: att } = await send('Target.attachToTarget', { targetId: t.targetId, flatten: true });
  const s = att.sessionId;
  const reqs = [];
  const f = (m) => { if (m.sessionId === s && m.method === 'Network.requestWillBeSent') { reqs.push(m.params.request.url); todas.push(m.params.request.url); } };
  listeners.push(f);
  await send('Network.enable', {}, s);
  await send('Network.setBlockedURLs', { urls: BLOQUEO }, s);
  await send('Page.enable', {}, s);
  const ev = async (expression) => { const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, s); if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 400)); return r.result?.result?.value; };
  const ir = async (path, ms = 3500) => { await send('Page.navigate', { url: BASE + path }, s); await sleep(ms); };
  const cerrar = async () => { listeners.splice(listeners.indexOf(f), 1); await send('Target.disposeBrowserContext', { browserContextId: ctx.browserContextId }); };
  const terceros = () => reqs.filter((u) => PROHIBIDO.test(u));
  const hosts = () => [...new Set(reqs.map((u) => { try { return new URL(u).host; } catch { return u.slice(0, 30); } }))];
  return { s, reqs, ev, ir, cerrar, terceros, hosts };
}
// Recorre los iframes (lazy) para que el navegador los cargue si tienen src.
const recorrer = `(async()=>{for(const f of document.querySelectorAll('iframe, .reel__cover')){f.scrollIntoView({block:'center'});await new Promise(r=>setTimeout(r,700));}window.scrollTo(0,document.body.scrollHeight);await new Promise(r=>setTimeout(r,1200));return 1})()`;
const esperaCC = `new Promise(r=>{let n=0;const t=setInterval(()=>{if(window.CookieConsent){clearInterval(t);r(true)}if(++n>40){clearInterval(t);r(false)}},100)})`;
const aceptar = (cats) => `(${esperaCC}).then(ok=>{ if(!ok) return 'sin CookieConsent'; CookieConsent.acceptCategory(${JSON.stringify(cats)}); return 'ok'; })`;

const FICHA = '/espectaculos/joaquin-caserza-conversaciones-con-mi-mente/';
const FICHA_CA = '/ca/espectaculos/joaquin-caserza-conversaciones-con-mi-mente/';
const LANDING = '/landing/joaquin-caserza-conversaciones-con-mi-mente/';
const REELS = '/espectaculos/barcelona-passio/';
const PAGINAS = ['/', '/ca/', FICHA, FICHA_CA, LANDING, REELS, '/politica-de-cookies/', '/ca/politica-de-cookies/'];

// 1) Sin elegir nada (primera visita) y 2) rechazando todo: cero terceros en todas las páginas.
for (const modo of ['sin elegir', 'rechazando todo']) {
  const p = await nuevaPestana();
  for (const pg of PAGINAS) {
    p.reqs.length = 0;
    await p.ir(pg);
    if (modo === 'rechazando todo') { await p.ev(aceptar([])); await sleep(800); }
    await p.ev(recorrer);
    if (pg === REELS) {
      // Pulsar un reel sin consentimiento: no se carga y se abre el panel de cookies.
      const r = await p.ev(`(()=>{const b=document.querySelector('.reel__cover');if(!b)return 'sin reels';b.click();return 'ok'})()`);
      await sleep(1500);
      const panel = await p.ev(`!!(document.querySelector('#cc-main .pm') && getComputedStyle(document.querySelector('#cc-main .pm')).visibility!=='hidden' && document.documentElement.classList.contains('show--preferences'))`);
      const iframe = await p.ev(`!!document.querySelector('.reel__cover iframe')`);
      check(`[${modo}] reel pulsado sin consentimiento: no carga y abre el panel`, r === 'ok' && panel && !iframe, `click=${r} panel=${panel} iframe=${iframe}`);
      const aviso = await p.ev(`getComputedStyle(document.querySelector('.reels__aviso')).display`);
      check(`[${modo}] aviso de reels visible`, aviso !== 'none', aviso);
    }
    if (pg === FICHA || pg === LANDING || pg === '/') {
      const gate = await p.ev(`(()=>{const g=document.querySelector('.consent-gate');return g?getComputedStyle(g).display:'no hay'})()`);
      check(`[${modo}] ${pg} aviso visible`, gate === 'flex', gate);
    }
    const fuentes = p.reqs.filter((u) => u.includes('/fonts/') && u.startsWith(BASE));
    const t = p.terceros();
    check(`[${modo}] ${pg} sin terceros`, t.length === 0, t.length ? t.slice(0, 5).join(' | ') : `fuentes locales: ${fuentes.length}; hosts: ${p.hosts().join(', ')}`);
  }
  await p.cerrar();
}

// 3) Solo marketing: cargan YouTube (ficha y landing), mapa, reel al pulsar y el píxel de Meta; Analytics no.
{
  const p = await nuevaPestana();
  await p.ir('/');
  await p.ev(aceptar(['marketing']));
  await sleep(1000);
  for (const pg of ['/', FICHA, LANDING, REELS]) {
    p.reqs.length = 0;
    await p.ir(pg, 4000);
    await p.ev(recorrer);
    if (pg === REELS) {
      await p.ev(`document.querySelector('.reel__cover').click()`);
      await sleep(4000);
    }
    const t = p.terceros();
    const quiere = pg === '/' ? /google\.[a-z.]+\/maps|maps\.google/ : pg === REELS ? /instagram|tiktok/ : /youtube/;
    const gate = await p.ev(`(()=>{const g=document.querySelector('.consent-gate, .reels__aviso');return g?getComputedStyle(g).display:'no hay'})()`);
    check(`[solo marketing] ${pg} carga el tercero y oculta el aviso`, t.some((u) => quiere.test(u)) && gate === 'none', `aviso=${gate}; ${[...new Set(t.map((u) => new URL(u).host))].join(', ')}`);
    check(`[solo marketing] ${pg} píxel de Meta (bloqueado) sí, Analytics no`, t.some((u) => META.test(u)) && !t.some((u) => GA.test(u) || GTM_JS.test(u)), [...new Set(t.map((u) => new URL(u).host))].join(', '));
  }
  // 4) Retirar el marketing: la página se recarga y el vídeo vuelve a quedar sin cargar.
  await p.ir(FICHA, 4000);
  p.reqs.length = 0;
  await p.ev(`CookieConsent.acceptCategory([])`);
  await sleep(4000);
  p.reqs.length = 0; // lo que venga tras la recarga
  await sleep(100);
  await p.ev(recorrer);
  const src = await p.ev(`(()=>{const f=document.querySelector('iframe[data-consent-src]');return f?(f.getAttribute('src')||'(sin src)'):'no hay'})()`);
  check('[retirar marketing] tras recargar, YouTube sin src y sin peticiones', src === '(sin src)' && p.terceros().length === 0, `src=${src}; ${p.terceros().slice(0, 3).join(' | ')}`);
  await p.cerrar();
}

// 3b) Solo estadística: se pide gtag.js (bloqueado) y la actualización del consent mode va
// antes que la configuración de Analytics; ni Meta ni contenido de terceros.
{
  const p = await nuevaPestana();
  await p.ir('/');
  p.reqs.length = 0;
  await p.ev(aceptar(['analytics']));
  await sleep(1500);
  const t0 = p.terceros();
  check('[solo estadística] al aceptar, Analytics (bloqueado) se pide sin recargar; Meta no', t0.some((u) => GA.test(u)) && !t0.some((u) => META.test(u)), [...new Set(t0.map((u) => new URL(u).host))].join(', '));
  const orden = await p.ev(`(()=>{const dl=(window.dataLayer||[]).map(x=>x&&x[0]==='consent'?'consent-'+x[1]+(x[2]&&x[2].analytics_storage?'-'+x[2].analytics_storage:''):(x&&x[0])||'');return dl.join(',')})()`);
  const iU = orden.indexOf('consent-update-granted'), iC = orden.indexOf('config');
  check('[solo estadística] consent mode actualizado antes de configurar Analytics', iU !== -1 && iC !== -1 && iU < iC, orden);
  for (const pg of ['/', FICHA]) {
    p.reqs.length = 0;
    await p.ir(pg, 4000);
    await p.ev(recorrer);
    const t = p.terceros();
    check(`[solo estadística] ${pg} Analytics sí; Meta, gtm.js y terceros de marketing no`, t.some((u) => GA.test(u)) && t.every((u) => GA.test(u)), [...new Set(t.map((u) => new URL(u).host))].join(', '));
  }
  await p.cerrar();
}

// 4b) Retirar todo después de aceptarlo: recarga, borra _ga/_fbp y no vuelve a pedir Analytics ni Meta.
{
  const p = await nuevaPestana();
  await p.ir('/');
  await p.ev(aceptar('all'));
  await sleep(1500);
  await p.ir('/', 3000);
  await p.ev(`(()=>{document.cookie='_ga=GA1.1.1.1; path=/';document.cookie='_ga_3LC1FMXQFM=GS1.1; path=/';document.cookie='_fbp=fb.1.1.1; path=/';return document.cookie})()`);
  await p.ev(`CookieConsent.acceptCategory([])`);
  await sleep(1000);
  p.reqs.length = 0; // lo que venga tras la recarga
  await sleep(3500);
  await p.ev(recorrer);
  const ck = await p.ev(`document.cookie`);
  const t = p.terceros();
  const nav = await p.ev(`performance.getEntriesByType('navigation')[0].type`);
  check('[retirar todo] recarga, sin Analytics ni Meta y sin _ga/_fbp', nav === 'reload' && t.length === 0 && !/(^|; )_(ga|fbp)/.test(ck), `nav=${nav}; cookies=${ck}; ${t.slice(0, 3).join(' | ')}`);
  await p.cerrar();
}

// 5) Reel pendiente: sin consentimiento se pulsa, se acepta el marketing en el panel y el reel se carga solo.
{
  const p = await nuevaPestana();
  await p.ir(REELS, 4000);
  await p.ev(`document.querySelector('.reel__cover').click()`);
  await sleep(800);
  await p.ev(`CookieConsent.acceptCategory(['marketing'])`);
  await sleep(4000);
  const iframe = await p.ev(`!!document.querySelector('.reel__cover iframe')`);
  check('[reel pendiente] al aceptar marketing en el panel, el reel pulsado se carga', iframe && p.terceros().some((u) => /instagram|tiktok/.test(u)), '');
  await p.cerrar();
}

// 5b) Reel pendiente con la estadística ya aceptada: al aceptar también el marketing el
// reel pulsado se carga (y el píxel de Meta salta sin recargar, E271).
{
  const p = await nuevaPestana();
  await p.ir(REELS, 4000);
  await p.ev(`CookieConsent.acceptCategory(['analytics'])`);
  await sleep(1500);
  await p.ev(`document.querySelector('.reel__cover').click()`);
  await sleep(800);
  await p.ev(`CookieConsent.acceptCategory(['analytics','marketing'])`);
  await sleep(6000);
  const iframe = await p.ev(`!!document.querySelector('.reel__cover iframe')`);
  const nav = await p.ev(`performance.getEntriesByType('navigation')[0].type`);
  check('[reel pendiente con estadística previa] el reel pulsado se carga sin recargar y Meta (bloqueado) se pide', iframe && p.terceros().some((u) => /instagram|tiktok/.test(u)) && p.terceros().some((u) => META.test(u)) && nav !== 'reload', `iframe=${iframe} nav=${nav}`);
  await p.cerrar();
}

// 6) Todo aceptado: además se piden Analytics y Meta (bloqueados en este navegador); gtm.js no.
{
  const p = await nuevaPestana();
  await p.ir(FICHA);
  p.reqs.length = 0;
  await p.ev(aceptar('all'));
  await sleep(3000);
  await p.ev(recorrer);
  const t = p.terceros();
  check('[todo] YouTube, Analytics y Meta (bloqueados) se piden; gtm.js no', t.some((u) => /youtube/.test(u)) && t.some((u) => GA.test(u)) && t.some((u) => META.test(u)) && !t.some((u) => GTM_JS.test(u)), [...new Set(t.map((u) => new URL(u).host))].join(', '));
  await p.cerrar();
}

// 6b) Pantallas estrechas (320 y 375 px) sin marketing: el aviso no se sale por ningún lado
// (ni sus botones), y la página no se desplaza en horizontal. Con marketing, el vídeo
// recupera su 16:9.
{
  const p = await nuevaPestana();
  const midos = `JSON.stringify([...document.querySelectorAll('.consent-gate')].filter(g=>getComputedStyle(g).display!=='none').map(g=>{const c=g.parentElement.getBoundingClientRect();const fuera=[g,...g.querySelectorAll('*')].map(e=>e.getBoundingClientRect()).filter(r=>r.width&&(r.left<c.left-0.5||r.right>c.right+0.5||r.top<c.top-0.5||r.bottom>c.bottom+0.5)).length;return {fuera,ancho:Math.round(c.width),alto:Math.round(c.height)}}).concat([{scroll:document.documentElement.scrollWidth-innerWidth}]))`;
  for (const w of [320, 375]) {
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: 740, deviceScaleFactor: 1, mobile: true }, p.s);
    for (const pg of [FICHA_CA, FICHA, LANDING, '/', '/ca/']) {
      await p.ir(pg, 3000);
      await p.ev(aceptar([])); await sleep(500);
      const r = JSON.parse(await p.ev(midos));
      const scroll = r.pop().scroll;
      check(`[${w}px] ${pg} aviso dentro de su recuadro y sin scroll horizontal`, r.length > 0 && r.every((x) => x.fuera === 0) && scroll <= 0, JSON.stringify(r) + ` scroll=${scroll}`);
    }
  }
  await p.ir(FICHA, 3000);
  await p.ev(aceptar(['marketing'])); await sleep(1200);
  const prop = await p.ev(`(()=>{const r=document.querySelector('.show__video').getBoundingClientRect();return Math.round(r.width/r.height*100)/100})()`);
  check('[375px, marketing] el vídeo vuelve a 16:9', Math.abs(prop - 16 / 9) < 0.03, String(prop));
  await p.cerrar();
}

// 7) En el HTML generado ningún iframe lleva src: todos esperan al consentimiento.
{
  const { readdirSync } = await import('node:fs');
  const malos = [];
  const andar = (d) => readdirSync(d, { withFileTypes: true }).forEach((e) => {
    const f = join(d, e.name);
    if (e.isDirectory()) return andar(f);
    if (!f.endsWith('.html')) return;
    const html = readFileSync(f, 'utf8');
    for (const m of html.matchAll(/<iframe\b[^>]*>/gi)) if (/[\s/]src(doc)?\s*=/i.test(m[0])) malos.push(`${f.slice(DIST.length)}: ${m[0].slice(0, 90)}`);
  });
  andar(DIST);
  check('[dist] ningún <iframe> con src en el HTML generado', malos.length === 0, malos.slice(0, 3).join(' | '));
}

check('[toda la prueba] Google Tag Manager (gtm.js) no se pide nunca', !todas.some((u) => GTM_JS.test(u)), todas.filter((u) => GTM_JS.test(u)).slice(0, 2).join(' | '));

const fallos = resultados.filter((r) => !r.ok).length;
console.log(`\n${resultados.length - fallos}/${resultados.length} comprobaciones OK`);
await send('Browser.close');
ws.close();
server.close();
setTimeout(() => { try { chrome.kill(); } catch {} try { rmSync(prof, { recursive: true, force: true }); } catch {} process.exit(fallos ? 1 : 0); }, 1500);
