#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Genera la version CATALANA del texto de las fichas de espectaculo.

Idea: el castellano sigue siendo la UNICA fuente que se edita (CMS incluido).
Este script lee src/content/espectaculos/*.md y escribe, en paralelo,
src/content/espectaculos-ca/*.md con SOLO los campos de texto traducidos.
Las imagenes, fechas, precios y enlaces NO se duplican: la pagina catalana
los coge de la ficha original.

REGLA DE ORO: nunca se traducen los nombres propios.
  - title  (titulo del espectaculo)  -> intacto
  - artist (artista / compania)      -> intacto
  - venue  (nombre del teatro)       -> intacto
Ese es justamente el fallo que teniamos con Weglot y que aqui no puede pasar,
porque el script directamente no toca esos campos.

Motor: Apertium (libre y gratuito). El par espanol->catalan es su especialidad.
Por defecto usa la API publica; se puede apuntar a un Apertium propio con
la variable de entorno APERTIUM_URL.

Uso:
    python scripts/translate_ca.py           # solo lo que haya cambiado
    python scripts/translate_ca.py --force   # rehace todo
    python scripts/translate_ca.py --dry     # no escribe, solo informa
"""

from __future__ import annotations

# OJO: esta carpeta contiene scripts sueltos con nombres que chocan con modulos
# de la libreria estandar (scripts/inspect.py). Python mete la carpeta del script
# la primera en la ruta de busqueda, asi que la quitamos ANTES de importar nada
# mas; si no, "import requests" acaba cargando el inspect.py de aqui y revienta.
import os
import sys

_here = os.path.dirname(os.path.abspath(__file__))
sys.path[:] = [p for p in sys.path if os.path.abspath(p or ".") != _here]

import argparse
import hashlib
import json
import re
import time
from pathlib import Path

import requests
import yaml

ROOT = Path(__file__).resolve().parent.parent
SRC_DIR = ROOT / "src" / "content" / "espectaculos"
OUT_DIR = ROOT / "src" / "content" / "espectaculos-ca"

APERTIUM_URL = "https://apertium.org/apy/translate"
LANGPAIR = "spa|cat"

# Campos de texto que SI se traducen.
TEXT_FIELDS = ("tagline", "promo", "category", "lang", "duration", "price", "dateText")
LIST_FIELDS = ("genres",)

# Campos que NUNCA se traducen (nombres propios). Se listan para que quede
# explicito y para poder avisar si alguien los anade por error a TEXT_FIELDS.
NEVER_TRANSLATE = ("title", "artist", "venue")

# Terminos que Apertium no debe tocar aunque aparezcan dentro de la prosa.
# Se protegen con marcador antes de traducir.
KEEP_AS_IS = [
    # Nombres propios del negocio
    "Teatre Muntaner",
    "La Muntaner Teatre, S.L.",
    "Teatro Sofía",
    "Clap Show",
    "Muntaner",
    # Marcas y productos de terceros: si no se protegen, Apertium los cuenta
    # como "palabras desconocidas" y puede llegar a descartar la frase entera.
    "Google Analytics",
    "Tag Manager",
    "Google",
    "Netlify",
    "Instagram",
    "TikTok",
    "YouTube",
    "WhatsApp",
    "Qwantic",
    "Newsletter",
]

session = requests.Session()
session.headers["User-Agent"] = "teatre-muntaner-i18n/1.0 (+https://teatremuntaner.com)"


# --------------------------------------------------------------------------
# Proteccion de markdown y nombres propios
# --------------------------------------------------------------------------

# Construcciones que deben llegar intactas al otro lado. Se sustituyen por
# marcadores @@N@@, que Apertium deja pasar sin tocar (verificado).
PROTECT_PATTERNS = [
    r"```.*?```",              # bloque de codigo
    r"`[^`\n]+`",              # codigo en linea
    r"!\[[^\]]*\]\([^)]*\)",   # imagen
    r"\[[^\]]*\]\([^)]*\)",    # enlace (se protege entero: el texto del
                               # enlace no se traduce, pero hoy no hay ninguno)
    r"<[^>\n]+>",              # etiqueta HTML suelta
    r"\{[A-Za-z0-9_]+\}",      # marcador de variable de la interfaz: {enlace}
    r"https?://\S+",           # URL suelta
    r"\*\*|__|\*|_",           # marcadores de negrita/cursiva (Apertium se
                               # come un asterisco de **texto** si no se protegen)
]
PROTECT_RE = re.compile("|".join(PROTECT_PATTERNS), re.DOTALL)


def _protect(text: str) -> tuple[str, list[str]]:
    """Sustituye markdown y nombres propios por marcadores @@N@@."""
    saved: list[str] = []

    def stash(match: re.Match) -> str:
        saved.append(match.group(0))
        return f"@@{len(saved) - 1}@@"

    out = PROTECT_RE.sub(stash, text)

    for term in KEEP_AS_IS:
        # \b no funciona bien con acentos en algunos casos; usamos limites laxos.
        out = re.sub(re.escape(term), stash, out)

    return out, saved


def _restore(text: str, saved: list[str]) -> str:
    for i, original in enumerate(saved):
        text = text.replace(f"@@{i}@@", original)
    return text


# --------------------------------------------------------------------------
# Traduccion
# --------------------------------------------------------------------------

class TranslationError(RuntimeError):
    pass


# Si al traducir un parrafo mas de este % de palabras son desconocidas para
# Apertium, damos por hecho que ESE PARRAFO NO ESTA EN ESPANOL (p. ej. la
# sinopsis en italiano de Abbi Pazienza) y lo dejamos tal cual. Traducirlo
# produce galimatias ("in un mondo" -> "in un pelat").
UNKNOWN_RATIO_LIMIT = 0.20

# La deteccion de idioma solo se aplica a bloques con suficiente texto. En una
# etiqueta corta ("Guardar preferencias") dos palabras raras dispararian el
# limite y la dejarian sin traducir; los parrafos en otro idioma son largos.
MIN_WORDS_FOR_LANG_CHECK = 12

# Apertium marca lo que no sabe generar: "*palabra" (desconocida) y
# "#palabra" (fallo de generacion). Eso no puede llegar a la web.
UNKNOWN_MARK_RE = re.compile(r"(?<![\w*])\*(?=[^\s*])")
GENFAIL_MARK_RE = re.compile(r"(?<![\w#])#(?=[^\s#\d])")


def _api_translate(text: str, *, retries: int = 3) -> str:
    """Una llamada cruda a Apertium, con marcado de desconocidas activado."""
    last_err: Exception | None = None
    for attempt in range(retries):
        try:
            # POST para no chocar con el limite de longitud de una URL.
            resp = session.post(
                APERTIUM_URL,
                data={"langpair": LANGPAIR, "markUnknown": "yes", "q": text},
                timeout=45,
            )
            resp.raise_for_status()
            payload = resp.json()
            if payload.get("responseStatus") != 200:
                raise TranslationError(f"Apertium devolvio {payload.get('responseStatus')}")
            return payload["responseData"]["translatedText"]
        except Exception as exc:  # noqa: BLE001
            last_err = exc
            time.sleep(1.5 * (attempt + 1))
    raise TranslationError(f"No se pudo traducir tras {retries} intentos: {last_err}")


def _unknown_ratio(translated: str) -> float:
    """Proporcion de palabras que Apertium no ha reconocido."""
    words = re.findall(r"[*]?[^\W\d_][\w'’-]*", translated, re.UNICODE)
    if not words:
        return 0.0
    unknown = sum(1 for w in words if w.startswith("*"))
    return unknown / len(words)


def _clean_marks(text: str) -> str:
    text = UNKNOWN_MARK_RE.sub("", text)
    return GENFAIL_MARK_RE.sub("", text)


def translate_block(text: str) -> tuple[str, bool]:
    """Traduce un bloque. Devuelve (texto, se_ha_traducido)."""
    if not text or not text.strip():
        return text, False

    # Apertium recorta los espacios de los extremos, y algunos textos los llevan
    # a proposito (p. ej. "Funciones especiales: " se concatena con la fecha).
    izq = text[: len(text) - len(text.lstrip())]
    der = text[len(text.rstrip()) :]
    nucleo = text.strip()

    protected, saved = _protect(nucleo)
    raw = _api_translate(protected)

    # Si el bloque es largo y no parece espanol, lo dejamos intacto
    # (p. ej. la sinopsis en italiano de Abbi Pazienza).
    palabras = len(re.findall(r"[^\W\d_][\w'’-]*", protected, re.UNICODE))
    if palabras >= MIN_WORDS_FOR_LANG_CHECK and _unknown_ratio(raw) > UNKNOWN_RATIO_LIMIT:
        return text, False

    return _restore(_clean_marks(raw), saved), True


def translate(text: str) -> str:
    """Traduce respetando parrafos: cada uno se evalua por separado."""
    if not text or not text.strip():
        return text
    # Se conservan los separadores (lineas en blanco) para no tocar el markdown.
    parts = re.split(r"(\n\s*\n)", text)
    out = []
    for part in parts:
        if re.fullmatch(r"\n\s*\n", part or ""):
            out.append(part)
        else:
            out.append(translate_block(part)[0])
    return "".join(out)


# --------------------------------------------------------------------------
# Fichas
# --------------------------------------------------------------------------

FM_RE = re.compile(r"^---\s*\n(.*?)\n---\s*\n?(.*)$", re.DOTALL)


def split_front_matter(raw: str) -> tuple[dict, str]:
    m = FM_RE.match(raw)
    if not m:
        raise ValueError("La ficha no tiene front-matter YAML")
    data = yaml.safe_load(m.group(1)) or {}
    return data, m.group(2)


def source_hash(data: dict, body: str) -> str:
    """Huella de SOLO lo que se traduce: si no cambia, no se rehace."""
    parts = [body]
    for f in TEXT_FIELDS:
        parts.append(str(data.get(f, "")))
    for f in LIST_FIELDS:
        parts.append("|".join(str(x) for x in (data.get(f) or [])))
    return hashlib.sha256("\x1f".join(parts).encode("utf-8")).hexdigest()[:16]


def existing_hash(path: Path) -> str | None:
    if not path.exists():
        return None
    try:
        data, _ = split_front_matter(path.read_text(encoding="utf-8"))
        return data.get("sourceHash")
    except Exception:  # noqa: BLE001
        return None


def build_translation(data: dict, body: str) -> tuple[dict, str]:
    out: dict = {}

    for field in TEXT_FIELDS:
        value = data.get(field)
        if isinstance(value, str) and value.strip():
            out[field] = translate(value)

    for field in LIST_FIELDS:
        values = data.get(field) or []
        if values:
            out[field] = [translate(str(v)) for v in values]

    ca_body = translate(body.strip()) if body.strip() else ""
    return out, ca_body


def write_translation(slug: str, translated: dict, ca_body: str, digest: str) -> str:
    front = dict(translated)
    front["sourceHash"] = digest
    front["generated"] = True

    yaml_text = yaml.safe_dump(
        front, allow_unicode=True, sort_keys=False, default_flow_style=False
    ).strip()

    banner = (
        "# ARCHIVO GENERADO — no editar a mano.\n"
        "# Lo produce scripts/translate_ca.py a partir de la ficha en castellano.\n"
        "# Cualquier cambio manual se pierde en la siguiente sincronizacion.\n"
    )
    return f"---\n{banner}{yaml_text}\n---\n\n{ca_body}\n"


# --------------------------------------------------------------------------
# Textos de interfaz (menus, botones, paginas legales...)
# --------------------------------------------------------------------------

I18N_DIR = ROOT / "src" / "i18n"
PARTS_DIR = I18N_DIR / "parts"
UI_ES = I18N_DIR / "ui.es.json"
UI_CA = I18N_DIR / "ui.ca.json"
# Correcciones a mano: lo que este aqui gana siempre sobre la traduccion
# automatica y no se pisa nunca.
UI_CA_LOCK = I18N_DIR / "ui.ca.lock.json"


def merge_parts() -> dict[str, str]:
    """Junta src/i18n/parts/*.es.json en un solo diccionario castellano."""
    merged: dict[str, str] = {}
    if not PARTS_DIR.is_dir():
        return merged
    for part in sorted(PARTS_DIR.glob("*.es.json")):
        data = json.loads(part.read_text(encoding="utf-8"))
        for key, value in data.items():
            if key in merged and merged[key] != value:
                print(f"  !! clave repetida con texto distinto: {key} ({part.name})")
            merged[key] = value
    return merged


def build_ui(force: bool, dry: bool) -> int:
    es_dict = merge_parts()
    if not es_dict:
        print("  (sin textos de interfaz que procesar)")
        return 0

    if not dry:
        UI_ES.write_text(
            json.dumps(es_dict, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
        )

    previo: dict[str, str] = {}
    if UI_CA.exists():
        try:
            previo = json.loads(UI_CA.read_text(encoding="utf-8"))
        except Exception:  # noqa: BLE001
            previo = {}

    lock: dict[str, str] = {}
    if UI_CA_LOCK.exists():
        lock = json.loads(UI_CA_LOCK.read_text(encoding="utf-8"))

    # Para saber si un texto castellano ha cambiado desde la ultima traduccion.
    huellas_path = I18N_DIR / ".ui.hashes.json"
    huellas: dict[str, str] = {}
    if huellas_path.exists():
        try:
            huellas = json.loads(huellas_path.read_text(encoding="utf-8"))
        except Exception:  # noqa: BLE001
            huellas = {}

    ca_dict: dict[str, str] = {}
    nuevas = reutilizadas = fijadas = 0

    for key, value in es_dict.items():
        digest = hashlib.sha256(value.encode("utf-8")).hexdigest()[:16]

        if key in lock:
            ca_dict[key] = lock[key]
            huellas[key] = digest
            fijadas += 1
            continue

        if not force and huellas.get(key) == digest and key in previo:
            ca_dict[key] = previo[key]
            reutilizadas += 1
            continue

        ca_dict[key] = translate(value)
        huellas[key] = digest
        nuevas += 1

    # Limpiamos huellas de claves que ya no existen.
    huellas = {k: v for k, v in huellas.items() if k in es_dict}

    if not dry:
        UI_CA.write_text(
            json.dumps(ca_dict, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
        )
        huellas_path.write_text(
            json.dumps(huellas, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
        )

    print(
        f"Interfaz: {len(es_dict)} claves "
        f"({nuevas} traducidas, {reutilizadas} sin cambios, {fijadas} fijadas a mano)."
    )
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description="Traduce las fichas al catalan (Apertium)")
    ap.add_argument("--force", action="store_true", help="rehace todas las fichas")
    ap.add_argument("--dry", action="store_true", help="no escribe nada")
    ap.add_argument("--only", help="slug concreto a traducir")
    ap.add_argument("--ui", action="store_true", help="solo los textos de interfaz")
    ap.add_argument("--fichas", action="store_true", help="solo las fichas de espectaculo")
    args = ap.parse_args()

    hacer_ui = args.ui or not args.fichas
    hacer_fichas = args.fichas or not args.ui
    if args.only:
        hacer_ui = False
        hacer_fichas = True

    if not SRC_DIR.is_dir():
        print(f"ERROR: no existe {SRC_DIR}", file=sys.stderr)
        return 1

    # Aviso de seguridad: que nadie meta un nombre propio en la lista a traducir.
    clash = set(TEXT_FIELDS) & set(NEVER_TRANSLATE)
    if clash:
        print(f"ERROR: campos protegidos en TEXT_FIELDS: {clash}", file=sys.stderr)
        return 1

    if hacer_ui:
        build_ui(force=args.force, dry=args.dry)

    if not hacer_fichas:
        return 0

    OUT_DIR.mkdir(parents=True, exist_ok=True)

    sources = sorted(SRC_DIR.glob("*.md"))
    if args.only:
        sources = [p for p in sources if p.stem == args.only]
        if not sources:
            print(f"ERROR: no encuentro la ficha '{args.only}'", file=sys.stderr)
            return 1

    hechas = saltadas = fallidas = 0
    slugs_vivos = set()

    for path in sources:
        slug = path.stem
        slugs_vivos.add(slug)
        out_path = OUT_DIR / f"{slug}.md"

        try:
            data, body = split_front_matter(path.read_text(encoding="utf-8"))
        except Exception as exc:  # noqa: BLE001
            print(f"  !! {slug}: {exc}")
            fallidas += 1
            continue

        digest = source_hash(data, body)
        if not args.force and existing_hash(out_path) == digest:
            saltadas += 1
            continue

        try:
            translated, ca_body = build_translation(data, body)
        except TranslationError as exc:
            print(f"  !! {slug}: {exc}")
            fallidas += 1
            continue

        contenido = write_translation(slug, translated, ca_body, digest)
        if args.dry:
            print(f"  (simulado) {slug}")
        else:
            out_path.write_text(contenido, encoding="utf-8")
            print(f"  traducida {slug}")
        hechas += 1

    # Limpieza: si una ficha castellana desaparece, su traduccion sobra.
    huerfanas = 0
    if not args.only:
        for stale in OUT_DIR.glob("*.md"):
            if stale.stem not in slugs_vivos:
                huerfanas += 1
                if not args.dry:
                    stale.unlink()
                print(f"  eliminada huerfana {stale.stem}")

    print(
        f"\nCatalan: {hechas} traducidas, {saltadas} sin cambios, "
        f"{huerfanas} huerfanas, {fallidas} con error."
    )
    return 1 if fallidas else 0


if __name__ == "__main__":
    raise SystemExit(main())
