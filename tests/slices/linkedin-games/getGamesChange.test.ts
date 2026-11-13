import { describe, it, expect } from "vitest";
import { GetGamesChange } from "../../../src/slices/linkedin-games/application/GetGamesChange.ts";
import { NotFoundError } from "../../../src/application/errors.ts";
import type { DayRecord } from "../../../src/slices/linkedin-games/domain/LinkedinGames.ts";
import { InMemoryDayRecordStore, owners } from "./fakes.ts";

const SINCE = "2026-10-08";
const UNTIL = "2026-11-13";
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const entry = (score: number, avg: number) => ({ number: null, score: `0:${score}`, scoreSeconds: score, avg: `0:${avg}`, avgSeconds: avg });
const run = (game: string, end: string, count: number, avgAt: (i: number) => number, score = 100): DayRecord[] =>
  Array.from({ length: count }, (_, i) => ({ schema: 1, date: addDays(end, i - count + 1), games: { [game]: entry(score, avgAt(i)) } }));
const stable = (game: string, end: string, n = 170) => run(game, end, n, (i) => 120 + ((i * 37) % 90));
const slow = (game: string, end: string, n: number) => run(game, end, n, () => 165, 200);
const merge = (...lists: DayRecord[][]): DayRecord[] => {
  const by = new Map<string, DayRecord>();
  for (const d of lists.flat()) by.set(d.date, { ...(by.get(d.date) ?? d), games: { ...(by.get(d.date)?.games ?? {}), ...d.games } });
  return [...by.values()].sort((a, b) => a.date.localeCompare(b.date));
};

async function setup(days: DayRecord[], email = "o@x") {
  const store = new InMemoryDayRecordStore();
  for (const d of days) await store.append("u1", d);
  return new GetGamesChange(owners({ [email]: "u1" }), store);
}

describe("GetGamesChange", () => {
  it("shouldReturnCurrentOnlyWhenThereIsNoSince", async () => {
    const r = await (await setup(stable("zip", UNTIL))).execute({ ownerEmail: "o@x", since: null, until: UNTIL });
    expect(r.mode).toBe("current-only");
    expect(r.since).toBeNull();
    expect(r.games).toEqual([{ game: "zip", from: null, to: { kind: "estable" }, outcome: null }]);
    expect(r.elapsedDays).toBeNull();
  });

  it.each([[UNTIL], [addDays(UNTIL, 1)]])("shouldReturnInvalidWindowWhenSinceIsNotBeforeUntil_%s", async (since) => {
    const r = await (await setup(stable("zip", UNTIL))).execute({ ownerEmail: "o@x", since, until: UNTIL });
    expect(r).toMatchObject({ mode: "invalid-window", games: [], elapsedDays: null, playedDaysInWindow: null });
  });

  it("shouldConfirmAChangeBetweenTheTwoDates", async () => {
    const days = [...stable("zip", SINCE), ...slow("zip", UNTIL, 36)];
    const r = await (await setup(days)).execute({ ownerEmail: "o@x", since: SINCE, until: UNTIL });
    expect(r.mode).toBe("compare");
    expect(r.games[0]).toEqual({ game: "zip", from: { kind: "estable" }, to: { kind: "bajando" },
      outcome: { kind: "cambio_confirmado", from: { kind: "estable" }, to: { kind: "bajando" } } });
  });

  it("shouldReportElapsedDaysAs36BetweenOct8AndNov13", async () => {
    const r = await (await setup(stable("zip", UNTIL))).execute({ ownerEmail: "o@x", since: SINCE, until: UNTIL });
    expect(r.elapsedDays).toBe(36);
  });

  it("shouldCountPlayedDaysOnlyInsideTheHalfOpenWindow", async () => {
    // one play on SINCE (excluded), then plays on SINCE+1 and UNTIL (included), then one after UNTIL (excluded)
    const days = [...stable("zip", SINCE, 170), ...run("zip", addDays(SINCE, 1), 1, () => 150), ...run("zip", UNTIL, 1, () => 150), ...run("zip", addDays(UNTIL, 1), 1, () => 150)];
    const r = await (await setup(days)).execute({ ownerEmail: "o@x", since: SINCE, until: UNTIL });
    expect(r.playedDaysInWindow).toBe(2);
  });

  it("shouldGiveEvidenciaAusenteWhenAGameStartsAfterSinceAndStillHasLittleData", async () => {
    const days = merge(stable("zip", SINCE), stable("queens", UNTIL, 30));
    const queens = (await (await setup(days)).execute({ ownerEmail: "o@x", since: SINCE, until: UNTIL })).games.find((g) => g.game === "queens")!;
    expect(queens.from).toEqual({ kind: "pocos_datos", reason: "cobertura_insuficiente" });
    expect(queens.outcome).toMatchObject({ kind: "evidencia", sub: "ausente" });
  });

  it("shouldGiveEvidenciaGanadaWhenTheGameGainsEnoughDataInsideTheWindow", async () => {
    const days = merge(stable("zip", SINCE), stable("queens", UNTIL, 70));
    const queens = (await (await setup(days)).execute({ ownerEmail: "o@x", since: SINCE, until: UNTIL })).games.find((g) => g.game === "queens")!;
    expect(queens.outcome).toEqual({ kind: "evidencia", sub: "ganada", from: { kind: "pocos_datos", reason: "cobertura_insuficiente" }, to: { kind: "estable" } });
  });

  it("shouldNotListAGameWithoutObservationsByUntil", async () => {
    const days = merge(stable("zip", UNTIL), stable("queens", addDays(UNTIL, 10), 5)); // queens only from UNTIL+6
    const r = await (await setup(days)).execute({ ownerEmail: "o@x", since: SINCE, until: UNTIL });
    expect(r.games.map((g) => g.game)).toEqual(["zip"]);
  });

  it("shouldReturnNoGamesWhenTheHistoryIsEmpty", async () => {
    const r = await (await setup([])).execute({ ownerEmail: "o@x", since: SINCE, until: UNTIL });
    expect(r).toMatchObject({ mode: "compare", games: [], playedDaysInWindow: 0 });
  });

  it("shouldSaySinCalibracionForAGameWithoutBands", async () => {
    const r = await (await setup(stable("tango", UNTIL))).execute({ ownerEmail: "o@x", since: SINCE, until: UNTIL });
    expect(r.games[0]!.to).toEqual({ kind: "pocos_datos", reason: "sin_calibracion" });
  });

  it("shouldFailWithNotFoundWhenTheOwnerHasNoAccount", async () => {
    await expect((await setup([])).execute({ ownerEmail: "nobody@x", since: SINCE, until: UNTIL })).rejects.toBeInstanceOf(NotFoundError);
  });
});
