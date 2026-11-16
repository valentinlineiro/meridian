import { describe, it, expect, beforeEach } from "vitest";
import { SaveDay } from "../../../src/slices/linkedin-games/application/SaveDay.ts";
import { NotFoundError } from "../../../src/application/errors.ts";
import { InMemoryDayRecordStore, owners } from "./fakes.ts";

const OWNER = "owner@example.com";
const DATE = "2026-11-09";
const NOW = () => new Date(Date.UTC(2026, 10, 9, 12, 0, 0));
let store: InMemoryDayRecordStore;
let saveDay: SaveDay;

beforeEach(() => {
  store = new InMemoryDayRecordStore();
  saveDay = new SaveDay(owners({ [OWNER]: "u1" }), store, NOW);
});

const run = (set: { game: string; score: string; avg?: string | null }[], remove: string[] = [], date = DATE) =>
  saveDay.execute({ ownerEmail: OWNER, date, tz: "Europe/Madrid", set, remove });
const stored = async () => (await store.latest("u1", DATE))!.games;

describe("SaveDay", () => {
  it("shouldAppendOneVersionWithEveryGameSetWhenTheDayIsNew", async () => {
    const r = await run([{ game: "zip", score: "0:48", avg: "0:53" }, { game: "queens", score: "1:12" }]);
    expect(r.errors).toEqual([]);
    expect(store.versions).toHaveLength(1);
    expect(Object.keys(await stored()).sort()).toEqual(["queens", "zip"]);
    expect(r.games.map((g) => g.status)).toEqual(["new", "new"]);
  });

  it("shouldAppendNothingWhenTheSameSaveIsRepeated", async () => {
    await run([{ game: "zip", score: "0:48" }]);
    const again = await run([{ game: "zip", score: "0:48" }]);
    expect(again.games[0]!.status).toBe("same");
    expect(store.versions).toHaveLength(1);
  });

  it("shouldKeepTheGamesTheSaveDoesNotMention", async () => {
    await run([{ game: "zip", score: "0:48" }, { game: "tango", score: "1:02" }]);
    await run([{ game: "zip", score: "0:40" }]);
    expect(await stored()).toMatchObject({ zip: { score: "0:40" }, tango: { score: "1:02" } });
  });

  it("shouldKeepTheStoredAverageWhenAvgIsAbsentAndClearItWhenAvgIsNull", async () => {
    await run([{ game: "zip", score: "0:48", avg: "0:53" }]);
    await run([{ game: "zip", score: "0:47" }]);
    expect((await stored()).zip).toMatchObject({ score: "0:47", avg: "0:53", avgSeconds: 53 });
    await run([{ game: "zip", score: "0:47", avg: null }]);
    const zip = (await stored()).zip as Record<string, unknown>;
    expect(zip).toMatchObject({ score: "0:47" });
    expect(zip).not.toHaveProperty("avg");
    expect(zip).not.toHaveProperty("avgSeconds");
  });

  it("shouldDeleteTheGameKeyAndAppendAVersionWhenAStoredGameIsRemoved", async () => {
    await run([{ game: "zip", score: "0:48" }, { game: "tango", score: "1:02" }]);
    const r = await run([], ["tango"]);
    expect(Object.keys(await stored())).toEqual(["zip"]);
    expect(store.versions).toHaveLength(2);
    expect(r.removed).toEqual(["tango"]);
  });

  it("shouldIgnoreARemovalOfAGameThatIsNotStored", async () => {
    await run([{ game: "zip", score: "0:48" }]);
    const r = await run([], ["tango"]);
    expect(r.removed).toEqual([]);
    expect(store.versions).toHaveLength(1);
  });

  it("shouldWriteNothingAndNameEachGameAndFieldWhenAnythingIsInvalid", async () => {
    const r = await run([{ game: "zip", score: "1:6" }, { game: "queens", score: "1:12", avg: "x" }, { game: "foo", score: "0:10" }, { game: "tango", score: "0:10" }]);
    expect(r.errors.map((e) => [e.game, e.field])).toEqual([["zip", "score"], ["queens", "avg"], ["foo", "game"]]);
    expect(store.versions).toHaveLength(0);
  });

  it("shouldRejectAPlainDigitScoreBecauseTheSheetAlwaysSendsMSS", async () => {
    const r = await run([{ game: "zip", score: "106" }]);
    expect(r.errors.map((e) => [e.game, e.field])).toEqual([["zip", "score"]]);
  });

  it("shouldRejectAFutureDateAndAGameBothSetAndRemoved", async () => {
    const future = await run([{ game: "zip", score: "0:48" }], [], "2026-11-11");
    expect(future.errors.map((e) => e.field)).toEqual(["date"]);
    const both = await run([{ game: "zip", score: "0:48" }], ["zip"]);
    expect(both.errors.map((e) => [e.game, e.field])).toEqual([["zip", "game"]]);
    expect(store.versions).toHaveLength(0);
  });

  it("shouldFailWhenTheOwnerHasNoAccount", async () => {
    await expect(new SaveDay(owners({}), store, NOW).execute({ ownerEmail: OWNER, date: DATE, set: [], remove: [] })).rejects.toBeInstanceOf(NotFoundError);
  });
});
