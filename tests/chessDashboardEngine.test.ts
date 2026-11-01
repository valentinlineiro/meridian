import { describe, it, expect } from "vitest";
import vm from "node:vm";
import { createDashboardRuntime, emptyAccountPayload } from "./helpers/dom.ts";

// The engine errors in the game viewer and the profile tab, driven through the real dashboard script.
const settle = async () => { for (let i = 0; i < 300; i++) await Promise.resolve(); };
const GAME = { ok: true, matchId: "m1", userColor: "white", opponent: "Bot", result: "loss", startFen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
  plies: ["e4", "e5", "Bc4", "Nc6", "Qh5", "Nf6", "Qxf7#"].map((san, i) => ({ san, fen: `fen${i + 1}`, t: null })), pgn: "", missedPlies: [],
  engineWorst: [{ ply: 5, loss: 640, best: "g1f3", bestSan: "Nf3" }, { ply: 3, loss: 310, best: "d2d4", bestSan: null }], engineSummary: { moves: 4, serious: 2, acpl: 162.5 } };

async function open(routes: Record<string, unknown> = {}) {
  const api: Record<string, unknown> = { "/api/me/matches/m1/game": GAME, ...routes };
  const requests: string[] = [];
  const fetchApi = async (url: string) => {
    requests.push(url);
    const key = Object.keys(api).find((k) => url.startsWith(k));
    return { ok: true, status: 200, json: async () => (key ? api[key] : emptyAccountPayload(url)) };
  };
  const rt = createDashboardRuntime("/chess", undefined, fetchApi);
  await settle();
  const call = async (expr: string) => { vm.runInContext(expr, rt.sandbox); await settle(); };
  return { rt, requests, call };
}
const text = (rt: any, sel: string): string => rt.getEl(sel).textContent;

describe("game viewer: engine errors", () => {
  it("shouldListWorstMovesWithLossAndTheEnginesPreferredMove", async () => {
    const { rt, call } = await open();
    await call("openGame('m1')");
    const html = rt.getEl("#gErrors").innerHTML;
    expect(html).toContain("2 errores graves en 4 jugadas tuyas");
    expect(html).toContain("pérdida media 163 cp");
    expect(html).toContain("Jugada 5 (Qh5): pierdes 640 cp; el motor prefería Nf3");
    expect(html).toContain("el motor prefería d2d4"); // no SAN available: the UCI move is shown instead
  });

  it("shouldJumpToThePositionBeforeTheErrorWhenClickingAWorstMove", async () => {
    const { rt, call } = await open();
    await call("openGame('m1')");
    await call("jumpToPly(5)");
    expect(text(rt, "#gPos")).toBe("4 / 7");
  });

  it("shouldHideTheErrorListWhenThereIsNoAnalysis", async () => {
    const { rt, call } = await open({ "/api/me/matches/m1/game": { ...GAME, engineWorst: [], engineSummary: null } });
    await call("openGame('m1')");
    expect(rt.getEl("#gErrors").innerHTML).toBe("");
  });

  it("shouldCleanTheListWhenAnotherGameIsOpening", async () => {
    const { rt, call } = await open();
    await call("openGame('m1')");
    await call("openGame('other')");
    expect(rt.getEl("#gErrors").innerHTML).toBe("");
  });
});

const sec = (o: any = {}) => ({
  games: 100, moves: 4000, serious: 388, ratePer100: 9.7, acpl: 102.5,
  byPhase: { opening: { moves: 1000, serious: 85, ratePer100: 8.5 }, middlegame: { moves: 2400, serious: 271, ratePer100: 11.3 }, endgame: { moves: 600, serious: 26, ratePer100: 4.3 } },
  byColor: { white: { games: 50, moves: 2000, serious: 184, ratePer100: 9.2 }, black: { games: 50, moves: 2000, serious: 204, ratePer100: 10.2 } },
  decisive: { lossGames: 40, withDecisive: 30, medianMove: 10, byPhase: { opening: 15, middlegame: 14, endgame: 1 } },
  conversion: { advantage: { games: 80, win: 62, draw: 6, loss: 12 }, disadvantage: { games: 20, win: 10, draw: 2, loss: 8 }, thrown: 12 },
  ...o,
});
const row = (id: string, acpl: number) => ({ matchId: id, result: "loss", moves: 30, serious: 6, acpl, decisivePly: 12 });
const PROFILE = {
  analysed: 100, pending: 3, invalid: 1, unknownVersion: 2, bots: { games: 98, total: 100, share: 0.98 }, since: null,
  all: sec(), before: null, after: null,
  blocks: [{ games: 50, moves: 2000, serious: 200, ratePer100: 10, acpl: 100, partial: false }, { games: 50, moves: 2000, serious: 188, ratePer100: 9.4, acpl: 90, partial: true }],
  review: { worst: [row("bot|111|aaaaaaaa", 395)], best: [row("bot|222|bbbbbbbb", 5)] },
};
const openProfile = async (profile: any = PROFILE, pre?: string) => {
  const o = await open({ "/api/stats/profile": profile });
  if (pre) await o.call(`localStorage.setItem('profile_since', ${JSON.stringify(pre)})`);
  await o.call("showTab('profile')");
  return o;
};

