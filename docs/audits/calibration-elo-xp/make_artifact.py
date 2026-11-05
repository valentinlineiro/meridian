"""Artefacto de calibración de ELO y XP (enmienda A7, docs/contracts/2026-10-06-discarded-signals-contract.md §15).

Deriva src/domain/calibration-elo-xp.json de la salida versionada de exploration.py (`exploration.out`, semilla fija; las entradas son
datos personales y no se versionan). Nunca se edita a mano y el Worker no lo recalcula.
  python3 make_artifact.py            # escribe el artefacto
  python3 make_artifact.py --check    # regenera y falla si difiere del versionado
Un borde solo figura en `admitted` si exploration.py lo admitió (incertidumbre y sensibilidad ≤ 20 % en k − 5, k y k + 5).
"""
import json, pathlib, re, sys

HERE = pathlib.Path(__file__).parent
OUT = HERE.parent.parent.parent / "src" / "domain" / "calibration-elo-xp.json"
NAMES = {"95 % sup": "upper95", "99 % sup": "upper99", "95 % inf": "lower95", "99 % inf": "lower99"}
text = (HERE / "exploration.out").read_text()

edges = {n: {} for n in NAMES.values()}
for m in re.finditer(r"^\s*k=\s*(\d+): 95 % sup ([+-]\d+) ±([\d.]+)%  inf ([+-]\d+) ±([\d.]+)% \| 99 % sup ([+-]\d+) ±([\d.]+)%  inf ([+-]\d+) ±([\d.]+)%$", text, re.M):
    k, *v = m.groups()
    for name, (b, u) in zip(("upper95", "lower95", "upper99", "lower99"), ((v[0], v[1]), (v[2], v[3]), (v[4], v[5]), (v[6], v[7]))):
        edges[name][k] = {"bound": int(b), "uncertainty": round(float(u) / 100, 3)}
admitted = {}
for m in re.finditer(r"^\s*(\d\d % (?:sup|inf)): .*→ admitido: (.*)$", text, re.M):
    ks = m.group(2).strip()
    admitted[NAMES[m.group(1)]] = [] if ks == "ninguno" else json.loads(ks)
assert set(admitted) == set(NAMES.values()) and all(len(e) == 4 for e in edges.values()), "exploration.out no tiene el formato esperado"

artefact = {
    "calibratedThrough": "2026-11-05",
    "design": "docs/audits/2026-11-05-calibration-elo-xp-design.md (rev. 5)",
    "elo": {"kVal": [5, 10, 15, 20], "kMax": 20, "edges": edges, "admitted": admitted},
    "xp": {"windows": [7, 14, 28], "admitted": {}, "note": "sin calibración: el remuestreo por bloques no conserva la dependencia (diseño §5)"},
}
body = json.dumps(artefact, indent=2, ensure_ascii=False) + "\n"
if "--check" in sys.argv:
    if not OUT.exists() or OUT.read_text() != body:
        sys.exit(f"{OUT} difiere del que genera exploration.out")
    print("calibration-elo-xp.json OK")
else:
    OUT.write_text(body)
    print(f"escrito {OUT}")
