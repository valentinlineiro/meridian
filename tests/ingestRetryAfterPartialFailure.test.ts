import { describe, it, expect, beforeEach } from "vitest";
import { setupTestDb } from "./helpers/testDb.ts";
import { ingestSnapshot } from "../src/api/import.ts";
import { failOnceOn } from "./helpers/failOnce.ts";

// The snapshot row carries the UNIQUE checksum that deduplicates retries. It must be written after the derived state,
// otherwise a failure in between leaves a snapshot whose retry is swallowed as a duplicate and never applied.

const count = (db: any, sql: string) => Number((db.prepare(sql).get() as any).c);

describe("ingestion retry after a partial failure", () => {
  let db: any;
  let d1: D1Database;
  beforeEach(() => ({ db, d1 } = setupTestDb()));

  const account = {
    source: "duolingo-lang", userId: "1000001", syncId: "s1", isAuxiliary: false, originalCourseId: "DUOLINGO_XA_EN",
    data: {
      user: { id: 1000001, totalXp: 500, streak: 7, currentCourseId: "DUOLINGO_XA_EN" },
      courses: [{ id: "DUOLINGO_XA_EN", title: "Demo Alpha", subject: "language", learningLanguage: "xa", fromLanguage: "en", xp: 500 }],
      xp_summaries: [{ date: 1790121600, gainedXp: 80, numSessions: 4, totalSessionTime: 600 }],
    },
  };

  it("shouldApplyTheAccountObservationWhenTheIdenticalSnapshotIsRetriedAfterAFailure", async () => {
    const flaky = failOnceOn(d1, "xp_summaries");
    await expect(ingestSnapshot(flaky, account)).rejects.toThrow("transient D1 error");
    expect(count(db, "SELECT COUNT(*) c FROM snapshots")).toBe(0); // nothing claims the checksum yet

    const retry = await ingestSnapshot(flaky, account);
    expect(retry.deduplicated).toBe(false);
    expect(count(db, "SELECT COUNT(*) c FROM snapshots")).toBe(1);
    expect(count(db, "SELECT COUNT(*) c FROM xp_summaries")).toBe(1);
    expect((db.prepare("SELECT total_xp, streak, current_course_id FROM user_state").get() as any)).toMatchObject({ total_xp: 500, streak: 7, current_course_id: "DUOLINGO_XA_EN" });
  });

  it("shouldStillDeduplicateAnIdenticalSnapshotWhenTheFirstOneWasFullyApplied", async () => {
    const first = await ingestSnapshot(d1, account);
    const again = await ingestSnapshot(d1, account);
    expect(again.deduplicated).toBe(true);
    expect(again.snapshotId).toBe(first.snapshotId);
    expect(count(db, "SELECT COUNT(*) c FROM snapshots")).toBe(1);
  });

  it("shouldApplyTheMatchesWhenAnIdenticalChessSnapshotIsRetriedAfterAFailure", async () => {
    const chess = { source: "duolingo-chess", userId: "1000001", data: { matchHistory: [{ matchId: "bot|1790121600|a" }, { matchId: "bot|1790121700|b" }] } };
    const flaky = failOnceOn(d1, "matches");
    await expect(ingestSnapshot(flaky, chess)).rejects.toThrow("transient D1 error");
    expect(count(db, "SELECT COUNT(*) c FROM snapshots")).toBe(0);

    const retry = await ingestSnapshot(flaky, chess);
    expect(retry.deduplicated).toBe(false);
    expect(count(db, "SELECT COUNT(*) c FROM snapshots")).toBe(1);
    expect(count(db, "SELECT COUNT(*) c FROM matches")).toBe(2);
  });
});

describe("snapshot control fields", () => {
  it("shouldNeverStoreACourseSnapshotWithoutItsAuxiliaryFlagWhenTheInsertFails", async () => {
    const { db, d1 } = setupTestDb();
    const course = {
      source: "duolingo-lang", userId: "1000001", syncId: "s1", isAuxiliary: true, originalCourseId: "DUOLINGO_XA_EN", observedCourseId: "DUOLINGO_XB_EN",
      data: { user: { id: 1000001 }, courses: [{ id: "DUOLINGO_XB_EN", subject: "language" }], currentCourse: { id: "DUOLINGO_XB_EN", pathSectioned: [] } },
    };
    // a failing insert used to be retried without sync_id / is_auxiliary, and is_auxiliary defaults to 0 (= an account observation)
    await expect(ingestSnapshot(failOnceOn(d1, "snapshots"), course)).rejects.toThrow("transient D1 error");
    expect(count(db, "SELECT COUNT(*) c FROM snapshots WHERE is_auxiliary = 0")).toBe(0);
    expect(count(db, "SELECT COUNT(*) c FROM snapshots")).toBe(0);
  });
});
