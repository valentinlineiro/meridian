// Pure model of K5 (contract §3.2, A1): the Path tree of a course as rows, its canonical form for hashing, the
// row-level diff, and the inverse (rows -> CourseProgress) that proves parity with parseCourseProgress.
import type { CourseProgress, CourseLevel, CourseUnit } from "./courseProgress.ts";
import type { SectionObservation } from "./observationRows.ts";

export type UnitRow = { sectionIndex: number; unitIndex: number; teachingObjective: string | null; cefrLevel: string | null; isUnlocked: number | null; levelsCaptured: number };
export type LevelRow = { unitIndex: number; levelOrdinal: number; state: string; finishedSessions: number | null; totalSessions: number | null; skillId: string | null; crownLevelIndex: number | null; treeId: string | null; reachedScore: number | null; learningScore: number | null; reachedProgress: number | null; completedProgress: number | null };
export type Tree = { units: UnitRow[]; levels: LevelRow[] };

/** True when K5's key (unit_index, course-wide) and its read order (unit_index within a section) would not represent the payload faithfully. */
export function violatesUnitKey(cp: CourseProgress): boolean {
  const seen = new Set<number>();
  for (const s of cp.sections) {
    let prev = -Infinity;
    for (const u of s.units) {
      if (seen.has(u.index) || u.index <= prev) return true;
      seen.add(u.index); prev = u.index;
    }
  }
  return false;
}

/** Flatten a parsed course. Callers must have checked violatesUnitKey: nothing is dropped here. */
export function treeRows(cp: CourseProgress): Tree {
  const tree: Tree = { units: [], levels: [] };
  for (const s of cp.sections) for (const u of s.units) {
    tree.units.push({ sectionIndex: s.index, unitIndex: u.index, teachingObjective: u.teachingObjective, cefrLevel: u.cefrLevel, isUnlocked: u.isUnlocked === null ? null : u.isUnlocked ? 1 : 0, levelsCaptured: u.levels ? 1 : 0 });
    (u.levels ?? []).forEach((l, i) => tree.levels.push({ unitIndex: u.index, levelOrdinal: i, state: l.state, finishedSessions: l.finishedSessions, totalSessions: l.totalSessions, skillId: l.skillId, crownLevelIndex: l.crownLevelIndex, treeId: l.treeId, reachedScore: l.reachedScore, learningScore: l.learningScore, reachedProgress: l.reachedProgress, completedProgress: l.completedProgress }));
  }
  return tree;
}

/** Serialization of exactly what K5 persists, in payload order (A1 §3). Excludes snapshot/section ids and timestamps. */
export function canonicalTree(t: Tree): string {
  const byUnit = new Map<number, LevelRow[]>();
  for (const l of t.levels) byUnit.set(l.unitIndex, [...(byUnit.get(l.unitIndex) ?? []), l]);
  return JSON.stringify(t.units.map((u) => [
    u.sectionIndex, u.unitIndex, u.teachingObjective, u.cefrLevel, u.isUnlocked, u.levelsCaptured,
    (byUnit.get(u.unitIndex) ?? []).map((l) => [l.levelOrdinal, l.state, l.finishedSessions, l.totalSessions, l.skillId, l.crownLevelIndex, l.treeId, l.reachedScore, l.learningScore, l.reachedProgress, l.completedProgress]),
  ]));
}

export type RowDiff<T> = { insert: T[]; update: T[]; delete: T[] };
export function diffRows<T>(stored: T[], next: T[], key: (r: T) => string): RowDiff<T> {
  const old = new Map(stored.map((r) => [key(r), r]));
  const d: RowDiff<T> = { insert: [], update: [], delete: [] };
  for (const r of next) {
    const o = old.get(key(r));
    if (!o) d.insert.push(r);
    else { old.delete(key(r)); if (JSON.stringify(o) !== JSON.stringify(r)) d.update.push(r); }
  }
  d.delete = [...old.values()];
  return d;
}
export const unitKey = (u: UnitRow) => String(u.unitIndex);
export const levelKey = (l: LevelRow) => `${l.unitIndex}/${l.levelOrdinal}`;

/** Inverse of treeRows + K4 + K2: what the read switch will serve. Units come back ordered by unit_index within their section. */
export function rebuildProgress(a: {
  courseId: string; activeSectionId: string | null; sections: SectionObservation[]; tree: Tree;
  course: { title: string | null; xp: number | null; fromLanguage: string | null; learningLanguage: string | null } | null;
}): CourseProgress {
  return {
    courseId: a.courseId,
    activeSectionId: a.activeSectionId,
    sections: a.sections.map((s) => ({
      index: s.sectionIndex, id: s.sectionId, type: s.type,
      cefr: s.cefrLevel === null ? null : { level: s.cefrLevel, sublevel: s.cefrSublevel },
      completedUnits: s.completedUnits, totalUnits: s.totalUnits,
      units: a.tree.units.filter((u) => u.sectionIndex === s.sectionIndex).sort((x, y) => x.unitIndex - y.unitIndex).map((u): CourseUnit => ({
        index: u.unitIndex, teachingObjective: u.teachingObjective, cefrLevel: u.cefrLevel,
        isUnlocked: u.isUnlocked === null ? null : u.isUnlocked === 1,
        levels: u.levelsCaptured ? a.tree.levels.filter((l) => l.unitIndex === u.unitIndex).sort((x, y) => x.levelOrdinal - y.levelOrdinal).map((l): CourseLevel => ({ state: l.state, finishedSessions: l.finishedSessions, totalSessions: l.totalSessions, skillId: l.skillId, crownLevelIndex: l.crownLevelIndex, treeId: l.treeId, reachedScore: l.reachedScore, learningScore: l.learningScore, reachedProgress: l.reachedProgress, completedProgress: l.completedProgress })) : null,
      })),
    })).sort((x, y) => x.index - y.index),
    title: a.course?.title ?? null, xp: a.course?.xp ?? null, fromLanguage: a.course?.fromLanguage ?? null, learningLanguage: a.course?.learningLanguage ?? null,
  };
}
