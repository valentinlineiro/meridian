import { describe, it, expect } from "vitest";
import vm from "node:vm";
import { DASHBOARD_HTML } from "../src/frontend.ts";
import { evaluateTrajectory, type TrajectoryInput } from "../src/domain/trajectory.ts";
import { createDashboardRuntime, emptyAccountPayload, fetchOnly } from "./helpers/dom.ts";

// Fase 4 - Integración global (docs/ux/MERIDIAN_UX_PHASE4_SCOPE.md). Presentation only.
const text = (rt: any, sel: string): string => String(rt.getEl(sel).textContent);
const run = (rt: any, expr: string) => vm.runInContext(expr, rt.sandbox);
const settle = async () => { for (let i = 0; i < 300; i++) await Promise.resolve(); };
const daysAgo = (n: number) => new Date(Date.now() - n * 864e5).toISOString();

const catalogue = [
  { courseId: "DUOLINGO_RU_EN", title: "Russian", xp: 159280, fromLanguage: "en", learningLanguage: "ru" },
  { courseId: "DUOLINGO_EN_ES", title: "English", xp: 74127, fromLanguage: "es", learningLanguage: "en" },
];

describe("1. El último curso de Duolingo solo se muestra si pertenece a Idiomas", () => {
  // Production fact (2026-11-04): Duolingo's last course was CHESS_CH, which is not in `courses`.
  it("shouldNotShowARawCourseIdOutsideTheCatalogueOnTheOverview", () => {
    const rt = createDashboardRuntime("/overview");
    rt.sandbox.renderOverview({ userState: { streak: 1 }, langs: { streak: 1, currentCourseId: "CHESS_CH", courses: catalogue }, stats: {}, matches: [], xp_summaries: [] });
    expect(text(rt, "#overviewLangSourceCourse")).toBe("");
  });

  it("shouldShowTheCourseTitleWhenItIsInTheCatalogueAndDiffersFromTheSelectedOne", () => {
    const rt = createDashboardRuntime("/overview");
    run(rt, `selectedCourseId='DUOLINGO_RU_EN'`);
    rt.sandbox.renderOverview({ userState: { streak: 1 }, langs: { streak: 1, currentCourseId: "DUOLINGO_EN_ES", courses: catalogue }, stats: {}, matches: [], xp_summaries: [] });
    expect(text(rt, "#overviewLangSourceCourse")).toBe("Último curso en Duolingo: English");
  });

  it("shouldNotShowARawCourseIdOutsideTheCatalogueInTheLanguagesSyncLine", () => {
    const rt = createDashboardRuntime("/languages");
    const langs = { totalXp: 233407, streak: 1117, currentCourseId: "CHESS_CH", updatedAt: new Date().toISOString(), courses: catalogue };
    rt.renderLanguagesView(langs, null, { summaries: [] }, null);
    expect(text(rt, "#langSyncMeta")).toContain("Sincronizado");
    expect(text(rt, "#langSyncMeta")).not.toContain("CHESS_CH");
    expect(text(rt, "#langSyncMeta")).not.toContain("Último curso");
  });

  it("shouldKeepTheMostXpCourseAsTheDefaultSelectionWithoutARouteOrASavedChoice", () => {
    const rt = createDashboardRuntime("/languages");
    expect(run(rt, `resolveSelectedCourseId(${JSON.stringify(catalogue)}, null)`)).toBe("DUOLINGO_RU_EN");
  });
});

describe("2. La racha de la portada es de Duolingo, con su antigüedad", () => {
  const overview = (rt: any, syncedAt: string) =>
    rt.sandbox.renderOverview({ userState: { streak: 1117 }, langs: { streak: 1117, updatedAt: syncedAt, courses: catalogue }, stats: {}, matches: [], xp_summaries: [] });

  it("shouldNameDuolingoAsTheSourceOfTheStreak", () => {
    const rt = createDashboardRuntime("/overview");
    overview(rt, new Date().toISOString());
    expect(text(rt, "#overviewStreak")).toBe("Duolingo · 🔥 1117 días de racha"); // es-ES does not group four digits
  });

  it("shouldSayHowOldTheFigureIsWhenTheLastSyncIsOlderThanTwoDays", () => {
    const rt = createDashboardRuntime("/overview");
    overview(rt, daysAgo(27));
    expect(text(rt, "#overviewStreak")).toBe("Duolingo · 🔥 1117 días de racha (sincronizado hace 27d)");
  });

  it("shouldNotTagTheDuolingoStreakAsTheAccountScope", () => {
    const hero = DASHBOARD_HTML.slice(DASHBOARD_HTML.indexOf('id="overviewHero"'), DASHBOARD_HTML.indexOf("Estado por dominio"));
    expect(hero).not.toContain("CUENTA");
  });
});

