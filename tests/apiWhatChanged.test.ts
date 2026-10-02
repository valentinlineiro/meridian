import { describe, it, expect, beforeEach } from "vitest";
import worker from "./helpers/adminWorker.ts";
import { setupTestDb } from "./helpers/testDb.ts";
import type { D1Database } from "@cloudflare/workers-types";
import type { Env } from "../src/types.ts";

describe("API What Changed (Integration)", () => {
  let db: any;
  let d1: D1Database;
  let env: Env;

  beforeEach(() => {
    const setup = setupTestDb();
    db = setup.db;
    d1 = setup.d1;
    env = { DB: d1 } as unknown as Env;

    // Seed user and user_state
    db.prepare("INSERT INTO users (id, created_at) VALUES (?, ?)").run("1000001", "2026-09-01T00:00:00Z");
    db.prepare("INSERT INTO user_state (user_id, total_xp, streak, current_course_id, updated_at) VALUES (?, ?, ?, ?, ?)").run(
      "1000001",
      421500,
      1215,
      "DUOLINGO_XA_EN",
      "2026-10-01T00:00:00Z"
    );
  });

  it("shouldReturn400BadRequestWhenSinceIsAfterUntil", async () => {
    const res = await worker.fetch(
      new Request("http://localhost/api/what-changed?since=2026-10-02T00:00:00Z&until=2026-10-01T00:00:00Z"),
      env
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as any;
    expect(body.ok).toBe(false);
    expect(body.error).toContain("since must be strictly before until");
  });

  it("shouldReturn200WithDeltasWhenQueryIsValid", async () => {
    const playedAt = Math.floor(new Date("2026-09-28T12:00:00Z").getTime() / 1000);
    db.prepare(`
      INSERT INTO matches (
        match_id, user_id, snapshot_id, raw_json, first_seen_at, last_seen_at,
        played_at, user_color, result, page_elo
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      "m-1",
      "1000001",
      "s-1",
      "{}",
      "2026-09-28",
      "2026-09-28",
      playedAt,
      "white",
      "win",
      830
    );

    const res = await worker.fetch(
      new Request("http://localhost/api/what-changed?since=2026-09-25T00:00:00Z&until=2026-10-01T00:00:00Z&userId=1000001"),
      env
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.userId).toBe("1000001");
    expect(body.chess.gamesCount).toBe(1);
    expect(body.chess.currentRating).toBe(830);
    expect(body.interval.since).toBe("2026-09-25T00:00:00.000Z");
  });

  it("shouldReturn404NotFoundWhenUserDoesNotExist", async () => {
    const res = await worker.fetch(
      new Request("http://localhost/api/what-changed?userId=non-existent-user"),
      env
    );
    expect(res.status).toBe(404);
  });

  it("shouldReturn400BadRequestWhenFutureSinceProvidedWithoutUntil", async () => {
    const futureSince = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const res = await worker.fetch(
      new Request(`http://localhost/api/what-changed?since=${encodeURIComponent(futureSince)}`),
      env
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as any;
    expect(body.ok).toBe(false);
    expect(body.error).toBe("since must be strictly before until");
  });

  it("shouldReturn200WithZeroDeltasAndUnavailableBaselineWhenExistingUserHasZeroActivity", async () => {
    db.prepare("INSERT INTO users (id, created_at) VALUES (?, ?)").run("zero-user", "2026-09-01T00:00:00Z");

    const res = await worker.fetch(
      new Request("http://localhost/api/what-changed?userId=zero-user"),
      env
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.userId).toBe("zero-user");
    expect(body.baseline.status).toBe("unavailable");
    expect(body.chess.gamesCount).toBe(0);
    expect(body.chess.ratingDelta).toBeNull();
    expect(body.languages.xpGained).toBe(0);
    expect(body.languages.sessionsCount).toBe(0);
    expect(body.findings).toEqual([]);
  });

  it("shouldReturn200WithDefaultsWhenParametersOmitted", async () => {
    const res = await worker.fetch(
      new Request("http://localhost/api/what-changed"),
      env
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.userId).toBe("1000001");
    expect(body.languages.currentCourseId).toBe("DUOLINGO_XA_EN");
  });

  it("shouldReconstructHistoricalCourseAndStreakWhenUntilIsInPast", async () => {
    // Current user_state is Demo Alpha streak 1215 (seeded in beforeEach)
    // Insert snapshot at past until (2026-08-15) with Demo Delta course and streak 50
    db.prepare(`
      INSERT INTO snapshots (id, created_at, source, user_id, raw_json, games_count, pages_count, checksum, size_bytes)
      VALUES ('snap_past_until', '2026-08-15T12:00:00.000Z', 'duolingo-lang', '1000001', ?, 0, 0, 'c_p', 100)
    `).run(JSON.stringify({ user: { totalXp: 50000, currentCourseId: "DUOLINGO_XD_EN", streak: 50 } }));

    // Insert snapshot at past since (2026-08-01) with Spanish course and streak 36
    db.prepare(`
      INSERT INTO snapshots (id, created_at, source, user_id, raw_json, games_count, pages_count, checksum, size_bytes)
      VALUES ('snap_past_since', '2026-08-01T12:00:00.000Z', 'duolingo-lang', '1000001', ?, 0, 0, 'c_s', 100)
    `).run(JSON.stringify({ user: { totalXp: 45000, currentCourseId: "DUOLINGO_ES_EN", streak: 36 } }));

    const res = await worker.fetch(
      new Request("http://localhost/api/what-changed?since=2026-08-01T12:00:00Z&until=2026-08-15T12:00:00Z&userId=1000001"),
      env
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.languages.courseChanged).toBe(true);
    expect(body.streak.baselineStreak).toBe(36);
    expect(body.streak.currentStreak).toBe(50);
    expect(body.streak.streakDelta).toBe(14);
  });

  it("shouldReturnUnavailableTargetAndNullCurrentStreakWhenUntilPrecedesAllObservations", async () => {
    // Current user_state is updated_at 2026-10-01
    // Insert a snapshot at 2026-08-01 (still later than until)
    db.prepare(`
      INSERT INTO snapshots (id, created_at, source, user_id, raw_json, games_count, pages_count, checksum, size_bytes)
      VALUES ('snap_future_target', '2026-08-01T12:00:00.000Z', 'duolingo-lang', '1000001', ?, 0, 0, 'c_fut', 100)
    `).run(JSON.stringify({ user: { totalXp: 40000, currentCourseId: "DUOLINGO_XC_EN", streak: 20 } }));

    const res = await worker.fetch(
      new Request("http://localhost/api/what-changed?since=2026-06-01T00:00:00Z&until=2026-06-15T00:00:00Z&userId=1000001"),
      env
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.baseline.status).toBe("firstHistorical");
    expect(body.languages.currentCourseId).toBeNull();
    expect(body.streak.currentStreak).toBeNull();
    expect(body.streak.streakDelta).toBeNull();
  });
});

