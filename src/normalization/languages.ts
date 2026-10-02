// Normalization for duolingo-lang ingestion contract v0.1

export interface NormalizedUserState {
  userId: string;
  totalXp: number | null;
  streak: number | null;
  currentCourseId: string | null;
  isAuxiliary: boolean;
  originalCourseId: string | null;
  observedCourseId: string | null;
}

export interface NormalizedCourse {
  userId: string;
  courseId: string;
  title: string | null;
  learningLanguage: string | null;
  fromLanguage: string | null;
  subject: string | null;
  topic: string | null;
  xp: number | null;
}

export interface NormalizedSection {
  userId: string;
  courseId: string;
  sectionId: string;
  sectionIndex: number;
  type: string | null;
  cefrLevel: string | null;
  cefrSublevel: number | null;
  completedUnits: number | null;
  totalUnits: number | null;
}

export interface NormalizedXpSummary {
  userId: string;
  date: number;
  gainedXp: number;
  numSessions: number;
  totalSessionTime: number;
  streakExtended: number | null;
  frozen: number | null;
  repaired: number | null;
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
const boolToInt = (v: unknown): number | null => (typeof v === "boolean" ? (v ? 1 : 0) : null);

export function normalizeLanguagePayload(args: {
  userId: string;
  data: any;
  isAuxiliary?: boolean;
  originalCourseId?: string;
  observedCourseId?: string;
}): {
  userState: NormalizedUserState;
  courses: NormalizedCourse[];
  sections: NormalizedSection[];
  xpSummaries: NormalizedXpSummary[];
} {
  const { userId, data } = args;
  const userObj = data?.user ?? data ?? {};

  const observedCourseId = args.observedCourseId ?? str(data?.currentCourse?.id) ?? null;
  const originalCourseId = args.originalCourseId ?? str(userObj?.currentCourseId) ?? null;
  const isAuxiliary = Boolean(
    args.isAuxiliary || (originalCourseId && observedCourseId && originalCourseId !== observedCourseId)
  );

  const userState: NormalizedUserState = {
    userId,
    totalXp: num(userObj.totalXp) ?? num(data?.totalXp),
    streak: num(userObj.streak) ?? num(data?.streak),
    currentCourseId: str(userObj.currentCourseId) ?? str(data?.currentCourseId),
    isAuxiliary,
    originalCourseId,
    observedCourseId,
  };

  // Courses: Only language courses (Invariant 9: subject === 'language' or learningLanguage present)
  const rawCourses: any[] = Array.isArray(data?.courses)
    ? data.courses
    : Array.isArray(userObj?.courses)
    ? userObj.courses
    : [];

  const courses: NormalizedCourse[] = rawCourses
    .map((c) => {
      const cid = str(c.id ?? c.courseId);
      const subject = str(c.subject) ?? (cid?.startsWith("DUOLINGO_") ? "language" : null);
      return {
        userId,
        courseId: cid || "",
        title: str(c.title),
        learningLanguage: str(c.learningLanguage),
        fromLanguage: str(c.fromLanguage),
        subject,
        topic: str(c.topic),
        xp: num(c.xp),
      };
    })
    .filter((c) => c.courseId && c.subject === "language");

  // Sections: if currentCourse is present with pathSectioned
  const sections: NormalizedSection[] = [];
  const currentCourse = data?.currentCourse;
  if (currentCourse && typeof currentCourse === "object" && currentCourse.id) {
    const courseId = String(currentCourse.id);
    const pathSectioned = Array.isArray(currentCourse.pathSectioned) ? currentCourse.pathSectioned : [];
    for (const s of pathSectioned) {
      if (s && s.id != null) {
        const cefrObj = typeof s.cefr === "object" && s.cefr !== null ? s.cefr : null;
        sections.push({
          userId,
          courseId,
          sectionId: String(s.id),
          sectionIndex: typeof s.index === "number" ? s.index : 0,
          type: str(s.type),
          cefrLevel: cefrObj ? str(cefrObj.level) : null,
          cefrSublevel: cefrObj ? num(cefrObj.sublevel) : null,
          completedUnits: num(s.completedUnits),
          totalUnits: num(s.totalUnits),
        });
      }
    }
  }

  // XP Summaries: daily time-series
  const rawSummaries: any[] = Array.isArray(data?.xpSummaries)
    ? data.xpSummaries
    : Array.isArray(data?.xp_summaries)
    ? data.xp_summaries
    : [];

  const xpSummaries: NormalizedXpSummary[] = rawSummaries
    .map((s) => ({
      userId,
      date: typeof s.date === "number" ? s.date : 0,
      gainedXp: typeof s.gainedXp === "number" ? s.gainedXp : 0,
      numSessions: typeof s.numSessions === "number" ? s.numSessions : 0,
      totalSessionTime: typeof s.totalSessionTime === "number" ? s.totalSessionTime : 0,
      streakExtended: boolToInt(s.streakExtended),
      frozen: boolToInt(s.frozen),
      repaired: boolToInt(s.repaired),
    }))
    .filter((s) => s.date > 0);

  return { userState, courses, sections, xpSummaries };
}
