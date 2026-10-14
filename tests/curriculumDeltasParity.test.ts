// R5 parity gate: the observation-based getCurriculumDeltas must equal the previous raw_json implementation (kept here as the
// reference) on realistic payloads. Known, deliberate difference (not covered here): snapshots whose Path has a format error.
import { describe, it, expect } from "vitest";
import { setupTestDb } from "./helpers/testDb.ts";
import { ingestSnapshot } from "../src/api/import.ts";
import { getCurriculumDeltas } from "../src/api/languagesAnalytics.ts";
import { compareCurriculumSnapshots } from "../src/analytics/languages/index.ts";

const USER = "1000001";
const at = (d: number, h = 10) => `2026-09-${String(d).padStart(2, "0")}T${String(h).padStart(2, "0")}:00:00.000Z`;

// The implementation R5 had before it read observations (src/api/languagesAnalytics.ts @ 40096eb), verbatim in behaviour.
async function legacy(db: D1Database, userId: string) {
  const rows = ((await db.prepare(`
    SELECT created_at, raw_json FROM (
      SELECT created_at, raw_json,
        ROW_NUMBER() OVER (PARTITION BY course_id ORDER BY created_at ASC) AS from_start,
        ROW_NUMBER() OVER (PARTITION BY course_id ORDER BY created_at DESC) AS from_end
      FROM (
        SELECT created_at, raw_json,
          CASE WHEN json_valid(raw_json) AND json_type(raw_json, '$.currentCourse.pathSectioned') = 'array'
            THEN json_extract(raw_json, '$.currentCourse.id') END AS course_id
        FROM snapshots WHERE user_id = ? AND source = 'duolingo-lang' AND raw_json LIKE '%pathSectioned%'
      ) WHERE course_id IS NOT NULL AND course_id <> ''
    ) WHERE from_start = 1 OR from_end = 1 ORDER BY created_at ASC
  `).bind(userId).all<any>()).results ?? []);
  const byCourse = new Map<string, any[]>();
  for (const row of rows) {
    const c = JSON.parse(row.raw_json).currentCourse;
    if (!c?.id || !Array.isArray(c.pathSectioned)) continue;
    const obs = { courseId: c.id, observedAt: row.created_at, sections: c.pathSectioned.map((s: any) => ({ sectionIndex: s.index ?? 0, completedUnits: s.completedUnits ?? 0, totalUnits: s.totalUnits ?? 0 })) };
    (byCourse.get(c.id) ?? byCourse.set(c.id, []).get(c.id)!).push(obs);
  }
  const out: any[] = [];
  for (const l of byCourse.values()) out.push(l.length >= 2 ? compareCurriculumSnapshots(l[0], l[l.length - 1]) : compareCurriculumSnapshots(null, l[0]));
  return out;
}

const sec = (index: number, done: number | undefined, total: number | undefined, extra: object = {}) => ({ id: `s${index}`, index, type: "learning", units: [], completedUnits: done, totalUnits: total, ...extra });
const snap = (course: string, sections: any[], over: object = {}) => ({ user: { id: 1000001 }, courses: [{ id: course, subject: "language", xp: 1 }], currentCourse: { id: course, pathSectioned: sections }, ...over });

async function world(items: Array<{ day: number; data: unknown; aux?: boolean; user?: string }>) {
  const { d1 } = setupTestDb();
  for (const [i, it] of items.entries()) await ingestSnapshot(d1, { source: "duolingo-lang", userId: it.user ?? USER, data: it.data, createdAt: at(it.day, 8 + (i % 10)), isAuxiliary: it.aux });
  return d1;
}
const sortById = (xs: any[]) => [...xs].sort((a, b) => String(a.courseId).localeCompare(String(b.courseId)));
const same = async (d1: D1Database) => expect(sortById(await getCurriculumDeltas(d1, USER))).toEqual(sortById(await legacy(d1, USER)));

