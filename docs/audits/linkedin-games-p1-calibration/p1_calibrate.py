"""P1 calibration (design: ../linkedin-games-p1-interpretation-design-2026-11-04.md). Python 3 + numpy, pandas, scipy.

Null = resampling of whole 7-day blocks of the game's own history (no trend survives; the weekday cycle and short dependence do).
Limits = empirical points of the SIGNED statistic, each tail on its own, evaluated at the end of the last COMPLETE block of every
resampled history (a window straddling two resampled weeks mixes independent draws and would understate the variance of a real one).

ONE RULE FOR THE ARTEFACT: limits are the pooled 2.5 % / 97.5 % points of 5 seeds x 20000 resamples (SEEDS, B_ART). Everything else
(false-alarm simulation, real-data labels, tests, production) reads `noise-bands.json`, written by p1_artifact.py.

  python3 p1_calibrate.py prod_days.json <part>     part: limits | stability | trajectories | real | rule | horizons
"""
import json, sys, warnings
from pathlib import Path
import numpy as np, pandas as pd
from scipy import stats
warnings.filterwarnings("ignore")
H, RECENT, BASE = 112, 28, 56           # trend horizon; recent window; baseline window (days)
COV = 0.6                               # min fraction of days with an observation in each window (convention)
MIN_HISTORY = 112                       # min calendar-day span of a game's history to calibrate (convention)
SEEDS = [11, 22, 33, 44, 55]; B_ART = 20000
TAILS = (0.025, 0.975)
USED = ["d28v28", "d28v56", "rho112"]   # statistics that enter the artefact
HERE = Path(__file__).parent

def load(path):
    days = json.load(open(path))
    rows = [(p["date"], g, e["scoreSeconds"], e["avgSeconds"]) for p in days for g, e in p["games"].items() if e.get("avgSeconds")]
    df = pd.DataFrame(rows, columns="date game s a".split()); df["d"] = pd.to_datetime(df.date); df["eff"] = df.a / df.s
    return df

def series(df, g):
    x = df[df.game == g]; start = x.d.min(); N = (x.d.max() - start).days + 1
    arr = np.full(N, np.nan)
    for r in x.itertuples(): arr[(r.d - start).days] = r.eff
    return arr, int(x.shape[0]), N, str(x.d.max().date())   # values per calendar day (NaN = none), observations, calendar days, last date

