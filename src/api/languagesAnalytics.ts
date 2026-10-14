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
    // R5 reads observation rows (contract 2026-10-05 §7), not raw_json. Only the first and last observation of each course
    // cross the D1 boundary (a row is both when the course was observed once). Order is (observed_at, snapshot_id), so ties
    // are deterministic. A snapshot whose Path had a format error, or no usable course id, is not an observation of a course
    // Path: the extractor stores it with format_error / NULL course_id and no sections.
    const rows = ((await db.prepare(`
      WITH ranked AS (
        SELECT snapshot_id, course_id, observed_at,
          ROW_NUMBER() OVER (PARTITION BY course_id ORDER BY observed_at ASC, snapshot_id ASC) AS from_start,
          ROW_NUMBER() OVER (PARTITION BY course_id ORDER BY observed_at DESC, snapshot_id DESC) AS from_end
        FROM path_observations
        WHERE user_id = ? AND format_error IS NULL AND course_id IS NOT NULL AND course_id <> ''
      )
      SELECT r.course_id, r.observed_at, r.snapshot_id, s.section_index, s.completed_units, s.total_units
      FROM ranked r
      LEFT JOIN section_observations s ON s.snapshot_id = r.snapshot_id
      WHERE r.from_start = 1 OR r.from_end = 1
      ORDER BY r.course_id, r.observed_at ASC, r.snapshot_id ASC, s.section_index ASC
    `).bind(userId).all<any>()).results ?? []);

    if (rows.length === 0) return [];

    // Group the flat rows by (course, snapshot), keeping the first and last snapshot of each course in time order.
    const bySnapshot = new Map<string, CurriculumSnapshotInput & { key: string }>();
    const courseSnapshots = new Map<string, string[]>();
    for (const r of rows) {
      const key = `${r.course_id}\u0000${r.snapshot_id}`;
      let snap = bySnapshot.get(key);
      if (!snap) {
        snap = { key, courseId: String(r.course_id), observedAt: String(r.observed_at), sections: [] };
        bySnapshot.set(key, snap);
        (courseSnapshots.get(snap.courseId) ?? courseSnapshots.set(snap.courseId, []).get(snap.courseId)!).push(key);
      }
      // ponytail: NULL counts become 0 to keep the previous R5 behaviour (`?? 0`); preserving NULL (D-d) is a separate change.
      if (r.section_index !== null) snap.sections.push({ sectionIndex: Number(r.section_index), completedUnits: r.completed_units ?? 0, totalUnits: r.total_units ?? 0 });
    }

    const deltas: CurriculumObservationDelta[] = [];
    for (const keys of courseSnapshots.values()) {
      const first = bySnapshot.get(keys[0]!)!;
      const last = bySnapshot.get(keys[keys.length - 1]!)!;
      deltas.push(keys.length >= 2 ? compareCurriculumSnapshots(first, last) : compareCurriculumSnapshots(null, first));
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
