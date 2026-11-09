import { describe, it, expect, beforeEach } from "vitest";
import { ImportGameResults } from "../../../src/slices/linkedin-games/application/ImportGameResults.ts";
import { RecordGameResult } from "../../../src/slices/linkedin-games/application/RecordGameResult.ts";
import { NotFoundError } from "../../../src/application/errors.ts";
import { InMemoryDayRecordStore, owners } from "./fakes.ts";

const OWNER = "owner@example.com";
const TODAY = "2026-11-09";
const NOW = () => new Date(Date.UTC(2026, 10, 9, 12, 0, 0));
let store: InMemoryDayRecordStore;
let importer: ImportGameResults;
let record: RecordGameResult;

beforeEach(() => {
  store = new InMemoryDayRecordStore();
  const lookup = owners({ [OWNER]: "u1" });
  importer = new ImportGameResults(lookup, store, NOW);
  record = new RecordGameResult(lookup, store, NOW);
});

const run = (text: string, apply = true, extra: object = {}) => importer.execute({ ownerEmail: OWNER, text, today: TODAY, tz: "Europe/Madrid", apply, ...extra });
const six = "P, 5, 16\nW, 27, 40\nS, 38, 62\nZ, 6, 12\nQ, 39, 29\nT, 43, 51";

describe("ImportGameResults", () => {
  it("shouldStoreOneCumulativeVersionOfTheDayWhenSeveralGamesAreImported", async () => {
    const r = await run(six);
    expect(r.applied).toBe(true);
    expect(store.versions).toHaveLength(1);
    expect(Object.keys(store.versions[0]!.record.games).sort()).toEqual(["mini_sudoku", "patches", "queens", "tango", "wend", "zip"]);
    expect(store.versions[0]!.record.games.zip).toEqual({ number: null, score: "0:06", scoreSeconds: 6, avg: "0:12", avgSeconds: 12 });
    expect(r.days).toHaveLength(1);
    expect(r.days[0]!.games.every((g) => g.status === "new")).toBe(true);
  });

  it("shouldOnlyPreviewAndWriteNothingWhenApplyIsFalse", async () => {
    const r = await run(six, false);
    expect(r.applied).toBe(false);
    expect(r.days[0]!.games).toHaveLength(6);
    expect(store.versions).toHaveLength(0);
  });

  it("shouldReportSameAndAppendNothingWhenTheSameTextIsImportedAgain", async () => {
    await run(six);
    const again = await run(six);
    expect(again.days[0]!.games.every((g) => g.status === "same")).toBe(true);
    expect(store.versions).toHaveLength(1);
  });

  it("shouldLetTheImportedTextWinAndKeepTheGamesItDoesNotMention", async () => {
    await record.execute({ ownerEmail: OWNER, date: TODAY, game: "zip", score: "0:08", avg: "0:17" });
    await record.execute({ ownerEmail: OWNER, date: TODAY, game: "tango", score: "1:02" });
    const r = await run("Z, 6, 12");
    expect(r.days[0]!.games).toEqual([{ game: "zip", score: "0:06", avg: "0:12", status: "changed" }]);
    const day = (await store.latest("u1", TODAY))!;
    expect(day.games.zip).toMatchObject({ score: "0:06", avg: "0:12" });
    expect(day.games.tango).toMatchObject({ score: "1:02" });
  });

  it("shouldKeepTheStoredAverageWhenTheImportedLineHasNone", async () => {
    await record.execute({ ownerEmail: OWNER, date: TODAY, game: "zip", score: "0:08", avg: "0:17" });
    await run("Z, 6");
    expect((await store.latest("u1", TODAY))!.games.zip).toMatchObject({ score: "0:06", avg: "0:17" });
  });

  it("shouldLetTheLastLineWinWhenAGameAppearsTwiceInTheSameText", async () => {
    await run("Z, 6, 12\nZ, 7, 12");
    expect((await store.latest("u1", TODAY))!.games.zip).toMatchObject({ score: "0:07" });
  });

  it("shouldImportSeveralDatesAtOnce", async () => {
    const lines = ["2026-11-01", "Z, 6, 12", "2026-11-02", "Z, 7, 12", "ayer", "Z, 8, 12"].join("\n");
    const r = await run(lines);
    expect(r.days.map((d) => d.date)).toEqual(["2026-11-01", "2026-11-02", "2026-11-08"]);
    expect(store.versions).toHaveLength(3);
  });

  it("shouldImportManyDatesWithoutLosingOrDuplicatingAnyDay", async () => {
    const days = Array.from({ length: 12 }, (_, i) => `2026-10-${String(i + 1).padStart(2, "0")}\nZ, ${i + 1}, 30`);
    await run(days.join("\n"));
    const again = await run(days.join("\n"));
    expect(again.days).toHaveLength(12);
    expect(again.days.every((d) => d.games[0]!.status === "same")).toBe(true);
    expect(store.versions).toHaveLength(12);
  });

  it("shouldWriteNothingAndListTheErrorsWhenAnyLineIsInvalid", async () => {
    const r = await run("Z, 6, 12\nhola");
    expect(r.applied).toBe(false);
    expect(r.errors.map((e) => e.line)).toEqual([2]);
    expect(r.days).toEqual([]);
    expect(store.versions).toHaveLength(0);
  });

  it("shouldRejectAFutureDateAnAbsurdTimeAndAnImpossibleDateWithTheirLine", async () => {
    const r = await run("2026-11-10\nZ, 6, 12\n2026-02-31\nT, 5, 9\nhoy\nQ, 99:99, 3");
    expect(r.applied).toBe(false);
    expect(r.errors.map((e) => e.line)).toEqual([2, 4, 6]);
    expect(store.versions).toHaveLength(0);
  });

  it("shouldFailWhenTheOwnerHasNoAccount", async () => {
    await expect(importer.execute({ ownerEmail: "nobody@example.com", text: "Z, 6, 12", today: TODAY, apply: true })).rejects.toBeInstanceOf(NotFoundError);
  });

  it("shouldDoNothingForEmptyText", async () => {
    const r = await run("   ");
    expect(r).toEqual({ applied: false, errors: [], days: [] });
  });

  it("shouldCompleteTheRestWithoutDuplicatesWhenTheSameTextIsImportedAgainAfterAWriteFailed", async () => {
    // Validation is all-or-nothing; the writes are one per date, so a failure in the middle leaves the earlier dates saved.
    // What is guaranteed is that the identical retry finishes the job and adds nothing twice.
    let appends = 0;
    const flaky = { latest: store.latest.bind(store), all: store.all.bind(store), append: async (o: string, r: Parameters<typeof store.append>[1]) => { if (++appends === 2) throw new Error("d1 down"); return store.append(o, r); } };
    const text = "2026-11-01\nZ, 6, 12\n2026-11-02\nZ, 7, 12\n2026-11-03\nZ, 8, 12";
    const lookup = owners({ [OWNER]: "u1" });
    await expect(new ImportGameResults(lookup, flaky, NOW).execute({ ownerEmail: OWNER, text, today: TODAY, apply: true })).rejects.toThrow("d1 down");
    expect(store.versions.map((v) => v.record.date)).toEqual(["2026-11-01"]);

    const retry = await run(text);
    expect(retry.days.map((d) => d.games[0]!.status)).toEqual(["same", "new", "new"]);
    expect(store.versions.map((v) => v.record.date)).toEqual(["2026-11-01", "2026-11-02", "2026-11-03"]);
  });
});