describe("profile tab", () => {
  it("shouldRenderQualityWithDenominatorsAndPhaseRates", async () => {
    const { rt } = await openProfile();
    expect(text(rt, "#profileQuality")).toBe("Errores graves: 9.7 por 100 jugadas (388 de 4000) · pérdida media 103 cp · 100 partidas analizadas");
    expect(text(rt, "#profilePhases")).toBe("Apertura 8.5 (85 de 1000) · Medio juego 11.3 (271 de 2400) · Final 4.3 (26 de 600)");
    expect(text(rt, "#profileColors")).toContain("Blancas 9.2 (184 de 2000) · Negras 10.2 (204 de 2000)");
  });

  it("shouldRenderTheTrendByBlocksAndMarkThePartialOne", async () => {
    const { rt } = await openProfile();
    expect(text(rt, "#profileTrend")).toBe("Por bloques de 50 partidas: 10.0 → 9.4 (último bloque incompleto, 50 partidas)");
  });

  it("shouldRenderDecisiveMomentsShares", async () => {
    const { rt } = await openProfile();
    expect(text(rt, "#profileDecisive")).toBe("Derrotas con momento decisivo: 30 de 40 · jugada mediana 10 · Apertura 15 (50%) · Medio juego 14 (47%) · Final 1 (3%)");
  });

  it("shouldRenderConversionWithDrawsApart", async () => {
    const { rt } = await openProfile();
    const html = rt.getEl("#profileConversion").innerHTML;
    expect(html).toContain("Con ventaja sostenida (+300): 80 partidas · ganadas 78% (62) · tablas 8% · perdidas 15% (12)");
    expect(html).toContain("Con desventaja sostenida (−300): 20 partidas · ganadas 50% (10)");
  });

  it("shouldRenderBeforeAndAfterWhenSinceIsSet", async () => {
    const withCut = { ...PROFILE, since: { matchId: "cut", playedAt: 5 }, before: sec({ games: 60, moves: 2400, serious: 240, ratePer100: 10 }), after: sec({ games: 40, moves: 1600, serious: 100, ratePer100: 6.25 }) };
    const { rt, requests } = await openProfile(withCut, "cut");
    expect(requests.some((u) => u === "/api/stats/profile?since=cut")).toBe(true);
    expect(text(rt, "#profileCut")).toContain("Antes del corte: 60 partidas · 10.0 por 100 jugadas (240 de 2400)");
    expect(text(rt, "#profileCut")).toContain("Después: 40 partidas · 6.3 por 100 jugadas (100 de 1600)");
  });

  it("shouldRememberTheCutAndSurviveLocalStorageBeingUnavailable", async () => {
    const { rt, call, requests } = await openProfile();
    rt.getEl("#profileSinceInput").value = "  bot|1793359067|5j8ad1m8 ";
    await call("applyProfileSince()");
    expect(requests.at(-1)).toBe("/api/stats/profile?since=" + encodeURIComponent("bot|1793359067|5j8ad1m8"));
    await call("clearProfileSince()");
    expect(requests.at(-1)).toBe("/api/stats/profile");
    await call("Object.defineProperty(window.localStorage, 'getItem', { value(){ throw new Error('blocked'); } })").catch(() => {});
    await call("fetchProfile()");
    expect(text(rt, "#profileQuality")).toContain("Errores graves");
  });

  it("shouldExplainAnUnknownCutInsteadOfSilentlyShowingEverything", async () => {
    const { rt } = await openProfile(PROFILE, "nope");
    expect(text(rt, "#profileSinceNote")).toBe("No encontré esa partida con fecha: se muestra todo sin dividir.");
  });

  it("shouldSayWhatIsLeftOutOfTheFiguresAndThatMostGamesAreAgainstBots", async () => {
    const { rt } = await openProfile();
    const note = text(rt, "#profileNote");
    expect(note).toContain("3 partidas sin analizar");
    expect(note).toContain("1 no se pudieron evaluar");
    expect(note).toContain("2 con un formato que este panel no entiende");
    expect(note).toContain("El 98% de las partidas son contra bots");
    expect(note).toContain("sin intervalo");
  });

  it("shouldShowNothingMisleadingWhenNothingIsAnalysedYet", async () => {
    const { rt } = await openProfile({ ...PROFILE, analysed: 0, pending: 1648, all: sec({ games: 0, moves: 0, serious: 0, ratePer100: null, acpl: null }), blocks: [], review: { worst: [], best: [] } });
    expect(text(rt, "#profileQuality")).toBe("Todavía no hay partidas analizadas");
    expect(text(rt, "#profileNote")).toContain("1648 partidas sin analizar");
  });

  it("shouldOpenTheViewerFromAReviewRow", async () => {
    const { rt, requests, call } = await openProfile();
    expect(rt.getEl("#profileWorst").innerHTML).toContain("aaaaaaaa");
    expect(rt.getEl("#profileWorst").innerHTML).toContain("pérdida media 395 cp · 6 graves en 30 · decisivo en la jugada 12");
    await call("openGame('bot|111|aaaaaaaa')");
    expect(requests.some((u) => u.includes("/api/me/matches/") && u.includes("aaaaaaaa"))).toBe(true);
  });

  it("shouldShowAnErrorLineWhenTheProfileCannotBeLoaded", async () => {
    const requests: string[] = [];
    const rt = createDashboardRuntime("/chess", undefined, async (url: string) => {
      requests.push(url);
      return url.startsWith("/api/stats/profile") ? { ok: false, status: 500, json: async () => ({}) } : { ok: true, status: 200, json: async () => emptyAccountPayload(url) };
    });
    await settle();
    vm.runInContext("showTab('profile')", rt.sandbox); await settle();
    expect(text(rt, "#profileQuality")).toBe("No se pudo cargar el perfil");
  });
});
