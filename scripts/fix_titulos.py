# -*- coding: utf-8 -*-
"""
Quita el nombre del artista del título cuando ya se muestra como artista aparte
(evita repetirlo en la cartela). Idempotente.
"""
import os, re, sys
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

DEST = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                    "src", "content", "espectaculos")

TITULOS = {
    "toni-cano-traficante-de-endorfinas":           "Traficante de Endorfinas",
    "joaquin-caserza-conversaciones-con-mi-mente":  "Conversaciones con mi mente",
    "edu-mutante-saludos-cordiales":                "Saludos cordiales",
    "me-veo-en-wallapop-diego-arjona":              "Me veo en Wallapop",
    "un-dos-tres-magia-javi-rufo":                  "Un, Dos, Tres Magia",
}

for slug, nuevo in TITULOS.items():
    p = os.path.join(DEST, slug + ".md")
    t = open(p, encoding="utf-8").read()
    t2 = re.sub(r'(?m)^title:\s*".*"\s*$', f'title: "{nuevo}"', t, count=1)
    if t2 != t:
        open(p, "w", encoding="utf-8").write(t2)
        print(f"  · {slug:46} -> {nuevo}")
    else:
        print(f"  = {slug:46} (sin cambios)")
