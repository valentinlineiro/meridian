import { describe, it, expect } from "vitest";
import { setupTestDb } from "./helpers/testDb.ts";
import { ingestSnapshot } from "../src/api/import.ts";
import { getCurriculumDeltas } from "../src/api/languagesAnalytics.ts";

const USER = "1000001";
const course = (id: string, completed: number, total = 40) => ({
  user: { id: 1000001 },
  currentCourse: { id, pathSectioned: [{ id: "s0", index: 0, completedUnits: completed, totalUnits: total }] },
});
const at = (day: number) => `2026-09-${String(day).padStart(2, "0")}T10:00:00.000Z`;
const seed = async (d1: D1Database, data: unknown, createdAt: string) =>
  ingestSnapshot(d1, { source: "duolingo-lang", userId: USER, data, createdAt });

// Counts the rows that actually cross the D1 boundary, which is what costs Worker CPU and memory.
function countingD1(d1: any) {
  const counter = { rows: 0 };
  const wrap = (st: any): any => ({
    ...st,
    bind: (...a: any[]) => wrap(st.bind(...a)),
    all: async () => { const r = await st.all(); counter.rows += r.results.length; return r; },
  });
  return { d1: { ...d1, prepare: (sql: string) => wrap(d1.prepare(sql)) } as D1Database, counter };
}

async function history() {
  const { db, d1 } = setupTestDb();
  for (let i = 0; i < 12; i++) await seed(d1, course("DUOLINGO_XA_EN", 10 + i), at(10 + i)); // 12 observations of A
  await seed(d1, course("DUOLINGO_XB_EN", 5, 30), at(15)); // a single observation of B
  await seed(d1, { user: { id: 1000001, totalXp: 1, streak: 1, currentCourseId: "DUOLINGO_XA_EN" }, courses: [] }, at(16)); // account snapshot: no path
  await seed(d1, { user: { id: 1000001 }, currentCourse: { id: "DUOLINGO_XC_ES" } }, at(17)); // course without a path
  db.prepare("INSERT INTO snapshots (id, created_at, source, user_id, raw_json, games_count, pages_count, checksum, size_bytes) VALUES (?,?,?,?,?,0,0,?,0)")
    .run("bad", at(18), "duolingo-lang", USER, "not json pathSectioned", "bad"); // corrupt row that matches a naive text filter
  return d1;
}

describe("curriculum deltas read model", () => {
  it("shouldCompareTheFirstAndLastObservationOfEachCourse", async () => {
    const deltas = await getCurriculumDeltas(await history(), USER);
    expect(deltas).toEqual([
      { courseId: "DUOLINGO_XA_EN", previousObservedAt: at(10), latestObservedAt: at(21), previousTotalUnits: 40, latestTotalUnits: 40, deltaCompletedUnits: 11, status: "comparable" },
      { courseId: "DUOLINGO_XB_EN", previousObservedAt: "", latestObservedAt: at(15), previousTotalUnits: 0, latestTotalUnits: 30, deltaCompletedUnits: null, status: "insufficient_observation" },
    ]);
  });

  it("shouldReadAtMostTheFirstAndLastSnapshotOfEachCourseFromTheDatabase", async () => {
    const { d1, counter } = countingD1(await history());
    await getCurriculumDeltas(d1, USER);
    expect(counter.rows).toBeLessThanOrEqual(2 * 2); // two courses with a path, never the whole history
  });

  it("shouldIgnoreOtherUsersWhenReadingCurriculumDeltas", async () => {
    const { d1 } = setupTestDb();
    await ingestSnapshot(d1, { source: "duolingo-lang", userId: "someone-else", data: course("DUOLINGO_XA_EN", 1), createdAt: at(10) });
    expect(await getCurriculumDeltas(d1, USER)).toEqual([]);
  });
});
