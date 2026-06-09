# -*- coding: utf-8 -*-
"""
Genera el mapeo de 301 de las URLs antiguas del Mobirise a las nuevas fichas.
Cruza por idEvento (ticket de Qwantic) y, si no, por nombre. Modo --write para
escribir public/_redirects (conserva las redirecciones legales).
"""
import os, re, sys, glob, unicodedata, html
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEST = os.path.join(ROOT, "src", "content", "espectaculos")
SRC = r"H:\OneDrive\Muntaner\WEB\mobirise\web"
WRITE = "--write" in sys.argv

def norm(s):
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]", "", s)

# --- Fichas nuevas: idEvento -> slug, y norm(title) -> slug ---
by_eid, by_title = {}, {}
slug_title = {}
for p in glob.glob(os.path.join(DEST, "*.md")):
    slug = os.path.splitext(os.path.basename(p))[0]
    t = open(p, encoding="utf-8").read()
    mt = re.search(r'(?m)^title:\s*"(.*)"', t)
    title = mt.group(1) if mt else slug
    slug_title[slug] = title
    me = re.search(r'qwanticEventId:\s*"?(\d+)"?', t)
    if me:
        by_eid[me.group(1)] = slug
    by_title[norm(title)] = slug

# Páginas que NO son shows (ya tratadas o irrelevantes)
LEGAL = {"avisolegal", "politicadeprivacidad", "politicadecookies"}
ALQUILER = {"alquilerteatremuntaner", "alquilermuntaner"}
SKIP = {"index", "page34", "page35", "sitemap"}

rows = []
for hp in sorted(glob.glob(os.path.join(SRC, "*.html"))):
    fn = os.path.basename(hp)
    base = os.path.splitext(fn)[0]
    nb = norm(base)
    if nb in LEGAL or nb in SKIP:
        continue
    if nb in ALQUILER:
        rows.append((fn, "/alquiler/", "alquiler")); continue
    t = open(hp, encoding="utf-8", errors="ignore").read()
    # idEvento(s) en la página
    eids = re.findall(r"idEvento=(\d+)", t)
    target, how = None, ""
    for eid in eids:
        if eid in by_eid:
            target, how = f"/espectaculos/{by_eid[eid]}/", f"idEvento {eid}"; break
    if not target:
        # match por nombre (título o nombre de archivo) contra las fichas
        mt = re.search(r"<title>(.*?)</title>", t, re.I | re.S)
        cand = norm(html.unescape(mt.group(1))) if mt else ""
        for key, slug in by_title.items():
            if key and (key in nb or nb in key or (cand and (key in cand or cand in key))):
                target, how = f"/espectaculos/{slug}/", f"nombre~{slug}"; break
    if not target:
        target, how = "/#cartelera", "fallback (sin match)"
    rows.append((fn, target, how))

print(f"{'ARCHIVO VIEJO':40} {'->':2} {'DESTINO':38} {'COMO'}")
for fn, target, how in rows:
    print(f"/{fn:39} -> {target:38} {how}")
print(f"\nFichas nuevas: {len(slug_title)} | Reglas show generadas: {len(rows)}")

if WRITE:
    legal = (
        "# Redirecciones 301 de las URLs antiguas del Mobirise a las nuevas (Astro).\n"
        "# Generadas por scripts/gen_redirects.py (cruce por idEvento de Qwantic).\n\n"
        "# --- Páginas legales ---\n"
        "/AvisoLegal.html             /aviso-legal/             301\n"
        "/PoliticaDePrivacidad.html   /politica-de-privacidad/  301\n"
        "/PoliticadeCookies.html      /politica-de-cookies/     301\n"
        "/PoliticaDeCookies.html      /politica-de-cookies/     301\n\n"
        "# --- Canónico / anti-duplicado (evita indexar la copia en *.netlify.app) ---\n"
        "https://teatre-muntaner.netlify.app/*   https://teatremuntaner.com/:splat   301!\n\n"
        "# --- Espectáculos y otras páginas ---\n"
    )
    lines = "".join(f"/{fn:40} {target:40} 301\n" for fn, target, how in rows)
    open(os.path.join(ROOT, "public", "_redirects"), "w", encoding="utf-8").write(legal + lines)
    print("\n_redirects ESCRITO.")
