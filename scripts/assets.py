# -*- coding: utf-8 -*-
# Copia y optimiza las fotos del local elegidas a src/assets/venue/
import os, subprocess, sys
sys.stdout.reconfigure(encoding="utf-8")
IMG = r"C:\Users\carlo\OneDrive\Teatro Sofía\Web\Pruebas\assets\images"
OUT = r"C:\Users\carlo\dev\teatro-sofia\src\assets\venue"
os.makedirs(OUT, exist_ok=True)
# (destino, origen, ancho_max)
M = [
    ("hero.jpg",       "med-2532.jpg", 2600),
    ("sala.jpg",       "1d2a1384.jpg", 2000),
    ("ambiente.jpg",   "escenario20la20casa20de20la20comedia20teatro20sofia20madrid-1024x683.jpg", 1024),
    ("bar.jpg",        "carta20bar20en20mesa20teatro20sofia-846x564.jpg", 846),
    ("interior.jpg",   "interiorteatro-sofia-clean-1024x572.jpg", 1024),
    ("anfiteatro.jpg", "anfiteatro20220teatro20sofia20madrid-846x564.jpg", 846),
    ("fachada.jpg",    "fachada-teatro-sofia-2525x1709.png", 2000),
    ("mixer.jpg",      "1d2a1397.jpg", 1600),
]
for dst, src, w in M:
    s = os.path.join(IMG, src)
    if not os.path.exists(s):
        print("NO EXISTE", src); continue
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", s,
                    "-vf", f"scale='min({w},iw)':-2", "-q:v", "3",
                    os.path.join(OUT, dst)], timeout=120)
    print("ok", dst)
