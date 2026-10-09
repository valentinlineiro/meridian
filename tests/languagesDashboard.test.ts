import { describe, it, expect } from "vitest";
import { DASHBOARD_HTML } from "../src/frontend.js";
import worker from "./helpers/adminWorker.ts";
import { getElementHtmlById } from "./helpers/dom.js";

describe("languages dashboard - structure and level separation", () => {
  it("shouldHaveLevel1GlobalViewAndLevel2DetailViewContainers", () => {
    expect(DASHBOARD_HTML).toContain('id="langGlobalView"');
    expect(DASHBOARD_HTML).toContain('id="langDetailView"');
  });

  it("shouldContainAllLevel1GlobalViewElements", () => {
    // Hero card for active course summary
    expect(DASHBOARD_HTML).toContain('id="langHeroCard"');
    expect(DASHBOARD_HTML).toContain('id="langCourseHero"');
    expect(DASHBOARD_HTML).toContain('id="langAccountCard"');
    expect(DASHBOARD_HTML).toContain('id="langCourseSelect"');
    expect(DASHBOARD_HTML).toContain('id="langAccountXp"');
    expect(DASHBOARD_HTML).toContain('id="langAccountStreak"');
    expect(DASHBOARD_HTML).toContain('id="langActiveProgress"');
    expect(DASHBOARD_HTML).toContain('id="langAccountDays"');
    expect(DASHBOARD_HTML).toContain('id="langAccountCourses"');
    expect(DASHBOARD_HTML).toContain('id="langSyncMeta"');

    // List of language courses
    expect(DASHBOARD_HTML).toContain('id="langCoursesList"');

    // 90-day activity timeline
    expect(DASHBOARD_HTML).toContain('id="langXpTimeline"');
    expect(DASHBOARD_HTML).toContain('id="langXpSummary"');
  });

  it("shouldContainAllLevel2CourseDetailViewElements", () => {
    expect(DASHBOARD_HTML).toContain('id="langCourseDetailCard"');
    expect(DASHBOARD_HTML).toContain('id="btnBackToLanguages"');
    expect(DASHBOARD_HTML).toContain('id="langDetailTitle"');
    expect(DASHBOARD_HTML).toContain('id="langDetailSub"');
    expect(DASHBOARD_HTML).toContain('id="langDetailXpPill"');
    expect(DASHBOARD_HTML).toContain('id="langCefrCard"');
    expect(DASHBOARD_HTML).toContain('id="langCefrBody"');
    expect(DASHBOARD_HTML).toContain('id="langSectionsList"');
  });

  it("shouldContainAllAnalyticsCardsInGlobalView", () => {
    expect(DASHBOARD_HTML).toContain('id="langIntensityCard"');
    expect(DASHBOARD_HTML).toContain('id="langIntensityBody"');
    expect(DASHBOARD_HTML).toContain('id="langWeeklyCard"');
    expect(DASHBOARD_HTML).toContain('id="langWeeklyBody"');
    expect(DASHBOARD_HTML).toContain('id="langConcentrationCard"');
    expect(DASHBOARD_HTML).toContain('id="langConcentrationBody"');
    expect(DASHBOARD_HTML).toContain('id="langComparabilityCard"');
    expect(DASHBOARD_HTML).toContain('id="langComparabilityBody"');
  });

  it("shouldDefineClientSideNavigationAndRenderingFunctionsInDashboardScript", () => {
    expect(DASHBOARD_HTML).toContain("function showLanguagesGlobal()");
    expect(DASHBOARD_HTML).toContain("async function showCourseDetail(");
    expect(DASHBOARD_HTML).toContain("function renderLanguagesLevel1(");
    expect(DASHBOARD_HTML).toContain("function renderLanguagesAnalytics(");
    expect(DASHBOARD_HTML).toContain("async function loadLanguagesDashboard()");
  });
});

describe("languages dashboard - factual invariants", () => {
  it("shouldNotContainSyntheticOrSpeculativeAnalyticalMetrics", () => {
    // Contract invariant: UI must be factual, no synthetic estimations or fluency predictions
    const htmlLower = DASHBOARD_HTML.toLowerCase();
    expect(htmlLower).not.toContain("fluidez");
    expect(htmlLower).not.toContain("nivel estimado");
    expect(htmlLower).not.toContain("fluency");
    expect(htmlLower).not.toContain("predicci");
    expect(htmlLower).not.toContain("tiempo estimado de finalizaci");
    expect(htmlLower).not.toContain("label>eficiencia");
    expect(htmlLower).not.toContain("label>productividad");
    expect(htmlLower).not.toContain("h2>eficiencia");
    expect(htmlLower).not.toContain("h2>productividad");
  });

  it("shouldRepresentSectionProgressAsRatioCompletedTotalUnits", () => {
    expect(DASHBOARD_HTML).toContain("s.completedUnits");
    expect(DASHBOARD_HTML).toContain("s.totalUnits");
    expect(DASHBOARD_HTML).toContain("unidades");
  });

  it("shouldEnforceComparabilityDistinctionsBetweenComparableAndStructuralChange", () => {
    expect(DASHBOARD_HTML).toContain("COMPARABLE");
    expect(DASHBOARD_HTML).toContain("CAMBIO ESTRUCTURAL");
    expect(DASHBOARD_HTML).toContain("INSUFICIENTE");
  });
});

describe("languages dashboard - route serving", () => {
  it("shouldServeDashboardHtmlOnLanguagesRoute", async () => {
    const req = new Request("https://meridian.local/languages", { method: "GET" });
    const res = await worker.fetch(req, { DB: { prepare: () => null } } as any);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    const text = await res.text();
    expect(text).toContain('id="langGlobalView"');
    expect(text).toContain('id="langDetailView"');
  });
});

