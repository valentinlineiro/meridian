import { describe, it, expect, beforeEach } from "vitest";
import { setupTestDb } from "./helpers/testDb.ts";
import { ingestSnapshot } from "../src/api/import.ts";
import worker from "../src/index.ts";
import type { Env } from "../src/types.ts";
import { createHmacSessionCodec } from "../src/infrastructure/auth/hmacSessionCodec.ts";

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
    await ingestSnapshot(d1, { ...day("2026-10-13", { tango: { number: null, unplayed: true } }), createdAt: "2026-10-13T08:00:00.000Z" });
    const r = await ingestSnapshot(d1, { ...day("2026-10-13", { tango: { number: 12, score: "1:02", scoreSeconds: 62, avg: "1:30", avgSeconds: 90 } }), createdAt: "2026-10-13T20:00:00.000Z" });
    expect(r.deduplicated).toBe(false);
    expect(count(db, "snapshots")).toBe(2);
    // Contract L2: the current version of a day is the latest created_at (id breaks ties).
    const current = db
      .prepare("SELECT raw_json FROM snapshots WHERE source='linkedin-games' AND user_id=? AND json_extract(raw_json,'$.date')=? ORDER BY created_at DESC, id DESC LIMIT 1")
      .get(USER, "2026-10-13");
    expect(JSON.parse(current.raw_json).games.tango).toMatchObject({ score: "1:02", scoreSeconds: 62 });
  });

  it.each([
    ["missing", undefined],
    ["not a string", 20261013],
    ["wrong format", "13/10/2026"],
    ["not a real calendar date", "2026-02-30"],
  ])("shouldRejectWhenDateIsMissingOrNotARealCalendarDate (%s)", async (_label, date) => {
    const p = day("2026-10-13");
    await expect(ingestSnapshot(d1, { ...p, data: { ...p.data, date } })).rejects.toThrow(/requires data\.date/);
    expect(count(db, "snapshots")).toBe(0);
  });

  it("shouldNotChangeChessOrLanguageStateWhenLinkedinSnapshotIngested", async () => {
    await ingestSnapshot(d1, { source: "duolingo-chess", userId: USER, data: { eloRating: 981 } });
    const before = Object.fromEntries(["matches", ...OBS_TABLES, "user_state", "courses"].map((t) => [t, count(db, t)]));
    await ingestSnapshot(d1, day("2026-10-13"));
    const after = Object.fromEntries(Object.keys(before).map((t) => [t, count(db, t)]));
    expect(after).toEqual(before);
  });

  describe("HTTP boundary", () => {
    const SECRET = "x".repeat(48);
    const ADMIN = "owner@example.com";
    const BASE = "https://stats.example.com";
    const env = () => ({ DB: d1, IMPORT_TOKEN: "secret", SESSION_SECRET: SECRET, ADMIN_EMAIL: ADMIN, ADMIN_PASSWORD_HASH: "x" }) as unknown as Env;
    const post = (body: unknown) =>
      worker.fetch(new Request(`${BASE}/api/import`, { method: "POST", headers: { authorization: "Bearer secret", "content-type": "application/json" }, body: JSON.stringify(body) }), env());

    it("shouldAcceptViaImportTokenAndListViaOwnerSessionWhenSourceIsLinkedinGames", async () => {
      const res = await post(day("2026-10-13"));
      expect(res.status).toBe(200);
      const id = ((await res.json()) as any).snapshotId;

      // Read is owner-session protected: the import Bearer alone must not list snapshots.
      const bearerOnly = await worker.fetch(new Request(`${BASE}/api/snapshots`, { headers: { authorization: "Bearer secret" } }), env());
      expect(bearerOnly.status).toBe(401);

      const cookie = `__Host-session=${await createHmacSessionCodec(SECRET)!.sign({ sub: ADMIN, exp: Math.floor(Date.now() / 1000) + 600 })}`;
      const list = await worker.fetch(new Request(`${BASE}/api/snapshots`, { headers: { cookie } }), env());
      expect(list.status).toBe(200);
      const rows = ((await list.json()) as any).snapshots;
      expect(rows).toContainEqual(expect.objectContaining({ id, source: "linkedin-games", user_id: USER, games_count: 0 }));
    });

    it("shouldReturn400WhenDateIsInvalid", async () => {
      const p = day("2026-10-13");
      const res = await post({ ...p, data: { ...p.data, date: "2026-13-40" } });
      expect(res.status).toBe(400);
      expect(count(db, "snapshots")).toBe(0);
    });
  });
});
