"""Phase 3, absence patterns: SYNTHETIC data with days that were not recorded (no production data).
The main simulation (sim.py) only has complete weeks. Here the weeks have gaps and the null `J` is the one the methodology proposes:
A permutes the values among the days RECORDED in each week (the mask stays where it is); B permutes whole weeks only among weeks with the
IDENTICAL mask of recorded days (a week with a unique mask stays where it is). Statistics skip unrecorded days (weekday: only days with at
least 8 results compete; regularity: each 56-day window needs at least 20 results, otherwise the dimension is not evaluable: statistic 0).

Run: python3 sim_absence.py [datasets_per_scenario=2000] [replicates=1000] [alpha=0.05] [entropy=20261111]   (numpy only; 4 processes)
"""
import sys, json, warnings
from multiprocessing import Pool
import numpy as np
from sim import N_WEEKS, DIMS, wilson, world as complete_world

MIN_CELL, MIN_WINDOW = 8, 20
warnings.simplefilter("ignore", RuntimeWarning)


def stats(x):
    R, n, _ = x.shape
    loss = np.where(np.isnan(x), np.nan, (x < 1).astype(float))
    rate = np.where((~np.isnan(x)).sum(axis=1) >= MIN_CELL, np.nanmean(loss, axis=1), np.nan)               # (R, 7)
    wk = np.nan_to_num(np.nanmax(np.abs(rate - np.nanmean(loss, axis=(1, 2))[:, None]), axis=1), nan=0.0)
    flat = x.reshape(R, n * 7)
    def spread(a):
        s = np.log(np.nanpercentile(a, 75, axis=1) / np.nanpercentile(a, 25, axis=1))
        return np.where((~np.isnan(a)).sum(axis=1) >= MIN_WINDOW, s, np.nan)
    reg = np.nan_to_num(np.abs(spread(flat[:, -56:]) - spread(flat[:, -112:-56])), nan=0.0)
    return np.stack([wk, reg], axis=1)


def joint_null(x, R, rng):
    n = x.shape[0]
    miss = np.isnan(x)                                                         # (n, 7): the mask never moves
    pos = np.argsort(miss, axis=1, kind="stable")                              # recorded positions first, in increasing order
    key = np.where(miss[None], np.inf, rng.random((R, n, 7)))
    order = np.argsort(key, axis=2)                                            # recorded values in random order, unrecorded last
    vals = np.take_along_axis(np.broadcast_to(x, (R, n, 7)), order, axis=2)
    rep = np.full((R, n, 7), np.nan)
    np.put_along_axis(rep, np.broadcast_to(pos, (R, n, 7)), vals, axis=2)      # A: values among the recorded days of each week
    groups = {}
    for t in range(n): groups.setdefault(miss[t].tobytes(), []).append(t)
    for idx in groups.values():                                                # B: weeks only among weeks with the identical mask
        if len(idx) > 1:
            idx = np.array(idx)
            perm = np.argsort(rng.random((R, len(idx))), axis=1)
            rep[:, idx, :] = np.take_along_axis(rep[:, idx, :], perm[:, :, None], axis=1)
    return rep


def procedure(x, R, rng, alpha):
    pool = np.vstack([stats(x[None]), stats(joint_null(x, R, rng))])
    p = np.stack([(R + 1 - np.searchsorted(np.sort(pool[:, k]), pool[:, k], side="left")) / (R + 1) for k in range(pool.shape[1])], axis=1)
    U = p.min(axis=1)
    return (U <= U[0]).sum() <= alpha * (R + 1), int(p[0].argmin())


def mask(rng, kind, x):
    miss = np.zeros(x.shape, bool)
    if kind == "mcar":      miss = rng.random(x.shape) < 0.15                                           # at random, 15 %
    elif kind == "weekend": miss = rng.random(x.shape) > np.array([.95] * 5 + [.55] * 2)[None, :]     # habit: weekends often not logged
    elif kind == "informative": miss = rng.random(x.shape) < np.where(x < 1, 0.40, 0.05)              # a loss is often not logged
    elif kind == "dropoff":
        miss = rng.random(x.shape) < np.where(np.arange(N_WEEKS) >= N_WEEKS - 8, 0.40, 0.05)[:, None]  # logging fades in the last 8 weeks
    return np.where(miss, np.nan, x)


WD = np.linspace(-0.3, 0.3, 7)
# name -> (generator parameters, missingness, null dimensions, dimensions with a planted effect)
SCENARIOS = {
    "C0 complete weeks, pure noise (control)":              (dict(), None, {0, 1}, set()),
    "M1 missing at random (15 %), pure noise":              (dict(), "mcar", {0, 1}, set()),
    "M1 + weekday association (range 0.6)":                 (dict(wd=WD), "mcar", {1}, {0}),
    "M1 + planted: noise 0.5 -> 0.8 in the last 8 weeks":   (dict(sd_late=0.8), "mcar", {0}, {1}),
    "M2 weekends often not logged, pure noise":             (dict(), "weekend", {0, 1}, set()),
    "M2 + weekday association (range 0.6)":                 (dict(wd=WD), "weekend", {1}, {0}),
    "M3 losses often not logged (informative), pure noise": (dict(), "informative", {0, 1}, set()),
    "M4 logging fades in the last 8 weeks, pure noise":     (dict(), "dropoff", {0, 1}, set()),
}


def run(args):
    name, datasets, R, alpha, seed = args
    kw, kind, null_dims, true_dims = SCENARIOS[name]
    data_rng, cal_rng = (np.random.default_rng(s) for s in seed.spawn(2))
    false = power = any_ = masks = 0
    for _ in range(datasets):
        x = complete_world(data_rng, **kw)
        if kind: x = mask(data_rng, kind, x)
        masks += len({r.tobytes() for r in np.isnan(x)})
        f, k = procedure(x, R, cal_rng, alpha)
        any_ += f; false += f and k in null_dims; power += f and k in true_dims
    row = {"any": [any_ / datasets, wilson(any_, datasets)], "false_in_null_dimension": [false / datasets, wilson(false, datasets)], "distinct_masks_per_dataset": round(masks / datasets, 1)}
    if true_dims: row["power"] = [power / datasets, wilson(power, datasets)]
    return name, row


def main(datasets, R, alpha, entropy):
    seeds = np.random.SeedSequence(entropy).spawn(len(SCENARIOS))
    with Pool(4) as pool:
        out = dict(pool.map(run, [(n, datasets, R, alpha, s) for n, s in zip(SCENARIOS, seeds)]))
    for n, r in out.items():
        print(f"{n:55s} masks={r['distinct_masks_per_dataset']:5.1f} any={r['any'][0]:.3f} false={r['false_in_null_dimension'][0]:.3f} {r['false_in_null_dimension'][1]}" + (f" power={r['power'][0]:.3f} {r['power'][1]}" if "power" in r else ""))
    json.dump({"datasets_per_scenario": datasets, "replicates": R, "alpha": alpha, "entropy": entropy, "weeks": N_WEEKS, "results": out}, open(f"results_absence_a{alpha}.json", "w"), indent=1)


if __name__ == "__main__":
    a = sys.argv
    main(int(a[1]) if len(a) > 1 else 2000, int(a[2]) if len(a) > 2 else 1000, float(a[3]) if len(a) > 3 else 0.05, int(a[4]) if len(a) > 4 else 20261111)
