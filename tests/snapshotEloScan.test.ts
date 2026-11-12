import { describe, expect, it } from "vitest";
import { handleStats } from "../src/api/stats.ts";
import { setupTestDb } from "./helpers/testDb.ts";

// json_extract(raw_json, '$.eloRating') ran over EVERY snapshot, including ~1,400 language ones of ~72 KB that never carry an ELO
// (≈100 MB of JSON per call, ~590 ms in production). The answer must stay the same, but the ELO is only read from chess snapshots.
// A language snapshot with a malformed body proves it: parsing it would make SQLite raise "malformed JSON".
const seed = () => {
  const { db, d1 } = setupTestDb();
  const ins = db.prepare("INSERT INTO snapshots (id, created_at, source, user_id, raw_json, games_count, pages_count, checksum, size_bytes) VALUES (?,?,?,?,?,0,0,?,0)");
  ins.run("c1", "2026-11-01T10:00:00Z", "duolingo-chess", "u1", JSON.stringify({ eloRating: 1500 }), "a");
  ins.run("l1", "2026-11-02T10:00:00Z", "duolingo-lang", "u1", "{ this is not json", "b");
  ins.run("g1", "2026-11-03T10:00:00Z", "linkedin-games", "u1", JSON.stringify({ games: [] }), "c");
  ins.run("c2", "2026-11-04T10:00:00Z", "duolingo-chess", "u1", JSON.stringify({ eloRating: 1523 }), "d");
  return d1;
};
const call = async (kind: string) => handleStats(seed(), kind, new URL(`http://x/api/stats/${kind}`));

describe("the ELO series reads the ELO only from chess snapshots", () => {
  it("shouldListEverySnapshotWithNullEloWhereThereIsNone", async () => {
    const res = await call("timeline");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { snapshots: { id: string; createdAt: string; elo: number | null }[] };
    expect(body.snapshots.map((s) => [s.id, s.elo])).toEqual([["c1", 1500], ["l1", null], ["g1", null], ["c2", 1523]]);
  });

  it("shouldNotParseAMalformedNonChessSnapshotInTheBundle", async () => {
    const res = await call("bundle");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { timeline: { snapshots: unknown[] } };
    expect(body.timeline.snapshots).toHaveLength(4);
  });

  it("shouldNotParseAMalformedNonChessSnapshotInTheSummaryFallback", async () => {
    const res = await call("summary");
    expect(res.status).toBe(200);
  });
});
