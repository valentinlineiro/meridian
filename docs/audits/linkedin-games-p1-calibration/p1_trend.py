exec(open("p1_null.py").read().split("res = {}")[0])
from scipy import stats
rng = np.random.default_rng(20261104)
B = 300
def trend(d, t, H):
    idx = [i for i in range(t-H+1, t+1) if i in d]
    if len(idx) < 0.6*H: return None
    y = np.array([d[i] for i in idx]); x = np.array(idx)
    rho = stats.spearmanr(x, y).statistic
    # Theil-Sen slope of log-eff per day -> % per 28 days
    sl = stats.theilslopes(np.log(y), x).slope
    return rho, (np.exp(sl*28)-1)*100, len(idx)
for H in (56, 84, 112):
    print(f"== Tendencia sobre los últimos {H} días (Spearman eficiencia~tiempo); banda nula = q95 de |ρ| bajo 'sin cambio'")
    print("game          q95|ρ|nulo  evals reales  marcadas(+)  marcadas(−)   último ρ   pendiente Theil-Sen (%/28d)   n")
    for g in GAMES:
        d, N = series(g)
        if N < H: print(f"{g:12}   n/d ({N} d < {H})"); continue
        null = []
        for _ in range(B):
            nd = block_boot(d, N)
            for t in range(H-1, N, 7):
                r = trend(nd, t, H)
                if r: null.append(abs(r[0]))
        q = np.quantile(null, .95)
        real = [(t, trend(d, t, H)) for t in range(H-1, N, 7)]; real = [(t, r) for t, r in real if r]
        up = sum(r[0] > q for t, r in real); dn = sum(r[0] < -q for t, r in real)
        t, r = real[-1]
        print(f"{g:12}   {q:6.2f}      {len(real):5}        {up:5}        {dn:5}      {r[0]:+6.2f}        {r[1]:+6.1f}                         {r[2]}")
    print()
