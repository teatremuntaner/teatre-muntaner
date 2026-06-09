# -*- coding: utf-8 -*-
# Inventario completo del home antiguo (Mobirise): secciones, textos, enlaces,
# formularios, iframes (calendario/mapa), para no perder nada en la migración.
import re, html, sys
sys.stdout.reconfigure(encoding="utf-8")
F = r"C:\Users\carlo\OneDrive\Teatro Sofía\Web\Pruebas\index.html"
t = open(F, encoding="utf-8", errors="ignore").read()
t = re.sub(r"<(script|style)[^>]*>.*?</\1>", " ", t, flags=re.S | re.I)

def clean(s): return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", s))).strip()

print("################ MENÚ (nav) ################")
nav = re.search(r"<nav\b.*?</nav>", t, re.S | re.I)
if nav:
    for a in re.findall(r'<a[^>]*href="([^"]*)"[^>]*>(.*?)</a>', nav.group(0), re.S | re.I):
        lab = clean(a[1])
        if lab: print(f"  {lab:30} -> {a[0]}")

print("\n################ SECCIONES (texto) ################")
for i, s in enumerate(re.findall(r"<section\b[^>]*>.*?</section>", t, re.S | re.I)):
    cid = re.search(r'class="([^"]*)"', s)
    txt = clean(s)
    if len(txt) > 500: txt = txt[:500] + "…"
    print(f"\n--- sección {i} [{(cid.group(1)[:40] if cid else '')}] ---")
    print(txt if txt else "(sin texto)")

print("\n################ FORMULARIOS ################")
for fm in re.findall(r"<form\b.*?</form>", t, re.S | re.I):
    act = re.search(r'action="([^"]*)"', fm)
    print("  action:", act.group(1) if act else "(ninguna)")
    for inp in re.findall(r'<(input|textarea|select|button)[^>]*>', fm, re.I):
        nm = re.search(r'name="([^"]*)"', inp); ph = re.search(r'placeholder="([^"]*)"', inp); ty = re.search(r'type="([^"]*)"', inp)
        print(f"    {inp[:4]} name={nm.group(1) if nm else '-'} type={ty.group(1) if ty else '-'} ph={ph.group(1) if ph else '-'}")

print("\n################ IFRAMES (calendario/mapa/vídeo) ################")
for ifr in re.findall(r'<iframe[^>]*>', t, re.I):
    src = re.search(r'src="([^"]*)"', ifr)
    print("  ", src.group(1)[:110] if src else ifr[:110])

print("\n################ ENLACES externos ################")
seen = set()
for href in re.findall(r'href="(https?://[^"]+)"', t, re.I):
    d = re.sub(r"https?://([^/]+).*", r"\1", href)
    if d not in seen:
        seen.add(d); print("  ", href[:90])
