// Iframes pegados a mano en una sinopsis (E267).
//
// El gestor deja escribir HTML dentro del texto, y un <iframe src="https://www.youtube.com/…">
// pegado ahí se cargaría al abrir la ficha aunque el visitante haya rechazado las cookies.
// Aquí se le cambia `src` por `data-consent-src` (y `srcdoc` por `data-consent-srcdoc`): el
// script del banner (BaseLayout) solo los restaura cuando se aceptan las cookies de
// marketing, igual que el vídeo del campo «youtube» y el mapa de la portada. Lo bueno sigue
// siendo usar el campo «youtube» de la ficha, que además pone el aviso con «Configurar cookies».
//
// La etiqueta se recorre atributo a atributo con las mismas reglas que el navegador
// (tokenizador de HTML): un `>` dentro de un valor entre comillas no la corta, un valor sin
// comillas llega hasta el siguiente espacio o `>` aunque lleve `=` o `?`, y si hay dos `src`
// se cambian los dos. Los tres casos los encontró Codex en la revisión.
//
// Solo se tocan los nodos `html` del markdown (ahí vive el HTML pegado); el texto no.
// Vale igual para la colección en catalán y las landings: pasan por el mismo procesador.
// Las pruebas están en plugins/prueba-terceros.mjs.

const ABRE_IFRAME = /<iframe(?=[\s/>]|$)/gi;
const APLAZAR = new Set(['src', 'srcdoc']);
const esEspacio = (c) => c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\f';

/** Devuelve el HTML con el `src` y el `srcdoc` de cada iframe convertidos en `data-consent-*`. */
export function aplazaIframes(html) {
  const n = html.length;
  let salida = '';
  let desde = 0;
  ABRE_IFRAME.lastIndex = 0;
  let m;
  while ((m = ABRE_IFRAME.exec(html))) {
    let i = m.index + m[0].length;
    for (;;) {
      // Antes de cada atributo: espacios y barras sueltas.
      while (i < n && (esEspacio(html[i]) || html[i] === '/')) i++;
      if (i >= n || html[i] === '>') break;
      // Nombre: hasta espacio, /, > o =. Un = en primera posición forma parte del nombre.
      const inicioNombre = i;
      if (html[i] === '=') i++;
      while (i < n && !esEspacio(html[i]) && html[i] !== '/' && html[i] !== '>' && html[i] !== '=') i++;
      const nombre = html.slice(inicioNombre, i);
      if (APLAZAR.has(nombre.toLowerCase())) {
        salida += html.slice(desde, inicioNombre) + 'data-consent-' + nombre.toLowerCase();
        desde = i;
      }
      // Valor, si lo hay.
      let j = i;
      while (j < n && esEspacio(html[j])) j++;
      if (html[j] !== '=') continue;
      j++;
      while (j < n && esEspacio(html[j])) j++;
      if (html[j] === '"' || html[j] === "'") {
        const cierre = html.indexOf(html[j], j + 1);
        j = cierre === -1 ? n : cierre + 1;
      } else {
        while (j < n && !esEspacio(html[j]) && html[j] !== '>') j++;
      }
      i = j;
    }
    ABRE_IFRAME.lastIndex = i;
  }
  return salida + html.slice(desde);
}

function recorre(nodo) {
  if (nodo.type === 'html' && typeof nodo.value === 'string') nodo.value = aplazaIframes(nodo.value);
  if (Array.isArray(nodo.children)) nodo.children.forEach(recorre);
}

export default function remarkTerceros() {
  return (arbol) => recorre(arbol);
}
