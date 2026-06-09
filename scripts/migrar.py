# -*- coding: utf-8 -*-
"""
Migración a fondo: SOLO los espectáculos enlazados desde el home.
Extrae título, artista, categoría, cartel(+color), foto de sinopsis, vídeo YouTube,
sinopsis, fechas/horario y entradas (Qwantic).
"""
import os, re, html, subprocess, shutil, unicodedata, glob, colorsys, json, datetime

SRC = r"C:\Users\carlo\OneDrive\Teatro Sofía\Web\Pruebas"
DEST = r"C:\Users\carlo\dev\teatro-sofia\src\content\espectaculos"

NONSHOW = {"index","avisolegal","politicadecookies","politicadeprivacidad","page28",
           "google5011ee5bc97c495f"}
MONTHS = {"enero":1,"febrero":2,"marzo":3,"abril":4,"mayo":5,"junio":6,"julio":7,
          "agosto":8,"septiembre":9,"setiembre":9,"octubre":10,"noviembre":11,"diciembre":12}

# Artista cuando no se detecta solo (el editor podrá ajustarlo en el CMS)
ARTIST_OVERRIDE = {
    "toni-cano-traficante-de-endorfinas": "Toni Cano",
    "sebastian-gallego-operacion-viejoven": "Sebastián Gallego",
}
# Jerarquía inicial en cartelera (mayor = más arriba). El editor la ajusta en el CMS.
# Clap = producción propia; socios destacados con 50.
PRIORITY = {
    "clap": 100,
    "toni-cano-traficante-de-endorfinas": 50,
    "monologoslacasadelacomedia": 50,
}
# Cartel correcto cuando la página no lo enlaza bien (nombre de archivo en assets/images)
POSTER_OVERRIDE = {
    "toni-cano-traficante-de-endorfinas": "sofia-te-ventas-instagram-1200x1200-1200x1200.jpg",
}
# Géneros (varios) que fija el editor; si no, se usa la categoría auto-detectada
GENRES_OVERRIDE = {
    "clap": ["Comedia", "Música", "Impro"],
}

def slugify(s):
    s = unicodedata.normalize("NFKD", s).encode("ascii","ignore").decode().lower()
    return re.sub(r"-{2,}","-", re.sub(r"[^a-z0-9]+","-", s)).strip("-")
def norm(s):
    return re.sub(r"[^a-z0-9]","", unicodedata.normalize("NFKD",s).encode("ascii","ignore").decode().lower())
def strip_tags(s): return re.sub(r"<[^>]+>"," ", s)
def clean(s): return re.sub(r"\s+"," ", html.unescape(s).replace("\xa0"," ")).strip()

def ffprobe_dims(path):
    try:
        out = subprocess.run(["ffprobe","-v","error","-select_streams","v:0",
            "-show_entries","stream=width,height","-of","csv=p=0",path],
            capture_output=True, text=True, timeout=30).stdout.strip()
        w,h = out.split(",")[:2]; return int(w), int(h)
    except Exception: return None

def avg_color(path):
    try:
        raw = subprocess.run(["ffmpeg","-v","error","-i",path,"-vf","scale=1:1",
            "-f","rawvideo","-pix_fmt","rgb24","-"], capture_output=True, timeout=30).stdout
        if len(raw) >= 3: return raw[0], raw[1], raw[2]
    except Exception: pass
    return (179,18,42)

def body_images(htmltext):
    cands = re.findall(r"assets/images/[^\"']+\.(?:jpg|jpeg|png|webp)", htmltext, re.I)
    return [c for c in dict.fromkeys(cands) if not re.search(r"logo|favicon", c, re.I)]

def pick_poster(htmltext):
    best, sc = None, -1
    for c in body_images(htmltext):
        p = os.path.join(SRC, c.replace("/", os.sep))
        d = ffprobe_dims(p) if os.path.exists(p) else None
        if not d: continue
        w,h = d
        if w < 300: continue
        ratio = h/w
        score = (1500 if ratio>=1.15 else 0) + ratio*200 + min(w,1600)/12
        if score > sc: sc, best = score, p
    return best

