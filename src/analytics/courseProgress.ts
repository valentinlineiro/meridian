// Course progress parsed from an observed snapshot of a course (`currentCourse`).
// Only one course carries a full path per snapshot; the other entries in courses[] carry XP only.

import type { Cefr, CourseLevel, CourseUnit, CourseSection, CourseProgress } from "../domain/courseProgress.ts";
export type { Cefr, CourseLevel, CourseUnit, CourseSection, CourseProgress };

export class CourseProgressFormatError extends Error {
  constructor(path: string, expected: string) {
    super(`currentCourse: ${path} is not ${expected}`);
    this.name = "CourseProgressFormatError";
  }
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown) => (typeof v === "string" ? v : null);
const isObj = (v: unknown): v is Record<string, any> => typeof v === "object" && v !== null && !Array.isArray(v);

function required<T>(v: T | null, path: string, expected: string): T {
  if (v === null) throw new CourseProgressFormatError(path, expected);
  return v;
}
function requiredArray(v: unknown, path: string): any[] {
  if (!Array.isArray(v)) throw new CourseProgressFormatError(path, "an array");
  return v;
}

function parseLevel(raw: any, path: string): CourseLevel {
  if (!isObj(raw)) throw new CourseProgressFormatError(path, "an object");
  const meta = isObj(raw.pathLevelMetadata) ? raw.pathLevelMetadata : {};
  const score = isObj(raw.levelScoreInfo) ? raw.levelScoreInfo : {};
  return {
    state: required(str(raw.state), `${path}.state`, "a string"),
    finishedSessions: num(raw.finishedSessions),
    totalSessions: num(raw.totalSessions),
    skillId: str(meta.skillId),
    crownLevelIndex: num(meta.crownLevelIndex),
    treeId: str(meta.treeId),
    reachedScore: num(score.reachedScore),
    learningScore: num(score.learningScore),
    reachedProgress: num(score.reachedProgress),
    completedProgress: num(score.completedProgress),
  };
}

function parseUnit(raw: any, path: string): CourseUnit {
  if (!isObj(raw)) throw new CourseProgressFormatError(path, "an object");
  return {
    index: required(num(raw.unitIndex), `${path}.unitIndex`, "a number"),
    teachingObjective: str(raw.teachingObjective),
    cefrLevel: str(raw.cefrLevel),
    isUnlocked: typeof raw.isUnlocked === "boolean" ? raw.isUnlocked : null,
    levels: raw.levels == null ? null : requiredArray(raw.levels, `${path}.levels`).map((l, i) => parseLevel(l, `${path}.levels[${i}]`)),
  };
}

function parseCefr(raw: unknown): Cefr | null {
  if (!isObj(raw) || typeof raw.level !== "string") return null;
  return { level: raw.level, sublevel: num(raw.sublevel) };
}

function parseSection(raw: any, path: string): CourseSection {
  if (!isObj(raw)) throw new CourseProgressFormatError(path, "an object");
  return {
    index: required(num(raw.index), `${path}.index`, "a number"),
    id: required(str(raw.id), `${path}.id`, "a string"),
    type: str(raw.type),
    cefr: parseCefr(raw.cefr),
    completedUnits: num(raw.completedUnits),
    totalUnits: num(raw.totalUnits),
    units: requiredArray(raw.units, `${path}.units`).map((u, i) => parseUnit(u, `${path}.units[${i}]`)),
  };
}

/** null when the source sent no currentCourse; throws CourseProgressFormatError when its structure changed. */
export function parseCourseProgress(currentCourse: unknown, courses: unknown): CourseProgress | null {
  if (currentCourse == null) return null;
  if (!isObj(currentCourse)) throw new CourseProgressFormatError("currentCourse", "an object");
  const courseId = required(str(currentCourse.id), "id", "a string");
  const sections = requiredArray(currentCourse.pathSectioned, "pathSectioned").map((s, i) => parseSection(s, `pathSectioned[${i}]`));
  const course = Array.isArray(courses) ? courses.find((c) => isObj(c) && c.id === courseId) : undefined;
  return {
    courseId,
    activeSectionId: str(currentCourse.activePathSectionId),
    sections,
    title: str(course?.title),
    xp: num(course?.xp),
    fromLanguage: str(course?.fromLanguage),
    learningLanguage: str(course?.learningLanguage),
  };
}

