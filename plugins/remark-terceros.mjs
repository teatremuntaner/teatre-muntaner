// Iframes pegados a mano en una sinopsis (E267).
//
// El gestor deja escribir HTML dentro del texto, y un <iframe src="https://www.youtube.com/…">
// pegado ahí se cargaría al abrir la ficha aunque el visitante haya rechazado las cookies.
// Aquí se le cambia `src` por `data-consent-src`: el script del banner (BaseLayout) solo lo
// carga cuando se aceptan las cookies de marketing, igual que el vídeo del campo «youtube»
// y el mapa de la portada. Lo bueno sigue siendo usar el campo «youtube» de la ficha, que
// además pone el aviso con «Configurar cookies».
//
// La etiqueta se recorre atributo a atributo, respetando las comillas: un `>` dentro de un
// valor (title="Mayores > 18") no la corta, y si hay dos `src` se cambian los dos (lo
// encontró Codex en la revisión). También `srcdoc`, que mete una página entera dentro.
//
// Solo se tocan los nodos `html` del markdown (ahí vive el HTML pegado); el texto no.
// Vale igual para la colección en catalán y las landings: pasan por el mismo procesador.
// Las pruebas están en plugins/prueba-terceros.mjs.

const ABRE_IFRAME = /<iframe(?=[\s/>])/gi;
// Un atributo HTML: nombre, y opcionalmente = valor (entre comillas dobles, simples o sin ellas).
const ATRIBUTO = /([\s/]*)([^\s"'>\/=]+)(\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?/y;
const APLAZAR = new Set(['src', 'srcdoc']);

/** Devuelve el HTML con el `src` (y `srcdoc`) de cada iframe convertido en `data-consent-*`. */
export function aplazaIframes(html) {
  let salida = '';
  let desde = 0;
  ABRE_IFRAME.lastIndex = 0;
  let m;
  while ((m = ABRE_IFRAME.exec(html))) {
    let i = m.index + m[0].length;
    salida += html.slice(desde, i);
    for (;;) {
      ATRIBUTO.lastIndex = i;
      const a = ATRIBUTO.exec(html);
      if (!a || a[0] === '') break;
      const nombre = a[2];
      salida += a[1] + (APLAZAR.has(nombre.toLowerCase()) ? `data-consent-${nombre.toLowerCase()}` : nombre) + (a[3] ?? '');
      i = ATRIBUTO.lastIndex;
    }
    desde = i;
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
