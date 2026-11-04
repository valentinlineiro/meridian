"""P1 calibration (design: ../linkedin-games-p1-interpretation-design-2026-11-04.md). Python 3 + numpy, pandas, scipy.
Null = resampling of whole 7-day blocks of the game's own history (no trend survives; weekday cycle and short dependence do).
Thresholds are the empirical 2.5 % and 97.5 % points of the SIGNED statistic (each tail on its own), evaluated at the END of
each resampled history, i.e. what production would compute for "today". Usage: python3 p1_calibrate.py prod_days.json
"""
import json, sys, warnings
import numpy as np, pandas as pd
from scipy import stats
warnings.filterwarnings("ignore")
LO, HI = 0.025, 0.975
H, RECENT, BASE = 112, 28, 56          # trend horizon; recent window; baseline window
COV = 0.6                              # minimum fraction of days with an observation in each window (convention)
MIN_HISTORY = 112                      # minimum calendar-day span of the game's history to calibrate (convention)

days = json.load(open(sys.argv[1] if len(sys.argv) > 1 else "prod_days.json"))
rows = [(p["date"], g, e["scoreSeconds"], e["avgSeconds"]) for p in days for g, e in p["games"].items() if e.get("avgSeconds")]
df = pd.DataFrame(rows, columns="date game s a".split()); df["d"] = pd.to_datetime(df.date); df["eff"] = df.a / df.s
GAMES = sorted(df.game.unique())

def series(g):
    x = df[df.game == g]; start = x.d.min(); N = (x.d.max() - start).days + 1
    arr = np.full(N, np.nan)
    for r in x.itertuples(): arr[(r.d - start).days] = r.eff
    return arr, int(x.shape[0]), N          # values by calendar day (NaN = no observation), observations, calendar days