export type SectionSummary = {
  index: number;
  type: string | null;
  cefr: string | null;
  completedUnits: number | null;
  totalUnits: number | null;
  completionRatio: number | null;
};

export type CourseProgressSummary = {
  courseId: string;
  title: string | null;
  xp: number | null;
  learningLanguage: string | null;
  currentCefr: string | null; // CEFR of the active section
  activeSection: SectionSummary | null;
  completedUnits: number | null; // sum over `learning` sections with explicit counts
  totalUnits: number | null;
  completionRatio: number | null;
  sections: SectionSummary[];
};

/** "A1" + 2 -> "A1.2"; only joins the two fields the source sends. */
export const formatCefr = (c: Cefr | null) => (c ? (c.sublevel != null ? `${c.level}.${c.sublevel}` : c.level) : null);

const ratio = (done: number | null, total: number | null) => (done != null && total != null && total > 0 ? done / total : null);

export type CourseProgressIndexEntry = {
  courseId: string;
  capturedAt: string; // createdAt of the snapshot this entry's Path came from — independent of course XP freshness
  summary: CourseProgressSummary | null; // null when that snapshot's currentCourse no longer matches the expected shape
  formatError: string | null;
};

/**
 * One Path per course, each from whichever snapshot last saw that course loaded — the source only ever
 * sends the path of the course open at capture time, so this is how multiple courses' Paths accumulate
 * over ordinary use instead of one sync overwriting the last. `courses` should be the most recent known
 * courses[] (XP/title always reflect *now*; only the Path carries its own `capturedAt`).
 */
export function buildCourseProgressIndex(snapshots: Array<{ currentCourse: unknown; createdAt: string }>, courses: unknown): CourseProgressIndexEntry[] {
  const latestByCourseId = new Map<string, { currentCourse: unknown; createdAt: string }>();
  for (const snap of snapshots) {
    if (!isObj(snap.currentCourse) || typeof snap.currentCourse.id !== "string") continue;
    const id = snap.currentCourse.id;
    const prev = latestByCourseId.get(id);
    if (!prev || snap.createdAt > prev.createdAt) latestByCourseId.set(id, snap);
  }
  return [...latestByCourseId.entries()].map(([courseId, snap]) => {
    try {
      return { courseId, capturedAt: snap.createdAt, summary: summarizeCourseProgress(parseCourseProgress(snap.currentCourse, courses)), formatError: null };
    } catch (e) {
      if (!(e instanceof CourseProgressFormatError)) throw e;
      return { courseId, capturedAt: snap.createdAt, summary: null, formatError: e.message };
    }
  });
}

export function summarizeCourseProgress(cp: CourseProgress | null): CourseProgressSummary | null {
  if (!cp) return null;
  const sections: SectionSummary[] = cp.sections.map((s) => ({
    index: s.index, type: s.type, cefr: formatCefr(s.cefr),
    completedUnits: s.completedUnits, totalUnits: s.totalUnits, completionRatio: ratio(s.completedUnits, s.totalUnits),
  }));
  // ponytail: non-`learning` sections (daily_refresh) are not path progress, so they stay out of the course total
  const counted = cp.sections.filter((s) => s.type === "learning" && s.completedUnits != null && s.totalUnits != null);
  const completedUnits = counted.length ? counted.reduce((a, s) => a + s.completedUnits!, 0) : null;
  const totalUnits = counted.length ? counted.reduce((a, s) => a + s.totalUnits!, 0) : null;
  const activeIdx = cp.sections.findIndex((s) => s.id === cp.activeSectionId);
  const activeSection = activeIdx >= 0 ? sections[activeIdx]! : null;
  return {
    courseId: cp.courseId, title: cp.title, xp: cp.xp, learningLanguage: cp.learningLanguage,
    currentCefr: activeSection?.cefr ?? null,
    activeSection,
    completedUnits, totalUnits, completionRatio: ratio(completedUnits, totalUnits),
    sections,
  };
}
