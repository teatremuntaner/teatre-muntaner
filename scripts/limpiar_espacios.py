# -*- coding: utf-8 -*-
"""Limpia los espacios que las sinopsis arrastran de Word o Google Docs.

Quien escribe la sinopsis es la compania; alguien la pega en el gestor (/admin) tal
cual. Al pegar viajan dos cosas invisibles:

  * espacios duros (U+00A0), que se quedan donde habia una negrita cuando el editor
    se come los asteriscos: en la web se leen como un espacio de mas;
  * espacios delante de coma o de punto, por la misma razon.

Teo lo aviso el 28/08/2026 con la sinopsis de Doctora Amor. Al medirlo no era un caso
suelto: 7 de los 30 espectaculos del Sofia y 6 de los 21 del Muntaner tenian lo mismo.

Esto arregla el TEXTO GUARDADO, que es lo que ve quien abre el gestor. La red para lo
que venga despues esta en plugins/remark-espacios.mjs, que limpia al compilar.

Uso:
    python scripts/limpiar_espacios.py            # arregla y dice que ha tocado
    python scripts/limpiar_espacios.py --check    # solo mira; devuelve 1 si hay algo,
                                                  # tambien si hay algun archivo omitido

Las pruebas estan en scripts/prueba_limpiar_espacios.py.

REGLAS DE PRUDENCIA, porque esto reescribe archivos del repositorio. Las tres primeras
las senalo Codex el 28/08/2026 revisando la primera version, que se las saltaba:

  * la CABECERA no se toca nunca. El corte busca los `---` en linea propia, no la
    primera aparicion del texto: un valor como `tagline: "Antes---despues"` hacia que
    el barrido entrase en la cabecera creyendo que era el cuerpo.
  * los BLOQUES DE CODIGO se respetan de verdad: la valla de cierre tiene que ser del
    mismo caracter y al menos igual de larga que la de apertura, asi que una valla de
    cuatro acentos que contenga tres por dentro ya no se cierra sola. Las lineas
    sangradas con cuatro espacios o con tabulador tambien se dejan en paz.
  * el FINAL DE CADA LINEA se conserva byte a byte. Convertir un espacio duro final en
    espacio normal podia dejar dos espacios al final, y eso en markdown es un <br>:
    el texto seguia diciendo lo mismo y la pagina salia partida en dos.
  * los espacios repetidos solo se juntan cuando tienen texto a los dos lados, para no
    tocar la sangria de una lista.
  * los finales de linea CRLF se dejan como estaban.
"""
import io
import os
import re
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONTENIDO = os.path.join(RAIZ, "src", "content")

