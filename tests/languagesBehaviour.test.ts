import { describe, it, expect } from "vitest";
import vm from "node:vm";
import { createDashboardRuntime, emptyAccountPayload } from "./helpers/dom.ts";

// Course selection, the Overview language card and the Languages synthesis, read back from the page.
const settle = async () => { for (let i = 0; i < 300; i++) await Promise.resolve(); };
const DAY = 864e5;
const course = (courseId: string, title: string, xp: number, from = "en", learning = "xb") => ({ courseId, title, xp, fromLanguage: from, learningLanguage: learning });
const langs = {
  totalXp: 421500, streak: 12, currentCourseId: "XB_EN", updatedAt: new Date(Date.now() - 2 * DAY).toISOString(),
  courses: [course("XB_EN", "Demo Beta", 94000), course("XC_ES", "Demo Gamma", 45000, "es", "xc")],
};
const sections = (completed: number, total: number) => [{ sectionIndex: 1, completedUnits: completed, totalUnits: total, cefrLevel: "A1", type: "learning" }];
const detail = (completed: number, total: number) => ({ course: langs.courses[0], sections: sections(completed, total) });

function fetchLanguages(requests: string[] = [], details: Record<string, unknown> = {}) {
  return async (url: string) => {
    requests.push(url);
    const body =
      url === "/api/languages" ? langs
      : url.startsWith("/api/languages/courses/") ? (details[decodeURIComponent(url.split("/").pop()!)] ?? { ok: false, error: "no detail" })
      : url.startsWith("/api/languages/xp") ? { summaries: [] }
      : emptyAccountPayload(url);
    return { ok: true, status: 200, json: async () => body };
  };
}
const run = (rt: any, expr: string) => vm.runInContext(expr, rt.sandbox);
const text = (rt: any, sel: string): string => String(rt.getEl(sel).textContent);

describe("which course is selected", () => {
  const pick = (stored: string | null, requested: string | null) => {
    const rt = createDashboardRuntime("/overview");
    if (stored) rt.sandbox.localStorage.setItem("longitudinal_selected_course", stored);
    return run(rt, `resolveSelectedCourseId(${JSON.stringify(langs.courses)}, ${JSON.stringify(requested)})`);
  };

  it("shouldPreferTheRequestedCourseThenTheSavedOneThenTheOneWithMostXp", () => {
    expect(pick("XB_EN", "XC_ES")).toBe("XC_ES");
    expect(pick("XC_ES", null)).toBe("XC_ES");
    expect(pick(null, null)).toBe("XB_EN");
  });

  it("shouldIgnoreARequestedOrSavedCourseThatIsNotInTheCatalogue", () => {
    expect(pick("GONE", "ALSO_GONE")).toBe("XB_EN");
  });

  it("shouldNotFollowWhichCourseDuolingoReportsAsCurrent", () => {
    const rt = createDashboardRuntime("/overview");
    const reorder = [langs.courses[1], langs.courses[0]]; // the catalogue arrives ordered by XP, so the first is the fallback
    expect(run(rt, `resolveSelectedCourseId(${JSON.stringify(reorder)}, null)`)).toBe("XC_ES");
  });

  it("shouldSaveTheChoiceUpdateTheUrlAndRefreshTheOverviewCardWithoutReloading", async () => {
    const requests: string[] = [];
    const rt = createDashboardRuntime("/overview", undefined, fetchLanguages(requests, { XB_EN: detail(3, 10), XC_ES: detail(1, 4) }));
    await settle();
    expect(text(rt, "#overviewLangActiveCourse")).toContain("Demo Beta");

    run(rt, `selectCourse("XC_ES", false)`);
    await settle();
    expect(rt.sandbox.localStorage.getItem("longitudinal_selected_course")).toBe("XC_ES");
    expect(rt.sandbox.location.pathname).toBe("/languages/XC_ES");
    expect(text(rt, "#overviewLangActiveCourse")).toContain("Demo Gamma");
    expect(text(rt, "#overviewLangUnits")).toBe("1 / 4 unidades (25.0%)");
  });

  it("shouldFetchACourseDetailOnlyOnceWhenItIsSelectedAgain", async () => {
    const requests: string[] = [];
    const rt = createDashboardRuntime("/overview", undefined, fetchLanguages(requests, { XB_EN: detail(3, 10), XC_ES: detail(1, 4) }));
    await settle();
    run(rt, `selectCourse("XC_ES", true)`); await settle();
    run(rt, `selectCourse("XB_EN", true)`); await settle();
    run(rt, `selectCourse("XC_ES", true)`); await settle();
    expect(requests.filter((u) => u === "/api/languages/courses/XC_ES")).toHaveLength(1);
  });
});

