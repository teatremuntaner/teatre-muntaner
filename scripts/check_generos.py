# -*- coding: utf-8 -*-
"""Comprueba que las etiquetas de género dicen lo mismo en los tres sitios.

La lista manda desde src/lib/generos.ts. De ahí salen los filtros de la portada
y lo que el sincronizador se permite escribir, pero el CMS (public/admin/config.yml)
es YAML estático y no puede importarla: hay que copiarla a mano. Esto avisa si
alguien se ha dejado un lado.

También mira las fichas: una etiqueta escrita que no esté en la lista no filtra,
así que el espectáculo se ve pero no aparece al filtrar la cartelera.

Uso:  python scripts/check_generos.py     (o `npm run check:generos`)
Sale con código 1 si algo no cuadra, para poder colgarlo de un automatismo.
"""
import os, re, sys

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def lista_manda():
    src = open(os.path.join(ROOT, "src", "lib", "generos.ts"), encoding="utf-8").read()
    m = re.search(r"GENRE_ORDER[^=]*=\s*\[(.*?)\]", src, re.S)
    return [x.strip().strip("'\"") for x in m.group(1).split(",") if x.strip()] if m else []

def lista_cms():
    src = open(os.path.join(ROOT, "public", "admin", "config.yml"), encoding="utf-8").read()
    m = re.search(r'name: "genres".*?options: \[(.*?)\]', src, re.S)
    return [x.strip().strip("'\"") for x in m.group(1).split(",") if x.strip()] if m else None

def generos_de(fm):
    m = re.search(r"^genres:[ \t]*(\[.*?\])[ \t]*$", fm, re.M)
    if m:
        return [x.strip().strip("'\"") for x in m.group(1)[1:-1].split(",") if x.strip()]
    m = re.search(r"^genres:[ \t]*\n((?:[ \t]+- .*\n)+)", fm, re.M)
    return [l.strip()[2:].strip().strip("'\"") for l in m.group(1).splitlines()] if m else []

fallos = []
manda = lista_manda()
if not manda:
    print("No he sabido leer GENRE_ORDER de src/lib/generos.ts"); sys.exit(1)
print("Lista que manda (src/lib/generos.ts):", ", ".join(manda))

cms = lista_cms()
if cms is None:
    fallos.append("El campo «Géneros» de public/admin/config.yml no es una lista de opciones: "
                  "vuelve a ser texto libre y se puede escribir cualquier cosa.")
elif cms != manda:
    sobran, faltan = [g for g in cms if g not in manda], [g for g in manda if g not in cms]
    detalle = []
    if faltan: detalle.append("le faltan " + ", ".join(faltan))
    if sobran: detalle.append("le sobran " + ", ".join(sobran))
    if not detalle: detalle.append("están en otro orden")
    fallos.append("El CMS (public/admin/config.yml) no dice lo mismo: " + "; ".join(detalle))
else:
    print("El CMS ofrece exactamente esas.")

DEST = os.path.join(ROOT, "src", "content", "espectaculos")
hoy = __import__("datetime").date.today().isoformat()
malas = []
for nombre in sorted(os.listdir(DEST)):
    if not nombre.endswith(".md"):
        continue
    txt = open(os.path.join(DEST, nombre), encoding="utf-8").read()
    m = re.match(r"^---\n(.*?)\n---\n", txt, re.S)
    if not m:
        continue
    fm = m.group(1)
    fuera = [g for g in generos_de(fm) if g not in manda]
    if not fuera:
        continue
    vivo = any(d >= hoy for d in re.findall(r'^\s*-\s*date:\s*"?(\d{4}-\d{2}-\d{2})"?', fm, re.M))
    malas.append((nombre, fuera, vivo))

vivas = [x for x in malas if x[2]]
if malas:
    print("\nFichas con etiquetas que NO filtran:")
    for nombre, fuera, vivo in malas:
        print(f"  {'A LA VENTA  ' if vivo else 'sin funciones'}  {nombre}: {', '.join(fuera)}")
if vivas:
    fallos.append(f"{len(vivas)} ficha(s) a la venta con etiquetas que no filtran.")
elif not malas:
    print("Ninguna ficha se sale de la lista.")

if fallos:
    print("\nNO CUADRA:")
    for f in fallos:
        print("  ·", f)
    sys.exit(1)
print("\nTodo cuadra.")