describe("3. Games: sin registro no es una racha rota", () => {
  const summary = (over: object = {}) => ({ days: 170, from: "2026-05-17", to: "2026-11-03", playStreak: { current: 0, max: 122 }, games: { zip: { n: 26, nWithAvg: 26, beatAvgRate: 0.85 } }, ...over });

  it("shouldShowTheLastRecordDateOnTheOverviewInsteadOfAZeroStreak", () => {
    const rt = createDashboardRuntime("/overview");
    rt.sandbox.renderOverview({ userState: { streak: 1 }, langs: null, gamesSummary: summary() });
    expect(text(rt, "#overviewGamesStreakLabel")).toBe("Último registro");
    expect(text(rt, "#overviewGamesStreak")).toBe("Sin registro desde 2026-11-03");
    expect(text(rt, "#overviewGamesMeta")).toBe("Racha máxima 122 días · registro manual");
  });

  it("shouldShowTheLastRecordDateOnTheGamesPageAndNeverZeroDaysInARow", () => {
    const rt = createDashboardRuntime("/overview");
    run(rt, `gamesData=null`);
    rt.sandbox.renderOverviewGamesCard(summary());
    expect(text(rt, "#overviewGamesStreak")).not.toContain("0 días");
    const view = run(rt, `gamesStreakView(${JSON.stringify(summary())})`);
    expect(view.value).toBe("Sin registro desde 2026-11-03");
    expect(view.label).toBe("Último registro");
  });

  it("shouldKeepTheActiveStreakWhenThereIsOne", () => {
    const rt = createDashboardRuntime("/overview");
    const view = run(rt, `gamesStreakView(${JSON.stringify(summary({ playStreak: { current: 12, max: 20 } }))})`);
    expect(view).toMatchObject({ label: "Racha actual", value: "12 días seguidos", short: "🔥 12 días", meta: "Racha máxima 20 días" });
  });
});

describe("4. Games entra en «Tu semana» sin tocar el backend", () => {
  const day = (n: number) => new Date(Date.UTC(2026, 10, 5 - n)).toISOString().slice(0, 10);
  const days7 = Array.from({ length: 7 }, (_, i) => ({ date: day(6 - i), dayLetter: "LMXJVSD"[i] }));

  it("shouldAddTheGamesWeekCardToTheHTML", () => {
    expect(DASHBOARD_HTML).toContain('id="overviewGamesWeekCard"');
    expect(DASHBOARD_HTML).toContain('id="overviewGamesWeek"');
  });

  it("shouldSumTheDailyResultsOfEveryGameFromTheSummaryItAlreadyHas", () => {
    const rt = createDashboardRuntime("/overview");
    const summary = { games: {
      zip: { trajectory: { "7": [{ start: day(1), n: 1 }, { start: day(2), n: 1 }] } },
      tango: { trajectory: { "7": [{ start: day(1), n: 1 }, { start: day(0), n: 0 }] } },
    } };
    run(rt, `renderOverviewGamesWeek(${JSON.stringify(summary)}, ${JSON.stringify(days7)})`);
    expect(text(rt, "#overviewGamesWeekSummary")).toBe("3 resultados con media en 7 días");
    expect(rt.getEl("#overviewGamesWeek").innerHTML).toContain(`${day(1)}: 2 resultados`);
  });

  it("shouldSayNoDisponibleWhenTheSummaryFailed", () => {
    const rt = createDashboardRuntime("/overview");
    run(rt, `renderOverviewGamesWeek(null, ${JSON.stringify(days7)})`);
    expect(text(rt, "#overviewGamesWeekSummary")).toBe("No disponible");
  });
});

