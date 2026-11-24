import { describe, expect, it } from "vitest";
import { foldWeekly, type WeeklyRow } from "../src/domain/chessWeekly.ts";

const row = (o: Partial<WeeklyRow>): WeeklyRow => ({
  week: "2026-11-16", color: "white", family: "Italiana", phase: "middlegame", result: "win", outcome: null, disconnection: 0, n: 1, ...o,
});
const NO_ELO = new Map<string, number>();

describe("foldWeekly", () => {
  it("shouldCountEachGameOncePerDimensionWhenRowsShareAWeek", () => {
    const { weeks } = foldWeekly([row({ n: 3 }), row({ color: "black", result: "loss", disconnection: 1, n: 1 })], NO_ELO);
    expect(weeks).toHaveLength(1);
    expect(weeks[0]!.games).toBe(4);
    expect(weeks[0]!.total).toEqual({ w: 3, d: 0, l: 1, u: 0, disconnections: 1 });
    expect(weeks[0]!.byColor.white).toEqual({ w: 3, d: 0, l: 0, u: 0, disconnections: 0 });
    expect(weeks[0]!.byColor.black).toEqual({ w: 0, d: 0, l: 1, u: 0, disconnections: 1 });
    expect(weeks[0]!.byFamily.Italiana!.w + weeks[0]!.byFamily.Italiana!.l).toBe(4);
    expect(weeks[0]!.byPhase.middlegame!.w).toBe(3);
  });

  it("shouldKeepDisconnectionLossesInLossesAndCountThemSeparately", () => {
    const { weeks } = foldWeekly([row({ result: "loss", disconnection: 1, n: 2 }), row({ result: "loss", n: 1 })], NO_ELO);
    expect(weeks[0]!.total.l).toBe(3);
    expect(weeks[0]!.total.disconnections).toBe(2);
  });

  it("shouldNotCountADisconnectionFlagOnAWinAsADisconnectionLoss", () => {
    const { weeks } = foldWeekly([row({ result: "win", disconnection: 1, n: 1 })], NO_ELO);
    expect(weeks[0]!.total).toEqual({ w: 1, d: 0, l: 0, u: 0, disconnections: 0 });
  });

  it("shouldCountUnknownResultsApartWhenOutcomeIsMissing", () => {
    const { weeks } = foldWeekly([row({ result: null, outcome: null, n: 2 }), row({ result: null, outcome: "draw", n: 1 })], NO_ELO);
    expect(weeks[0]!.total).toEqual({ w: 0, d: 1, l: 0, u: 2, disconnections: 0 });
    expect(weeks[0]!.games).toBe(3);
  });

  it("shouldPutRowsWithoutWeekInUndatedWhenPlayedAtIsMissing", () => {
    const out = foldWeekly([row({ week: null, n: 5 }), row({ n: 1 })], NO_ELO);
    expect(out.weeks).toHaveLength(1);
    expect(out.undated).toEqual({ games: 5, w: 5, d: 0, l: 0, u: 0, disconnections: 0 });
  });

  it("shouldSortWeeksAscendingAndAttachEloEndWhenKnown", () => {
    const { weeks } = foldWeekly([row({ week: "2026-11-23" }), row({ week: "2026-11-09" }), row({ week: "2026-11-16" })],
      new Map([["2026-11-16", 912]]));
    expect(weeks.map((w) => w.week)).toEqual(["2026-11-09", "2026-11-16", "2026-11-23"]);
    expect(weeks.map((w) => w.eloEnd)).toEqual([null, 912, null]);
  });

  it("shouldKeyByUnknownWhenColorFamilyOrPhaseIsNull", () => {
    const { weeks } = foldWeekly([row({ color: null, family: null, phase: null })], NO_ELO);
    expect(Object.keys(weeks[0]!.byColor)).toEqual(["unknown"]);
    expect(Object.keys(weeks[0]!.byFamily)).toEqual(["unknown"]);
    expect(Object.keys(weeks[0]!.byPhase)).toEqual(["unknown"]);
  });

  it("shouldReturnEmptyWeeksAndZeroUndatedWhenThereAreNoRows", () => {
    expect(foldWeekly([], NO_ELO)).toEqual({ weeks: [], undated: { games: 0, w: 0, d: 0, l: 0, u: 0, disconnections: 0 } });
  });
});
