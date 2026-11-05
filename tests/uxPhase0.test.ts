import { describe, it, expect } from "vitest";
import { DASHBOARD_HTML } from "../src/frontend.ts";
import { createDashboardRuntime, emptyAccountPayload, fetchOnly } from "./helpers/dom.ts";

const win = (extra: Record<string, any> = {}) => ({
  eff: { median: 1.13, nEff: 20 },
  beat: { rate: 0.65, nBeat: 20 },
  time: { median: 47, p25: 42, p75: 64, nTime: 20 },
  prev: null,
  delta: { effRel: { value: -0.16, nCur: 20, nPrev: 20 } },
  ...extra,
});

describe("Fase 0 - Verdad, vocabulario y honestidad del dato", () => {
  describe("1. Frescura global independiente de Ajedrez", () => {
    it("shouldNotContainPartidasInGlobalHeader", () => {
      const header = DASHBOARD_HTML.slice(DASHBOARD_HTML.indexOf("<header>"), DASHBOARD_HTML.indexOf("</header>"));
      expect(header).not.toContain("partidas");
    });

    it("shouldNotInjectChessPartidasIntoSyncMetaWhenChessLoads", async () => {
      const fakeTimeline = { snapshots: [{ id: "s1", createdAt: "2026-11-03T10:00:00Z", elo: 900 }] };
      const fakeSummary = { games: 60, winRate: 0.6, currentElo: 900, firstElo: 900 };
      const rt = createDashboardRuntime("/chess", undefined, async (url: string) => {
        if (url.includes("/summary")) return { ok: true, status: 200, json: async () => fakeSummary };
        if (url.includes("/timeline")) return { ok: true, status: 200, json: async () => fakeTimeline };
        if (url.includes("/bundle")) return { ok: true, status: 200, json: async () => ({ summary: fakeSummary, timeline: fakeTimeline }) };
        return { ok: true, status: 200, json: async () => emptyAccountPayload(url) };
      });
      await rt.sandbox.loadChessDashboard();
      const syncMeta = rt.getEl("#syncMeta").textContent;
      expect(syncMeta).not.toContain("partidas");
    });
  });

  describe("2. Contexto de muestra y calibración", () => {
    it("shouldShowSampleContextAndCiInOpponentsMacro", async () => {
      const fakeOpponents = {
        macro: [
          { key: "bot", label: "Bots", games: 51, decided: 51, wins: 34, winRate: 0.667, winRateCi: { lower: 0.53, upper: 0.78 } },
          { key: "pvp", label: "PvP", games: 9, decided: 9, wins: 4, winRate: 0.444, winRateCi: { lower: 0.19, upper: 0.73 } },
        ],
        segments: [],
      };
      const fakeSummary = { games: 60, currentElo: 900, firstElo: 900 };
      const rt = createDashboardRuntime("/chess", undefined, async (url: string) => {
        if (url.includes("/bundle")) return { ok: true, status: 200, json: async () => ({ summary: fakeSummary, opponents: fakeOpponents, timeline: { snapshots: [] } }) };
        if (url.includes("/summary")) return { ok: true, status: 200, json: async () => fakeSummary };
        if (url.includes("/timeline")) return { ok: true, status: 200, json: async () => ({ snapshots: [] }) };
        if (url.includes("/opponents")) return { ok: true, status: 200, json: async () => fakeOpponents };
        return { ok: true, status: 200, json: async () => emptyAccountPayload(url) };
      });
      await rt.sandbox.loadChessDashboard();
      const oppMacro = rt.getEl("#oppMacro").textContent;
      expect(oppMacro).toContain("Bots: 51");
      expect(oppMacro).toContain("PvP: 9");
      // Must include confidence intervals, not bare win rate numbers without uncertainty
      expect(oppMacro).toMatch(/\[53–78\]/);
      expect(oppMacro).toMatch(/\[19–73\]/);
    });

    it("shouldShowObservedDaysContextWithoutImplyingPartialConfidenceForUncalibratedGames", async () => {
      const uncalibratedGame = {
        n: 57,
        nWithAvg: 57,
        beatAvgRate: 0.65,
        best: { seconds: 32, date: "2026-09-30" },
        beatStreak: { current: 1, max: 1 },
        trend112: { rho: 0.28, slopePctPer28d: 3.3, n: 55, days: 112 },
        recent28vBase56: { delta: -0.31, nCur: 20, nBase: 40 },
        series: [],
        interpretation: { label: "datos_insuficientes", reason: "sin_calibracion", candidate: "datos_insuficientes", previousCandidate: "datos_insuficientes", bands: null, calibratedThrough: null, pending: null },
        windows: { 7: win(), 28: win(), 90: win(), all: win() },
        trajectory: { 7: [{ start: "2026-11-01", n: 1, eff: 1.1, beat: 1 }], 28: [{ start: "2026-11-01", n: 1, eff: 1.1, beat: 1 }], 90: [], all: [] },
      };
      const rt = createDashboardRuntime("/games", undefined, fetchOnly("/api/me/linkedin-games", async (url: string) => {
        if (url.includes("/summary")) {
          return { ok: true, status: 200, json: async () => ({ ok: true, summary: { days: 57, from: "2026-09-01", to: "2026-11-03", playStreak: { current: 1, max: 1 }, games: { tango: uncalibratedGame } } }) };
        }
        return { ok: true, status: 200, json: async () => ({ ok: true, day: { games: {} } }) };
      }));
      await rt.sandbox.fetchGames();
      const cards = rt.getEl("#gamesList").children;
      const tangoCard = cards.find((c: any) => c.children && c.children[0] && c.children[0].textContent.includes("Tango"));
      expect(tangoCard).toBeDefined();
      const lines = tangoCard!.children.slice(1).map((c: any) => c.textContent).join(" ");
      expect(lines).toContain("57 de 112 días");
      expect(lines).toMatch(/requiere el periodo completo|no opera de forma parcial|sin validez parcial/i);
    });
  });

  describe("3. Límites metodológicos y etiquetas CEFR en Idiomas", () => {
    it("shouldIncludePermanentLimitsBlockInLanguagesGlobalView", () => {
      expect(DASHBOARD_HTML).toContain('id="langLimitsCard"');
      expect(DASHBOARD_HTML).toMatch(/Lo que estos datos no pueden decir/i);
      expect(DASHBOARD_HTML).toMatch(/no representan dominio lingüístico/i);
    });

    it("shouldLabelCefrCardAsCurricularUnitsNotProficiency", () => {
      expect(DASHBOARD_HTML).toContain("Unidades curriculares por nivel CEFR");
      expect(DASHBOARD_HTML).toMatch(/no constituye evaluación ni certificación/i);
    });
  });

  describe("4. Corregir delta de ELO sin histórico comparable", () => {
    it("shouldShowSinHistoricoComparableWhenOnlyOneSnapshotExists", async () => {
      const singleSnapshotTimeline = { snapshots: [{ id: "s1", createdAt: "2026-10-01T10:00:00Z", elo: 900 }] };
      const summary = { games: 60, currentElo: 900, firstElo: 900, latestElo: 900 };
      const rt = createDashboardRuntime("/chess", undefined, async (url: string) => {
        if (url.includes("/bundle")) return { ok: true, status: 200, json: async () => ({ summary, timeline: singleSnapshotTimeline }) };
        if (url.includes("/summary")) return { ok: true, status: 200, json: async () => summary };
        if (url.includes("/timeline")) return { ok: true, status: 200, json: async () => singleSnapshotTimeline };
        return { ok: true, status: 200, json: async () => emptyAccountPayload(url) };
      });
      await rt.sandbox.loadChessDashboard();
      expect(rt.getEl("#chessHeroEloSub").textContent).toBe("ELO · sin histórico comparable");
      expect(rt.getEl("#kpis").innerHTML).not.toContain("0 vs primer snapshot");
    });

    it("shouldHandleMissingOrNullEloWithoutSpuriousComparableLabel", async () => {
      const emptyTimeline = { snapshots: [] };
      const summaryWithoutElo = { games: 0, currentElo: null, firstElo: null, latestElo: null };
      const rt = createDashboardRuntime("/chess", undefined, async (url: string) => {
        if (url.includes("/bundle")) return { ok: true, status: 200, json: async () => ({ summary: summaryWithoutElo, timeline: emptyTimeline }) };
        if (url.includes("/summary")) return { ok: true, status: 200, json: async () => summaryWithoutElo };
        if (url.includes("/timeline")) return { ok: true, status: 200, json: async () => emptyTimeline };
        return { ok: true, status: 200, json: async () => emptyAccountPayload(url) };
      });
      await rt.sandbox.loadChessDashboard();
      expect(rt.getEl("#chessHeroEloSub").textContent).toBe("ELO");
      expect(rt.getEl("#kpis").innerHTML).not.toContain("sin histórico comparable");
      expect(rt.getEl("#kpis").innerHTML).not.toContain("vs primer snapshot");
    });
  });

  describe("5. Reubicar Exportar partidas bajo Ajedrez", () => {
    it("shouldPlaceExportMatchesInsideTheChessViewAndNotInTheSideMenu", () => {
      const menu = DASHBOARD_HTML.slice(DASHBOARD_HTML.indexOf('id="sideMenu"'), DASHBOARD_HTML.indexOf('<div class="content">'));
      expect(menu).not.toContain('/api/export/matches.csv');
      const chess = DASHBOARD_HTML.slice(DASHBOARD_HTML.indexOf('id="chessTab"'), DASHBOARD_HTML.indexOf('id="langTab"'));
      expect(chess).toContain('href="/api/export/matches.csv" download');
    });
  });

  describe("6. Aclarar alcance de Sincronizar", () => {
    it("shouldClarifySyncScopeInTooltipOrHintAndBeAccessible", () => {
      const menu = DASHBOARD_HTML.slice(DASHBOARD_HTML.indexOf('id="sideMenu"'), DASHBOARD_HTML.indexOf('<div class="content">'));
      expect(menu).toMatch(/Duolingo/);
      expect(menu).toMatch(/manual/i);
      expect(DASHBOARD_HTML).toContain('id="syncBtn" class="btn btn-p side-sync" onclick="doSync()" aria-describedby="syncScopeHint"');
      expect(DASHBOARD_HTML).toContain('id="syncScopeHint"');
    });
  });
});
