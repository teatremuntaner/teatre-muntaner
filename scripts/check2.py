# -*- coding: utf-8 -*-
import subprocess, sys
sys.stdout.reconfigure(encoding="utf-8")
h = subprocess.run(["curl", "-s", "https://teatrosofia.es/V1/"], capture_output=True).stdout.decode("utf-8", "ignore")
checks = {
    "Destacados (No te los pierdas)": "No te los pierdas",
    "Tagline Clap": "suena a clap",
    "Tagline Piano Bar": "Emoción a cada nota",
    "Cartelera real": "Mira nuestra cartelera",
    "Calendario embed": "styledcalendar.com",
    "Bar texto real": "experiencia 360",
    "Formulario": "formsubmit.co",
    "Mapa": "maps.google",
    "Footer · Teatre Muntaner": "teatremuntaner.com",
    "Footer · CIF": "B23863632",
    "Logo": "logo-sofia.png",
}
for label, needle in checks.items():
    print(f"  {'OK ' if needle in h else 'NO '} {label}")
