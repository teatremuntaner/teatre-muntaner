# -*- coding: utf-8 -*-
"""Prueba de scripts/sync_qwantic.py: el cartel del kit de adaptaciones antes que el de Qwantic (E57).

    python scripts/prueba_kit_cartel.py

Sin red: un servidor HTTP de mentira en un hilo hace de Qwantic (feed, página de sesiones,
m_poster.jpg) y de madteatro (/kit/<clave>/cartel con ETag por md5 y 404 sin cuerpo, tal como
dice el contrato del 06/09/2026). Se ejecuta el main() de verdad contra una carpeta temporal.
"""
import os
import sys

# scripts/ NO puede estar en sys.path (y Python lo pone él solo al ejecutar este archivo):
# en esa carpeta vive scripts/inspect.py, que tapa al módulo `inspect` de la biblioteca
# estándar y, de paso, se ejecuta solo (y pregunta a Qwantic) en cuanto algo importa
# logging o dataclasses. El guion se carga por su ruta, más abajo.
_AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path[:] = [p for p in sys.path if os.path.abspath(p or ".") != _AQUI]

import base64                                                 # noqa: E402
import contextlib                                             # noqa: E402
import hashlib                                                # noqa: E402
import http.server                                            # noqa: E402
import importlib.util                                         # noqa: E402
import io                                                     # noqa: E402
import shutil                                                 # noqa: E402
import tempfile                                               # noqa: E402
import threading                                              # noqa: E402

_ruta = os.path.join(_AQUI, "sync_qwantic.py")
_spec = importlib.util.spec_from_file_location("sync_qwantic", _ruta)
sq = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(sq)

CLAVE_A = "a" * 32            # con tanda: el kit sirve el cartel
CLAVE_B = "b" * 32            # clave que madteatro no conoce (o sin tanda): 404
CLAVE_C = "c" * 32            # con tanda; la ficha apunta a un cartel subido a mano
CLAVE_MALA = "ABC-no-es-una-clave"

# Un JPEG de verdad, 40x60 (2:3), hecho con ffmpeg. Codex (06/09/2026): con bytes de mentira la
# prueba enseñaba que se eligen y se guardan, pero no que Astro pueda abrirlos.
JPEG_BASE = base64.b64decode(
    "/9j/4AAQSkZJRgABAgAAAQABAAD//gAQTGF2YzYyLjI4LjEwMQD/2wBDAAgQEBMQExYWFhYWFhoYGhsbGxoaGhobGxsdHR0i"
    "IiIdHR0bGx0dICAiIiUmJSMjIiMmJigoKDAwLi44ODpFRVP/xABNAAEBAAAAAAAAAAAAAAAAAAAABgEBAQEAAAAAAAAAAAAA"
    "AAAAAAYHEAEAAAAAAAAAAAAAAAAAAAAAEQEAAAAAAAAAAAAAAAAAAAAA/8AAEQgAPAAoAwEiAAIRAAMRAP/aAAwDAQACEQMR"
    "AD8AmwGlqEAAAAAAAAAAAAAAAAAAAAAB/9k=")

def jpeg_real(marca):
    """El JPEG base con un segmento de comentario (COM) que lo hace único y lo lleva por encima
    de los 2000 bytes que exige el sync. Sigue siendo una imagen válida."""
    cuerpo = (marca * 800)[:2100]
    com = b"\xff\xfe" + (len(cuerpo) + 2).to_bytes(2, "big") + cuerpo
    return JPEG_BASE[:2] + com + JPEG_BASE[2:]

JPEG_KIT = jpeg_real(b"KIT")
JPEG_QWANTIC = jpeg_real(b"QWA")
JPEG_VIEJO = jpeg_real(b"OLD")

def abre_imagen(b):
    """(ancho, alto) si la imagen se decodifica; None si no hay Pillow para comprobarlo."""
    try:
        from PIL import Image
    except ImportError:
        return None
    im = Image.open(io.BytesIO(b))
    im.load()
    return im.size

FEED = [{"venues": [{"events": [
    {"idEvent": 101, "event": "Show existente con kit", "priceFrom": 12, "poster": "", "longDescription": "Una comedia."},
    {"idEvent": 104, "event": "Show nuevo sin clave", "priceFrom": 10, "poster": "", "longDescription": "Un drama."},
]}]}]
SESIONES = 'var Sesiones = [{"fechaCelebracionStr":"2099-01-10T20:00","fechaInicioVentaStr":"2026-01-01T09:00"}];'

