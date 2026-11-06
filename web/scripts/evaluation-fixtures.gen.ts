// Freezes what the domain answers for the inputs the legacy UI tests used (tests/frontendEvaluations.test.ts,
// tests/frontendTrajectoryEvaluations.test.ts), so the web specs render real payloads without importing src/ (whose
// tsconfig differs). Regenerate after a domain change, from the repo root:
//   npx vite-node web/scripts/evaluation-fixtures.gen.ts > web/src/app/shared/evaluation-fixtures.ts
import { evaluateChanges, salience, type WhatChangedDeltas } from "../../src/domain/whatChanged.ts";
import { evaluateTrajectory, type TrajectoryInput } from "../../src/domain/trajectory.ts";
import { ADMITTED, withAdmitted } from "../../tests/fixtures/calibration.ts";

// ── Qué cambió (frontendEvaluations.test.ts) ──
const ctx = { userId: "u1", baselineAt: "2026-09-20T00:00:00.000Z", until: "2026-09-27T00:00:00.000Z" };
const clear = { diff: 40, lower: 10, upper: 60 }, wide = { diff: 40, lower: -16, upper: 72 };
type Over = { chess?: Partial<WhatChangedDeltas["chess"]>; languages?: Partial<WhatChangedDeltas["languages"]> };
const deltas = (o: Over = {}): WhatChangedDeltas => ({
  chess: { gamesCount: 20, decidedCount: 20, ratingDelta: 0, ratingGames: 20, baselineRating: 800, currentRating: 800, intervalWinRate: 50, intervalWhiteWinRate: 70, intervalBlackWinRate: 30, historicalWinRateDelta: null, colorDelta: clear, historicalDelta: null, ...o.chess },
  languages: { intervalDays: 7, observedDays: 1, partialDaysExcluded: 0, historicalObservedDays: 1, historicalSpanDays: null, historicalSpanStart: null, xpGained: 500, sessionsCount: 5, totalSessionMinutes: 60, baselineCourseId: "A", currentCourseId: "A", courseChanged: false, dailyXpRate: 100, historicalDailyXpRate: 50, ...o.languages },
  streak: { baselineStreak: 10, currentStreak: 12, streakDelta: 2, status: "active", streakStarted: false, streakMilestone: null },
});
const changes = (o: Over = {}, cal?: Parameters<typeof evaluateChanges>[2]) => { const { findings, evaluations } = evaluateChanges(deltas(o), ctx, cal); return { findings, evaluations }; };

const CHANGES = {
  base: changes(),
  decided9: changes({ chess: { decidedCount: 9 } }),
  wide: changes({ chess: { colorDelta: wide } }),
  histZero: changes({ languages: { historicalDailyXpRate: 0 } }),
  below: changes({ chess: { intervalWhiteWinRate: 52, intervalBlackWinRate: 48 } }),
  short: changes({ languages: { intervalDays: 2 } }),
  noRefRate: changes({ languages: { historicalDailyXpRate: 0, dailyXpRate: 15, xpGained: 1355 } }),
  refRate: changes({ languages: { historicalDailyXpRate: 50, dailyXpRate: 20, xpGained: 140, intervalDays: 7 } }),
  noRating: changes({ chess: { ratingDelta: null, currentRating: null } }),
  pace: changes({ languages: { dailyXpRate: 100, historicalDailyXpRate: 50 } }),
  eloDown40: changes({ chess: { ratingDelta: -40, ratingGames: 10, gamesCount: 30 } }),
  elo0: changes({ chess: { ratingDelta: 0 } }),
  up30UpBand: changes({ chess: { ratingDelta: 30, ratingGames: 10 } }, withAdmitted({ upper95: { 10: 74 } })),
  down30UpBand: changes({ chess: { ratingDelta: -30, ratingGames: 10 } }, withAdmitted({ upper95: { 10: 74 } })),
  down30DownBand: changes({ chess: { ratingDelta: -30, ratingGames: 10 } }, withAdmitted({ lower95: { 10: -62 } })),
  xpAdmitted: changes({}, ADMITTED),
  xp14Admitted: changes({ languages: { intervalDays: 14 } }, ADMITTED),
  retired: changes({ chess: { ratingDelta: 30 }, languages: { dailyXpRate: 70, historicalDailyXpRate: 50, xpGained: 100 } }),
  p8: changes({ chess: { intervalWhiteWinRate: 64.7, intervalBlackWinRate: 52.3 } }),
};