describe("languages dashboard - strict scope boundary isolation (#16.9.2)", () => {
  it("shouldContainLangCourseHeroAndLangAccountCardAsSeparateTopLevelContainers", () => {
    expect(DASHBOARD_HTML).toContain('id="langCourseHero"');
    expect(DASHBOARD_HTML).toContain('id="langAccountCard"');

    const courseHeroHtml = getElementHtmlById(DASHBOARD_HTML, "langCourseHero");
    const accountCardHtml = getElementHtmlById(DASHBOARD_HTML, "langAccountCard");

    expect(courseHeroHtml).not.toBe("");
    expect(accountCardHtml).not.toBe("");
    expect(courseHeroHtml).not.toContain('id="langAccountCard"');
    expect(accountCardHtml).not.toContain('id="langCourseHero"');
  });

  it("shouldIsolateCourseScopedDataInLangCourseHeroWithoutAccountLevelKPIs", () => {
    const courseHeroHtml = getElementHtmlById(DASHBOARD_HTML, "langCourseHero");
    expect(courseHeroHtml).toContain('id="langCourseSelect"');
    expect(courseHeroHtml).toContain('id="langActiveProgress"');

    // Must NOT contain account KPIs
    expect(courseHeroHtml).not.toContain('id="langAccountXp"');
    expect(courseHeroHtml).not.toContain('id="langAccountStreak"');
    expect(courseHeroHtml).not.toContain('id="langAccountDays"');
    expect(courseHeroHtml).not.toContain('id="langAccountCourses"');
    expect(courseHeroHtml).not.toContain('id="langHeroXp"');
    expect(courseHeroHtml).not.toContain('id="langHeroStreak"');
    expect(courseHeroHtml).not.toContain('id="langHeroDays"');
    expect(courseHeroHtml).not.toContain('id="langHeroCourses"');
  });

  it("shouldIsolateAccountScopedDataInLangAccountCardWithoutCourseProgressOrSelect", () => {
    const accountCardHtml = getElementHtmlById(DASHBOARD_HTML, "langAccountCard");
    expect(accountCardHtml).toContain('id="langAccountXp"');
    expect(accountCardHtml).toContain('id="langAccountStreak"');
    expect(accountCardHtml).toContain('id="langAccountDays"');
    expect(accountCardHtml).toContain('id="langAccountCourses"');
    expect(accountCardHtml).toContain('id="langSyncMeta"');

    // Must NOT contain legacy ambiguous Hero KPI IDs
    expect(accountCardHtml).not.toContain('id="langHeroXp"');
    expect(accountCardHtml).not.toContain('id="langHeroStreak"');
    expect(accountCardHtml).not.toContain('id="langHeroDays"');
    expect(accountCardHtml).not.toContain('id="langHeroCourses"');

    // Must NOT contain course-scoped elements
    expect(accountCardHtml).not.toContain('id="langCourseSelect"');
    expect(accountCardHtml).not.toContain('id="langActiveProgress"');
  });

  it("shouldPresentScopeBadgesCURSOAndCUENTAAsSemanticAnchors", () => {
    expect(DASHBOARD_HTML).toMatch(/\.pill-scope\b/);

    const courseHeroHtml = getElementHtmlById(DASHBOARD_HTML, "langCourseHero");
    expect(courseHeroHtml).toMatch(/class="[^"]*pill-scope[^"]*"[^>]*>\s*CURSO\s*</);

    const accountCardHtml = getElementHtmlById(DASHBOARD_HTML, "langAccountCard");
    expect(accountCardHtml).toMatch(/class="[^"]*pill-scope[^"]*"[^>]*>\s*CUENTA\s*</);
  });

  it("shouldFormatLangWeekCardHeaderAsAccountActivityWithMicroDisclosure", () => {
    const weekCardHtml = getElementHtmlById(DASHBOARD_HTML, "langWeekCard");
    expect(weekCardHtml).toContain("Actividad de cuenta · últimos 7 días");
    expect(weekCardHtml).toContain("Incluye actividad de todos los cursos y actividades registradas en la fuente.");
    expect(weekCardHtml).toMatch(/class="[^"]*pill-scope[^"]*"[^>]*>\s*CUENTA\s*</);
  });

  it("shouldLabelOverviewLangWeekCardAsCuentaLtimos7DAsWithAccountScopeDisclosure", () => {
    const overviewWeekHtml = getElementHtmlById(DASHBOARD_HTML, "overviewLangWeekCard");
    expect(overviewWeekHtml).toContain("Cuenta · últimos 7 días");
    expect(overviewWeekHtml).toContain("Actividad global registrada en la cuenta");
  });

  it("shouldExplicitlyDesignateAccountCatalogAndCourseScopesAcrossAnalyticsAndTimelineCards", () => {
    expect(DASHBOARD_HTML).toContain("Actividad de cuenta — últimos 90 días");
    const intensityCardHtml = getElementHtmlById(DASHBOARD_HTML, "langIntensityCard");
    expect(intensityCardHtml).toContain("Intensidad descriptiva · cuenta");
    const weeklyCardHtml = getElementHtmlById(DASHBOARD_HTML, "langWeeklyCard");
    expect(weeklyCardHtml).toContain("Perfil por día de la semana · cuenta");
    const concentrationCardHtml = getElementHtmlById(DASHBOARD_HTML, "langConcentrationCard");
    expect(concentrationCardHtml).toContain("Concentración histórica · catálogo");
    const comparabilityCardHtml = getElementHtmlById(DASHBOARD_HTML, "langComparabilityCard");
    expect(comparabilityCardHtml).toContain("Comparabilidad curricular longitudinal · cursos");
  });
});

