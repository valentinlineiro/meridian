import type {
  LanguagePort,
  UserStateRow,
  CourseRow,
  SectionRow,
  XpSummaryRow,
} from "../../ports/languagePort.ts";

export function createD1LanguageAdapter(db: D1Database): LanguagePort {
  return {
    async resolveUserId(explicitUserId?: string | null): Promise<string | null> {
      if (explicitUserId) return explicitUserId;
      // users.id is an internal identity id, distinct from the provider id keyed in
      // user_state/courses, so it must not be unioned with them: resolve among the
      // language data owners first and only fall back to users when there are none.
      const uniqueId = async (sql: string): Promise<string | null> => {
        try {
          const { results } = await db.prepare(sql).all<{ user_id: string }>();
          const ids = results ?? [];
          return ids.length === 1 ? ids[0]!.user_id : null;
        } catch {
          return null;
        }
      };
      const dataOwners = await db.prepare(`
        SELECT user_id FROM (
          SELECT user_id FROM user_state
          UNION SELECT user_id FROM courses
        ) LIMIT 2
      `).all<{ user_id: string }>().then((r) => r.results ?? [], () => null);
      if (dataOwners === null) return null;
      if (dataOwners.length > 0) return dataOwners.length === 1 ? dataOwners[0]!.user_id : null;
      return uniqueId("SELECT id AS user_id FROM users LIMIT 2");
    },

    async getUserState(userId: string): Promise<UserStateRow | null> {
      return db.prepare(`
        SELECT user_id, total_xp, streak, current_course_id, updated_at
        FROM user_state
        WHERE user_id = ?
      `).bind(userId).first<UserStateRow>();
    },

    async getUserCourses(userId: string): Promise<CourseRow[]> {
      const rows = ((await db.prepare(`
        SELECT course_id, title, learning_language, from_language, subject, topic, xp, last_seen_at
        FROM courses
        WHERE user_id = ? AND subject = 'language'
        ORDER BY xp DESC
      `).bind(userId).all<any>()).results ?? []);

      return rows.map((c) => ({
        course_id: c.course_id,
        title: c.title ?? null,
        learning_language: c.learning_language ?? null,
        from_language: c.from_language ?? null,
        subject: c.subject ?? null,
        topic: c.topic ?? null,
        xp: c.xp ?? null,
        last_seen_at: c.last_seen_at,
      }));
    },

    async getCourse(userId: string, courseId: string): Promise<CourseRow | null> {
      const row = await db.prepare(`
        SELECT user_id, course_id, title, learning_language, from_language, subject, topic, xp, last_seen_at
        FROM courses
        WHERE user_id = ? AND course_id = ?
      `).bind(userId, courseId).first<any>();

      if (!row) return null;
      return {
        course_id: row.course_id,
        title: row.title ?? null,
        learning_language: row.learning_language ?? null,
        from_language: row.from_language ?? null,
        subject: row.subject ?? null,
        topic: row.topic ?? null,
        xp: row.xp ?? null,
        last_seen_at: row.last_seen_at,
      };
    },

    async getCourseSections(userId: string, courseId: string): Promise<SectionRow[]> {
      const rows = ((await db.prepare(`
        SELECT section_id, section_index, type, cefr_level, cefr_sublevel, completed_units, total_units, last_seen_at
        FROM course_sections
        WHERE user_id = ? AND course_id = ?
        ORDER BY section_index ASC
      `).bind(userId, courseId).all<any>()).results ?? []);

      return rows.map((s) => ({
        section_id: s.section_id,
        section_index: s.section_index,
        type: s.type ?? null,
        cefr_level: s.cefr_level ?? null,
        cefr_sublevel: s.cefr_sublevel ?? null,
        completed_units: s.completed_units ?? 0,
        total_units: s.total_units ?? 0,
        last_seen_at: s.last_seen_at,
      }));
    },

    async getXpSummaries(userId: string, days: number): Promise<XpSummaryRow[]> {
      const rows = ((await db.prepare(`
        SELECT user_id, date, gained_xp, num_sessions, total_session_time, streak_extended, frozen, repaired, updated_at
        FROM xp_summaries
        WHERE user_id = ?
        ORDER BY date DESC
        LIMIT ?
      `).bind(userId, days).all<any>()).results ?? []);

      return rows.map((s) => ({
        user_id: s.user_id,
        date: s.date,
        gained_xp: s.gained_xp ?? 0,
        num_sessions: s.num_sessions ?? 0,
        total_session_time: s.total_session_time ?? 0,
        streak_extended: s.streak_extended,
        frozen: s.frozen,
        repaired: s.repaired,
        updated_at: s.updated_at,
      }));
    },
  };
}