// The grid of shouldAgreeWithDomainSalienceForEveryEvaluationOverAGrid, deduplicated.
const seen = new Map<string, { e: unknown; salience: string }>();
for (const decidedCount of [0, 9, 40])
  for (const colorDelta of [null, clear, wide])
    for (const [w, b] of [[null, null], [70, 30], [55, 45]] as const)
      for (const [intervalDays, xpGained, hist] of [[7, 500, 50], [2, 500, 50], [7, 100, 50], [7, 500, 0]] as const)
        for (const e of evaluateChanges(deltas({ chess: { decidedCount, colorDelta, intervalWhiteWinRate: w, intervalBlackWinRate: b }, languages: { intervalDays, xpGained, historicalDailyXpRate: hist } }), ctx).evaluations)
          seen.set(JSON.stringify(e), { e, salience: salience(e) });

// ── Trayectoria (frontendTrajectoryEvaluations.test.ts) ──
const era = (ww: number, wd: number, bw: number, bd: number) => ({ whiteGames: wd, whiteDecided: wd, whiteWins: ww, blackGames: bd, blackDecided: bd, blackWins: bw });
const input = (o: Partial<TrajectoryInput["chess"]> = {}, lang = false): TrajectoryInput => ({
  chess: { startedAt: "2026-05-01T00:00:00.000Z", endedAt: "2026-09-01T00:00:00.000Z", totalGames: 160, activeDays: 75, ...era(60, 80, 40, 80), h1: era(30, 40, 20, 40), h2: era(30, 40, 20, 40), ...o },
  languages: lang
    ? { startedAt: "2026-01-01T00:00:00.000Z", endedAt: "2026-09-01T00:00:00.000Z", activeDays: 90, h1: { courses: [{ courseId: "DUOLINGO_XC_EN", xp: 5000 }] }, h2: { courses: [{ courseId: "DUOLINGO_XB_EN", xp: 5000 }, { courseId: "DUOLINGO_XC_EN", xp: 500 }] } }
    : { startedAt: null, endedAt: null, activeDays: 0, h1: { courses: [] }, h2: { courses: [] } },
});
const trajectory = (i: TrajectoryInput) => {
  const r = evaluateTrajectory(i);
  return { userId: "u", temporalSpan: { startedAt: i.chess.startedAt, endedAt: i.chess.endedAt, totalDays: 123 }, findings: r.findings, evaluations: r.evaluations };
};
const TRAJECTORY = {
  afirmado: trajectory(input()),
  indicio: trajectory(input({ activeDays: 59 })),
  persistence: trajectory(input({ h2: era(30, 40, 28, 40) })),
  short: trajectory(input({ endedAt: "2026-06-29T00:00:00.000Z" })),
  langShift: trajectory(input({ activeDays: 59 }, true)),
};

const out = (name: string, v: unknown) => `export const ${name} = ${JSON.stringify(v)};\n`;
/** The text of web/src/app/shared/evaluation-fixtures.ts (tests/webEvaluationFixtures.test.ts fails when the committed file drifts). */
export const render = () => "// GENERATED by web/scripts/evaluation-fixtures.gen.ts from src/domain: do not edit by hand. Spec data only.\n/* eslint-disable */\n"
  + out("CHANGES", CHANGES) + out("SALIENCE_GRID", [...seen.values()]) + out("TRAJECTORY", TRAJECTORY);
// vite-node leaves no trace of the script in argv: "run directly" means "not imported by vitest"
if (!process.env["VITEST"]) process.stdout.write(render());
