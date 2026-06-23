#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
gen_tele_playlist.py  ·  Genera la PLAYLIST POR DEFECTO de la tele del escaparate.

Idea: la web ya ordena la cartelera (priority desc, luego fecha mas proxima).
Este script reusa ESE orden, coge los N shows mas importantes, e intercala
promos del teatro (CCR y cartel "de casa") segun una PLANTILLA editable.
Luego reescribe SOLO el "porDefecto" del config.json de la tele, conservando
intactos tus eventos (franjas) y la orientacion (grados).

DOS MODOS:
  (por defecto)  Reconstruye la playlist y, con --upload, la sube por FTP.
                 NO necesita Google Drive: usa los carteles ya cacheados en
                 /tele/media (convencion de nombre: '<slug>.jpg'). Apto para
                 el cron diario (credenciales FTP por variables de entorno).
  --seed         Descarga de Google Drive los carteles que falten (usa la
                 Drive API; credenciales en GOOGLE_APPLICATION_CREDENTIALS) y
                 los deja en --media-dir con el nombre limpio. Paso puntual,
                 solo al dar de alta un show nuevo.

Uso tipico:
  python gen_tele_playlist.py --assume-available --out ../config.local.json   # primera vez (ver carteles)
  python gen_tele_playlist.py --upload                                        # diario (cron), via FTP
  python gen_tele_playlist.py --seed                                          # sembrar carteles nuevos de Drive
