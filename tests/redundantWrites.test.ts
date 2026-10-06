import { describe, it, expect } from "vitest";
import { setupTestDb } from "./helpers/testDb.ts";
import { upsertMatches, recordObservations } from "../src/db/store.ts";
import { upsertMatches as legacyUpsertMatches, recordObservations as legacyObservations } from "./fixtures/legacyStore.ts"; // verbatim copies of main before this change
import { handleStats, handleMatches } from "../src/api/stats.ts";
import type { MatchRow } from "../src/types.ts";

type Tally = Record<string, number>;
// Rows changed per table by the statements that write it (SQLite `changes`: table rows, not index entries).
function meter(db: any) {
  const t: Tally = {};
  const orig = db.prepare.bind(db);
  db.prepare = (sql: string) => {
    const st = orig(sql), run = st.run.bind(st);
    const table = /^\s*(?:INSERT(?: OR \w+)?\s+INTO|UPDATE)\s+(\w+)/i.exec(sql)?.[1];
    st.run = (...a: any[]) => { const r = run(...a); if (table && Number(r.changes) > 0) t[table] = (t[table] ?? 0) + Number(r.changes); return r; };
    return st;
  };
  return { t, reset: () => { for (const k of Object.keys(t)) delete t[k]; } };
}

const row = (id: string, o: Partial<MatchRow> = {}): { row: MatchRow; raw: any } => ({
  row: { match_id: id, user_id: "u1", opponent_id: "o", opponent_name: "n", opponent_type: "bot", opponent_elo: null, opponent_suspected_cheating: 0, user_color: "white", result: "win", outcome: "win", reviewed: 0, pvp_match_type: null, page_number: 1, index_in_page: 0, page_elo: null, played_at: 1000, ...o } as MatchRow,
  raw: { id },
});
const NOW = (n: number) => `2026-10-0${n}T00:00:00.000Z`;

// The same ingest sequence, run through either implementation, must leave the same state where anything reads it.
async function sequence(store: { upsertMatches: typeof upsertMatches }, db: any, d1: any) {
  const A = [row("m1", { played_at: 1 }), row("m2", { played_at: null }), row("m3", { played_at: 3 })];
  await store.upsertMatches(d1, A, "s1", NOW(1));
  await store.upsertMatches(d1, [...A, row("m4", { played_at: 4 })], "s2", NOW(2));          // 3 known + 1 new
  await store.upsertMatches(d1, [row("m2", { played_at: 2 }), row("m1", { played_at: 99 })], "s3", NOW(3)); // m2 learns its date; m1 gets a different one, as the old upsert did
  await store.upsertMatches(d1, [row("m5", { played_at: null }), row("m5", { played_at: 5 }), row("m5", { played_at: null })], "s4", NOW(4)); // duplicates inside one payload
}
const observable = (db: any) => ({
  matches: db.prepare("SELECT match_id, user_id, snapshot_id, opponent_id, opponent_name, opponent_type, opponent_elo, user_color, result, outcome, reviewed, raw_json, first_seen_at, played_at FROM matches ORDER BY match_id").all(),
});

describe("matches: known matches are not rewritten", () => {
  it("shouldLeaveEveryReadableColumnIdenticalToThePreviousImplementation", async () => {
    const a = setupTestDb(), b = setupTestDb();
    await sequence({ upsertMatches }, a.db, a.d1);
    await sequence({ upsertMatches: legacyUpsertMatches }, b.db, b.d1);
    expect(observable(a.db)).toEqual(observable(b.db));
    expect(observable(a.db).matches.map((m: any) => [m.match_id, m.played_at, m.snapshot_id])).toEqual([["m1", 99, "s1"], ["m2", 2, "s1"], ["m3", 3, "s1"], ["m4", 4, "s2"], ["m5", 5, "s4"]]);
  });

  it("shouldReportTheSameNumberOfNewMatches", async () => {
    const a = setupTestDb(), b = setupTestDb();
    const items = [row("m1"), row("m2"), row("m1")];
    expect((await upsertMatches(a.d1, items, "s1", NOW(1))).added).toBe((await legacyUpsertMatches(b.d1, items, "s1", NOW(1))).added);
    expect((await upsertMatches(a.d1, items, "s2", NOW(2))).added).toBe(0);
  });

  it("shouldWriteNothingWhenEveryMatchIsKnownAndHasItsDate", async () => {
    const { db, d1 } = setupTestDb();
    const items = [row("m1"), row("m2"), row("m3")];
    await upsertMatches(d1, items, "s1", NOW(1));
    const m = meter(db);
    await upsertMatches(d1, items, "s2", NOW(2));
    expect(m.t).toEqual({}); // no matches update, no match_snapshots row
  });

  it("shouldWriteOnlyTheDateWhenAKnownMatchLearnsItsPlayedAt", async () => {
    const { db, d1 } = setupTestDb();
    await upsertMatches(d1, [row("m1", { played_at: null })], "s1", NOW(1));
    const m = meter(db);
    await upsertMatches(d1, [row("m1", { played_at: 7 })], "s2", NOW(2));
    expect(m.t).toEqual({ matches: 1 });
    expect(db.prepare("SELECT played_at FROM matches WHERE match_id='m1'").get().played_at).toBe(7);
  });

  it("shouldRecordMembershipOnlyForTheSnapshotThatFirstSawTheMatch", async () => {
    const { db, d1 } = setupTestDb();
    await upsertMatches(d1, [row("m1"), row("m2")], "s1", NOW(1));
    await upsertMatches(d1, [row("m1"), row("m2"), row("m3")], "s2", NOW(2));
    expect(db.prepare("SELECT match_id, snapshot_id FROM match_snapshots ORDER BY match_id").all()).toEqual([
      { match_id: "m1", snapshot_id: "s1" }, { match_id: "m2", snapshot_id: "s1" }, { match_id: "m3", snapshot_id: "s2" },
    ]);
  });

  it("shouldKeepEveryReadRouteUnchanged", async () => {
    const a = setupTestDb(), b = setupTestDb();
    await sequence({ upsertMatches }, a.db, a.d1);
    await sequence({ upsertMatches: legacyUpsertMatches }, b.db, b.d1);
    for (const kind of ["summary", "color", "recent", "results"]) {
      const get = async (d1: any) => (await handleStats(d1, kind, new URL(`http://x/api/stats/${kind}`))).json();
      expect(await get(a.d1)).toEqual(await get(b.d1));
    }
    const list = async (d1: any) => (await handleMatches(d1, new URL("http://x/api/matches"))).json();
    expect(await list(a.d1)).toEqual(await list(b.d1));
  });
});

