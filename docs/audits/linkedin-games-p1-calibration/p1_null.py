exec(open("p1_load.py").read())
from scipy import stats
rng = np.random.default_rng(20261104)   # fixed seed: reproducible
W = 28
def evaluate(eff_by_day, N, t):
    """eff_by_day: dict day_index -> eff (missing days absent). Windows (t-W, t] and (t-2W, t-W]."""
    cur = [eff_by_day[i] for i in range(t-W+1, t+1) if i in eff_by_day]
    prv = [eff_by_day[i] for i in range(t-2*W+1, t-W+1) if i in eff_by_day]
    if len(cur) < 5 or len(prv) < 5: return None
    mc, mp = np.median(cur), np.median(prv)
    p = stats.mannwhitneyu(cur, prv, alternative="two-sided", method="asymptotic").pvalue
    return (mc-mp)/mp, p, len(cur), len(prv)
def grid(N): return list(range(2*W-1, N, 7))
def series(g):
    x = df[df.game == g]; start = x.dn.min(); N = x.dn.max()-start+1
    return {int(r.dn-start): r.eff for r in x.itertuples()}, N
def block_boot(d, N):
    """Resample whole 7-day blocks (keeps the weekday pattern and short-range dependence); no trend survives."""
    nb = int(np.ceil(N/7)); out = {}
    for b in range(nb):
        src = int(rng.integers(0, nb))
        for k in range(7):
            i, j = b*7+k, src*7+k
            if i < N and j in d: out[i] = d[j]
    return out
res = {}
B = 300
for g in GAMES:
    d, N = series(g)
    real = [evaluate(d, N, t) for t in grid(N)]; real = [r for r in real if r]
    null = []
    for _ in range(B):
        nd = block_boot(d, N)
        null += [r for r in (evaluate(nd, N, t) for t in grid(N)) if r]
    res[g] = (np.array(real), np.array(null), N)
import pickle; pickle.dump(res, open("p1_res.pkl", "wb"))
print("game          N  evals_real  evals_null")
for g,(r,n,N) in res.items(): print(f"{g:12} {N:4} {len(r):6} {len(n):10}")
