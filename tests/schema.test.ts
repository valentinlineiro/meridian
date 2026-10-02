import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { DatabaseSync } = require("node:sqlite");
import { readFileSync } from "node:fs";

describe("0006_match_details migration", () => {
  it("shouldCreateMatchDetailsTableAndIndex", () => {
    const db = new DatabaseSync(":memory:");
    const mig0001 = readFileSync(new URL("../migrations/0001_init.sql", import.meta.url).pathname, "utf8");
    const mig0006 = readFileSync(new URL("../migrations/0006_match_details.sql", import.meta.url).pathname, "utf8");
    db.exec(mig0001);
    db.exec(mig0006);

    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='match_details'").all();
    expect(tables.length).toBe(1);

    const cols = db.prepare("PRAGMA table_info(match_details)").all() as Array<{ name: string }>;
    const colNames = cols.map(c => c.name);
    expect(colNames).toContain("match_id");
    expect(colNames).toContain("user_id");
    expect(colNames).toContain("opponent_id");
    expect(colNames).toContain("move_history");
    expect(colNames).toContain("move_timestamps");
    expect(colNames).toContain("end_condition");
    expect(colNames).toContain("elo_after");
  });
});

describe("0007_openings_and_phases migration", () => {
  it("shouldAddOpeningKeyPhaseKeyPlyCountColumnsAndIndexesToMatchDetails", () => {
    const db = new DatabaseSync(":memory:");
    const mig0001 = readFileSync(new URL("../migrations/0001_init.sql", import.meta.url).pathname, "utf8");
    const mig0006 = readFileSync(new URL("../migrations/0006_match_details.sql", import.meta.url).pathname, "utf8");
    const mig0007 = readFileSync(new URL("../migrations/0007_openings_and_phases.sql", import.meta.url).pathname, "utf8");
    db.exec(mig0001);
    db.exec(mig0006);
    db.exec(mig0007);

    const cols = db.prepare("PRAGMA table_info(match_details)").all() as Array<{ name: string }>;
    const colNames = cols.map(c => c.name);
    expect(colNames).toContain("opening_key");
    expect(colNames).toContain("phase_key");
    expect(colNames).toContain("ply_count");

    const indices = db.prepare("SELECT name FROM sqlite_master WHERE type='index'").all() as Array<{ name: string }>;
    const indexNames = indices.map(i => i.name);
    expect(indexNames).toContain("idx_match_details_opening");
    expect(indexNames).toContain("idx_match_details_phase");
  });
});

describe("0008_languages migration", () => {
  it("shouldCreateLanguageTablesAndAddAuditColumnsToSnapshots", () => {
    const db = new DatabaseSync(":memory:");
    const mig0001 = readFileSync(new URL("../migrations/0001_init.sql", import.meta.url).pathname, "utf8");
    const mig0008 = readFileSync(new URL("../migrations/0008_languages.sql", import.meta.url).pathname, "utf8");
    db.exec(mig0001);
    db.exec(mig0008);

    // Verify snapshot audit columns
    const snapCols = (db.prepare("PRAGMA table_info(snapshots)").all() as Array<{ name: string }>).map(c => c.name);
    expect(snapCols).toContain("sync_id");
    expect(snapCols).toContain("is_auxiliary");
    expect(snapCols).toContain("original_course_id");
    expect(snapCols).toContain("observed_course_id");

    // Verify tables exist
    const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{ name: string }>).map(t => t.name);
    expect(tables).toContain("user_state");
    expect(tables).toContain("courses");
    expect(tables).toContain("course_sections");
    expect(tables).toContain("xp_summaries");

    // Verify user_state columns
    const userStateCols = (db.prepare("PRAGMA table_info(user_state)").all() as Array<{ name: string }>).map(c => c.name);
    expect(userStateCols).toEqual(["user_id", "total_xp", "streak", "current_course_id", "updated_at"]);

    // Verify courses columns
    const coursesCols = (db.prepare("PRAGMA table_info(courses)").all() as Array<{ name: string }>).map(c => c.name);
    expect(coursesCols).toContain("user_id");
    expect(coursesCols).toContain("course_id");
    expect(coursesCols).toContain("learning_language");
    expect(coursesCols).toContain("xp");
    expect(coursesCols).toContain("last_seen_at");

    // Verify course_sections columns
    const sectionsCols = (db.prepare("PRAGMA table_info(course_sections)").all() as Array<{ name: string }>).map(c => c.name);
    expect(sectionsCols).toContain("user_id");
    expect(sectionsCols).toContain("course_id");
    expect(sectionsCols).toContain("section_id");
    expect(sectionsCols).toContain("cefr_level");
    expect(sectionsCols).toContain("completed_units");
    expect(sectionsCols).toContain("total_units");

    // Verify xp_summaries columns
    const xpCols = (db.prepare("PRAGMA table_info(xp_summaries)").all() as Array<{ name: string }>).map(c => c.name);
    expect(xpCols).toContain("user_id");
    expect(xpCols).toContain("date");
    expect(xpCols).toContain("gained_xp");
    expect(xpCols).toContain("num_sessions");
    expect(xpCols).toContain("total_session_time");
  });

  it("shouldApplyMigration0009AndEnsureCompositePrimaryKey", () => {
    const db = new DatabaseSync(":memory:");
    const mig0001 = readFileSync(new URL("../migrations/0001_init.sql", import.meta.url).pathname, "utf8");
    const mig0008 = readFileSync(new URL("../migrations/0008_languages.sql", import.meta.url).pathname, "utf8");
    const mig0009 = readFileSync(new URL("../migrations/0009_course_sections_pk.sql", import.meta.url).pathname, "utf8");
    db.exec(mig0001);
    db.exec(mig0008);
    db.exec(mig0009);

    const cols = (db.prepare("PRAGMA table_info(course_sections)").all() as Array<{ name: string; pk: number }>);
    const pkCols = cols.filter(c => c.pk > 0).sort((a, b) => a.pk - b.pk).map(c => c.name);
    expect(pkCols).toEqual(["user_id", "course_id", "section_index"]);
  });
});
