"""Writes (or checks) noise-bands.json: the ONLY source of limits for the simulation, the tests and production.
  python3 p1_artifact.py prod_days.json            # writes noise-bands.json next to this script
  python3 p1_artifact.py prod_days.json --check    # regenerates and fails if it differs from the committed file
"""
import json, sys
import p1_calibrate as C
df = C.load(sys.argv[1]); new = C.artefact(df); path = C.HERE / "noise-bands.json"
if "--check" in sys.argv:
    old = json.load(open(path)); assert old == new, "noise-bands.json differs from a fresh calibration"; print("noise-bands.json reproduces exactly")
else:
    json.dump(new, open(path, "w"), indent=1, ensure_ascii=False); open(path, "a").write("\n"); print("written", path)
for g, x in new["games"].items(): print(f"  {g:12} {x['calendarDays']} d / {x['observations']} obs: " + "  ".join(f"{k}={v}" for k, v in x["limits"].items()))
print("uncalibrated (history < 112 calendar days):", new["uncalibrated"])
