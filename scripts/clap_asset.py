# -*- coding: utf-8 -*-
import os, subprocess
SRC = r"C:\Users\carlo\OneDrive\Clap\cartel 2026-04-28\adaptaciones\SOFIA_CLAP_Qwantic_Foto_2560x1713.png"
DST = r"C:\Users\carlo\dev\teatro-sofia\src\assets\venue\clap-destacado.jpg"
subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", SRC, "-vf", "scale=1400:-2", "-q:v", "3", DST])
for f in ["_c1.jpg", "_c2.jpg", "_c3.jpg", "_c4.jpg"]:
    p = os.path.join(r"C:\Users\carlo\dev\teatro-sofia", f)
    if os.path.exists(p): os.remove(p)
print("ok", os.path.getsize(DST), "bytes")
