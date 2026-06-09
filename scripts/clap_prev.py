# -*- coding: utf-8 -*-
import os, subprocess
SRC = r"C:\Users\carlo\OneDrive\Clap\cartel 2026-04-28\adaptaciones"
OUT = r"C:\Users\carlo\dev\teatro-sofia"
cands = [
    ("_c1.jpg", "SOFIA_CLAP_Qwantic_Foto_2560x1713.png"),
    ("_c2.jpg", "SOFIA_CLAP_ventas_Web_1200x600Web 1200x600.jpg"),
    ("_c3.jpg", "SOFIA_CLAP_ventas_sf_1200x600.jpg"),
    ("_c4.jpg", "SOFIA_CLAP_ventas_Eci_1360x590 Print.jpg"),
]
for dst, src in cands:
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", os.path.join(SRC, src),
                    "-vf", "scale=560:-1", os.path.join(OUT, dst)])
print("ok")
