# -*- coding: utf-8 -*-
"""
Descarga el sitio Mobirise desde cdmon en UNA sola sesion FTP (un login),
recorriendo carpetas y bajando archivos en secuencia. Evita reconectar por
archivo (cdmon corta si se abusa). Salta la carpeta /V1/ (web nueva Astro).

Credenciales: ~/.claude/ftp-teatro.txt  (usuario:contrasena)
Destino: el SRC que espera migrar.py.
"""
import os, ftplib, time

HOST = "ftp.teatrosofia.es"
DEST = r"C:\Users\carlo\OneDrive\Teatro Sofía\Web\Pruebas"
SKIP = {"V1", "v1"}          # carpeta de la web nueva en pruebas; no es Mobirise
DELAY = 0.12                 # pausa entre archivos para no saturar cdmon

cred = open(os.path.expanduser("~/.claude/ftp-teatro.txt"), encoding="utf-8").read().strip()
USER, PASS = cred.split(":", 1)

ftp = ftplib.FTP(HOST, timeout=90)
ftp.encoding = "utf-8"
ftp.login(USER, PASS)
ftp.set_pasv(True)

stats = {"dirs": 0, "files": 0, "bytes": 0, "skipped": 0, "errors": 0}
errlist = []

def entries(path):
    """[(nombre, tipo)] usando MLSD; si no, nlst + deteccion por CWD."""
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

def walk(remote, local):
    os.makedirs(local, exist_ok=True)
    for name, typ in entries(remote):
        if name in (".", ".."):
            continue
        rpath = remote.rstrip("/") + "/" + name
        lpath = os.path.join(local, name)
        if typ == "dir":
            if name in SKIP:
                print("SKIP  ", rpath); stats["skipped"] += 1; continue
            stats["dirs"] += 1
            print("DIR   ", rpath)
            walk(rpath, lpath)
        elif typ == "file":
            try:
                with open(lpath, "wb") as fh:
                    ftp.retrbinary("RETR " + rpath, fh.write)
                stats["files"] += 1
                stats["bytes"] += os.path.getsize(lpath)
                if stats["files"] % 25 == 0:
                    print(f"  ... {stats['files']} archivos, {stats['bytes']//1024} KB")
                time.sleep(DELAY)
            except Exception as e:
                stats["errors"] += 1
                errlist.append((rpath, str(e)))
                print("ERR   ", rpath, e)

root = ftp.pwd()
print("Conectado. Raiz FTP:", root)
print("Contenido raiz:", [n for n, _ in entries(root)])
walk(root, DEST)
ftp.quit()

print("\n=== RESUMEN ===")
print(f"carpetas: {stats['dirs']}  archivos: {stats['files']}  "
      f"{stats['bytes']//1024} KB  saltadas: {stats['skipped']}  errores: {stats['errors']}")
if errlist:
    print("ERRORES:")
    for r, e in errlist:
        print("  ", r, e)
