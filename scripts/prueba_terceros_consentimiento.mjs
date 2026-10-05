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
// Bloqueados en el navegador de prueba (Analytics, GTM y Meta reales).
const BLOQUEO = ['*googletagmanager.com*', '*google-analytics.com*', '*analytics.google.com*', '*doubleclick.net*', '*connect.facebook.net*', '*facebook.com*', '*facebook.net*'];

const resultados = [];
function check(nombre, ok, detalle) { resultados.push({ nombre, ok, detalle }); console.log(`${ok ? 'OK  ' : 'FALLO'} ${nombre}${detalle ? ' — ' + detalle : ''}`); }

async function nuevaPestana() {
  const { result: ctx } = await send('Target.createBrowserContext', { disposeOnDetach: true });
  const { result: t } = await send('Target.createTarget', { url: 'about:blank', browserContextId: ctx.browserContextId });
  const { result: att } = await send('Target.attachToTarget', { targetId: t.targetId, flatten: true });
  const s = att.sessionId;
  const reqs = [];
  const f = (m) => { if (m.sessionId === s && m.method === 'Network.requestWillBeSent') reqs.push(m.params.request.url); };
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

// 3) Solo marketing: cargan YouTube (ficha y landing), mapa y reel al pulsar; GTM no (exige estadística).
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
    check(`[solo marketing] ${pg} sin GTM/Analytics/Meta`, !t.some((u) => /googletagmanager|google-analytics|facebook/.test(u)), '');
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

// 6) Todo aceptado: además se intenta cargar GTM (bloqueado en este navegador).
{
  const p = await nuevaPestana();
  await p.ir(FICHA);
  p.reqs.length = 0;
  await p.ev(aceptar('all'));
  await sleep(3000);
  await p.ev(recorrer);
  const t = p.terceros();
  check('[todo] YouTube y GTM (bloqueado) se piden', t.some((u) => /youtube/.test(u)) && t.some((u) => /googletagmanager/.test(u)), [...new Set(t.map((u) => new URL(u).host))].join(', '));
  await p.cerrar();
}

const fallos = resultados.filter((r) => !r.ok).length;
console.log(`\n${resultados.length - fallos}/${resultados.length} comprobaciones OK`);
await send('Browser.close');
ws.close();
server.close();
setTimeout(() => { try { chrome.kill(); } catch {} try { rmSync(prof, { recursive: true, force: true }); } catch {} process.exit(fallos ? 1 : 0); }, 1500);
