// R4 / A6 source: course_observations at the boundary snapshots (contract 2026-10-05 §7.2, D-c+D-e; owner decision 2026-10-14).
// The previous raw_json implementation is kept below as the reference so parity is asserted, not assumed.
import { describe, it, expect } from "vitest";
import { setupTestDb } from "./helpers/testDb.ts";
import { materializeObservations } from "./helpers/materializeObservations.ts";
import { createD1TrajectoryAdapter } from "../src/infrastructure/d1/d1TrajectoryAdapter.ts";

const U = "u1";
const H = 3600_000;
const T0 = Date.parse("2026-01-01T00:00:00.000Z");
const at = (h: number) => new Date(T0 + h * H).toISOString();
type C = { id: string; xp: number | null | undefined; subject?: string | null };
type S = { h: number; courses: C[]; aux?: boolean };

function seed(snaps: S[]) {
  const { db, d1 } = setupTestDb();
  snaps.forEach((s, i) => {
    const courses = s.courses.map((c) => { const o: any = { id: c.id }; if (c.xp !== undefined) o.xp = c.xp; if (c.subject !== null) o.subject = c.subject ?? "language"; return o; });
    db.prepare(`INSERT INTO snapshots (id, created_at, source, user_id, raw_json, games_count, pages_count, checksum, size_bytes, is_auxiliary)
      VALUES (?, ?, 'duolingo-lang', ?, ?, 0, 0, ?, 100, ?)`).run(`s${i}`, at(s.h), U, JSON.stringify({ courses }), `ck${i}`, s.aux ? 1 : 0);
  });
  return { db, d1 };
}
const run = async (snaps: S[]) => { const { db, d1 } = seed(snaps); await materializeObservations(db, d1); return { d1, out: await createD1TrajectoryAdapter(d1).getLanguagesTrajectoryData(U) }; };

