import { parseCourseProgress, summarizeCourseProgress, buildCourseProgressIndex, CourseProgressFormatError, type CourseProgress, type CourseProgressSummary, type CourseProgressIndexEntry } from "./courseProgress.ts";

export type XpSummary = {
  date: number;
  gainedXp: number;
  numSessions: number;
  totalSessionTime: number;
  streakExtended?: boolean;
  frozen?: boolean;
  repaired?: boolean;
  dailyGoalXp?: number;
};

export type LangStats = {
  totalXp: number | null;
  streak: number | null;
  currentCourseId: string | null;
  courses: Array<{ id: string; title: string | null; xp: number | null; fromLanguage: string | null; learningLanguage: string | null }>;
  summaries: XpSummary[];
  totals: {
    days: number;
    activeDays: number;
    gainedXp: number;
    sessions: number;
    totalTime: number;
    avgXpPerDay: number | null;
    avgXpPerActiveDay: number | null;
    avgSessionsPerDay: number | null;
    avgTimePerDay: number | null;
    xpPerSession: number | null;
    timePerSession: number | null;
  };
  courseProgress: CourseProgress | null; // current snapshot's own currentCourse (unparsed history), kept for backward compat
  courseProgressSummary: CourseProgressSummary | null;
  courseProgressError: string | null; // currentCourse present but its structure changed; rest of Lang still works
  courseProgressIndex: CourseProgressIndexEntry[]; // one Path per course, each from the last snapshot that saw it loaded
};

/**
 * `courseHistory` is every recent snapshot's currentCourse (oldest→newest or any order), used to accumulate
 * a Path per course across syncs — the source only ever returns the path of the course open at capture time.
 * Defaults to just `data`'s own currentCourse for callers (and existing tests) that don't track history.
 */
export function summarizeLang(data: any, courseHistory?: Array<{ currentCourse: unknown; createdAt: string }>): LangStats {
  const user = data?.user ?? data ?? {};
  const coursesRaw: any[] = Array.isArray(data?.courses) ? data.courses : Array.isArray(user?.courses) ? user.courses : [];
  const summariesRaw: any[] = Array.isArray(data?.xp_summaries) ? data.xp_summaries : Array.isArray(data?.xpSummaries) ? data.xpSummaries : [];

  const courses = coursesRaw.map((c) => ({
    id: String(c.id ?? c.courseId ?? ""),
    title: typeof c.title === "string" ? c.title : null,
    xp: typeof c.xp === "number" && Number.isFinite(c.xp) ? c.xp : null,
    fromLanguage: typeof c.fromLanguage === "string" ? c.fromLanguage : null,
    learningLanguage: typeof c.learningLanguage === "string" ? c.learningLanguage : null,
  })).filter((c) => c.id);

  const summaries: XpSummary[] = summariesRaw
    .map((s) => ({
      date: typeof s.date === "number" ? s.date : 0,
      gainedXp: typeof s.gainedXp === "number" ? s.gainedXp : 0,
      numSessions: typeof s.numSessions === "number" ? s.numSessions : 0,
      totalSessionTime: typeof s.totalSessionTime === "number" ? s.totalSessionTime : 0,
      streakExtended: typeof s.streakExtended === "boolean" ? s.streakExtended : undefined,
      frozen: typeof s.frozen === "boolean" ? s.frozen : undefined,
      repaired: typeof s.repaired === "boolean" ? s.repaired : undefined,
      dailyGoalXp: typeof s.dailyGoalXp === "number" ? s.dailyGoalXp : undefined,
    }))
    .filter((s) => s.date)
    .sort((a, b) => a.date - b.date);

  const days = summaries.length;
  const activeDays = summaries.filter((s) => s.gainedXp > 0).length;
  const gainedXp = summaries.reduce((a, s) => a + s.gainedXp, 0);
  const sessions = summaries.reduce((a, s) => a + s.numSessions, 0);
  const totalTime = summaries.reduce((a, s) => a + s.totalSessionTime, 0);

  let courseProgress: CourseProgress | null = null, courseProgressError: string | null = null;
  try { courseProgress = parseCourseProgress(data?.currentCourse, coursesRaw); }
  catch (e) { if (!(e instanceof CourseProgressFormatError)) throw e; courseProgressError = e.message; }

  const history = courseHistory ?? (data?.currentCourse != null ? [{ currentCourse: data.currentCourse, createdAt: "" }] : []);
  const courseProgressIndex = buildCourseProgressIndex(history, coursesRaw);

  return {
    totalXp: typeof user.totalXp === "number" ? user.totalXp : typeof data?.totalXp === "number" ? data.totalXp : null,
    streak: typeof user.streak === "number" ? user.streak : typeof data?.streak === "number" ? data.streak : null,
    currentCourseId: typeof user.currentCourseId === "string" ? user.currentCourseId : null,
    courses,
    summaries,
    totals: {
      days,
      activeDays,
      gainedXp,
      sessions,
      totalTime,
      avgXpPerDay: days ? gainedXp / days : null,
      avgXpPerActiveDay: activeDays ? gainedXp / activeDays : null,
      avgSessionsPerDay: days ? sessions / days : null,
      avgTimePerDay: days ? totalTime / days : null,
      xpPerSession: sessions ? gainedXp / sessions : null,
      timePerSession: sessions ? totalTime / sessions : null,
    },
    courseProgress,
    courseProgressSummary: summarizeCourseProgress(courseProgress),
    courseProgressError,
    courseProgressIndex,
  };
}
