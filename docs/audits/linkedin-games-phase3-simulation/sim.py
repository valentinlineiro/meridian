"""Phase 3 methodology check on SYNTHETIC data only (no production data).
Question: does the whole procedure (joint null J = A then B, max-p over three dimensions) keep its 5 % when it should, and
how often does it find a planted effect? See docs/superpowers/specs/2026-11-11-games-report-phase3-methodology.md §3-§4.
Run: python3 sim.py [datasets_per_world] [replicates] [3]   (numpy only; the optional 3 adds the trend dimension; ~1.5 min for 1000 1000)
"""
import sys, json
import numpy as np

N_WEEKS, R_DEFAULT, DATASETS_DEFAULT, ALPHA = 24, 600, 300, 0.05  # 24 weeks (168 days): divisible by the block lengths tried; the real longest game has 25  # 25 weeks = 175 days, like the longest real game (177)
DIMS = ["weekday", "regularity", "trend"]


def stats(x):
    """x: (R, weeks, 7) efficiencies, Monday first. Returns (R, 3): |statistic| per dimension, plus the signed values of the last two."""
    R, n, _ = x.shape
    loss = (x < 1).astype(float)
    rate = loss.mean(axis=1)                                              # (R, 7)
    wk = np.abs(rate - loss.mean(axis=(1, 2))[:, None]).max(axis=1)       # concrete weekday = argmax
    flat = x.reshape(R, n * 7)
    spread = lambda a: np.log(np.percentile(a, 75, axis=1) / np.percentile(a, 25, axis=1))
    reg = spread(flat[:, -56:]) - spread(flat[:, -112:-56])
    med = np.median(np.log(x[:, -16:, :]), axis=2)                         # 16 weekly medians = the 112-day window
    i, j = np.triu_indices(16, 1)
    trend = np.median((med[:, j] - med[:, i]) / (j - i), axis=1)           # Theil-Sen
    return np.stack([wk, np.abs(reg), np.abs(trend)], axis=1)


BLOCK = 1  # weeks per block in generator B (1 = individual weeks)


def joint_null(x, R, rng, block=None):
    """J = A then B (they commute): A permutes the values among the 7 weekdays inside each week; B permutes blocks of `block` consecutive weeks."""
    L = block or BLOCK
    n = x.shape[0]
    rep = np.broadcast_to(x, (R, n, 7))
    rep = np.take_along_axis(rep, np.argsort(rng.random((R, n, 7)), axis=2), axis=2)   # A
    rep = rep.reshape(R, n // L, L, 7)
    rep = np.take_along_axis(rep, np.argsort(rng.random((R, n // L)), axis=1)[:, :, None, None], axis=1)  # B
    return rep.reshape(R, n, 7)


def procedure(x, R, rng, block=None, use=(0, 1, 2)):
    """Returns (flagged, dimension of the smallest p). One shared set of joint replicates: no independence assumption between dimensions."""
    u = list(use)                                                          # the dimensions that compete
    obs = stats(x[None])[0][u]
    rep = stats(joint_null(x, R, rng, block))[:, u]                        # (R, dims)
    p_obs = ((rep >= obs).sum(axis=0) + 1) / (R + 1)
    p_rep = np.stack([(rep[:, k][None, :] >= rep[:, k][:, None]).mean(axis=1) for k in range(len(u))], axis=1)  # each replicate against the others
    thr = np.quantile(p_rep.min(axis=1), ALPHA)                           # family threshold: P5 of min-p == P95 of U
    return p_obs.min() <= thr, u[int(p_obs.argmin())]


def world(rng, wd=None, sd_w=0.0, rho=0.0, slope=0.0, sd_e=0.5, m=0.45, sd_late=None):
    wd = np.zeros(7) if wd is None else np.asarray(wd)
    w = np.zeros(N_WEEKS)
    for t in range(N_WEEKS):
        w[t] = (rho * w[t - 1] if t else 0) + rng.normal(0, sd_w * np.sqrt(1 - rho ** 2) if sd_w else 0)
    z = m + wd[None, :] + w[:, None] + slope * np.arange(N_WEEKS)[:, None] + rng.normal(0, 1, (N_WEEKS, 7)) * np.where(np.arange(N_WEEKS) >= N_WEEKS - 8, sd_late or sd_e, sd_e)[:, None]
    return np.exp(z)


WORLDS = {
    "W0 global null: iid noise":                       dict(),
    "W1 weekday association only (span 0.6)":          dict(wd=np.linspace(-0.3, 0.3, 7)),
    "W2 autocorrelated weeks only (sd .25, rho .6)":   dict(sd_w=0.25, rho=0.6),
    "W3 weekday + autocorrelated weeks":               dict(wd=np.linspace(-0.3, 0.3, 7), sd_w=0.25, rho=0.6),
    "W4 planted: one weekday (Tue) -0.5":              dict(wd=[0, -0.5, 0, 0, 0, 0, 0]),
    "W5 planted: trend +0.02 log/week":                dict(slope=0.02),
    "W6 planted: noise 0.5 -> 0.8 in the last 8 weeks": dict(sd_late=0.8),
}


def main(datasets, R, use):
    """For every synthetic dataset the WHOLE procedure runs (own joint replicates, own threshold). A finding counts as FALSE when it is
    attributed to a dimension whose truth is null in that world (W0/W2: both; W1/W3: regularity; W4: regularity; W6: weekday)."""
    data_rng = np.random.default_rng(20261111)       # stream 1: the synthetic datasets
    cal_rng = np.random.default_rng(777)             # stream 2: the permutation replicates (independent of stream 1)
    out = {}
    for name, kw in WORLDS.items():
        flags = np.zeros(3, int)
        for _ in range(datasets):
            f, k = procedure(world(data_rng, **kw), R, cal_rng, 1, use)
            if f: flags[k] += 1
        out[name] = {"any": flags.sum() / datasets, **{d: flags[i] / datasets for i, d in enumerate(DIMS)}}
        print(f"{name:52s} any={out[name]['any']:.3f}  " + "  ".join(f"{d}={out[name][d]:.3f}" for d in DIMS), flush=True)
    json.dump({"datasets": datasets, "replicates": R, "alpha": ALPHA, "weeks": N_WEEKS, "dimensions": [DIMS[i] for i in use], "block_weeks": 1, "results": out}, open(f"results_{len(use)}dim.json", "w"), indent=1)


if __name__ == "__main__":
    a = sys.argv
    main(int(a[1]) if len(a) > 1 else DATASETS_DEFAULT, int(a[2]) if len(a) > 2 else R_DEFAULT, (0, 1, 2) if len(a) > 3 and a[3] == "3" else (0, 1))
