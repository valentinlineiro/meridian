import { describe, it, expect, beforeEach } from "vitest";
import { setupTestDb } from "./helpers/testDb.ts";
import { ingestSnapshot } from "../src/api/import.ts";
import { applyPathState } from "../src/db/storePathState.ts";
import { extractPathTree } from "../src/normalization/pathTree.ts";
import { parseCourseProgress } from "../src/analytics/courseProgress.ts";
import { rebuildProgress, type Tree } from "../src/domain/pathTree.ts";
import { syntheticSnapshot } from "../demo/syntheticCourse.ts";

const U = "1000001", C = "DUOLINGO_XA_EN";
const T = (n: number) => `2026-10-06T10:0${n}:00.000Z`;
const clone = () => structuredClone(syntheticSnapshot());
const unitsOf = (d: any) => d.currentCourse.pathSectioned.flatMap((s: any) => s.units);
const lang = (data: any, n: number) => ({ source: "duolingo-lang", userId: U, createdAt: T(n), data });
const apply = async (d1: any, data: any, n: number) => { const p = extractPathTree(data); return p ? applyPathState(d1, { userId: U, snapshotId: `s${n}`, observedAt: T(n), ...p }) : 0; };
const count = (db: any, t: string) => Number(db.prepare(`SELECT COUNT(*) c FROM ${t}`).get().c);
const state = (db: any) => db.prepare("SELECT snapshot_id, observed_at, tree_hash FROM course_path_state").get();
const snapshotOf = (db: any) => JSON.stringify([db.prepare("SELECT * FROM course_path_units ORDER BY unit_index").all(), db.prepare("SELECT * FROM course_path_levels ORDER BY unit_index, level_ordinal").all()]);

function readTree(db: any): Tree {
  return {
    units: db.prepare("SELECT section_index sectionIndex, unit_index unitIndex, teaching_objective teachingObjective, cefr_level cefrLevel, is_unlocked isUnlocked, levels_captured levelsCaptured FROM course_path_units").all().map((r: any) => ({ ...r })),
    levels: db.prepare("SELECT unit_index unitIndex, level_ordinal levelOrdinal, state, finished_sessions finishedSessions, total_sessions totalSessions, skill_id skillId, crown_level_index crownLevelIndex, tree_id treeId, reached_score reachedScore, learning_score learningScore, reached_progress reachedProgress, completed_progress completedProgress FROM course_path_levels").all().map((r: any) => ({ ...r })),
  };
}

