# -*- coding: utf-8 -*-
import subprocess, sys
sys.stdout.reconfigure(encoding="utf-8")
def get(url):
    return subprocess.run(["curl", "-s", url], capture_output=True, text=True).stdout

home = get("https://teatrosofia.es/V1/")
print("Cartelera — ¿siguen las pasadas? (deberían NO aparecer)")
for slug in ["disonancia-perfecta", "flamenco-sofia", "redess"]:
    print(f"  {slug:24} en cartelera: {('/'+slug+'/') in home or ('espectaculos/'+slug) in home}")
print("  clap en cartelera:", "espectaculos/clap" in home)
print("\nPáginas archivadas (deben seguir vivas):")
for slug in ["disonancia-perfecta", "flamenco-sofia", "redess"]:
    p = get(f"https://teatrosofia.es/V1/espectaculos/{slug}/")
    print(f"  {slug:24} viva={len(p) > 500}  finalizada={'Funciones finalizadas' in p}")
