# -*- coding: utf-8 -*-
"""Pruebas de scripts/limpiar_espacios.py.

    python scripts/prueba_limpiar_espacios.py

Casi todos los casos vienen de lo que Codex encontro el 28/08/2026 revisando las dos
primeras versiones del barrido. Estan aqui para que no vuelvan.
"""
import io
import os
import shutil
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import limpiar_espacios as le                                  # noqa: E402
from limpiar_espacios import limpia_cuerpo, parte_en_dos       # noqa: E402

NB = "\u00a0"

CASOS = [
    ("espacio duro suelto",
     "En" + NB + " Doctora Amor\n",
     "En Doctora Amor\n"),
    ("espacio antes de coma y de punto",
     "Amor , muy particular . Fin\n",
     "Amor, muy particular. Fin\n"),
    ("negrita cerrada y luego el signo",
     "En **Doctora Amor** , Valeria Ros\n",
     "En **Doctora Amor**, Valeria Ros\n"),
    ("comilla latina de cierre",
     "dice «hola» .\n",
     "dice «hola».\n"),
    ("la sangria de una lista no se toca",
     "- uno\n  - dos anidado\n",
     "- uno\n  - dos anidado\n"),
    ("los finales de linea CRLF se conservan",
     "Amor , Valeria\r\nsigue\r\n",
     "Amor, Valeria\r\nsigue\r\n"),
    ("un espacio duro al final de linea NO se convierte en un <br>",
     "texto " + NB + "\nsiguiente\n",
     "texto " + NB + "\nsiguiente\n"),
    ("el salto duro que ya existia se respeta",
     "texto  \nsiguiente\n",
     "texto  \nsiguiente\n"),
    ("una valla de cuatro acentos no la cierra una de tres",
     "````\ndentro , sucio\n```\nsigue , dentro\n````\nfuera , limpio\n",
     "````\ndentro , sucio\n```\nsigue , dentro\n````\nfuera, limpio\n"),
    ("una valla de tildes no la cierra una de acentos",
     "~~~\ndentro , sucio\n```\nsigue , dentro\n~~~\nfuera , limpio\n",
     "~~~\ndentro , sucio\n```\nsigue , dentro\n~~~\nfuera, limpio\n"),
    ("el codigo sangrado con cuatro espacios no se toca",
     "    a  ,  b\n",
     "    a  ,  b\n"),
    # --- lo que Codex encontro en la segunda vuelta ---
    ("una cifra no se junta: el signo tiene que cerrar algo",
     "version 1 .2 y ya\n",
     "version 1 .2 y ya\n"),
    ("un signo pegado a lo siguiente tampoco se toca",
     "texto ,**negrita**\n",
     "texto ,**negrita**\n"),
    ("el codigo EN LINEA no se toca",
     "antes `a  , b` despues , limpio\n",
     "antes `a  , b` despues , limpio\n"),
    ("el HTML crudo no se toca",
     "<pre>a  ,  b</pre>\n",
     "<pre>a  ,  b</pre>\n"),
    ("una valla dentro de una cita se reconoce",
     "> ```\n> dentro , sucio\n> ```\nfuera , limpio\n",
     "> ```\n> dentro , sucio\n> ```\nfuera, limpio\n"),
    ("el codigo sangrado dentro de una cita no se toca",
     ">     a  ,  b\n",
     ">     a  ,  b\n"),
    ("el codigo sangrado dentro de una lista no se toca",
     "-     a  ,  b\n",
     "-     a  ,  b\n"),
    ("el texto normal de una cita si se limpia",
     "> dice «hola» .\n",
     "> dice «hola».\n"),
    # --- lo que Codex encontro en la cuarta vuelta ---
    ("limpiar no puede convertir un parrafo en una lista numerada",
     "1 . elemento\n",
     "1 . elemento\n"),
    ("ni en una lista con vineta",
     "- uno\n",
     "- uno\n"),
    ("ni en un titulo",
     "# titulo , con coma\n",
     "# titulo, con coma\n"),
    # --- lo que Codex encontro en la quinta vuelta: la marca de dentro de una cita ---
    ("dentro de una cita tampoco puede aparecer una lista numerada",
     "> 1 . elemento\n",
     "> 1 . elemento\n"),
    ("ni un titulo",
     "> #" + NB + " titulo\n",
     "> #" + NB + " titulo\n"),
    ("ni una lista con vineta",
     "> -" + NB + " elemento\n",
     "> -" + NB + " elemento\n"),
    ("ni en una cita dentro de otra cita",
     "> > 1 . elemento\n",
     "> > 1 . elemento\n"),
    ("pero el texto normal de una cita se sigue limpiando",
     "> texto , sucio\n",
     "> texto, sucio\n"),
]