def boot(arr, B, L, rng):
    N = len(arr); nb = -(-N // 7); nl = -(-L // 7)
    src = rng.integers(0, nb, size=(B, nl))
    idx = (src[:, :, None] * 7 + np.arange(7)).reshape(B, -1)[:, :L]
    return np.where(idx < N, arr[np.minimum(idx, N - 1)], np.nan)

def dmed(X, t, wc, wb):
    """Signed relative change of medians: window (t-wc, t] vs the wb days before it. X: (K, L); t: index of the last day."""
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

def limits(v):
    v = v[~np.isnan(v)]; return (np.quantile(v, LO), np.quantile(v, HI)) if len(v) > 50 else (np.nan, np.nan)

STATS = {  # name -> function(X, t) -> signed statistic
    "d7v7": lambda X, t: dmed(X, t, 7, 7), "d14v14": lambda X, t: dmed(X, t, 14, 14), "d28v28": lambda X, t: dmed(X, t, 28, 28),
    "d56v56": lambda X, t: dmed(X, t, 56, 56), "d28v56": lambda X, t: dmed(X, t, RECENT, BASE),
    "rho56": lambda X, t: rho(X, t, 56), "rho84": lambda X, t: rho(X, t, 84), "rho112": lambda X, t: rho(X, t, 112),
}
def calibrate(arr, B, seed, names):
    """Limits at the end of the last COMPLETE 7-day block of each resampled history. A window straddling two resampled weeks
    mixes independent draws (dependence across the seam is broken) and would understate the variance of a real window."""
    N = len(arr); rng = np.random.default_rng(seed); X = boot(arr, B, N, rng); t = (N // 7) * 7 - 1
    return {n: limits(STATS[n](X, t)) for n in names}

def label_and_arrows(X, t, lim):
    """Vectorised over rows of X at day t. Returns (mejora, deterioro, arrow7 up/down, arrow28 up/down) boolean arrays."""
    r = rho(X, t); d = dmed(X, t, RECENT, BASE); a7 = dmed(X, t, 7, 7); a28 = dmed(X, t, 28, 28)
    mejora = r > lim["rho112"][1]; det = (d < lim["d28v56"][0]) | (r < lim["rho112"][0])
    return mejora & ~det, det, (a7 > lim["d7v7"][1], a7 < lim["d7v7"][0]), (a28 > lim["d28v28"][1], a28 < lim["d28v28"][0])

if __name__ == "__main__":
    SEEDS = [11, 22, 33, 44, 55]
    print("calendar days / observations per game:")
    data = {g: series(g) for g in GAMES}
    for g, (arr, n, N) in data.items(): print(f"  {g:12} {N} días naturales, {n} observaciones")
    cal = [g for g in GAMES if data[g][2] >= MIN_HISTORY]
    print("\n== 1. Límites empíricos por cola (B=5000, semilla 11): 2,5 % / 97,5 % del estadístico firmado (cambio relativo de medianas, o ρ)")
    LIM = {}
    for g in cal:
        LIM[g] = calibrate(data[g][0], 5000, 11, list(STATS))
        print(f"  {g:12} " + "  ".join(f"{n}=[{LIM[g][n][0]:+.3f},{LIM[g][n][1]:+.3f}]" for n in STATS))
    print("\n== 2. Estabilidad frente a B y a la semilla: desviación típica entre 5 semillas de cada límite, en % de la anchura de la banda")
    for names in (["d7v7", "d28v28", "d28v56", "rho112"],):
        print("  " + "B     ".ljust(8) + "  ".join(f"{g:>12}" for g in cal))
        for B in (300, 1000, 5000):
            row = []
            for g in cal:
                worst = 0
                for n in names:
                    q = np.array([calibrate(data[g][0], B, s, [n])[n] for s in SEEDS]); w = (q[:, 1] - q[:, 0]).mean()
                    worst = max(worst, q.std(axis=0).max() / w * 100)
                row.append(f"{worst:10.1f} %")
            print("  " + f"B={B}".ljust(8) + "  ".join(f"{x:>12}" for x in row))
    print("\n== 3. Falsos avisos bajo 'sin cambio': trayectorias nulas de 52 evaluaciones semanales, media de 4 fases de la semana")
    rng = np.random.default_rng(2026); K = 400; Lt = H + 7 * 52 + 7
    print("  game         mejora/eval deterioro/eval | sin filtro: P(>=1 en 52 sem) episodios/año | 2 semanas seguidas: P(>=1) episodios/año | flecha7 ↑/↓  flecha28 ↑/↓ (por eval)")
    for g in cal:
        X = boot(data[g][0], K, Lt, rng); R = {k: [] for k in ("m", "d", "p", "e", "pp", "pe", "a7u", "a7d", "a28u", "a28d")}
        for off in (0, 2, 4, 6):
            M = []; D = []; A7 = []; A28 = []
            for t in range(H - 1 + off, Lt, 7):
                m, d, a7, a28 = label_and_arrows(X, t, LIM[g]); M.append(m); D.append(d); A7.append(a7); A28.append(a28)
            M = np.array(M).T; D = np.array(D).T; F = M | D; FP = (M[:, 1:] & M[:, :-1]) | (D[:, 1:] & D[:, :-1])
            ep = lambda Z: np.mean([(np.diff(np.r_[0, z.astype(int)]) == 1).sum() for z in Z])
            R["m"].append(M.mean()); R["d"].append(D.mean()); R["p"].append(F.any(1).mean()); R["e"].append(ep(F)); R["pp"].append(FP.any(1).mean()); R["pe"].append(ep(FP))
            R["a7u"].append(np.mean([x[0] for x in A7])); R["a7d"].append(np.mean([x[1] for x in A7])); R["a28u"].append(np.mean([x[0] for x in A28])); R["a28d"].append(np.mean([x[1] for x in A28]))
        f = lambda k: np.mean(R[k])
        print(f"  {g:12} {f('m')*100:5.1f} %     {f('d')*100:5.1f} %    |     {f('p')*100:5.1f} %        {f('e'):5.2f}     |       {f('pp')*100:5.1f} %         {f('pe'):5.2f}       | {f('a7u')*100:4.1f}/{f('a7d')*100:4.1f} %   {f('a28u')*100:4.1f}/{f('a28d')*100:4.1f} %")
    print("\n== 4. Regla actual (|Δ| ≥ 10 %, 28 d frente a 28 d, ≥ 10 datos) bajo 'sin cambio', y Mann-Whitney p<0,05 (evaluado al final de cada historial remuestreado)")
    for g in cal:
        arr = data[g][0]; X = boot(arr, 3000, len(arr), np.random.default_rng(7)); t = (len(arr) // 7) * 7 - 1
        d = dmed(X, t, 28, 28); ok = ~np.isnan(d)
        pv = []
        for k in np.where(ok)[0][:1500]:
            c = X[k, t - 27:t + 1]; b = X[k, t - 55:t - 27]; c = c[~np.isnan(c)]; b = b[~np.isnan(b)]
            pv.append(stats.mannwhitneyu(c, b, method="asymptotic").pvalue)
        print(f"  {g:12} |Δ|≥10 %: {np.mean(np.abs(d[ok]) >= .10)*100:5.1f} %   Mann-Whitney p<0,05: {np.mean(np.array(pv) < .05)*100:5.1f} %")
    print("\n== 5. Datos reales: ρ por horizonte (marcadas con límites de B=5000) y regla completa por evaluación semanal")
    for g in cal:
        arr = data[g][0]; N = len(arr); X = arr[None, :]; ev = list(range(N - 1, H - 2, -7))[::-1]
        row = []
        for hh in (56, 84, 112):
            lim = calibrate(arr, 5000, 11, [f"rho{hh}"])[f"rho{hh}"]
            r = [rho(X, t, hh)[0] for t in range(N - 1, hh - 2, -7)]; r = [x for x in r if not np.isnan(x)]
            row.append(f"{hh}d: ↑{sum(x > lim[1] for x in r)} ↓{sum(x < lim[0] for x in r)} de {len(r)} (límites {lim[0]:+.2f}/{lim[1]:+.2f})")
        lab = []
        for t in ev:
            m, d, a7, a28 = label_and_arrows(X, t, LIM[g]); lab.append("mejora" if m[0] else "deterioro" if d[0] else "estable")
        pers = sum(1 for i in range(1, len(lab)) if lab[i] == lab[i - 1] and lab[i] != "estable")
        t = N - 1; r = rho(X, t)[0]; dd = dmed(X, t, 28, 56)[0]; a7 = dmed(X, t, 7, 7)[0]; a28 = dmed(X, t, 28, 28)[0]
        print(f"  {g:12} " + " | ".join(row))
        print(f"  {'':12} etiquetas semanales (hacia atrás desde hoy): {pd.Series(lab).value_counts().to_dict()}, repetidas 2 semanas seguidas: {pers} ; hoy: ρ112={r:+.2f}, Δ28v56={dd*100:+.1f} %, Δ28v28={a28*100:+.1f} %, Δ7v7={a7*100:+.1f} %; límites Δ28v28 [{LIM[g]['d28v28'][0]*100:+.0f} %, {LIM[g]['d28v28'][1]*100:+.0f} %], Δ7v7 [{LIM[g]['d7v7'][0]*100:+.0f} %, {LIM[g]['d7v7'][1]*100:+.0f} %]")
