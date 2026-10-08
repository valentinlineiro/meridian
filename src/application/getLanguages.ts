import type { LanguagePort } from "../ports/languagePort.ts";

export interface LanguagesOverviewResult {
  userId: string;
  currentCourseId: string | null;
  totalXp: number | null;
  streak: number | null;
  updatedAt: string | null;
  totalXpObservedAt: string | null;
  streakObservedAt: string | null;
  currentCourseObservedAt: string | null;
  courses: Array<{
    courseId: string;
    title: string | null;
    learningLanguage: string | null;
    fromLanguage: string | null;
    subject: string | null;
    topic: string | null;
    xp: number | null;
    lastSeenAt: string;
  }>;
}

export async function getLanguages(
  port: LanguagePort,
  explicitUserId?: string | null
): Promise<LanguagesOverviewResult | null> {
  const userId = await port.resolveUserId(explicitUserId);
  if (!userId) return null;

  const userState = await port.getUserState(userId);
  const coursesRows = await port.getUserCourses(userId);

  return {
    userId,
    currentCourseId: userState?.current_course_id ?? null,
    totalXp: userState?.total_xp ?? null,
    streak: userState?.streak ?? null,
    updatedAt: userState?.updated_at ?? null,
    totalXpObservedAt: userState?.total_xp_observed_at ?? null,
    streakObservedAt: userState?.streak_observed_at ?? null,
    currentCourseObservedAt: userState?.current_course_observed_at ?? null,
    courses: coursesRows.map((c) => ({
      courseId: c.course_id,
      title: c.title,
      learningLanguage: c.learning_language,
      fromLanguage: c.from_language,
      subject: c.subject,
      topic: c.topic,
      xp: c.xp,
      lastSeenAt: c.last_seen_at,
    })),
  };
}
