import { describe, it, expect } from "vitest";
import { createDashboardRuntime, fetchOnly } from "./helpers/dom.ts";

const reply = (body: unknown, ok = true, status = 200) => ({ ok, status, json: async () => body });
const game = (o: Record<string, unknown> = {}) => ({
  n: 57, nWithAvg: 57, beatAvgRate: 0.65,
  efficiency: { last28: 1.13, prev28: 1.3, change: -0.13, nLast28: 20, nPrev28: 20 },
  best: { seconds: 32, date: "2026-09-30" }, beatStreak: { current: 1, max: 8 }, regression: false,
  series: [{ date: "2026-10-01", eff: 1.2, roll: 1.2 }, { date: "2026-10-02", eff: 1.1, roll: 1.15 }], ...o,
});
const summary = (games: Record<string, unknown>) => ({ ok: true, summary: { days: 170, from: "2026-05-17", to: "2026-11-03", playStreak: { current: 48, max: 122 }, games } });

function setup(respond: (url: string, init?: any) => ReturnType<typeof reply>, path = "/games") {
  const calls: { url: string; init?: any }[] = [];
  const rt = createDashboardRuntime(path, undefined, fetchOnly("/api/me/linkedin-games", async (url: string, init?: any) => { calls.push({ url, init }); return respond(url, init); }));
  return { rt, calls, puts: () => calls.filter((c) => c.init?.method === "PUT") };
}
const ok = (games: Record<string, unknown>, day: unknown = { games: {} }) => (url: string) =>
  url.includes("/summary") ? reply(summary(games)) : reply({ ok: true, day });
const flush = () => new Promise((r) => setTimeout(r, 0));

describe("games tab", () => {
  it("shouldLoadTheSummaryOnBootWhenThePageIsOpenedDirectlyOnGames", async () => {
    const { rt, calls } = setup(ok({ zip: game() }));
    await flush(); await flush();
    expect(calls.some((c) => c.url.includes("/summary"))).toBe(true);
    expect(rt.getEl("#gamesHeroStreak").textContent).toBe("48 días seguidos");
  });

  it("shouldFetchSummaryAndTodayWhenTheGamesTabOpens", async () => {
    const { rt, calls } = setup(ok({ zip: game() }));
    await rt.sandbox.fetchGames();
    expect(calls.some((c) => /\/api\/me\/linkedin-games\/summary\?today=\d{4}-\d{2}-\d{2}$/.test(c.url))).toBe(true);
    expect(calls.some((c) => /\/api\/me\/linkedin-games\?date=\d{4}-\d{2}-\d{2}$/.test(c.url))).toBe(true);
  });

  it("shouldRenderHeroAndACardPerGameWithRegressionsFirst", async () => {
    const { rt } = setup(ok({ zip: game({ beatAvgRate: 0.84 }), tango: game({ regression: true }) }));
    await rt.sandbox.fetchGames();
    const cards = rt.getEl("#gamesList").children;
    expect(cards.map((c) => c.children[0]!.textContent)).toEqual(["Tango", "Zip"]);
    expect(cards[0]!.className).toContain("reg");
    expect(cards[0]!.children.slice(1, 5).map((c) => c.textContent)).toEqual([
      "Eficiencia 28 d: ×1,13 (-13 % vs 28 d previos)", "Gana a la media: 65 % (57 con media)", "Mejor marca: 0:32 (2026-09-30)", "Racha ganando a la media: 1 día (máx 8)",
    ]);
    expect(rt.getEl("#gamesDistWin").style.width).toMatch(/^\d/); // 65 % and 84 % of 57 results each
    expect(rt.getEl("#gamesHeroStreak").textContent).toBe("48 días seguidos");
    expect(rt.getEl("#gamesHeroMeta").textContent).toBe("Racha máxima 122 días");
    expect(rt.getEl("#gamesHeroDays").textContent).toBe("170 días registrados · 2026-05-17 → 2026-11-03");
  });

  it("shouldMarkTodaysRecordedGamesInTheHeroChips", async () => {
    const { rt } = setup(ok({ zip: game() }, { games: { zip: { score: "0:08" } } }));
    await rt.sandbox.fetchGames();
    const chips = rt.getEl("#gamesToday").children;
    expect(chips).toHaveLength(6);
    expect(chips.find((c) => c.textContent.includes("Zip"))!.className).toContain("pill-win");
    expect(chips.find((c) => c.textContent.includes("Tango"))!.className).not.toContain("pill-win");
  });

  it("shouldSayThereIsNoDataYetWhenTheSummaryIsEmpty", async () => {
    const { rt } = setup(ok({}));
    await rt.sandbox.fetchGames();
    expect(rt.getEl("#gamesHeroMeta").textContent).toBe("Aún no hay datos.");
  });

  it("shouldSayTheSummaryCouldNotBeLoadedWhenTheRequestFails", async () => {
    const { rt } = setup(() => reply({ ok: false }, false, 500));
    await rt.sandbox.fetchGames();
    expect(rt.getEl("#gamesNote").textContent).toBe("No se pudo cargar el resumen.");
  });
});

