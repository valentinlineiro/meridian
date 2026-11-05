import { describe, it, expect } from "vitest";
import { DASHBOARD_HTML } from "../src/frontend.ts";
import { createDashboardRuntime, fetchOnly } from "./helpers/dom.ts";

const reply = (body: unknown, ok = true, status = 200) => ({ ok, status, json: async () => body });
const blk = (o: Record<string, any> = {}) => ({
  eff: { median: 1.13, nEff: 28 }, beat: { rate: 0.65, k: 18, nBeat: 28 }, time: { median: 51.5, p25: 42.5, p75: 64, nTime: 30 }, ...o,
});
const win = (o: Record<string, any> = {}) => ({
  ...blk(), prev: blk({ eff: { median: 1.3, nEff: 27 } }),
  delta: { effRel: { value: -0.13, nCur: 28, nPrev: 27 }, beatPp: { value: -6, nCur: 28, nPrev: 27 }, medianSec: { value: 0.5, nCur: 30, nPrev: 29 } }, ...o,
});
const BANDS = { "28": [-0.26, 0.34], "28v56": [-0.23, 0.3], rho112: [-0.19, 0.18] };
const interp = (o: Record<string, any> = {}) => ({ label: "estable", reason: null, candidate: "estable", previousCandidate: "estable", pending: null, bands: BANDS, calibratedThrough: "2026-11-03", ...o });
// the 28-day window carries an arrow and the calibrated band on its effRel; the others stay as measured
const win28 = (arrow: string | null = "flat", value = -0.13) => {
  const w = win();
  return { ...w, delta: { ...w.delta, effRel: { ...w.delta.effRel, value, arrow, band: BANDS["28"] } } };
};
const traj = [{ start: "2026-10-30", n: 1, eff: 1.2, beat: 1 }, { start: "2026-10-31", n: 0, eff: null, beat: null }, { start: "2026-11-01", n: 2, eff: 1.1, beat: 0.5 }];
const game = (o: Record<string, any> = {}) => ({
  n: 57, nWithAvg: 57, beatAvgRate: 0.65,
  efficiency: { last28: 1.13, prev28: 1.3, change: -0.13, nLast28: 20, nPrev28: 20 },
  best: { seconds: 32, date: "2026-09-30" }, beatStreak: { current: 1, max: 8 }, regression: false,
  trend112: { rho: 0.28, slopePctPer28d: 3.3, n: 110, days: 112 }, recent28vBase56: { delta: -0.31, nCur: 27, nBase: 54 }, interpretation: interp(),
  series: [{ date: "2026-10-01", eff: 1.2, roll: 1.2 }, { date: "2026-10-02", eff: 1.1, roll: 1.15 }],
  firstDate: "2026-05-17",
  windows: { "7": win(), "28": win28(), "90": win({ prev: null, delta: null }), all: win({ prev: null, delta: null }) },
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

describe("games tab: a stale manual log is not a zero streak", () => {
  const stale = (games: Record<string, unknown>) => (url: string) =>
    url.includes("/summary") ? reply({ ok: true, summary: { ...summary(games).summary, playStreak: { current: 0, max: 122 } } }) : reply({ ok: true, day: { games: {} } });

  it("shouldSayNoRecordSinceInsteadOfZeroDaysWhenTheLogIsStale", async () => {
    const { rt } = setup(stale({ zip: game({ beatStreak: { current: 0, max: 8 } }) }));
    await rt.sandbox.fetchGames();
    const lines = rt.getEl("#gamesList").children[0]!.children.slice(1).map((c) => c.textContent);
    expect(lines).toContain("Racha ganando a la media: sin registro desde 2026-11-03 (máx 8)");
    const cells = (rt.getEl("#gamesRows").children[0] as any).children.map((c: any) => c.textContent);
    expect(cells).toContain("sin registro desde 2026-11-03");
    expect(cells).not.toContain("0 días");
  });

  it("shouldKeepAnObservedZeroWhenTheLogIsCurrent", async () => {
    const { rt } = setup(ok({ zip: game({ beatStreak: { current: 0, max: 8 } }) }));
    await rt.sandbox.fetchGames();
    expect(rt.getEl("#gamesList").children[0]!.children.slice(1).map((c) => c.textContent)).toContain("Racha ganando a la media: 0 días (máx 8)");
  });
});

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

  it("shouldRenderTheHeroAndTheMeasuredLinesOfEachCard", async () => {
    const { rt } = setup(ok({ zip: game({ beatAvgRate: 0.84 }), tango: game() }));
    await rt.sandbox.fetchGames();
    const cards = rt.getEl("#gamesList").children;
    expect(cards.map((c) => c.children[0]!.textContent).sort()).toEqual(["Tango", "Zip"]);
    const lines = cards[0]!.children.slice(1).map((c) => c.textContent);
    for (const l of ["Eficiencia (28 días): ×1,13 · n=28 (-13 % vs periodo previo (n=28/27))", "Gana a la media: 65 % · n=28", "Tiempo típico: 0:52 (P25–P75 0:43–1:04) · n=30", "Mejor marca: 0:32 (2026-09-30)", "Racha ganando a la media: 1 día (máx 8)"]) expect(lines).toContain(l);
    expect(DASHBOARD_HTML).not.toContain("gamesHeroDist"); // no pooled "beats the average" across games: the per-game rates are the answer
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
    expect(tango).toEqual(["Tango", "×1,13 · n=28", "65 % · n=28", "→ -13 % · n=28/27", "0:52 (0:43–1:04) · n=30", "1 día", "30"]);
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

describe("games trajectory data table", () => {
  const dataRows = (rt: any) => rt.getEl("#gamesDataRows").children.map((tr: any) => tr.children.map((c: any) => c.textContent));

  it("shouldListOneRowPerBucketWithPeriodEfficiencyBeatRateAndN", async () => {
    const { rt } = setup(ok({ zip: game() }));
    await rt.sandbox.fetchGames();
    expect(dataRows(rt)).toEqual([
      ["2026-10-30", "×1,2", "100 %", "1"],
      ["2026-10-31", "—", "—", "0"], // the gap stays a row, with n = 0
      ["2026-11-01", "×1,1", "50 %", "2"],
    ]);
  });

  it("shouldCarryTheSameValuesAsTheDrawnSeries", async () => {
    const t = [{ start: "2026-10-20", n: 3, eff: 1.234, beat: 2 / 3 }, { start: "2026-10-21", n: 0, eff: null, beat: null }, { start: "2026-10-22", n: 5, eff: 2.5, beat: 0.8 }];
    const { rt } = setup(ok({ zip: game({ trajectory: { "7": t, "28": t, "90": t, all: t } }) }));
    await rt.sandbox.fetchGames();
    const svg = rt.getEl("#gamesChart").innerHTML, rows = dataRows(rt);
    t.forEach((b, i) => {
      const [, eff, beat, n] = rows[i]!;
      expect(n).toBe(String(b.n));
      if (b.n === 0) {
        expect([eff, beat]).toEqual(["—", "—"]);
        expect(svg).not.toContain(b.start + " ·"); // no point and no bar for a bucket the table lists as empty
      } else {
        expect(svg).toContain(`${b.start} · n=${b.n} · ${eff}`); // tooltip of the efficiency point
        expect(svg).toContain(`${b.start} · n=${b.n} · ${beat}`); // tooltip of the beat-rate point
      }
    });
    expect(rows.map((r: string[]) => r[0])).toEqual(t.map((b) => b.start));
  });

  it("shouldLabelWeeklyBucketsAsWeeksAndFollowThePeriodAndTheGame", async () => {
    const wk = [{ start: "2026-10-26", n: 4, eff: 2, beat: 0.75 }];
    const { rt } = setup(ok({ zip: game({ n: 170 }), tango: game({ trajectory: { "7": traj, "28": traj, "90": wk, all: wk } }) }));
    await rt.sandbox.fetchGames();
    rt.sandbox.setGamesTrajGame("tango");
    rt.sandbox.setGamesRange("90");
    expect(dataRows(rt)).toEqual([["Semana del 2026-10-26", "×2", "75 %", "4"]]);
    expect(rt.getEl("#gamesDataCaption").textContent).toBe("Datos de la trayectoria de Tango, 90 días: un valor por semana.");
    rt.sandbox.setGamesRange("7");
    expect(rt.getEl("#gamesDataCaption").textContent).toMatch(/un valor por día\.$/);
    expect(dataRows(rt)).toHaveLength(3);
  });

  it("shouldClearTheTableWhenThereIsNoData", async () => {
    const { rt } = setup(ok({ zip: game() }));
    await rt.sandbox.fetchGames();
    expect(dataRows(rt)).toHaveLength(3);
    rt.sandbox.paintGames({ days: 0, from: null, to: null, playStreak: { current: 0, max: 0 }, games: {} }, null);
    expect(dataRows(rt)).toHaveLength(0);
  });

  it("shouldOfferTheTableInsideADetailsWithAccessibleStructureAndPointTheChartToIt", async () => {
    const { DASHBOARD_HTML } = await import("../src/frontend.ts");
    const block = DASHBOARD_HTML.match(/<details class="gdata"[\s\S]*?<\/details>/)![0];
    expect(block).toContain("<summary>Ver los datos del gráfico (tabla)</summary>");
    expect(block).toContain('<caption id="gamesDataCaption" class="sr-only">');
    expect(block).toContain('aria-describedby="gamesDataCaption"');
    expect((block.match(/<th scope="col">/g) ?? []).length).toBe(4);
    expect(DASHBOARD_HTML).toContain("Los mismos datos están en la tabla siguiente.");
  });
});

const cardsOf = (rt: any) => rt.getEl("#gamesList").children;
const nameOf = (card: any) => card.children[0].textContent;
const badgeOf = (card: any) => card.children[0].children[0];
const linesOf = (card: any) => card.children.slice(1).map((c: any) => c.textContent);

describe("games interpretation", () => {
  const all = () => ({
    zip: game({ interpretation: interp() }),
    tango: game({ interpretation: interp({ label: "deterioro", reason: "reciente", candidate: "deterioro", previousCandidate: "deterioro" }) }),
    wend: game({ interpretation: interp({ label: "mejora_sostenida", candidate: "mejora_sostenida", previousCandidate: "mejora_sostenida" }) }),
    patches: game({ interpretation: interp({ label: "datos_insuficientes", reason: "cobertura_insuficiente", candidate: "datos_insuficientes", previousCandidate: "datos_insuficientes", bands: null, calibratedThrough: null }) }),
  });

  it("shouldSortTheCardsByLabelPriorityAndStyleOnlyTheDeterioration", async () => {
    const { rt } = setup(ok(all()));
    await rt.sandbox.fetchGames();
    const cards = cardsOf(rt);
    expect(cards.map(nameOf)).toEqual(["Tango", "Wend", "Zip", "Patches"]); // deterioro, mejora sostenida, estable, datos insuficientes
    expect(cards.map((c: any) => c.className.includes(" det"))).toEqual([true, false, false, false]);
  });

  it("shouldShowThePublishedLabelAsABadgeOnEveryCard", async () => {
    const { rt } = setup(ok(all()));
    await rt.sandbox.fetchGames();
    const byName = Object.fromEntries(cardsOf(rt).map((c: any) => [nameOf(c), badgeOf(c)]));
    expect(byName.Tango.textContent).toBe("Deterioro");
    expect(byName.Wend.textContent).toBe("Mejora sostenida");
    expect(byName.Zip.textContent).toBe("Estable (sin cambio detectable)");
    expect(byName.Patches.textContent).toBe("Datos insuficientes");
    expect(byName.Tango.className).toContain("pill-warn");
    expect(byName.Wend.className).toContain("pill-win");
  });

  it("shouldExplainEachLabelWithTheValuesThatSupportIt", async () => {
    const { rt } = setup(ok(all()));
    await rt.sandbox.fetchGames();
    const byName = Object.fromEntries(cardsOf(rt).map((c: any) => [nameOf(c), linesOf(c)]));
    expect(byName.Tango[0]).toBe("Los últimos 28 días están un -31 % frente a los 56 anteriores; el límite de ruido de este juego es -23 % (n=27/54). Se repite dos semanas seguidas.");
    expect(byName.Wend[0]).toBe("Tendencia al alza en los últimos 112 días: ρ de Spearman +0,28 (límite +0,18) y pendiente +3,3 % cada 28 días (n=110). Se repite dos semanas seguidas.");
    expect(byName.Zip[0]).toBe("Ninguna señal supera el ruido de este juego: a 28 días solo se detecta un cambio por debajo de -26 % o por encima de +34 %.");
    expect(byName.Patches[0]).toBe("Faltan observaciones con media: hacen falta al menos 68 de los últimos 112 días, 17 de los últimos 28 y 34 de los 56 anteriores.");
    expect(byName.Zip).toContain("Límites calibrados con datos hasta 2026-11-03.");
    expect(byName.Patches.some((l: string) => l.startsWith("Límites calibrados"))).toBe(false); // nothing to cite without a calibration
  });

  it("shouldExplainASustainedDeteriorationWithItsTrendAndAnUncalibratedGame", async () => {
    const down = game({ trend112: { rho: -0.3, slopePctPer28d: -4.1, n: 100, days: 112 }, interpretation: interp({ label: "deterioro", reason: "sostenido", candidate: "deterioro", previousCandidate: "deterioro" }) });
    const none = game({ interpretation: interp({ label: "datos_insuficientes", reason: "sin_calibracion", candidate: "datos_insuficientes", previousCandidate: "datos_insuficientes", bands: null, calibratedThrough: null }) });
    const { rt } = setup(ok({ zip: down, tango: none }));
    await rt.sandbox.fetchGames();
    const byName = Object.fromEntries(cardsOf(rt).map((c: any) => [nameOf(c), linesOf(c)]));
    expect(byName.Zip[0]).toBe("Tendencia a la baja en los últimos 112 días: ρ de Spearman -0,3 (límite -0,19) y pendiente -4,1 % cada 28 días (n=100). Se repite dos semanas seguidas.");
    expect(byName.Tango[0]).toBe("Este juego aún no tiene límites calibrados (57 de 112 días de historia observados; requiere el periodo completo sin validez parcial).");
  });

  it("shouldSayAnUnconfirmedCandidateIsPendingWhileThePublishedLabelStaysStable", async () => {
    const { rt } = setup(ok({ zip: game({ interpretation: interp({ candidate: "mejora_sostenida", pending: "mejora_sostenida" }) }) }));
    await rt.sandbox.fetchGames();
    const card = cardsOf(rt)[0];
    expect(badgeOf(card).textContent).toBe("Estable (sin cambio detectable)");
    expect(linesOf(card)).toContain("Señal sin confirmar: mejora sostenida. Se publicará si se repite la semana próxima.");
  });

  it("shouldIgnoreTheObsoleteRegressionFlag", async () => {
    const { rt } = setup(ok({ zip: game({ regression: true }) })); // label says estable: the flag must not drive anything
    await rt.sandbox.fetchGames();
    const card = cardsOf(rt)[0];
    expect(card.className).not.toContain(" det");
    expect(badgeOf(card).textContent).toBe("Estable (sin cambio detectable)");
    expect(linesOf(card).join(" ")).not.toMatch(/regresi/i);
  });
});

describe("games 28-day arrow", () => {
  const delta28 = (rt: any) => rt.getEl("#gamesRows").children[0].children[3];
  const withArrow = (arrow: string | null, value: number) => game({ windows: { ...game().windows, "28": win28(arrow, value) } });

  it.each([["up", 0.4, "↑ +40 % · n=28/27"], ["down", -0.4, "↓ -40 % · n=28/27"], ["flat", 0.1, "→ +10 % · n=28/27"]])("shouldShowTheArrowInTheDeltaCellWhenItIs %s", async (arrow, value, text) => {
    const { rt } = setup(ok({ zip: withArrow(arrow, value) }));
    await rt.sandbox.fetchGames();
    expect(delta28(rt).textContent).toBe(text);
  });

  it("shouldDescribeTheArrowForScreenReadersAndGiveTheBandInTheTitle", async () => {
    const { rt } = setup(ok({ zip: withArrow("down", -0.4) }));
    await rt.sandbox.fetchGames();
    expect(delta28(rt).children[0].textContent).toBe(" (baja, fuera del ruido)");
    expect(delta28(rt).children[0].className).toBe("sr-only");
    expect(delta28(rt).getAttribute("title")).toBe("Supera el ruido de este juego (fuera de -26 % a +34 %).");
  });

  it("shouldSayInsideTheNoiseWhenTheArrowIsFlat", async () => {
    const { rt } = setup(ok({ zip: withArrow("flat", 0.1) }));
    await rt.sandbox.fetchGames();
    expect(delta28(rt).getAttribute("title")).toBe("Dentro del ruido de este juego (-26 % a +34 %).");
    expect(delta28(rt).children[0].textContent).toBe(" (dentro del ruido)");
  });

  it("shouldShowTheNumberWithoutArrowWhenThereIsNoCalibrationOrCoverage", async () => {
    const { rt } = setup(ok({ zip: withArrow(null, 0.4) }));
    await rt.sandbox.fetchGames();
    expect(delta28(rt).textContent).toBe("+40 % · n=28/27");
    expect(delta28(rt).getAttribute("title")).toMatch(/Sin calibración/);
    expect(delta28(rt).children).toHaveLength(0);
  });

  it.each(["7", "90", "all"])("shouldNeverShowAnArrowInThe%sPeriod", async (range) => {
    const g = game({ windows: { "7": win(), "28": win28("up", 0.4), "90": win(), all: win() } });
    const { rt } = setup(ok({ zip: g }));
    await rt.sandbox.fetchGames();
    rt.sandbox.setGamesRange(range);
    const cell = delta28(rt);
    expect(cell.textContent).not.toMatch(/[↑↓→]/);
    expect(cell.children).toHaveLength(0);
  });
});

describe("games interpretation markup", () => {
  it("shouldExplainWhatStableMeansAndWhereArrowsExistAndNeverMentionRegression", async () => {
    const { DASHBOARD_HTML } = await import("../src/frontend.ts");
    expect(DASHBOARD_HTML).toContain("«Estable» significa «sin cambio detectable», no «sin cambio»");
    expect(DASHBOARD_HTML).toContain("Las flechas de la tabla solo existen en el periodo de 28 días");
    expect(DASHBOARD_HTML).not.toMatch(/regresión/i);
  });
});

