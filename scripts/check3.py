# -*- coding: utf-8 -*-
import subprocess, re, sys, os
sys.stdout.reconfigure(encoding="utf-8")
def get(u): return subprocess.run(["curl","-s",u],capture_output=True).stdout.decode("utf-8","ignore")
home = get("https://teatrosofia.es/V1/")
print("Botones 'Comprar entradas' en cartelera:", home.count("show-card__buy"))
print("Guerreras fuera de cartelera:", "guerreras" not in home.lower())
print("Eslogan en hero:", "casa de la comedia" in home.lower())
clap = get("https://teatrosofia.es/V1/espectaculos/clap/")
print("Clap géneros (Impro):", "Impro" in clap)
DEST = r"C:\Users\carlo\dev\teatro-sofia\src\content\espectaculos"
for s in ["toni-cano-traficante-de-endorfinas", "un-muerto-muy-vivo", "perdido-en-los-80"]:
    t = open(os.path.join(DEST, s + ".md"), encoding="utf-8").read()
    m = re.search(r'accent: "(#[0-9a-fA-F]{6})"', t)
    print(f"  acento {s}: {m.group(1) if m else '?'}")
