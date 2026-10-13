import { describe, expect, it } from "vitest";
import { ingestSnapshot } from "../src/api/import.ts";
import { extractCompactCourseStates, repairCompactXpEvents } from "../src/db/storeCompactXpEvents.ts";
import { setupTestDb } from "./helpers/testDb.ts";

function payload(totalXp: number, courses: Array<{ id: string; xp?: number | null }>) {
  return {
    user: { id: "u-a7", totalXp, streak: 1, currentCourseId: courses[0]?.id ?? null },
    courses: courses.map((course) => ({ id: course.id, title: course.id, subject: "language", xp: course.xp })),
  };
}

async function ingest(d1: D1Database, createdAt: string, totalXp: number, courses: Array<{ id: string; xp?: number | null }>) {
  return ingestSnapshot(d1, {
    source: "duolingo-lang",
    userId: "u-a7",
    data: payload(totalXp, courses),
    createdAt,
  });
}

describe("A7 compact XP event series", () => {
  it("distinguishes value, invalid and absent; first duplicate id wins", () => {
    const states = extractCompactCourseStates(JSON.stringify({
      courses: [
        { id: "A", xp: 10 },
        { id: "A", xp: 99 },
        { courseId: "B", xp: null },
        { id: "C", xp: "12" },
      ],
    }));
    expect(states.get("A")).toEqual({ state: "value", xp: 10 });
    expect(states.get("B")).toEqual({ state: "invalid", xp: null });
    expect(states.get("C")).toEqual({ state: "invalid", xp: null });
    expect(states.has("D")).toBe(false); // absence is implicit, not zero
  });

  it("records only state changes and preserves last numeric XP across absence and invalidity", async () => {
    const { d1 } = setupTestDb();
    await ingest(d1, "2026-10-01T00:00:00.000Z", 100, [
      { id: "A", xp: 100 }, { id: "B", xp: 5 }, { id: "CHESS_CH", xp: 7 },
    ]);
    await ingest(d1, "2026-10-01T00:01:00.000Z", 101, [
      { id: "A", xp: 100 }, { id: "B", xp: 5 }, { id: "CHESS_CH", xp: 7 },
    ]);
    let rows = await d1.prepare(
      "SELECT snapshot_id,course_id,state,xp,prev_state,last_xp,observed_at FROM course_xp_events WHERE user_id=? AND source=? ORDER BY observed_at,course_id"
    ).bind("u-a7", "duolingo-lang").all();
    expect(rows.results).toHaveLength(3); // unchanged values do not create events
    expect(rows.results.map((row: any) => row.course_id)).toEqual(["A", "B", "CHESS_CH"]);
    expect(rows.results[0]?.prev_state).toBeNull();

    await ingest(d1, "2026-10-01T00:02:00.000Z", 102, [
      { id: "B", xp: 5 }, { id: "CHESS_CH", xp: 7 },
    ]);
    await ingest(d1, "2026-10-01T00:03:00.000Z", 103, [
      { id: "A", xp: 90 }, { id: "B", xp: 5 }, { id: "CHESS_CH", xp: 7 },
    ]);
    await ingest(d1, "2026-10-01T00:04:00.000Z", 104, [
      { id: "A", xp: null }, { id: "B", xp: 5 }, { id: "CHESS_CH", xp: 7 },
    ]);
    await ingest(d1, "2026-10-01T00:05:00.000Z", 105, [
      { id: "A", xp: 90 }, { id: "B", xp: 5 }, { id: "CHESS_CH", xp: 7 },
    ]);

    rows = await d1.prepare(
      "SELECT snapshot_id,course_id,state,xp,prev_state,last_xp,observed_at FROM course_xp_events WHERE user_id=? AND source=? AND course_id='A' ORDER BY observed_at"
    ).bind("u-a7", "duolingo-lang").all();
    expect(rows.results.map((row: any) => [row.state, row.xp, row.prev_state, row.last_xp])).toEqual([
      ["value", 100, null, null],
      ["absent", null, "value", 100],
      ["value", 90, "absent", 100],
      ["invalid", null, "value", 90],
      ["value", 90, "invalid", 90],
    ]);
  });

  it("marks a late snapshot dirty without moving head backwards, then repairs in ordered chunks", async () => {
    const { d1 } = setupTestDb();
    await ingest(d1, "2026-10-01T00:00:00.000Z", 100, [{ id: "A", xp: 100 }, { id: "B", xp: 1 }]);
    await ingest(d1, "2026-10-01T00:02:00.000Z", 102, [{ id: "A", xp: 90 }, { id: "B", xp: 1 }]);
    await ingest(d1, "2026-10-01T00:01:00.000Z", 101, [{ id: "A", xp: 95 }, { id: "B", xp: 1 }]);

    let status = await d1.prepare(
      "SELECT head_at,head_id,dirty_at,dirty_id,repair_watermark_at,repair_cursor_at FROM observation_series_status WHERE user_id=? AND source=?"
    ).bind("u-a7", "duolingo-lang").first() as any;
    expect(status.head_at).toBe("2026-10-01T00:02:00.000Z");
    expect(status.dirty_at).toBe("2026-10-01T00:01:00.000Z");
    expect(status.repair_watermark_at).toBeNull();

    const first = await repairCompactXpEvents(d1, "u-a7", "duolingo-lang", 1);
    expect(first.status).toBe("progress");
    expect(first.snapshotsProcessed).toBe(1);
    status = await d1.prepare(
      "SELECT head_at,dirty_at,repair_watermark_at,repair_cursor_at FROM observation_series_status WHERE user_id=? AND source=?"
    ).bind("u-a7", "duolingo-lang").first() as any;
    expect(status.dirty_at).toBe("2026-10-01T00:01:00.000Z");
    expect(status.repair_cursor_at).toBe("2026-10-01T00:01:00.000Z");

    const second = await repairCompactXpEvents(d1, "u-a7", "duolingo-lang", 1);
    expect(second.status).toBe("clean");
    status = await d1.prepare(
      "SELECT head_at,head_id,dirty_at,repair_watermark_at,repair_cursor_at FROM observation_series_status WHERE user_id=? AND source=?"
    ).bind("u-a7", "duolingo-lang").first() as any;
    expect(status.head_at).toBe("2026-10-01T00:02:00.000Z");
    expect(status.dirty_at).toBeNull();
    expect(status.repair_watermark_at).toBeNull();
    expect(status.repair_cursor_at).toBeNull();

    const events = await d1.prepare(
      "SELECT observed_at,state,xp,prev_state,last_xp FROM course_xp_events WHERE user_id=? AND source=? AND course_id='A' ORDER BY observed_at"
    ).bind("u-a7", "duolingo-lang").all();
    expect(events.results.map((row: any) => [row.observed_at,row.state,row.xp,row.prev_state,row.last_xp])).toEqual([
      ["2026-10-01T00:00:00.000Z","value",100,null,null],
      ["2026-10-01T00:01:00.000Z","value",95,"value",100],
      ["2026-10-01T00:02:00.000Z","value",90,"value",95],
    ]);
  });

  it("finishes a fixed watermark prefix when a later snapshot arrives during repair", async () => {
    const { d1 } = setupTestDb();
    await ingest(d1, "2026-10-01T00:00:00.000Z", 100, [{ id: "A", xp: 100 }]);
    await ingest(d1, "2026-10-01T00:02:00.000Z", 102, [{ id: "A", xp: 90 }]);
    await ingest(d1, "2026-10-01T00:01:00.000Z", 101, [{ id: "A", xp: 95 }]);

    // Start repair, capture its fixed watermark, then insert a later snapshot before the first chunk.
    const { results: statusRows } = await d1.prepare(
      "SELECT version,dirty_at FROM observation_series_status WHERE user_id=? AND source=?"
    ).bind("u-a7", "duolingo-lang").all();
    const status = statusRows[0] as any;
    const watermark = await d1.prepare(
      "SELECT id,created_at FROM snapshots WHERE user_id=? AND source=? ORDER BY created_at DESC,id DESC LIMIT 1"
    ).bind("u-a7", "duolingo-lang").first() as any;
    await d1.prepare(
      "UPDATE observation_series_status SET repair_watermark_at=?,repair_watermark_id=?,repair_cursor_at=NULL,repair_cursor_id=NULL,repair_version=repair_version+1,version=version+1 WHERE user_id=? AND source=? AND version=? AND dirty_at IS NOT NULL"
    ).bind(watermark.created_at, watermark.id, "u-a7", "duolingo-lang", status.version).run();

    await ingest(d1, "2026-10-01T00:03:00.000Z", 103, [{ id: "A", xp: 80 }]);
    const prefix = await repairCompactXpEvents(d1, "u-a7", "duolingo-lang", 2);
    expect(prefix.status).toBe("progress");
    const afterPrefix = await d1.prepare(
      "SELECT head_at,dirty_at,repair_watermark_at FROM observation_series_status WHERE user_id=? AND source=?"
    ).bind("u-a7", "duolingo-lang").first() as any;
    expect(afterPrefix.head_at).toBe("2026-10-01T00:02:00.000Z");
    expect(afterPrefix.dirty_at).toBe("2026-10-01T00:03:00.000Z");
    expect(afterPrefix.repair_watermark_at).toBeNull();

    const tail = await repairCompactXpEvents(d1, "u-a7", "duolingo-lang", 10);
    expect(tail.status).toBe("clean");
    const finalStatus = await d1.prepare(
      "SELECT head_at,dirty_at FROM observation_series_status WHERE user_id=? AND source=?"
    ).bind("u-a7", "duolingo-lang").first() as any;
    expect(finalStatus.head_at).toBe("2026-10-01T00:03:00.000Z");
    expect(finalStatus.dirty_at).toBeNull();
  });
});
