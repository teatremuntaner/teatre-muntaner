# -*- coding: utf-8 -*-
"""
Genera las paginas legales Astro a partir de las paginas Mobirise descargadas,
copiando el texto verbatim. Reproducible. Salida: src/pages/<ruta>.astro
"""
import re, html, os, unicodedata

SRC = r"H:\OneDrive\Muntaner\WEB\mobirise\web"
OUT = r"C:\Users\carlo\dev\teatre-muntaner\src\pages"

PAGES = [
    ("AvisoLegal.html", "aviso-legal", "Aviso legal y condiciones de compra",
     "Condiciones de compra de entradas y acceso a los recintos del Teatre Muntaner."),
    ("PoliticaDePrivacidad.html", "politica-de-privacidad", "Política de privacidad",
     "Cómo trata el Teatre Muntaner tus datos personales y cómo ejercer tus derechos."),
    ("PoliticadeCookies.html", "politica-de-cookies", "Política de cookies",
     "Qué cookies utiliza la web del Teatre Muntaner y cómo gestionarlas."),
]

STOP = {"política de privacidad", "política de cookies", "aviso legal",
        "teatro sofía", "teatro sofia", "clap", "inicio", "cartelera", "calendario",
        "galería", "contacto", "espectáculos", "canal oficial de venta"}

def clean(s):
    return re.sub(r"\s+", " ", html.unescape(s).replace("\xa0", " ")).strip()

def extract(t):
    t = re.sub(r"<(script|style|nav|header|footer)[^>]*>.*?</\1>", " ", t, flags=re.S | re.I)
    lines = []
    for sec in re.findall(r"<section\b.*?</section>", t, flags=re.S | re.I):
        txt = clean(re.sub(r"<[^>]+>", " ", sec)).lower()
        if len(txt) < 200 or not any(k in txt for k in
                ["datos", "cookie", "responsable", "aviso", "privacidad", "usuario", "entrada", "titular"]):
            continue
        sec = re.sub(r"<(h[1-6])[^>]*>(.*?)</\1>",
                     lambda m: f"\n\x00H\x00{clean(re.sub('<[^>]+>',' ',m.group(2)))}\n", sec, flags=re.S | re.I)
        sec = re.sub(r"</(p|li|tr|div)>", "\n", sec, flags=re.I)
        sec = re.sub(r"<li[^>]*>", "\n\x00L\x00", sec, flags=re.I)
        sec = re.sub(r"<br\s*/?>", "\n", sec, flags=re.I)
        for raw in re.sub(r"<[^>]+>", " ", sec).splitlines():
            c = clean(raw)
            core = c.replace("\x00H\x00", "").replace("\x00L\x00", "").strip()
            if core:
                lines.append(c)
    # cortar footer: desde "Teatro Sofía" (teatro hermano) / copyright en adelante
    cut = len(lines)
    for i, l in enumerate(lines):
        low = l.lower().lstrip("\x00hl ").strip()
        if "teatro sof" in low or low.startswith("© copyright") or "derechos reservados" in low:
            cut = i; break
    lines = lines[:cut]
    # quitar del final menu suelto / lineas vacias (insensible a tildes)
    def _na(s):
        return unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    stop_na = {_na(s) for s in STOP}
    def _core(l):
        return _na(clean(l.replace("\x00H\x00", "").replace("\x00L\x00", "")).lower())
    while lines and (_core(lines[-1]) in stop_na or _core(lines[-1]) == ""):
        lines.pop()
    # dedupe consecutivo
    out = []
    for l in lines:
        if not out or out[-1] != l:
            out.append(l)
    return out

def esc(s):
    return (s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
             .replace("{", "&#123;").replace("}", "&#125;"))

def to_html(lines):
    parts, ul = [], []
    def flush():
        if ul:
            parts.append("    <ul>\n" + "".join(f"      <li>{esc(x)}</li>\n" for x in ul) + "    </ul>")
            ul.clear()
    for l in lines:
        if l.startswith("\x00H\x00"):
            flush(); parts.append(f"    <h2>{esc(l[3:])}</h2>")
        elif l.startswith("\x00L\x00") or l.startswith("- ") or l[:1] in "•●":
            ul.append(re.sub(r"^(\x00L\x00|- |•|●)\s*", "", l))
        else:
            flush(); parts.append(f"    <p>{esc(l)}</p>")
    flush()
    return "\n".join(parts)

for fn, route, title, desc in PAGES:
    t = open(os.path.join(SRC, fn), encoding="utf-8", errors="ignore").read()
    lines = extract(t)
    norm = lambda s: re.sub(r"\s+", "", s).lower()
    if lines and lines[0].startswith("\x00H\x00") and norm(lines[0][3:]) == norm(title):
        lines = lines[1:]
    body = to_html(lines)
    page = f'''---
import BaseLayout from '../layouts/BaseLayout.astro';
---
<BaseLayout title="{title}" description="{desc}">
  <article class="legal">
    <h1>{title}</h1>
{body}
  </article>
</BaseLayout>

<style>
  .legal {{ max-width: 820px; margin: 0 auto; padding: clamp(40px, 7vw, 90px) 20px; }}
  .legal h1 {{ font-size: clamp(30px, 5vw, 50px); line-height: 1.1; margin-bottom: 28px; }}
  .legal h2 {{ font-family: var(--f-display); font-size: 20px; letter-spacing: 0.02em; color: var(--accent); margin: 34px 0 10px; }}
  .legal p, .legal li {{ color: var(--paper-dim); line-height: 1.75; margin: 10px 0; font-size: 16px; }}
  .legal ul {{ padding-left: 22px; }}
  .legal a {{ color: var(--accent); }}
</style>
'''
    open(os.path.join(OUT, route + ".astro"), "w", encoding="utf-8").write(page)
    print(f"OK  {route}.astro  ({len(body)} chars)")
