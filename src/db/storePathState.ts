import { sha256Hex } from "../ingestion/hash.ts";
import { canonicalTree, diffRows, unitKey, levelKey, type UnitRow, type LevelRow, type Tree } from "../domain/pathTree.ts";

/**
 * K5 write rule (contract A1 §4). One snapshot with a valid Path of a course, all in one db.batch:
 *  - not newer than the stored state: nothing; same tree_hash: only the pointer; else row-level diff + pointer.
 * The caller passes nothing for a snapshot without a valid Path (never destroys nor advances a valid state). Returns the number of rows written, for the budget gate.
 */
export async function applyPathState(db: D1Database, a: { userId: string; snapshotId: string; observedAt: string; courseId: string; tree: Tree }): Promise<number> {
  const { userId: u, observedAt, snapshotId, courseId: c } = a;
  const state = await db.prepare("SELECT observed_at, tree_hash FROM course_path_state WHERE user_id=? AND course_id=?").bind(u, c).first<{ observed_at: string; tree_hash: string }>();
  if (state && observedAt <= state.observed_at) return 0;

  const next = a.tree;
  const hash = await sha256Hex(canonicalTree(next));
  const pointer = db.prepare(`INSERT INTO course_path_state (user_id, course_id, snapshot_id, observed_at, tree_hash) VALUES (?,?,?,?,?)
    ON CONFLICT(user_id, course_id) DO UPDATE SET snapshot_id=excluded.snapshot_id, observed_at=excluded.observed_at, tree_hash=excluded.tree_hash`).bind(u, c, snapshotId, observedAt, hash);
  if (state?.tree_hash === hash) { await pointer.run(); return 1; }

  const [su, sl] = await Promise.all([
    db.prepare("SELECT section_index, unit_index, teaching_objective, cefr_level, is_unlocked, levels_captured FROM course_path_units WHERE user_id=? AND course_id=?").bind(u, c).all<any>(),
    db.prepare("SELECT unit_index, level_ordinal, state, finished_sessions, total_sessions, skill_id, crown_level_index, tree_id, reached_score, learning_score, reached_progress, completed_progress FROM course_path_levels WHERE user_id=? AND course_id=?").bind(u, c).all<any>(),
  ]);
  const storedUnits: UnitRow[] = (su.results ?? []).map((r) => ({ sectionIndex: r.section_index, unitIndex: r.unit_index, teachingObjective: r.teaching_objective, cefrLevel: r.cefr_level, isUnlocked: r.is_unlocked, levelsCaptured: r.levels_captured }));
  const storedLevels: LevelRow[] = (sl.results ?? []).map((r) => ({ unitIndex: r.unit_index, levelOrdinal: r.level_ordinal, state: r.state, finishedSessions: r.finished_sessions, totalSessions: r.total_sessions, skillId: r.skill_id, crownLevelIndex: r.crown_level_index, treeId: r.tree_id, reachedScore: r.reached_score, learningScore: r.learning_score, reachedProgress: r.reached_progress, completedProgress: r.completed_progress }));
  const ud = diffRows(storedUnits, next.units, unitKey), ld = diffRows(storedLevels, next.levels, levelKey);

  const stmts: D1PreparedStatement[] = [];
  const unitSql = "INSERT INTO course_path_units (user_id, course_id, unit_index, section_index, teaching_objective, cefr_level, is_unlocked, levels_captured) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(user_id, course_id, unit_index) DO UPDATE SET section_index=excluded.section_index, teaching_objective=excluded.teaching_objective, cefr_level=excluded.cefr_level, is_unlocked=excluded.is_unlocked, levels_captured=excluded.levels_captured";
  for (const r of [...ud.insert, ...ud.update]) stmts.push(db.prepare(unitSql).bind(u, c, r.unitIndex, r.sectionIndex, r.teachingObjective, r.cefrLevel, r.isUnlocked, r.levelsCaptured));
  for (const r of ud.delete) stmts.push(db.prepare("DELETE FROM course_path_units WHERE user_id=? AND course_id=? AND unit_index=?").bind(u, c, r.unitIndex));
  const levelSql = "INSERT INTO course_path_levels (user_id, course_id, unit_index, level_ordinal, state, finished_sessions, total_sessions, skill_id, crown_level_index, tree_id, reached_score, learning_score, reached_progress, completed_progress) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id, course_id, unit_index, level_ordinal) DO UPDATE SET state=excluded.state, finished_sessions=excluded.finished_sessions, total_sessions=excluded.total_sessions, skill_id=excluded.skill_id, crown_level_index=excluded.crown_level_index, tree_id=excluded.tree_id, reached_score=excluded.reached_score, learning_score=excluded.learning_score, reached_progress=excluded.reached_progress, completed_progress=excluded.completed_progress";
  for (const r of [...ld.insert, ...ld.update]) stmts.push(db.prepare(levelSql).bind(u, c, r.unitIndex, r.levelOrdinal, r.state, r.finishedSessions, r.totalSessions, r.skillId, r.crownLevelIndex, r.treeId, r.reachedScore, r.learningScore, r.reachedProgress, r.completedProgress));
  for (const r of ld.delete) stmts.push(db.prepare("DELETE FROM course_path_levels WHERE user_id=? AND course_id=? AND unit_index=? AND level_ordinal=?").bind(u, c, r.unitIndex, r.levelOrdinal));
  stmts.push(pointer);
  // ponytail: one unchunked batch; a first write is ~376 statements (311 units + 65 levels), well inside D1's batch limits.
  await db.batch(stmts);
  return stmts.length;
}
