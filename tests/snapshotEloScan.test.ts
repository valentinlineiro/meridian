import { describe, expect, it } from "vitest";
import { handleStats } from "../src/api/stats.ts";
import { insertSnapshot } from "../src/db/store.ts";
import { setupTestDb } from "./helpers/testDb.ts";

// The ELO is stored in snapshots.elo at ingest, so no snapshot body is parsed (it used to be json_extract over every chess snapshot, ~430 KB each).
// A language snapshot with a malformed body proves it: parsing it would make SQLite raise "malformed JSON".
const seed = () => {
  const { db, d1 } = setupTestDb();
  const ins = db.prepare("INSERT INTO snapshots (id, created_at, source, user_id, raw_json, games_count, pages_count, checksum, size_bytes, elo) VALUES (?,?,?,?,?,0,0,?,0,?)");
  ins.run("c1", "2026-11-01T10:00:00Z", "duolingo-chess", "u1", JSON.stringify({ eloRating: 1500 }), "a", 1500);
  ins.run("l1", "2026-11-02T10:00:00Z", "duolingo-lang", "u1", "{ this is not json", "b", null);
  ins.run("g1", "2026-11-03T10:00:00Z", "linkedin-games", "u1", JSON.stringify({ games: [] }), "c", null);
  ins.run("c2", "2026-11-04T10:00:00Z", "duolingo-chess", "u1", JSON.stringify({ eloRating: 1523 }), "d", 1523);
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

  it("shouldStoreTheEloWhenASnapshotIsInserted", async () => {
    const { d1 } = setupTestDb();
    await insertSnapshot(d1, { id: "n1", createdAt: "2026-11-05T10:00:00Z", source: "duolingo-chess", userId: "u1", rawJson: "{}", gamesCount: 0, pagesCount: 0, checksum: "n", sizeBytes: 2, elo: 1611 });
    const body = (await (await handleStats(d1, "timeline", new URL("http://x/api/stats/timeline"))).json()) as { snapshots: { elo: number | null }[] };
    expect(body.snapshots.map((x) => x.elo)).toEqual([1611]);
  });
});
