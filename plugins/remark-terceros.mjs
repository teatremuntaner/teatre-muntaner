// Iframes pegados a mano en una sinopsis (E267).
//
// El gestor deja escribir HTML dentro del texto, y un <iframe src="https://www.youtube.com/…">
// pegado ahí se cargaría al abrir la ficha aunque el visitante haya rechazado las cookies.
// Aquí se le cambia `src` por `data-consent-src`: el script del banner (BaseLayout) solo lo
// carga cuando se aceptan las cookies de marketing, igual que el vídeo del campo «youtube»
// y el mapa de la portada. Lo bueno sigue siendo usar el campo «youtube» de la ficha, que
// además pone el aviso con «Configurar cookies».
//
// Solo se tocan los nodos `html` del markdown (ahí vive el HTML pegado); el texto no.
// Vale igual para la colección en catalán, que pasa por el mismo procesador.
// Las pruebas están en plugins/prueba-terceros.mjs.

const IFRAME_SRC = /(<iframe\b[^>]*?\s)src(\s*=)/gi;

/** Devuelve el HTML con el `src` de cada iframe convertido en `data-consent-src`. */
export function aplazaIframes(html) {
  return html.replace(IFRAME_SRC, '$1data-consent-src$2');
}

function recorre(nodo) {
  if (nodo.type === 'html' && typeof nodo.value === 'string') nodo.value = aplazaIframes(nodo.value);
  if (Array.isArray(nodo.children)) nodo.children.forEach(recorre);
}

export default function remarkTerceros() {
  return (arbol) => recorre(arbol);
}