# Escrito con el codigo y no con el caracter: un espacio duro dentro de una cadena
# es invisible, y nadie puede revisar lo que no ve.
DURO = "\u00a0"
REPETIDOS = re.compile(r"(?<=\S) {2,}(?=\S)")
ANTES_DE_SIGNO = re.compile(r"(?<=\S) +(?=[,.;:!?»](?:\s|$))")
# Lo que envuelve a una linea sin ser parte de su texto: citas y vinetas de lista. Una
# valla o un bloque sangrado pueden vivir DENTRO de una cita o de una lista, y entonces no
# empiezan en la columna cero. Se quita ese envoltorio antes de mirar si la linea es codigo.
# Solo casa si de verdad hay envoltorio: en una linea normal no come nada, y asi la
# sangria de cuatro espacios del codigo suelto se sigue viendo.
# La vineta se come UN solo espacio, no todos: «-␠␠␠␠␠a» es codigo sangrado dentro de la
# lista, y si se comieran los cinco pareceria texto normal.
ENVOLTORIO = re.compile(r"^ {0,3}(?:(?:>[ \t]?)+|(?:[-*+]|\d+[.)])[ \t])+")
# Hasta tres espacios de sangria admite markdown antes de una valla.
VALLA = re.compile(r"^ {0,3}(`{3,}|~{3,})(.*)$")
SANGRADA = re.compile(r"^(?: {4,}|\t)")
# Los caracteres que este barrido no sabe interpretar y que, si los toca, cambian el
# significado de la linea:
#   `   abre codigo en linea
#   <   abre HTML
#   &   puede ser una entidad: «&copy ;» pasaria a ser el simbolo ©
#   \\   escapa el caracter siguiente: «barra \\ , texto» perderia la barra
#   [ ] pueden ser una definicion de enlace: «[ref] : /destino» pasaria a ser un enlace
#   |   puede ser una tabla: «---\u00a0| ---» pasaria a ser la fila separadora
#
# Un archivo con cualquiera de ellos en el cuerpo se omite ENTERO. Los fue encontrando
# Codex el 28/08/2026, uno o dos por ronda, y ahi esta la leccion: enumerar la gramatica
# de markdown a base de rondas no converge. Por eso este barrido no lo intenta: ante
# cualquiera de estos caracteres se aparta y avisa. Es un apano de una vez; la red
# permanente es el plugin, que si entiende la estructura porque actua despues del parseo.
DUDOSA = re.compile(r"[`<&\\[\]|]")
# Lo que hace que una linea sea un bloque y no un parrafo. Si al limpiar aparece o
# desaparece una de estas marcas, la linea se deja como estaba: «1 . elemento» se
# convertia en «1. elemento», que ya no es un parrafo sino una lista numerada.
MARCA_DE_BLOQUE = re.compile(r"^ {0,3}(?:[-*+][ \t]|\d+[.)][ \t]|#{1,6}[ \t]|>)")
# La cola incluye el espacio duro a proposito: si no, «texto ␠U+00A0» se convertia en
# «texto␠␠» y dos espacios al final de linea son un <br> en markdown. Preservandola
# entera, el final de linea no cambia nunca; el espacio duro que quede ahi lo limpia el
# plugin al publicar, que ya no puede partir el parrafo porque actua despues del parseo.
COLA = re.compile(r"[ \t\r\u00a0]*$")


def marca_de_bloque(linea):
    """TODAS las marcas encadenadas, no solo la primera.

    Con solo la primera, «> 1 . elemento» pasaba la comprobacion: antes y despues empieza
    por «>», y por dentro habia dejado de ser un parrafo para ser una lista numerada. Lo
    encontro Codex el 28/08/2026.
    """
    resto, marcas = linea, []
    while True:
        m = MARCA_DE_BLOQUE.match(resto)
        if not m:
            return "\x00".join(marcas)
        marcas.append(m.group(0))
        resto = resto[m.end():]


def limpia_linea(linea):
    """Limpia una linea conservando su final byte a byte y su naturaleza."""
    corte = COLA.search(linea).start()
    nucleo, cola = linea[:corte], linea[corte:]
    nucleo = nucleo.replace(DURO, " ")
    nucleo = REPETIDOS.sub(" ", nucleo)
    nucleo = ANTES_DE_SIGNO.sub("", nucleo)
    nueva = nucleo + cola
    # si al limpiar la linea se ha convertido en otra cosa, se deja como estaba
    if marca_de_bloque(nueva) != marca_de_bloque(linea):
        return linea
    return nueva


def limpia_cuerpo(cuerpo):
    """Aplica las reglas linea a linea, dejando en paz todo lo que huela a codigo."""
    salida = []
    marca = None          # caracter de la valla abierta, o None si no hay ninguna
    largo = 0             # cuantos caracteres tenia esa valla
    for linea in cuerpo.split("\n"):
        # se mira la linea sin su envoltorio de cita o de vineta: una valla dentro de una
        # cita sigue siendo una valla, y un bloque sangrado dentro de una lista sigue
        # siendo codigo
        env = ENVOLTORIO.match(linea)
        dentro = linea[env.end():] if env else linea
        v = VALLA.match(dentro)
        if marca is None:
            if v:
                marca, largo = v.group(1)[0], len(v.group(1))
                salida.append(linea)
                continue
            if SANGRADA.match(dentro) or DUDOSA.search(linea):
                salida.append(linea)
                continue
            salida.append(limpia_linea(linea))
            continue
        # dentro de un bloque: solo cierra una valla igual y al menos igual de larga
        if v and v.group(1)[0] == marca and len(v.group(1)) >= largo and v.group(2).strip() == "":
            marca, largo = None, 0
        salida.append(linea)
    return "\n".join(salida)


