exec(open("p1_trend.py").read().split("for H in (56, 84, 112):")[0])
H = 112; RECENT = 28; BASE = 56
def recent_vs_base(d, t):
    cur = [d[i] for i in range(t-RECENT+1, t+1) if i in d]; base = [d[i] for i in range(t-RECENT-BASE+1, t-RECENT+1) if i in d]
    if len(cur) < 0.6*RECENT or len(base) < 0.6*BASE: return None
    return (np.median(cur)-np.median(base))/np.median(base)
def calibrate(d, N):
    qr, qd = [], []
    for _ in range(B):
        nd = block_boot(d, N)
        for t in range(H-1, N, 7):
            r = trend(nd, t, H); 
            if r: qr.append(abs(r[0]))
        for t in range(RECENT+BASE-1, N, 7):
            x = recent_vs_base(nd, t)
            if x is not None: qd.append(abs(x))
    return np.quantile(qr, .95), np.quantile(qd, .95)
def label(d, t, qr, qd):
    tr = trend(d, t, H); rb = recent_vs_base(d, t)
    if tr is None or rb is None: return "datos insuficientes"
    if rb <= -qd: return "deterioro"
    if tr[0] < -qr: return "deterioro"
    if tr[0] > qr: return "mejora sostenida"
    return "estable"
from collections import Counter
print("game          banda ρ(112d)  banda Δ(28 vs 56 previos) | REAL: etiquetas por evaluación semanal           | NULO (sin cambio): % evaluaciones con aviso")
for g in GAMES:
    d, N = series(g)
    if N < H:
        print(f"{g:12}   {N} días < {H}: siempre 'datos insuficientes' hasta alcanzar {H} días de historia"); continue
    qr, qd = calibrate(d, N)
    real = Counter(label(d, t, qr, qd) for t in range(H-1, N, 7))
    nl = Counter()
    for _ in range(B):
        nd = block_boot(d, N)
        for t in range(H-1, N, 7): nl[label(nd, t, qr, qd)] += 1
    tot = sum(nl.values())
    print(f"{g:12}   {qr:5.2f}          {qd*100:5.1f}%                    | {dict(real)} | mejora {nl['mejora sostenida']/tot*100:4.1f}%  deterioro {nl['deterioro']/tot*100:4.1f}%  estable {nl['estable']/tot*100:4.1f}%")
    last = label(d, N-1, qr, qd); lr = recent_vs_base(d, N-1); lt = trend(d, N-1, H)
    print(f"{'':12}   hoy: {last} | Δ28 vs base {lr*100:+.1f}% | ρ112 {lt[0]:+.2f}, pendiente {lt[1]:+.1f}%/28d")