describe("games entry modal", () => {
  it("shouldOpenThePrefilledModalWhenATodayChipIsTapped", async () => {
    const { rt } = setup(ok({ zip: game() }));
    await rt.sandbox.fetchGames();
    (rt.getEl("#gamesToday").children.find((c) => c.textContent.includes("Tango")) as any).onclick();
    await flush();
    expect(rt.getEl("#lgModal").style.display).toBe("flex");
    expect(rt.getEl("#lgGame").value).toBe("tango");
    expect(rt.getEl("#lgDate").value).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("shouldPutTheResultAndRefreshTheSummaryWhenSaved", async () => {
    const { rt, calls, puts } = setup((url, init) => init?.method === "PUT" ? reply({ ok: true, day: { games: { zip: { score: "0:08" } } } }) : ok({ zip: game() })(url));
    rt.getEl("#lgGame").value = "zip"; rt.getEl("#lgDate").value = "2026-10-12"; rt.getEl("#lgScore").value = " 0:08 "; rt.getEl("#lgAvg").value = ""; rt.getEl("#lgNumber").value = "449";
    await rt.sandbox.saveGamesResult();
    expect(puts()).toHaveLength(1);
    expect(puts()[0]!.url).toBe("/api/me/linkedin-games");
    expect(JSON.parse(String(puts()[0]!.init.body))).toMatchObject({ date: "2026-10-12", game: "zip", score: "0:08", avg: null, number: 449 });
    expect(rt.getEl("#lgStatus").textContent).toBe("Guardado.");
    expect(rt.getEl("#lgScore").value).toBe("");
    await flush();
    expect(calls.filter((c) => c.url.includes("/summary")).length).toBeGreaterThan(0);
  });

  it("shouldShowTheServerErrorWhenTheSaveIsRefused", async () => {
    const { rt } = setup((url, init) => init?.method === "PUT" ? reply({ ok: false, error: "fast is not a time as M:SS" }, false, 400) : ok({})(url));
    rt.getEl("#lgScore").value = "fast";
    await rt.sandbox.saveGamesResult();
    expect(rt.getEl("#lgStatus").textContent).toMatch(/No se pudo guardar: .*not a time/);
  });

  it("shouldCloseTheModalWhenCloseIsCalled", async () => {
    const { rt } = setup(ok({}));
    rt.sandbox.openGamesEntry();
    rt.sandbox.closeGamesEntry();
    expect(rt.getEl("#lgModal").style.display).toBe("none");
  });

  it("shouldOfferOnlyTheSixGames", async () => {
    const { DASHBOARD_HTML } = await import("../src/frontend.ts");
    const select = DASHBOARD_HTML.match(/<select id="lgGame">([\s\S]*?)<\/select>/)![1]!;
    expect(select.match(/<option value="/g)).toHaveLength(6);
    expect(select).not.toMatch(/pinpoint|crossclimb/i);
  });

  describe("focus trap", () => {
    const trap = (active: number | null, shiftKey: boolean) => {
      const { rt } = setup(ok({}));
      const focused: number[] = [];
      const els = [0, 1, 2].map((n) => ({ offsetParent: {}, focus: () => focused.push(n) }));
      rt.sandbox.document.querySelectorAll = () => els;
      rt.sandbox.document.activeElement = active === null ? {} : els[active];
      let prevented = false;
      rt.sandbox.trapGamesFocus({ shiftKey, preventDefault: () => { prevented = true; } });
      return { focused, prevented };
    };

    it("shouldWrapToTheFirstControlWhenTabbingFromTheLast", () => {
      expect(trap(2, false)).toEqual({ focused: [0], prevented: true });
    });

    it("shouldWrapToTheLastControlWhenShiftTabbingFromTheFirst", () => {
      expect(trap(0, true)).toEqual({ focused: [2], prevented: true });
    });

    it("shouldMoveToTheNextControlWhenTabbingInTheMiddle", () => {
      expect(trap(0, false).focused).toEqual([1]);
    });

    it("shouldEnterTheDialogWhenFocusIsOutsideIt", () => {
      expect(trap(null, false).focused).toEqual([0]);
      expect(trap(null, true).focused).toEqual([2]);
    });
  });
});