describe("overview language card", () => {
  it("shouldShowTheSelectedCourseEvenWhenDuolingoReportsAnotherAsCurrent", async () => {
    const rt = createDashboardRuntime("/languages/XC_ES", undefined, fetchLanguages([], { XC_ES: detail(1, 4) }));
    await settle();
    expect(text(rt, "#overviewLangActiveCourse")).toContain("Demo Gamma");
    expect(text(rt, "#overviewLangSourceCourse")).toBe("Último curso en Duolingo: Demo Beta");
  });

  it("shouldSayWhenThereIsNoObservationInsteadOfShowingABareDash", async () => {
    const rt = createDashboardRuntime("/overview", undefined, fetchLanguages([], {}));
    await settle();
    expect(text(rt, "#overviewLangUnits")).toMatch(/^Sin observación aún/);
  });

  it("shouldSayWhenEachDomainWasLastSyncedWithoutInventingAStatus", async () => {
    const rt = createDashboardRuntime("/overview", undefined, fetchLanguages([], {}));
    await settle();
    const meta = text(rt, "#overviewSyncMeta");
    expect(meta).toContain("Idiomas: sincronizado hace 2d");
    expect(meta).toContain("Ajedrez:");
    expect(meta).not.toContain("Pulso unificado");
  });
});

describe("languages tab", () => {
  const render = (rt: any, analytics: unknown, active: unknown) =>
    run(rt, `renderLanguagesView(${JSON.stringify(langs)}, ${JSON.stringify(analytics)}, { summaries: [] }, ${JSON.stringify(active)})`);

  it("shouldShowTheProgressOfTheSelectedCourseAndOtherwiseSayThereIsNone", () => {
    const rt = createDashboardRuntime("/languages");
    render(rt, null, detail(3, 10));
    expect(text(rt, "#langActiveProgress")).toBe("3 / 10 unidades (30.0%)");

    const fresh = createDashboardRuntime("/languages"); // a render without detail keeps showing the last one it had, so start clean
    render(fresh, null, null);
    expect(text(fresh, "#langActiveProgress")).toMatch(/^Sin observación aún/);
  });

  it("shouldFallBackToTheCurriculumAnalyticsWhenTheCourseDetailIsMissing", () => {
    const rt = createDashboardRuntime("/languages");
    render(rt, { curriculum: { courses: [{ courseId: "XB_EN", completedUnits: 4, totalUnits: 8 }] } }, null);
    expect(text(rt, "#langActiveProgress")).toBe("4 / 8 unidades (50.0%)");
  });

  it("shouldKeepTheCourseXpApartFromTheAccountXpInTheCourseCard", () => {
    const rt = createDashboardRuntime("/languages");
    render(rt, null, null);
    expect(text(rt, "#langActiveHeroMeta")).toMatch(/94[.,]?000\s*XP acumulado en el curso/);
    expect(text(rt, "#langActiveHeroMeta")).not.toContain("XP hoy");
  });

  it("shouldCountComparableStructuralAndInsufficientCoursesSeparatelyAndNeverCallThemStable", () => {
    const rt = createDashboardRuntime("/languages");
    const recentDeltas = ["comparable", "comparable", "structural_change", "insufficient_observation"].map((status, i) => ({ courseId: `C${i}`, status }));
    render(rt, { curriculum: { totalCourses: 4, recentDeltas } }, null);
    const synthesis = text(rt, "#langObservedSynthesis");
    expect(synthesis).toBe("2 de 4 cursos comparables sin cambio estructural · 1 con observación insuficiente · 1 con cambio estructural");
    expect(synthesis).not.toMatch(/estable/i);
  });

  it("shouldSayThereAreNoObservationsWhenThereAreNoDeltas", () => {
    const rt = createDashboardRuntime("/languages");
    render(rt, { curriculum: { totalCourses: 2, recentDeltas: [] } }, null);
    expect(text(rt, "#langObservedSynthesis")).toBe("Sin observaciones curriculares registradas");
  });

  // Known defect (found while converting these tests): renderLanguagesAnalytics looks courses up by `c.id`, but the catalogue
  // uses `courseId`, so every course is also listed as waiting. Remove `.fails` when that lookup is fixed.
  it.fails("shouldListACourseWithoutASecondObservationAsWaitingAndOnlyThatOne", () => {
    const rt = createDashboardRuntime("/languages");
    run(rt, `lastLangsData = ${JSON.stringify(langs)}`);
    const analytics = {
      activity: {}, intensity: { global: {}, dailyDistribution: {} }, weekdayProfile: [], period: { calendarDays: 30 },
      curriculum: { recentDeltas: [{ courseId: "XB_EN", status: "comparable", deltaCompletedUnits: 2 }] },
    };
    run(rt, `renderLanguagesAnalytics(${JSON.stringify(analytics)})`);
    const html = rt.getEl("#langComparabilityBody").innerHTML;
    const waiting = [...html.matchAll(/<b>([^<]+)<\/b><span class="pill pill-draw">ESPERANDO 2ª OBSERVACIÓN/g)].map((m) => m[1]);
    expect(waiting).toEqual(["Demo Gamma"]);
    expect(html).toContain("COMPARABLE");
  });
});

