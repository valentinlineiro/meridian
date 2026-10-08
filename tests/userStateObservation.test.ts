import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { setupTestDb } from "./helpers/testDb.ts";
import { ingestSnapshot } from "../src/api/import.ts";
import { createD1LanguageAdapter } from "../src/infrastructure/d1/d1LanguageAdapter.ts";
import { getLanguages } from "../src/application/getLanguages.ts";

const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite");
const USER = "1000001";
const COURSES = [{ id: "DUOLINGO_XA_EN", title: "Demo Alpha", learningLanguage: "xa", fromLanguage: "en", subject: "language", xp: 100 }];
const currentCourse = { id: "DUOLINGO_XA_EN", pathSectioned: [] };

// The initial GET carries the account block; the per-course PATCH the collector sweeps with does not.
const accountSnapshot = { user: { id: 1000001, username: "demo", totalXp: 50000, streak: 100, currentCourseId: "DUOLINGO_XA_EN" }, courses: COURSES, currentCourse, xp_summaries: [] };
const sweepSnapshot = (xp: number) => ({ user: { id: 1000001, username: "demo" }, courses: [{ ...COURSES[0], xp }], currentCourse, xp_summaries: [] });

const send = (d1: D1Database, data: unknown, createdAt: string) =>
  ingestSnapshot(d1, { source: "duolingo-lang", userId: USER, data, createdAt });
const userState = (db: any) => db.prepare("SELECT * FROM user_state WHERE user_id = ?").get(USER) as any;

describe("user_state observation freshness", () => {
  it("shouldRecordWhenEachAccountFieldWasObservedWhenTheSnapshotCarriesThem", async () => {
    const { db, d1 } = setupTestDb();
    await send(d1, accountSnapshot, "2026-09-25T06:00:00.000Z");
    expect(userState(db)).toMatchObject({
      total_xp: 50000, streak: 100, current_course_id: "DUOLINGO_XA_EN",
      total_xp_observed_at: "2026-09-25T06:00:00.000Z",
      streak_observed_at: "2026-09-25T06:00:00.000Z",
      current_course_observed_at: "2026-09-25T06:00:00.000Z",
    });
  });

  it("shouldKeepTheLastObservationTimeWhenALaterSnapshotLacksTheAccountFields", async () => {
    const { db, d1 } = setupTestDb();
    await send(d1, accountSnapshot, "2026-09-25T06:00:00.000Z");
    await send(d1, sweepSnapshot(101), "2026-10-05T06:00:00.000Z");
    expect(userState(db)).toMatchObject({
      total_xp: 50000, streak: 100, current_course_id: "DUOLINGO_XA_EN",
      updated_at: "2026-10-05T06:00:00.000Z", // a snapshot was applied...
      total_xp_observed_at: "2026-09-25T06:00:00.000Z", // ...but XP, streak and course were not observed in it
      streak_observed_at: "2026-09-25T06:00:00.000Z",
      current_course_observed_at: "2026-09-25T06:00:00.000Z",
    });
  });

  it("shouldLeaveObservationTimeUnknownWhenTheFieldWasNeverObserved", async () => {
    const { db, d1 } = setupTestDb();
    await send(d1, sweepSnapshot(101), "2026-10-05T06:00:00.000Z");
    expect(userState(db)).toMatchObject({ total_xp: null, streak: null, total_xp_observed_at: null, streak_observed_at: null });
  });

  it("shouldExposeObservationTimesInTheLanguagesOverviewWithoutInventingValues", async () => {
    const { d1 } = setupTestDb();
    await send(d1, sweepSnapshot(101), "2026-10-05T06:00:00.000Z");
    const overview = await getLanguages(createD1LanguageAdapter(d1), USER);
    expect(overview).toMatchObject({ totalXp: null, streak: null, totalXpObservedAt: null, streakObservedAt: null, updatedAt: "2026-10-05T06:00:00.000Z" });
    await send(d1, accountSnapshot, "2026-10-06T06:00:00.000Z");
    expect(await getLanguages(createD1LanguageAdapter(d1), USER)).toMatchObject({ totalXp: 50000, totalXpObservedAt: "2026-10-06T06:00:00.000Z", streakObservedAt: "2026-10-06T06:00:00.000Z" });
  });

  it("shouldBackfillObservationTimesFromStoredSnapshotsWhenMigrating", () => {
    const db = new DatabaseSync(":memory:");
    for (const m of ["0001_init", "0008_languages", "0009_course_sections_pk"]) db.exec(readFileSync(new URL(`../migrations/${m}.sql`, import.meta.url).pathname, "utf8"));
    const snap = (id: string, at: string, data: unknown) =>
      db.prepare("INSERT INTO snapshots (id, created_at, source, user_id, raw_json, games_count, pages_count, checksum, size_bytes) VALUES (?,?,?,?,?,0,0,?,0)")
        .run(id, at, "duolingo-lang", USER, JSON.stringify(data), id);
    snap("a", "2026-09-25T06:00:00.000Z", accountSnapshot);
    snap("b", "2026-10-05T06:00:00.000Z", sweepSnapshot(101));
    db.prepare("INSERT INTO user_state (user_id,total_xp,streak,current_course_id,updated_at) VALUES (?,?,?,?,?)").run(USER, 50000, 100, "DUOLINGO_XA_EN", "2026-10-05T06:00:00.000Z");
    db.exec(readFileSync(new URL("../migrations/0011_user_state_observed_at.sql", import.meta.url).pathname, "utf8"));
    db.exec(readFileSync(new URL("../migrations/0012_observation_series.sql", import.meta.url).pathname, "utf8"));
    db.exec(readFileSync(new URL("../migrations/0013_xp_summaries_daily_goal.sql", import.meta.url).pathname, "utf8"));
    db.exec(readFileSync(new URL("../migrations/0014_course_path_state.sql", import.meta.url).pathname, "utf8"));
    expect(userState(db)).toMatchObject({
      total_xp_observed_at: "2026-09-25T06:00:00.000Z",
      streak_observed_at: "2026-09-25T06:00:00.000Z",
      current_course_observed_at: "2026-09-25T06:00:00.000Z",
    });
  });
});
