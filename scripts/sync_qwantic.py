# -*- coding: utf-8 -*-
"""
Sincroniza la cartelera con Qwantic usando la API oficial de entradas.plus
(api2/events). Las fechas exactas de cada función se leen de la página del evento.

Modo "seguro + crear borradores":
- Actualiza SOLO las fechas de los shows existentes (match por qwanticEventId).
  No toca géneros, artista, sinopsis, acento, cartel ya elegido, etc.
- Crea ficha BORRADOR (draft: true) para shows nuevos, con título, cartel oficial,
  fechas, duración y precio. El resto se completa en el CMS.
- Informa de altas, bajas (shows que ya no están en el feed) y excluidos.

Uso:  python scripts/sync_qwantic.py            (aplica cambios)
      python scripts/sync_qwantic.py --dry      (solo informe, no escribe)
"""
import os, re, json, sys, subprocess, colorsys, unicodedata, datetime, urllib.request, shutil, html

# La consola de Windows usa cp1252 y revienta con emojis/·/→. Forzamos UTF-8.
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

# Ruta portable (funciona en Windows y en el runner de GitHub Actions)
DEST = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                    "src", "content", "espectaculos")
# API oficial de Qwantic (sin login): proveedor -> venues -> events, con
# longDescription (sinopsis), poster, precio, fechas y saleStatus.
API_URL = "https://es.entradas.plus/api2/events/2?idProvider=2079"
EVENT_URL = "https://lamuntaner.entradas.plus/entradas/comprarEvento?idEvento={}"
# Cartel de Qwantic (2:3, 400x600 máx). Encaja en el hueco 2:3 de la tarjeta.
POSTER_URL = "https://es.entradas.plus/entradas/img_web/2079/5500/{}/m_poster.jpg"
TICKET_URL = "https://lamuntaner.entradas.plus/entradas/comprarEvento?idEvento={}"

# No son cartelera: Fila 0 / donativos (si los hubiera)
SKIP_IDS = set()
SKIP_TITLE = re.compile(r"\bfila\s*0\b", re.I)

DRY = "--dry" in sys.argv
UA = {"User-Agent": "Mozilla/5.0"}

def get(url, binary=False, headers=None):
    h = dict(UA)
    if headers:
        h.update(headers)
    req = urllib.request.Request(url, headers=h)
    with urllib.request.urlopen(req, timeout=40) as r:
        data = r.read()
    return data if binary else data.decode("utf-8", "ignore")

def slugify(s):
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    return re.sub(r"-{2,}", "-", re.sub(r"[^a-z0-9]+", "-", s)).strip("-")

def strip_html(s):
    s = re.sub(r"<(script|style)[^>]*>.*?</\1>", " ", s or "", flags=re.S | re.I)
    s = re.sub(r"</(p|br|div|li)>", "\n", s, flags=re.I)
    s = html.unescape(re.sub(r"<[^>]+>", " ", s))
    lines = [re.sub(r"[ \t]+", " ", l).strip() for l in s.splitlines()]
    return "\n\n".join(l for l in lines if l).strip()

def fetch_feed():
    """Eventos desde la API oficial, normalizados al formato que usa el script."""
    data = json.loads(get(API_URL, headers={"Accept": "application/json", "Content-Type": "application/json"}))
    out = []
    for prov in data:
        for venue in prov.get("venues", []):
            for e in venue.get("events", []):
                out.append({
                    "idEvento": e.get("idEvent"),
                    "litEvento": e.get("event", ""),
                    "activo": True,
                    "precioMinimo": e.get("priceFrom") or 0,
                    "posterUrl": e.get("poster") or "",
                    "longDescription": e.get("longDescription") or "",
                    "saleStatus": e.get("saleStatus"),
                })
    return out

