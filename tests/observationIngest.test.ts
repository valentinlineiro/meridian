import { describe, it, expect, beforeEach } from "vitest";
import { setupTestDb } from "./helpers/testDb.ts";
import { ingestSnapshot } from "../src/api/import.ts";
import { extractObservations } from "../src/normalization/observations.ts";
import { observationStatements } from "../src/db/storeObservations.ts";

const TABLES = ["account_observations", "course_observations", "path_observations", "section_observations", "elo_observations"];
const counts = (db: any) => Object.fromEntries(TABLES.map((t) => [t, Number((db.prepare(`SELECT COUNT(*) c FROM ${t}`).get() as any).c)]));
const USER = "1000001";
const AT = "2026-10-06T10:00:00.000Z";
const section = (index: number, type = "learning") => ({ index, id: `sec-${index}`, type, cefr: { level: "A1", sublevel: 1 }, completedUnits: 2, totalUnits: 8, units: [] });
const courses = [
  { id: "DUOLINGO_XA_EN", title: "Demo Alpha", subject: "language", learningLanguage: "xa", fromLanguage: "en", xp: 500 },
  { id: "DUOLINGO_XB_EN", title: "Demo Beta", subject: "language", learningLanguage: "xb", fromLanguage: "en", xp: 40 },
  { id: "CHESS_CH", xp: 9 },
];
const accountData = { user: { id: 1, totalXp: 540, streak: 7, currentCourseId: "DUOLINGO_XA_EN" }, courses, xp_summaries: [] };
// What the collector sends per course: identity only, plus the Path of the course that was open.
const identityData = { user: { id: 1 }, courses, currentCourse: { id: "DUOLINGO_XB_EN", activePathSectionId: "sec-1", pathSectioned: [section(0), section(1), section(2, "daily_refresh")] }, xp_summaries: [] };
const lang = (data: any, over: Record<string, unknown> = {}) => ({ source: "duolingo-lang", userId: USER, createdAt: AT, data, ...over });

describe("observation series written at ingest (P2 piece 1)", () => {
  let db: any;
  let d1: D1Database;
  beforeEach(() => ({ db, d1 } = setupTestDb()));

  it("shouldWriteCourseAndPathObservationsButNoAccountObservationWhenSnapshotIsIdentityOnly", async () => {
    await ingestSnapshot(d1, lang(identityData, { isAuxiliary: true, originalCourseId: "DUOLINGO_XA_EN", observedCourseId: "DUOLINGO_XB_EN" }));
    expect(counts(db)).toEqual({ account_observations: 0, course_observations: 3, path_observations: 1, section_observations: 3, elo_observations: 0 });
    const p = db.prepare("SELECT course_id, active_section_id, format_error FROM path_observations").get();
    expect(p).toMatchObject({ course_id: "DUOLINGO_XB_EN", active_section_id: "sec-1", format_error: null });
  });

  it("shouldWriteTheAccountObservationWhenSnapshotCarriesAccountFields", async () => {
    await ingestSnapshot(d1, lang(accountData, { isAuxiliary: false, originalCourseId: "DUOLINGO_XA_EN" }));
    expect(counts(db)).toMatchObject({ account_observations: 1, course_observations: 3, path_observations: 0, section_observations: 0 });
    expect(db.prepare("SELECT total_xp, streak, declared_course_id FROM account_observations").get()).toMatchObject({ total_xp: 540, streak: 7, declared_course_id: "DUOLINGO_XA_EN" });
  });

  it("shouldKeepEveryObservedCourseIncludingNonLanguageOnesAndNullSubject", async () => {
    await ingestSnapshot(d1, lang(accountData));
    const rows = db.prepare("SELECT course_id, subject, xp FROM course_observations ORDER BY course_id").all();
    expect(rows).toEqual([
      { course_id: "CHESS_CH", subject: null, xp: 9 },
      { course_id: "DUOLINGO_XA_EN", subject: "language", xp: 500 },
      { course_id: "DUOLINGO_XB_EN", subject: "language", xp: 40 },
    ]);
  });

  it("shouldStampEveryRowWithTheSnapshotIdUserObservedAtAndExtractorVersion", async () => {
    const r = await ingestSnapshot(d1, lang(accountData));
    for (const t of ["account_observations", "course_observations"]) {
      const rows = db.prepare(`SELECT snapshot_id, user_id, observed_at, extractor_version FROM ${t}`).all();
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) expect(row).toEqual({ snapshot_id: r.snapshotId, user_id: USER, observed_at: AT, extractor_version: 1 });
    }
  });

  it("shouldWriteSnapshotEloForAChessSnapshot", async () => {
    const r = await ingestSnapshot(d1, { source: "duolingo-chess", userId: USER, createdAt: AT, data: { eloRating: 981 } });
    expect(db.prepare("SELECT snapshot_id, elo FROM elo_observations").all()).toEqual([{ snapshot_id: r.snapshotId, elo: 981 }]);
    expect(counts(db).course_observations).toBe(0);
  });

  it("shouldRecordFormatErrorWithoutSectionRowsWhenThePathHasAnUnexpectedShape", async () => {
    const bad = { ...identityData, currentCourse: { id: "DUOLINGO_XB_EN", pathSectioned: [section(0), { index: 1 }] } };
    await ingestSnapshot(d1, lang(bad));
    expect(db.prepare("SELECT format_error FROM path_observations").get().format_error).toMatch(/pathSectioned\[1\]\.id/);
    expect(counts(db).section_observations).toBe(0);
  });
});