describe("schema_observations: only new paths are written", () => {
  const obs = (...p: string[]) => p.map((path) => ({ path, valueType: "number", example: "1" }));

  it("shouldWriteOnlyThePathsNeverSeenBefore", async () => {
    const { db, d1 } = setupTestDb();
    await recordObservations(d1, obs("$.a", "$.b"), NOW(1));
    const m = meter(db);
    await recordObservations(d1, obs("$.a", "$.b", "$.c"), NOW(2));
    expect(m.t).toEqual({ schema_observations: 1 });
    expect(db.prepare("SELECT path FROM schema_observations ORDER BY path").all().map((r: any) => r.path)).toEqual(["$.a", "$.b", "$.c"]);
  });

  it("shouldKeepTheSameSetOfPathsAndTypesAsThePreviousImplementation", async () => {
    const a = setupTestDb(), b = setupTestDb();
    const batches = [obs("$.a", "$.b"), [...obs("$.a"), { path: "$.a", valueType: "string", example: "x" }], obs("$.b", "$.c")];
    for (const [i, o] of batches.entries()) { await recordObservations(a.d1, o, NOW(i + 1)); await legacyObservations(b.d1, o, NOW(i + 1)); }
    const read = (db: any) => db.prepare("SELECT path, value_type, first_seen_at, example_value FROM schema_observations ORDER BY path, value_type").all();
    expect(read(a.db)).toEqual(read(b.db));
  });
});

// Two ingests can overlap. The check "is it known?" is a read; what keeps writes safe is that each write is itself atomic.
describe("matches: overlapping ingests", () => {
  it("shouldUpsertWithoutFailingWhenTwoIngestsBothSeeAMatchAsNew", async () => {
    for (const store of [upsertMatches, legacyUpsertMatches]) {
      const { db, d1 } = setupTestDb();
      const [a, b] = await Promise.all([store(d1, [row("m1", { played_at: 100 })], "sA", NOW(1)), store(d1, [row("m1", { played_at: 200 })], "sB", NOW(2))]);
      expect([a.added, b.added]).toEqual([1, 1]); // both classified it as new: the race was really exercised
      expect(db.prepare("SELECT COUNT(*) c FROM matches").get().c).toBe(1);
      expect([100, 200]).toContain(db.prepare("SELECT played_at FROM matches WHERE match_id='m1'").get().played_at);
    }
  });

  it("shouldNeverLoseTheRowWhenTwoIngestsLearnTheSameDateAtOnce", async () => {
    const { db, d1 } = setupTestDb();
    await upsertMatches(d1, [row("m1", { played_at: null })], "s0", NOW(1));
    await Promise.all([upsertMatches(d1, [row("m1", { played_at: 200 })], "sA", NOW(2)), upsertMatches(d1, [row("m1", { played_at: 300 })], "sB", NOW(3))]);
    expect(db.prepare("SELECT COUNT(*) c FROM matches").get().c).toBe(1);
    expect([200, 300]).toContain(db.prepare("SELECT played_at FROM matches WHERE match_id='m1'").get().played_at); // last write wins, as before
  });

  it("shouldStayConsistentWhenManyOverlappingIngestsResendTheSameHistory", async () => {
    const { db, d1 } = setupTestDb();
    const history = Array.from({ length: 120 }, (_, i) => row(`m${i}`, { played_at: i + 1 }));
    await Promise.all(Array.from({ length: 5 }, (_, k) => upsertMatches(d1, history, `s${k}`, NOW(k + 1))));
    expect(db.prepare("SELECT COUNT(*) c FROM matches").get().c).toBe(120);
    expect(db.prepare("SELECT COUNT(DISTINCT match_id) c FROM match_snapshots").get().c).toBe(120);
    expect(db.prepare("SELECT COUNT(*) c FROM matches WHERE played_at IS NULL").get().c).toBe(0);
  });

  it("shouldMeanSnapshotOfFirstObservationNotObservedInThisSnapshot", async () => {
    const { db, d1 } = setupTestDb();
    await upsertMatches(d1, [row("m1")], "first", NOW(1));
    await upsertMatches(d1, [row("m1")], "later", NOW(2));
    expect(db.prepare("SELECT snapshot_id FROM match_snapshots WHERE match_id='m1'").all()).toEqual([{ snapshot_id: "first" }]);
    expect(db.prepare("SELECT snapshot_id FROM matches WHERE match_id='m1'").get().snapshot_id).toBe("first"); // same fact as matches.snapshot_id
  });
});