def pick_photo(htmltext, poster):
    best, sc = None, -1
    for c in body_images(htmltext):
        p = os.path.join(SRC, c.replace("/", os.sep))
        if not os.path.exists(p) or (poster and os.path.abspath(p)==os.path.abspath(poster)): continue
        if re.search(r"entrada|venta|qwantic|instagram|captura|pantalla|whatsapp|cartel|a4", c, re.I): continue
        d = ffprobe_dims(p)
        if not d: continue
        w,h = d
        if w < 500 or h/w < 0.85: continue
        score = (h/w)*200 + min(w,1600)/12
        if score > sc: sc, best = score, p
    return best

def find_youtube(t):
    m = re.search(r'(?:youtube\.com/(?:embed/|watch\?v=)|youtu\.be/)([A-Za-z0-9_-]{11})', t, re.I)
    return m.group(1) if m else ""

def find_title_artist(t):
    show = ""
    for h1 in re.findall(r"<h1[^>]*>(.*?)</h1>", t, re.I|re.S):
        c = clean(strip_tags(h1))
        if c and not re.fullmatch(r"teatro sof.a", c, re.I): show = c; break
    mt = re.search(r"<title>(.*?)</title>", t, re.I|re.S)
    titletag = clean(mt.group(1)) if mt else ""
    if not show: show = re.sub(r"\s*[-|].*$","", titletag).strip() or "Espectáculo"
    parts = [clean(p) for p in re.split(r"\s+[-|]\s+", titletag)]
    parts = [p for p in parts if p and "entrada" not in p.lower() and not re.search(r"teatro sof", p, re.I)]
    ns = norm(show)
    rest = [p for p in parts if ns and norm(p)!=ns and ns not in norm(p) and norm(p) not in ns]
    artist = " · ".join(rest).strip(" .·")
    if len(artist) > 80: artist = ""
    return show, artist

def find_synopsis(t):
    # La sinopsis real vive en una <section> (troceada en divs). Tomamos la
    # sección con más prosa, excluyendo nav/hero/footer.
    body = re.sub(r"<(script|style)[^>]*>.*?</\1>", " ", t, flags=re.S | re.I)
    best = ""
    for s in re.findall(r"<section\b.*?</section>", body, flags=re.S | re.I):
        txt = clean(strip_tags(s))
        low = txt.lower()
        if len(txt) < 120:
            continue
        if any(x in low for x in ["comprar entradas", "política de", "aviso legal",
                                  "derechos reservados", "cartelera clap", "cookie",
                                  "mayores de 18", "canal oficial"]):
            continue
        if len(txt) > len(best):
            best = txt
    if not best:
        md = re.search(r'<meta name="description" content="([^"]*)"', t, re.I)
        best = clean(md.group(1)) if md else ""
    best = re.sub(r'^\s*sinopsis\s*[:.\-–]?\s*', '', best, flags=re.I)
    return best

def strip_leading_title(syn, show):
    sw, parts, i = show.split(), syn.split(), 0
    while i < len(sw) and i < len(parts) and norm(parts[i]) == norm(sw[i]):
        i += 1
    return " ".join(parts[i:]).lstrip(" .:-–—") if i == len(sw) and i > 0 else syn

def find_links(t):
    EXCLUDE = r"teatrosofia\.es|clapshow\.es|teatremuntaner\.com|entradas\.plus|fonts\.|gstatic|cookiebot|googletag|google\.[a-z.]+/maps|schema\.org|w3\.org|instagram\.com/teatrosofia"
    out, seen = [], set()
    for href in re.findall(r'href="(https?://[^"]+)"', t, re.I):
        if re.search(EXCLUDE, href, re.I) or href in seen:
            continue
        low = href.lower()
        if "instagram" in low: label = "Instagram"
        elif "youtube" in low or "youtu.be" in low: label = "YouTube"
        elif "facebook" in low: label = "Facebook"
        elif "tiktok" in low: label = "TikTok"
        elif "twitter" in low or "//x.com" in low: label = "X"
        elif low.endswith(".pdf") or "dossier" in low: label = "Dossier"
        else: label = "Web"
        seen.add(href)
        out.append({"label": label, "url": href})
        if len(out) >= 6:
            break
    return out

DATE_RE = re.compile(
    r"(?:(?:lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)\s+)?"
    r"(\d{1,2})\s+de\s+(" + "|".join(MONTHS) + r")(?:\s+de\s+(\d{4}))?"
    r"(?:\D{0,14}?(\d{1,2})[:h\.](\d{2}))?", re.I)
