# -*- coding: utf-8 -*-
import os, subprocess
IMG = r"C:\Users\carlo\OneDrive\Teatro Sofía\Web\Pruebas\assets\images"
OUT = r"C:\Users\carlo\dev\teatro-sofia"
for dst, src in [("_t1.jpg", "sofia-te-ventas-instagram-1200x1200-1200x1200.jpg"),
                 ("_t2.jpg", "toni-cano-6-1256x1884.webp")]:
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", os.path.join(IMG, src),
                    "-vf", "scale=500:-1", os.path.join(OUT, dst)])
print("ok")
