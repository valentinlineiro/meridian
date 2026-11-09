import { describe, it, expect } from "vitest";
import { parseGamesText } from "../../../src/slices/linkedin-games/domain/GamesText.ts";

const TODAY = "2026-11-09";
const owner = `P, 5, 16
W, 27, 40
S, 38, 62
Z, 6, 12
Q, 39, 29
T, 43, 51`;

describe("parseGamesText", () => {
  it("shouldReadTheOwnersShortLinesAsTodaysResultsInClockFormat", () => {
    const { entries, errors } = parseGamesText(owner, TODAY);
    expect(errors).toEqual([]);
    expect(entries.map((e) => [e.date, e.game, e.score, e.avg])).toEqual([
      [TODAY, "patches", "0:05", "0:16"], [TODAY, "wend", "0:27", "0:40"], [TODAY, "mini_sudoku", "0:38", "1:02"],
      [TODAY, "zip", "0:06", "0:12"], [TODAY, "queens", "0:39", "0:29"], [TODAY, "tango", "0:43", "0:51"],
    ]);
  });

  it("shouldAcceptFullNamesClockTimesSpacesAccentsAndAMissingAverage", () => {
    const { entries, errors } = parseGamesText("Mini Sudoku 1:05 2:10\nzip, 0:06\nTÁNGO 43 51\nPinpoint, 3, 4", TODAY);
    expect(entries.map((e) => [e.game, e.score, e.avg])).toEqual([["mini_sudoku", "1:05", "2:10"], ["zip", "0:06", null], ["tango", "0:43", "0:51"]]);
    expect(errors).toEqual([{ line: 4, text: "Pinpoint, 3, 4", reason: expect.stringContaining("juego desconocido") }]); // not audited yet
  });

  it("shouldSwitchDateOnADateLineAndUnderstandHoyAndAyer", () => {
    const { entries } = parseGamesText("ayer\nZ, 6, 12\n2026-11-01\nT, 43, 51\nhoy\nQ, 39, 29", TODAY);
    expect(entries.map((e) => [e.date, e.game])).toEqual([["2026-11-08", "zip"], ["2026-11-01", "tango"], [TODAY, "queens"]]);
  });

  it("shouldReportEveryLineItCannotUnderstandWithItsNumber", () => {
    const { entries, errors } = parseGamesText("Z, 6, 12\nhola\nX, 5, 9\nZ, seis", TODAY);
    expect(entries).toHaveLength(1);
    expect(errors.map((e) => e.line)).toEqual([2, 3, 4]);
    expect(errors[1]!.reason).toContain("juego desconocido");
  });

  it("shouldReadTheSpreadsheetTableInCsvTsvOrMarkdownByColumnName", () => {
    const rows = [["Fecha", "DiaSemana", "Juego", "Mi_seg", "Media_seg", "Win"], ["2026-11-09 00:00:00", "lunes", "Sudoku", "38", "62", "True"], ["2026-11-09", "lunes", "Zip", "6", "12", "True"]];
    const expected = [["2026-11-09", "mini_sudoku", "0:38", "1:02"], ["2026-11-09", "zip", "0:06", "0:12"]];
    for (const sep of [",", "\t", ";"]) {
      const { entries, errors } = parseGamesText(rows.map((r) => r.join(sep)).join("\n"), TODAY);
      expect(errors).toEqual([]);
      expect(entries.map((e) => [e.date, e.game, e.score, e.avg])).toEqual(expected);
    }
    const md = "| Fecha | Juego | Mi_seg | Media_seg |\n|---|---|---|---|\n| 2026-11-09 | Zip | 6 | 12 |";
    expect(parseGamesText(md, TODAY).entries.map((e) => [e.game, e.score, e.avg])).toEqual([["zip", "0:06", "0:12"]]);
  });

  it("shouldReportATableRowWithABadDateOrAMissingSecondsColumn", () => {
    const { entries, errors } = parseGamesText("Fecha,Juego,Mi_seg,Media_seg\n19/09/2026,Zip,6,12\n2026-11-09,Zip,,12", TODAY);
    expect(entries).toEqual([]);
    expect(errors.map((e) => e.line)).toEqual([2, 3]);
  });

  it("shouldIgnoreBlankLinesAndReturnNothingForEmptyText", () => {
    expect(parseGamesText("  \n\n", TODAY)).toEqual({ entries: [], errors: [] });
  });
});