def find_dates(t):
    t = clean(strip_tags(t)); out, seen = [], set()
    for m in DATE_RE.finditer(t):
        iso = f"{(int(m.group(3)) if m.group(3) else 2026):04d}-{MONTHS[m.group(2).lower()]:02d}-{int(m.group(1)):02d}"
        time = f"{int(m.group(4)):02d}:{m.group(5)}" if m.group(4) else ""
        if (iso,time) in seen: continue
        seen.add((iso,time)); out.append((iso,time))
        if len(out) >= 8: break
    out.sort(); return out
def find_schedule(t):
    t = clean(strip_tags(t))
    day = r"(?:lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bados?|domingos?)"
    m = re.search(day + r"(?:\s*(?:y|&amp;|&|,)\s*" + day + r")+", t, re.I)
    return clean(m.group(0)) if m else ""

def fetch_qwantic(eid):
    """Devuelve (titulo_oficial, [(YYYY-MM-DD, HH:MM), ...]) desde Qwantic."""
    try:
        url = f"https://sofiateatro.entradas.plus/entradas/comprarEvento?idEvento={eid}"
        raw = subprocess.run(["curl","-s","--connect-timeout","25",url],
                             capture_output=True, timeout=45).stdout.decode("utf-8","ignore")
        title = ""
        mt = re.search(r"<title>(.*?)</title>", raw, re.I|re.S)
        if mt:
            title = re.sub(r"\s*-\s*TEATRO SOF.A.*$", "", clean(mt.group(1)), flags=re.I).strip()
        dates, seen = [], set()
        ms = re.search(r"Sesiones\s*=\s*(\[.*?\]);", raw, re.S)
        if ms:
            try:
                for s in json.loads(ms.group(1)):
                    fc = s.get("fechaCelebracionStr", "")
                    mm = re.match(r"(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})", fc)
                    if mm and (mm.group(1), mm.group(2)) not in seen:
                        seen.add((mm.group(1), mm.group(2)))
                        dates.append((mm.group(1), mm.group(2)))
            except Exception:
                pass
        dates.sort()
        # Solo próximas funciones (descarta pasadas), máximo 12
        today = datetime.date.today().isoformat()
        future = [d for d in dates if d[0] >= today]
        dates = (future or dates)[:12]
        return title, dates
    except Exception:
        return "", []

def category_of(s):
    t = s.lower()
    if re.search(r"magia|hipno|mentalis|mago", t): return "Magia"
    if "flamenco" in t: return "Flamenco"
    if re.search(r"concierto|coro|tributo|\bpop\b|music|sinf|rock|zarzuela|canciones", t): return "Música"
    if re.search(r"infantil|familia|ni[nñ]os", t): return "Infantil"
    if re.search(r"mon[oó]logo|comedia|stand|humor|c[oó]mic|impro|re[ií]r", t): return "Comedia"
    return "Teatro"

# --- Allowlist: solo lo enlazado desde el home ---
idx = open(os.path.join(SRC,"index.html"), encoding="utf-8", errors="ignore").read()
linked = set()
for href in re.findall(r'href="([^"]+\.html)"', idx, re.I):
    b = os.path.splitext(os.path.basename(href))[0]
    if b.lower() not in NONSHOW: linked.add(b)

def conv(src, dst):
    try: subprocess.run(["ffmpeg","-y","-v","error","-i",src,"-q:v","3",dst], check=True, timeout=60)
    except Exception: shutil.copyfile(src, dst)

