# -*- coding: utf-8 -*-
# Lista fotos del local (no carteles) para hero/galería, con dimensiones.
import os, glob, subprocess, sys
sys.stdout.reconfigure(encoding="utf-8")
IMG = r"C:\Users\carlo\OneDrive\Teatro Sofía\Web\Pruebas\assets\images"
def dims(p):
    try:
        o = subprocess.run(["ffprobe","-v","error","-select_streams","v:0",
            "-show_entries","stream=width,height","-of","csv=p=0",p],
            capture_output=True, text=True, timeout=20).stdout.strip()
        w,h = o.split(",")[:2]; return int(w), int(h)
    except Exception:
        return (0,0)
rows=[]
for p in glob.glob(IMG+"/*"):
    n=os.path.basename(p).lower()
    if not n.endswith((".jpg",".jpeg",".png",".webp")): continue
    if any(x in n for x in ["logo","favicon","qwantic","ventas","a4","sin","entrada","cartel","instagram","captura","pantalla","-1066x","-1414x","-1447x","-1098x","-1256x","-1080x"]): continue
    w,h=dims(p)
    if w<700: continue
    orient = "horiz" if w>h else "vert"
    rows.append((w*h, f"{w}x{h} {orient:5} {os.path.basename(p)}"))
rows.sort(reverse=True)
for _,r in rows[:40]:
    print(r)
