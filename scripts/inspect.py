# -*- coding: utf-8 -*-
import re, os, sys, json, subprocess
sys.stdout.reconfigure(encoding="utf-8")
SRC = r"C:\Users\carlo\OneDrive\Teatro Sofía\Web\Pruebas"

def dims(p):
    if not os.path.exists(p): return "?"
    return subprocess.run(["ffprobe","-v","error","-select_streams","v:0",
        "-show_entries","stream=width,height","-of","csv=p=0",p],
        capture_output=True, text=True).stdout.strip()

t = open(os.path.join(SRC, "toni.cano.traficante.de.endorfinas.html"), encoding="utf-8", errors="ignore").read()
print("== TONI CANO — imágenes del cuerpo ==")
for c in dict.fromkeys(re.findall(r"assets/images/[^\"']+\.(?:jpg|jpeg|png|webp)", t, re.I)):
    if re.search(r"logo|favicon", c, re.I): continue
    print(f"  [{dims(os.path.join(SRC, c.replace('/', os.sep)))}] {c}")

raw = subprocess.run(["curl","-s","https://sofiateatro.entradas.plus/entradas/comprarEvento?idEvento=20998"],
                     capture_output=True).stdout.decode("utf-8", "ignore")
m = re.search(r"Sesiones\s*=\s*(\[.*?\]);", raw, re.S)
print("\n== GUERRERAS (idEvento 20998) — sesiones en Qwantic ==")
if m:
    try:
        arr = json.loads(m.group(1))
        print("nº sesiones:", len(arr))
        for s in arr[:6]: print("  ", s.get("fechaCelebracionStr"))
    except Exception as e:
        print("error parse:", e)
else:
    print("NO hay array de sesiones -> sin funciones a la venta")
