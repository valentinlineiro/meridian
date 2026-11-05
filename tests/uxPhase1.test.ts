import { describe, it, expect } from "vitest";
import { DASHBOARD_HTML } from "../src/frontend.ts";
import CLIENT_CSS from "../src/dashboard.client.css";
import { createDashboardRuntime, fetchOnly } from "./helpers/dom.ts";

describe("Fase 1 - Posición y descompresión de scroll", () => {
  describe("1. Portada tripartita (U1)", () => {
    it("shouldContainGrid3AndOverviewGamesCardInOverviewTab", () => {
      expect(DASHBOARD_HTML).toContain('id="overviewDomainsGrid"');
      expect(DASHBOARD_HTML).toContain('id="overviewLangCard"');
      expect(DASHBOARD_HTML).toContain('id="overviewChessCard"');
      expect(DASHBOARD_HTML).toContain('id="overviewGamesCard"');
      expect(CLIENT_CSS).toContain(".grid3");
    });

    it("shouldRenderGamesCardWhenGamesSummaryIsProvided", () => {
      const rt = createDashboardRuntime("/overview");
      const summary = {
        days: 57,
        from: "2026-09-01",
        to: "2026-11-03",
        playStreak: { current: 12, max: 20 },
        games: {
          zip: { n: 50, nWithAvg: 50, beatAvgRate: 0.8 },
          tango: { n: 57, nWithAvg: 57, beatAvgRate: 0.6 },
        },
      };

      rt.sandbox.renderOverview({
        userState: { streak: 10 },
        langs: { updatedAt: "2026-11-03T10:00:00Z" },
        lastChessSyncedAt: "2026-11-02T10:00:00Z",
        gamesSummary: summary,
      });

      expect(rt.getEl("#overviewGamesStreak").textContent).toBe("🔥 12 días");
      expect(rt.getEl("#overviewGamesMeta").textContent).toBe("Racha máxima 20 días");
      expect(rt.getEl("#overviewGamesHistorical").textContent).toContain("57 días registrados");
      expect(rt.getEl("#overviewSyncMeta").textContent).toContain("Games: último registro 03-nov · manual");
    });

    it("shouldGracefullyDegradeOverviewGamesCardWhenSummaryIsEmptyOrNull", () => {
      const rt = createDashboardRuntime("/overview");
      rt.sandbox.renderOverview({
        userState: { streak: 10 },
        langs: null,
        lastChessSyncedAt: null,
        gamesSummary: null,
      });

      expect(rt.getEl("#overviewGamesStreak").textContent).toBe("—");
      expect(rt.getEl("#overviewGamesHistorical").textContent).toContain("0 días");
      expect(rt.getEl("#overviewSyncMeta").textContent).toContain("Games: registro manual");
    });
  });

  describe("2. Descompresión móvil de Idiomas", () => {
    it("shouldKeepPrimaryBlocksAlwaysVisibleInLanguagesGlobalView", () => {
      expect(DASHBOARD_HTML).toContain('id="langLimitsCard"');
      expect(DASHBOARD_HTML).toContain('id="langCourseHero"');
      expect(DASHBOARD_HTML).toContain('id="langAccountCard"');
      expect(DASHBOARD_HTML).toContain('id="langWeekCard"');
      expect(DASHBOARD_HTML).toContain('id="langCoursesList"');
    });

    it("shouldWrapSecondaryLongitudinalAnalyticsInProgressiveDisclosureDetails", () => {
      expect(DASHBOARD_HTML).toContain('id="langAnalyticsDetails"');
      const detailsSection = DASHBOARD_HTML.slice(
        DASHBOARD_HTML.indexOf('id="langAnalyticsDetails"'),
        DASHBOARD_HTML.indexOf("</details>", DASHBOARD_HTML.indexOf('id="langAnalyticsDetails"')) + 10,
      );

      // Deep secondary analytics cards must be inside the progressive disclosure block
      expect(detailsSection).toContain('id="langObservedChangesCard"');
      expect(detailsSection).toContain('id="langXpTimeline"');
      expect(detailsSection).toContain('id="langIntensityCard"');
      expect(detailsSection).toContain('id="langWeeklyCard"');
      expect(detailsSection).toContain('id="langConcentrationCard"');
      expect(detailsSection).toContain('id="langComparabilityCard"');

      // Primary cards must NOT be inside langAnalyticsDetails
      expect(detailsSection).not.toContain('id="langLimitsCard"');
      expect(detailsSection).not.toContain('id="langCourseHero"');
      expect(detailsSection).not.toContain('id="langAccountCard"');
    });
  });

  describe("3. Descompresión móvil de Games", () => {
    it("shouldIncludeStickyFirstColumnAndTouchRulesInCss", () => {
      expect(CLIENT_CSS).toMatch(/\.gtable\s*th:first-child[\s\S]*position:\s*sticky/);
      expect(CLIENT_CSS).toMatch(/\.gtable\s*td:first-child[\s\S]*position:\s*sticky/);
      expect(CLIENT_CSS).toMatch(/min-height:\s*44px/);
    });

    it("shouldPreserveComparisonTableSemanticsAndSorting", () => {
      expect(DASHBOARD_HTML).toContain('id="gamesTable"');
      expect(DASHBOARD_HTML).toContain('id="gamesHead"');
      expect(DASHBOARD_HTML).toContain('id="gamesRows"');
    });
  });
});