def fetch_sessions(eid):
    """[(YYYY-MM-DD, HH:MM)] futuras, ordenadas, máx 12."""
    try:
        raw = get(EVENT_URL.format(eid))
    except Exception:
        return []
    m = re.search(r"Sesiones\s*=\s*(\[.*?\]);", raw, re.S)
    if not m:
        return []
    out, seen = [], set()
    try:
        for s in json.loads(m.group(1)):
            fc = s.get("fechaCelebracionStr", "")
            mm = re.match(r"(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})", fc)
            if mm and (mm.group(1), mm.group(2)) not in seen:
                seen.add((mm.group(1), mm.group(2)))
                out.append((mm.group(1), mm.group(2)))
    except Exception:
        return []
    out.sort()
    today = datetime.date.today().isoformat()
    fut = [d for d in out if d[0] >= today]
    return (fut or out)[:24]

def fetch_synopsis(friendly):
    """Sinopsis desde la página del evento en Qwantic (bloque 'event-description-landing')."""
    if not friendly:
        return ""
    try:
        t = get(f"https://lamuntaner.entradas.plus/entradas/{friendly}")
    except Exception:
        return ""
    m = (re.search(r'event-description-landing[^"]*"[^>]*>(.*?)</div>\s*</div>', t, re.S | re.I)
         or re.search(r'class="[^"]*editor-content[^"]*"[^>]*>(.*?)</div>', t, re.S | re.I))
    if not m:
        return ""
    chunk = re.sub(r"<(script|style)[^>]*>.*?</\1>", " ", m.group(1), flags=re.S | re.I)
    chunk = re.sub(r"</(p|br|div|li)>", "\n", chunk, flags=re.I)
    txt = html.unescape(re.sub(r"<[^>]+>", " ", chunk))
    lines = [re.sub(r"[ \t]+", " ", l).strip() for l in txt.splitlines()]
    lines = [l for l in lines if l and not re.fullmatch(
        r"(event information|informaci[oó]n sobre el evento)", l, re.I)]
    return "\n\n".join(lines).strip()

def dates_block(sessions):
    lines = ["dates:"]
    for iso, t in sessions:
        lines.append(f'  - date: "{iso}"')
        if t:
            lines.append(f'    time: "{t}"')
    return "\n".join(lines) + "\n"

DATES_RE = re.compile(r'^dates:\n(?:[ ]{2}- date:.*\n(?:[ ]{4}time:.*\n)?)+', re.M)

