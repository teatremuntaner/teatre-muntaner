# -*- coding: utf-8 -*-
"""Prueba de «Agotada» / «Últimas entradas» automáticos de scripts/sync_qwantic.py.

    python scripts/prueba_venta.py

Sin red: solo estado_venta(), venta_block() y con_venta() sobre textos de ficha.
"""
import os
import sys

_AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path[:] = [p for p in sys.path if os.path.abspath(p or ".") != _AQUI]   # ver prueba_kit_cartel.py

import importlib.util   # noqa: E402

_spec = importlib.util.spec_from_file_location("sync_qwantic", os.path.join(_AQUI, "sync_qwantic.py"))
sq = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(sq)

fallos = 0
def ok(cond, txt):
    global fallos
    print(("  ok   " if cond else "  FALLA ") + txt)
    if not cond:
        fallos += 1

E = sq.estado_venta
print("estado_venta:")
ok(E({"aforo": 248, "entradasVendidas": 248}) == "agotada", "vendido entero: agotada")
ok(E({"aforo": 251, "entradasVendidas": 230, "entradasBloqueadas": 21}) == "agotada", "las bloqueadas tampoco se pueden comprar (caso del Sofía, 06/11/2026)")
ok(E({"aforo": 248, "entradasVendidas": 247}) == "ultimas", "una libre: últimas")
ok(E({"aforo": 200, "entradasVendidas": 195}) == "ultimas", "5 libres de 200: últimas (Sobria y Serena, 06/11/2026)")
ok(E({"aforo": 265, "entradasVendidas": 8, "entradasBloqueadas": 203}) is None, "sala reducida con 54 libres: sin aviso (Caserza, 28/11/2026)")
ok(E({"aforo": 248, "entradasVendidas": 223}) == "ultimas", "25 libres de 248 (10 %): últimas")
ok(E({"aforo": 248, "entradasVendidas": 222}) is None, "26 libres de 248: sin aviso")
ok(E({"aforo": 50, "entradasVendidas": 40}) == "ultimas", "sala pequeña: el umbral nunca baja de 10")
ok(E({"aforo": 248, "entradasVendidas": 250}) == "agotada", "sobreventa: agotada, no un número negativo")
ok(E({}) is None and E({"aforo": 0}) is None, "sin aforo no se promete nada")
ok(E({"aforo": "x"}) is None, "aforo raro: sin aviso, sin romper")

print("venta_block y con_venta:")
ses = [("2027-01-16", "17:00"), ("2027-01-29", "22:30")]
b = sq.venta_block({("2027-01-16", "17:00"): "ultimas"}, ses)
ok(b == 'ventaQwantic:\n  - date: "2027-01-16"\n    time: "17:00"\n    estado: "ultimas"\n', "bloque con una función")
ok(sq.venta_block({}, ses) == "ventaQwantic: []\n", "sin avisos: lista vacía, para que se borre lo de antes")
ok(sq.venta_block({("2026-01-01", "20:00"): "agotada"}, ses) == "ventaQwantic: []\n", "una función que ya no está en las fechas no se escribe")

ficha = ('---\ntitle: X\ndates:\n  - date: "2027-01-16"\n    time: "17:00"\n'
         'ventaManual:\n  - date: "2027-01-16"\n    time: "17:00"\n    estado: "agotada"\ndraft: false\n---\n\nTexto.\n')
t1 = sq.con_venta(ficha, b)
ok(t1.count("ventaQwantic:") == 1 and t1.endswith("ventaQwantic:\n" + b[len("ventaQwantic:\n"):] + "---\n\nTexto.\n"), "se añade antes del cierre")
ok('ventaManual:\n  - date: "2027-01-16"\n    time: "17:00"\n    estado: "agotada"\n' in t1, "no toca lo puesto a mano")
t2 = sq.con_venta(t1, sq.venta_block({}, ses))
ok(t2.count("ventaQwantic") == 1 and "ventaQwantic: []\n" in t2 and "ultimas" not in t2, "se sustituye entero, sin dejar restos")
ok(sq.con_venta(t2, sq.venta_block({}, ses)) == t2, "dos pasadas iguales no cambian nada (no hay despliegue de más)")
gestor = t1.replace('ventaQwantic:\n  - date: "2027-01-16"\n    time: "17:00"\n    estado: "ultimas"\n',
                    "ventaQwantic:\n  - date: 2027-01-16\n    time: 17:00\n    estado: ultimas\ndraft2: x\n")
t3 = sq.con_venta(gestor, sq.venta_block({}, ses))
ok("ventaQwantic: []\n" in t3 and "draft2: x" in t3 and "estado: ultimas" not in t3, "lo que reescriba el gestor sin comillas también se sustituye")
nuevo, n = sq.DATES_RE.subn(sq.dates_block(ses + [("2027-02-05", "20:00")]), t1, count=1)
ok(n == 1 and "ventaManual:" in nuevo and "ventaQwantic:" in nuevo, "la reescritura de fechas no se lleva las marcas")

print("\nTODO BIEN" if not fallos else f"\n{fallos} FALLOS")
sys.exit(1 if fallos else 0)
