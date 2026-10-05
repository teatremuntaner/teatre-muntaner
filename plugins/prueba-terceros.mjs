// node plugins/prueba-terceros.mjs — comprueba remark-terceros (E267).
import assert from 'node:assert/strict';
import { aplazaIframes } from './remark-terceros.mjs';

const casos = [
  ['<iframe src="https://www.youtube.com/embed/x"></iframe>', '<iframe data-consent-src="https://www.youtube.com/embed/x"></iframe>'],
  ['<IFRAME width="560" SRC=\'https://x\'></IFRAME>', '<IFRAME width="560" data-consent-src=\'https://x\'></IFRAME>'],
  ['<iframe\n  title="a"\n  src = "https://x"></iframe>', '<iframe\n  title="a"\n  data-consent-src = "https://x"></iframe>'],
  ['<iframe data-src="a" src="b"></iframe>', '<iframe data-src="a" data-consent-src="b"></iframe>'],
  // Lo que encontró Codex: un > dentro de un valor entre comillas, y dos src.
  ['<iframe title="Actores > 18" src="https://y"></iframe>', '<iframe title="Actores > 18" data-consent-src="https://y"></iframe>'],
  ['<iframe title="ejemplo src=video" src="https://y"></iframe>', '<iframe title="ejemplo src=video" data-consent-src="https://y"></iframe>'],
  ['<iframe src="https://a" src="https://b"></iframe>', '<iframe data-consent-src="https://a" data-consent-src="https://b"></iframe>'],
  ['<iframe src=https://y allowfullscreen></iframe>', '<iframe data-consent-src=https://y allowfullscreen></iframe>'],
  ['<iframe/src="https://y"></iframe>', '<iframe/data-consent-src="https://y"></iframe>'],
  ['<iframe srcdoc="<p>x</p>"></iframe>', '<iframe data-consent-srcdoc="<p>x</p>"></iframe>'],
  ['<p>a</p><iframe src="1"></iframe><iframe src="2"></iframe>', '<p>a</p><iframe data-consent-src="1"></iframe><iframe data-consent-src="2"></iframe>'],
  // Ronda 3 de Codex: valor sin comillas con = y ?, que no debe cortar el recorrido.
  ['<iframe title=YouTube?x=1 src="https://y"></iframe>', '<iframe title=YouTube?x=1 data-consent-src="https://y"></iframe>'],
  ['<iframe a=b=c src=https://y?v=1&t=2></iframe>', '<iframe a=b=c data-consent-src=https://y?v=1&t=2></iframe>'],
  ['<iframe x"y=1 src="https://y"></iframe>', '<iframe x"y=1 data-consent-src="https://y"></iframe>'],
  ['<iframe =a src="https://y"></iframe>', '<iframe =a data-consent-src="https://y"></iframe>'],
  ['<iframe title = \'a > b\' SRC = "https://y" >', '<iframe title = \'a > b\' data-consent-src = "https://y" >'],
  ['<iframes src="x">', '<iframes src="x">'],
  ['<img src="/foto.jpg">', '<img src="/foto.jpg">'],
  ['<p>sin nada</p>', '<p>sin nada</p>'],
];
for (const [entra, sale] of casos) assert.equal(aplazaIframes(entra), sale, entra);

// Con textos: la misma fachada que VideoYoutube.astro (aviso + «Configurar cookies» + enlace).
const T = { video: 'VID', contenido: 'CONT', configurar: 'CONF', verEnYoutube: 'YT', abrir: 'ABRIR' };
const yt = aplazaIframes('<iframe width="560" src="https://www.youtube.com/embed/0MeVPwmADt8?si=a&amp;b=1"></iframe>', T);
assert.ok(yt.startsWith('<div class="consent-embed"><iframe width="560" data-consent-src="https://www.youtube.com/embed/0MeVPwmADt8?si=a&amp;b=1"></iframe><div class="consent-gate"><p>VID</p>'), yt);
assert.ok(yt.includes('data-cc="show-preferences">CONF</button>'), yt);
assert.ok(yt.includes('href="https://www.youtube.com/watch?v=0MeVPwmADt8"') && yt.includes('>YT ↗</a>'), yt);
assert.ok(yt.endsWith('</div></div></div>'), yt);
assert.ok(!/\ssrc=/.test(yt), yt);
const otro = aplazaIframes('<p>a</p><iframe src="https://x.example/v?a=1&b=<2>"></iframe><p>b</p>', T);
assert.ok(otro.includes('<p>CONT</p>') && otro.includes('href="https://x.example/v?a=1&amp;b=&lt;2&gt;"') && otro.includes('>ABRIR ↗<'), otro);
assert.ok(otro.startsWith('<p>a</p><div class="consent-embed">') && otro.endsWith('</div></div></div><p>b</p>'), otro);
// Sin cierre en el mismo trozo (iframe dentro de una línea): el aviso va delante.
const suelto = aplazaIframes('<iframe src="https://www.youtube.com/embed/0MeVPwmADt8">', T);
assert.ok(suelto.startsWith('<div class="consent-gate">') && suelto.endsWith('<iframe data-consent-src="https://www.youtube.com/embed/0MeVPwmADt8">'), suelto);
// Sin src (srcdoc) y con un src que no es web: aviso sin enlace.
assert.ok(!aplazaIframes('<iframe srcdoc="<p>x</p>"></iframe>', T).includes('<a '));
assert.ok(!aplazaIframes('<iframe src="javascript:alert(1)"></iframe>', T).includes('<a '));
// Dos iframes seguidos: dos envoltorios.
assert.equal(aplazaIframes('<iframe src="1"></iframe><iframe src="2"></iframe>', T).split('consent-embed').length - 1, 2);
console.log(`remark-terceros: ${casos.length} casos + fachada OK`);