class Falso(http.server.BaseHTTPRequestHandler):
    """Qwantic y madteatro en el mismo puerto; apunta cada petición que recibe."""
    peticiones = []          # (ruta, If-None-Match)
    kit = {CLAVE_A: JPEG_KIT, CLAVE_C: JPEG_KIT}

    def log_message(self, *a):
        pass

    def _envia(self, code, body=b"", ctype="application/octet-stream", extra=None):
        self.send_response(code)
        if body or code == 200:
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(body)))
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        if body:
            self.wfile.write(body)

    def do_GET(self):
        ruta = self.path
        Falso.peticiones.append((ruta, self.headers.get("If-None-Match")))
        if ruta.startswith("/api2/"):
            import json
            return self._envia(200, json.dumps(FEED).encode(), "application/json")
        if ruta.startswith("/evento"):
            return self._envia(200, SESIONES.encode(), "text/html")
        if ruta.startswith("/poster/"):
            return self._envia(200, JPEG_QWANTIC, "image/jpeg")
        if ruta.startswith("/kit/"):
            partes = ruta.split("/")
            clave, que = (partes[2], partes[3]) if len(partes) == 4 else ("", "")
            data = Falso.kit.get(clave)
            if data is None or que != "cartel":
                return self._envia(404)
            et = '"' + hashlib.md5(data).hexdigest() + '"'
            if (self.headers.get("If-None-Match") or "").strip() == et:
                return self._envia(304, extra={"ETag": et})
            return self._envia(200, data, "image/jpeg", {"ETag": et, "Cache-Control": "no-cache, private"})
        return self._envia(404)

def ficha(slug, eid, clave=None, poster=None, linea_clave=None, linea_poster=None):
    """Una ficha como las del CMS. `linea_clave` / `linea_poster` permiten escribir la línea
    entera a mano (comillas simples, comentario detrás, valor vacío...)."""
    fm = ["---", f'title: "{slug}"', 'category: "Espectáculo"', "genres: []",
          linea_poster or f'poster: "{poster or "./" + slug + ".jpg"}"',
          'accent: "#000000"', 'accentInk: "#ffffff"',
          'dates:', '  - date: "2099-01-10"', '    time: "20:00"',
          f'qwanticEventId: "{eid}"']
    if linea_clave is not None:
        fm.append(linea_clave)
    elif clave is not None:
        fm.append(f'kitClave: "{clave}"')
    fm += ["draft: false", "---", "", "Sinopsis.", "", "kitClave: esto es texto del cuerpo, no frontmatter", ""]
    return "\n".join(fm)

FALLOS = []
def ok(cond, nombre):
    print(("  OK   " if cond else "  FALLO") + " " + nombre)
    if not cond:
        FALLOS.append(nombre)

def lee(p, binario=False):
    return open(p, "rb").read() if binario else open(p, encoding="utf-8").read()

def corre(argv=()):
    Falso.peticiones.clear()
    salida = io.StringIO()
    with contextlib.redirect_stdout(salida):
        rep = sq.main(list(argv))
    return rep, salida.getvalue()

