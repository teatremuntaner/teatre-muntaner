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
- Carteles del kit (E57, 06/09/2026): la ficha que lleva `kitClave` (la clave del kit
  de adaptaciones de madteatro) recibe el cartel 2:3 del kit, con el pie de venta
  compuesto dentro, en vez del m_poster.jpg de Qwantic con la franja pegada. Sin
  clave, o si madteatro contesta 404 (todavía sin tanda), el cartel se queda como
  está y el informe lo dice.

Uso:  python scripts/sync_qwantic.py            (aplica cambios)
      python scripts/sync_qwantic.py --dry      (solo informe, no escribe)
"""
import os, re, json, sys, subprocess, colorsys, unicodedata, datetime, urllib.request, urllib.error, shutil, html, hashlib

# La consola de Windows usa cp1252 y revienta con emojis/·/→. Forzamos UTF-8.
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

# Ruta portable (funciona en Windows y en el runner de GitHub Actions)
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEST = os.path.join(ROOT, "src", "content", "espectaculos")
# API oficial de Qwantic (sin login): proveedor -> venues -> events, con
# longDescription (sinopsis), poster, precio, fechas y saleStatus.
API_URL = "https://es.entradas.plus/api2/events/2?idProvider=2079"
EVENT_URL = "https://lamuntaner.entradas.plus/entradas/comprarEvento?idEvento={}"
# Cartel de Qwantic (2:3, 400x600 máx). Encaja en el hueco 2:3 de la tarjeta.
POSTER_URL = "https://es.entradas.plus/entradas/img_web/2079/5500/{}/m_poster.jpg"
TICKET_URL = "https://lamuntaner.entradas.plus/entradas/comprarEvento?idEvento={}"
# Piezas públicas del kit de adaptaciones de madteatro (contrato del 06/09/2026):
# GET {KIT_URL}/<clave de 32 hex>/cartel -> JPEG 2:3 con el pie integrado, ETag = md5
# del contenido, 304 con If-None-Match, 404 sin cuerpo si no hay tanda o la clave no vale.
KIT_URL = "https://madteatro.com/kit"
KIT_CLAVE_OK = re.compile(r"^[a-f0-9]{32}$")

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

# La lista de géneros VÁLIDOS no vive aquí: vive en src/lib/generos.ts, que es la
# misma de los filtros de la portada y del CMS. Se lee de allí para que el sync no
# pueda prerrellenar una etiqueta que luego no filtre — pasó con «Familiar», que
# en la web del Sofía se llamaba «Infantil» y no casaba.
# Si no se pudiera leer, no se prerrellena nada: más vale una ficha vacía, que el
# vigía ve y avisa, que una etiqueta muerta, que no ve nadie.
def _generos_validos():
    p = os.path.join(ROOT, "src", "lib", "generos.ts")
    try:
        src = open(p, encoding="utf-8").read()
    except OSError:
        return []
    m = re.search(r"GENRE_ORDER[^=]*=\s*\[(.*?)\]", src, re.S)
    if not m:
        return []
    return [x.strip().strip("'\"") for x in m.group(1).split(",") if x.strip()]

GENRE_OK = _generos_validos()

# Géneros del sitio y pistas para deducirlos del título+sinopsis (ES/CA/IT). Es
# el PRERRELLENO de las fichas nuevas: si nadie los completa en el CMS, al menos
# no salen vacíos. Se pueden corregir después; el sync no los vuelve a tocar.
GENRE_HINTS = [
    ("Comedia",       r"comedia|com[eè]dia|c[oó]mic|humor|risa|riure|rialles|carcajada"),
    ("Música",        r"concierto|\bconcert\b|musical|m[uú]sica|canciones|can[cç]ons|\bbanda\b|\bcoro\b|flamenco|jazz|piano"),
    ("Monólogos",     r"mon[oó]log|mon[oò]leg|stand.?up|humorista|monologuista"),
    ("Improvisación", r"improvis"),
    ("Magia",         r"\bm[aà]gia\b|\bmago\b|\bmaga\b|ilusionis|il·lusionis|mentalis"),
    ("Familiar",      r"familiar|infantil|para ni[nñ]os|per a nens|t[ií]teres|titelles|tota la fam[ií]lia|toda la familia"),
    ("Teatro",        r"\bobra\b|\bdrama\b|tragicom[eè]dia"),
]

def deduce_genres(title, synopsis):
    """Deduce géneros por palabras clave (máx. 3), siempre de la lista válida.
    Sin señal clara: [] (lo avisa el vigía)."""
    t = f"{title} {synopsis}".lower()
    hallados = [g for g, pat in GENRE_HINTS if re.search(pat, t)]
    return [g for g in hallados if g in GENRE_OK][:3]

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
    """([(YYYY-MM-DD, HH:MM)] futuras, ordenadas, máx 24; inicio de venta más antiguo)."""
    try:
        raw = get(EVENT_URL.format(eid))
    except Exception:
        return [], None
    m = re.search(r"Sesiones\s*=\s*(\[.*?\]);", raw, re.S)
    if not m:
        return [], None
    out, seen, venta_desde = [], set(), None
    try:
        for s in json.loads(m.group(1)):
            fc = s.get("fechaCelebracionStr", "")
            mm = re.match(r"(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})", fc)
            if mm and (mm.group(1), mm.group(2)) not in seen:
                seen.add((mm.group(1), mm.group(2)))
                out.append((mm.group(1), mm.group(2)))
            fv = s.get("fechaInicioVentaStr")
            if fv and (venta_desde is None or fv < venta_desde):
                venta_desde = fv
    except Exception:
        return [], None
    out.sort()
    today = datetime.date.today().isoformat()
    fut = [d for d in out if d[0] >= today]
    # Todas las funciones a la venta (tope de seguridad 1 año). Antes estaba en 24,
    # lo que recortaba shows con muchas funciones (p. ej. Corta el cable rojo) y
    # dejaba fuera del calendario las de meses siguientes aunque estuvieran a la venta.
    return (fut or out)[:366], venta_desde

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

def fmt_precio(p):
    """15.0 -> '15' · 15.3 -> '15.3' (YAML numérico, sin ceros sobrantes)."""
    return f"{float(p):g}"

def upsert_field(t, key, line):
    """Sustituye la línea 'key: ...' del frontmatter o la inserta tras qwanticEventId."""
    if re.search(rf"^{key}:", t, re.M):
        return re.sub(rf"^{key}:.*$", line, t, count=1, flags=re.M)
    return re.sub(r"(qwanticEventId:.*\n)", r"\1" + line + "\n", t, count=1)

YT_ID_RE = re.compile(r"(?:youtu\.be/|v=|embed/|shorts/|^)([A-Za-z0-9_-]{11})")

def fetch_upload_date(youtube):
    """uploadDate del vídeo, del HTML de su página de YouTube (para el VideoObject)."""
    m = YT_ID_RE.search(youtube.strip())
    if not m:
        return None
    try:
        raw = get("https://www.youtube.com/watch?v=" + m.group(1),
                  headers={"Accept-Language": "es-ES,es;q=0.9"})
    except Exception:
        return None
    mm = re.search(r'"uploadDate":"([^"]+)"', raw)
    return mm.group(1) if mm else None

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

# --- Carteles del kit de adaptaciones (E57) ---
def fm_valor(t, key):
    """El valor de la línea `key: ...` del frontmatter, tal como lo entendería YAML en los
    casos que escribe el CMS o una persona: sin comillas (dobles o simples) y sin el
    comentario `# ...` que pueda ir detrás. '' si la línea no está o el valor está vacío.
    (Codex, 06/09/2026: la primera versión solo entendía comillas dobles, y una clave
    entre comillas simples se daba por mal formada sin pedir nada.)"""
    m = re.match(r"---\r?\n(.*?)\r?\n---", t, re.S)
    fm = m.group(1) if m else t
    m = re.search(rf"^{key}:[ \t]*(.*?)[ \t]*$", fm, re.M)
    if not m:
        return ""
    v = m.group(1)
    for q in ('"', "'"):
        if v.startswith(q):
            fin = v.find(q, 1)
            return (v[1:fin] if fin > 0 else v[1:]).strip()
    if v.startswith("#"):   # `kitClave: # desactivado`: solo comentario, valor vacío (Codex, pasada 3)
        return ""
    return re.split(r"[ \t]#", v, 1)[0].strip()

def kit_clave(t):
    """La clave del kit escrita en el frontmatter, o '' si la ficha no la lleva."""
    return fm_valor(t, "kitClave")

def fetch_kit_cartel(clave, etag_local=None):
    """Pide a madteatro el cartel del kit. Devuelve (estado, bytes o motivo):
    'ok' con el JPEG · 'igual' (304: nuestra copia ya es la pieza) · 'sin-kit' (404: sin
    tanda, clave renovada o pieza que falta) · 'error' con el motivo (red, otro código,
    o algo que no es un JPEG)."""
    req = urllib.request.Request(f"{KIT_URL}/{clave}/cartel", headers=dict(UA))
    if etag_local:
        req.add_header("If-None-Match", etag_local)
    try:
        with urllib.request.urlopen(req, timeout=40) as r:
            data = r.read()
    except urllib.error.HTTPError as e:
        if e.code == 304:
            return "igual", None
        if e.code == 404:
            return "sin-kit", None
        return "error", f"HTTP {e.code}"
    except Exception as e:
        return "error", (str(e) or type(e).__name__)[:120]
    if len(data) < 2000 or not data.startswith(b"\xff\xd8"):
        return "error", "la respuesta no es un JPEG"
    return "ok", data

def sync_kit_carteles(report):
    """Segunda pasada, sobre TODAS las fichas del disco (estén o no en el feed): la que
    lleva kitClave recibe el cartel del kit en <slug>.jpg y su `poster` apunta ahí. Se
    manda el md5 de nuestra copia como If-None-Match: el ETag de madteatro es el md5 del
    contenido, así que cuando la pieza no ha cambiado llega un 304 y no se baja nada.
    Solo toca la ficha en castellano: la catalana (espectaculos-ca) es texto y la
    genera translate_ca.py."""
    report["kit"] = []
    report["kit_sin_clave"] = []
    for fn in sorted(os.listdir(DEST)):
        if not fn.endswith(".md"):
            continue
        p = os.path.join(DEST, fn)
        t = open(p, encoding="utf-8").read()
        clave = kit_clave(t)
        if not clave:
            report["kit_sin_clave"].append(fn)
            continue
        slug = fn[:-3]
        if not KIT_CLAVE_OK.match(clave):
            report["kit"].append((fn, "clave-mala", "la clave no son 32 caracteres hexadecimales; no se pide nada"))
            continue
        dst = os.path.join(DEST, slug + ".jpg")
        rel = f"./{slug}.jpg"
        poster_actual = fm_valor(t, "poster")
        apunta_aqui = poster_actual in (rel, slug + ".jpg")
        # Solo se revalida contra nuestra copia si es la que la ficha enseña: si el cartel
        # apunta a otro archivo, hace falta el 200 para poder apuntarlo aquí.
        etag_local = None
        if apunta_aqui and os.path.isfile(dst):
            etag_local = '"' + hashlib.md5(open(dst, "rb").read()).hexdigest() + '"'
        estado, dato = fetch_kit_cartel(clave, etag_local)
        if estado == "ok":
            if not DRY:
                open(dst, "wb").write(dato)
            new_t = upsert_field(t, "poster", f'poster: "{rel}"')
            if new_t != t and not DRY:
                open(p, "w", encoding="utf-8").write(new_t)
            detalle = f"{len(dato)} bytes" + ("" if apunta_aqui else f"; antes era {poster_actual or '(sin cartel)'}")
            report["kit"].append((fn, "ok", detalle))
        elif estado == "igual":
            report["kit"].append((fn, "igual", "sin cambios (304)"))
        elif estado == "sin-kit":
            report["kit"].append((fn, "sin-kit", "madteatro no tiene la pieza (404): se queda el cartel de hoy"))
        else:
            report["kit"].append((fn, "error", f"{dato}: se queda el cartel de hoy"))

def main(argv=None):
    global DRY
    argv = sys.argv[1:] if argv is None else list(argv)
    DRY = "--dry" in argv

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

    # Si Qwantic no responde, esta pasada no toca fechas ni altas, pero los carteles del
    # kit se revisan igual (madteatro es otro servidor) y el fallo se cuenta al final:
    # el proceso termina en error, como antes, con los dos diagnósticos a la vista.
    feed_error = None
    try:
        feed = fetch_feed()
    except Exception as e:
        feed_error = (str(e) or type(e).__name__)[:200]
        feed = []
    report = {"upd": [], "nodate": [], "new": [], "skip": [], "baja": [], "feed_error": feed_error}
    feed_ids = set()

    for e in feed:
        eid = e["idEvento"]
        title = re.sub(r"\s+", " ", e.get("litEvento", "")).strip().rstrip(".").strip()
        if eid in SKIP_IDS or SKIP_TITLE.search(title) or not e.get("activo", True):
            report["skip"].append((eid, title)); continue
        feed_ids.add(eid)
        sessions, venta_desde = fetch_sessions(eid)

        if eid in existing:
            path, t = existing[eid]
            if not sessions:
                report["nodate"].append((eid, title)); continue
            new_t, n = DATES_RE.subn(dates_block(sessions), t, count=1)
            if n == 0:  # ficha sin bloque dates: lo insertamos tras qwanticEventId
                new_t = re.sub(r'(qwanticEventId:.*\n)', r'\1' + dates_block(sessions), t, count=1)
            # Datos del Offer del JSON-LD (Search Console): precio mínimo e inicio de venta
            if e.get("precioMinimo"):
                new_t = upsert_field(new_t, "priceFrom", f"priceFrom: {fmt_precio(e['precioMinimo'])}")
            if venta_desde:
                new_t = upsert_field(new_t, "saleStart", f'saleStart: "{venta_desde}"')
            if new_t != t:
                if not DRY:
                    open(path, "w", encoding="utf-8").write(new_t)
                report["upd"].append((eid, os.path.basename(path), len(sessions)))
            continue

        # --- ALTA: nueva ficha borrador ---
        # El cartel de la ficha nueva es el de Qwantic, como siempre: la clave del kit se
        # pega en la ficha después (cuando madteatro tenga la tanda) y la pasada de
        # carteles del kit lo cambia en la siguiente sincronización.
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

        synopsis = strip_html(e.get("longDescription", ""))
        genres = deduce_genres(title, synopsis)
        genres_line = "genres: [" + ", ".join(f'"{g}"' for g in genres) + "]"
        fm = ["---", f'title: "{title.replace(chr(34), chr(39))}"', 'category: "Espectáculo"', genres_line]
        fm.append(f'poster: "{poster_rel or "./" + slug + ".jpg"}"')
        fm += [f'accent: "{accent}"', f'accentInk: "{ink}"']
        if sessions:
            fm.append(dates_block(sessions).rstrip("\n"))
        fm += [f'ticketUrl: "{TICKET_URL.format(eid)}"', f'qwanticEventId: "{eid}"']
        if e.get("precioMinimo"):
            fm.append(f"priceFrom: {fmt_precio(e['precioMinimo'])}")
        if venta_desde:
            fm.append(f'saleStart: "{venta_desde}"')
        if duracion and e.get("mostrarDuracion", True):
            fm.append(f'duration: "{duracion} min"')
        if precio:
            fm.append(f'price: "Desde {precio:.0f} €"')
        body_txt = synopsis or f"{title} en el Teatre Muntaner, en el corazón de Barcelona. (Sinopsis pendiente de completar.)"
        fm += ['venue: "Teatre Muntaner · Carrer de Muntaner 4, Barcelona"', "draft: true", "---", "", body_txt, ""]
        if not DRY:
            open(os.path.join(DEST, slug + ".md"), "w", encoding="utf-8").write("\n".join(fm))
        report["new"].append((eid, slug, len(sessions), genres))

    # Bajas: fichas con qwanticEventId que ya no está en el feed (sin feed no hay bajas que contar)
    for eid, (path, t) in existing.items():
        if not feed_error and eid not in feed_ids and eid not in SKIP_IDS:
            report["baja"].append((eid, os.path.basename(path)))

    # Fichas con vídeo de YouTube sin uploadDate: lo sacamos de la página del vídeo
    # (Google lo pide en el VideoObject). Releemos del disco: el bucle de fechas
    # puede haber reescrito el archivo.
    report["ytdate"] = []
    for fn in os.listdir(DEST):
        if not fn.endswith(".md"):
            continue
        p = os.path.join(DEST, fn)
        t = open(p, encoding="utf-8").read()
        m = re.search(r'^youtube:\s*"?([^"\n]+)"?\s*$', t, re.M)
        if not m or re.search(r"^youtubeUploadDate:", t, re.M):
            continue
        up = fetch_upload_date(m.group(1))
        if not up:
            report["ytdate"].append((fn, "no encontrado")); continue
        new_t = re.sub(r"(^youtube:.*\n)", r"\1" + f'youtubeUploadDate: "{up}"\n', t, count=1, flags=re.M)
        if not DRY:
            open(p, "w", encoding="utf-8").write(new_t)
        report["ytdate"].append((fn, up))

    # Carteles del kit de adaptaciones: también releyendo del disco, por lo mismo.
    sync_kit_carteles(report)

    # --- Informe ---
    tag = "[DRY-RUN] " if DRY else ""
    print(f"\n=== {tag}SINCRONIZACIÓN QWANTIC ===")
    if feed_error:
        print(f"QWANTIC NO RESPONDE ({feed_error}): en esta pasada no se tocan fechas ni altas; "
              f"los carteles del kit se revisan igual. El proceso termina en error.")
    print(f"Eventos en feed: {len(feed)}")
    print(f"\nFECHAS ACTUALIZADAS ({len(report['upd'])}):")
    for eid, fn, nd in report["upd"]:
        print(f"  · {fn:42} {nd} funciones  (id {eid})")
    print(f"\nALTAS / BORRADORES NUEVOS ({len(report['new'])}):")
    for eid, slug, nd, gen in report["new"]:
        gtxt = "/".join(gen) if gen else "SIN GÉNEROS (deducción sin señal)"
        print(f"  + {slug:42} {nd} funciones  (id {eid})  géneros deducidos: {gtxt}  ⚠ revisar géneros/artista/sinopsis en el CMS")
    print(f"\nBAJAS (ya no en feed; revisar a mano) ({len(report['baja'])}):")
    for eid, fn in report["baja"]:
        print(f"  - {fn}  (id {eid})")
    print(f"\nSIN FECHAS A LA VENTA (sin cambios) ({len(report['nodate'])}):")
    for eid, title in report["nodate"]:
        print(f"  ? {title}  (id {eid})")
    print(f"\nEXCLUIDOS (no cartelera) ({len(report['skip'])}):")
    for eid, title in report["skip"]:
        print(f"  x {title}  (id {eid})")
    if report["ytdate"]:
        print(f"\nUPLOADDATE DE VÍDEOS ({len(report['ytdate'])}):")
        for fn, up in report["ytdate"]:
            print(f"  » {fn}: {up}")
    kit = report["kit"]
    cuenta = {k: sum(1 for _, est, _ in kit if est == k) for k in ("ok", "igual", "sin-kit", "clave-mala", "error")}
    sin_clave = report["kit_sin_clave"]
    print(f"\nCARTELES DEL KIT: {len(kit)} fichas con kitClave, {len(sin_clave)} sin clave (siguen con su cartel de siempre) — "
          f"{cuenta['ok']} actualizados, {cuenta['igual']} sin cambios, {cuenta['sin-kit']} sin kit, "
          f"{cuenta['clave-mala'] + cuenta['error']} con error:")
    marca = {"ok": "★", "igual": "=", "sin-kit": "?", "clave-mala": "!", "error": "!"}
    for fn, est, detalle in kit:
        print(f"  {marca[est]} {fn:42} {est}: {detalle}")
    return report

if __name__ == "__main__":
    if main().get("feed_error"):
        sys.exit(1)
