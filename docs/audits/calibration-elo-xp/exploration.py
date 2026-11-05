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


# Incertidumbre con dependencia temporal: bootstrap de bloques móviles de intervalos consecutivos (la autocorrelación de los incrementos es -0,15).
def lag1(v):
    m = st.mean(v); return sum((v[i] - m) * (v[i + 1] - m) for i in range(len(v) - 1)) / sum((x - m) ** 2 for x in v)
mz = st.mean(z); sk = sum((x - mz) ** 3 for x in z) / len(z) / st.pstdev(z) ** 3
print(f"  simetría: media={mz:+.2f} asimetría={sk:+.2f}  autocorrelación lag 1={lag1(z):+.2f}")


def block_resample(v, b):
    out = []
    while len(out) < len(v):
        i = random.randrange(len(v) - b + 1); out += v[i:i + b]
    return out[:len(v)]
for b in (1, 3, 5, 8):
    bs = [st.pstdev(block_resample(z, b)) for _ in range(3000)]
    print(f"  IC95 de σ con bloques de {b}: [{pct(bs, .025):.1f}, {pct(bs, .975):.1f}]  semiancho relativo {(pct(bs, .975) - pct(bs, .025)) / 2 / sigma:.0%}")


def null_window(k, B=20000, blocks=1, flip=True):
    """Δ/√k bajo 'sin deriva' con EXACTAMENTE k partidas: se concatenan intervalos (o bloques de `blocks` intervalos consecutivos, en orden)
    con signo aleatorio sin pasar de k. Los intervalos más largos que lo que falta se descartan; los de 1 partida siempre caben."""
    out = []
    for _ in range(B):
        g = d = 0
        while g < k:
            i = random.randrange(len(dense) - blocks + 1); seg = dense[i:i + blocks]
            sg = random.choice((-1, 1)) if flip else 1
            for r in seg:
                if g + r[1] > k: break
                g += r[1]; d += sg * r[2]
        out.append(d / math.sqrt(g))
    return out
print("  nulo con k exacto: z al 95 % y 99 % bilateral, y Δ95 % en puntos (signos por intervalo; entre paréntesis, bloques de 3 intervalos en orden)")
for k in (5, 10, 20):
    n1, n3 = null_window(k), null_window(k, blocks=3)
    row = []
    for n in (n1, n3):
        lo, hi, elo, ehi = (pct(n, p) for p in (.025, .975, .005, .995))
        row.append(f"Δ95% [{lo * math.sqrt(k):+.0f}, {hi * math.sqrt(k):+.0f}] Δ99% [{elo * math.sqrt(k):+.0f}, {ehi * math.sqrt(k):+.0f}]")
    print(f"  k={k:>2}: {row[0]}  ({row[1]})")


def band_ci(k, level, B=150):
    """Incertidumbre de un borde de la banda (semiancho relativo del IC95): se rehace TODA la banda sobre series de intervalos remuestreadas por bloques."""
    global dense
    base, edges = dense, []
    for _ in range(B):
        dense = block_resample(base, 3)
        n = null_window(k, B=1500)
        edges.append(pct(n, level) * math.sqrt(k))
    dense = base
    e = null_window(k, B=20000); ref = pct(e, level) * math.sqrt(k)
    return ref, (pct(edges, .975) - pct(edges, .025)) / 2 / abs(ref)
print("  incertidumbre del borde superior (bootstrap de bloques de 3 sobre el origen), semiancho relativo del IC95")
for k in (5, 10, 20):
    r95, h95 = band_ci(k, .975); r99, h99 = band_ci(k, .995)
    print(f"  k={k:>2}: borde 95 % {r95:+.0f} ±{h95:.0%}   borde 99 % {r99:+.0f} ±{h99:.0%}")

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
print("  cociente (media diaria de la ventana / media diaria histórica), nulo por bloques de 7 días, histórico de 100 días; contraste UNILATERAL (solo aceleración)")
print("  nominal: P(r > cuantil 95 %) = 5 %,  P(r > cuantil 99 %) = 1 %")
for w in (3, 7, 14, 28):
    n = null_ratio(w, 100)
    print(f"  w={w:>2}d: cuantil 95 % {pct(n, .95):.2f}  cuantil 99 % {pct(n, .99):.2f}  P(≥1,3)={sum(v >= 1.3 for v in n) / len(n):.1%}")


def xp_band_ci(w, q, B=150):
    """Semiancho relativo del IC95 de un cuantil del nulo cuando la serie de origen se remuestrea por semanas (19 bloques)."""
    global blocks
    base, vals = blocks, []
    for _ in range(B):
        blocks = [random.choice(base) for _ in base]
        vals.append(pct(null_ratio(w, 100, B=1500), q))
    blocks = base
    ref = pct(null_ratio(w, 100), q)
    return ref, (pct(vals, .975) - pct(vals, .025)) / 2 / ref
print("  incertidumbre del cuantil (la serie de origen se remuestrea por semanas), semiancho relativo del IC95")
for w in (7, 14, 28):
    r95, h95 = xp_band_ci(w, .95); r99, h99 = xp_band_ci(w, .99)
    print(f"  w={w:>2}d: cuantil 95 % {r95:.2f} ±{h95:.0%}   cuantil 99 % {r99:.2f} ±{h99:.0%}")
print("  referencia: ventanas reales históricas con ≥ 28 días previos, % con cociente ≥ 1,3 (incluye deriva real)")
for w in (3, 7, 14, 28):
    r = [st.mean(xs[i:i + w]) / st.mean(xs[:i]) for i in range(28, len(xs) - w + 1)]
    print(f"  w={w:>2}d n={len(r)} ≥1,3: {sum(v >= 1.3 for v in r) / len(r):.0%}")
print("  estado actual (últimos w días frente a los anteriores)")
for w in (7, 14, 28):
    print(f"  w={w:>2}d: cociente={st.mean(xs[-w:]) / st.mean(xs[:-w]):.2f}")
