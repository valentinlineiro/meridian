import { describe, it, expect, beforeEach } from "vitest";
import { RecordGameResult } from "../../../src/slices/linkedin-games/application/RecordGameResult.ts";
import { GetDay } from "../../../src/slices/linkedin-games/application/GetDay.ts";
import { InvalidGameResult, InvalidPlayDate } from "../../../src/slices/linkedin-games/domain/LinkedinGames.ts";
import { NotFoundError } from "../../../src/application/errors.ts";
import { InMemoryDayRecordStore, owners } from "./fakes.ts";

const OWNER = "owner@example.com";
const DAY = "2026-10-13";
let store: InMemoryDayRecordStore;
let record: RecordGameResult;
let get: GetDay;
let tick = 0;

beforeEach(() => {
  store = new InMemoryDayRecordStore();
  const lookup = owners({ [OWNER]: "u1" });
  record = new RecordGameResult(lookup, store, () => new Date(Date.UTC(2026, 9, 13, 10, 0, tick++)));
  get = new GetDay(lookup, store);
});

const zip = { ownerEmail: OWNER, date: DAY, game: "zip", score: "0:08", avg: "0:17", number: 449 };

describe("RecordGameResult", () => {
  it("shouldStoreTimeInSecondsAndKeepOriginalStringsWhenResultIsValid", async () => {
    const day = await record.execute(zip);
    expect(day.games.zip).toEqual({ number: 449, score: "0:08", scoreSeconds: 8, avg: "0:17", avgSeconds: 17 });
  });

  it("shouldKeepEarlierGamesWhenAnotherGameIsRecordedTheSameDay", async () => {
    await record.execute(zip);
    const day = await record.execute({ ownerEmail: OWNER, date: DAY, game: "tango", score: "1:02" });
    expect(Object.keys(day.games).sort()).toEqual(["tango", "zip"]);
    expect((await get.execute({ ownerEmail: OWNER, date: DAY })).games).toEqual(day.games);
  });

  it("shouldNotAppendAVersionWhenTheSameResultIsSavedAgain", async () => {
    await record.execute(zip);
    await record.execute(zip);
    expect(store.versions).toHaveLength(1);
  });

  it("shouldAppendADistinctVersionWhenAValueIsCorrectedBackToAnEarlierOne", async () => {
    await record.execute(zip);
    await record.execute({ ...zip, score: "0:09" });
    await record.execute(zip);
    const stamps = store.versions.map((v) => v.record.capturedAt);
    expect(new Set(stamps).size).toBe(3);
    expect(store.versions.at(-1)!.record.games.zip).toMatchObject({ score: "0:08" });
  });

  it("shouldKeepGamesCapturedByOtherSourcesWhenRecordingByHand", async () => {
    store.versions.push({ ownerId: "u1", record: { schema: 1, date: DAY, games: { pinpoint: { number: 530, score: "3", guesses: 3 } } } });
    const day = await record.execute(zip);
    expect(Object.keys(day.games).sort()).toEqual(["pinpoint", "zip"]);
  });

  it("shouldKeepEachOwnersDaysSeparate", async () => {
    const lookup = owners({ [OWNER]: "u1", "b@example.com": "u2" });
    const rec = new RecordGameResult(lookup, store, () => new Date());
    await rec.execute(zip);
    const other = await rec.execute({ ...zip, ownerEmail: "b@example.com", game: "queens" });
    expect(Object.keys(other.games)).toEqual(["queens"]);
  });

  it.each([
    ["a time that is not M:SS", { score: "8" }],
    ["seconds above 59", { score: "0:75" }],
    ["an unknown game", { game: "chess" }],
    ["a game that is not recorded by hand", { game: "pinpoint" }],
    ["a malformed average", { avg: "fast" }],
    ["a non-positive puzzle number", { number: 0 }],
  ])("shouldRejectWhenResultHas %s", async (_l, over) => {
    await expect(record.execute({ ...zip, ...over })).rejects.toBeInstanceOf(InvalidGameResult);
    expect(store.versions).toHaveLength(0);
  });

  it.each(["2026-02-30", "13/10/2026", ""])("shouldRejectWhenDateIs(%s)", async (date) => {
    await expect(record.execute({ ...zip, date })).rejects.toBeInstanceOf(InvalidPlayDate);
  });

  it("shouldFailWhenTheOwnerHasNoAccount", async () => {
    await expect(record.execute({ ...zip, ownerEmail: "nobody@example.com" })).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("RecordGameResult play date vs today", () => {
  const at = (iso: string) => new RecordGameResult(owners({ [OWNER]: "u1" }), store, () => new Date(iso));
  const NEAR_MIDNIGHT_UTC = "2026-10-13T23:30:00Z";

  it("shouldAcceptTodayInThePlayersTimezoneWhenItIsAlreadyTomorrowInUtc", async () => {
    await expect(at(NEAR_MIDNIGHT_UTC).execute({ ...zip, date: "2026-10-14", tz: "Pacific/Auckland" })).resolves.toBeDefined();
  });

  it("shouldRejectTomorrowInThePlayersTimezoneWhenItIsStillTodayThere", async () => {
    await expect(at(NEAR_MIDNIGHT_UTC).execute({ ...zip, date: "2026-10-14", tz: "America/Los_Angeles" })).rejects.toBeInstanceOf(InvalidPlayDate);
  });

  it.each([[undefined], ["Mars/Base"]])("shouldTolerateTheEarliestTimezoneWhenTimezoneIsMissingOrUnknown (%s)", async (tz) => {
    const r = at(NEAR_MIDNIGHT_UTC);
    await expect(r.execute({ ...zip, date: "2026-10-14", tz })).resolves.toBeDefined();
    await expect(r.execute({ ...zip, date: "2026-10-15", tz })).rejects.toBeInstanceOf(InvalidPlayDate);
  });
});
