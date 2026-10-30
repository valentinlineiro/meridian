import { describe, it, expect } from "vitest";
import vm from "node:vm";
import { createDashboardRuntime, emptyAccountPayload } from "./helpers/dom.ts";

// The mate-threat card, the missed-games filter and the viewer list, driven through the real dashboard script.
const settle = async () => { for (let i = 0; i < 300; i++) await Promise.resolve(); };
const tally = (faced: number, neutralized: number, missed: number, unpunished: number) => ({ faced, neutralized, missed, unpunished, rate: faced ? neutralized / faced : null });
const THREATS = {
  analysed: 326, pending: 12, invalid: 2, unknownVersion: 1, gamesWithMissed: 104,
  totals: tally(499, 283, 104, 112),
  byPhase: { opening: tally(74, 53, 13, 8), middlegame: tally(268, 132, 64, 72), endgame: tally(157, 98, 27, 32) },
  recent: { games: 100, ...tally(150, 90, 30, 30) },
  rest: { games: 226, ...tally(349, 193, 74, 82) },
};
const summary = { games: 100, wins: 50, losses: 20, draws: 30, winRate: 0.5, scoreRate: 0.65, currentElo: 1000, firstElo: 900, currentStreak: 3, currentStreakKind: "loss", longestWin: 5, longestLoss: 2 };
const group = (o: any) => ({ key: "white", games: 10, wins: 5, losses: 4, draws: 1, unknown: 0, decided: 10, winRate: 0.5, scoreRate: 0.55, winRateCi: { lower: 0.2, upper: 0.8 }, ...o });
const GAME = { ok: true, matchId: "m1", userColor: "black", opponent: "Bot", result: "loss", startFen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
  plies: ["e4", "e5", "Bc4", "Nc6", "Qh5", "Nf6", "Qxf7#"].map((san, i) => ({ san, fen: `fen${i + 1}`, t: null })), pgn: "", missedPlies: [6] };

function routes(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    "/api/stats/summary": summary,
    "/api/stats/results": { endConditions: { checkmate: { loss: 4, draw: 0 } } },
    "/api/stats/color": { groups: [group({ key: "white" }), group({ key: "black" })], difference: null },
    "/api/stats/opponents": { macro: [{ key: "bot", games: 60, winRate: 0.6 }], segments: [group({ key: "neural" })] },
    "/api/stats/opponent-elo": { count: 40, buckets: [], min: 700, max: 1500, average: 1000 },
    "/api/stats/timeline": { snapshots: [] },
    "/api/stats/openings": { white: [], black: [], unclassified: 0, population: { hydrated: 5, totalMatches: 100 } },
    "/api/stats/mates": { given: [], received: [], unclassified: 0 },
    "/api/stats/phases": { phases: [], medianPlies: 0, population: { hydrated: 10, totalMatches: 100 } },
    "/api/stats/recent": { limit: 50, games: 50, wins: 25, losses: 20, draws: 5, winRate: 0.5, before: null },
    "/api/stats/threats": THREATS,
    "/api/matches": { rows: [], total: 0 },
    "/api/me/matches/m1/game": GAME,
    ...over,
  };
}
const BUNDLE = { summary: "summary", results: "results", color: "color", opponents: "opponents", opponentElo: "opponent-elo", timeline: "timeline", recent: "recent" };

async function openChess(over: Record<string, unknown> = {}) {
  const api = routes(over); const requests: string[] = [];
  const fetchApi = async (url: string) => {
    requests.push(url);
    const key = Object.keys(api).find((k) => url.startsWith(k));
    const body = key ? api[key] : url.startsWith("/api/stats/bundle") ? Object.fromEntries(Object.entries(BUNDLE).map(([k, r]) => [k, api[`/api/stats/${r}`]])) : emptyAccountPayload(url);
    return { ok: true, status: 200, json: async () => body };
  };
  const rt = createDashboardRuntime("/chess", undefined, fetchApi);
  await settle();
  const call = async (expr: string) => { vm.runInContext(expr, rt.sandbox); await settle(); };
  return { rt, requests, call };
}
const text = (rt: any, sel: string): string => rt.getEl(sel).textContent;