def main():
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Falso)
    puerto = srv.server_address[1]
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{puerto}"
    tmp = tempfile.mkdtemp(prefix="prueba_kit_")
    try:
        sq.DEST = tmp
        sq.API_URL = base + "/api2/events"
        sq.EVENT_URL = base + "/evento?id={}"
        sq.POSTER_URL = base + "/poster/{}/m_poster.jpg"
        sq.KIT_URL = base + "/kit"

        def escribe(slug, eid, clave=None, poster=None, jpg=JPEG_VIEJO, **kw):
            open(os.path.join(tmp, slug + ".md"), "w", encoding="utf-8").write(ficha(slug, eid, clave, poster, **kw))
            if jpg is not None:
                open(os.path.join(tmp, slug + ".jpg"), "wb").write(jpg)

        escribe("con-kit", 101, CLAVE_A)                                    # a) existente con kit
        escribe("sin-tanda", 102, CLAVE_B)                                  # b) clave sin pieza -> 404
        escribe("sin-clave", 103)                                           # c) sin clave: ni se pide
        escribe("a-mano", 105, CLAVE_C, poster="cartel_subido_a_mano.jpeg", jpg=None)  # h) cartel elegido a mano
        open(os.path.join(tmp, "cartel_subido_a_mano.jpeg"), "wb").write(JPEG_VIEJO)
        escribe("clave-mala", 106, CLAVE_MALA)                              # f) clave con formato malo
        escribe("fuera-del-feed", 107, CLAVE_A)                             # el kit se revisa aunque Qwantic ya no liste el show
        # --- lo que Codex encontró en la pasada 1: YAML válido que el lector no entendía ---
        escribe("comillas-simples", 108, linea_clave=f"kitClave: '{CLAVE_A}'",
                linea_poster="poster: './comillas-simples.jpg'")           # j) comillas simples, en clave y en poster
        escribe("con-comentario", 109, linea_clave=f'kitClave: "{CLAVE_A}" # la puso Carlos el 06/09')  # k) comentario detrás
        escribe("clave-vacia", 110, linea_clave="kitClave: ''")             # l) desactivado con cadena vacía
        escribe("clave-vacia-doble", 111, linea_clave='kitClave: ""')       # l) ídem con comillas dobles
        escribe("solo-comentario", 112, linea_clave="kitClave: # desactivado el 06/09")  # l) solo un comentario (Codex, pasada 3)

        print("Pasada 1 (--dry): no escribe nada")
        rep, out = corre(["--dry"])
        ok(lee(os.path.join(tmp, "con-kit.jpg"), True) == JPEG_VIEJO, "en seco, el cartel con kit sigue siendo el viejo")
        ok(not os.path.exists(os.path.join(tmp, "show-nuevo-sin-clave.md")), "en seco, no se crea la ficha nueva")
        ok("[DRY-RUN]" in out and "CARTELES DEL KIT" in out, "el informe en seco lleva el bloque de carteles del kit")

        print("Pasada 2: aplica")
        rep, out = corre()
        kit = {fn: (est, det) for fn, est, det in rep["kit"]}
        ok(lee(os.path.join(tmp, "con-kit.jpg"), True) == JPEG_KIT, "a) con clave y tanda, el jpg pasa a ser la pieza del kit")
        ok(kit.get("con-kit.md", ("",))[0] == "ok", "a) el informe lo cuenta como actualizado")
        ok(lee(os.path.join(tmp, "sin-tanda.jpg"), True) == JPEG_VIEJO, "b) con 404 el cartel de hoy se queda intacto")
        ok(kit.get("sin-tanda.md", ("",))[0] == "sin-kit", "b) y el informe dice «sin kit»")
        ok("sin-tanda.md" in out and "sin-kit" in out, "b) el texto del informe lo enseña")
        ok(lee(os.path.join(tmp, "sin-clave.jpg"), True) == JPEG_VIEJO, "c) sin clave no se toca el cartel")
        ok("sin-clave.md" not in kit, "c) sin clave no entra en el bloque del kit")
        ok(lee(os.path.join(tmp, "a-mano.jpg"), True) == JPEG_KIT, "h) con clave, el cartel subido a mano se sustituye por la pieza del kit en <slug>.jpg")
        t_mano = lee(os.path.join(tmp, "a-mano.md"))
        ok('poster: "./a-mano.jpg"' in t_mano and "cartel_subido_a_mano" not in t_mano, "h) y `poster` apunta al jpg del kit")
        ok('kitClave: "' + CLAVE_C + '"' in t_mano, "h) la clave sigue en la ficha")
        ok(kit.get("clave-mala.md", ("",))[0] == "clave-mala", "f) la clave mal formada se avisa")
        ok(not any(CLAVE_MALA in r for r, _ in Falso.peticiones), "f) y no se pide nada a madteatro con ella")
        ok(lee(os.path.join(tmp, "fuera-del-feed.jpg"), True) == JPEG_KIT, "una ficha que Qwantic ya no lista también recibe su kit")
        # g) la ficha nueva del feed sigue saliendo de Qwantic
        nueva = os.path.join(tmp, "show-nuevo-sin-clave.jpg")
        ok(os.path.exists(nueva) and lee(nueva, True) == JPEG_QWANTIC, "g) la ficha nueva sin clave lleva el m_poster.jpg de Qwantic, como hoy")
        pedidas_kit = [r for r, _ in Falso.peticiones if r.startswith("/kit/")]
        ok(all(("/kit/" + CLAVE_A) in r or ("/kit/" + CLAVE_B) in r or ("/kit/" + CLAVE_C) in r for r in pedidas_kit),
           "solo se piden las claves bien formadas")
        ok(all(r.endswith("/cartel") for r in pedidas_kit), "la web pide siempre la pieza «cartel», nunca la vertical")
        ok(all(inm is None for r, inm in Falso.peticiones if r.startswith("/kit/" + CLAVE_C)),
           "h) con el cartel apuntando a otro archivo no se manda If-None-Match (hace falta el 200 para reapuntar)")
        # el frontmatter de la ficha con kit no pierde nada
        t_kit = lee(os.path.join(tmp, "con-kit.md"))
        ok('qwanticEventId: "101"' in t_kit and 'poster: "./con-kit.jpg"' in t_kit and 'kitClave: "' + CLAVE_A + '"' in t_kit,
           "a) la ficha conserva su frontmatter")
        ok("kitClave: esto es texto del cuerpo" in t_kit, "a) y el cuerpo, intacto")
        tam = abre_imagen(lee(os.path.join(tmp, "con-kit.jpg"), True))
        ok(tam is None or tam == (40, 60), "a) el jpg guardado es una imagen que se abre (40x60)" + ("" if tam else " [sin Pillow: no comprobado]"))
        # j) k) l): YAML válido escrito de otras maneras
        ok(lee(os.path.join(tmp, "comillas-simples.jpg"), True) == JPEG_KIT, "j) la clave entre comillas simples vale")
        ok(kit.get("comillas-simples.md", ("",))[0] == "ok", "j) y se cuenta como actualizada")
        ok(lee(os.path.join(tmp, "con-comentario.jpg"), True) == JPEG_KIT, "k) la clave con un comentario YAML detrás vale")
        ok(lee(os.path.join(tmp, "clave-vacia.jpg"), True) == JPEG_VIEJO and "clave-vacia.md" not in kit,
           "l) kitClave: '' desactiva: ni se pide ni se toca ni se avisa")
        ok(lee(os.path.join(tmp, "clave-vacia-doble.jpg"), True) == JPEG_VIEJO and "clave-vacia-doble.md" not in kit,
           'l) kitClave: "" ídem')
        ok(len([r for r, _ in Falso.peticiones if "/kit/" + CLAVE_MALA in r or "/kit/'" in r or '/kit/"' in r]) == 0,
           "ninguna petición sale con comillas o con la clave mala en la URL")

        # sin clave: sin-clave, clave-vacia, clave-vacia-doble y la ficha nueva del feed (4); la de
        # clave mala NO cuenta como «sin clave»: tiene algo escrito y se avisa aparte
        ok(sorted(rep["kit_sin_clave"]) == ["clave-vacia-doble.md", "clave-vacia.md", "show-nuevo-sin-clave.md", "sin-clave.md", "solo-comentario.md"],
           "el informe cuenta las fichas sin clave (5) y la de clave mala no va entre ellas")
        ok("solo-comentario.md" not in kit and lee(os.path.join(tmp, "solo-comentario.jpg"), True) == JPEG_VIEJO,
           "l) `kitClave: # comentario` es «sin clave», no clave mala")
        ok("7 fichas con kitClave, 5 sin clave" in out, "y lo enseña con las dos cifras")

        print("Pasada 3: segunda vez, nada ha cambiado")
        # Codex (pasada 2): la primera sincronización reescribió el poster con comillas dobles, así
        # que el 304 no probaba el caso de las simples. Se restauran a mano antes de esta pasada.
        p_cs = os.path.join(tmp, "comillas-simples.md")
        t_cs = lee(p_cs).replace('poster: "./comillas-simples.jpg"', "poster: './comillas-simples.jpg'")
        open(p_cs, "w", encoding="utf-8").write(t_cs)
        ok("poster: './comillas-simples.jpg'" in lee(p_cs), "j) (preparación) el poster vuelve a ir entre comillas simples")
        antes = os.path.getmtime(os.path.join(tmp, "con-kit.jpg"))
        os.utime(os.path.join(tmp, "con-kit.jpg"), (antes - 100, antes - 100))
        antes = os.path.getmtime(os.path.join(tmp, "con-kit.jpg"))
        rep, out = corre()
        kit = {fn: (est, det) for fn, est, det in rep["kit"]}
        inm = [h for r, h in Falso.peticiones if r == "/kit/" + CLAVE_A + "/cartel"]
        ok(inm and all(h == '"' + hashlib.md5(JPEG_KIT).hexdigest() + '"' for h in inm),
           "e) se manda If-None-Match con el md5 de nuestra copia")
        ok(kit.get("con-kit.md", ("",))[0] == "igual", "e) madteatro contesta 304 y el informe dice «sin cambios»")
        ok(os.path.getmtime(os.path.join(tmp, "con-kit.jpg")) == antes, "e) y el jpg no se reescribe")
        inm_cs = [h for r, h in Falso.peticiones if r == "/kit/" + CLAVE_A + "/cartel"]
        ok(kit.get("comillas-simples.md", ("",))[0] == "igual",
           "j) con poster entre comillas simples también se revalida (304), no se vuelve a bajar")
        ok(all(h == '"' + hashlib.md5(JPEG_KIT).hexdigest() + '"' for h in inm_cs) and len(inm_cs) >= 3,
           "j) y las tres fichas con la clave A (con-kit, fuera-del-feed, comillas-simples) mandaron If-None-Match")
        ok("poster: './comillas-simples.jpg'" in lee(p_cs), "j) con 304 no se reescribe la ficha: las comillas simples siguen ahí")

        print("Pasada 4: la tanda se regenera distinta")
        JPEG_KIT2 = jpeg_real(b"NEW")
        Falso.kit[CLAVE_A] = JPEG_KIT2
        rep, out = corre()
        ok(lee(os.path.join(tmp, "con-kit.jpg"), True) == JPEG_KIT2, "una pieza nueva (otro md5) sustituye a la copia")

        print("Pasada 5: madteatro devuelve algo que no es un JPEG")
        Falso.kit[CLAVE_A] = b"<html>error</html>" + b" " * 3000
        rep, out = corre()
        kit = {fn: (est, det) for fn, est, det in rep["kit"]}
        ok(lee(os.path.join(tmp, "con-kit.jpg"), True) == JPEG_KIT2, "i) una respuesta que no es JPEG no pisa el cartel")
        ok(kit.get("con-kit.md", ("",))[0] == "error", "i) y el informe la cuenta como error")

        print("Pasada 6: madteatro caído (puerto cerrado)")
        Falso.kit[CLAVE_A] = JPEG_KIT2
        sq.KIT_URL = "http://127.0.0.1:9/kit"
        rep, out = corre()
        kit = {fn: (est, det) for fn, est, det in rep["kit"]}
        ok(lee(os.path.join(tmp, "con-kit.jpg"), True) == JPEG_KIT2, "sin madteatro, el cartel se queda como está")
        ok(kit.get("con-kit.md", ("",))[0] == "error", "y el informe lo cuenta como error, no como «sin kit»")
        sq.KIT_URL = base + "/kit"

        print("Pasada 7: Qwantic caído, madteatro no (Codex, pasada 1)")
        Falso.kit[CLAVE_A] = jpeg_real(b"QDN")
        sq.API_URL = "http://127.0.0.1:9/api2/events"
        rep, out = corre()
        sq.API_URL = base + "/api2/events"
        kit = {fn: (est, det) for fn, est, det in rep["kit"]}
        ok(bool(rep.get("feed_error")), "sin Qwantic el informe lleva el error del feed")
        ok("QWANTIC NO RESPONDE" in out, "y lo dice arriba del todo")
        ok(lee(os.path.join(tmp, "con-kit.jpg"), True) == jpeg_real(b"QDN"), "pero los carteles del kit se revisan igual")
        ok(not rep["baja"], "y no se cuentan bajas falsas")
        ok(os.path.exists(os.path.join(tmp, "show-nuevo-sin-clave.md")), "las fichas de antes siguen ahí")
    finally:
        srv.shutdown()
        shutil.rmtree(tmp, ignore_errors=True)

    print()
    if FALLOS:
        print(f"ROJO: {len(FALLOS)} comprobaciones fallan")
        for f in FALLOS:
            print("  - " + f)
        sys.exit(1)
    print("VERDE: todas las comprobaciones pasan")

if __name__ == "__main__":
    main()