report, skipped = [], []
os.makedirs(DEST, exist_ok=True)
for htmlpath in sorted(glob.glob(os.path.join(SRC,"*.html"))):
    name = os.path.splitext(os.path.basename(htmlpath))[0]
    if name not in linked: continue
    slug = slugify(name)
    t = open(htmlpath, encoding="utf-8", errors="ignore").read()

    show, artist = find_title_artist(t)
    poster = pick_poster(t)
    if slug in POSTER_OVERRIDE:
        ov = os.path.join(SRC, "assets", "images", POSTER_OVERRIDE[slug])
        if os.path.exists(ov): poster = ov
    if not poster: skipped.append((name,"sin cartel")); continue
    conv(poster, os.path.join(DEST, slug+".jpg"))

    photo = pick_photo(t, poster)
    has_photo = False
    if photo:
        conv(photo, os.path.join(DEST, slug+"-foto.jpg")); has_photo = True

    r,g,b = avg_color(os.path.join(DEST, slug+".jpg"))
    h_,l_,s_ = colorsys.rgb_to_hls(r/255,g/255,b/255)
    s_ = min(0.95, max(s_*1.5, 0.42)); l_ = min(0.74, max(0.56, l_))  # claro: visible sobre negro
    r,g,b = (round(c*255) for c in colorsys.hls_to_rgb(h_,l_,s_))
    accent = f"#{r:02x}{g:02x}{b:02x}"
    ink = "#0c0a0f" if (0.299*r+0.587*g+0.114*b) > 150 else "#ffffff"

    mt = re.search(r"https?://[^\"']*entradas[^\"']*idEvento=\d+", t, re.I)
    ticket = mt.group(0) if mt else ""
    eid = re.search(r"idEvento=(\d+)", ticket).group(1) if ticket else ""
    yt = find_youtube(t)
    # Fechas y título OFICIALES desde Qwantic (la fuente buena)
    q_title, q_dates = fetch_qwantic(eid) if eid else ("", [])
    dates = q_dates if q_dates else find_dates(t)
    schedule = "" if dates else find_schedule(t)
    # Título: el del cartel (h1) limpio; respaldo, el de Qwantic
    show = (show[:1].upper() + show[1:]) if show[:1].islower() else show
    show = show.rstrip(" .")
    if (not show or len(show) < 2) and q_title:
        show = q_title
    # Artista: override conocido > Mobirise > heurística sobre el título de Qwantic
    if slug in ARTIST_OVERRIDE:
        artist = ARTIST_OVERRIDE[slug]
    elif not artist and q_title and ". " in q_title:
        cand = q_title.split(". ")[-1].strip(" .")
        ws = cand.split()
        if 1 < len(ws) <= 3 and cand[:1].isupper() and not re.search(
                r"humor|comedia|canci|show|tickets|teatro|minut|contraband|mon[oó]logo|tributo", cand, re.I):
            artist = cand
    prio = PRIORITY.get(slug, 0)
    syn = find_synopsis(t)
    syn = strip_leading_title(syn, show) if syn else f"{show} en el Teatro Sofía, en pleno corazón de Gran Vía."
    links = find_links(t)
    cat = category_of(show+" "+artist+" "+syn)

    fm = ["---", f'title: "{show.replace(chr(34),chr(39))}"']
    if artist: fm.append(f'artist: "{artist.replace(chr(34),chr(39))}"')
    fm += [f'category: "{cat}"']
    if slug in GENRES_OVERRIDE:
        fm.append("genres:")
        for g in GENRES_OVERRIDE[slug]:
            fm.append(f'  - "{g}"')
    if prio: fm.append(f'priority: {prio}')
    fm += [f'poster: "./{slug}.jpg"']
    if has_photo: fm.append(f'photo: "./{slug}-foto.jpg"')
    if yt: fm.append(f'youtube: "{yt}"')
    fm += [f'accent: "{accent}"', f'accentInk: "{ink}"']
    if dates:
        fm.append("dates:")
        for iso,time in dates:
            fm.append(f'  - date: "{iso}"' + (f'\n    time: "{time}"' if time else ""))
    if schedule: fm.append(f'dateText: "{schedule}"')
    if ticket: fm += [f'ticketUrl: "{ticket}"', f'qwanticEventId: "{eid}"']
    if links:
        fm.append("links:")
        for l in links:
            fm.append(f'  - label: "{l["label"]}"')
            fm.append(f'    url: "{l["url"]}"')
    fm += ['venue: "Teatro Sofía · Gran Vía 70, Madrid"', "draft: false", "---", "", syn, ""]
    open(os.path.join(DEST, slug+".md"), "w", encoding="utf-8").write("\n".join(fm))
    report.append((slug, cat, "F" if has_photo else "-", "Y" if yt else "-", len(dates), artist[:20], show))

print("=== MIGRADOS (enlazados desde home):", len(report), "===")
print(f"{'slug':36} {'cat':9} foto vid fch artista | título")
for slug,cat,ph,yt,nd,art,show in report:
    print(f"{slug:36} {cat:9}  {ph}    {yt}   {nd:^3} {art:20} | {show}")
print("\nOMITIDOS:", skipped)
print("\nEnlazados en home:", len(linked))
