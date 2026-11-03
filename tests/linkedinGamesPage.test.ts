import { describe, it, expect } from "vitest";
import { createDashboardRuntime } from "./helpers/dom.ts";
import { LINKEDIN_GAMES_HTML } from "../src/linkedinGamesPage.ts";

const reply = (body: unknown, ok = true, status = 200) => ({ ok, status, json: async () => body });

function setup(respond: (url: string, init?: RequestInit) => ReturnType<typeof reply>) {
  const rt = createDashboardRuntime("/linkedin-games", LINKEDIN_GAMES_HTML);
  const calls: { url: string; init?: RequestInit }[] = [];
  rt.sandbox.fetch = async (url: string, init?: RequestInit) => { calls.push({ url, init }); return respond(url, init); };
  rt.sandbox.window.fetch = rt.sandbox.fetch;
  const puts = () => calls.filter((c) => c.init?.method === "PUT");
  return { rt, calls, puts, status: rt.getEl("#status") };
}

describe("linkedin games page", () => {
  it("shouldPutTheResultWithTheChosenDateGameAndTimesWhenSaved", async () => {
    const { rt, puts, status } = setup(() => reply({ ok: true, day: { games: { zip: { score: "0:08" } } } }));
    rt.getEl("#game").value = "zip";
    rt.getEl("#date").value = "2026-10-12";
    rt.getEl("#score").value = " 0:08 ";
    rt.getEl("#avg").value = "";
    rt.getEl("#number").value = "449";
    await rt.sandbox.saveResult();
    expect(puts()).toHaveLength(1);
    expect(puts()[0]!.url).toBe("/api/me/linkedin-games");
    expect(JSON.parse(String(puts()[0]!.init?.body))).toMatchObject({ date: "2026-10-12", game: "zip", score: "0:08", avg: null, number: 449 });
    expect(status.textContent).toBe("Guardado.");
  });

  it("shouldShowTheServerErrorWhenTheSaveIsRefused", async () => {
    const { rt, status } = setup(() => reply({ ok: false, error: "fast is not a time as M:SS" }, false, 400));
    rt.getEl("#score").value = "fast";
    await rt.sandbox.saveResult();
    expect(status.textContent).toMatch(/No se pudo guardar: .*not a time/);
  });

  it("shouldDefaultTheDateToTodayAndOfferOnlyTheSixGames", () => {
    const { rt } = setup(() => reply({ ok: true, day: { games: {} } }));
    expect(rt.getEl("#date").value).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(LINKEDIN_GAMES_HTML.match(/<option value="/g)).toHaveLength(6);
    expect(LINKEDIN_GAMES_HTML).not.toMatch(/pinpoint|crossclimb/i);
  });
});

describe("linkedin games page: a failed load is not an empty day", () => {
  it("shouldSayTheDayCouldNotBeLoadedWhenTheRequestFails", async () => {
    const { rt, status } = setup(() => reply({ ok: false, error: "internal error" }, false, 500));
    await rt.sandbox.loadDay();
    expect(status.textContent).toBe("No se pudo cargar el día.");
  });
});

const game = (o: Record<string, unknown> = {}) => ({
  n: 57, nWithAvg: 57, beatAvgRate: 0.65,
  efficiency: { last28: 1.13, prev28: 1.3, change: -0.13, nLast28: 20, nPrev28: 20 },
  best: { seconds: 32, date: "2026-09-30" }, beatStreak: { current: 1, max: 8 }, regression: false,
  series: [{ date: "2026-10-01", eff: 1.2, roll: 1.2 }, { date: "2026-10-02", eff: 1.1, roll: 1.15 }], ...o,
});
const summaryReply = (games: Record<string, unknown>) =>
  (url: string) => url.includes("/summary") ? reply({ ok: true, summary: { days: 170, from: "2026-05-17", to: "2026-11-03", playStreak: { current: 48, max: 122 }, games } }) : reply({ ok: true, day: { games: {} } });

describe("linkedin games page: summary block", () => {
  it("shouldRenderACardPerGameWithRegressionsFirstWhenTheSummaryLoads", async () => {
    const { rt, calls } = setup(summaryReply({ zip: game({ beatAvgRate: 0.84, regression: false }), tango: game({ regression: true }) }));
    await rt.sandbox.loadSummary();
    expect(calls.some((c) => /\/api\/me\/linkedin-games\/summary\?today=\d{4}-\d{2}-\d{2}$/.test(c.url))).toBe(true);
    const cards = rt.getEl("#sumGames").children;
    expect(cards.map((c) => c.children[0]!.textContent)).toEqual(["Tango", "Zip"]);
    expect(cards[0]!.className).toContain("reg");
    expect(cards[1]!.className).not.toContain("reg");
    const lines = cards[0]!.children.slice(1, 5).map((c) => c.textContent);
    expect(lines[0]).toBe("Eficiencia 28 d: ×1,13 (-13 % vs 28 d previos)");
    expect(lines[1]).toBe("Gana a la media: 65 % (57 con media)");
    expect(lines[2]).toBe("Mejor marca: 0:32 (2026-09-30)");
    expect(lines[3]).toBe("Racha ganando a la media: 1 día (máx 8)");
    expect(rt.getEl("#sumGlobal").textContent).toBe("170 días registrados · racha de días jugados: 48 días (máx 122)");
  });

  it("shouldSayThereIsNoDataYetWhenTheSummaryIsEmpty", async () => {
    const { rt } = setup(summaryReply({}));
    await rt.sandbox.loadSummary();
    expect(rt.getEl("#sumGlobal").textContent).toBe("Aún no hay datos.");
  });

  it("shouldSayTheSummaryCouldNotBeLoadedWithoutBreakingTheDayWhenTheRequestFails", async () => {
    const { rt, status } = setup((url) => url.includes("/summary") ? reply({ ok: false }, false, 500) : reply({ ok: true, day: { games: {} } }));
    await rt.sandbox.loadSummary();
    expect(rt.getEl("#sumStatus").textContent).toBe("No se pudo cargar el resumen.");
    await rt.sandbox.loadDay();
    expect(status.textContent).toBe("");
  });
});
