export interface StoredUserState {
  userId: string;
  totalXp: number | null;
  streak: number | null;
  currentCourseId: string | null;
  isAuxiliary?: boolean;
  originalCourseId?: string | null;
  observedCourseId?: string | null;
}

export interface StoredCourse {
  userId: string;
  courseId: string;
  title: string | null;
  learningLanguage: string | null;
  fromLanguage: string | null;
  subject: string | null;
  topic: string | null;
  xp: number | null;
}

export interface StoredSection {
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

export interface StoredXpSummary {
  userId: string;
  date: number;
  gainedXp: number;
  numSessions: number;
  totalSessionTime: number;
  streakExtended: number | null;
  frozen: number | null;
  repaired: number | null;
  dailyGoalXp: number | null;
}

export async function insertLanguageSnapshot(
  db: D1Database,
  s: {
    id: string;
    createdAt: string;
    source: string;
    userId: string;
    rawJson: string;
    gamesCount: number;
    pagesCount: number;
    checksum: string;
    sizeBytes: number;
    syncId?: string | null;
    isAuxiliary?: boolean | number;
    originalCourseId?: string | null;
    observedCourseId?: string | null;
  },
  observations: D1PreparedStatement[] = [] // P2: written in the same atomic batch, after the snapshot row
): Promise<void> {
  const stmt = db.prepare(`
    INSERT INTO snapshots (
      id, created_at, source, user_id, raw_json, games_count, pages_count, checksum, size_bytes,
      sync_id, is_auxiliary, original_course_id, observed_course_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    s.id,
    s.createdAt,
    s.source,
    s.userId,
    s.rawJson,
    s.gamesCount,
    s.pagesCount,
    s.checksum,
    s.sizeBytes,
    s.syncId ?? null,
    s.isAuxiliary ? 1 : 0,
    s.originalCourseId ?? null,
    s.observedCourseId ?? null
  );
  if (observations.length) await db.batch([stmt, ...observations]);
  else await stmt.run();
}

export async function upsertUserState(
  db: D1Database,
  state: StoredUserState,
  now: string
): Promise<void> {
  // Contract v0.2: only an account observation speaks for the account. A course observation (auxiliary) never writes
  // XP, streak or the active course, even if its payload carries them. A field's observed_at only advances when the
  // snapshot actually carried that field: absent means unknown, not fresh.
  const speaksForAccount = !state.isAuxiliary;
  const totalXp = speaksForAccount ? state.totalXp : null;
  const streak = speaksForAccount ? state.streak : null;
  const currentCourse = speaksForAccount ? (state.currentCourseId ?? state.originalCourseId ?? null) : null;

  await db.prepare(`
    INSERT INTO user_state (user_id, total_xp, streak, current_course_id, updated_at,
      total_xp_observed_at, streak_observed_at, current_course_observed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      total_xp = COALESCE(excluded.total_xp, user_state.total_xp),
      streak = COALESCE(excluded.streak, user_state.streak),
      current_course_id = COALESCE(excluded.current_course_id, user_state.current_course_id),
      updated_at = excluded.updated_at,
      total_xp_observed_at = COALESCE(excluded.total_xp_observed_at, user_state.total_xp_observed_at),
      streak_observed_at = COALESCE(excluded.streak_observed_at, user_state.streak_observed_at),
      current_course_observed_at = COALESCE(excluded.current_course_observed_at, user_state.current_course_observed_at)
  `).bind(
    state.userId,
    totalXp,
    streak,
    currentCourse,
    now,
    totalXp != null ? now : null,
    streak != null ? now : null,
    currentCourse != null ? now : null
  ).run();
}

export async function upsertCourses(
  db: D1Database,
  courses: StoredCourse[],
  now: string
): Promise<{ count: number }> {
  for (let i = 0; i < courses.length; i += 50) {
    const chunk = courses.slice(i, i + 50);
    const stmts: D1PreparedStatement[] = chunk.map((c) =>
      db.prepare(`
        INSERT INTO courses (
          user_id, course_id, title, learning_language, from_language, subject, topic, xp, last_seen_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id, course_id) DO UPDATE SET
          title = excluded.title,
          learning_language = excluded.learning_language,
          from_language = excluded.from_language,
          subject = excluded.subject,
          topic = excluded.topic,
          xp = COALESCE(excluded.xp, courses.xp),
          last_seen_at = excluded.last_seen_at
      `).bind(
        c.userId,
        c.courseId,
        c.title,
        c.learningLanguage,
        c.fromLanguage,
        c.subject,
        c.topic,
        c.xp,
        now
      )
    );
    await db.batch(stmts);
  }
  return { count: courses.length };
}

export async function upsertCourseSections(
  db: D1Database,
  sections: StoredSection[],
  now: string
): Promise<{ count: number }> {
  for (let i = 0; i < sections.length; i += 50) {
    const chunk = sections.slice(i, i + 50);
    const stmts: D1PreparedStatement[] = chunk.map((s) =>
      db.prepare(`
        INSERT INTO course_sections (
          user_id, course_id, section_id, section_index, type, cefr_level, cefr_sublevel, completed_units, total_units, last_seen_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id, course_id, section_index) DO UPDATE SET
          section_id = excluded.section_id,
          type = excluded.type,
          cefr_level = excluded.cefr_level,
          cefr_sublevel = excluded.cefr_sublevel,
          completed_units = excluded.completed_units,
          total_units = excluded.total_units,
          last_seen_at = excluded.last_seen_at
      `).bind(
        s.userId,
        s.courseId,
        s.sectionId,
        s.sectionIndex,
        s.type,
        s.cefrLevel,
        s.cefrSublevel,
        s.completedUnits,
        s.totalUnits,
        now
      )
    );
    await db.batch(stmts);
  }
  return { count: sections.length };
}

export async function upsertXpSummaries(
  db: D1Database,
  summaries: StoredXpSummary[],
  now: string
): Promise<{ count: number }> {
  for (let i = 0; i < summaries.length; i += 50) {
    const chunk = summaries.slice(i, i + 50);
    const stmts: D1PreparedStatement[] = chunk.map((s) =>
      db.prepare(`
        INSERT INTO xp_summaries (
          user_id, date, gained_xp, num_sessions, total_session_time, streak_extended, frozen, repaired, daily_goal_xp, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id, date) DO UPDATE SET
          gained_xp = excluded.gained_xp,
          num_sessions = excluded.num_sessions,
          total_session_time = excluded.total_session_time,
          streak_extended = excluded.streak_extended,
          frozen = excluded.frozen,
          repaired = excluded.repaired,
          daily_goal_xp = excluded.daily_goal_xp,
          updated_at = excluded.updated_at
        WHERE xp_summaries.gained_xp IS NOT excluded.gained_xp
           OR xp_summaries.num_sessions IS NOT excluded.num_sessions
           OR xp_summaries.total_session_time IS NOT excluded.total_session_time
           OR xp_summaries.streak_extended IS NOT excluded.streak_extended
           OR xp_summaries.frozen IS NOT excluded.frozen
           OR xp_summaries.repaired IS NOT excluded.repaired
           OR xp_summaries.daily_goal_xp IS NOT excluded.daily_goal_xp
      `).bind(
        s.userId,
        s.date,
        s.gainedXp,
        s.numSessions,
        s.totalSessionTime,
        s.streakExtended,
        s.frozen,
        s.repaired,
        s.dailyGoalXp,
        now
      )
    );
    await db.batch(stmts);
  }
  return { count: summaries.length };
}
