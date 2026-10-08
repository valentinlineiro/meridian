import { EXTRACTOR_VERSION, type Extraction } from "../domain/observationRows.ts";

// Statements for one snapshot's observation rows (contract §5). An observation is never updated: identity is the primary
// key, a repeat is ignored. The caller runs them in the SAME db.batch as the snapshot insert (§4.5), snapshot first,
// so a snapshot never exists without its observations and a failed batch leaves nothing behind.
// ponytail: one batch per snapshot, unchunked: a payload carries ~16 courses and ~10 sections, far from any D1 limit.
export function observationStatements(db: D1Database, x: Extraction): D1PreparedStatement[] {
  if (!x.ok) return [];
  const { meta: m, observations: o } = x;
  const v = EXTRACTOR_VERSION;
  const stmts: D1PreparedStatement[] = [];
  if (o.account) {
    stmts.push(db.prepare("INSERT INTO account_observations (snapshot_id, user_id, observed_at, total_xp, streak, declared_course_id, extractor_version) VALUES (?,?,?,?,?,?,?) ON CONFLICT DO NOTHING")
      .bind(m.snapshotId, m.userId, m.observedAt, o.account.totalXp, o.account.streak, o.account.declaredCourseId, v));
  }
  for (const c of o.courses) {
    stmts.push(db.prepare("INSERT INTO course_observations (snapshot_id, course_id, user_id, observed_at, subject, learning_language, from_language, title, xp, extractor_version) VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT DO NOTHING")
      .bind(m.snapshotId, c.courseId, m.userId, m.observedAt, c.subject, c.learningLanguage, c.fromLanguage, c.title, c.xp, v));
  }
  if (o.path) {
    stmts.push(db.prepare("INSERT INTO path_observations (snapshot_id, user_id, observed_at, course_id, active_section_id, format_error, extractor_version) VALUES (?,?,?,?,?,?,?) ON CONFLICT DO NOTHING")
      .bind(m.snapshotId, m.userId, m.observedAt, o.path.courseId, o.path.activeSectionId, o.path.formatError, v));
  }
  for (const s of o.sections) {
    stmts.push(db.prepare("INSERT INTO section_observations (snapshot_id, section_index, section_id, type, cefr_level, cefr_sublevel, completed_units, total_units) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT DO NOTHING")
      .bind(m.snapshotId, s.sectionIndex, s.sectionId, s.type, s.cefrLevel, s.cefrSublevel, s.completedUnits, s.totalUnits));
  }
  if (o.elo !== null) {
    stmts.push(db.prepare("INSERT INTO elo_observations (snapshot_id, user_id, observed_at, elo, extractor_version) VALUES (?,?,?,?,?) ON CONFLICT DO NOTHING")
      .bind(m.snapshotId, m.userId, m.observedAt, o.elo, v));
  }
  return stmts;
}