def avg_accent(poster_path):
    try:
        raw = subprocess.run(["ffmpeg", "-v", "error", "-i", poster_path, "-vf", "scale=1:1",
            "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], capture_output=True, timeout=30).stdout
        r, g, b = raw[0], raw[1], raw[2]
    except Exception:
        r, g, b = 179, 18, 42
    h_, l_, s_ = colorsys.rgb_to_hls(r/255, g/255, b/255)
    s_ = min(0.95, max(s_*1.5, 0.42)); l_ = min(0.74, max(0.56, l_))
    r, g, b = (round(c*255) for c in colorsys.hls_to_rgb(h_, l_, s_))
    accent = f"#{r:02x}{g:02x}{b:02x}"
    ink = "#0c0a0f" if (0.299*r+0.587*g+0.114*b) > 150 else "#ffffff"
    return accent, ink

# --- Índice de fichas existentes por qwanticEventId ---
existing = {}   # eid -> (filepath, texto)
for fn in os.listdir(DEST):
    if not fn.endswith(".md"):
        continue
    p = os.path.join(DEST, fn)
    t = open(p, encoding="utf-8").read()
    m = re.search(r'qwanticEventId:\s*"?(\d+)"?', t)
    if m:
        existing[int(m.group(1))] = (p, t)

feed = fetch_feed()
report = {"upd": [], "nodate": [], "new": [], "skip": [], "baja": []}
feed_ids = set()

for e in feed:
    eid = e["idEvento"]
    title = re.sub(r"\s+", " ", e.get("litEvento", "")).strip().rstrip(".").strip()
    if eid in SKIP_IDS or SKIP_TITLE.search(title) or not e.get("activo", True):
        report["skip"].append((eid, title)); continue
    feed_ids.add(eid)
    sessions = fetch_sessions(eid)

    if eid in existing:
        path, t = existing[eid]
        if not sessions:
            report["nodate"].append((eid, title)); continue
        new_t, n = DATES_RE.subn(dates_block(sessions), t, count=1)
        if n == 0:  # ficha sin bloque dates: lo insertamos tras qwanticEventId
            new_t = re.sub(r'(qwanticEventId:.*\n)', r'\1' + dates_block(sessions), t, count=1)
        if new_t != t:
            if not DRY:
                open(path, "w", encoding="utf-8").write(new_t)
            report["upd"].append((eid, os.path.basename(path), len(sessions)))
        continue

    # --- ALTA: nueva ficha borrador ---
    slug = slugify(title)
    duracion = e.get("duracion", 0)
    precio = e.get("precioMinimoComision") or e.get("precioMinimo") or 0
    accent, ink = "#bd221f", "#ffffff"
    poster_rel = f"./{slug}.jpg"
    if not DRY:
        dst = os.path.join(DEST, slug + ".jpg")
        try:
            img = get(e.get("posterUrl") or POSTER_URL.format(eid), binary=True)
            if len(img) < 2000:
                raise ValueError("poster vacío")
            open(dst, "wb").write(img)
            accent, ink = avg_accent(dst)   # acento desde el cartel
        except Exception:
            # Si Qwantic no diera cartel, placeholder y a completar en el CMS
            ph = os.path.join(os.path.dirname(os.path.abspath(__file__)), "cartel-pendiente.jpg")
            try: shutil.copyfile(ph, dst)
            except Exception: pass

    fm = ["---", f'title: "{title.replace(chr(34), chr(39))}"', 'category: "Espectáculo"', "genres: []"]
    fm.append(f'poster: "{poster_rel or "./" + slug + ".jpg"}"')
    fm += [f'accent: "{accent}"', f'accentInk: "{ink}"']
    if sessions:
        fm.append(dates_block(sessions).rstrip("\n"))
    fm += [f'ticketUrl: "{TICKET_URL.format(eid)}"', f'qwanticEventId: "{eid}"']
    if duracion and e.get("mostrarDuracion", True):
        fm.append(f'duration: "{duracion} min"')
    if precio:
        fm.append(f'price: "Desde {precio:.0f} €"')
    synopsis = strip_html(e.get("longDescription", ""))
    body_txt = synopsis or f"{title} en el Teatre Muntaner, en el corazón de Barcelona. (Sinopsis pendiente de completar.)"
    fm += ['venue: "Teatre Muntaner · Carrer de Muntaner 4, Barcelona"', "draft: true", "---", "", body_txt, ""]
    if not DRY:
        open(os.path.join(DEST, slug + ".md"), "w", encoding="utf-8").write("\n".join(fm))
    report["new"].append((eid, slug, len(sessions)))

# Bajas: fichas con qwanticEventId que ya no está en el feed
for eid, (path, t) in existing.items():
    if eid not in feed_ids and eid not in SKIP_IDS:
        report["baja"].append((eid, os.path.basename(path)))

# --- Informe ---
tag = "[DRY-RUN] " if DRY else ""
print(f"\n=== {tag}SINCRONIZACIÓN QWANTIC ===")
print(f"Eventos en feed: {len(feed)}")
print(f"\nFECHAS ACTUALIZADAS ({len(report['upd'])}):")
for eid, fn, nd in report["upd"]:
    print(f"  · {fn:42} {nd} funciones  (id {eid})")
print(f"\nALTAS / BORRADORES NUEVOS ({len(report['new'])}):")
for eid, slug, nd in report["new"]:
    print(f"  + {slug:42} {nd} funciones  (id {eid})  ⚠ completar géneros/artista/sinopsis en el CMS")
print(f"\nBAJAS (ya no en feed; revisar a mano) ({len(report['baja'])}):")
for eid, fn in report["baja"]:
    print(f"  - {fn}  (id {eid})")
print(f"\nSIN FECHAS A LA VENTA (sin cambios) ({len(report['nodate'])}):")
for eid, title in report["nodate"]:
    print(f"  ? {title}  (id {eid})")
print(f"\nEXCLUIDOS (no cartelera) ({len(report['skip'])}):")
for eid, title in report["skip"]:
    print(f"  x {title}  (id {eid})")