describe("R5 parity: observations vs raw_json", () => {
  it("shouldEqualLegacyWhenSeveralCoursesAreObservedManyTimes", async () => {
    await same(await world([
      { day: 10, data: snap("DUOLINGO_XA_EN", [sec(0, 10, 40), sec(1, 0, 20)]) },
      { day: 12, data: snap("DUOLINGO_XB_ES", [sec(0, 3, 30)]) },
      { day: 15, data: snap("DUOLINGO_XA_EN", [sec(0, 14, 40), sec(1, 2, 20)]) },
      { day: 20, data: snap("DUOLINGO_XA_EN", [sec(0, 20, 40), sec(1, 5, 20)]) },
      { day: 21, data: snap("DUOLINGO_XB_ES", [sec(0, 9, 30)]) },
    ]));
  });

  it("shouldEqualLegacyWhenACourseIsObservedOnlyOnce", async () => {
    await same(await world([{ day: 10, data: snap("DUOLINGO_XA_EN", [sec(0, 5, 40)]) }]));
  });

  it("shouldEqualLegacyWhenTheTreeIsRestructuredBetweenObservations", async () => {
    await same(await world([
      { day: 10, data: snap("DUOLINGO_XA_EN", [sec(0, 5, 40)]) },
      { day: 20, data: snap("DUOLINGO_XA_EN", [sec(0, 6, 40), sec(1, 0, 25)]) }, // a section appeared: structural_change
    ]));
  });

  it("shouldEqualLegacyWhenCountsAreAbsent", async () => {
    await same(await world([
      { day: 10, data: snap("DUOLINGO_XA_EN", [sec(0, undefined, undefined)]) },
      { day: 20, data: snap("DUOLINGO_XA_EN", [sec(0, 4, undefined)]) },
    ]));
  });

  it("shouldEqualLegacyWhenAuxiliarySnapshotsCarryAPath", async () => {
    await same(await world([
      { day: 10, data: snap("DUOLINGO_XA_EN", [sec(0, 1, 40)]) },
      { day: 20, data: snap("DUOLINGO_XA_EN", [sec(0, 9, 40)]), aux: true },
    ]));
  });

  it("shouldEqualLegacyWhenThePathHasNoSections", async () => {
    await same(await world([
      { day: 10, data: snap("DUOLINGO_XA_EN", []) },
      { day: 20, data: snap("DUOLINGO_XA_EN", []) },
    ]));
  });

  it("shouldEqualLegacyWhenSnapshotsHaveNoPathOrNoCurrentCourse", async () => {
    await same(await world([
      { day: 10, data: { user: { id: 1000001, totalXp: 5, streak: 1, currentCourseId: "DUOLINGO_XA_EN" }, courses: [] } },
      { day: 11, data: { user: { id: 1000001 }, currentCourse: { id: "DUOLINGO_XC_ES" } } }, // course without a path
      { day: 12, data: snap("DUOLINGO_XA_EN", [sec(0, 1, 40)]) },
    ]));
  });

  it("shouldEqualLegacyAndIgnoreOtherUsers", async () => {
    const d1 = await world([
      { day: 10, data: snap("DUOLINGO_XA_EN", [sec(0, 1, 40)]) },
      { day: 11, data: snap("DUOLINGO_XA_EN", [sec(0, 30, 40)]), user: "someone-else" },
      { day: 20, data: snap("DUOLINGO_XA_EN", [sec(0, 9, 40)]) },
    ]);
    await same(d1);
    expect((await getCurriculumDeltas(d1, USER))[0]).toMatchObject({ deltaCompletedUnits: 8 });
  });

  it("shouldReturnEmptyWhenThereIsNoData", async () => {
    const { d1 } = setupTestDb();
    expect(await getCurriculumDeltas(d1, USER)).toEqual([]);
  });

  it("shouldNotReadRawJsonAnymore", async () => {
    const d1 = await world([{ day: 10, data: snap("DUOLINGO_XA_EN", [sec(0, 1, 40)]) }, { day: 20, data: snap("DUOLINGO_XA_EN", [sec(0, 9, 40)]) }]);
    const seen: string[] = [];
    const spy = { prepare: (sql: string) => (seen.push(sql), (d1 as any).prepare(sql)) } as unknown as D1Database;
    await getCurriculumDeltas(spy, USER);
    expect(seen.join("\n")).not.toMatch(/raw_json|FROM snapshots/i);
  });
});
