// La regla de limpieza de espacios, en un solo sitio.
//
// Las sinopsis las escriben las compañías y llegan por correo; alguien las pega en el
// gestor (/admin) tal cual. Al pegar desde Word o Google Docs viajan dos cosas que no se
// ven al escribirlas y sí se ven publicadas:
//
//   · ESPACIOS DUROS (U+00A0). Se quedan donde había una negrita: el editor se come los
//     asteriscos y deja el hueco. En la página se lee «En  Doctora Amor».
//   · ESPACIOS DELANTE DE UN SIGNO. El cierre de la negrita separaba la palabra de la
//     coma o del punto, y al desaparecer queda «muy particular .».
//
// Teo lo avisó el 28/08/2026 con la sinopsis de Doctora Amor. Al medirlo no era un caso
// suelto: 7 de los 30 espectáculos del Sofía y 6 de los 21 del Muntaner tenían lo mismo.
//
// Esto vive aparte porque lo usan DOS caminos distintos y tienen que decir lo mismo:
//   · plugins/remark-espacios.mjs, que limpia el cuerpo de la sinopsis al compilarla;
//   · la descripción para buscadores y redes de src/pages/espectaculos/[...slug].astro
//     y de src/pages/landing/[...slug].astro, que NO sale del markdown compilado sino
//     del texto en bruto, y por tanto el plugin no la alcanza.
//
// Ese segundo camino se descubrió probándolo de verdad: con el plugin puesto, la página
// salía limpia y la etiqueta <meta name="description"> seguía diciendo «Doctora Amor ,».

// Escrito con el código del carácter y no con el carácter: un espacio duro dentro de una
// expresión regular es invisible, y nadie puede revisar lo que no ve.
const DURO = /\u00A0/g;
const REPETIDOS = / {2,}/g;
// El espacio ANTES del signo.
//
// No se mira lo que hay DELANTE, a propósito: cuando la negrita era «**...**» seguida de
// coma, remark parte el párrafo y el trozo de texto empieza justamente por « ,». Si se
// exigiera un carácter delante, ese caso no se arreglaría.
//
// Sí se mira lo que hay DETRÁS: el signo tiene que cerrar algo, es decir, llevar detrás un
// espacio o el final del texto. Sin esa condición, «versión 1 .2» se convertía en
// «versión 1.2», que ya no es la misma cifra. Lo vio Codex el 28/08/2026, y además servía
// para que el barrido de los archivos y la limpieza al publicar dijeran cosas distintas
// del mismo texto: esta condición es la que tiene scripts/limpiar_espacios.py.
const ANTES_DE_SIGNO = / +([,.;:!?»])(?=\s|$)/g;

/** Devuelve el texto sin espacios duros, sin espacios repetidos y sin espacio delante
 *  de coma, punto, punto y coma, dos puntos, cierre de interrogación o exclamación y
 *  comilla latina de cierre. No cambia ninguna palabra ni ningún signo. */
export function limpiaEspacios(texto) {
  return String(texto)
    .replace(DURO, ' ')
    .replace(REPETIDOS, ' ')
    .replace(ANTES_DE_SIGNO, '$1');
}