describe("chess tab: mate-threat card", () => {
  it("shouldShowTheRateWithItsDenominator", async () => {
    const { rt } = await openChess();
    expect(rt.getEl("#threatsCard").style.display).toBe("block");
    expect(text(rt, "#threatsMain")).toBe("Neutralizadas 283 de 499 (57%) · te mataron 104 · el rival no las jugó 112");
  });

  it("shouldShowEachPhaseWithItsDenominator", async () => {
    const { rt } = await openChess();
    expect(text(rt, "#threatsPhases")).toBe("Apertura 53 de 74 (72%) · Medio juego 132 de 268 (49%) · Final 98 de 157 (62%)");
  });

  it("shouldMarkAPhaseWithNoThreatsAsNoDataInsteadOfZeroPercent", async () => {
    const { rt } = await openChess({ "/api/stats/threats": { ...THREATS, byPhase: { ...THREATS.byPhase, endgame: tally(0, 0, 0, 0) } } });
    expect(text(rt, "#threatsPhases")).toContain("Final sin amenazas");
    expect(text(rt, "#threatsPhases")).not.toContain("Final 0 de 0");
  });

  it("shouldShowRecentAgainstTheRest", async () => {
    const { rt } = await openChess();
    expect(text(rt, "#threatsTrend")).toBe("Últimas 100 partidas analizadas: 90 de 150 (60%) · el resto (226): 193 de 349 (55%)");
  });

  it("shouldStateThatOnlyMateInOneIsCountedAndWhyThereIsNoInterval", async () => {
    const { rt } = await openChess();
    const note = text(rt, "#threatsNote");
    expect(note).toContain("Solo cuenta amenazas de mate en 1");
    expect(note).toContain("tasas descriptivas de posiciones observadas");
    expect(note).toContain("sin intervalo");
  });

  it("shouldSayHowManyGamesAreStillPendingInvalidOrUnreadable", async () => {
    const { rt } = await openChess();
    const note = text(rt, "#threatsNote");
    expect(note).toContain("12 partidas sin analizar");
    expect(note).toContain("2 no se pudieron reproducir");
    expect(note).toContain("1 con un formato que este panel no entiende");
  });

  it("shouldShowNothingMisleadingWhenNothingIsAnalysedYet", async () => {
    const empty = { ...THREATS, analysed: 0, pending: 1643, invalid: 0, unknownVersion: 0, gamesWithMissed: 0, totals: tally(0, 0, 0, 0), byPhase: { opening: tally(0, 0, 0, 0), middlegame: tally(0, 0, 0, 0), endgame: tally(0, 0, 0, 0) }, recent: { games: 0, ...tally(0, 0, 0, 0) }, rest: { games: 0, ...tally(0, 0, 0, 0) } };
    const { rt } = await openChess({ "/api/stats/threats": empty });
    expect(text(rt, "#threatsMain")).toBe("Todavía no hay partidas analizadas");
    expect(text(rt, "#threatsMain")).not.toContain("%");
    expect(text(rt, "#threatsNote")).toContain("1643 partidas sin analizar");
    expect(rt.getEl("#threatsMissedBtn").style.display).toBe("none");
  });

  it("shouldSayThereWereNoThreatsWhenGamesWereAnalysedButNoneHadOne", async () => {
    const none = { ...THREATS, gamesWithMissed: 0, totals: tally(0, 0, 0, 0), recent: { games: 100, ...tally(0, 0, 0, 0) }, rest: { games: 226, ...tally(0, 0, 0, 0) } };
    const { rt } = await openChess({ "/api/stats/threats": none });
    expect(text(rt, "#threatsMain")).toBe("Sin amenazas de mate en 1 en las partidas analizadas");
  });

  it("shouldHideTheCardWhenTheEndpointFails", async () => {
    const { rt } = await openChess({ "/api/stats/threats": { error: "boom" } });
    expect(rt.getEl("#threatsCard").style.display).toBe("none");
  });

  it("shouldFilterTheMatchesTableToMissedThreatsWhenTheButtonIsPressed", async () => {
    const { rt, requests, call } = await openChess();
    expect(text(rt, "#threatsMissedBtn")).toBe("Ver partidas donde no viste el mate (104)");
    await call("toggleMissedThreats()");
    const last = new URL(requests.filter((u) => u.startsWith("/api/matches")).at(-1)!, "http://x").searchParams;
    expect(last.get("missedThreat")).toBe("1");
    expect(text(rt, "#threatsMissedBtn")).toBe("Quitar el filtro de mates no vistos");
    await call("toggleMissedThreats()");
    expect(new URL(requests.filter((u) => u.startsWith("/api/matches")).at(-1)!, "http://x").searchParams.has("missedThreat")).toBe(false);
  });

  it("shouldDropTheMissedFilterWhenClearingFilters", async () => {
    const { requests, call } = await openChess();
    await call("toggleMissedThreats()");
    await call("clearF()");
    expect(new URL(requests.filter((u) => u.startsWith("/api/matches")).at(-1)!, "http://x").searchParams.has("missedThreat")).toBe(false);
  });
});

describe("game viewer: missed threats", () => {
  it("shouldListEachMissedPlyWithTheMoveThatWasPlayedAndJumpToThePositionBeforeIt", async () => {
    const { rt, call } = await openChess();
    await call("openGame('m1')");
    const html = rt.getEl("#gMissed").innerHTML;
    expect(html).toContain('data-p="6"');
    expect(html).toContain("Jugada 6");
    expect(html).toContain("Nf6"); // ply 6 of GAME is Nf6: the listed number and the move agree
    await call("jumpToMissedPly(6)");
    expect(text(rt, "#gPos")).toBe("5 / 7"); // the position in which the threat stood, before the move
  });

  it("shouldShowNoMissedListWhenTheGameHasNone", async () => {
    const { rt, call } = await openChess({ "/api/me/matches/m1/game": { ...GAME, missedPlies: [] } });
    await call("openGame('m1')");
    expect(rt.getEl("#gMissed").innerHTML).toBe("");
  });
});
