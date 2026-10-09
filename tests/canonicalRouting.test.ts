import { describe, it, expect } from "vitest";
import { DASHBOARD_HTML } from "../src/frontend.ts";
import { parseCanonicalRoute } from "./helpers/dom.ts";

describe("Canonical Routing (#16.9.1)", () => {
  describe("parseCanonicalRoute unit tests", () => {
    it("shouldResolveOverviewFromEmptyOrRootHash", () => {
      expect(parseCanonicalRoute("", "")).toEqual({
        tab: "overview",
        courseId: null,
        canonicalPath: "/overview",
        canonicalHash: "#/overview",
        hasLegacyQuery: false,
      });
      expect(parseCanonicalRoute("/overview")).toEqual({
        tab: "overview",
        courseId: null,
        canonicalPath: "/overview",
        canonicalHash: "#/overview",
        hasLegacyQuery: false,
      });
      expect(parseCanonicalRoute("#", "")).toEqual({
        tab: "overview",
        courseId: null,
        canonicalPath: "/overview",
        canonicalHash: "#/overview",
        hasLegacyQuery: false,
      });
      expect(parseCanonicalRoute("#/overview", "")).toEqual({
        tab: "overview",
        courseId: null,
        canonicalPath: "/overview",
        canonicalHash: "#/overview",
        hasLegacyQuery: false,
      });
      expect(parseCanonicalRoute("#overview", "")).toEqual({
        tab: "overview",
        courseId: null,
        canonicalPath: "/overview",
        canonicalHash: "#/overview",
        hasLegacyQuery: false,
      });
    });

    it("shouldResolveLanguagesWithoutCourse", () => {
      expect(parseCanonicalRoute("/languages")).toEqual({
        tab: "languages",
        courseId: null,
        canonicalPath: "/languages",
        canonicalHash: "#/languages",
        hasLegacyQuery: false,
      });
      expect(parseCanonicalRoute("#/languages", "")).toEqual({
        tab: "languages",
        courseId: null,
        canonicalPath: "/languages",
        canonicalHash: "#/languages",
        hasLegacyQuery: false,
      });
      expect(parseCanonicalRoute("#languages", "")).toEqual({
        tab: "languages",
        courseId: null,
        canonicalPath: "/languages",
        canonicalHash: "#/languages",
        hasLegacyQuery: false,
      });
    });

    it("shouldResolveLanguagesWithCourseDeepLink", () => {
      expect(parseCanonicalRoute("/languages/DUOLINGO_XC_ES")).toEqual({
        tab: "languages",
        courseId: "DUOLINGO_XC_ES",
        canonicalPath: "/languages/DUOLINGO_XC_ES",
        canonicalHash: "#/languages/DUOLINGO_XC_ES",
        hasLegacyQuery: false,
      });
      expect(parseCanonicalRoute("#/languages/DUOLINGO_XC_ES", "")).toEqual({
        tab: "languages",
        courseId: "DUOLINGO_XC_ES",
        canonicalPath: "/languages/DUOLINGO_XC_ES",
        canonicalHash: "#/languages/DUOLINGO_XC_ES",
        hasLegacyQuery: false,
      });
      expect(parseCanonicalRoute("#/languages/DUOLINGO_XB_EN", "")).toEqual({
        tab: "languages",
        courseId: "DUOLINGO_XB_EN",
        canonicalPath: "/languages/DUOLINGO_XB_EN",
        canonicalHash: "#/languages/DUOLINGO_XB_EN",
        hasLegacyQuery: false,
      });
      expect(parseCanonicalRoute("#languages/DUOLINGO_XA_ES", "")).toEqual({
        tab: "languages",
        courseId: "DUOLINGO_XA_ES",
        canonicalPath: "/languages/DUOLINGO_XA_ES",
        canonicalHash: "#/languages/DUOLINGO_XA_ES",
        hasLegacyQuery: false,
      });
    });

    it("shouldResolveChessTab", () => {
      expect(parseCanonicalRoute("/chess")).toEqual({
        tab: "chess",
        courseId: null,
        canonicalPath: "/chess",
        canonicalHash: "#/chess",
        hasLegacyQuery: false,
      });
      expect(parseCanonicalRoute("#/chess", "")).toEqual({
        tab: "chess",
        courseId: null,
        canonicalPath: "/chess",
        canonicalHash: "#/chess",
        hasLegacyQuery: false,
      });
      expect(parseCanonicalRoute("#chess", "")).toEqual({
        tab: "chess",
        courseId: null,
        canonicalPath: "/chess",
        canonicalHash: "#/chess",
        hasLegacyQuery: false,
      });
    });

    it("shouldDetectAndConvertLegacyCourseQueryParam", () => {
      // ?course=DUOLINGO_XC_ES#languages -> canonical #/languages/DUOLINGO_XC_ES
      const res = parseCanonicalRoute("#languages", "?course=DUOLINGO_XC_ES");
      expect(res).toEqual({
        tab: "languages",
        courseId: "DUOLINGO_XC_ES",
        canonicalPath: "/languages/DUOLINGO_XC_ES",
        canonicalHash: "#/languages/DUOLINGO_XC_ES",
        hasLegacyQuery: true,
      });
    });

    it("shouldFallbackToOverviewOnUnknownRoute", () => {
      expect(parseCanonicalRoute("#/unknown/route", "")).toEqual({
        tab: "overview",
        courseId: null,
        canonicalPath: "/overview",
        canonicalHash: "#/overview",
        hasLegacyQuery: false,
      });
    });
  });

  describe("DASHBOARD_HTML client script integration", () => {
    it("shouldDefineCanonicalRouteParserInDashboardScript", () => {
      expect(DASHBOARD_HTML).toMatch(/function parseCanonicalRoute\(/);
    });

    it("shouldUpdateUrlWithoutLegacyQueryParamInSelectCourse", () => {
      const fn = DASHBOARD_HTML.match(/function selectCourse\([^)]*\)\{([\s\S]*?)\n\}/)?.[1] ?? "";
      // Must set canonical path /languages/:courseId
      expect(fn).toMatch(/\/languages\//);
      expect(fn).toMatch(/targetPath/);
      // Must not set ?course= query param
      expect(fn).not.toMatch(/searchParams\.set\(['"]course['"]/);
    });

    it("shouldCleanLegacyQueryParamIfPresentDuringInit", () => {
      expect(DASHBOARD_HTML).toMatch(/searchParams\.delete\(['"]course['"]\)/);
    });

    it("shouldSupportBackForwardNavigationWithCourseParam", () => {
      // Must re-route course on popstate and hashchange if courseId changed
      expect(DASHBOARD_HTML).toMatch(/addEventListener\(\s*['"]popstate['"]/);
      expect(DASHBOARD_HTML).toMatch(/addEventListener\(\s*['"]hashchange['"]/);
    });

    it("shouldSimulateFullBackForwardNavigationSequence", () => {
      // Simulate state machine:
      // 1. User starts at #/overview
      let route = parseCanonicalRoute("#/overview", "");
      expect(route.tab).toBe("overview");
      expect(route.courseId).toBeNull();

      // 2. Navigates to #/languages/DUOLINGO_XC_ES
      route = parseCanonicalRoute("#/languages/DUOLINGO_XC_ES", "");
      expect(route.tab).toBe("languages");
      expect(route.courseId).toBe("DUOLINGO_XC_ES");

      // 3. Switches course to #/languages/DUOLINGO_XB_EN
      route = parseCanonicalRoute("#/languages/DUOLINGO_XB_EN", "");
      expect(route.tab).toBe("languages");
      expect(route.courseId).toBe("DUOLINGO_XB_EN");

      // 4. Hits browser Back button -> returns to #/languages/DUOLINGO_XC_ES
      route = parseCanonicalRoute("#/languages/DUOLINGO_XC_ES", "");
      expect(route.tab).toBe("languages");
      expect(route.courseId).toBe("DUOLINGO_XC_ES");

      // 5. Navigates to #/chess
      route = parseCanonicalRoute("#/chess", "");
      expect(route.tab).toBe("chess");
      expect(route.courseId).toBeNull();
    });

    it("shouldEnsureOverviewAndChessTabsRemainUnaffected", () => {
      expect(DASHBOARD_HTML).toMatch(/id="overviewTab"/);
      expect(DASHBOARD_HTML).toMatch(/id="chessTab"/);
      expect(DASHBOARD_HTML).toMatch(/id="langTab"/);
    });

    it("shouldSupport375pxMobileViewportWithoutHorizontalOverflow", () => {
      // Check media query for mobile screens (<= 480px, including 375px iPhone viewport)
      expect(DASHBOARD_HTML).toMatch(/@media\s*\(max-width:\s*480px\)/);
      expect(DASHBOARD_HTML).toMatch(/max-width:\s*100%/);
    });
  });
});
