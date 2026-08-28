// Pruebas del limpiador de espacios:  npm run test:espacios
//
// Se prueba contra el procesador de markdown DE ASTRO, no contra un remark pelado: asi la
// prueba incluye GFM, las comillas tipograficas y el HTML incrustado, que es lo que de
// verdad corre al publicar. Lo pidio Codex el 28/08/2026: con un remark basico, una prueba
// podia pasar aqui y fallar en la web.
//
// Se parsea, se pasa el plugin y se compara el HTML que sale. Los casos de `alt`, `title`,
// codigo y salto duro tambien son suyos.

import { createMarkdownProcessor } from '@astrojs/markdown-remark';
import remarkEspacios from './remark-espacios.mjs';

const NB = String.fromCharCode(0xa0);   // el espacio duro, escrito para que se vea

const procesador = await createMarkdownProcessor({ remarkPlugins: [remarkEspacios] });
const html = async (md) => (await procesador.render(md)).code.trim();

const CASOS = [
  ['espacio duro suelto',
   'En' + NB + ' Doctora Amor',
   '<p>En Doctora Amor</p>'],
  ['espacio antes de coma y de punto',
   'Amor , muy particular .',
   '<p>Amor, muy particular.</p>'],
  ['negrita cerrada y luego el signo, que el barrido no puede arreglar',
   'En **Doctora Amor** , Valeria Ros',
   '<p>En <strong>Doctora Amor</strong>, Valeria Ros</p>'],
  ['comilla latina de cierre',
   'dice «hola» .',
   '<p>dice «hola».</p>'],
  ['una cifra no se junta: el signo tiene que cerrar algo',
   'version 1 .2 y ya',
   '<p>version 1 .2 y ya</p>'],
  // Un signo pegado al final de un trozo de texto que lleva algo detras no se toca: ahi
  // no esta cerrando nada. Asi el barrido y la web dicen lo mismo.
  ['un signo al final del trozo, con algo detras, no se toca',
   'texto ,**negrita**',
   '<p>texto ,<strong>negrita</strong></p>'],
  ['y por eso una cifra partida por una negrita sigue entera',
   'version 1 .**2**',
   '<p>version 1 .<strong>2</strong></p>'],
  ['lo mismo con un enlace detras',
   'version 1 .[2](https://ejemplo.es/a)',
   '<p>version 1 .<a href="https://ejemplo.es/a">2</a></p>'],
  // El control positivo: lo que SI tiene que seguir arreglandose.
  ['el caso que buscabamos sigue arreglandose: el signo abre el trozo siguiente',
   '**negrita** , texto',
   '<p><strong>negrita</strong>, texto</p>'],
  // El ultimo hijo hereda lo que su padre tenga detras: el trozo «1 .» es el ultimo del
  // enlace, no tiene hermanos, y aun asi detras del enlace hay un «2».
  ['una cifra partida por un enlace tambien sigue entera',
   'version [1 .](https://ejemplo.es)2',
   '<p>version <a href="https://ejemplo.es">1 .</a>2</p>'],
  ['y lo mismo con el alt de una imagen',
   'version ![1 .](foto.jpg)2',
   '<p>version <img src="foto.jpg" alt="1 .">2</p>'],
  ['pero si detras del enlace no hay nada pegado, si se limpia',
   '[texto ,](https://ejemplo.es) siguiente',
   '<p><a href="https://ejemplo.es">texto,</a> siguiente</p>'],
  ['el texto de un enlace se limpia',
   '[Doctora Amor , aqui](https://ejemplo.es/a)',
   '<p><a href="https://ejemplo.es/a">Doctora Amor, aqui</a></p>'],
  // El espacio duro sale codificado como %C2%A0 porque asi se escriben las direcciones en
  // HTML: lo que importa es que siga estando, es decir, que el limpiador no ha entrado.
  ['la direccion de un enlace NO se limpia, ni con un espacio duro dentro',
   '[texto](https://ejemplo.es/a' + NB + ',b)',
   (h) => h.includes('href="https://ejemplo.es/a%C2%A0,b"')],
  ['el alt de una imagen se limpia',
   '![Doctora Amor' + NB + ' , en escena](foto.jpg)',
   '<p><img src="foto.jpg" alt="Doctora Amor, en escena"></p>'],
  ['el title de una imagen se limpia',
   '![alt](foto.jpg "Doctora Amor , en escena")',
   '<p><img src="foto.jpg" alt="alt" title="Doctora Amor, en escena"></p>'],
  // El title es el globito del raton: no va pegado a nada, asi que se limpia aunque
  // detras del enlace venga algo pegado.
  ['el title se limpia aunque el enlace lleve algo pegado detras',
   '[texto](https://ejemplo.es "titulo ,")2',
   '<p><a href="https://ejemplo.es" title="titulo,">texto</a>2</p>'],
  ['el codigo en linea no se toca',
   'esto es `a' + NB + NB + ' , b` y ya',
   '<p>esto es <code>a' + NB + NB + ' , b</code> y ya</p>'],
  // Astro colorea el codigo con Shiki, asi que el envoltorio HTML cambia con la version.
  // Lo que importa es que el contenido siga igual, por eso se comprueba con una funcion.
  ['el bloque de codigo no se toca',
   '```\na  ,  b\n```',
   (h) => h.includes('a  ,  b') && !h.includes('a, b')],
  ['el salto de linea duro sobrevive',
   'uno  \ndos',
   '<p>uno<br>\ndos</p>'],
  // Un salto duro separa, igual que un parrafo: detras no hay nada que juntar.
  ['el signo anterior a un salto duro con espacios se limpia',
   'texto .  \nsiguiente',
   '<p>texto.<br>\nsiguiente</p>'],
  ['el signo anterior a un salto duro con barra se limpia',
   'texto .\\\nsiguiente',
   '<p>texto.<br>\nsiguiente</p>'],
  ['la lista sigue siendo una lista',
   '- uno , dos\n- tres',
   '<ul>\n<li>uno, dos</li>\n<li>tres</li>\n</ul>'],
  ['una tabla sigue siendo una tabla y su texto se limpia',
   '| a , b | c |\n| --- | --- |\n| d , e | f |',
   '<table><thead><tr><th>a, b</th><th>c</th></tr></thead><tbody><tr><td>d, e</td><td>f</td></tr></tbody></table>'],
  // Entre un bloque y el siguiente no hay nada que juntar, asi que ahi la proteccion se
  // apaga. Si no, el punto del primer parrafo se quedaba sin limpiar «por si acaso».
  ['el final de un parrafo si se limpia, aunque venga otro detras',
   'primer parrafo .\n\nsiguiente',
   '<p>primer parrafo.</p>\n<p>siguiente</p>'],
  ['el final de un elemento de lista tambien',
   '- primero .\n- segundo',
   '<ul>\n<li>primero.</li>\n<li>segundo</li>\n</ul>'],
  ['y el de una celda de tabla',
   '| a , | b |\n| --- | --- |',
   '<table><thead><tr><th>a,</th><th>b</th></tr></thead></table>'],
];

let fallos = 0;
for (const [nombre, entrada, esperado] of CASOS) {
  const obtenido = await html(entrada);
  // `esperado` puede ser el HTML exacto o una funcion que lo comprueba
  const ok = typeof esperado === 'function' ? esperado(obtenido) : obtenido === esperado;
  if (!ok) fallos++;
  console.log((ok ? 'OK   ' : 'MAL  ') + nombre);
  if (!ok) {
    console.log('      esperado ' + (typeof esperado === 'function'
      ? esperado.toString() : JSON.stringify(esperado)));
    console.log('      obtenido ' + JSON.stringify(obtenido));
  }
}
console.log('');
console.log(fallos === 0 ? 'TODAS LAS PRUEBAS PASAN' : fallos + ' PRUEBA(S) FALLAN');
process.exit(fallos ? 1 : 0);
