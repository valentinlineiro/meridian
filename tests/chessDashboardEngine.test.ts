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
const row = (id: string, acpl: number) => ({ matchId: id, result: "loss", opponent: "Stockfish Bot", playedAt: 1790000000, color: "white", moves: 30, serious: 6, acpl, decisivePly: 12 });
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

const html = (rt: any, sel: string): string => rt.getEl(sel).innerHTML;

describe("profile tab", () => {
  it("shouldHeadlineFourPlainLanguageFiguresWithTheirDenominators", async () => {
    const { rt } = await openProfile();
    const k = html(rt, "#profileKpis");
    expect(k).toContain("<b>9.7</b><small>por 100 jugadas · 388 de 4000</small>");
    expect(k).toContain("<b>1,0</b><small>peones por jugada · 103 cp</small>");
    expect(k).toContain("<b>75%</b><small>30 de 40 derrotas</small>");
    expect(k).toContain("<b>78%</b><small>62 de 80 · 12 perdidas</small>");
  });

  it("shouldNameTheWorstPhaseInAFixedRuleSentence", async () => {
    const { rt } = await openProfile();
    expect(text(rt, "#profileVerdict")).toBe("Mayor tasa observada de errores graves: medio juego (11.3 por 100 jugadas; final: 4.3). Hay un momento decisivo en 75% de tus derrotas (30 de 40), con mediana en tu jugada 10.");
  });

  it("shouldDrawPhaseAndColourBarsWithRateAndCount", async () => {
    const { rt } = await openProfile();
    expect(html(rt, "#profilePhases")).toContain("Medio juego</span>");
    expect(html(rt, "#profilePhases")).toContain("271 de 2400");
    expect(html(rt, "#profileColors")).toContain("184 de 2000");
    expect(html(rt, "#profileColors")).toContain("204 de 2000");
  });

  it("shouldDrawTheTrendByBlocksAndMarkThePartialOne", async () => {
    const { rt } = await openProfile();
    const t = html(rt, "#profileTrend");
    expect(t).toContain('title="Partidas 1–50: 10.0 por 100 jugadas (200 de 2000 jugadas)"');
    expect(t).toContain('title="Partidas 51–100: 9.4 por 100 jugadas (188 de 2000 jugadas) · bloque incompleto"');
    expect(t).toContain("Primeras partidas · 10.0");
    expect(t).toContain("Últimas · 9.4 (incompleto)");
  });

  it("shouldExplainWhenThereAreNotEnoughBlocksForATrend", async () => {
    const { rt } = await openProfile({ ...PROFILE, blocks: [PROFILE.blocks[0]] });
    expect(html(rt, "#profileTrend")).toContain("al menos dos bloques");
  });

  it("shouldRenderDecisiveMomentsSharesByPhase", async () => {
    const { rt } = await openProfile();
    const d = html(rt, "#profileDecisive");
    expect(d).toContain("<b>30 de 40</b> derrotas tienen un momento decisivo");
    expect(d).toContain("antes de tu jugada 10");
    expect(d).toContain("50%");
    expect(d).toContain("47%");
  });

  it("shouldRenderConversionWithDrawsApartAndNoUnexplainedThreshold", async () => {
    const { rt } = await openProfile();
    const c = html(rt, "#profileConversion");
    expect(c).toContain("Con ventaja de más de 3 peones");
    expect(c).toContain("Ganadas 78% (62)");
    expect(c).toContain("Tablas 6");
    expect(c).toContain("Con desventaja de más de 3 peones");
  });

  it("shouldCompareBeforeAndAfterTheCutAndWarnWhenTheSampleIsSmall", async () => {
    const withCut = { ...PROFILE, since: { matchId: "cut", playedAt: 5 }, before: sec({ games: 60, moves: 2400, serious: 240, ratePer100: 10 }), after: sec({ games: 23, moves: 1600, serious: 100, ratePer100: 6.25 }) };
    const { rt, requests } = await openProfile(withCut, "cut");
    expect(requests.some((u) => u === "/api/stats/profile?since=cut")).toBe(true);
    const c = html(rt, "#profileCut");
    expect(c).toContain("<b>10.0</b><b>6.3</b>");
    expect(c).toContain("pill-win\">−3.8");
    expect(c).toContain("Solo 23 partidas después del corte");
  });

  it("shouldNotWarnOnceThereAreFiftyGamesAfterTheCut", async () => {
    const withCut = { ...PROFILE, since: { matchId: "cut", playedAt: 5 }, before: sec({ games: 60 }), after: sec({ games: 50, ratePer100: 12 }) };
    const { rt } = await openProfile(withCut, "cut");
    expect(html(rt, "#profileCut")).not.toContain("Solo ");
    expect(html(rt, "#profileCut")).toContain("pill-loss\">+2.3");
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
    expect(html(rt, "#profileKpis")).toContain("Errores graves");
  });

  it("shouldExplainAnUnknownCutInsteadOfSilentlyShowingEverything", async () => {
    const { rt } = await openProfile(PROFILE, "nope");
    expect(text(rt, "#profileSinceNote")).toBe("No encontré esa partida con fecha: se muestra todo sin dividir.");
  });

  it("shouldSayUpFrontThatMostGamesAreAgainstBotsAndWhatIsLeftOut", async () => {
    const { rt } = await openProfile();
    expect(text(rt, "#profileContext")).toContain("98% contra bots");
    const note = text(rt, "#profileNote");
    expect(note).toContain("3 partidas sin analizar");
    expect(note).toContain("1 no se pudieron evaluar");
    expect(note).toContain("2 con un formato que este panel no entiende");
    expect(note).toContain("sin intervalo");
  });

  it("shouldShowNothingMisleadingWhenNothingIsAnalysedYet", async () => {
    const { rt } = await openProfile({ ...PROFILE, analysed: 0, pending: 1648, all: sec({ games: 0, moves: 0, serious: 0, ratePer100: null, acpl: null }), blocks: [], review: { worst: [], best: [] } });
    expect(html(rt, "#profileKpis")).toContain("Todavía no hay partidas analizadas");
    expect(text(rt, "#profileNote")).toContain("1648 partidas sin analizar");
  });

  it("shouldIdentifyReviewGamesByOpponentDateAndWhatWentWrongNotByHash", async () => {
    const { rt, requests, call } = await openProfile();
    const w = html(rt, "#profileWorst");
    expect(w).toContain("<b>Stockfish Bot</b>");
    expect(w).toContain("pill-loss");
    expect(w).toContain("Se torció en tu jugada 6. 6 errores graves en 30 jugadas · pérdida media de evaluación: 4,0 peones por jugada");
    expect(w).toContain('data-g="bot|111|aaaaaaaa"');
    await call("openGame('bot|111|aaaaaaaa')");
    expect(requests.some((u) => u.includes("/api/me/matches/") && u.includes("aaaaaaaa"))).toBe(true);
  });

  it("shouldLeaveNothingOfThePreviousProfileWhenTheNextOneIsEmpty", async () => {
    const withCut = { ...PROFILE, since: { matchId: "cut", playedAt: 5 }, before: sec(), after: sec() };
    const { rt, call } = await openProfile(withCut, "cut");
    expect(html(rt, "#profileWorst")).not.toBe("");
    const empty = { ...PROFILE, analysed: 0, pending: 5, all: sec({ games: 0, moves: 0, serious: 0, ratePer100: null, acpl: null }), blocks: [], review: { worst: [], best: [] }, before: null, after: null };
    await call(`window.__p = ${JSON.stringify(empty)}; paintProfile(window.__p)`);
    for (const id of ["#profileVerdict", "#profilePhases", "#profileColors", "#profileTrend", "#profileCut", "#profileDecisive", "#profileConversion", "#profileWorst", "#profileBest"]) expect(html(rt, id)).toBe("");
    expect(html(rt, "#profileKpis")).toContain("Todavía no hay partidas analizadas");
  });

  it("shouldShowAnErrorLineWhenTheProfileCannotBeLoaded", async () => {
    const rt = createDashboardRuntime("/chess", undefined, async (url: string) =>
      url.startsWith("/api/stats/profile") ? { ok: false, status: 500, json: async () => ({}) } : { ok: true, status: 200, json: async () => emptyAccountPayload(url) });
    await settle();
    vm.runInContext("showTab('profile')", rt.sandbox); await settle();
    expect(html(rt, "#profileKpis")).toContain("No se pudo cargar el perfil");
  });
});
