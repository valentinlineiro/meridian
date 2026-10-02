import { json } from "./import.ts";
import { resolveUserId } from "./languages.ts";
import {
  buildLanguagesAnalytics,
  compareCurriculumSnapshots,
  type CourseInput,
  type CurriculumObservationDelta,
  type CurriculumSnapshotInput,
  type SectionInput,
  type XpSummaryInput,
} from "../analytics/languages/index.ts";

export async function getCurriculumDeltas(db: D1Database, userId: string): Promise<CurriculumObservationDelta[]> {
  try {
    const rows = ((await db.prepare(`
      SELECT created_at, raw_json
      FROM snapshots
      WHERE user_id = ? AND source = 'duolingo-lang' AND raw_json LIKE '%pathSectioned%'
      ORDER BY created_at ASC
    `).bind(userId).all<any>()).results ?? []);

    if (rows.length === 0) return [];

    const courseObservations = new Map<string, CurriculumSnapshotInput[]>();

    for (const row of rows) {
      try {
        const parsed = JSON.parse(row.raw_json);
        const course = parsed.currentCourse;
        if (!course?.id || !Array.isArray(course.pathSectioned)) continue;

        const obs: CurriculumSnapshotInput = {
          courseId: course.id,
          observedAt: row.created_at,
          sections: course.pathSectioned.map((s: any) => ({
            sectionIndex: s.index ?? 0,
            completedUnits: s.completedUnits ?? 0,
            totalUnits: s.totalUnits ?? 0,
          })),
        };

        const list = courseObservations.get(course.id) ?? [];
        list.push(obs);
        courseObservations.set(course.id, list);
      } catch {}
    }

    const deltas: CurriculumObservationDelta[] = [];
    for (const [, obsList] of courseObservations.entries()) {
      if (obsList.length >= 2) {
        const first = obsList[0];
        const last = obsList[obsList.length - 1];
        deltas.push(compareCurriculumSnapshots(first, last));
      } else if (obsList.length === 1) {
        deltas.push(compareCurriculumSnapshots(null, obsList[0]));
      }
    }
    return deltas;
  } catch {
    return [];
  }
}

export async function handleGetLanguagesAnalytics(db: D1Database, url: URL): Promise<Response> {
  const explicitUserId = url.searchParams.get("userId");
  const userId = await resolveUserId(db, explicitUserId);
  if (!userId) {
    return json({ ok: false, error: "no user state found" }, 404);
  }

  // 1. Daily XP summaries
  const rawDays = url.searchParams.get("days");
  let xpQuery = `
    SELECT date, gained_xp, num_sessions, total_session_time
    FROM xp_summaries
    WHERE user_id = ?
  `;
  const xpParams: any[] = [userId];

  if (rawDays !== null) {
    const parsed = parseInt(rawDays, 10);
    if (!isNaN(parsed) && parsed > 0) {
      xpQuery += " ORDER BY date DESC LIMIT ?";
      xpParams.push(Math.min(parsed, 365));
    } else {
      xpQuery += " ORDER BY date ASC";
    }
  } else {
    xpQuery += " ORDER BY date ASC";
  }

  const xpRows = ((await db.prepare(xpQuery).bind(...xpParams).all<any>()).results ?? []);
  const summaries: XpSummaryInput[] = xpRows.map((r: any) => ({
    date: Number(r.date),
    gainedXp: Number(r.gained_xp || 0),
    numSessions: Number(r.num_sessions || 0),
    totalSessionTime: Number(r.total_session_time || 0),
  })).sort((a, b) => a.date - b.date);

  // 2. Courses catalog
  const courseRows = ((await db.prepare(`
    SELECT course_id, title, learning_language, from_language, xp
    FROM courses
    WHERE user_id = ? AND subject = 'language'
    ORDER BY xp DESC
  `).bind(userId).all<any>()).results ?? []);

  const courses: CourseInput[] = courseRows.map((c: any) => ({
    courseId: String(c.course_id),
    title: c.title ?? null,
    learningLanguage: c.learningLanguage ?? c.learning_language ?? null,
    fromLanguage: c.fromLanguage ?? c.from_language ?? null,
    xp: Number(c.xp || 0),
  }));

  // 3. Curriculum sections
  const sectionRows = ((await db.prepare(`
    SELECT course_id, section_id, section_index, cefr_level, completed_units, total_units
    FROM course_sections
    WHERE user_id = ?
    ORDER BY course_id, section_index ASC
  `).bind(userId).all<any>()).results ?? []);

  const sections: SectionInput[] = sectionRows.map((s: any) => ({
    courseId: String(s.course_id),
    sectionId: String(s.section_id),
    sectionIndex: Number(s.section_index),
    cefrLevel: s.cefr_level ?? null,
    completedUnits: Number(s.completed_units || 0),
    totalUnits: Number(s.total_units || 0),
  }));

  // 4. Curriculum longitudinal deltas (from snapshots)
  const deltas = await getCurriculumDeltas(db, userId);

  // 5. Build canonical analytics contract DTO
  const analytics = buildLanguagesAnalytics({
    userId,
    summaries,
    courses,
    sections,
    deltas,
  });

  return json(analytics);
}