// ---- the implementation R4 had before reading observations (raw_json, broad predicate, chronological start), same logic
async function legacy(d1: D1Database) {
  const span = await d1.prepare(`SELECT MIN(created_at) a, MAX(created_at) b FROM snapshots WHERE source='duolingo-lang' AND user_id=?`).bind(U).first<any>();
  const startMs = Date.parse(span.a), endMs = Date.parse(span.b), midMs = Math.floor(startMs + (endMs - startMs) / 2);
  const recent = async (iso: string) => ((await d1.prepare(`SELECT id, created_at, raw_json FROM snapshots WHERE source='duolingo-lang' AND user_id=? AND created_at<=? ORDER BY created_at DESC LIMIT 3`).bind(U, iso).all<any>()).results ?? []);
  const first = await d1.prepare(`SELECT id, created_at, raw_json FROM snapshots WHERE source='duolingo-lang' AND user_id=? ORDER BY created_at ASC LIMIT 1`).bind(U).first<any>();
  const seen = new Set<string>(); const rows = [first, ...(await recent(new Date(midMs).toISOString())), ...(await recent(new Date(endMs).toISOString()))].filter((r) => r && !seen.has(r.id) && seen.add(r.id));
  const xp = (raw: string) => { const m = new Map<string, number>(); for (const c of JSON.parse(raw).courses ?? []) { const id = c.id; if (typeof id === "string" && typeof c.xp === "number" && Number.isFinite(c.xp) && (c.subject === "language" || c.learningLanguage || id.startsWith("DUOLINGO_"))) m.set(id, c.xp); } return m; };
  const series = new Map<string, Array<{ at: number; xp: number }>>();
  for (const r of rows.map((r) => ({ at: Date.parse(r.created_at), xp: xp(r.raw_json) })).sort((a, b) => a.at - b.at)) for (const [id, v] of r.xp) (series.get(id) ?? series.set(id, []).get(id)!).push({ at: r.at, xp: v });
  const half = (a: number, b: number) => { const g: Record<string, number> = {}; const nc: Record<string, string> = {};
    for (const [id, obs] of series) { const oa = [...obs].reverse().find((o) => o.at <= a); const inH = obs.filter((o) => o.at > a && o.at <= b); const ob = inH[inH.length - 1];
      if (!ob) { nc[id] = "unknown"; continue; } if (!oa) { nc[id] = "new_course"; continue; }
      const run = [oa, ...inH]; if (run.findIndex((o, i) => i > 0 && o.xp < run[i - 1]!.xp) > 0) { nc[id] = "discontinuity"; continue; }
      if (ob.xp - oa.xp > 0) g[id] = ob.xp - oa.xp; }
    return { g, nc }; };
  return { h1: half(startMs, midMs), h2: half(midMs, endMs) };
}
// The variant the contract rules out: same observations and boundaries, but the start is the CHRONOLOGICAL first snapshot.
async function naiveFromObservations(d1: D1Database) {
  const snaps = ((await d1.prepare(`SELECT id, created_at FROM snapshots WHERE source='duolingo-lang' AND user_id=? ORDER BY created_at`).bind(U).all<any>()).results ?? []);
  const obs = ((await d1.prepare(`SELECT snapshot_id, course_id, xp FROM course_observations WHERE subject='language' AND xp IS NOT NULL`).all<any>()).results ?? []);
  const xp = new Map<string, Map<string, number>>(); for (const o of obs) (xp.get(o.snapshot_id) ?? xp.set(o.snapshot_id, new Map()).get(o.snapshot_id)!).set(o.course_id, o.xp);
  const startMs = Date.parse(snaps[0].created_at), endMs = Date.parse(snaps[snaps.length - 1].created_at), midMs = Math.floor(startMs + (endMs - startMs) / 2);
  const recent = (ms: number) => snaps.filter((s: any) => Date.parse(s.created_at) <= ms).slice(-3);
  const ids = new Map([snaps[0], ...recent(midMs), ...recent(endMs)].map((s: any) => [s.id, s]));
  const series = new Map<string, Array<{ at: number; xp: number }>>();
  for (const s of [...ids.values()].sort((a: any, b: any) => a.created_at.localeCompare(b.created_at))) for (const [id, v] of xp.get(s.id) ?? []) (series.get(id) ?? series.set(id, []).get(id)!).push({ at: Date.parse(s.created_at), xp: v });
  const half = (a: number, b: number) => { const g: Record<string, number> = {}; const nc: Record<string, string> = {};
    for (const [id, o] of series) { const oa = [...o].reverse().find((x) => x.at <= a); const inH = o.filter((x) => x.at > a && x.at <= b); const ob = inH[inH.length - 1];
      if (!ob) { nc[id] = "unknown"; continue; } if (!oa) { nc[id] = "new_course"; continue; }
      if (ob.xp - oa.xp > 0) g[id] = ob.xp - oa.xp; } return { g, nc }; };
  return { startedAt: new Date(startMs).toISOString(), shape: { h1: half(startMs, midMs), h2: half(midMs, endMs) } };
}
const shape = (o: any) => ({ h1: { g: Object.fromEntries(o.h1.courses.map((c: any) => [c.courseId, c.xp])), nc: Object.fromEntries((o.h1.nonComparable ?? []).map((c: any) => [c.courseId, c.state])) }, h2: { g: Object.fromEntries(o.h2.courses.map((c: any) => [c.courseId, c.xp])), nc: Object.fromEntries((o.h2.nonComparable ?? []).map((c: any) => [c.courseId, c.state])) } });

