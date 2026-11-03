import { describe, it, expect } from "vitest";
import vm from "node:vm";
import { createDashboardRuntime } from "./helpers/dom.ts";

// Tabs and URLs, driven through the real script: what the owner sees after opening, navigating and going back.
const PANELS = { overview: "#overviewTab", languages: "#langTab", chess: "#chessTab", changes: "#changesTab", trajectory: "#trajectoryTab" } as const;
const visible = (rt: any): string[] => Object.entries(PANELS).filter(([, sel]) => rt.getEl(sel).hidden === false).map(([name]) => name);

describe("opening the dashboard", () => {
  it.each([
    ["/", "overview"], ["/overview", "overview"], ["/chess", "chess"], ["/languages", "languages"],
    ["/languages/XC_ES", "languages"], ["/changes", "changes"], ["/trajectory", "trajectory"], ["/nonsense", "overview"],
  ])("shouldShowOnlyTheMatchingPanelWhenOpeningAt_%s", (path, tab) => {
    const rt = createDashboardRuntime(path); // synchronous: the tab is decided before any data arrives
    expect(visible(rt)).toEqual([tab]);
  });

  it("shouldHideEveryInactivePanelFromAssistiveTechnologyWithTheHiddenAttribute", () => {
    const rt = createDashboardRuntime("/chess");
    expect(rt.getEl("#overviewTab").hidden).toBe(true);
    expect(rt.getEl("#langTab").hidden).toBe(true);
    expect(rt.getEl("#chessTab").hidden).toBe(false);
  });

  it("shouldMarkTheActiveTabButtonAsPrimary", () => {
    const rt = createDashboardRuntime("/chess");
    expect(rt.getEl("#tabBtnChess").className).toBe("side-item active");
    expect(rt.getEl("#tabBtnOverview").className).toBe("side-item");
  });
});

describe("side menu", () => {
  it("shouldGroupTheViewsUnderResumenAjedrezAndIdiomasWithSpanishLabels", async () => {
    const { DASHBOARD_HTML } = await import("../src/frontend.ts");
    const groups = [...DASHBOARD_HTML.matchAll(/class="side-group">([^<]+)</g)].map((m) => m[1]);
    expect(groups).toEqual(["Resumen", "Ajedrez", "Idiomas"]);
    const items = [...DASHBOARD_HTML.matchAll(/class="side-item[^"]*" id="(tabBtn\w+)"[^>]*>([^<]+)</g)].map((m) => `${m[1]}:${m[2]}`);
    expect(items).toEqual(["tabBtnOverview:Hoy", "tabBtnChanges:Qué cambió", "tabBtnTrajectory:Trayectoria", "tabBtnChess:Partidas", "tabBtnProfile:Perfil", "tabBtnLang:Cursos"]);
  });

  it("shouldMarkTheCurrentViewForAssistiveTechnology", () => {
    const rt = createDashboardRuntime("/profile");
    expect(rt.getEl("#tabBtnProfile").className).toBe("side-item active");
    expect(rt.getEl("#tabBtnProfile").getAttribute("aria-current")).toBe("page");
    expect(rt.getEl("#tabBtnOverview").getAttribute("aria-current")).toBe("false");
  });

  it("shouldOpenAndCloseTheMobileMenuAndCloseItWhenChoosingAView", () => {
    const rt = createDashboardRuntime("/overview");
    vm.runInContext(`toggleSideNav()`, rt.sandbox);
    expect(rt.getEl("#sideMenu").classList.contains("open")).toBe(true);
    expect(rt.getEl("#sideToggle").getAttribute("aria-expanded")).toBe("true");
    vm.runInContext(`showTab("chess")`, rt.sandbox);
    expect(rt.getEl("#sideMenu").classList.contains("open")).toBe(false);
    expect(rt.getEl("#sideToggle").getAttribute("aria-expanded")).toBe("false");
  });

  it("shouldKeepTheLegacyPathsOpeningTheSameViews", () => {
    for (const [path, tab] of [["/chess", "chess"], ["/profile", "profile"], ["/languages", "languages"]] as const) {
      const rt = createDashboardRuntime(path);
      const id = { chess: "#tabBtnChess", profile: "#tabBtnProfile", languages: "#tabBtnLang" }[tab];
      expect(rt.getEl(id).className).toBe("side-item active");
    }
  });
});

describe("switching tabs", () => {
  it("shouldPutTheCanonicalPathInTheAddressBarWhenSwitching", () => {
    const rt = createDashboardRuntime("/overview");
    vm.runInContext(`showTab("chess")`, rt.sandbox);
    expect(rt.sandbox.location.pathname).toBe("/chess");
    expect(visible(rt)).toEqual(["chess"]);
  });

  it("shouldFallBackToOverviewAndNeverPutAnUntrustedNameInTheUrl", () => {
    const rt = createDashboardRuntime("/chess");
    vm.runInContext(`showTab("</script><img src=x>")`, rt.sandbox);
    expect(rt.sandbox.location.pathname).toBe("/overview");
    expect(visible(rt)).toEqual(["overview"]);
  });

  it("shouldKeepTheSelectedCourseInTheUrlWhenReturningToLanguages", () => {
    const rt = createDashboardRuntime("/languages/XC_ES");
    vm.runInContext(`showTab("chess")`, rt.sandbox);
    vm.runInContext(`showTab("languages")`, rt.sandbox);
    expect(rt.sandbox.location.pathname).toBe("/languages/XC_ES");
  });
});

describe("following the address bar", () => {
  it("shouldReRouteWhenTheHashChangesInTheSameTab", () => {
    const rt = createDashboardRuntime("/overview");
    rt.sandbox.location.hash = "#/chess";
    rt.fire("hashchange");
    expect(visible(rt)).toEqual(["chess"]);
    expect(rt.sandbox.location.hash).toBe(""); // the hash is rewritten into a path
    expect(rt.sandbox.location.pathname).toBe("/chess");
  });

  it("shouldReRouteOnBackAndForward", () => {
    const rt = createDashboardRuntime("/overview");
    rt.sandbox.location.pathname = "/trajectory";
    rt.fire("popstate");
    expect(visible(rt)).toEqual(["trajectory"]);
  });

  it("shouldDropTheLegacyCourseQueryAndSelectThatCourse", () => {
    const rt = createDashboardRuntime("/languages");
    rt.sandbox.location.search = "?course=XC_ES";
    rt.fire("popstate");
    expect(rt.sandbox.location.search).toBe("");
    expect(rt.sandbox.location.pathname).toBe("/languages/XC_ES");
  });

  it("shouldUseTheCanonicalCoursePathWithoutAQueryWhenSelectingACourse", async () => {
    const rt = createDashboardRuntime("/overview");
    vm.runInContext(`selectCourse("XC_ES", false)`, rt.sandbox);
    expect(rt.sandbox.location.pathname).toBe("/languages/XC_ES");
    expect(rt.sandbox.location.search).toBe("");
  });
});
