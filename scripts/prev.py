# -*- coding: utf-8 -*-
import os, subprocess, sys
sys.stdout.reconfigure(encoding="utf-8")
IMG = r"C:\Users\carlo\OneDrive\Teatro Sofía\Web\Pruebas\assets\images"
OUT = r"C:\Users\carlo\dev\teatro-sofia\_prev"
os.makedirs(OUT, exist_ok=True)
cands = [
    "1d2a1397.jpg", "1d2a1384.jpg", "1d2a1386.jpg", "med-2532.jpg",
    "fachada-teatro-sofia-2525x1709.png",
    "escenario20la20casa20de20la20comedia20teatro20sofia20madrid-1024x683.jpg",
    "interiorteatro-sofia-clean-1024x572.jpg",
    "anfiteatro20220teatro20sofia20madrid-846x564.jpg",
    "carta20bar20en20mesa20teatro20sofia-846x564.jpg",
]
for i, c in enumerate(cands):
    src = os.path.join(IMG, c)
    if not os.path.exists(src):
        print(i, "NO EXISTE", c); continue
    dst = os.path.join(OUT, f"p{i}.jpg")
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", src, "-vf", "scale=640:-1", dst], timeout=60)
    print(i, "->", c)
