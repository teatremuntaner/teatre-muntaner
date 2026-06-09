# -*- coding: utf-8 -*-
"""
Borra la carpeta /V1 de cdmon (copia de pruebas del sitio Astro, ya desechable)
en UNA sola sesion FTP. Seguridad: solo opera dentro de /V1.
Credenciales: ~/.claude/ftp-teatro.txt
"""
import os, ftplib, time

HOST = "ftp.teatrosofia.es"
TARGET = "/V1"           # SOLO esta carpeta
DELAY = 0.08

assert TARGET.startswith("/V1"), "Seguridad: solo se permite borrar dentro de /V1"

cred = open(os.path.expanduser("~/.claude/ftp-teatro.txt"), encoding="utf-8").read().strip()
USER, PASS = cred.split(":", 1)

ftp = ftplib.FTP(HOST, timeout=90)
ftp.encoding = "utf-8"
ftp.login(USER, PASS)
ftp.set_pasv(True)

stats = {"files": 0, "dirs": 0, "errors": 0}

def entries(path):
    try:
        return [(n, f.get("type", "")) for n, f in ftp.mlsd(path)]
    except Exception:
        out, cur = [], ftp.pwd()
        for n in ftp.nlst(path):
            base = os.path.basename(n.rstrip("/"))
            if base in (".", ".."):
                continue
            try:
                ftp.cwd(path + "/" + base); typ = "dir"; ftp.cwd(cur)
            except Exception:
                typ = "file"
            out.append((base, typ))
        return out

def rmtree(path):
    assert path.startswith("/V1"), "fuera de /V1: " + path
    for name, typ in entries(path):
        if name in (".", ".."):
            continue
        rpath = path.rstrip("/") + "/" + name
        if typ == "dir":
            rmtree(rpath)
            try:
                ftp.rmd(rpath); stats["dirs"] += 1
            except Exception as e:
                stats["errors"] += 1; print("ERR rmd", rpath, e)
        else:
            try:
                ftp.delete(rpath); stats["files"] += 1
                if stats["files"] % 25 == 0:
                    print(f"  ... {stats['files']} archivos borrados")
                time.sleep(DELAY)
            except Exception as e:
                stats["errors"] += 1; print("ERR del", rpath, e)

# 1) Listado de cabecera (que veas que es lo esperado)
print("Contenido de", TARGET, "->", [n for n, _ in entries(TARGET)])
# 2) Borrado recursivo
rmtree(TARGET)
# 3) Borrar la propia carpeta /V1
try:
    ftp.rmd(TARGET); stats["dirs"] += 1; print("Borrada la carpeta", TARGET)
except Exception as e:
    stats["errors"] += 1; print("ERR rmd raiz", TARGET, e)

ftp.quit()
print(f"\n=== RESUMEN === archivos: {stats['files']}  carpetas: {stats['dirs']}  errores: {stats['errors']}")