describe("5. Color: dos preguntas, dos conclusiones", () => {
  // Production tallies as the dashboard shows them (2026-11-05): white 596 wins in 922 games, black 450 in 761 (draws included), 281 active days.
  const era = (ww: number, wd: number, bw: number, bd: number) => ({ whiteGames: wd, whiteDecided: wd, whiteWins: ww, blackGames: bd, blackDecided: bd, blackWins: bw });
  const prod: TrajectoryInput = {
    chess: { startedAt: "2025-09-10T00:00:00.000Z", endedAt: "2026-11-04T00:00:00.000Z", totalGames: 1683, activeDays: 281, ...era(596, 922, 450, 761), h1: era(298, 461, 225, 380), h2: era(298, 461, 225, 381) },
    languages: { startedAt: null, endedAt: null, activeDays: 0, h1: { courses: [] }, h2: { courses: [] } },
  };
  const payload = (i: TrajectoryInput) => { const r = evaluateTrajectory(i); return { userId: "u", temporalSpan: { startedAt: i.chess.startedAt, endedAt: i.chess.endedAt, totalDays: 420 }, findings: r.findings, evaluations: r.evaluations }; };
  const render = async (p: unknown) => {
    const rt = createDashboardRuntime("/trajectory");
    rt.sandbox.fetch = fetchOnly("/api/trajectory", async () => ({ ok: true, json: async () => p }));
    await rt.sandbox.fetchTrajectory();
    return rt.getEl("#trajectoryFindings").innerHTML as string;
  };

  it("shouldSayTheDifferenceIsDetectableButThePersistentPatternIsNotDemonstrated", async () => {
    const html = await render(payload(prod));
    expect(html).toContain("Diferencia detectable: sí");
    expect(html).toContain("excluye 0");
    expect(html).toMatch(/\+5,5 pp · IC95 \[\+0,9; \+10,2\] pp/); // magnitude and interval as the production dashboard shows them: 596/922 vs 450/761
    expect(html).toContain("no demostrado");
    expect(html).toContain("Hay una diferencia detectable entre colores, pero no se demuestra un patrón persistente.");
    expect(html).not.toContain("No hay evidencia suficiente");
  });

  it("shouldNotReadAnIntervalWhenTheSampleIsInsufficient", async () => {
    const small = { ...prod, chess: { ...prod.chess, ...era(6, 10, 4, 10), activeDays: 5, h1: era(3, 5, 2, 5), h2: era(3, 5, 2, 5) } };
    const html = await render(payload(small));
    expect(html).not.toContain("Diferencia detectable"); // the card keeps its own reasons; no verdict is built on a sample the criterion rejects
    expect(html).toContain("El criterio exige al menos 40 decididas por color");
  });

  it("shouldSayNoWhenTheIntervalIncludesZero", () => {
    const rt = createDashboardRuntime("/chess");
    expect(run(rt, `colorConclusion(3.4, -5, 12, {met:false})`)).toMatchObject({ detectable: false, line1: "Diferencia detectable: no (+3,4 pp · IC95 [−5,0; +12,0] pp, incluye 0)" });
    expect(run(rt, `colorConclusion(5.6, 0.9, 10.3, {met:false})`)).toMatchObject({ detectable: true, line2: "Patrón persistente: no demostrado" });
    expect(run(rt, `colorConclusion(5.6, 0.9, 10.3, {met:true})`)).toMatchObject({ line2: "Patrón persistente: sí" });
  });

  it("shouldFillThePersistenceLineOfTheChessCardFromTheTrajectoryEvaluation", async () => {
    const rt = createDashboardRuntime("/chess", undefined, fetchOnly("/api/trajectory", async () => ({ ok: true, json: async () => payload(prod) })));
    await settle();
    await run(rt, `paintColorConclusion({diff:5.6, lower:0.9, upper:10.3})`);
    expect(text(rt, "#chessPatternColorConclusion")).toBe("Diferencia detectable: sí (+5,6 pp · IC95 [+0,9; +10,3] pp, excluye 0) · Patrón persistente (≥ 15 pp y en ambas mitades): no demostrado");
  });
});

