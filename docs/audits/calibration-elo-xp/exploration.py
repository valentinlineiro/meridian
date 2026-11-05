"""Exploración de la calibración de ELO y XP (docs/audits/2026-11-05-calibration-elo-xp-design.md).

Solo lectura y reproducible: semilla fija. Entrada (no se versiona: datos personales del propietario), tres JSON producidos con
`wrangler d1 execute meridian --remote --json` y recortados a `results`:
  anchors.json  [{t,e}]  mismas anclas que usa la regla de ELO (lote de sincronización, última partida, ELO observado)
                         WITH batch AS (... ver ANCHORS en src/infrastructure/d1/d1WhatChangedAdapter.ts) SELECT played_at t, page_elo e ...
  allm.json     [{t}]    SELECT played_at t FROM matches WHERE played_at IS NOT NULL ORDER BY played_at
  xp.json       [{d,x}]  SELECT date d, gained_xp x FROM xp_summaries ORDER BY date   (un día UTC por fila)
Uso: python3 exploration.py <directorio con los tres JSON>
No calibra nada que vaya a producción: es la evidencia del diseño. La calibración real será otro artefacto versionado.
"""
import bisect, json, math, random, statistics as st, sys

D = 86400
S = sys.argv[1]
anchors, matches, xp = (json.load(open(f"{S}/{f}.json")) for f in ("anchors", "allm", "xp"))
random.seed(20261105)


def pct(v, p):
    v = sorted(v); k = (len(v) - 1) * p; f = int(k); c = min(f + 1, len(v) - 1)
    return v[f] + (v[c] - v[f]) * (k - f)


# ---------------------------------------------------------------- ELO
T = [r["t"] for r in anchors]; E = [r["e"] for r in anchors]; MT = sorted(r["t"] for r in matches)
iv = []  # (days, games, delta) between consecutive anchors
for i in range(len(T) - 1):
    g = bisect.bisect_right(MT, T[i + 1]) - bisect.bisect_right(MT, T[i])
    iv.append(((T[i + 1] - T[i]) / D, g, E[i + 1] - E[i]))
dense = [r for r in iv if r[0] < 7 and r[1] > 0]  # drops the one 225-day hole between the first sync and the dense period
print(f"ELO: anclas={len(T)} días distintos={len({t // D for t in T})} huecos>7d={sum(r[0] >= 7 for r in iv)} "
      f"intervalos usados={len(dense)} partidas={sum(r[1] for r in dense)}")
z = [r[2] / math.sqrt(r[1]) for r in dense]
sigma = st.pstdev(z)
print(f"  Δ/√partidas: sd={sigma:.1f}  mediana|·|={st.median(abs(v) for v in z):.1f}  media={st.mean(z):.2f}")


def boot_sigma(B=4000):
    out = []
    for _ in range(B):
        s = [random.choice(z) for _ in z]
        out.append(st.pstdev(s))
    return out
bs = boot_sigma()
print(f"  IC95 bootstrap de σ: [{pct(bs, .025):.1f}, {pct(bs, .975):.1f}]  (anchura relativa {(pct(bs, .975) - pct(bs, .025)) / sigma:.0%})")


def null_window(k, B=20000):
    """Δ/√k bajo 'sin deriva': se concatenan intervalos con signo aleatorio hasta acumular ≥ k partidas."""
    out = []
    for _ in range(B):
        g = d = 0
        while g < k:
            r = random.choice(dense); g += r[1]; d += random.choice((-1, 1)) * r[2]
        out.append(d / math.sqrt(g))
    return out
print("  multiplicadores del nulo (Δ/√k): cuantiles 2,5 % / 97,5 % / 0,5 % / 99,5 %  y banda 95 % de Δ en puntos")
for k in (5, 10, 20, 40):
    n = null_window(k)
    lo, hi, elo, ehi = (pct(n, p) for p in (.025, .975, .005, .995))
    print(f"  k={k:>2}: z [{lo:+.1f}, {hi:+.1f}] / [{elo:+.1f}, {ehi:+.1f}]  Δ95% [{lo * math.sqrt(k):+.0f}, {hi * math.sqrt(k):+.0f}]")

print("  referencia: ventanas reales (ancla ≤ since → última ancla de la ventana), |Δ| p50/p90 y % ≥ 25")
for w in (7, 14, 28):
    out = []
    for day in range(int(T[-1] // D) - 42, int(T[-1] // D) + 1):  # solo el periodo denso
        until = (day + 1) * D; since = until - w * D
        b = bisect.bisect_right(T, since) - 1
        cur = [i for i in range(len(T)) if since < T[i] <= until]
        if b >= 0 and cur: out.append(E[cur[-1]] - E[b])
    a = [abs(v) for v in out]
    print(f"  w={w:>2}d n={len(a)} (solapadas) p50={pct(a, .5):.0f} p90={pct(a, .9):.0f}  ≥25: {sum(v >= 25 for v in a) / len(a):.0%}")

# ---------------------------------------------------------------- XP
xs = [r["x"] for r in xp]
print(f"\nXP: días={len(xs)} contiguos={all(xp[i + 1]['d'] - xp[i]['d'] == D for i in range(len(xp) - 1))} "
      f"media={st.mean(xs):.0f} mediana={st.median(xs):.0f} CV={st.pstdev(xs) / st.mean(xs):.2f} mín={min(xs)} máx={max(xs)}")
m = st.mean(xs); den = sum((v - m) ** 2 for v in xs)
print("  autocorrelación lag 1/7: " + " / ".join(f"{sum((xs[i] - m) * (xs[i + l] - m) for i in range(len(xs) - l)) / den:+.2f}" for l in (1, 7)))
blocks = [xs[i:i + 7] for i in range(0, len(xs) - 6, 7)]


def null_ratio(w, hist, B=20000):
    out = []
    for _ in range(B):
        s = []
        while len(s) < hist + w: s += random.choice(blocks)
        out.append(st.mean(s[hist:hist + w]) / st.mean(s[:hist]))
    return out
print("  cociente (media diaria de la ventana / media diaria histórica), nulo por bloques de 7 días, histórico de 100 días")
for w in (3, 7, 14, 28):
    n = null_ratio(w, 100)
    print(f"  w={w:>2}d: 95 % [{pct(n, .025):.2f}, {pct(n, .975):.2f}]  99 % [{pct(n, .005):.2f}, {pct(n, .995):.2f}]  P(≥1,3)={sum(v >= 1.3 for v in n) / len(n):.1%}")
print("  referencia: ventanas reales históricas con ≥ 28 días previos, % con cociente ≥ 1,3 (incluye deriva real)")
for w in (3, 7, 14, 28):
    r = [st.mean(xs[i:i + w]) / st.mean(xs[:i]) for i in range(28, len(xs) - w + 1)]
    print(f"  w={w:>2}d n={len(r)} ≥1,3: {sum(v >= 1.3 for v in r) / len(r):.0%}")
print("  estado actual (últimos w días frente a los anteriores)")
for w in (7, 14, 28):
    print(f"  w={w:>2}d: cociente={st.mean(xs[-w:]) / st.mean(xs[:-w]):.2f}")