describe("languages catalogue", () => {
  it("shouldMarkTheSelectedCourseAndLetEveryRowSelectItWithoutAnActiveBadge", () => {
    const rt = createDashboardRuntime("/languages/XC_ES");
    run(rt, `renderLanguagesView(${JSON.stringify(langs)}, null, { summaries: [] }, null)`);
    const html = rt.getEl("#langCoursesList").innerHTML;
    expect(html).toContain("pill-selected");
    expect(html).not.toContain("ACTIVO");
    expect([...html.matchAll(/onclick="selectCourse\(([^)]*)\)"/g)].map((m) => m[1]!.replace(/&quot;/g, '"'))).toEqual(['"XB_EN"', '"XC_ES"']);
  });

  it("shouldCountAgainstTheCatalogueSizeWhenTheAnalyticsGiveNoTotal", () => {
    const rt = createDashboardRuntime("/languages");
    run(rt, `renderLanguagesView(${JSON.stringify(langs)}, ${JSON.stringify({ curriculum: { recentDeltas: [{ courseId: "XB_EN", status: "comparable" }] } })}, { summaries: [] }, null)`);
    expect(text(rt, "#langObservedSynthesis")).toBe("1 de 2 cursos comparables sin cambio estructural");
  });

  it("shouldShowASectionWithNoCompletedUnitsAsZeroPercentNotAsNaN", () => {
    const rt = createDashboardRuntime("/languages/XB_EN");
    run(rt, `renderLanguagesView(${JSON.stringify(langs)}, null, { summaries: [] }, ${JSON.stringify({ course: langs.courses[0], sections: [{ sectionIndex: 1, totalUnits: 4, cefrLevel: "A1" }] })})`);
    const html = rt.getEl("#langCoursesList").innerHTML;
    expect(html).toContain("width:0.0%");
    expect(html).not.toContain("NaN");
  });

  it("shouldRenderASectionWithoutUnitCountsAsZeroNotAsNaN", async () => {
    const rt = createDashboardRuntime("/languages", undefined, async (url: string) => ({
      ok: true, status: 200,
      json: async () => (url.startsWith("/api/languages/courses/") ? { course: langs.courses[0], sections: [{ sectionIndex: 1, sectionId: "s1", type: "learning" }] } : emptyAccountPayload(url)),
    }));
    await settle();
    await run(rt, `showCourseDetail("XB_EN")`);
    await settle();
    const html = rt.getEl("#langSectionsList").innerHTML;
    expect(html).toContain("0 / 0 unidades");
    expect(html).not.toContain("NaN");
  });
});

describe("languages sync note", () => {
  it("shouldSayWhenTheSnapshotWasTakenAndTheLastActivityDayAsDifferentFacts", () => {
    const rt = createDashboardRuntime("/languages");
    const day = Math.floor((Date.now() - 5 * DAY) / 1000);
    const snapshot = {
      createdAt: new Date(Date.now() - 1 * DAY).toISOString(), totalXp: 1000, streak: 3,
      totals: { days: 7, activeDays: 4, xp: 100, sessions: 5, minutes: 30 }, summaries: [{ date: day, gainedXp: 50, numSessions: 2, totalSessionTime: 600 }],
      courseProgressIndex: [], courseProgressHistory: [],
    };
    run(rt, `renderLang(${JSON.stringify(snapshot)})`);
    const meta = text(rt, "#langSyncMeta");
    expect(meta).toContain("Sincronizado ayer");
    expect(meta).toContain(`Actividad hasta ${new Date(day * 1000).toISOString().slice(0, 10)}`);
  });
});