def boot(arr, B, L, rng):
    N = len(arr); nb = -(-N // 7); nl = -(-L // 7)
    src = rng.integers(0, nb, size=(B, nl))
    idx = (src[:, :, None] * 7 + np.arange(7)).reshape(B, -1)[:, :L]
    return np.where(idx < N, arr[np.minimum(idx, N - 1)], np.nan)

def dmed(X, t, wc, wb):
    """Signed relative change of medians: window (t-wc, t] against the wb days before it."""
    cur = X[:, t - wc + 1:t + 1]; base = X[:, t - wc - wb + 1:t - wc + 1]
    ok = ((~np.isnan(cur)).sum(1) >= COV * wc) & ((~np.isnan(base)).sum(1) >= COV * wb)
    mc, mb = np.nanmedian(cur, axis=1), np.nanmedian(base, axis=1)
    return np.where(ok, (mc - mb) / mb, np.nan)

def rho(X, t, h=H):
    out = np.full(X.shape[0], np.nan)
    for k in range(X.shape[0]):
        y = X[k, t - h + 1:t + 1]; m = ~np.isnan(y)
        if m.sum() >= COV * h: out[k] = stats.spearmanr(np.arange(h)[m], y[m]).statistic
    return out

STATS = {"d7v7": lambda X, t: dmed(X, t, 7, 7), "d14v14": lambda X, t: dmed(X, t, 14, 14), "d28v28": lambda X, t: dmed(X, t, 28, 28),
         "d56v56": lambda X, t: dmed(X, t, 56, 56), "d28v56": lambda X, t: dmed(X, t, RECENT, BASE),
         "rho56": lambda X, t: rho(X, t, 56), "rho84": lambda X, t: rho(X, t, 84), "rho112": lambda X, t: rho(X, t, 112)}

def pooled_limits(arr, names, tails=TAILS, B=B_ART, seeds=SEEDS):
    N = len(arr); t = (N // 7) * 7 - 1; pool = {n: [] for n in names}
    for s in seeds:
        X = boot(arr, B, N, np.random.default_rng(s))
        for n in names: pool[n].append(STATS[n](X, t))
    out = {}
    for n, v in pool.items():
        v = np.concatenate(v); v = v[~np.isnan(v)]; out[n] = (float(np.quantile(v, tails[0])), float(np.quantile(v, tails[1])))
    return out

def single_seed_limits(arr, B, seed, names):
    N = len(arr); t = (N // 7) * 7 - 1; X = boot(arr, B, N, np.random.default_rng(seed))
    res = {}
    for n in names:
        v = STATS[n](X, t); v = v[~np.isnan(v)]; res[n] = (float(np.quantile(v, TAILS[0])), float(np.quantile(v, TAILS[1])))
    return res

def artefact(df):
    """The exact content of noise-bands.json (rounded to 4 decimals)."""
    games, uncal = {}, []
    for g in sorted(df.game.unique()):
        arr, n, N, last = series(df, g)
        if N < MIN_HISTORY: uncal.append(g); continue
        lim = pooled_limits(arr, USED)
        games[g] = {"calendarDays": N, "observations": n, "limits": {k: [round(v[0], 4), round(v[1], 4)] for k, v in lim.items()}}
    through = max(series(df, g)[3] for g in df.game.unique())
    return {"version": 1, "calibratedThrough": through,
            "method": {"null": "block bootstrap of whole 7-day blocks of the game's own history", "tails": list(TAILS), "resamples": B_ART, "seeds": SEEDS,
                       "pooled": True, "evaluatedAt": "end of the last complete 7-day block of each resampled history",
                       "coverage": COV, "minHistoryDays": MIN_HISTORY, "trendHorizonDays": H, "recentDays": RECENT, "baselineDays": BASE,
                       "statistics": {"d28v28": "relative change of the 28-day median efficiency vs the previous 28 days",
                                      "d28v56": "relative change of the 28-day median efficiency vs the previous 56 days",
                                      "rho112": "Spearman rho of efficiency vs day over the last 112 days"}},
            "games": games, "uncalibrated": uncal}

def art_limits(path=HERE / "noise-bands.json"):
    a = json.load(open(path)); return {g: {k: tuple(v) for k, v in x["limits"].items()} for g, x in a["games"].items()}

def label_arrays(X, t, lim):
    """Vectorised over rows of X at day t: (mejora, deterioro, arrow28 up, arrow28 down). Limits per tail."""
    r = rho(X, t); d = dmed(X, t, RECENT, BASE); a28 = dmed(X, t, 28, 28)
    det = (d < lim["d28v56"][0]) | (r < lim["rho112"][0]); mej = (r > lim["rho112"][1]) & ~det
    return mej, det, a28 > lim["d28v28"][1], a28 < lim["d28v28"][0]

def episodes(Z):
    return float(np.mean([(np.diff(np.r_[0, z.astype(int)]) == 1).sum() for z in Z]))

# ---------------------------------------------------------------------------------------------------------------- parts
def part_limits(df):
    print("limits per tail (pooled 5 seeds x 20000). Used: d28v28, d28v56, rho112. Exploratory (NOT in the artefact): d7v7, d14v14, d56v56")
    for g in sorted(df.game.unique()):
        arr, n, N, _ = series(df, g)
        if N < MIN_HISTORY: print(f"  {g:12} {N} calendar days < {MIN_HISTORY}: not calibrated"); continue
        lim = pooled_limits(arr, USED + ["d7v7", "d14v14", "d56v56"])
        print(f"  {g:12} " + "  ".join(f"{k}=[{v[0]:+.3f},{v[1]:+.3f}]" for k, v in lim.items()))

def part_stability(df):
    print("sd between 5 seeds of the least stable limit, as % of the band width")
    cal = [g for g in sorted(df.game.unique()) if series(df, g)[2] >= MIN_HISTORY]
    for names, label in ((USED, "limits in the artefact (28 d, 112 d)"), (["d7v7"], "7-day limit (exploratory, dropped)")):
        print(f"  {label}")
        print("    B        " + "  ".join(f"{g:>12}" for g in cal))
        for B in (300, 1000, 5000, 20000):
            row = []
            for g in cal:
                worst = 0
                for n in names:
                    q = np.array([single_seed_limits(series(df, g)[0], B, s, [n])[n] for s in SEEDS]); w = (q[:, 1] - q[:, 0]).mean()
                    worst = max(worst, q.std(axis=0).max() / w * 100)
                row.append(f"{worst:10.1f} %")
            print("    " + f"B={B}".ljust(9) + "  ".join(f"{x:>12}" for x in row))

def simulate(df, g, lim, K=500, weeks=52):
    arr = series(df, g)[0]; Lt = H + 7 * weeks - 1                      # 52 evaluations for every phase (t = H-1+off .. Lt-1 step 7)
    X = boot(arr, K, Lt, np.random.default_rng(2026)); R = []
    for off in range(7):                                                # all seven weekday phases
        ts = list(range(H - 1 + off, Lt, 7)); assert len(ts) == weeks, (off, len(ts))
        M, D, U, W = [], [], [], []
        for t in ts:
            m, d, u, w = label_arrays(X, t, lim); M.append(m); D.append(d); U.append(u); W.append(w)
        M, D, U, W = (np.array(z).T for z in (M, D, U, W)); F = M | D
        FP = (M[:, 1:] & M[:, :-1]) | (D[:, 1:] & D[:, :-1])            # same non-stable label on two consecutive weekly evaluations
        R.append(dict(m=M.mean(), d=D.mean(), p=F.any(1).mean(), e=episodes(F), pp=FP.any(1).mean(), pe=episodes(FP), u=U.mean(), w=W.mean()))
    return R

def part_trajectories(df):
    cal = [g for g in sorted(df.game.unique()) if series(df, g)[2] >= MIN_HISTORY]
    ART = art_limits()
    for level in (TAILS, (0.005, 0.995)):
        print(f"--- tails {level[0]*100:.1f} % / {level[1]*100:.1f} % (K=500 null trajectories of 52 weekly evaluations, all 7 phases) ---")
        print("  game         mejora/eval  deterioro/eval | no filter: P(>=1/52w)  episodes/yr | 2 weeks: P(>=1)  episodes/yr [phase min-max] | arrow28 up/down per eval")
        for g in cal:
            lim = ART[g] if level == TAILS else {k: v for k, v in pooled_limits(series(df, g)[0], USED, level).items()}
            R = simulate(df, g, lim); f = lambda k: np.mean([r[k] for r in R]); pe = [r["pe"] for r in R]
            print(f"  {g:12} {f('m')*100:6.1f} %    {f('d')*100:6.1f} %    |   {f('p')*100:6.1f} %        {f('e'):5.2f}     |   {f('pp')*100:6.1f} %       {f('pe'):5.2f} [{min(pe):.2f}-{max(pe):.2f}] |  {f('u')*100:4.1f}/{f('w')*100:4.1f} %")

def part_real(df):
    cal = [g for g in sorted(df.game.unique()) if series(df, g)[2] >= MIN_HISTORY]
    ART = art_limits()
    for level in (TAILS, (0.005, 0.995)):
        print(f"--- tails {level[0]*100:.1f} % / {level[1]*100:.1f} % ---")
        for g in cal:
            arr = series(df, g)[0]; N = len(arr); X = arr[None, :]
            lim = ART[g] if level == TAILS else pooled_limits(arr, USED, level)
            lab, ar = [], 0
            for t in list(range(N - 1, H - 2, -7))[::-1]:
                m, d, u, w = label_arrays(X, t, lim); lab.append("mejora" if m[0] else "deterioro" if d[0] else "estable"); ar += int(u[0] or w[0])
            shown = sum(1 for i in range(1, len(lab)) if lab[i] == lab[i - 1] and lab[i] != "estable")
            t = N - 1; print(f"  {g:12} unfiltered {pd.Series(lab).value_counts().to_dict()} | published with the 2-week rule: {shown} | arrows(28d) fired in 9 evaluations: {ar} | today: rho112={rho(X, t)[0]:+.2f}, d28v56={dmed(X, t, 28, 56)[0]*100:+.1f} %, d28v28={dmed(X, t, 28, 28)[0]*100:+.1f} %, label today={lab[-1]}, a week ago={lab[-2]}")

def part_rule(df):
    print("current rule (|d| >= 10 %, 28 d vs 28 d) and Mann-Whitney p<0.05 under 'no change' (end of the last complete block, 3000 resamples)")
    for g in sorted(df.game.unique()):
        arr = series(df, g)[0]; N = len(arr)
        if N < MIN_HISTORY: continue
        X = boot(arr, 3000, N, np.random.default_rng(7)); t = (N // 7) * 7 - 1; d = dmed(X, t, 28, 28); ok = ~np.isnan(d); pv = []
        for k in np.where(ok)[0][:1500]:
            c = X[k, t - 27:t + 1]; b = X[k, t - 55:t - 27]; pv.append(stats.mannwhitneyu(c[~np.isnan(c)], b[~np.isnan(b)], method="asymptotic").pvalue)
        print(f"  {g:12} |d|>=10 %: {np.mean(np.abs(d[ok]) >= .10)*100:5.1f} %   Mann-Whitney p<0.05: {np.mean(np.array(pv) < .05)*100:5.1f} %")

def part_horizons(df):
    print("real data: weekly evaluations counted back from today; limits pooled 5 seeds x 10000")
    for g in sorted(df.game.unique()):
        arr = series(df, g)[0]; N = len(arr)
        if N < MIN_HISTORY: continue
        lim = pooled_limits(arr, ["rho56", "rho84", "rho112"], B=10000); X = arr[None, :]; row = []
        for hh in (56, 84, 112):
            r = [rho(X, t, hh)[0] for t in range(N - 1, hh - 2, -7)]; r = [x for x in r if not np.isnan(x)]
            row.append(f"{hh}d: up {sum(x > lim[f'rho{hh}'][1] for x in r)} down {sum(x < lim[f'rho{hh}'][0] for x in r)} of {len(r)}")
        print(f"  {g:12} " + " | ".join(row))

if __name__ == "__main__":
    df = load(sys.argv[1]); part = sys.argv[2] if len(sys.argv) > 2 else "limits"
    for g in sorted(df.game.unique()): a = series(df, g); print(f"{g:12} {a[2]} calendar days, {a[1]} observations") if part == "limits" else None
    {"limits": part_limits, "stability": part_stability, "trajectories": part_trajectories, "real": part_real, "rule": part_rule, "horizons": part_horizons}[part](df)