def parte_en_dos(texto):
    """Devuelve (cabecera, cuerpo) cortando por el `---` de cierre en linea propia.

    Si el archivo no empieza por una cabecera, devuelve (None, None) y no se toca.
    """
    m = re.match(r"^---[ \t]*\r?\n", texto)
    if not m:
        return None, None
    cierre = re.compile(r"^---[ \t]*(?:\r?\n|$)", re.M)
    m2 = cierre.search(texto, m.end())
    if not m2:
        return None, None
    return texto[: m2.end()], texto[m2.end():]


def procesa(ruta, solo_mirar):
    """Devuelve las lineas tocadas, o -1 si el archivo se ha omitido entero."""
    original = open(ruta, "rb").read().decode("utf-8")
    cabecera, cuerpo = parte_en_dos(original)
    if cabecera is None:
        return 0
    # Si en el cuerpo hay UNO SOLO de los caracteres dudosos, el archivo entero se deja en
    # paz y se avisa. Saltarse solo la linea no bastaba: en «<pre>» y salto y «a  ,  b» y
    # salto y «</pre>», la de en medio no lleva ninguno y se limpiaba igual, rompiendo el
    # HTML. Este barrido no sabe leer markdown, asi que ante la duda no toca nada y que lo
    # mire una persona.
    nuevo = limpia_cuerpo(cuerpo)
    if nuevo == cuerpo:
        return 0
    # Se avisa SOLO si ademas habia algo que limpiar. Hay fichas con barras de escape
    # legitimas y el texto impecable —«\-dos mujeres» en «En ocasiones veo a Umberto»—, y
    # listarlas cada vez seria un aviso que nadie mira.
    if DUDOSA.search(cuerpo):
        return -1
    # Red de seguridad: solo pueden haber cambiado espacios, y el final de cada linea
    # tiene que seguir siendo el mismo (un <br> de markdown son dos espacios finales).
    quita = lambda s: re.sub(r"[\s\u00a0]+", "", s)
    colas = lambda s: [COLA.search(l).group(0) for l in s.split("\n")]
    if quita(nuevo) != quita(cuerpo) or colas(nuevo) != colas(cuerpo):
        raise SystemExit("ABORTADO: %s cambiaria algo que no es un espacio interior" % ruta)
    if not solo_mirar:
        open(ruta, "wb").write((cabecera + nuevo).encode("utf-8"))
    return sum(1 for a, b in zip(cuerpo.split("\n"), nuevo.split("\n")) if a != b)


def main():
    solo_mirar = "--check" in sys.argv
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
    tocados = 0
    omitidos = 0
    for base, _, archivos in os.walk(CONTENIDO):
        for nombre in sorted(archivos):
            if not nombre.endswith(".md"):
                continue
            ruta = os.path.join(base, nombre)
            lineas = procesa(ruta, solo_mirar)
            if lineas == -1:
                omitidos += 1
                print("%-58s OMITIDO: lleva sintaxis markdown, codigo o HTML; hay que mirarlo a mano"
                      % os.path.relpath(ruta, RAIZ))
            elif lineas:
                tocados += 1
                print("%-58s %d linea(s)" % (os.path.relpath(ruta, RAIZ), lineas))
    if omitidos:
        print("archivos omitidos por llevar sintaxis markdown, codigo o HTML: %d" % omitidos)
    if solo_mirar:
        print("archivos con espacios que limpiar: %d" % tocados)
        # Un archivo omitido tambien hace fallar la comprobacion: nadie lo va a limpiar
        # solo, y si el aviso no rompe nada se queda ahi para siempre sin que lo vea nadie.
        return 1 if (tocados or omitidos) else 0
    print("archivos limpiados: %d" % tocados)
    return 0


if __name__ == "__main__":
    sys.exit(main())
