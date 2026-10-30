import { describe, it, expect } from "vitest";
import { buildBackfill } from "../scripts/backfillClassification.ts";
import { SCHOLARS } from "./fixtures/mateGames.ts";

const row = (match_id: string, moves: unknown, end_condition: string | null = "checkmate") => ({ match_id, end_condition, move_history: typeof moves === "string" ? moves : JSON.stringify(moves) });
const ITALIAN = ["e2e4", "e7e5", "g1f3", "b8c6", "f1c4"];

describe("buildBackfill", () => {
  it("shouldEmitAnUpdatePerRowWithFamilyAndMateWhenMovesAreValid", () => {
    const { sql, counts } = buildBackfill([row("a", ITALIAN), row("b", SCHOLARS)]);
    expect(sql).toContain("UPDATE match_details SET opening_family='italian', mate_type=NULL WHERE match_id='a';");
    expect(sql).toContain("UPDATE match_details SET opening_family='open_game', mate_type='scholars' WHERE match_id='b';");
    expect(counts).toEqual({ families: { italian: 1, open_game: 1 }, mates: { scholars: 1 }, skipped: 0 });
  });

  it("shouldSkipRowsWhoseMoveHistoryIsNotAListOfStrings", () => {
    const { sql, counts } = buildBackfill([row("bad1", "{not json"), row("bad2", { a: 1 }), row("bad3", [1, 2]), row("ok", ITALIAN)]);
    expect(sql).not.toContain("bad");
    expect(counts.skipped).toBe(3);
    expect(counts.families).toEqual({ italian: 1 });
  });

  it("shouldReturnIdenticalOutputWhenRunTwiceOrFedInAnyOrder", () => {
    const rows = [row("b", SCHOLARS), row("a", ITALIAN)];
    expect(buildBackfill(rows)).toEqual(buildBackfill(rows));
    expect(buildBackfill(rows)).toEqual(buildBackfill([...rows].reverse()));
  });

  it("shouldQuoteMatchIdsWithPipesAndSingleQuotes", () => {
    const { sql } = buildBackfill([row("bot|1793303810|rwbzwws5", ITALIAN), row("o'neil", ITALIAN)]);
    expect(sql).toContain("WHERE match_id='bot|1793303810|rwbzwws5';");
    expect(sql).toContain("WHERE match_id='o''neil';");
  });

  it("shouldSplitStatementsIntoBatchesOfOneHundred", () => {
    const rows = Array.from({ length: 250 }, (_, i) => row(`m${String(i).padStart(3, "0")}`, ITALIAN));
    expect(buildBackfill(rows).sql.match(/^-- batch \d+$/gm)).toHaveLength(3);
  });

  it("shouldLeaveTheMateTypeNullWhenTheRecordedEndIsNotCheckmate", () => {
    const { sql, counts } = buildBackfill([row("t", SCHOLARS, "timeout"), row("n", SCHOLARS, null)]);
    expect(sql).toContain("opening_family='open_game', mate_type=NULL WHERE match_id='t';");
    expect(sql).toContain("opening_family='open_game', mate_type=NULL WHERE match_id='n';");
    expect(counts.mates).toEqual({});
  });

  it("shouldOfferAVerificationQueryToCompareWithTheDryRunCounts", () => {
    expect(buildBackfill([]).verifySql).toContain("GROUP BY opening_family");
    expect(buildBackfill([]).verifySql).toContain("GROUP BY mate_type");
  });

  it("shouldWriteUnclassifiedWhenTheGameHasFewerThanTwoPlies", () => {
    expect(buildBackfill([row("short", ["e2e4"])]).sql).toContain("opening_family='unclassified'");
  });
});
