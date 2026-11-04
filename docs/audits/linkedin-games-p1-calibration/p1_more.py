exec(open("p1_null.py").read().split("res = {}")[0])   # reuse helpers, not the heavy loop
import pickle
rng = np.random.default_rng(20261104)
B = 300
def eval_w(d, t, w):
    cur = [d[i] for i in range(t-w+1, t+1) if i in d]; prv = [d[i] for i in range(t-2*w+1, t-w+1) if i in d]
    if len(cur) < 3 or len(prv) < 3: return None
    return (np.median(cur)-np.median(prv))/np.median(prv), len(cur), len(prv)
print("== Banda de ruido (q95 de |Δ| de medianas sin cambio real) según el tamaño de ventana")
print("game          W=7     W=14    W=28    W=56   (n medio por ventana: ~6 / 13 / 27 / 53)")
bands = {}
for g in GAMES:
    d, N = series(g); row = []
    for w in (7, 14, 28, 56):
        if N < 2*w+7: row.append(None); continue
        a = []
        for _ in range(B):
            nd = block_boot(d, N)
            for t in range(2*w-1, N, 7):
                r = eval_w(nd, t, w)
                if r: a.append(abs(r[0]))
        row.append(np.quantile(a, .95)); 
    bands[g] = row
    print(f"{g:12} " + "  ".join(f"{(x*100):5.1f}%" if x is not None else "   n/d" for x in row))
print()
print("== Escala del cambio real (mediana de eficiencia: primeros 56 d vs últimos 56 d)")
for g in GAMES:
    x = df[df.game == g].sort_values("dn"); e = x.eff.values
    if len(x) >= 112: print(f"{g:12} primeros56={np.median(e[:56]):.2f} ultimos56={np.median(e[-56:]):.2f}  cambio={ (np.median(e[-56:])/np.median(e[:56])-1)*100:+.0f}%")
    else: print(f"{g:12} {len(x)} obs: sin dos bloques de 56 d")
pickle.dump(bands, open("p1_bands.pkl","wb"))
