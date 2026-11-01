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
