// node plugins/prueba-terceros.mjs — comprueba remark-terceros (E267).
import assert from 'node:assert/strict';
import { aplazaIframes } from './remark-terceros.mjs';

const casos = [
  ['<iframe src="https://www.youtube.com/embed/x"></iframe>', '<iframe data-consent-src="https://www.youtube.com/embed/x"></iframe>'],
  ['<IFRAME width="560" SRC=\'https://x\'></IFRAME>', '<IFRAME width="560" data-consent-src=\'https://x\'></IFRAME>'],
  ['<iframe\n  title="a"\n  src = "https://x"></iframe>', '<iframe\n  title="a"\n  data-consent-src = "https://x"></iframe>'],
  ['<iframe data-src="a" src="b"></iframe>', '<iframe data-src="a" data-consent-src="b"></iframe>'],
  ['<img src="/foto.jpg">', '<img src="/foto.jpg">'],
  ['<p>sin nada</p>', '<p>sin nada</p>'],
];
for (const [entra, sale] of casos) assert.equal(aplazaIframes(entra), sale, entra);
console.log(`remark-terceros: ${casos.length} casos OK`);
