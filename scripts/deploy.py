# -*- coding: utf-8 -*-
# Despliega dist/ a teatrosofia.es/V1/ en UNA sola sesión FTP (curl -K).
# Credenciales fuera del repo: ~/.claude/ftp-teatro.txt  (usuario:contraseña)
import os, subprocess, glob, sys
sys.stdout.reconfigure(encoding="utf-8")

DIST = r"C:\Users\carlo\dev\teatro-sofia\dist"
BASE = "ftp://ftp.teatrosofia.es/V1/"
creds = open(os.path.expanduser("~/.claude/ftp-teatro.txt"), encoding="utf-8").read().strip()

files = [p for p in glob.glob(DIST + "/**/*", recursive=True) if os.path.isfile(p)]
lines = []
for i, p in enumerate(files):
    rel = os.path.relpath(p, DIST).replace("\\", "/")
    if i:
        lines.append("next")
    lines += [f'user = "{creds}"', "ftp-create-dirs",
              f'url = "{BASE}{rel}"', f'upload-file = "{p.replace(chr(92), "/")}"']

cfg = os.path.join(os.environ.get("TEMP", "."), "deploy_v1.curl")
open(cfg, "w", encoding="utf-8").write("\n".join(lines))
r = subprocess.run(["curl", "-sS", "-K", cfg], capture_output=True, text=True)
os.remove(cfg)
print("archivos subidos:", len(files))
print("curl rc:", r.returncode)
if r.stderr.strip():
    print("stderr:", r.stderr[:600])
