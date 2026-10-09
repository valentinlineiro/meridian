import { describe, it, expect } from "vitest";
import vm from "node:vm";
import { callDashboard, createDashboardRuntime, emptyAccountPayload } from "./helpers/dom.ts";

// The Chess tab, booted against a realistic API and read back from the page. Each test asserts what the owner sees.
const settle = async () => { for (let i = 0; i < 300; i++) await Promise.resolve(); };
const group = (o: any) => ({ key: "white", games: 10, wins: 5, losses: 4, draws: 1, unknown: 0, decided: 10, winRate: 0.5, scoreRate: 0.55, winRateCi: { lower: 0.2, upper: 0.8 }, ...o });

const summary = { games: 100, wins: 50, losses: 20, draws: 30, winRate: 0.5, scoreRate: 0.65, currentElo: 1000, firstElo: 900, currentStreak: 3, currentStreakKind: "loss", longestWin: 5, longestLoss: 2 };
const api: Record<string, unknown> = {
  "/api/stats/summary": summary,
  "/api/stats/results": { endConditions: {
    checkmate: { loss: 4, draw: 0 }, disconnection: { loss: 2, draw: 0 }, resignation: { loss: 3, draw: 0 },
    stalemate: { loss: 0, draw: 1 }, repetition: { loss: 0, draw: 2 }, insufficient_material: { loss: 0, draw: 1 }, fifty_moves: { loss: 0, draw: 1 },
  } },
  "/api/stats/color": { groups: [group({ key: "white", winRate: 0.7 }), group({ key: "black", winRate: 0.45 })], difference: { diff: 0.25, lower: 0.038, upper: 0.433 } },
  "/api/stats/opponents": {
    macro: [{ key: "bot", games: 60, winRate: 0.6 }, { key: "pvp", games: 40, winRate: 0.4 }],
    segments: [group({ key: "neural", games: 30 }), group({ key: "pvp", games: 7 })],
  },
  "/api/stats/opponent-elo": { count: 40, buckets: [], min: 700, max: 1500, average: 1000 },
  "/api/stats/timeline": { snapshots: [{ createdAt: "2026-10-01T10:00:00Z", elo: 900 }, { createdAt: "2026-10-08T10:00:00Z", elo: 1000 }] },
  "/api/stats/openings": { white: [group({ key: "e4_open", label: "Apertura abierta e4" })], black: [group({ key: "sicilian", label: "Siciliana" })], population: { hydrated: 5, totalMatches: 100 } },
  "/api/stats/phases": { phases: [group({ key: "endgame", label: "Final" })], medianPlies: 42, population: { hydrated: 10, totalMatches: 100 } },
  "/api/stats/recent": { limit: 50, games: 50, wins: 25, losses: 20, draws: 5, winRate: 0.5, before: null },
  "/api/matches": { rows: [], total: 0 },
};
const fetchApi = async (url: string) => {
  const key = Object.keys(api).find((k) => url.startsWith(k));
  return { ok: true, status: 200, json: async () => (key ? api[key] : emptyAccountPayload(url)) };
};

async function openChess(overrides: Record<string, unknown> = {}) {
  const saved = { ...api };
  Object.assign(api, overrides);
  try {
    const rt = createDashboardRuntime("/chess", undefined, fetchApi);
    await settle();
    return rt;
  } finally {
    for (const k of Object.keys(api)) delete api[k];
    Object.assign(api, saved);
  }
}
const text = (rt: any, sel: string): string => rt.getEl(sel).textContent;

describe("chess tab: results card", () => {
  it("shouldBreakDownLossesAndDrawsByHowTheGamesEnded", async () => {
    const rt = await openChess();
    expect(text(rt, "#lossContext")).toBe("Derrotas: 4 mates · 2 desconexiones (10%) · 3 rendiciones");
    expect(text(rt, "#drawContext")).toBe("Tablas: 1 ahogados · 2 repetición · 1 material · 1 50 jugadas");
  });
});

describe("chess tab: colour gap", () => {
  it("shouldHeadlineTheWhiteBlackGapWithItsIntervalWhenThePageOpens", async () => {
    const rt = await openChess();
    expect(text(rt, "#colDiff")).toBe("Blancas 70.0% · Negras 45.0% → +25.0 pp · IC95 [+4, +43]");
  });
});

describe("chess tab: rating", () => {
  it("shouldSayTheEloChangeIsAgainstTheFirstSnapshot", async () => {
    const rt = await openChess();
    expect(rt.getEl("#kpis").innerHTML).toContain("▲ +100 vs primer snapshot");
    expect(text(rt, "#chessHeroEloSub")).toBe("ELO · +100 vs primer snapshot");
    expect(text(rt, "#chessHeroMeta")).toContain("ELO observado en sincronizaciones");
  });
});

