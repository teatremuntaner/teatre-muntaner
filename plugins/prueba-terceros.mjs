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
  ['<iframes src="x">', '<iframes src="x">'],
  ['<img src="/foto.jpg">', '<img src="/foto.jpg">'],
  ['<p>sin nada</p>', '<p>sin nada</p>'],
];
for (const [entra, sale] of casos) assert.equal(aplazaIframes(entra), sale, entra);
console.log(`remark-terceros: ${casos.length} casos OK`);
