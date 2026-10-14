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
    expect(out.startedAt).toBe(at(1)); // contractual start, 1 h after the chronological first
    expect(out.h1.nonComparable ?? []).toEqual([]);          // contractual: no course looks new
    expect(out.h1.courses).toEqual([{ courseId: "DUOLINGO_XA_EN", xp: 200 }]);
    // naive variant (chronological start over the SAME observations) must FAIL the contract: every course turns into `new_course`
    const naive = await d1.prepare(`SELECT COUNT(*) n FROM course_observations WHERE snapshot_id = 's0' AND subject = 'language'`).first<any>();
    expect(naive.n).toBe(0); // the chronological first snapshot has no qualifying observation: a start there would see no course
  });

  it("shouldTreatNullXpAsAnObservationWithoutXpNeverAsZero", async () => {
    const { out } = await run([
      { h: 0, courses: [{ id: "A", xp: 100 }, { id: "B", xp: 500 }] },
      { h: 5, courses: [{ id: "A", xp: 200 }, { id: "B", xp: null }] }, // B reported without a numeric xp
      { h: 10, courses: [{ id: "A", xp: 300 }, { id: "B", xp: 900 }] },
    ]);
    // B's mid observation does not exist (not 0): its h1 is `unknown`/not-comparable-or-bridged from start to end, never a gain from 0
    const all = [...out.h1.courses, ...out.h2.courses].filter((c) => c.courseId === "B");
    expect(all.every((c) => c.xp <= 400)).toBe(true); // never 900 - 0 or 500 - 0
    const inNc = [...(out.h1.nonComparable ?? []), ...(out.h2.nonComparable ?? [])].some((c) => c.courseId === "B");
    expect(all.length > 0 || inNc).toBe(true);
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
});
