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


# Deriva observada por partida: se retira de los incrementos antes de usarlos como nulo SIN invertir signos, para que la asimetría de la
# distribución no se confunda con tendencia. (Invertir signos ya anula la deriva por construcción.)
drift = sum(r[2] for r in dense) / sum(r[1] for r in dense)
centered = [(r[0], r[1], r[2] - drift * r[1]) for r in dense]
print(f"  deriva observada: {drift:+.2f} puntos por partida ({sum(r[2] for r in dense):+d} en {sum(r[1] for r in dense)} partidas); se retira en las variantes sin signos invertidos")


def null_window(k, B=20000, blocks=1, flip=False):
    """Δ/√k bajo 'sin deriva' con EXACTAMENTE k partidas: se concatenan intervalos (o bloques de `blocks` intervalos consecutivos, en orden)
    sin pasar de k. Los intervalos más largos que lo que falta se descartan; los de 1 partida siempre caben.
    flip=True: signo aleatorio por bloque (impone simetría). flip=False: residuos sin deriva, con su asimetría."""
    src = dense if flip else centered
    out = []
    for _ in range(B):
        g = d = 0
        tries = 0
        while g < k:
            tries += 1
            if tries > 10000:  # sin progreso: ningún bloque cabe en lo que falta
                raise RuntimeError(f"null_window: no se alcanza k={k} (g={g}, blocks={blocks}); ¿hay intervalos de 1 partida?")
            i = random.randrange(len(src) - blocks + 1); seg = src[i:i + blocks]
            sg = random.choice((-1, 1)) if flip else 1
            for r in seg:
                if g + r[1] > k: break
                g += r[1]; d += sg * r[2]
        out.append(d / math.sqrt(g))
    return out
VARIANTS = (("A signos, iid", dict(flip=True)), ("B sin signos, iid", dict()), ("C sin signos, bloques de 3 (nulo de referencia)", dict(blocks=3)), ("D signos, bloques de 3", dict(flip=True, blocks=3)))
print("  nulo con k exacto; Δ al 95 % / 99 % bilateral por cola. El de referencia es C: residuos sin deriva, sin invertir signos, bloques consecutivos")
VAR = {}
for k in (5, 10, 15, 20):
    for name, kw in VARIANTS:
        n = null_window(k, **kw)
        lo, hi, elo, ehi = (pct(n, p) * math.sqrt(k) for p in (.025, .975, .005, .995))
        VAR[k, name[0]] = (hi, ehi, lo, elo)  # superior 95, superior 99, inferior 95, inferior 99
        print(f"  k={k:>2} {name:<48} 95 % [{lo:+.0f}, {hi:+.0f}]  99 % [{elo:+.0f}, {ehi:+.0f}]")


LEVELS = (.975, .995, .025, .005)  # superior 95 %, superior 99 %, inferior 95 %, inferior 99 %


def band_ci(k, B=400):
    """Incertidumbre de los 4 bordes de la referencia C (semiancho relativo del IC95): cada réplica rehace TODA la banda (deriva incluida) sobre una serie de
    intervalos remuestreada por bloques; los cuatro bordes salen de las mismas réplicas."""
    global dense, centered
    base, bc, edges = dense, centered, [[] for _ in LEVELS]
    for _ in range(B):
        dense = block_resample(base, 3)
        dr = sum(r[2] for r in dense) / sum(r[1] for r in dense)
        centered = [(r[0], r[1], r[2] - dr * r[1]) for r in dense]
        n = null_window(k, B=2000, blocks=3)
        for j, lv in enumerate(LEVELS): edges[j].append(pct(n, lv) * math.sqrt(k))
    dense, centered = base, bc
    n = null_window(k, blocks=3)
    return [(pct(n, lv) * math.sqrt(k), (pct(e, .975) - pct(e, .025)) / 2 / abs(pct(n, lv) * math.sqrt(k))) for lv, e in zip(LEVELS, edges)]
print("  incertidumbre de los bordes de la referencia C (bootstrap de bloques de 3 sobre el origen, 400 réplicas), semiancho relativo del IC95")
OC = {}
for k in (5, 10, 15, 20):
    o = OC[k] = band_ci(k)
    print(f"  k={k:>2}: 95 % sup {o[0][0]:+.0f} ±{o[0][1]:.1%}  inf {o[2][0]:+.0f} ±{o[2][1]:.1%} | 99 % sup {o[1][0]:+.0f} ±{o[1][1]:.1%}  inf {o[3][0]:+.0f} ±{o[3][1]:.1%}")
