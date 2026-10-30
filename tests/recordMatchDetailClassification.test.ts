import { describe, it, expect, beforeEach } from "vitest";
import { createSqliteD1 } from "./helpers/sqliteD1.ts";
import { createD1MatchAdapter } from "../src/infrastructure/d1/d1MatchAdapter.ts";
import { recordMatchDetail } from "../src/application/recordMatchDetail.ts";
import type { MatchDetailRecord } from "../src/types.ts";
import { SCHOLARS } from "./fixtures/mateGames.ts";

const ITALIAN = ["e2e4", "e7e5", "g1f3", "b8c6", "f1c4"];

describe("recordMatchDetail classification", () => {
  let db: ReturnType<typeof createSqliteD1>["db"];
  let port: ReturnType<typeof createD1MatchAdapter>;
  beforeEach(() => {
    const s = createSqliteD1(["0001_init.sql", "0004_users.sql", "0005_played_at.sql", "0006_match_details.sql", "0007_openings_and_phases.sql", "0017_opening_family_mate_type.sql", "0018_mate_threats.sql"]);
    db = s.db;
    port = createD1MatchAdapter(s.d1);
    db.exec(`INSERT INTO matches (match_id, user_id, snapshot_id, first_seen_at, last_seen_at, raw_json, user_color)
             VALUES ('m1', 'u1', 's', 'd', 'd', '{}', 'white')`);
  });
  const record = (moves: unknown, endCondition: string | null = "checkmate"): MatchDetailRecord => ({
    match_id: "m1", user_id: "u1", opponent_id: null, is_hard_match: null, is_placement_match: null, is_revenge_match: null,
    predicted_elo_win: null, predicted_elo_loss: null, predicted_elo_draw: null, elo_after: null, outcome: null, end_condition: endCondition,
    status: "done", move_history: JSON.stringify(moves), move_timestamps: "[]", final_fen: null, reaction: null, session_duration: null,
  });
  const row = () => db.prepare("SELECT opening_family, mate_type FROM match_details WHERE match_id = 'm1'").get() as any;

  it("shouldStoreTheOpeningFamilyWhenTheDetailIsSaved", async () => {
    await recordMatchDetail(port, record(ITALIAN));
    expect(row()).toEqual({ opening_family: "italian", mate_type: null });
  });

  it("shouldStoreTheMateTypeWhenTheGameEndsInMate", async () => {
    await recordMatchDetail(port, record(SCHOLARS));
    expect(row().mate_type).toBe("scholars");
  });

  it("shouldLeaveTheMateTypeNullWhenTheRecordedEndIsNotCheckmate", async () => {
    await recordMatchDetail(port, record(SCHOLARS, "timeout"));
    expect(row()).toEqual({ opening_family: "open_game", mate_type: null });
  });

  it("shouldSaveWithUnclassifiedWhenMovesAreGarbage", async () => {
    await recordMatchDetail(port, record(["zz"]));
    expect(row()).toEqual({ opening_family: "unclassified", mate_type: null });
  });

  it("shouldUpdateBothColumnsWhenTheDetailIsSavedAgain", async () => {
    await recordMatchDetail(port, record(ITALIAN));
    await recordMatchDetail(port, record(SCHOLARS));
    expect(row()).toEqual({ opening_family: "open_game", mate_type: "scholars" });
  });
});