CASOS_CABECERA = [
    ("cabecera normal",
     "---\ntitle: Hola\n---\ncuerpo , sucio\n",
     "---\ntitle: Hola\n---\n", "cuerpo , sucio\n"),
    ("un --- dentro de un valor no parte la cabecera",
     '---\ntagline: "Antes---despues"\n---\ncuerpo , sucio\n',
     '---\ntagline: "Antes---despues"\n---\n', "cuerpo , sucio\n"),
    ("cabecera con CRLF",
     "---\r\ntitle: Hola\r\n---\r\ncuerpo\r\n",
     "---\r\ntitle: Hola\r\n---\r\n", "cuerpo\r\n"),
    ("archivo sin cabecera: no se toca",
     "solo texto , suelto\n", None, None),
]


def con_archivo(contenido, funcion):
    """Escribe `contenido` en un archivo temporal, ejecuta `funcion(ruta)` y limpia."""
    carpeta = tempfile.mkdtemp()
    try:
        ruta = os.path.join(carpeta, "ficha.md")
        open(ruta, "wb").write(contenido.encode("utf-8"))
        return funcion(ruta)
    finally:
        shutil.rmtree(carpeta, ignore_errors=True)


def pruebas_de_procesa():
    """`procesa()` escribiendo de verdad: es lo que toca los archivos del repositorio."""
    salida = []

    def caso(nombre, ok):
        salida.append((nombre, ok))

    entrada = "---\ntitle: Hola\n---\nAmor , Valeria\n"
    def escribe(ruta):
        n = le.procesa(ruta, False)
        return n, open(ruta, "rb").read().decode("utf-8")
    n, escrito = con_archivo(entrada, escribe)
    caso("procesa escribe y devuelve las lineas tocadas",
         n == 1 and escrito == "---\ntitle: Hola\n---\nAmor, Valeria\n")

    def mira(ruta):
        n = le.procesa(ruta, True)
        return n, open(ruta, "rb").read().decode("utf-8")
    n, sin_tocar = con_archivo(entrada, mira)
    caso("--check cuenta pero no escribe", n == 1 and sin_tocar == entrada)

    crlf = "---\r\ntitle: Hola\r\n---\r\nAmor , Valeria\r\n"
    n, escrito = con_archivo(crlf, escribe)
    caso("procesa conserva CRLF",
         escrito == "---\r\ntitle: Hola\r\n---\r\nAmor, Valeria\r\n")

    cabecera_sucia = '---\ntagline: "dos  espacios"\n---\nAmor , Valeria\n'
    n, escrito = con_archivo(cabecera_sucia, escribe)
    caso("procesa no toca la cabecera",
         escrito.split("---")[1] == cabecera_sucia.split("---")[1])

    sin_cabecera = "Amor , Valeria\n"
    n, escrito = con_archivo(sin_cabecera, escribe)
    caso("un archivo sin cabecera no se toca", n == 0 and escrito == sin_cabecera)

    # Un archivo con codigo o HTML en cualquier parte del cuerpo se omite ENTERO y se
    # avisa. Saltarse solo la linea no bastaba con construcciones de varias lineas.
    html_varias = "---\ntitle: Hola\n---\n<pre>\na  ,  b\n</pre>\nfuera , sucio\n"
    n, escrito = con_archivo(html_varias, escribe)
    caso("un HTML de varias lineas hace que se omita el archivo entero",
         n == -1 and escrito == html_varias)

    codigo_varias = "---\ntitle: Hola\n---\nantes `a\nb  ,  c\nd` despues\n"
    n, escrito = con_archivo(codigo_varias, escribe)
    caso("un codigo en linea de varias lineas tambien lo omite",
         n == -1 and escrito == codigo_varias)

    # En los dos siguientes hay una linea sucia APARTE de la dudosa: si no la hubiera, no
    # habria nada que limpiar y el archivo no se listaria, que es lo que queremos.
    entidad = "---\ntitle: Hola\n---\n&copy ; aqui\notra linea , sucia\n"
    n, escrito = con_archivo(entidad, escribe)
    caso("una entidad HTML hace que se omita el archivo (&copy ; seria ©)",
         n == -1 and escrito == entidad)

    barra = "---\ntitle: Hola\n---\nbarra \\ , texto\notra linea , sucia\n"
    n, escrito = con_archivo(barra, escribe)
    caso("una barra invertida hace que se omita el archivo (se comeria la barra)",
         n == -1 and escrito == barra)

    limpia_con_barra = "---\ntitle: Hola\n---\n\\-una lista escapada\ny nada mas\n"
    n, escrito = con_archivo(limpia_con_barra, escribe)
    caso("una barra de escape en un archivo LIMPIO no molesta a nadie",
         n == 0 and escrito == limpia_con_barra)

    # Lo que Codex encontro en la sexta vuelta: una definicion de enlace y una tabla.
    definicion = "---\ntitle: Hola\n---\n[ref] : /destino\n\nUso [ref].\notra , sucia\n"
    n, escrito = con_archivo(definicion, escribe)
    caso("una definicion de enlace hace que se omita el archivo",
         n == -1 and escrito == definicion)

    tabla = "---\ntitle: Hola\n---\na | b\n--- | ---\n1 | 2\notra , sucia\n"
    n, escrito = con_archivo(tabla, escribe)
    caso("una tabla hace que se omita el archivo",
         n == -1 and escrito == tabla)

    # La red de seguridad: se sabotea limpia_cuerpo para que cambie una palabra y para que
    # cambie el final de una linea. En los dos casos procesa() tiene que abortar, decirlo
    # y dejar el archivo byte a byte como estaba.
    original = le.limpia_cuerpo
    for nombre, falso in [
        ("la red de seguridad aborta si cambia una palabra", lambda c: c.replace("Amor", "Odio")),
        ("la red de seguridad aborta si cambia el final de una linea", lambda c: c.replace("\n", "  \n", 1)),
    ]:
        le.limpia_cuerpo = falso

        def sabotea(ruta):
            try:
                le.procesa(ruta, False)
                return None, open(ruta, "rb").read().decode("utf-8")
            except SystemExit as e:
                return str(e), open(ruta, "rb").read().decode("utf-8")

        try:
            aviso, quedo = con_archivo(entrada, sabotea)
            caso(nombre, aviso is not None
                 and aviso.startswith("ABORTADO:")
                 and quedo == entrada)
        finally:
            le.limpia_cuerpo = original
    return salida


def main():
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
    fallos = 0
    for nombre, entrada, esperado in CASOS:
        obtenido = limpia_cuerpo(entrada)
        ok = obtenido == esperado
        fallos += 0 if ok else 1
        print(("OK   " if ok else "MAL  ") + nombre)
        if not ok:
            print("      esperado %r" % esperado)
            print("      obtenido %r" % obtenido)
    for nombre, entrada, cab, cuerpo in CASOS_CABECERA:
        obtenido = parte_en_dos(entrada)
        ok = obtenido == (cab, cuerpo)
        fallos += 0 if ok else 1
        print(("OK   " if ok else "MAL  ") + nombre)
        if not ok:
            print("      esperado %r" % ((cab, cuerpo),))
            print("      obtenido %r" % (obtenido,))
    for nombre, ok in pruebas_de_procesa():
        fallos += 0 if ok else 1
        print(("OK   " if ok else "MAL  ") + nombre)
    print()
    print("TODAS LAS PRUEBAS PASAN" if fallos == 0 else "%d PRUEBA(S) FALLAN" % fallos)
    return 1 if fallos else 0


if __name__ == "__main__":
    sys.exit(main())
