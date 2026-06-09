# -*- coding: utf-8 -*-
"""
Fija el idioma de la función (campo `lang`) en cada ficha. Idempotente.
Solo se rellenan los confirmados/alta-confianza; los dudosos los confirma Carlos.
"""
import os, re, sys
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

DEST = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                    "src", "content", "espectaculos")

# slug -> idioma  ("Castellano" | "Catalán" | "Bilingüe")
LANG = {
    # Catalán (confirmado en la propia sinopsis)
    "el-petit-princep":                              "Catalán",
    "laneguet-lleig":                                "Catalán",
    "nenaaa":                                        "Catalán",
    # Castellano (alta confianza: cómicos nacionales / origen Madrid)
    "corta-el-cable-rojo":                           "Castellano",
    "toni-cano-traficante-de-endorfinas":            "Castellano",
    "me-veo-en-wallapop-diego-arjona":               "Castellano",
    "un-dos-tres-magia-javi-rufo":                   "Castellano",
    # Castellano (confirmados por Carlos)
    "como-pasar-de-los-60-sin-morir-en-el-intento":  "Castellano",
    "edu-mutante-saludos-cordiales":                 "Castellano",
    "joaquin-caserza-conversaciones-con-mi-mente":   "Castellano",
    "riquina":                                       "Castellano",
    "barcelona-passio":                              "Castellano",
}

for slug, lang in LANG.items():
    p = os.path.join(DEST, slug + ".md")
    if not os.path.exists(p):
        print("  ! no existe:", slug); continue
    t = open(p, encoding="utf-8").read()
    if re.search(r'(?m)^lang:', t):
        t2 = re.sub(r'(?m)^lang:.*$', f'lang: "{lang}"', t, count=1)
    else:
        # Inserta tras el bloque genres (o tras category si no hubiera genres)
        if re.search(r'(?m)^genres:\n(?:[ ]{2}-.*\n)+', t):
            t2 = re.sub(r'(?m)^(genres:\n(?:[ ]{2}-.*\n)+)', r'\1' + f'lang: "{lang}"\n', t, count=1)
        else:
            t2 = re.sub(r'(?m)^(category:.*\n)', r'\1' + f'lang: "{lang}"\n', t, count=1)
    if t2 != t:
        open(p, "w", encoding="utf-8").write(t2)
        print(f"  · {slug:46} {lang}")
