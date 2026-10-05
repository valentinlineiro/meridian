import { describe, it, expect } from "vitest";
import { setupTestDb } from "./helpers/testDb.ts";
import { createD1TrajectoryAdapter } from "../src/infrastructure/d1/d1TrajectoryAdapter.ts";
import { evaluateTrajectoryPatterns, type TrajectoryInput } from "../src/domain/trajectory.ts";

describe("trajectory result rule (adapter)", () => {
  it("shouldClassifyEraResultsWithSharedRuleWhenVariantsAndUnknownsPresent", async () => {
    const { db, d1 } = setupTestDb();
    const start = 1_700_000_000, end = start + 1000, mid = start + 500; // H1 = [start, mid), H2 = [mid, end]
    const put = (id: string, t: number | null, color: string | null, result: string | null, outcome: string | null = null) =>
      db.prepare("INSERT INTO matches (match_id, user_id, snapshot_id, raw_json, first_seen_at, last_seen_at, played_at, user_color, result, outcome) VALUES (?, 'u1', 's1', '{}', 'x', 'x', ?, ?, ?, ?)").run(id, t, color, result, outcome);

    // H1 white: win, victory, garbage | H1 black: defeat, unknown
    put("a", start, "white", "win"); put("b", start + 10, "white", "victory"); put("c", start + 20, "white", "garbage");
    put("d", start + 30, "black", "defeat"); put("e", start + 40, "black", null);
    // H2 white: outcome fallback win, stalemate | H2 black: loss, tie (at the very end)
    put("f", mid, "white", null, "won"); put("g", mid + 10, "white", "stalemate");
    put("h", mid + 20, "black", "loss"); put("i", end, "black", "tie");
    // outside the population: no timestamp, no colour
    put("x", null, "white", "win"); put("y", start + 50, null, "win");

    const c = await createD1TrajectoryAdapter(d1).getChessTrajectoryData("u1");
    expect(c).toMatchObject({
      whiteGames: 5, whiteDecided: 4, whiteWins: 3, blackGames: 4, blackDecided: 3, blackWins: 0,
      h1: { whiteGames: 3, whiteDecided: 2, whiteWins: 2, blackGames: 2, blackDecided: 1, blackWins: 0 },
      h2: { whiteGames: 2, whiteDecided: 2, whiteWins: 1, blackGames: 2, blackDecided: 2, blackWins: 0 },
    });
  });
});

// 40 games observed per colour per era; `n` of them decided, with `ww`/`bw` wins per era.
function input(n: number, ww: number, bw: number): TrajectoryInput {
  const era = { whiteGames: 40, whiteDecided: n, whiteWins: ww, blackGames: 40, blackDecided: n, blackWins: bw };
  return {
    chess: {
      startedAt: "2026-05-01T00:00:00.000Z", endedAt: "2026-09-01T00:00:00.000Z", totalGames: 160, activeDays: 75,
      whiteGames: 80, whiteDecided: 2 * n, whiteWins: 2 * ww, blackGames: 80, blackDecided: 2 * n, blackWins: 2 * bw,
      h1: { ...era }, h2: { ...era },
    },
    languages: { startedAt: null, endedAt: null, activeDays: 0, h1: { courses: [] }, h2: { courses: [] } },
  };
}
const asymmetry = (i: TrajectoryInput) => evaluateTrajectoryPatterns(i).find((f) => f.type === "CHESS_COLOR_ASYMMETRY_LONGITUDINAL");

describe("trajectory evidence gate", () => {
  it("shouldNotEmitColorAsymmetryWhenDecidedGamesPerColorBelowFortyDespiteEightyObserved", () => {
    // 19 decided per colour per era = 38 overall. Over observed games the gap would be 20 pp (47.5% vs 27.5%).
    expect(asymmetry(input(19, 19, 11))).toBeUndefined();
  });

  it("shouldEmitColorAsymmetryWhenFortyDecidedGamesPerColorEvenIfMoreAreUnknown", () => {
    // 20 decided per colour per era = 40 overall; over observed games the gap would be only 12.5 pp.
    const f = asymmetry(input(20, 15, 10));
    expect(f).toBeDefined();
    expect(f!.sample).toEqual({ gamesCount: 160, decidedCount: 80 });
    expect(f!.metrics).toMatchObject({ globalWhiteWinRate: 75, globalBlackWinRate: 50, globalWhiteDecided: 40, globalBlackDecided: 40 });
  });
});