describe("R4/A6 reads course_observations", () => {
  it("shouldEqualTheRawJsonReaderWhenEveryEntryCarriesSubjectLanguage", async () => {
    const { d1, out } = await run([
      { h: 0, courses: [{ id: "A", xp: 1000 }, { id: "B", xp: 0 }] },
      { h: 24, courses: [{ id: "A", xp: 6000 }, { id: "B", xp: 200 }] },
      { h: 30, courses: [{ id: "A", xp: 6000 }], aux: true }, // auxiliary snapshot with a partial catalog
      { h: 48, courses: [{ id: "A", xp: 6500 }, { id: "B", xp: 8200 }] },
    ]);
    expect(shape(out)).toEqual(await legacy(d1));
  });

  it("shouldStartAtTheFirstSnapshotWhoseObservationsSatisfyThePredicateNotAtTheChronologicalFirst", async () => {
    // Production shape: the first snapshot carries DUOLINGO_* entries WITHOUT `subject` (observations store subject = NULL).
    const snaps: S[] = [
      { h: 0, courses: [{ id: "DUOLINGO_XA_EN", xp: 100, subject: null }, { id: "DUOLINGO_XB_EN", xp: 50, subject: null }] },
      { h: 1, courses: [{ id: "DUOLINGO_XA_EN", xp: 100 }, { id: "DUOLINGO_XB_EN", xp: 50 }] },
      { h: 5, courses: [{ id: "DUOLINGO_XA_EN", xp: 300 }, { id: "DUOLINGO_XB_EN", xp: 50 }] },
      { h: 10, courses: [{ id: "DUOLINGO_XA_EN", xp: 400 }, { id: "DUOLINGO_XB_EN", xp: 90 }] },
    ];
    const { d1, out } = await run(snaps);
    const naive = await naiveFromObservations(d1);   // same observations, same end, chronological start
    // contractual: starts at h1, A gains 200 in h1, nothing looks new
    expect(out.startedAt).toBe(at(1));
    expect(shape(out)).toEqual({
      h1: { g: { DUOLINGO_XA_EN: 200 }, nc: {} },
      h2: { g: { DUOLINGO_XA_EN: 100, DUOLINGO_XB_EN: 40 }, nc: {} },
    });
    // naive: starts at h0, where no entry satisfies the predicate, so BOTH courses are reported as new_course in h1 and A's gain is lost
    expect(naive.startedAt).toBe(at(0));
    expect(naive.shape).toEqual({
      h1: { g: {}, nc: { DUOLINGO_XA_EN: "new_course", DUOLINGO_XB_EN: "new_course" } },
      h2: { g: { DUOLINGO_XA_EN: 100, DUOLINGO_XB_EN: 40 }, nc: {} },
    });
    expect(shape(out)).not.toEqual(naive.shape); // the contract is what separates them
  });

  it("shouldIdentifyTheStartSnapshotByItsKeyEvenWhenObservedAtDiffersFromCreatedAt", async () => {
    const { db, d1 } = seed([
      { h: 0, courses: [{ id: "DUOLINGO_XA_EN", xp: 10, subject: null }] },
      { h: 1, courses: [{ id: "DUOLINGO_XA_EN", xp: 10 }] },
      { h: 6, courses: [{ id: "DUOLINGO_XA_EN", xp: 70 }] },
      { h: 10, courses: [{ id: "DUOLINGO_XA_EN", xp: 90 }] },
    ]);
    await materializeObservations(db, d1);
    db.prepare("UPDATE course_observations SET observed_at = '2099-01-01T00:00:00.000Z' WHERE snapshot_id = 's1'").run(); // clock column drifts
    const out = await createD1TrajectoryAdapter(d1).getLanguagesTrajectoryData(U);
    expect(out.startedAt).toBe(at(1)); // snapshot s1's created_at, not the observation's observed_at
    // mid = h5.5: no snapshot lies in (h1, h5.5], so h1 is `unknown`; h2 is the net difference between the start (10) and the end (90)
    expect(shape(out)).toEqual({ h1: { g: {}, nc: { DUOLINGO_XA_EN: "unknown" } }, h2: { g: { DUOLINGO_XA_EN: 80 }, nc: {} } });
  });

  it("shouldPickTheSmallestSnapshotIdWhenTwoQualifyingSnapshotsShareTheTimestamp", async () => {
    // s0 and s1 are the first two snapshots at the SAME instant with different XP; later snapshots keep them out of the boundary reads
    // at mid and end, so only the start choice decides the h1 gain: 80 - 10 = 70 with s0 (smallest id), 80 - 50 = 30 with s1.
    const { db, d1 } = seed([
      { h: 0, courses: [{ id: "DUOLINGO_XA_EN", xp: 10 }] },
      { h: 0, courses: [{ id: "DUOLINGO_XA_EN", xp: 50 }] },
      { h: 1, courses: [{ id: "DUOLINGO_XA_EN", xp: 60 }] },
      { h: 2, courses: [{ id: "DUOLINGO_XA_EN", xp: 70 }] },
      { h: 3, courses: [{ id: "DUOLINGO_XA_EN", xp: 80 }] },
      { h: 10, courses: [{ id: "DUOLINGO_XA_EN", xp: 100 }] },
    ]);
    await materializeObservations(db, d1);
    const a = await createD1TrajectoryAdapter(d1).getLanguagesTrajectoryData(U);
    expect(await createD1TrajectoryAdapter(d1).getLanguagesTrajectoryData(U)).toEqual(a); // repeatable
    expect(a.startedAt).toBe(at(0));
    expect(a.h1.courses).toEqual([{ courseId: "DUOLINGO_XA_EN", xp: 70 }]);
  });

  it("shouldTreatNullXpAsAnObservationWithoutXpNeverAsZero", async () => {
    const { out } = await run([
      { h: 0, courses: [{ id: "A", xp: 100 }, { id: "B", xp: 500 }] },
      { h: 5, courses: [{ id: "A", xp: 200 }, { id: "B", xp: null }] }, // B reported without a numeric xp: NOT an observation of B's XP
      { h: 10, courses: [{ id: "A", xp: 300 }, { id: "B", xp: 900 }] },
    ]);
    // A is unaffected. B has observations only at h0 (500) and h10 (900):
    //  h1: B was not observed in the period (the h5 entry has no xp, it is not 0) -> `unknown`, bounded by what the series shows (900 - 500)
    //  h2: its own previous observation is h0, so the NET difference 400 is reported there; nothing is read as 0 (900 - 0 or 500 - 0)
    expect(shape(out)).toEqual({
      h1: { g: { A: 100 }, nc: { B: "unknown" } },
      h2: { g: { A: 100, B: 400 }, nc: {} },
    });
    expect(out.h1.nonComparable).toEqual([{ courseId: "B", state: "unknown", reason: "not_observed_in_period", boundXp: 400 }]);
  });

  it("shouldKeepTheTotalWhenTheContractualStartMovesTheMidpointAcrossASnapshot", async () => {
    // §7.3: for a given end, shifting the start shifts the midpoint; XP can move between halves but the total must not change.
    const snaps: S[] = [
      { h: 0, courses: [{ id: "DUOLINGO_XA_EN", xp: 0, subject: null }] },
      { h: 1, courses: [{ id: "DUOLINGO_XA_EN", xp: 0 }] },
      { h: 3, courses: [{ id: "DUOLINGO_XA_EN", xp: 100 }] },
      { h: 5.25, courses: [{ id: "DUOLINGO_XA_EN", xp: 300 }] }, // falls in h2 for the chronological mid (5 h) and in h1 for the contractual one (5.5 h)
      { h: 10, courses: [{ id: "DUOLINGO_XA_EN", xp: 400 }] },
    ];
    const { d1, out } = await run(snaps);
    const old = await legacy(d1);
    expect([old.h1.g.DUOLINGO_XA_EN, old.h2.g.DUOLINGO_XA_EN]).toEqual([100, 300]);
    expect([out.h1.courses[0]?.xp, out.h2.courses[0]?.xp]).toEqual([300, 100]);
    expect((old.h1.g.DUOLINGO_XA_EN ?? 0) + (old.h2.g.DUOLINGO_XA_EN ?? 0)).toBe((out.h1.courses[0]?.xp ?? 0) + (out.h2.courses[0]?.xp ?? 0));
  });

  it("shouldReportTheNetGainWhenThereIsANonMonotonicStepBetweenUnreadSnapshots", async () => {
    // §14.2 declared limit: continuity is only verified between the observations read. A drop and recovery in between is not seen.
    const { out } = await run([
      { h: 0, courses: [{ id: "A", xp: 1000 }] },
      { h: 2, courses: [{ id: "A", xp: 900 }] },  // dip (not read: only 3 per boundary)
      { h: 3, courses: [{ id: "A", xp: 1100 }] },
      { h: 4, courses: [{ id: "A", xp: 1200 }] },
      { h: 5, courses: [{ id: "A", xp: 1300 }] },
      { h: 6, courses: [{ id: "A", xp: 1400 }] },
      { h: 7, courses: [{ id: "A", xp: 1500 }] },
      { h: 8, courses: [{ id: "A", xp: 1600 }] },
      { h: 10, courses: [{ id: "A", xp: 1700 }] },
    ]);
    expect(out.h1.courses.concat(out.h2.courses).reduce((a, c) => a + c.xp, 0)).toBe(700); // net observed difference
  });

  it("shouldNotReadRawJson", async () => {
    const { db, d1 } = seed([{ h: 0, courses: [{ id: "A", xp: 1 }] }, { h: 9, courses: [{ id: "A", xp: 9 }] }]);
    await materializeObservations(db, d1);
    const seen: string[] = [];
    const spy = { prepare: (sql: string) => (seen.push(sql), (d1 as any).prepare(sql)) } as unknown as D1Database;
    await createD1TrajectoryAdapter(spy).getLanguagesTrajectoryData(U);
    expect(seen.filter((s) => /raw_json/i.test(s))).toEqual([]);
  });

  it("shouldCompleteASnapshotThatWasOnlyPartiallyMaterialised", async () => {
    // Guards the fixture helper itself: a snapshot that already has some families must still get the missing ones.
    const { db, d1 } = seed([
      { h: 0, courses: [{ id: "DUOLINGO_XA_EN", xp: 10 }] },
      { h: 10, courses: [{ id: "DUOLINGO_XA_EN", xp: 90 }] },
    ]);
    // partial state: only the account family exists for s0 (an unrelated row), no course rows
    db.prepare("INSERT INTO account_observations (snapshot_id, user_id, observed_at, total_xp, streak, declared_course_id, extractor_version) VALUES ('s0', ?, ?, 1, 1, NULL, 1)").run(U, at(0));
    const before = db.prepare("SELECT COUNT(*) n FROM course_observations WHERE snapshot_id = 's0'").get() as any;
    expect(before.n).toBe(0);
    await materializeObservations(db, d1);
    const after = db.prepare("SELECT COUNT(*) n FROM course_observations WHERE snapshot_id = 's0'").get() as any;
    expect(after.n).toBe(1);
    const acc = db.prepare("SELECT total_xp FROM account_observations WHERE snapshot_id = 's0'").get() as any;
    expect(acc.total_xp).toBe(1); // the pre-existing row is left untouched
  });

  it("shouldFindTheStartAcrossSeveralPagesOfSnapshotsWithoutQualifyingObservations", async () => {
    // 45 leading snapshots whose entries carry no `subject` (more than two pages of 20), then the first qualifying one.
    const lead: S[] = Array.from({ length: 45 }, (_, i) => ({ h: i * 0.1, courses: [{ id: "DUOLINGO_XA_EN", xp: 5, subject: null }] }));
    const { db, d1 } = seed([
      ...lead,
      { h: 10, courses: [{ id: "DUOLINGO_XA_EN", xp: 100 }] },
      { h: 20, courses: [{ id: "DUOLINGO_XA_EN", xp: 150 }] },
      { h: 30, courses: [{ id: "DUOLINGO_XA_EN", xp: 190 }] },
    ]);
    await materializeObservations(db, d1);
    const out = await createD1TrajectoryAdapter(d1).getLanguagesTrajectoryData(U);
    expect(out.startedAt).toBe(at(10));
    expect(shape(out)).toEqual({ h1: { g: { DUOLINGO_XA_EN: 50 }, nc: {} }, h2: { g: { DUOLINGO_XA_EN: 40 }, nc: {} } });
  });

  it("shouldReturnEmptyWhenNoSnapshotHasQualifyingObservations", async () => {
    const { db, d1 } = seed([{ h: 0, courses: [{ id: "DUOLINGO_XA_EN", xp: 1, subject: null }] }, { h: 5, courses: [{ id: "DUOLINGO_XA_EN", xp: 9, subject: null }] }]);
    await materializeObservations(db, d1);
    const out = await createD1TrajectoryAdapter(d1).getLanguagesTrajectoryData(U);
    expect(out).toMatchObject({ startedAt: null, endedAt: null, activeDays: 0, h1: { courses: [] }, h2: { courses: [] } });
  });

  it("shouldNotSkipOrRepeatSnapshotsWhenTiesOnCreatedAtSpanSeveralPages", async () => {
    // 45 snapshots at the SAME instant (ids s0..s44; string order puts s9 last). Only s9 qualifies, so the page cursor must walk
    // every tie in id order across 3 pages of 20 without losing s9 and without stopping early.
    const tied: S[] = Array.from({ length: 45 }, (_, i) => ({ h: 0, courses: [{ id: "DUOLINGO_XA_EN", xp: i === 9 ? 10 : 5, ...(i === 9 ? {} : { subject: null }) }] }));
    const { db, d1 } = seed([...tied, { h: 10, courses: [{ id: "DUOLINGO_XA_EN", xp: 60 }] }, { h: 20, courses: [{ id: "DUOLINGO_XA_EN", xp: 90 }] }]);
    await materializeObservations(db, d1);
    const out = await createD1TrajectoryAdapter(d1).getLanguagesTrajectoryData(U);
    expect(out.startedAt).toBe(at(0));
    // start obs is s9's xp (10): h1 (0, 10] ends at h10 (60) -> 50; h2 (10, 20] -> 30
    expect(shape(out)).toEqual({ h1: { g: { DUOLINGO_XA_EN: 50 }, nc: {} }, h2: { g: { DUOLINGO_XA_EN: 30 }, nc: {} } });
  });
});
