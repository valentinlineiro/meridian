## Measurement Framework

One person uses the register, once a day. An A/B test has no second group, so every comparison is this owner before against this owner after. A trailing 28-day window holds 28 trials: 22 logged days of 28 is 79 % with a 95 % interval of 60 to 90 %, so a shift smaller than about 15 points cannot be told from chance, and a change in habit, season or novelty is not separated from the redesign. The framework therefore reads direction and individual events, and claims no causal effect.

No new instrumentation is added. Every metric below comes from data the system already keeps: the append-only versions of each day in `snapshots`, and Workers logs (observability is on, head sampling 1.0 in `wrangler.jsonc`). Baselines were read from production on 2026-11-16 (read-only, 190 versions of 183 dates) and are stated under each metric.

### GSM chains

**G1. Logging today costs little effort, so the log stays complete.**
Signal: the owner logs on the days they play.
M1, logging completeness: days with at least one played game ÷ days elapsed, trailing 28 days. Source: latest version of each date. Baseline: 28 of 28 days logged (95 % interval 88 to 100 %); 183 of 184 days from 2026-05-17 to 2026-11-16, one day in September missing. The ceiling leaves no room to improve, so M1 detects decline only: fewer than 24 of 28 days is the signal, anything above is inconclusive at n=28. The 170 versions created on 2026-11-03 are a backfill, so the days before 2026-11-09 show how the owner tracked games elsewhere; 20 versions have been created since 2026-11-09, covering 13 dates.
Counter-metric: M6c below. Completeness is not a target (see Ethical measurement).

**G2. The value on screen is the value stored.**
Signal: nobody types a time that the system reads as a different one.
M2, ambiguous plain-digit scores: stored scores whose text has no colon and whose value is 100 seconds or more, per 28 days. After the mask ships, a sheet entry cannot produce one, so the expected count is zero except for seconds typed on purpose into the paste box. Each occurrence is reviewed by the owner against the day's average; the count is small enough to read one by one. Baseline: 0 of 872 stored scores. The 78 scores entered since 2026-11-09 are all written m:ss, so the history does not show the numeric-keypad problem. The stored data does not say whether an entry came from the sheet or the paste box.

**G3. A mistaken entry can be corrected and removed.**
Signal: corrections happen, and removal is used when an entry should not exist.
M3, corrections and removals: across consecutive versions of the same day, count (a) a game whose score changed, (b) a game present in one version and absent in the next (removal), (c) an average present then absent (clear). Per 28 days. Baseline: 0 score changes, 0 removals, 0 average clears and 0 average changes across 190 versions; 181 dates have one version, one date has 3 and one has 6, where games were added one per version. Over the 13 dates in the register era, 0 corrections puts the 95 % upper bound at about 3 of 13 dates (23 %).
Decision: zero removals and zero clears in 90 days means the brief's assumption that wrong entries need removal is not supported; reopen that assumption with `/strategize`, once.

**G4. A save does what it says.**
Signal: saves succeed, and rejected rows are the rare case.
M4, save reliability from Workers logs on `PUT /api/me/linkedin-games/day`: share of 5xx, share of 422. Expected: 5xx zero. With 30 saves and no 5xx, the 95 % upper bound on the true failure rate is about 10 % (rule of three). Every 5xx is investigated. A 422 means the sheet's own validation and the server's rules disagree, so each one is a bug to fix, not a user error to count.

**Guardrail. A save is not more expensive than today's.**
M5, D1 rows written per save, from D1 insights for the Worker's database (the method of the 2026-10-14 baseline [project memory]). Baseline (D1 insights, 7 days to 2026-11-16): a snapshot insert writes 6 rows. Today a day entered one game at a time appends one version per game: 36 rows for six games (the 6 versions on 2026-11-14). Threshold: the day save writes at most 6 rows per save. Reads: one query for the games versions reads 1,797 rows, the whole `snapshots` table, because no index serves `source`; a save does one such read and its refresh two more.

**Owner-reported experience.**
M6, three questions asked at week 2 and week 6 [no instrument exists; the owner answers in conversation]:
a. Did you lose times you had typed?
b. Did you need to remove or correct an entry, and could you?
c. Did you log because you wanted to, or because of the streak?
Answer (c) is the counter-metric to M1. If completeness rises while (c) moves toward the streak, the streak line is working as pressure and comes off the screen.

### Ethical measurement

Completeness would also rise from reminders, streak-loss copy or a prompt every evening. None exists in the design, and none is added to move M1. The streak line stays informational. Any improvement in M1 is checked against M6c before it is reported as a success.

### Checks that need no data

- Taps from Hoy to the first typed character: 1 (3 before). Verified once on a real phone after the deploy.
- Typing "106" in a time field shows "1:06"; pasting "106" and "1:06" and dictating "uno cero seis" each leave "1:06".
- A save of the same sheet twice returns `same` for every game and adds no version.

## Metrics Dashboard Specification

No dashboard. A script in `scripts/` prints one markdown report of M1 to M5 from production when the owner runs it, since the project has no scheduler. Audience: the owner, at the checkpoints below. Alerts: none automatic; the checkpoints are the reminder.

| Metric | Shown as | Decision it informs |
|---|---|---|
| M1 | Fraction with the interval, beside the baseline | Whether logging got harder (drop beyond 15 points) |
| M2 | Count, with each entry listed | Whether the mask or the paste box produces wrong values |
| M3 | Counts of (a), (b), (c) | Whether removal is used |
| M4 | 5xx and 422 shares with the number of saves | Whether the save path has a defect |
| M5 | Rows written per save | Whether the save is as cheap as promised |

## Learning Plan

| When | Look at | Declare |
|---|---|---|
| Taken 2026-11-16 | Baselines for M1, M2, M3, M5 (stated above) | The comparison exists |
| Day 1 | The first saves in Workers logs (M4), rows written for the first save (M5), the three no-data checks | Ship holds, or fix |
| Week 1 | Each save read by hand; M2 listing | A wrong stored value found, or none |
| Week 2 | M6 (a) to (c) | The sheet loses nothing, or a specific loss to fix |
| Day 28 | M1 against baseline with its interval, M2, M3, M4, M5 | Logging no harder, or reopen |
| Day 90 | M3 totals | Removal is used, or the assumption is dropped |
