"""Complements p1_calibrate.py: (a) which limit is the least stable, (b) a stricter per-evaluation level (0.5 % per tail).
Usage: python3 p1_levels.py prod_days.json"""
import sys, numpy as np, pandas as pd
sys.argv = [sys.argv[0]] + sys.argv[1:2]
import p1_calibrate as C
data = {g: C.series(g) for g in C.GAMES}; cal = [g for g in C.GAMES if data[g][2] >= C.MIN_HISTORY]
print("== (a) Inestabilidad por límite (Zip y resto): desviación típica entre 5 semillas / anchura de la banda, en la escala relativa y en la escala log")
for g in cal:
    for n in ("d7v7", "d28v28", "d28v56", "rho112"):
        for B in (5000, 20000):
            q = np.array([C.calibrate(data[g][0], B, s, [n])[n] for s in (11, 22, 33, 44, 55)])
            w = (q[:, 1] - q[:, 0]).mean(); sd = q.std(axis=0)
            if n.startswith("d"):
                lq = np.log1p(q); lw = (lq[:, 1] - lq[:, 0]).mean(); lsd = lq.std(axis=0)
                print(f"  {g:12} {n:7} B={B:<6} relativa: {sd.max()/w*100:4.1f} %   log: {lsd.max()/lw*100:4.1f} %   (límites {q[:,0].mean():+.3f}/{q[:,1].mean():+.3f})")
            else:
                print(f"  {g:12} {n:7} B={B:<6} ρ: {sd.max()/w*100:4.1f} %   (límites {q[:,0].mean():+.3f}/{q[:,1].mean():+.3f})")
print("\n== (b) Nivel por cola: 2,5 % (actual) frente a 0,5 % (más estricto). B=20000, mismas trayectorias nulas")
for lo, hi in ((0.025, 0.975), (0.005, 0.995)):
    C.LO, C.HI = lo, hi
    print(f"  --- colas {lo*100:.1f} % / {hi*100:.1f} % ---")
    for g in cal:
        LIM = C.calibrate(data[g][0], 20000, 11, ["d7v7", "d28v28", "d28v56", "rho112"])
        rng = np.random.default_rng(2026); K = 400; Lt = C.H + 7 * 52 + 7
        X = C.boot(data[g][0], K, Lt, rng); Fs = []; FPs = []
        for off in (0, 2, 4, 6):
            M = []; D = []
            for t in range(C.H - 1 + off, Lt, 7):
                m, d, _, _ = C.label_and_arrows(X, t, LIM); M.append(m); D.append(d)
            M = np.array(M).T; D = np.array(D).T; F = M | D; FP = (M[:, 1:] & M[:, :-1]) | (D[:, 1:] & D[:, :-1])
            ep = lambda Z: np.mean([(np.diff(np.r_[0, z.astype(int)]) == 1).sum() for z in Z])
            Fs.append((F.any(1).mean(), ep(F))); FPs.append((FP.any(1).mean(), ep(FP)))
        arr = data[g][0]; N = len(arr); Xr = arr[None, :]; lab = []
        for t in list(range(N - 1, C.H - 2, -7))[::-1]:
            m, d, _, _ = C.label_and_arrows(Xr, t, LIM); lab.append("mejora" if m[0] else "deterioro" if d[0] else "estable")
        print(f"  {g:12} sin filtro: P(>=1 en 52 sem) {np.mean([f[0] for f in Fs])*100:5.1f} %, episodios/año {np.mean([f[1] for f in Fs]):4.2f} | 2 sem seguidas: {np.mean([f[0] for f in FPs])*100:5.1f} %, {np.mean([f[1] for f in FPs]):4.2f} | REAL (9 evaluaciones): {pd.Series(lab).value_counts().to_dict()}")

print("\n== (c) Datos reales: etiquetas y flechas con límites de B=20000, por nivel y con/sin 'dos semanas seguidas'")
for lo, hi in ((0.025, 0.975), (0.005, 0.995)):
    C.LO, C.HI = lo, hi
    print(f"  --- colas {lo*100:.1f} % / {hi*100:.1f} % ---")
    for g in cal:
        LIM = C.calibrate(data[g][0], 20000, 11, ["d7v7", "d28v28", "d28v56", "rho112"])
        arr = data[g][0]; N = len(arr); Xr = arr[None, :]; lab = []; a7 = 0; a28 = 0
        for t in list(range(N - 1, C.H - 2, -7))[::-1]:
            m, d, u7, u28 = C.label_and_arrows(Xr, t, LIM); lab.append("mejora" if m[0] else "deterioro" if d[0] else "estable")
            a7 += int(u7[0][0] or u7[1][0]); a28 += int(u28[0][0] or u28[1][0])
        shown = sum(1 for i in range(1, len(lab)) if lab[i] == lab[i - 1] and lab[i] != "estable")
        print(f"  {g:12} etiquetas {pd.Series(lab).value_counts().to_dict()} | mostradas con filtro de 2 semanas: {shown} | flechas disparadas en 9 evaluaciones: 7d={a7}, 28d={a28}")
