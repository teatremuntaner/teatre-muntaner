// Limpia, al publicar, los espacios que las sinopsis arrastran de Word o Google Docs.
//
// La regla y el porqué están en src/lib/espacios.mjs. Aquí solo se recorre el árbol del
// markdown y se aplica donde hay texto para una persona:
//
//   · los nodos de tipo `text`;
//   · el `alt` de una imagen y el `title` de un enlace o de una imagen, que NO son hijos
//     de tipo `text` sino propiedades del nodo. Sin esto, `![alt  , sucio](foto.jpg)`
//     salía sucio en el atributo alt, que es justo lo que lee un lector de pantalla.
//
// Se saltan enteros `code`, `inlineCode` y `html`: ahí un espacio puede significar algo.
// La `url` de enlaces e imágenes no se toca nunca.
//
// NO toca los archivos, solo lo que se publica; el texto del gestor sigue siendo el que
// pegó quien lo pegó. Los que ya estaban escritos se limpiaron una vez con
// scripts/limpiar_espacios.py.
//
// Las pruebas están en plugins/prueba-espacios.mjs (`npm run test:espacios`).

import { limpiaEspacios } from '../src/lib/espacios.mjs';

// EL SIGNO PEGADO AL FINAL DE UN TROZO DE TEXTO.
//
// «version 1 .**2**» se parte en dos: el texto «version 1 .» y la negrita «2». Mirando
// solo el primero, ese punto parece cerrar la frase, y limpiarlo dejaba «version 1.2»,
// que ya no es la misma cifra.
//
// Así que un signo al final de un trozo de texto que lleva algo PEGADO detrás no se toca.
// El caso que buscábamos —«**negrita** , texto»— no se pierde: ahí el signo abre el trozo
// SIGUIENTE, no cierra el anterior. Y si detrás hay un espacio, como en
// «[texto ,](enlace) siguiente», tampoco hay nada que proteger.
//
// De paso, el barrido de los archivos y la limpieza al publicar dicen ya lo mismo.
// Los dos casos los encontró Codex el 28/08/2026.
const SIGNO_AL_FINAL = / +[,.;:!?»]$/;

/** Limpia el texto, pero deja intacto el signo final si detrás viene algo pegado. */
function limpiaConservandoElSigno(valor, pegadoDetras) {
  const cola = pegadoDetras ? (valor.match(SIGNO_AL_FINAL)?.[0] ?? '') : '';
  return limpiaEspacios(valor.slice(0, valor.length - cola.length)) + cola;
}

// Lo que va SEGUIDO en la misma línea de texto. Todo lo demás —párrafos, elementos de una
// lista, celdas de una tabla— son bloques: entre uno y el siguiente no hay nada que
// juntar, así que ahí la protección se apaga.
//
// Sin esta distinción, «primer párrafo .» seguido de otro párrafo se quedaba sin limpiar,
// porque el punto era lo último del primer párrafo y detrás «había algo». Lo encontró
// Codex el 28/08/2026.
// `break` NO está: un salto de línea duro separa, igual que un párrafo. Lo señaló Codex.
const EN_LA_MISMA_LINEA = new Set([
  'text', 'emphasis', 'strong', 'delete', 'link', 'linkReference',
  'image', 'imageReference', 'inlineCode', 'html', 'footnoteReference',
]);
// De esos, los que llevan texto dentro: son los únicos que pasan la protección a su
// último hijo, porque su contenido y lo que viene detrás sí van seguidos.
const CONTENEDOR_INLINE = new Set(['emphasis', 'strong', 'delete', 'link', 'linkReference']);

/** ¿El nodo empieza con algo que NO es un espacio? Ante la duda —una imagen, un nodo sin
 *  texto dentro— se responde que sí, que es lo prudente. */
function empiezaPegado(nodo) {
  if (!nodo || typeof nodo !== 'object') return true;
  if (typeof nodo.value === 'string')
    return nodo.value.length > 0 && !/^\s/.test(nodo.value);
  if (Array.isArray(nodo.children) && nodo.children.length > 0)
    return empiezaPegado(nodo.children[0]);
  return true;
}

function limpiaPropiedad(nodo, propiedad, pegadoDetras) {
  if (typeof nodo[propiedad] !== 'string') return;
  const limpio = limpiaConservandoElSigno(nodo[propiedad], pegadoDetras);
  if (limpio !== nodo[propiedad]) nodo[propiedad] = limpio;
}

function recorre(nodo, pegadoDetras) {
  if (!nodo || typeof nodo !== 'object') return;
  if (nodo.type === 'code' || nodo.type === 'inlineCode' || nodo.type === 'html') return;
  if (nodo.type === 'text' && typeof nodo.value === 'string') {
    const limpio = limpiaConservandoElSigno(nodo.value, pegadoDetras);
    if (limpio !== nodo.value) nodo.value = limpio;
    return;
  }
  // El `alt` de una imagen SÍ hereda: si la imagen no carga, ese texto ocupa su sitio en
  // la línea. El `title` no: es el globito que sale al pasar el ratón, no va pegado a
  // nada, así que se limpia siempre. Lo señaló Codex el 28/08/2026.
  limpiaPropiedad(nodo, 'alt', pegadoDetras);
  limpiaPropiedad(nodo, 'title', false);
  // Qué tiene detrás cada hijo:
  //   · si hay un hermano y va en la misma línea, lo que diga ese hermano;
  //   · si es el último, lo que tenga el padre, pero SOLO si el padre es de los que van
  //     seguidos (un enlace, una negrita). Si el padre es un bloque, detrás no hay nada.
  // Sin la herencia, «version [1 .](enlace)2» se publicaba como «version 1.2».
  if (Array.isArray(nodo.children))
    nodo.children.forEach((hijo, i) => {
      const siguiente = nodo.children[i + 1];
      const detras = siguiente
        ? EN_LA_MISMA_LINEA.has(siguiente.type) && empiezaPegado(siguiente)
        : CONTENEDOR_INLINE.has(nodo.type) && pegadoDetras;
      recorre(hijo, detras);
    });
}

export default function remarkEspacios() {
  return (arbol) => recorre(arbol, false);
}
