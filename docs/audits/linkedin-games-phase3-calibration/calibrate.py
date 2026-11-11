"""Phase 3 calibration (offline). Reads the owner's LinkedIn Games export (NOT versioned: personal data) and writes
`diagnosis-thresholds.json`: per game, the R joint replicates of the two statistics under the null `J` of the methodology
(docs/superpowers/specs/2026-11-11-games-report-phase3-methodology.md, section 3), from which the server derives p and the exact order.

    python3 calibrate.py EXPORT.csv OUTDIR            # EXPORT.csv = GET /api/me/linkedin-games/export.csv (fecha,juego,miseg,mediaseg)
    python3 calibrate.py --selftest                   # synthetic data, small R: checks the schema and the rules (no personal data)

Writes OUTDIR/diagnosis-thresholds.json (the artefact: replicate statistics, no raw rows) and OUTDIR/calibration-summary.json
(per-game evaluability, observed p, and the weekly stability of the rule over the history). Deterministic for a given export and ENTROPY.
Statistics mirror sim_absence.py (docs/audits/linkedin-games-phase3-simulation) with windows anchored on the last recorded date.
"""
import csv, json, sys, os, warnings
from datetime import date, timedelta
import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "linkedin-games-phase3-simulation"))
from sim_absence import joint_null, MIN_CELL, MIN_WINDOW  # A and B exactly as validated (same-mask week exchange)

VERSION, R, ALPHA, ENTROPY, MIN_FIT = 1, 1000, 0.05, 20261112, 60
DIMS = ["weekday", "regularity"]
DAYS = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"]
warnings.simplefilter("ignore", RuntimeWarning)


def load(path):
    """-> {game: [(date, score, avg|None)]} sorted by date; a row without a positive score is not an observation."""
    games = {}
    for r in csv.DictReader(open(path, encoding="utf-8")):
        try: s = float(r["miseg"])
        except (ValueError, TypeError): continue
        if not s > 0: continue
        a = float(r["mediaseg"]) if r.get("mediaseg") not in (None, "") else None
        games.setdefault(r["juego"], []).append((date.fromisoformat(r["fecha"]), s, a if a and a > 0 else None))
    return {g: sorted(v) for g, v in games.items()}


