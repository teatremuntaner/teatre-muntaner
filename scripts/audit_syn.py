# -*- coding: utf-8 -*-
# Audita: sinopsis (¿viene del meta?) y shows pasados.
import os, re, glob, html, unicodedata, datetime, sys
sys.stdout.reconfigure(encoding="utf-8")
SRC = r"C:\Users\carlo\OneDrive\Teatro Sofía\Web\Pruebas"
DEST = "src/content/espectaculos"

def slugify(s):
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    return re.sub(r"-{2,}", "-", re.sub(r"[^a-z0-9]+", "-", s)).strip("-")

htmlmap = {slugify(os.path.splitext(os.path.basename(h))[0]): h for h in glob.glob(os.path.join(SRC, "*.html"))}
today = datetime.date.today().isoformat()
print("HOY =", today, "\n")
for md in sorted(glob.glob(DEST + "/*.md")):
    slug = os.path.splitext(os.path.basename(md))[0]
    if slug == "guerreras-del-pop":
        continue
    txt = open(md, encoding="utf-8").read()
    body = txt.split("---", 2)[-1].strip().split("\n")[0]
    dates = re.findall(r'date: "(\d{4}-\d{2}-\d{2})"', txt)
    upcoming = [d for d in dates if d >= today]
    flag = ""
    h = htmlmap.get(slug)
    if h:
        ht = open(h, encoding="utf-8", errors="ignore").read()
        m = re.search(r'<meta name="description" content="([^"]*)"', ht, re.I)
        meta = html.unescape(m.group(1)).strip() if m else ""
        if meta and body[:80] == meta[:80]:
            flag = "META"
    state = "PASADO" if (dates and not upcoming) else ("sin-fecha" if not dates else f"{len(upcoming)}prox")
    print(f"{slug:38} {state:9} {flag:5} {body[:64]}")