describe("K5: course_path_state (contract A1)", () => {
  let db: any, d1: any;
  beforeEach(() => ({ db, d1 } = setupTestDb()));

  it("shouldRebuildTheSameCourseProgressAsParseCourseProgressWhenIngested", async () => {
    const data = clone();
    await ingestSnapshot(d1, lang(data, 1));
    const sections = db.prepare("SELECT section_index sectionIndex, section_id sectionId, type, cefr_level cefrLevel, cefr_sublevel cefrSublevel, completed_units completedUnits, total_units totalUnits FROM section_observations ORDER BY section_index").all().map((r: any) => ({ ...r }));
    const course = data.courses.find((c: any) => c.id === C);
    const rebuilt = rebuildProgress({ courseId: C, activeSectionId: data.currentCourse.activePathSectionId, sections, tree: readTree(db), course });
    expect(rebuilt).toEqual(parseCourseProgress(data.currentCourse, data.courses));
    expect(state(db)).toMatchObject({ snapshot_id: expect.any(String), observed_at: T(1) });
  });

  it("shouldWriteNothingButThePointerWhenTheTreeIsUnchanged", async () => {
    await apply(d1, clone(), 1);
    const before = snapshotOf(db), hash = state(db).tree_hash;
    const rotated = clone();
    rotated.currentCourse.pathSectioned.forEach((s: any) => { s.id = "rot-" + s.id; }); // section UUIDs rotate (migration 0009)
    rotated.currentCourse.activePathSectionId = "rot-" + rotated.currentCourse.activePathSectionId;
    expect(await apply(d1, rotated, 2)).toBe(1);
    expect(snapshotOf(db)).toBe(before);
    expect(state(db)).toMatchObject({ snapshot_id: "s2", observed_at: T(2), tree_hash: hash });
  });

  it("shouldWriteOnlyTheChangedLevelRowWhenOneLevelChanges", async () => {
    const a = clone();
    await apply(d1, a, 1);
    const b = clone();
    const lv = unitsOf(b).find((u: any) => u.levels)!.levels[1];
    lv.state = lv.state === "passed" ? "active" : "passed";
    expect(await apply(d1, b, 2)).toBe(2); // 1 level row + pointer
    expect(readTree(db).levels.map((l) => l.state)).toContain(lv.state);
    expect(state(db).snapshot_id).toBe("s2");
  });

  it("shouldReflectAPositionChangeWhenTwoLevelsSwap", async () => {
    await apply(d1, clone(), 1);
    const h1 = state(db).tree_hash;
    const b = clone();
    const u = unitsOf(b).find((x: any) => x.levels && new Set(x.levels.map((l: any) => l.state)).size > 1)!;
    u.levels.reverse();
    expect(await apply(d1, b, 2)).toBeGreaterThan(1);
    expect(state(db).tree_hash).not.toBe(h1);
  });

  it("shouldDeleteUnitsAndLevelsThatDisappear", async () => {
    await apply(d1, clone(), 1);
    const b = clone();
    b.currentCourse.pathSectioned[0].units.shift(); // drops a unit that had levels
    await apply(d1, b, 2);
    const fresh = setupTestDb();
    await apply(fresh.d1, b, 2);
    expect(snapshotOf(db)).toBe(snapshotOf(fresh.db)); // diff result == full write of the new tree
  });

  it("shouldNotTouchStateWhenTheSnapshotHasAFormatError", async () => {
    await apply(d1, clone(), 1);
    const before = snapshotOf(db), st = state(db);
    const bad = clone();
    bad.currentCourse.pathSectioned[0].units[0].levels[0].state = 7;
    expect(await apply(d1, bad, 2)).toBe(0);
    expect(snapshotOf(db)).toBe(before);
    expect(state(db)).toEqual(st);
  });

  it("shouldIgnoreASnapshotNotNewerThanTheStoredState", async () => {
    await apply(d1, clone(), 2);
    const older = clone();
    unitsOf(older)[0].teachingObjective = "changed";
    expect(await apply(d1, older, 1)).toBe(0);
    expect(await apply(d1, older, 2)).toBe(0);
    expect(state(db).snapshot_id).toBe("s2");
  });

  it("shouldWriteNothingWhenThereIsNoCurrentCourse", async () => {
    const d = clone(); delete d.currentCourse;
    expect(await apply(d1, d, 1)).toBe(0);
    expect(count(db, "course_path_state")).toBe(0);
  });

  it("shouldLeaveStateUntouchedWhenUnitIndexesRepeatAcrossSections", async () => {
    await apply(d1, clone(), 1);
    const before = snapshotOf(db), st = state(db);
    const bad = clone();
    bad.currentCourse.pathSectioned[1].units[0].unitIndex = bad.currentCourse.pathSectioned[0].units[0].unitIndex; // per-section numbering
    expect(await apply(d1, bad, 2)).toBe(0);
    expect(snapshotOf(db)).toBe(before);
    expect(state(db)).toEqual(st);
  });

  it("shouldLeaveStateUntouchedWhenUnitsInASectionAreNotInIndexOrder", async () => {
    await apply(d1, clone(), 1);
    const bad = clone();
    bad.currentCourse.pathSectioned[0].units.reverse();
    expect(await apply(d1, bad, 2)).toBe(0);
  });
});
