"""Phase 3 methodology check on SYNTHETIC data only (no production data).
Does the whole procedure (joint null J = A then B, single-step max-T over the competing dimensions, exact permutation p-value) keep its
level when it should, how often does it find a planted effect, and what happens when the pre-registered correction alpha = 0.025 is used?
See docs/superpowers/specs/2026-11-11-games-report-phase3-methodology.md section 3 and 4.

Run: python3 sim.py [datasets_per_world=5000] [replicates=1000] [alpha=0.05] [entropy=20261111]
     (numpy only; 4 worker processes; writes results_a<alpha>.json). A different `entropy` is a fresh, independent seed stream.
"""
import sys, json
from multiprocessing import Pool
import numpy as np

N_WEEKS = 24  # 168 days (the longest real game has 177); divisible by the block lengths tried in the exploration
DIMS = ["weekday", "regularity"]  # the dimensions that compete (trend left out: see the methodology section 3.6)


def stats(x):
    """x: (R, weeks, 7) efficiencies, Monday first. Returns (R, 2): |statistic| per dimension."""
    R, n, _ = x.shape
    loss = (x < 1).astype(float)
    wk = np.abs(loss.mean(axis=1) - loss.mean(axis=(1, 2))[:, None]).max(axis=1)      # max over the 7 weekdays of |rate_day - overall|
    flat = x.reshape(R, n * 7)
    spread = lambda a: np.log(np.percentile(a, 75, axis=1) / np.percentile(a, 25, axis=1))
    reg = np.abs(spread(flat[:, -56:]) - spread(flat[:, -112:-56]))                    # change of log(P75/P25): last 56 days vs the 56 before
    return np.stack([wk, reg], axis=1)


def joint_null(x, R, rng):
    """J = A then B (they commute): A permutes the values among the days of each week; B permutes whole weeks."""
    n = x.shape[0]
    rep = np.broadcast_to(x, (R, n, 7))
    rep = np.take_along_axis(rep, np.argsort(rng.random((R, n, 7)), axis=2), axis=2)                   # A
    return np.take_along_axis(rep, np.argsort(rng.random((R, n)), axis=1)[:, :, None], axis=1)         # B


def procedure(x, R, rng, alpha):
    """Exact finite-sample test. Pool = the data plus R joint replicates (exchangeable under the null). p_k(i) = share of the pool at least as
    extreme in dimension k; U(i) = min_k p_k(i); adjusted p = share of the pool with U <= U(data). Reject iff adjusted p <= alpha, i.e. the
    data are among the floor(alpha (R+1)) smallest U of the pool: an order statistic, no interpolation. Returns (flag, dimension of smallest p)."""
    pool = np.vstack([stats(x[None]), stats(joint_null(x, R, rng))])                 # row 0 = the data
    p = np.stack([(R + 1 - np.searchsorted(np.sort(pool[:, k]), pool[:, k], side="left")) / (R + 1) for k in range(pool.shape[1])], axis=1)
    U = p.min(axis=1)
    return (U <= U[0]).sum() <= alpha * (R + 1), int(p[0].argmin())


def world(rng, wd=None, sd_w=0.0, rho=0.0, sd_e=0.5, m=0.45, sd_late=None):
    wd = np.zeros(7) if wd is None else np.asarray(wd)
    w = np.zeros(N_WEEKS)
    for t in range(N_WEEKS):
        w[t] = (rho * w[t - 1] if t else 0) + (rng.normal(0, sd_w * np.sqrt(1 - rho ** 2)) if sd_w else 0)
    noise = rng.normal(0, 1, (N_WEEKS, 7)) * np.where(np.arange(N_WEEKS) >= N_WEEKS - 8, sd_late or sd_e, sd_e)[:, None]
    return np.exp(m + wd[None, :] + w[:, None] + noise)


# name -> (generator parameters, dimensions whose truth is NULL, dimensions with a planted effect)
WORLDS = {
    "W0 pure noise (global null)":                        (dict(), {0, 1}, set()),
    "W1 weekday association only (range 0.6)":            (dict(wd=np.linspace(-0.3, 0.3, 7)), {1}, {0}),
    "W2 autocorrelated weeks (sd .25, rho .6)":           (dict(sd_w=0.25, rho=0.6), {0, 1}, set()),
    "W3 weekday association + autocorrelated weeks":      (dict(wd=np.linspace(-0.3, 0.3, 7), sd_w=0.25, rho=0.6), {1}, {0}),
    "W4 planted: Tuesday -0.5":                           (dict(wd=[0, -0.5, 0, 0, 0, 0, 0]), {1}, {0}),
    "W6 planted: noise 0.5 -> 0.8 in the last 8 weeks":   (dict(sd_late=0.8), {0}, {1}),
    "W7 stress: strongly autocorrelated weeks (sd .4, rho .9)": (dict(sd_w=0.4, rho=0.9), {0, 1}, set()),
}


def wilson(k, n, z=1.96):
    p = k / n
    d = 1 + z * z / n
    c = (p + z * z / (2 * n)) / d
    h = z * np.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return [round(max(0.0, float(c - h)), 4), round(min(1.0, float(c + h)), 4)]


def run_world(args):
    name, datasets, R, alpha, seed = args
    kw, null_dims, true_dims = WORLDS[name]
    data_rng, cal_rng = (np.random.default_rng(s) for s in seed.spawn(2))     # two independent streams: datasets and permutation replicates
    false = power = any_ = 0
    for _ in range(datasets):
        f, k = procedure(world(data_rng, **kw), R, cal_rng, alpha)
        any_ += f
        false += f and k in null_dims
        power += f and k in true_dims
    row = {"any": [any_ / datasets, wilson(any_, datasets)], "false_in_null_dimension": [false / datasets, wilson(false, datasets)]}
    if true_dims: row["power"] = [power / datasets, wilson(power, datasets)]
    return name, row


def main(datasets, R, alpha, entropy):
    seeds = np.random.SeedSequence(entropy).spawn(len(WORLDS))
    with Pool(4) as pool:
        out = dict(pool.map(run_world, [(n, datasets, R, alpha, s) for n, s in zip(WORLDS, seeds)]))
    for n, r in out.items():
        print(f"{n:58s} any={r['any'][0]:.3f} {r['any'][1]}  false={r['false_in_null_dimension'][0]:.3f} {r['false_in_null_dimension'][1]}" + (f"  power={r['power'][0]:.3f} {r['power'][1]}" if 'power' in r else ""))
    json.dump({"datasets_per_world": datasets, "replicates": R, "alpha": alpha, "entropy": entropy, "weeks": N_WEEKS, "dimensions": DIMS, "results": out},
              open(f"results_a{alpha}.json", "w"), indent=1)


if __name__ == "__main__":
    a = sys.argv
    main(int(a[1]) if len(a) > 1 else 5000, int(a[2]) if len(a) > 2 else 1000, float(a[3]) if len(a) > 3 else 0.05, int(a[4]) if len(a) > 4 else 20261111)