def matrix(rows, to):
    """Efficiency (avg / own seconds) per week (Monday first) up to `to`; NaN = not recorded, no average, or after `to`. Returns (x, to_idx)."""
    rows = [r for r in rows if r[0] <= to]
    first = rows[0][0] - timedelta(days=rows[0][0].weekday())
    n = (to - first).days // 7 + 1
    x = np.full((n, 7), np.nan)
    for d, s, a in rows:
        if a is not None:
            k = (d - first).days
            x[k // 7, k % 7] = a / s
    return x, (to - first).days


def stats(x, to_idx):
    """(R, 2): |statistic| per dimension + (R, 2) signed detail. weekday: max over days with >= MIN_CELL results of |loss rate - overall|
    (loss = efficiency <= 1: did not beat the average); regularity: change of log(P75/P25) between the last 56 days and the 56 before."""
    R_, n, _ = x.shape
    loss = np.where(np.isnan(x), np.nan, (x <= 1).astype(float))
    rate = np.where((~np.isnan(x)).sum(axis=1) >= MIN_CELL, np.nanmean(loss, axis=1), np.nan)
    diff = rate - np.nanmean(loss, axis=(1, 2))[:, None]
    wk = np.nan_to_num(np.nanmax(np.abs(diff), axis=1), nan=0.0)
    day = np.where(np.isnan(diff).all(axis=1), -1, np.nanargmax(np.abs(np.where(np.isnan(diff), -1, diff)), axis=1))
    flat = x.reshape(R_, n * 7)
    def spread(a):
        s = np.log(np.nanpercentile(a, 75, axis=1) / np.nanpercentile(a, 25, axis=1))
        return np.where((~np.isnan(a)).sum(axis=1) >= MIN_WINDOW, s, np.nan)
    reg = spread(flat[:, to_idx - 55: to_idx + 1]) - spread(flat[:, to_idx - 111: to_idx - 55])
    sdiff = np.stack([np.take_along_axis(diff, np.maximum(day, 0)[:, None], axis=1)[:, 0], reg], axis=1)
    return np.stack([wk, np.nan_to_num(np.abs(reg), nan=0.0)], axis=1), sdiff, day


def evaluable(x, to_idx):
    _, _, day = stats(x[None], to_idx)
    flat = x.reshape(-1)
    reg = (~np.isnan(flat[to_idx - 55: to_idx + 1])).sum() >= MIN_WINDOW and to_idx >= 111 and (~np.isnan(flat[to_idx - 111: to_idx - 55])).sum() >= MIN_WINDOW
    return {"weekday": bool(day[0] >= 0), "regularity": bool(reg)}


def test(x, to_idx, rng, r=R):
    """The procedure of section 3.3 on one game: pool = data + r joint replicates; exact adjusted p; returns the finding and the replicates."""
    obs, sdiff, day = stats(x[None], to_idx)
    rep = stats(joint_null(x, r, rng), to_idx)[0]
    pool = np.vstack([obs, rep])
    p = np.stack([(r + 1 - np.searchsorted(np.sort(pool[:, k]), pool[:, k], side="left")) / (r + 1) for k in range(2)], axis=1)
    U = p.min(axis=1)
    p_adj = float((U <= U[0]).sum() / (r + 1))                    # ties counted: conservative
    k = int(p[0].argmin())
    finding = None
    if p_adj <= ALPHA:
        sign = 1 if sdiff[0, k] > 0 else -1
        finding = {"dimension": DIMS[k], "sign": sign, **({"day": DAYS[int(day[0])]} if k == 0 else {})}
    return {"p_adjusted": p_adj, "p": [float(v) for v in p[0]], "observed": [float(v) for v in obs[0]], "finding": finding}, rep


def same(a, b):
    return a == b  # same aspect, same sign and, for the weekday, the same concrete day (None == None: no finding both weeks)


def calibrate(games, r=R, entropy=ENTROPY):
    artefact, summary, to = {}, {}, max(row[0] for v in games.values() for row in v)
    for gi, g in enumerate(sorted(games)):
        rows = games[g]
        x, to_idx = matrix(rows, to)
        n_obs = int(np.sum(~np.isnan(x)))
        ev = evaluable(x, to_idx)
        entry = {"observations_with_average": n_obs, "weeks": int(x.shape[0]), "first": rows[0][0].isoformat(), "last": rows[-1][0].isoformat(), "evaluable": ev}
        if n_obs < MIN_FIT or not any(ev.values()):
            entry["status"] = "datos_insuficientes"; summary[g] = entry; continue
        res, rep = test(x, to_idx, np.random.default_rng(np.random.SeedSequence([entropy, gi, 0])), r)
        artefact[g] = {"evaluable": ev, "replicates": np.round(rep, 6).tolist()}
        entry.update(status="calibrado", today=res)
        # stability of the rule over the history: every Sunday with enough data, a fresh seed per cut
        cuts, cut = [], rows[0][0]
        while cut <= to:
            if cut.weekday() == 6 and sum(1 for d, _, a in rows if d <= cut and a is not None) >= MIN_FIT:
                xc, tc = matrix(rows, cut)
                if any(evaluable(xc, tc).values()):
                    rc, _ = test(xc, tc, np.random.default_rng(np.random.SeedSequence([entropy, gi, 1 + len(cuts)])), min(r, 500))
                    cuts.append({"cut": cut.isoformat(), "finding": rc["finding"]})
            cut += timedelta(days=1)
        raw = [c["finding"] for c in cuts]
        published = [raw[i] if i > 0 and same(raw[i], raw[i - 1]) else None for i in range(len(raw))]  # same finding one week before
        entry["stability"] = {"cuts": len(cuts), "cuts_with_raw_finding": sum(f is not None for f in raw), "cuts_with_published_finding": sum(f is not None for f in published),
                              "changes_of_published_finding": sum(1 for i in range(1, len(published)) if published[i] != published[i - 1])}
        summary[g] = entry
    return {"version": VERSION, "calibratedThrough": to.isoformat(), "replicates": r, "alpha": ALPHA, "entropy": entropy, "dimensions": DIMS, "games": artefact}, \
           {"calibratedThrough": to.isoformat(), "games": summary}


def selftest():
    rng = np.random.default_rng(1)
    start = date(2026, 1, 5)  # a Monday
    rows = ["fecha,juego,miseg,mediaseg"]
    for i in range(200):
        d = start + timedelta(days=i)
        for g, drop in (("alpha", 0.0), ("beta", 0.0), ("tiny", 0.0)):
            if g == "tiny" and i > 40: continue
            if rng.random() < drop: continue
            avg = 40 + 10 * (d.weekday() >= 4)
            rows.append(f"{d},{g},{max(5, round(avg * float(np.exp(rng.normal(0, .4)) / 1.5)))},{avg}")
    path = os.path.join(os.environ.get("TMPDIR", "/tmp"), "phase3-selftest.csv")
    open(path, "w").write("\n".join(rows))
    art, summ = calibrate(load(path), r=100)
    os.remove(path)
    assert set(art["games"]) == {"alpha", "beta"} and summ["games"]["tiny"]["status"] == "datos_insuficientes", summ
    assert all(len(v["replicates"]) == 100 and all(len(p) == 2 for p in v["replicates"]) for v in art["games"].values())
    assert 0 < summ["games"]["alpha"]["today"]["p_adjusted"] <= 1 and summ["games"]["alpha"]["stability"]["cuts"] > 5
    print("selftest ok:", {g: s["status"] for g, s in summ["games"].items()})


if __name__ == "__main__":
    if sys.argv[1:] == ["--selftest"]: selftest(); sys.exit()
    games = load(sys.argv[1])
    art, summ = calibrate(games)
    os.makedirs(sys.argv[2], exist_ok=True)
    json.dump(art, open(os.path.join(sys.argv[2], "diagnosis-thresholds.json"), "w"), separators=(",", ":"))
    json.dump(summ, open(os.path.join(sys.argv[2], "calibration-summary.json"), "w"), indent=1, ensure_ascii=False)
    print(json.dumps({g: {k: v for k, v in s.items() if k in ("status", "observations_with_average", "evaluable")} for g, s in summ["games"].items()}, ensure_ascii=False))
