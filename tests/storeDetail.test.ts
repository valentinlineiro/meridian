import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { DatabaseSync } = require("node:sqlite");
import { readFileSync } from "node:fs";
import { createD1MatchAdapter } from "../src/infrastructure/d1/d1MatchAdapter.ts";
import type { EnrichedMatchDetailRecord } from "../src/ports/matchPort.ts";

function createTestDb() {
  const db = new DatabaseSync(":memory:");
  db.exec(readFileSync(new URL("../migrations/0001_init.sql", import.meta.url).pathname, "utf8"));
  db.exec(readFileSync(new URL("../migrations/0006_match_details.sql", import.meta.url).pathname, "utf8"));
  db.exec(readFileSync(new URL("../migrations/0007_openings_and_phases.sql", import.meta.url).pathname, "utf8"));

  const d1 = {
    prepare(sql: string) {
      return {
        bind(...args: any[]) {
          return {
            first: async () => db.prepare(sql).get(...args) ?? null,
            all: async () => ({ results: db.prepare(sql).all(...args) }),
            run: async () => {
              const res = db.prepare(sql).run(...args);
              return { meta: { changes: Number(res.changes) } };
            },
          };
        },
      };
    },
  } as unknown as D1Database;

  return { db, d1 };
}

describe("D1 match detail persistence", () => {
  it("shouldSaveAndRetrieveMatchDetailRecordWithMaterializedFeatures", async () => {
    const { db, d1 } = createTestDb();
    const port = createD1MatchAdapter(d1);
    const record: EnrichedMatchDetailRecord = {
      match_id: "bot|1790000001|fixture-bot-001",
      user_id: "1000001",
      opponent_id: "noisy_neural_v2-low-500-noise-4.0",
      is_hard_match: 0,
      is_placement_match: 0,
      is_revenge_match: 0,
      predicted_elo_win: 966,
      predicted_elo_loss: 945,
      predicted_elo_draw: 955,
      elo_after: 950,
      outcome: "white",
      end_condition: "checkmate",
      status: "completed",
      move_history: JSON.stringify(["e2e4", "d7d5"]),
      move_timestamps: JSON.stringify([1790578262494, 1790578265000]),
      final_fen: "rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2",
      reaction: JSON.stringify({ animationState: "userCheckmate" }),
      session_duration: 342.5,
      opening_key: "e2e4",
      phase_key: "opening",
      ply_count: 2,
    };

    // Insert corresponding match row to provide user_color = 'white'
    db.prepare(`
      INSERT INTO matches (match_id, user_id, snapshot_id, first_seen_at, last_seen_at, raw_json, user_color)
      VALUES (?, ?, 'snap1', datetime('now'), datetime('now'), '{}', 'white')
    `).run(record.match_id, record.user_id);

    await port.saveMatchDetail(record);
    const fetched = await port.getMatchDetail(record.match_id);

    expect(fetched).not.toBeNull();
    expect(fetched?.match_id).toBe(record.match_id);
    expect(fetched?.opponent_id).toBe(record.opponent_id);
    expect(fetched?.end_condition).toBe("checkmate");
    expect(fetched?.elo_after).toBe(950);
    expect(fetched?.move_history).toBe(record.move_history);
    expect(fetched?.session_duration).toBe(342.5);
    expect(fetched?.ply_count).toBe(2);
    expect(fetched?.phase_key).toBe("opening");
    expect(fetched?.opening_key).toBe("e2e4");
  });

  it("shouldUpdateExistingRecordOnConflictIdempotentUpsert", async () => {
    const { db, d1 } = createTestDb();
    const port = createD1MatchAdapter(d1);
    const record: EnrichedMatchDetailRecord = {
      match_id: "bot|1790000001|fixture-bot-001",
      user_id: "1000001",
      opponent_id: "noisy_neural_v2-low-500-noise-4.0",
      is_hard_match: 0,
      is_placement_match: 0,
      is_revenge_match: 0,
      predicted_elo_win: 966,
      predicted_elo_loss: 945,
      predicted_elo_draw: 955,
      elo_after: null,
      outcome: null,
      end_condition: null,
      status: "in_progress",
      move_history: JSON.stringify(["e2e4"]),
      move_timestamps: JSON.stringify([1790578262494]),
      final_fen: null,
      reaction: null,
      session_duration: 12.0,
      opening_key: "e2e4",
      phase_key: "opening",
      ply_count: 1,
    };

    db.prepare(`
      INSERT INTO matches (match_id, user_id, snapshot_id, first_seen_at, last_seen_at, raw_json, user_color)
      VALUES (?, ?, 'snap1', datetime('now'), datetime('now'), '{}', 'white')
    `).run(record.match_id, record.user_id);

    await port.saveMatchDetail(record);
    const initialFetched = await port.getMatchDetail(record.match_id);
    expect(initialFetched?.ply_count).toBe(1);
    expect(initialFetched?.phase_key).toBe("opening");
    expect(initialFetched?.opening_key).toBe("e2e4");

    const moves42 = ["e2e4", "e7e5", ...Array.from({ length: 40 }, () => "a2a3")];
    const updatedRecord: EnrichedMatchDetailRecord = {
      ...record,
      status: "completed",
      outcome: "white",
      end_condition: "checkmate",
      elo_after: 950,
      move_history: JSON.stringify(moves42),
      move_timestamps: JSON.stringify(Array.from({ length: 42 }, (_, i) => 1790578262494 + i * 1000)),
      session_duration: 35.0,
      opening_key: "e2e4",
      phase_key: "middlegame",
      ply_count: 42,
    };

    await port.saveMatchDetail(updatedRecord);
    const fetched = await port.getMatchDetail(record.match_id);

    expect(fetched).not.toBeNull();
    expect(fetched?.status).toBe("completed");
    expect(fetched?.outcome).toBe("white");
    expect(fetched?.end_condition).toBe("checkmate");
    expect(fetched?.elo_after).toBe(950);
    expect(fetched?.session_duration).toBe(35.0);
    expect(fetched?.ply_count).toBe(42);
    expect(fetched?.phase_key).toBe("middlegame");
    expect(fetched?.opening_key).toBe("e2e4");
  });

  it("shouldPersistMaterializedFeaturesPassedInRecord", async () => {
    const { db, d1 } = createTestDb();
    const port = createD1MatchAdapter(d1);
    const matchId = "m_derived_features";
    db.prepare(`
      INSERT INTO matches (match_id, user_id, snapshot_id, first_seen_at, last_seen_at, raw_json, user_color)
      VALUES (?, 'u1', 'snap1', datetime('now'), datetime('now'), '{}', 'white')
    `).run(matchId);

    await port.saveMatchDetail({
      match_id: matchId,
      user_id: "u1",
      opponent_id: null,
      is_hard_match: null,
      is_placement_match: null,
      is_revenge_match: null,
      predicted_elo_win: null,
      predicted_elo_loss: null,
      predicted_elo_draw: null,
      elo_after: null,
      outcome: null,
      end_condition: null,
      status: "completed",
      move_history: JSON.stringify(["e2e4"]),
      move_timestamps: JSON.stringify([1]),
      final_fen: null,
      reaction: null,
      session_duration: null,
      opening_key: "e2e4",
      phase_key: "opening",
      ply_count: 1,
    });

    const fetched = await port.getMatchDetail(matchId);
    expect(fetched?.opening_key).toBe("e2e4");
    expect(fetched?.phase_key).toBe("opening");
    expect(fetched?.ply_count).toBe(1);
  });

  it("shouldMaterializeBlackOpeningsAndEndgamePhaseForMoreThan80Plies", async () => {
    const { db, d1 } = createTestDb();
    const port = createD1MatchAdapter(d1);
    const moves84 = ["e2e4", "c7c6", ...Array.from({ length: 82 }, () => "d2d4")];
    const record: EnrichedMatchDetailRecord = {
      match_id: "m_black_caro",
      user_id: "1000001",
      opponent_id: "noisy_bot",
      is_hard_match: 0,
      is_placement_match: 0,
      is_revenge_match: 0,
      predicted_elo_win: null,
      predicted_elo_loss: null,
      predicted_elo_draw: null,
      elo_after: 1000,
      outcome: "black",
      end_condition: "resignation",
      status: "completed",
      move_history: JSON.stringify(moves84),
      move_timestamps: JSON.stringify(Array.from({ length: 84 }, (_, i) => 1000 + i)),
      final_fen: null,
      reaction: null,
      session_duration: 200,
      opening_key: "e2e4 c7c6",
      phase_key: "endgame",
      ply_count: 84,
    };

    db.prepare(`
      INSERT INTO matches (match_id, user_id, snapshot_id, first_seen_at, last_seen_at, raw_json, user_color)
      VALUES (?, ?, 'snap1', datetime('now'), datetime('now'), '{}', 'black')
    `).run(record.match_id, record.user_id);

    await port.saveMatchDetail(record);
    const fetched = await port.getMatchDetail(record.match_id);

    expect(fetched?.ply_count).toBe(84);
    expect(fetched?.phase_key).toBe("endgame");
    expect(fetched?.opening_key).toBe("e2e4 c7c6");
  });

  it("shouldAcceptUserColorOnRecordWithoutMatchesRow", async () => {
    const { d1 } = createTestDb();
    const port = createD1MatchAdapter(d1);
    const record: EnrichedMatchDetailRecord = {
      match_id: "m_direct_color",
      user_id: "1000001",
      opponent_id: null,
      is_hard_match: null,
      is_placement_match: null,
      is_revenge_match: null,
      predicted_elo_win: null,
      predicted_elo_loss: null,
      predicted_elo_draw: null,
      elo_after: null,
      outcome: null,
      end_condition: null,
      status: "completed",
      move_history: JSON.stringify(["d2d4", "d7d5"]),
      move_timestamps: JSON.stringify([1, 2]),
      final_fen: null,
      reaction: null,
      session_duration: null,
      user_color: "white",
      opening_key: "d2d4",
      phase_key: "opening",
      ply_count: 2,
    };

    await port.saveMatchDetail(record);
    const fetched = await port.getMatchDetail(record.match_id);

    expect(fetched?.ply_count).toBe(2);
    expect(fetched?.phase_key).toBe("opening");
    expect(fetched?.opening_key).toBe("d2d4");
  });

  it("shouldMaterializeUnclassifiedWhenUserColorIsUnknown", async () => {
    const { d1 } = createTestDb();
    const port = createD1MatchAdapter(d1);
    const record: EnrichedMatchDetailRecord = {
      match_id: "m_unknown_color",
      user_id: "1000001",
      opponent_id: null,
      is_hard_match: null,
      is_placement_match: null,
      is_revenge_match: null,
      predicted_elo_win: null,
      predicted_elo_loss: null,
      predicted_elo_draw: null,
      elo_after: null,
      outcome: null,
      end_condition: null,
      status: "completed",
      move_history: JSON.stringify(["e2e4"]),
      move_timestamps: JSON.stringify([1]),
      final_fen: null,
      reaction: null,
      session_duration: null,
      opening_key: "unclassified",
      phase_key: "opening",
      ply_count: 1,
    };

    await port.saveMatchDetail(record);
    const fetched = await port.getMatchDetail(record.match_id);

    expect(fetched?.ply_count).toBe(1);
    expect(fetched?.phase_key).toBe("opening");
    expect(fetched?.opening_key).toBe("unclassified");
  });

  it("shouldReturnNullWhenMatchIdDoesNotExist", async () => {
    const { d1 } = createTestDb();
    const port = createD1MatchAdapter(d1);
    const fetched = await port.getMatchDetail("non_existent_id");
    expect(fetched).toBeNull();
  });
});