describe("chess tab: opponents", () => {
  it("shouldSummariseBotsAgainstPlayersAndListEverySegmentWithItsGames", async () => {
    const rt = await openChess();
    expect(text(rt, "#oppMacro")).toBe("Bots: 60 (60,0 %) · PvP: 40 (40,0 %)");
    const html = rt.getEl("#opp").innerHTML;
    expect(html).toContain("Neural");
    expect(html).toMatch(/PvP<\/b><span class="muted">7 · /); // the PvP sample size stays visible
  });

  it("shouldLeaveASmallSampleToItsIntervalInsteadOfAHeuristicLabel", () => {
    const html = callDashboard(`renderCompare(${JSON.stringify([group({ key: "pvp", games: 3, wins: 3, losses: 0, draws: 0, decided: 3, winRate: 1, winRateCi: { lower: 0.44, upper: 1 } })])}, 100)`).result as string;
    expect(html).toContain("[44–100]");
    expect(html).not.toMatch(/muestra pequeña/i);
    expect(html).toContain("decididas");
  });
});

describe("chess tab: openings and phases", () => {
  it("shouldShowOpeningsByColourAndOfferThemInTheOpeningFilter", async () => {
    const rt = await openChess();
    expect(rt.getEl("#openingsWhite").innerHTML).toContain("Apertura abierta e4");
    expect(rt.getEl("#openingsBlack").innerHTML).toContain("Siciliana");
    expect(text(rt, "#openingsPop")).toBe("Hidratadas: 5 / 100 partidas");
    const offered = rt.getEl("#fOpening").children.flatMap((g: any) => g.children.map((o: any) => o.value));
    expect(offered).toEqual(expect.arrayContaining(["e4_open", "sicilian"]));
  });

  it("shouldShowThePhasesWithTheirMedianLength", async () => {
    const rt = await openChess();
    expect(rt.getEl("#phasesBody").innerHTML).toContain("Final");
    expect(text(rt, "#phasesMeta")).toBe("Mediana: 42 plies · Hidratadas: 10 partidas");
  });
});

describe("chess tab: streak and matches subtitle", () => {
  const view = async (summaryPatch: object, matches: unknown[] = [{}, {}]) => {
    const rt = await openChess();
    vm.runInContext(`renderChessView(${JSON.stringify({ summary: { ...summary, ...summaryPatch } })}, ${JSON.stringify(matches)})`, rt.sandbox);
    return rt;
  };

  it("shouldColourTheStreakPillByItsKind", async () => {
    expect((await view({ currentStreak: 3, currentStreakKind: "loss" })).getEl("#chessHeroStreak").className).toBe("pill pill-loss");
    expect((await view({ currentStreak: 3, currentStreakKind: "win" })).getEl("#chessHeroStreak").className).toBe("pill pill-win");
    const none = await view({ currentStreak: 0, currentStreakKind: null });
    expect(none.getEl("#chessHeroStreak").className).toBe("pill");
    expect(text(none, "#chessHeroStreak")).toContain("Sin racha activa");
  });

  it("shouldKeepThePreviousStatisticsWhenALaterRenderBringsOnlyPartOfThem", async () => {
    const rt = await view({});
    vm.runInContext(`renderChessView({ phases: { phases: [], medianPlies: 7 } }, null)`, rt.sandbox);
    expect(String(text(rt, "#chessHeroElo"))).toBe("1000");
  });

  it("shouldCountTheShownMatchesWhileCompactAndSayAllWhenExpanded", async () => {
    const rt = await view({}, Array.from({ length: 25 }, () => ({})));
    expect(text(rt, "#chessMatchesSubtitle")).toBe("Partidas recientes (10 mostradas)");
    vm.runInContext(`compact = false; renderChessView(null, ${JSON.stringify(Array.from({ length: 25 }, () => ({})))})`, rt.sandbox);
    expect(text(rt, "#chessMatchesSubtitle")).toBe("Todas las partidas (50 por página)");
  });
});

describe("chess tab: recent form colour split", () => {
  const form = (white: number, black: number) => callDashboard(`renderForm(${JSON.stringify({
    ...group({ limit: 20 }), before: group({ games: 40 }), delta: null,
    colorGroups: [group({ key: "white", games: white }), group({ key: "black", games: black })],
  })})`).els["#form"]!.innerHTML as string;

  it("shouldShowTheColourSplitOnlyWhenBothColoursHaveGames", () => {
    expect(form(8, 12)).toContain("♔ Blancas");
    expect(form(0, 20)).not.toContain("♔ Blancas");
    expect(form(20, 0)).not.toContain("♚ Negras");
  });
});