describe("6. Ajedrez: una tasa histórica y la composición por oponente", () => {
  it("shouldShowTheHistoricalRateAndTheBotShareInTheHeroWhateverTheFormWindow", () => {
    const rt = createDashboardRuntime("/chess");
    const summary = { games: 1683, wins: 1046, losses: 505, draws: 132, winRate: 0.6216, scoreRate: 0.6, currentElo: 908, firstElo: 992 };
    const opponents = { macro: [{ key: "bot", games: 1650 }, { key: "pvp", games: 33 }] };
    rt.sandbox.renderChessView({ summary, opponents, recent: { limit: 20, games: 20, wins: 5, losses: 15, draws: 0, winRate: 0.25, before: null } }, []);
    expect(text(rt, "#chessHeroWrLabel")).toBe("62,2 % de victorias (historial completo, todos los rivales)");
    expect(text(rt, "#chessHeroDistMeta")).toBe("1046W · 505L · 132D");
    expect(text(rt, "#chessHeroGames")).toBe("1650 de 1683 partidas contra bots");
  });

  it("shouldNotRepeatEloAndWinRateInTheKpis", async () => {
    const summary = { games: 10, wins: 6, losses: 3, draws: 1, winRate: 0.6, scoreRate: 0.65, currentElo: 900, firstElo: 900 };
    const rt = createDashboardRuntime("/chess", undefined, async (url: string) =>
      ({ ok: true, status: 200, json: async () => (url.includes("/bundle") ? { summary, timeline: { snapshots: [] } } : url.includes("/summary") ? summary : emptyAccountPayload(url)) }));
    await rt.sandbox.loadChessDashboard();
    const kpis = String(rt.getEl("#kpis").innerHTML);
    expect(kpis).toContain("Partidas");
    expect(kpis).toContain("Score");
    expect(kpis).not.toContain("ELO actual");
    expect(kpis).not.toContain("% de victorias");
  });
});

describe("7. La cabecera «Actualizado» solo acompaña a Ajedrez", () => {
  it("shouldHideTheChessFreshnessLineOutsideTheChessView", () => {
    const rt = createDashboardRuntime("/overview");
    expect(rt.getEl("#syncMeta").hidden).toBe(true);
    run(rt, `showTab('chess')`);
    expect(rt.getEl("#syncMeta").hidden).toBe(false);
    run(rt, `showTab('games')`);
    expect(rt.getEl("#syncMeta").hidden).toBe(true);
  });
});

describe("8. Navegación: una entrada por dominio", () => {
  it("shouldNameEachDomainOnceAndKeepProfileAndExportAsContextualActions", () => {
    const menu = DASHBOARD_HTML.slice(DASHBOARD_HTML.indexOf('id="sideMenu"'), DASHBOARD_HTML.indexOf('<div class="content">'));
    expect(menu).not.toContain("tabBtnProfile");
    expect(menu).toContain(">Ajedrez</button>");
    expect(menu).toContain(">Idiomas</button>");
    expect(menu).toContain(">LinkedIn Games</button>");
    expect(DASHBOARD_HTML).toContain("openEngineProfileSection()");
  });

  it("shouldKeepTheProfileRouteOpeningTheChessViewWithTheEngineSectionOpen", () => {
    const rt = createDashboardRuntime("/profile");
    expect(rt.getEl("#chessTab").hidden).toBe(false);
    expect(rt.getEl("#tabBtnChess").className).toBe("side-item active");
  });
});

describe("9. Evidencia de ajedrez: qué ordena «las que más te costaron»", () => {
  it("shouldSayTheReviewListIsOrderedByAverageLossPerMoveNotBySeriousErrors", () => {
    expect(DASHBOARD_HTML).toContain("ordenadas por pérdida media por jugada");
    expect(DASHBOARD_HTML).toContain("información adicional, no como criterio de orden");
  });

  it("shouldKeepTheSuggestedGameButtonAndNameItsCriterion", () => {
    const rt = createDashboardRuntime("/chess");
    run(rt, `updateChessPatternSuggested({ review: { worst: [{ matchId: "bot|1775750442|elvzn2a6", opponent: "Bot 8", serious: 6 }] } })`);
    expect(text(rt, "#chessPatternSuggested")).toContain("mayor pérdida media por jugada");
  });
});

describe("10. Ajustes de revisión (PR #100)", () => {
  it("shouldShowTheObservedDifferenceWithOneDecimalAndTheSameIntervalPrecision", () => {
    const rt = createDashboardRuntime("/chess");
    expect(run(rt, `colorConclusion(5.575, 0.886, 10.266, {met:false}).line1`)).toBe("Diferencia detectable: sí (+5,6 pp · IC95 [+0,9; +10,3] pp, excluye 0)");
    expect(run(rt, `colorConclusion(-13.3, -35, 11, {met:false}).line1`)).toBe("Diferencia detectable: no (−13,3 pp · IC95 [−35,0; +11,0] pp, incluye 0)");
  });

  it("shouldShowTheSignedDifferenceInTheWindowEvaluationEvenThoughItsDiffPpIsAbsolute", async () => {
    const rt = createDashboardRuntime("/changes");
    const e = { id: "CHESS_COLOR_ASYMMETRY", kind: "statistical", status: "not_emitted", reasons: ["effect_below_threshold"], criteria: { minDiffPp: 15 },
      metrics: { decidedCount: 300, whiteWinRate: 60, blackWinRate: 66, diffPp: 6, diffCiLower: -1, diffCiUpper: 12.5 } };
    const view = run(rt, `evalColorView(${JSON.stringify(e)}, 'SIN INDICIO')`);
    expect(view.cc.line1).toBe("Diferencia detectable: no (−6,0 pp · IC95 [−1,0; +12,5] pp, incluye 0)");
  });

  it("shouldReportTheGamesFreshnessAsTheLastRecordDateInTheOverviewLine", () => {
    const rt = createDashboardRuntime("/overview");
    rt.sandbox.renderOverview({ userState: { streak: 1 }, langs: null, gamesSummary: { days: 170, from: "2026-05-17", to: "2026-11-03", playStreak: { current: 0, max: 122 }, games: {} } });
    expect(text(rt, "#overviewSyncMeta")).toContain("Games: último registro 03-nov · manual");
    expect(text(rt, "#overviewSyncMeta")).not.toContain("registrados");
    expect(run(rt, `shortDate('2026-01-09')`)).toBe("09-ene");
    expect(run(rt, `shortDate('x')`)).toBe("x");
  });
});

