# -*- coding: utf-8 -*-
"""
Asigna géneros, categoría y artista a las fichas de espectáculos del Teatre
Muntaner (clasificación confirmada por Carlos). Reproducible: re-ejecutar solo
cambia lo que cambie aquí. No toca fechas, cartel, sinopsis, etc.
"""
import os, re, sys

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

DEST = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                    "src", "content", "espectaculos")

# slug -> (categoria, [generos], artista)
DATA = {
    "barcelona-passio":                              ("Música",  ["Música", "Flamenco"],                       ""),
    "como-pasar-de-los-60-sin-morir-en-el-intento":  ("Comedia", ["Comedia", "Monólogos"],                     "Albert Boira"),
    "corta-el-cable-rojo":                           ("Comedia", ["Improvisación", "Comedia"],                 ""),
    "edu-mutante-saludos-cordiales":                 ("Comedia", ["Comedia", "Monólogos"],                     "Edu Mutante"),
    "el-petit-princep":                              ("Teatro",  ["Teatro", "Familiar"],                       ""),
    "laneguet-lleig":                                ("Teatro",  ["Teatro", "Familiar"],                       "NS Dansa"),
    "joaquin-caserza-conversaciones-con-mi-mente":   ("Comedia", ["Comedia", "Monólogos", "Bienestar emocional"], "Joaquín Caserza"),
    "me-veo-en-wallapop-diego-arjona":               ("Comedia", ["Comedia", "Monólogos"],                     "Diego Arjona"),
    "nenaaa":                                        ("Teatro",  ["Teatro", "Comedia"],                        ""),
    "riquina":                                       ("Comedia", ["Comedia", "Monólogos"],                     "Jazmín Abuín"),
    "toni-cano-traficante-de-endorfinas":            ("Comedia", ["Comedia", "Monólogos"],                     "Toni Cano"),
    "un-dos-tres-magia-javi-rufo":                   ("Magia",   ["Magia", "Familiar"],                        "Javi Rufo"),
}

def genres_block(generos):
    return "genres:\n" + "".join(f'  - "{g}"\n' for g in generos)

done = []
for slug, (cat, generos, artista) in DATA.items():
    p = os.path.join(DEST, slug + ".md")
    if not os.path.exists(p):
        print("  ! no existe:", slug); continue
    t = open(p, encoding="utf-8").read()

    # categoría
    t = re.sub(r'(?m)^category:\s*".*"\s*$', f'category: "{cat}"', t, count=1)

    # géneros (sustituye la lista vacía o una lista en bloque ya existente)
    blk = genres_block(generos).rstrip("\n")
    if re.search(r'(?m)^genres:\s*\[\s*\]\s*$', t):
        t = re.sub(r'(?m)^genres:\s*\[\s*\]\s*$', blk, t, count=1)
    else:
        t = re.sub(r'(?m)^genres:\n(?:[ ]{2}-.*\n)*', blk + "\n", t, count=1)

    # artista (inserta tras el title si hay y no existe ya)
    if artista and not re.search(r'(?m)^artist:', t):
        t = re.sub(r'(?m)^(title:\s*".*"\s*)$', r'\1\n' + f'artist: "{artista}"', t, count=1)

    open(p, "w", encoding="utf-8").write(t)
    done.append((slug, cat, " · ".join(generos), artista or "—"))

print(f"=== {len(done)} fichas actualizadas ===")
for slug, cat, g, a in done:
    print(f"  · {slug:46} [{cat:8}] {g:42} {a}")
