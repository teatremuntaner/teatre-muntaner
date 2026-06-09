# -*- coding: utf-8 -*-
import re, html, sys
sys.stdout.reconfigure(encoding="utf-8")
f = r"C:\Users\carlo\OneDrive\Teatro Sofía\Web\Pruebas\toni.cano.traficante.de.endorfinas.html"
t = open(f, encoding="utf-8", errors="ignore").read()
t = re.sub(r"<(script|style)[^>]*>.*?</\1>", " ", t, flags=re.S | re.I)
for i, s in enumerate(re.findall(r"<section\b.*?</section>", t, flags=re.S | re.I)):
    txt = re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", s))).strip()
    print(f"\n--- sección {i} (len {len(txt)}) ---")
    print(txt[:400])