describe("11. Idiomas: detalles de la verificación en producción", () => {
  const courses = [
    { courseId: "DUOLINGO_RU_EN", title: "Russian", xp: 159280, fromLanguage: "en", learningLanguage: "ru" },
    { courseId: "DUOLINGO_RU_ES", title: "Russian", xp: 36335, fromLanguage: "es", learningLanguage: "ru" },
  ];
  const render = (rt: any, langs: object) => rt.renderLanguagesView({ currentCourseId: null, updatedAt: new Date().toISOString(), streak: 1, courses, ...langs }, null, { summaries: [] }, null);

  it("shouldTellCoursesWithTheSameTitleApartInTheSelector", () => {
    const rt = createDashboardRuntime("/languages");
    render(rt, { totalXp: 195615 });
    const html = String(rt.getEl("#langCourseSelect").innerHTML);
    expect(html).toContain("Russian · EN → RU (159.280 XP)");
    expect(html).toContain("Russian · ES → RU (36.335 XP)");
  });

  it("shouldSeparateTheCoursesTitleFromItsCount", () => {
    expect(DASHBOARD_HTML).toMatch(/Tus Cursos <span id="langCoursesCount" class="muted" style="[^"]*margin-left:8px/);
  });

  it("shouldExplainWhyTheAccountTotalExceedsTheSumOfTheListedCourses", () => {
    const rt = createDashboardRuntime("/languages");
    render(rt, { totalXp: 195615 + 260607 });
    expect(text(rt, "#langXpGapNote")).toBe("El total de la cuenta supera en 260.607 XP la suma de los 2 cursos del catálogo: esa parte no está asignada a ninguno de ellos.");
  });

  it("shouldSayNothingWhenTheTotalMatchesOrAnyCourseXpIsUnknown", () => {
    const rt = createDashboardRuntime("/languages");
    render(rt, { totalXp: 195615 });
    expect(text(rt, "#langXpGapNote")).toBe("");
    rt.renderLanguagesView({ totalXp: 999999, currentCourseId: null, updatedAt: new Date().toISOString(), streak: 1, courses: [{ ...courses[0], xp: null }, courses[1]] }, null, { summaries: [] }, null);
    expect(text(rt, "#langXpGapNote")).toBe("");
  });
});

describe("audit step 1: demonstrated defects", () => {
  it("shouldNameNamelessOpponentsBotsBecauseEveryNamelessMatchInProductionIsABot", () => {
    const rt = createDashboardRuntime("/profile");
    const html = rt.sandbox.profGameRow({ matchId: "m1", result: "loss", opponent: null, playedAt: 1762000000, color: "white", moves: 30, serious: 2, acpl: 0.4, decisivePly: null });
    expect(html).toContain("<b>Bot</b>");
    expect(html).not.toContain("sin nombre");
  });

  it("shouldLetTheCourseSelectShrinkInsideItsCardInsteadOfOverflowingOnPhones", () => {
    expect(DASHBOARD_HTML).toMatch(/id="langCourseSelect"[^>]*style="flex:1 1 0;min-width:0;max-width:100%/);
    // its container is a flex item sized by the select's longest option: it must be able to shrink too (measured in production with the 13 real labels)
    expect(DASHBOARD_HTML).toMatch(/<div style="min-width:0;max-width:100%">\s*<div class="muted"[^>]*>Curso seleccionado/);
  });
});