"""

# OJO: este directorio (scripts/) contiene modulos como 'inspect.py' que
# eclipsan a los estandar. Quitamos el dir del script de sys.path ANTES de
# importar nada mas, para no romper argparse/dataclasses en Python 3.14+.
import os, sys
_here = os.path.dirname(os.path.abspath(__file__))
sys.path[:] = [p for p in sys.path if os.path.abspath(p or ".") != _here]

import argparse, json, re, glob, urllib.request, urllib.error, urllib.parse
from datetime import date, datetime

# ============================ CONFIGURACION ============================
TEATRO        = "Teatre Muntaner"
CONTENT_DIR   = os.path.join(os.path.dirname(__file__), "..", "src", "content", "espectaculos")
MAPPING_FILE  = os.path.join(os.path.dirname(__file__), "tele_posters.json")
CONFIG_URL    = "https://tele.teatremuntaner.com/config.json"   # config en vivo (para preservar eventos)
MEDIA_URL     = "https://tele.teatremuntaner.com/media/"        # para comprobar que el cartel existe (HEAD)
SCREEN_SLUG   = "principal"     # que pantalla del config.json regeneramos

# Overlay "proxima funcion" (lo lee motor.js de estos campos de nivel superior del config).
# Se conservan si ya estan en el config en vivo; si faltan, este script los re-crea
# (asi el overlay sobrevive aunque un guardado del panel los hubiera borrado).
FUNCIONES_URL = "https://teatremuntaner.com/funciones.json"
OVERLAY_POS   = "abajo-izq"

N_SHOWS       = 6               # cuantos shows entran (los mas importantes)
SECONDS_SHOW  = 10              # segundos por cartel de show
SECONDS_PROMO = 10              # segundos por promo (CCR / casa)
POSTER_GIRAR  = True            # tele girada fisicamente -> carteles verticales SI se giran (grados -90)

# Plantilla intercalada (EDITABLE). Tokens: SHOW = siguiente show por orden;
# CCR = cartel de Corta el Cable Rojo; HOUSE = cartel institucional del teatro.
# Patron de Carlos: CCR y cartel de casa (HOUSE) intercalados, ~cada 3:
#   CCR, E1, E2, MUNT, E3, CCR, E4, E5, MUNT, E6
TEMPLATE = ["CCR", "SHOW", "SHOW", "HOUSE", "SHOW", "CCR", "SHOW", "SHOW", "HOUSE", "SHOW"]

# FTP (para --upload). Se leen de variables de entorno; NUNCA hardcodear la contrasena.
FTP_HOST = os.environ.get("TELE_FTP_HOST", "134.0.10.211")
FTP_USER = os.environ.get("TELE_FTP_USER", "teatremu07")
FTP_PASS = os.environ.get("TELE_FTP_PASS", "")
FTP_DIR  = os.environ.get("TELE_FTP_DIR",  "/web/tele")
# ======================================================================


def hoy_iso():
    return date.today().isoformat()


def parse_front(path):
    """Lee el frontmatter YAML (limitado) de una ficha: dates[], draft, unlisted, priority."""
    txt = open(path, encoding="utf-8").read()
    m = re.search(r"^---\s*\n(.*?)\n---", txt, re.S)
    fm = m.group(1) if m else txt
    draft    = bool(re.search(r"^draft:\s*true",    fm, re.M))
    unlisted = bool(re.search(r"^unlisted:\s*true", fm, re.M))
    pm = re.search(r"^priority:\s*(-?\d+)", fm, re.M)
    priority = int(pm.group(1)) if pm else 0
    dates = re.findall(r'date:\s*"?(\d{4}-\d{2}-\d{2})"?', fm)
    return {"draft": draft, "unlisted": unlisted, "priority": priority, "dates": sorted(dates)}


def next_date(dates, today):
    fut = [d for d in dates if d >= today]
    return fut[0] if fut else (dates[-1] if dates else "9999")


def is_archived(dates, today):
    return len(dates) > 0 and not any(d >= today for d in dates)


def ordered_shows():
    """Replica el orden de index.astro: priority desc, luego proxima fecha asc; sin draft/unlisted/pasados."""
    today = hoy_iso()
    rows = []
    for path in glob.glob(os.path.join(CONTENT_DIR, "*.md")):
        slug = os.path.splitext(os.path.basename(path))[0]
        f = parse_front(path)
        if f["draft"] or f["unlisted"] or is_archived(f["dates"], today):
            continue
        rows.append((slug, f["priority"], next_date(f["dates"], today)))
    rows.sort(key=lambda r: (-r[1], r[2]))
    return rows  # [(slug, priority, next_date), ...]


def media_exists(file):
    try:
        req = urllib.request.Request(MEDIA_URL + urllib.parse.quote(file), method="HEAD")
        with urllib.request.urlopen(req, timeout=15) as r:
            return r.status == 200
    except Exception:
        return False


def build_playlist(mapping, assume_available):
    shows = ordered_shows()
    mapped = mapping["shows"]
    # candidatos: shows con cartel mapeado (y, salvo --assume-available, ya presente en /media)
    chosen, skipped = [], []
    for slug, prio, nd in shows:
        if slug == "corta-el-cable-rojo":
            continue  # CCR va como promo intercalada, no como uno de los N shows
        if slug not in mapped:
            skipped.append((slug, "sin cartel (gap o no mapeado)"))
            continue
        file = slug + ".jpg"
        if not assume_available and not media_exists(file):
            skipped.append((slug, "cartel aun no subido a /media"))
            continue
        chosen.append((slug, file))
        if len(chosen) >= N_SHOWS:
            break

    ccr_file   = mapping["promos"]["ccr"]["file"]
    house_file = mapping["promos"]["house"]["file"]
    house_ok   = assume_available or media_exists(house_file)

    lista, si = [], 0
    for tok in TEMPLATE:
        if tok == "SHOW":
            if si >= len(chosen):
                continue
            # show: el slug de la ficha = id en funciones.json -> el overlay empareja solo.
            lista.append({"archivo": chosen[si][1], "segundos": SECONDS_SHOW, "girar": POSTER_GIRAR, "show": chosen[si][0]})
            si += 1
        elif tok == "CCR":
            # CCR tambien es un espectaculo de la casa (id corta-el-cable-rojo en
            # funciones.json) -> lleva show para que el overlay muestre su proxima funcion.
            lista.append({"archivo": ccr_file, "segundos": SECONDS_PROMO, "girar": POSTER_GIRAR, "show": "corta-el-cable-rojo"})
        elif tok == "HOUSE":
            if house_ok:
                lista.append({"archivo": house_file, "segundos": SECONDS_PROMO, "girar": POSTER_GIRAR})
    return lista, chosen, skipped, house_ok


def fetch_live_config():
    with urllib.request.urlopen(CONFIG_URL + "?t=" + str(int(datetime.now().timestamp())), timeout=20) as r:
        return json.loads(r.read().decode("utf-8"))


def merge_config(live, lista):
    cfg = dict(live)
    pant = cfg.get("pantallas", {})
    if SCREEN_SLUG not in pant:
        sys.exit(f"ERROR: la pantalla '{SCREEN_SLUG}' no existe en el config en vivo; no toco nada.")
    pant[SCREEN_SLUG]["porDefecto"] = {"lista": lista, "girar": POSTER_GIRAR}
    # Conserva el overlay "proxima funcion"; si falta (config sin esos campos o
    # borrado por un guardado del panel), lo re-crea para que no se pierda.
    if not cfg.get("funcionesUrl"):
        cfg["funcionesUrl"] = FUNCIONES_URL
    if not cfg.get("overlay"):
        cfg["overlay"] = OVERLAY_POS
    return cfg


def ftp_upload(local_path, remote_name):
    from ftplib import FTP
    if not FTP_PASS:
        sys.exit("ERROR: falta TELE_FTP_PASS en el entorno; no puedo subir por FTP.")
    ftp = FTP(); ftp.connect(FTP_HOST, 21, timeout=30); ftp.login(FTP_USER, FTP_PASS)
    ftp.cwd(FTP_DIR)
    with open(local_path, "rb") as fh:
        ftp.storbinary("STOR " + remote_name, fh)
    ftp.quit()
    print(f"  subido por FTP -> {FTP_HOST}:{FTP_DIR}/{remote_name}")


def do_seed(mapping, media_dir):
    """Descarga de Drive los carteles que falten en media_dir. Requiere google-api-python-client + credenciales."""
    try:
        from google.oauth2 import service_account
        from googleapiclient.discovery import build
        from googleapiclient.http import MediaIoBaseDownload
    except ImportError:
        sys.exit("Para --seed instala: pip install google-api-python-client google-auth")
    creds_path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
    if not creds_path:
        sys.exit("Para --seed define GOOGLE_APPLICATION_CREDENTIALS (JSON de service account con acceso a la carpeta de Drive).")
    import io
    creds = service_account.Credentials.from_service_account_file(
        creds_path, scopes=["https://www.googleapis.com/auth/drive.readonly"])
    svc = build("drive", "v3", credentials=creds)
    os.makedirs(media_dir, exist_ok=True)
    targets = [(slug + ".jpg", d["drive_id"]) for slug, d in mapping["shows"].items()]
    targets.append((mapping["promos"]["ccr"]["file"], mapping["promos"]["ccr"]["drive_id"]))
    for fname, fid in targets:
        if not fid:
            continue
        dst = os.path.join(media_dir, fname)
        if os.path.exists(dst):
            continue
        fh = io.FileIO(dst, "wb")
        dl = MediaIoBaseDownload(fh, svc.files().get_media(fileId=fid))
        done = False
        while not done:
            _, done = dl.next_chunk()
        fh.close()
        print(f"  sembrado {fname}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=None, help="ruta del config.json a escribir (si no, solo --upload)")
    ap.add_argument("--upload", action="store_true", help="subir el config.json por FTP")
    ap.add_argument("--assume-available", action="store_true", help="no comprobar /media (primera vez, antes de subir carteles)")
    ap.add_argument("--seed", action="store_true", help="descargar de Drive los carteles que falten")
    ap.add_argument("--media-dir", default=os.path.join(os.path.dirname(__file__), "..", "..", "tele-media"))
    args = ap.parse_args()

    mapping = json.load(open(MAPPING_FILE, encoding="utf-8"))

    if args.seed:
        print(f"[{TEATRO}] sembrando carteles de Drive en {args.media_dir} ...")
        do_seed(mapping, args.media_dir)
        return

    lista, chosen, skipped, house_ok = build_playlist(mapping, args.assume_available)
    print(f"[{TEATRO}] playlist por defecto: {len(lista)} elementos")
    print("  shows elegidos:", ", ".join(s for s, _ in chosen) or "(ninguno)")
    if not house_ok:
        print("  AVISO: falta el cartel de casa (_casa.jpg); intercalo solo CCR de momento.")
    for slug, why in skipped:
        print(f"  saltado: {slug}  ({why})")

    live = fetch_live_config()
    cfg = merge_config(live, lista)
    out = args.out or os.path.join(os.path.dirname(__file__), "..", "..", "tele-config.json")
    json.dump(cfg, open(out, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    print(f"  escrito {out}  (eventos/franjas conservados: {len(cfg['pantallas'][SCREEN_SLUG].get('franjas', []))})")

    if args.upload:
        if not FTP_PASS:
            print("  AVISO: TELE_FTP_PASS no definido; he generado el config pero NO lo subo. Configura el secret.")
        else:
            ftp_upload(out, "config.json")


if __name__ == "__main__":
    main()
