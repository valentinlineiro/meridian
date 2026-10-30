import { describe, it, expect, beforeEach } from "vitest";
import { handleStats, handleMatches } from "../src/api/stats.ts";
import { handleMatchGame } from "../src/api/game.ts";
import { createSqliteD1 } from "./helpers/sqliteD1.ts";

const MIGRATIONS = ["0001_init.sql", "0004_users.sql", "0005_played_at.sql", "0006_match_details.sql", "0007_openings_and_phases.sql", "0017_opening_family_mate_type.sql", "0018_mate_threats.sql"];
const ok = (n: number, m: number, u: number, phase: "opening" | "middlegame" | "endgame" = "opening", missedPlies: number[] = []) => JSON.stringify({
  v: 1, status: "ok", faced: n + m + u, neutralized: n, missed: m, unpunished: u,
  byPhase: { opening: phase === "opening" ? [n, m, u] : [0, 0, 0], middlegame: phase === "middlegame" ? [n, m, u] : [0, 0, 0], endgame: phase === "endgame" ? [n, m, u] : [0, 0, 0] }, missedPlies,
});
const INVALID = JSON.stringify({ v: 1, status: "invalid", reason: "illegal_game" });

describe("mate threat reads", () => {
  let db: any;
  let d1: D1Database;
  let at = 0;
  const game = (id: string, threats: string | null, over: { userId?: string; color?: string; moves?: string } = {}) => {
    db.prepare("INSERT INTO matches (match_id, user_id, snapshot_id, first_seen_at, last_seen_at, raw_json, played_at, result, user_color, opponent_name) VALUES (?, ?, 's', 'd', 'd', '{}', ?, 'loss', ?, 'Rival')").run(id, over.userId ?? "u1", ++at, over.color ?? "black");
    db.prepare("INSERT INTO match_details (match_id, user_id, status, move_history, move_timestamps, ply_count, end_condition, mate_threats) VALUES (?, ?, 'c', ?, '[]', 5, 'checkmate', ?)").run(id, over.userId ?? "u1", over.moves ?? '["e2e4","e7e5","g1f3","b8c6","f1c4"]', threats);
  };
  const stats = async (qs = "") => (await handleStats(d1, "threats", new URL(`http://x/api/stats/threats${qs}`))).json() as Promise<any>;

  beforeEach(() => { const s = createSqliteD1(MIGRATIONS); db = s.db; d1 = s.d1; at = 0; });

  it("shouldAggregateTotalsAndPhasesOverOkResultsOnly", async () => {
    game("a", ok(2, 1, 1, "opening", [2]));
    game("b", ok(3, 0, 0, "middlegame"));
    game("c", INVALID);
    const s = await stats();
    expect(s.analysed).toBe(2);
    expect(s.totals).toEqual({ faced: 7, neutralized: 5, missed: 1, unpunished: 1, rate: 5 / 7 });
    expect(s.byPhase.opening).toEqual({ faced: 4, neutralized: 2, missed: 1, unpunished: 1, rate: 0.5 });
    expect(s.byPhase.middlegame).toEqual({ faced: 3, neutralized: 3, missed: 0, unpunished: 0, rate: 1 });
    expect(s.byPhase.endgame).toEqual({ faced: 0, neutralized: 0, missed: 0, unpunished: 0, rate: null });
    expect(s.gamesWithMissed).toBe(1);
  });

  it("shouldCountPendingInvalidAndUnknownVersionAside", async () => {
    game("ok", ok(1, 0, 0));
    game("pending", null);
    game("invalid", INVALID);
    game("future", JSON.stringify({ v: 2, status: "ok" }));
    game("broken", "{not json");
    game("contradiction", JSON.stringify({ v: 1, status: "ok", faced: 9, neutralized: 0, missed: 0, unpunished: 0, byPhase: { opening: [0, 0, 0], middlegame: [0, 0, 0], endgame: [0, 0, 0] }, missedPlies: [] }));
    const s = await stats();
    expect(s).toMatchObject({ analysed: 1, pending: 1, invalid: 1, unknownVersion: 3 });
    expect(s.totals.faced).toBe(1);
  });

  it("shouldReturnNullRatesWhenNothingWasFacedOrNothingIsAnalysed", async () => {
    expect((await stats()).totals).toEqual({ faced: 0, neutralized: 0, missed: 0, unpunished: 0, rate: null });
    game("a", ok(0, 0, 0));
    const s = await stats();
    expect(s.analysed).toBe(1);
    expect(s.totals.rate).toBeNull();
  });

  it("shouldSplitTheHundredMostRecentAnalysedGamesFromTheRest", async () => {
    for (let i = 0; i < 3; i++) game(`old${i}`, ok(0, 1, 0, "opening", [2])); // oldest: played first
    for (let i = 0; i < 100; i++) game(`new${i}`, ok(1, 0, 0));
    const s = await stats();
    expect(s.recent).toMatchObject({ games: 100, faced: 100, neutralized: 100, rate: 1 });
    expect(s.rest).toMatchObject({ games: 3, faced: 3, missed: 3, rate: 0 });
  });

  it("shouldScopeToAUserWhenAsked", async () => {
    game("mine", ok(1, 0, 0), { userId: "u1" });
    game("theirs", ok(0, 5, 0), { userId: "u2" });
    expect((await stats("?userId=u1")).totals.faced).toBe(1);
  });

  it("shouldFilterMatchesByMissedThreatAndExposeTheCount", async () => {
    game("missed", ok(0, 2, 0, "opening", [2, 4]));
    game("clean", ok(3, 0, 0));
    game("pending", null);
    game("broken", "{not json");
    const res = await (await handleMatches(d1, new URL("http://x/api/matches?missedThreat=1"))).json() as any;
    expect(res.total).toBe(1);
    expect(res.rows.map((r: any) => [r.match_id, r.mate_threats_missed])).toEqual([["missed", 2]]);
    const all = await (await handleMatches(d1, new URL("http://x/api/matches"))).json() as any;
    expect(all.rows.find((r: any) => r.match_id === "clean").mate_threats_missed).toBe(0);
    expect(all.rows.find((r: any) => r.match_id === "pending").mate_threats_missed).toBeNull();
    expect(all.rows.find((r: any) => r.match_id === "broken").mate_threats_missed).toBeNull();
  });

  it("shouldAddMissedPliesToTheGameJson", async () => {
    db.exec(`
      INSERT INTO users (id, created_at) VALUES ('owner', 'd');
      INSERT INTO user_identities (user_id, provider, subject, created_at) VALUES ('owner', 'cloudflare_access', 'o@x', 'd');
      INSERT INTO user_provider_accounts (user_id, provider, provider_user_id, created_at) VALUES ('owner', 'duolingo', 'u1', 'd');
    `);
    game("g", ok(0, 1, 0, "opening", [4]));
    game("pending", null);
    game("broken", "{not json");
    const get = async (id: string) => (await handleMatchGame(d1, "o@x", id, "json")).json() as Promise<any>;
    expect((await get("g")).missedPlies).toEqual([4]);
    expect((await get("pending")).missedPlies).toEqual([]);
    expect((await get("broken")).missedPlies).toEqual([]);
  });
});
