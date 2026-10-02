import type { LanguagePort } from "../ports/languagePort.ts";

type CourseResult = {
  courseId: string;
  title: string | null;
  learningLanguage: string | null;
  fromLanguage: string | null;
  subject: string | null;
  topic: string | null;
  xp: number | null;
  lastSeenAt: string;
};

type SectionResult = {
  sectionId: string;
  sectionIndex: number;
  type: string | null;
  cefrLevel: string | null;
  cefrSublevel: string | number | null;
  completedUnits: number;
  totalUnits: number;
  lastSeenAt: string;
};

export type LanguageCourseResult =
  | { kind: "ok"; userId: string; course: CourseResult; sections: SectionResult[] }
  | { kind: "no_user" }
  | { kind: "no_course" };

export async function getLanguageCourse(
  port: LanguagePort,
  courseId: string,
  explicitUserId?: string | null
): Promise<LanguageCourseResult> {
  const userId = await port.resolveUserId(explicitUserId);
  if (!userId) return { kind: "no_user" };

  const course = await port.getCourse(userId, courseId);
  if (!course) return { kind: "no_course" };

  const sectionsRows = await port.getCourseSections(userId, courseId);

  return {
    kind: "ok",
    userId,
    course: {
      courseId: course.course_id,
      title: course.title,
      learningLanguage: course.learning_language,
      fromLanguage: course.from_language,
      subject: course.subject,
      topic: course.topic,
      xp: course.xp,
      lastSeenAt: course.last_seen_at,
    },
    sections: sectionsRows.map((s) => ({
      sectionId: s.section_id,
      sectionIndex: s.section_index,
      type: s.type,
      cefrLevel: s.cefr_level,
      cefrSublevel: s.cefr_sublevel,
      completedUnits: s.completed_units,
      totalUnits: s.total_units,
      lastSeenAt: s.last_seen_at,
    })),
  };
}