print("  sensibilidad entre nulos A-D (rango / media del borde) y admisión (incertidumbre ≤ 20 % y sensibilidad ≤ 20 % en k-5, k y k+5)")
NAMES = ("95 % sup", "99 % sup", "95 % inf", "99 % inf")
OK = {}
for j, nm in enumerate(NAMES):
    row = []
    for k in (5, 10, 15, 20):
        v = [VAR[k, c][j] for c in "ABCD"]; sens = (max(v) - min(v)) / abs(st.mean(v))
        OK[j, k] = OC[k][j][1] <= .20 and sens <= .20
        row.append(f"k={k}: inc {OC[k][j][1]:.1%} sens {sens:.1%} {'✓' if OK[j, k] else '✗'}")
    adm = [k for k in (10, 15) if OK[j, k - 5] and OK[j, k] and OK[j, k + 5]]
    print(f"  {nm}: " + " | ".join(row) + f"  → admitido: {adm if adm else 'ninguno'}")

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
def make_blocks(L): return [xs[i:i + L] for i in range(0, len(xs) - L + 1, L)]
blocks = make_blocks(7)


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


base_blocks = blocks
print("  sensibilidad al tamaño de bloque: cuantiles 95 % / 99 % del nulo (h=100) con bloques de 3, 7, 14 días (nº de bloques de la serie: " + ", ".join(f"{L}d→{len(make_blocks(L))}" for L in (3, 7, 14)) + ")")
for w in (7, 14, 28):
    cells = []
    for L in (3, 7, 14, 21, 28):
        blocks = make_blocks(L); n = null_ratio(w, 100); cells.append(f"{L:>2}d: {pct(n, .95):.2f} / {pct(n, .99):.2f}")
    blocks = base_blocks
    print(f"  w={w:>2}d  " + "   ".join(cells))


def xp_band_ci(w, q, L, B=150):
    """Semiancho relativo del IC95 de un cuantil del nulo con bloques de L días, cuando la serie de origen se remuestrea por bloques de L días."""
    global blocks
    base, vals = make_blocks(L), []
    for _ in range(B):
        blocks = [random.choice(base) for _ in base]
        vals.append(pct(null_ratio(w, 100, B=1500), q))
    blocks = base
    ref = pct(null_ratio(w, 100), q)
    blocks = base_blocks
    return ref, (pct(vals, .975) - pct(vals, .025)) / 2 / ref
print("  incertidumbre del cuantil: la serie de origen se remuestrea por bloques del mismo tamaño que el nulo; semiancho relativo del IC95")
for w in (7, 14, 28):
    cells = []
    for L in (7, 14, 21, 28):
        r95, h95 = xp_band_ci(w, .95, L); r99, h99 = xp_band_ci(w, .99, L)
        cells.append(f"{L:>2}d: 95 % {r95:.2f} ±{h95:.0%}  99 % {r99:.2f} ±{h99:.0%}")
    print(f"  w={w:>2}d  " + "   ".join(cells))

def sim_series(L):
    sb = make_blocks(L); out = []
    while len(out) < len(xs): out += random.choice(sb)
    return out[:len(xs)]
def acf_of(v, l):
    mv = st.mean(v); return sum((v[i] - mv) * (v[i + l] - mv) for i in range(len(v) - l)) / sum((x - mv) ** 2 for x in v)
print("  ¿el remuestreo conserva la dependencia? autocorrelación media de las series remuestreadas frente a la observada")
LAGS = (1, 3, 7, 14, 21, 28)
print("  observada      " + "  ".join(f"l{l}:{acf_of(xs, l):+.2f}" for l in LAGS))
for L in (3, 7, 14, 21, 28):
    sims = [sim_series(L) for _ in range(1500)]
    print(f"  bloques de {L:>2} d " + "  ".join(f"l{l}:{st.mean(acf_of(v, l) for v in sims):+.2f}" for l in LAGS))
acf = lambda l: sum((xs[i] - m) * (xs[i + l] - m) for i in range(len(xs) - l)) / den
print("  autocorrelación del XP diario a lag " + ", ".join(f"{l}: {acf(l):+.2f}" for l in (1, 3, 7, 14, 21, 28)) + f"  (error típico ≈ {1 / len(xs) ** .5:.2f}): la dependencia no se agota a los 7 días")
print("  referencia: ventanas reales históricas con ≥ 28 días previos, % con cociente ≥ 1,3 (incluye deriva real)")
for w in (3, 7, 14, 28):
    r = [st.mean(xs[i:i + w]) / st.mean(xs[:i]) for i in range(28, len(xs) - w + 1)]
    print(f"  w={w:>2}d n={len(r)} ≥1,3: {sum(v >= 1.3 for v in r) / len(r):.0%}")
print("  estado actual (últimos w días frente a los anteriores)")
for w in (7, 14, 28):
    print(f"  w={w:>2}d: cociente={st.mean(xs[-w:]) / st.mean(xs[:-w]):.2f}")
