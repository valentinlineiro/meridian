import { describe, it, expect } from "vitest";
import { createDashboardRuntime, fetchOnly } from "./helpers/dom.ts";

const reply = (body: unknown, ok = true, status = 200) => ({ ok, status, json: async () => body });
const blk = (o: Record<string, any> = {}) => ({
  eff: { median: 1.13, nEff: 28 }, beat: { rate: 0.65, k: 18, nBeat: 28 }, time: { median: 51.5, p25: 42.5, p75: 64, nTime: 30 }, ...o,
});
const win = (o: Record<string, any> = {}) => ({
  ...blk(), prev: blk({ eff: { median: 1.3, nEff: 27 } }),
  delta: { effRel: { value: -0.13, nCur: 28, nPrev: 27 }, beatPp: { value: -6, nCur: 28, nPrev: 27 }, medianSec: { value: 0.5, nCur: 30, nPrev: 29 } }, ...o,
});
const traj = [{ start: "2026-10-30", n: 1, eff: 1.2, beat: 1 }, { start: "2026-10-31", n: 0, eff: null, beat: null }, { start: "2026-11-01", n: 2, eff: 1.1, beat: 0.5 }];
const game = (o: Record<string, any> = {}) => ({
  n: 57, nWithAvg: 57, beatAvgRate: 0.65,
  efficiency: { last28: 1.13, prev28: 1.3, change: -0.13, nLast28: 20, nPrev28: 20 },
  best: { seconds: 32, date: "2026-09-30" }, beatStreak: { current: 1, max: 8 }, regression: false,
  series: [{ date: "2026-10-01", eff: 1.2, roll: 1.2 }, { date: "2026-10-02", eff: 1.1, roll: 1.15 }],
  firstDate: "2026-05-17",
  windows: { "7": win(), "28": win(), "90": win({ prev: null, delta: null }), all: win({ prev: null, delta: null }) },
  trajectory: { "7": traj, "28": traj, "90": traj, all: traj }, ...o,
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
    expect(cards[0]!.children.slice(1, 6).map((c) => c.textContent)).toEqual([
      "Eficiencia (28 días): ×1,13 · n=28 (-13 % vs periodo previo (n=28/27))", "Gana a la media: 65 % · n=28",
      "Tiempo típico: 0:52 (P25–P75 0:43–1:04) · n=30", "Mejor marca: 0:32 (2026-09-30)", "Racha ganando a la media: 1 día (máx 8)",
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

const headOf = (rt: any, i: number) => rt.getEl("#gamesHead").children[0].children[i];
const cellsOf = (rt: any) => rt.getEl("#gamesRows").children.map((tr: any) => tr.children.map((td: any) => td.textContent));
const names = (rt: any) => cellsOf(rt).map((r: string[]) => r[0]);

describe("games comparison table", () => {
  const two = { zip: game({ n: 170, windows: { ...game().windows, "28": win({ eff: { median: 2.08, nEff: 28 }, beat: { rate: 0.84, k: 24, nBeat: 28 } }) } }), tango: game() };

  it("shouldShowOneRowPerGameWithTheSampleSizeNextToEveryPercentageAndMedian", async () => {
    const { rt } = setup(ok(two));
    await rt.sandbox.fetchGames();
    const rows = cellsOf(rt);
    expect(rows).toHaveLength(2);
    const tango = rows.find((r: string[]) => r[0] === "Tango")!;
    expect(tango).toEqual(["Tango", "×1,13 · n=28", "65 % · n=28", "-13 % · n=28/27", "0:52 (0:43–1:04) · n=30", "1 día", "30"]);
    for (const r of rows) for (const i of [1, 2, 4]) expect(r[i]).toMatch(/n=\d+/);
  });

  it("shouldSortByTheClickedColumnAndFlipTheDirectionOnASecondClick", async () => {
    const { rt } = setup(ok(two));
    await rt.sandbox.fetchGames();
    expect(names(rt)).toEqual(["Zip", "Tango"]); // default: efficiency, descending
    rt.sandbox.sortGames("name");
    expect(names(rt)).toEqual(["Tango", "Zip"]);
    expect(headOf(rt, 0).getAttribute("aria-sort")).toBe("ascending");
    rt.sandbox.sortGames("name");
    expect(names(rt)).toEqual(["Zip", "Tango"]);
    expect(headOf(rt, 0).getAttribute("aria-sort")).toBe("descending");
    expect(headOf(rt, 1).getAttribute("aria-sort")).toBe("none");
  });

  it("shouldSortRowsWithoutAValueLastWhicheverTheDirection", async () => {
    const empty = game({ windows: { ...game().windows, "28": win({ eff: { median: null, nEff: 0 } }) } });
    const { rt } = setup(ok({ a_null: empty, zip: game() }));
    await rt.sandbox.fetchGames();
    expect(names(rt).at(-1)).toBe("a_null");
    rt.sandbox.sortGames("eff"); // flips to ascending
    expect(names(rt).at(-1)).toBe("a_null");
  });

  it("shouldRecomputeTheTableWhenThePeriodChangesWithoutAskingTheServerAgain", async () => {
    const { rt, calls } = setup(ok({ zip: game({ windows: { ...game().windows, "7": win({ eff: { median: 3, nEff: 5 } }) } }) }));
    await rt.sandbox.fetchGames();
    const before = calls.length;
    rt.sandbox.setGamesRange("7");
    expect(cellsOf(rt)[0]![1]).toBe("×3 · n=5");
    expect(calls.length).toBe(before);
    expect(rt.getEl("#gr-7").getAttribute("aria-pressed")).toBe("true");
    expect(rt.getEl("#gr-28").getAttribute("aria-pressed")).toBe("false");
  });

  it("shouldShowADashWithTheReasonWhenThePreviousPeriodIsNotComparable", async () => {
    const { rt } = setup(ok({ zip: game() }));
    await rt.sandbox.fetchGames();
    rt.sandbox.setGamesRange("90");
    const td = rt.getEl("#gamesRows").children[0]!.children[3]!;
    expect(td.textContent).toBe("—");
    expect(td.getAttribute("title")).toMatch(/anterior incompleto/);
    rt.sandbox.setGamesRange("all");
    expect(rt.getEl("#gamesRows").children[0]!.children[3]!.getAttribute("title")).toMatch(/todo el histórico/);
  });

  it("shouldNeverShowAPercentageWithoutItsDenominator", async () => {
    const none = game({ windows: { ...game().windows, "28": win({ eff: { median: null, nEff: 0 }, beat: { rate: null, k: 0, nBeat: 0 }, time: { median: null, p25: null, p75: null, nTime: 0 }, prev: null, delta: null }) } });
    const { rt } = setup(ok({ zip: none }));
    await rt.sandbox.fetchGames();
    expect(cellsOf(rt)[0]).toEqual(["Zip", "—", "—", "—", "—", "1 día", "0"]);
  });
});

describe("games trajectory chart", () => {
  it("shouldDrawBothSeriesWithTheSampleSizeBarsOnTheSameAxis", async () => {
    const { rt } = setup(ok({ zip: game() }));
    await rt.sandbox.fetchGames();
    const svg = rt.getEl("#gamesChart").innerHTML;
    expect(svg).toContain('fill="#7aa7e6"'); // efficiency
    expect(svg).toContain('fill="#2ea043"'); // beats the average
    expect((svg.match(/<rect /g) ?? []).length).toBe(2); // bars only where n > 0
    expect(svg).toContain("2026-11-01 · n=2 · ×1,1");
    expect(svg).toContain("100 %"); // beat strip axis
  });

  it("shouldLeaveAVisibleGapInsteadOfDrawingAPointForABucketWithoutObservations", async () => {
    const { rt } = setup(ok({ zip: game() }));
    await rt.sandbox.fetchGames();
    const svg = rt.getEl("#gamesChart").innerHTML;
    expect((svg.match(/<circle /g) ?? []).length).toBe(4); // 2 buckets with data × 2 series
    expect(svg).not.toContain("2026-10-31 ·"); // the empty bucket has neither point nor bar
    expect(svg).not.toContain("<polyline"); // the gap splits the line: single isolated points stay points
  });

  it("shouldDrawTheRawValuesWithoutSmoothing", async () => {
    const t = [{ start: "a", n: 1, eff: 1.5, beat: 1 }, { start: "b", n: 1, eff: 3, beat: 0 }, { start: "c", n: 1, eff: 2, beat: 1 }];
    const { rt } = setup(ok({ zip: game({ trajectory: { "7": t, "28": t, "90": t, all: t } }) }));
    await rt.sandbox.fetchGames();
    const svg = rt.getEl("#gamesChart").innerHTML;
    for (const v of ["×1,5", "×3", "×2"]) expect(svg).toContain(v);
    expect(svg).toContain("<polyline");
  });

  it("shouldChartOneGameAtATimeAndOfferNoAggregate", async () => {
    const { rt } = setup(ok({ zip: game({ n: 170 }), tango: game({ trajectory: { "7": [], "28": [{ start: "2026-11-01", n: 1, eff: 1.1, beat: 1 }], "90": [], all: [] } }) }));
    await rt.sandbox.fetchGames();
    expect(rt.getEl("#gamesTrajGame").children.map((o: any) => o.textContent)).toEqual(["Zip", "Tango"]);
    expect(rt.getEl("#gamesTrajGame").value).toBe("zip"); // the game with the most observations
    rt.sandbox.setGamesTrajGame("tango");
    expect(rt.getEl("#gamesChart").innerHTML).toContain("2026-11-01 · n=1");
  });

  it("shouldExplainWhatTheChartShowsAndNameTheBucketSize", async () => {
    const { rt } = setup(ok({ zip: game() }));
    await rt.sandbox.fetchGames();
    expect(rt.getEl("#gamesChartNote").textContent).toMatch(/Un punto por día, valor sin suavizar/);
    rt.sandbox.setGamesRange("90");
    expect(rt.getEl("#gamesChartNote").textContent).toMatch(/Un punto por semana \(lunes\), valor sin suavizar/);
  });

  it("shouldSayThereAreNoObservationsWhenNoBucketHasData", async () => {
    const t = [{ start: "2026-11-01", n: 0, eff: null, beat: null }];
    const { rt } = setup(ok({ zip: game({ trajectory: { "7": t, "28": t, "90": t, all: t } }) }));
    await rt.sandbox.fetchGames();
    expect(rt.getEl("#gamesChart").innerHTML).toContain("Sin observaciones con media");
  });
});

describe("games page markup", () => {
  it("shouldExposeAccessibleControlsForPeriodTableAndChart", async () => {
    const { DASHBOARD_HTML } = await import("../src/frontend.ts");
    expect(DASHBOARD_HTML).toContain('role="group" aria-label="Periodo de análisis"');
    for (const k of ["7", "28", "90", "all"]) expect(DASHBOARD_HTML).toContain(`id="gr-${k}" aria-pressed=`);
    expect(DASHBOARD_HTML).toMatch(/<caption class="sr-only">Comparativa de juegos/);
    expect(DASHBOARD_HTML).toContain('<label class="muted" for="gamesTrajGame">');
    expect(DASHBOARD_HTML).not.toMatch(/Todos \(agregado\)/);
  });
});
