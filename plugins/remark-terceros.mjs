// Iframes pegados a mano en una sinopsis (E267).
//
// El gestor deja escribir HTML dentro del texto, y un <iframe src="https://www.youtube.com/…">
// pegado ahí se cargaría al abrir la ficha aunque el visitante haya rechazado las cookies.
// Aquí se le cambia `src` por `data-consent-src` (y `srcdoc` por `data-consent-srcdoc`): el
// script del banner (BaseLayout) solo los restaura cuando se aceptan las cookies de
// marketing, igual que el vídeo del campo «youtube» y el mapa de la portada.
//
// Y se le pone la misma fachada que a ese vídeo (src/components/VideoYoutube.astro): el
// aviso con «Configurar cookies» y un enlace para verlo en su web («Ver en YouTube» si es
// de YouTube). Sin ella quedaba un recuadro vacío sin explicación. Lo bueno sigue siendo
// usar el campo «youtube» de la ficha.
//
// La etiqueta se recorre atributo a atributo con las mismas reglas que el navegador
// (tokenizador de HTML): un `>` dentro de un valor entre comillas no la corta, un valor sin
// comillas llega hasta el siguiente espacio o `>` aunque lleve `=` o `?`, y si hay dos `src`
// se cambian los dos. Los tres casos los encontró Codex en la revisión.
//
// Solo se tocan los nodos `html` del markdown (ahí vive el HTML pegado); el texto no.
// Vale igual para la colección en catalán (textos en catalán) y las landings.
// Las pruebas están en plugins/prueba-terceros.mjs.

import { readFileSync } from 'node:fs';

const ABRE_IFRAME = /<iframe(?=[\s/>]|$)/gi;
// Cierre tal como lo reconoce el navegador: «</iframe» seguido de espacio, / o >, hasta el
// primer >. Así valen también «</iframe/>» y «</iframe foo>» (lo encontró Codex: con
// «\s*>» se saltaba hasta el cierre del iframe siguiente y ese se quedaba con su src).
const CIERRA_IFRAME = /<\/iframe(?=[\s/>])[^>]*>/gi;
const APLAZAR = new Set(['src', 'srcdoc']);
const esEspacio = (c) => c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\f';
const escapa = (t) => String(t).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const desescapa = (t) => t.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'");

/** Lee los atributos de la etiqueta que empieza en `i` (justo tras «<iframe»). */
function leeEtiqueta(html, i) {
  const n = html.length;
  const atributos = [];
  for (;;) {
    while (i < n && (esEspacio(html[i]) || html[i] === '/')) i++;
    if (i >= n || html[i] === '>') break;
    // Nombre: hasta espacio, /, > o =. Un = en primera posición forma parte del nombre.
    const ini = i;
    if (html[i] === '=') i++;
    while (i < n && !esEspacio(html[i]) && html[i] !== '/' && html[i] !== '>' && html[i] !== '=') i++;
    const at = { ini, fin: i, nombre: html.slice(ini, i).toLowerCase(), valor: '' };
    atributos.push(at);
    let j = i;
    while (j < n && esEspacio(html[j])) j++;
    if (html[j] !== '=') continue;
    j++;
    while (j < n && esEspacio(html[j])) j++;
    if (html[j] === '"' || html[j] === "'") {
      const cierre = html.indexOf(html[j], j + 1);
      at.valor = html.slice(j + 1, cierre === -1 ? n : cierre);
      j = cierre === -1 ? n : cierre + 1;
    } else {
      const v0 = j;
      while (j < n && !esEspacio(html[j]) && html[j] !== '>') j++;
      at.valor = html.slice(v0, j);
    }
    i = j;
  }
  return { atributos, fin: i < n ? i + 1 : n };
}

/** El aviso de consentimiento para un iframe cuyo `src` es `src`. */
function fachada(src, textos) {
  const url = desescapa(src || '').trim();
  const yt = url.match(/(?:youtube(?:-nocookie)?\.com\/embed\/|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  let enlace = null;
  if (yt) enlace = { href: `https://www.youtube.com/watch?v=${yt[1]}`, texto: textos.verEnYoutube };
  else if (/^https?:\/\//i.test(url)) enlace = { href: url, texto: textos.abrir };
  return (
    '<div class="consent-gate">' +
    `<p>${escapa(yt ? textos.video : textos.contenido)}</p>` +
    '<div class="consent-gate__acciones">' +
    `<button type="button" class="consent-gate__btn consent-gate__btn--main" data-cc="show-preferences">${escapa(textos.configurar)}</button>` +
    (enlace ? `<a class="consent-gate__btn" href="${escapa(enlace.href)}" target="_blank" rel="noopener">${escapa(enlace.texto)} ↗</a>` : '') +
    '</div></div>'
  );
}

/**
 * Devuelve el HTML con el `src` y el `srcdoc` de cada iframe convertidos en `data-consent-*`.
 * Con `textos`, además envuelve cada iframe en <div class="consent-embed"> con su aviso.
 */
export function aplazaIframes(html, textos) {
  let salida = '';
  let desde = 0;
  ABRE_IFRAME.lastIndex = 0;
  let m;
  while ((m = ABRE_IFRAME.exec(html))) {
    const { atributos, fin } = leeEtiqueta(html, m.index + m[0].length);
    // ¿Dónde acaba el iframe? Si el cierre está en este mismo trozo, se envuelve entero;
    // si no (iframe dentro de una línea de texto), el aviso va justo delante.
    let finIframe = -1;
    if (textos) {
      CIERRA_IFRAME.lastIndex = fin;
      const c = CIERRA_IFRAME.exec(html);
      if (c) finIframe = c.index + c[0].length;
    }
    salida += html.slice(desde, m.index);
    const src = atributos.find((a) => a.nombre === 'src')?.valor;
    if (textos) salida += finIframe !== -1 ? '<div class="consent-embed">' : fachada(src, textos);
    desde = m.index;
    for (const a of atributos) {
      if (!APLAZAR.has(a.nombre)) continue;
      salida += html.slice(desde, a.ini) + 'data-consent-' + a.nombre;
      desde = a.fin;
    }
    if (finIframe !== -1) {
      salida += html.slice(desde, finIframe) + fachada(src, textos) + '</div>';
      desde = finIframe;
    }
    ABRE_IFRAME.lastIndex = Math.max(fin, desde);
  }
  return salida + html.slice(desde);
}

// Textos de los avisos, en el idioma de cada ficha (los mismos de src/i18n).
function cargaTextos(lang) {
  const ui = JSON.parse(readFileSync(new URL(`../src/i18n/ui.${lang}.json`, import.meta.url), 'utf8'));
  const t = (k) => ui[`terceros.${k}`];
  return { video: t('video'), contenido: t('contenido'), configurar: t('configurar'), verEnYoutube: t('verEnYoutube'), abrir: t('abrir') };
}

function recorre(nodo, textos) {
  if (nodo.type === 'html' && typeof nodo.value === 'string') nodo.value = aplazaIframes(nodo.value, textos);
  if (Array.isArray(nodo.children)) nodo.children.forEach((h) => recorre(h, textos));
}

export default function remarkTerceros() {
  const textos = { es: cargaTextos('es'), ca: cargaTextos('ca') };
  return (arbol, archivo) => {
    const ruta = String(archivo?.path ?? '').replace(/\\/g, '/');
    recorre(arbol, /\/espectaculos-ca\//.test(ruta) ? textos.ca : textos.es);
  };
}