describe("identity of an observation: same snapshot, same set, a second run adds nothing (§5)", () => {
  let db: any;
  let d1: D1Database;
  beforeEach(() => ({ db, d1 } = setupTestDb()));

  it("shouldAddNoObservationWhenTheIdenticalPayloadIsIngestedAgain", async () => {
    await ingestSnapshot(d1, lang(identityData));
    const before = counts(db);
    const again = await ingestSnapshot(d1, lang(identityData));
    expect(again.deduplicated).toBe(true);
    expect(counts(db)).toEqual(before);
  });

  it("shouldAddNoRowWhenTheSameSnapshotsObservationsAreWrittenASecondTimeByTheirKeys", async () => {
    const r = await ingestSnapshot(d1, lang(identityData));
    const before = counts(db);
    const raw = db.prepare("SELECT raw_json FROM snapshots WHERE id=?").get(r.snapshotId).raw_json;
    const stmts = observationStatements(d1, extractObservations("duolingo-lang", raw, { snapshotId: r.snapshotId, userId: USER, observedAt: AT }));
    expect(stmts.length).toBeGreaterThan(0); // the statements exist and run: the keys, not their absence, are what stop the rows
    await d1.batch(stmts);
    expect(counts(db)).toEqual(before);
  });

  it("shouldAddTheSetOfASecondSnapshotWithADifferentPayloadAsItsOwnObservations", async () => {
    await ingestSnapshot(d1, lang(identityData));
    await ingestSnapshot(d1, lang({ ...identityData, courses: courses.map((c) => ({ ...c, xp: (c.xp ?? 0) + 1 })) }, { createdAt: "2026-10-06T11:00:00.000Z" }));
    expect(counts(db)).toMatchObject({ course_observations: 6, path_observations: 2, section_observations: 6, account_observations: 0 });
  });

  it("shouldKeepTheFirstValueWhenAConflictingRowForTheSameKeyIsWrittenLater", async () => {
    const r = await ingestSnapshot(d1, lang(identityData));
    const forged = JSON.stringify({ courses: [{ id: "DUOLINGO_XA_EN", xp: 123456 }] });
    await d1.batch(observationStatements(d1, extractObservations("duolingo-lang", forged, { snapshotId: r.snapshotId, userId: USER, observedAt: AT })));
    expect(db.prepare("SELECT xp FROM course_observations WHERE snapshot_id=? AND course_id='DUOLINGO_XA_EN'").get(r.snapshotId).xp).toBe(500);
  });
});

describe("a snapshot never exists without its observations (§4.5)", () => {
  it("shouldLeaveNoSnapshotBehindWhenAnObservationWriteFailsAndAllowTheRetryToApply", async () => {
    const { db, d1 } = setupTestDb();
    // D1 applies a batch as one transaction; the shared test helper does not, so this test makes it so.
    (d1 as any).batch = async (stmts: any[]) => {
      db.exec("BEGIN");
      try { for (const s of stmts) await s.run(); db.exec("COMMIT"); } catch (e) { db.exec("ROLLBACK"); throw e; }
    };
    db.exec("ALTER TABLE section_observations RENAME TO section_observations_off");
    await expect(ingestSnapshot(d1, lang(identityData))).rejects.toThrow();
    expect(Number(db.prepare("SELECT COUNT(*) c FROM snapshots").get().c)).toBe(0);
    expect(Number(db.prepare("SELECT COUNT(*) c FROM course_observations").get().c)).toBe(0); // the rows written before the failing one were rolled back

    db.exec("ALTER TABLE section_observations_off RENAME TO section_observations");
    const retry = await ingestSnapshot(d1, lang(identityData));
    expect(retry.deduplicated).toBe(false);
    expect(counts(db)).toMatchObject({ course_observations: 3, path_observations: 1, section_observations: 3 });
  });
});
