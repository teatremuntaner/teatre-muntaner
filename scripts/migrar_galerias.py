# -*- coding: utf-8 -*-
"""Migra las galerías de fotos reales de las páginas Mobirise a las fichas Astro."""
import os, re, subprocess

SRC = r"C:\Users\carlo\OneDrive\Teatro Sofía\Web\Pruebas\assets\images"
DEST = r"C:\Users\carlo\dev\teatro-sofia\src\content\espectaculos"

GAL = {
    # OJO: toni-cano-2 y -5 son la MISMA foto (azul "shh"); -5 es la sinopsis.
    # Galería = 3 fotos distintas (brazos cruzados, camiseta, escenario).
    "toni-cano-traficante-de-endorfinas": [
        "toni-cano-6-1256x1884.webp", "toni-cano-7-700x1050.webp", "toni-cano-3-1256x837.webp",
    ],
    "volver-a-empezar": [
        "shaktikundalini.photo-245-596x397.jpg", "shaktikundalini.photo-246-596x397.jpg",
        "shaktikundalini.photo-248-596x397.jpg", "shaktikundalini.photo-249-596x397.jpg",
    ],
    "perdido-en-los-80": [
        "photo-2026-01-25-19-53-32-816x458.jpg", "photo-2026-01-25-19-53-33-816x458.jpg",
        "photo-2026-01-25-19-53-34-816x458.jpg", "photo-2026-02-07-22-43-59-1600x1200.jpg",
    ],
}

def conv(src, dst):
    try:
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", src, "-q:v", "3", dst], check=True, timeout=60)
        return True
    except Exception as e:
        print("  ERR", src, e); return False

for slug, files in GAL.items():
    md = os.path.join(DEST, slug + ".md")
    if not os.path.exists(md):
        print("FALTA .md", slug); continue
    rels = []
    for i, fn in enumerate(files, 1):
        s = os.path.join(SRC, fn)
        if not os.path.exists(s):
            print("  no existe", fn); continue
        out = f"{slug}-g{i}.jpg"
        if conv(s, os.path.join(DEST, out)):
            rels.append("./" + out)
    if not rels:
        continue
    block = "gallery:\n" + "".join(f'  - "{r}"\n' for r in rels)
    t = open(md, encoding="utf-8").read()
    if re.search(r"^gallery:", t, re.M):
        print(slug, "ya tiene gallery, lo dejo")
        continue
    # insertar tras la línea poster:
    t2 = re.sub(r'(^poster:.*\n)', r'\1' + block, t, count=1, flags=re.M)
    open(md, "w", encoding="utf-8").write(t2)
    print(f"OK {slug}: {len(rels)} fotos")
