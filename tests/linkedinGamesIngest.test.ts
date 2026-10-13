import { describe, it, expect, beforeEach } from "vitest";
import { setupTestDb } from "./helpers/testDb.ts";
import { ingestSnapshot } from "../src/api/import.ts";

// Acceptance tests for docs/contracts/2026-10-13-linkedin-games-ingestion-contract.md (option A: store only).
const USER = "1000001";
const OBS_TABLES = ["account_observations", "course_observations", "path_observations", "section_observations", "elo_observations"];
const count = (db: any, t: string) => Number((db.prepare(`SELECT COUNT(*) c FROM ${t}`).get() as any).c);
const day = (date: string, games: Record<string, unknown> = { zip: { number: 449, score: "0:08", scoreSeconds: 8, avg: "0:17", avgSeconds: 17 } }) => ({
  source: "linkedin-games",
  userId: USER,
  data: { schema: 1, date, tz: "Europe/Madrid", games },
});

describe("linkedin-games ingestion (option A: store only)", () => {
  let db: any;
  let d1: D1Database;
  beforeEach(() => ({ db, d1 } = setupTestDb()));

  it("shouldStoreSnapshotWithoutMatchesOrObservationsWhenSourceIsLinkedinGames", async () => {
    const r = await ingestSnapshot(d1, day("2026-10-13"));
    expect(r.deduplicated).toBe(false);
    const s = db.prepare("SELECT source, user_id, games_count, raw_json FROM snapshots WHERE id=?").get(r.snapshotId);
    expect(s).toMatchObject({ source: "linkedin-games", user_id: USER, games_count: 0 });
    expect(JSON.parse(s.raw_json).games.zip.scoreSeconds).toBe(8);
    expect(count(db, "matches")).toBe(0);
    for (const t of OBS_TABLES) expect(count(db, t)).toBe(0);
  });

  it("shouldNotDeduplicateWhenSameResultsOnDifferentDates", async () => {
    const a = await ingestSnapshot(d1, day("2026-10-13"));
    const b = await ingestSnapshot(d1, day("2026-10-14"));
    expect(b.deduplicated).toBe(false);
    expect(b.snapshotId).not.toBe(a.snapshotId);
    expect(count(db, "snapshots")).toBe(2);
  });

  it("shouldDeduplicateWhenSamePayloadIsRetried", async () => {
    const a = await ingestSnapshot(d1, day("2026-10-13"));
    const b = await ingestSnapshot(d1, day("2026-10-13"));
    expect(b).toMatchObject({ deduplicated: true, snapshotId: a.snapshotId });
    expect(count(db, "snapshots")).toBe(1);
  });

  it("shouldStoreANewSnapshotWhenAGameGoesFromUnplayedToPlayed", async () => {
    await ingestSnapshot(d1, day("2026-10-13", { tango: { number: null, unplayed: true } }));
    const r = await ingestSnapshot(d1, day("2026-10-13", { tango: { number: 12, score: "1:02", scoreSeconds: 62, avg: "1:30", avgSeconds: 90 } }));
    expect(r.deduplicated).toBe(false);
    expect(count(db, "snapshots")).toBe(2);
  });

  it("shouldNotChangeChessOrLanguageStateWhenLinkedinSnapshotIngested", async () => {
    await ingestSnapshot(d1, { source: "duolingo-chess", userId: USER, data: { eloRating: 981 } });
    const before = Object.fromEntries(["matches", ...OBS_TABLES, "user_state", "courses"].map((t) => [t, count(db, t)]));
    await ingestSnapshot(d1, day("2026-10-13"));
    const after = Object.fromEntries(Object.keys(before).map((t) => [t, count(db, t)]));
    expect(after).toEqual(before);
  });
});
