import { describe, it, expect } from "vitest";
import vm from "node:vm";
import { DASHBOARD_HTML } from "../src/frontend.ts";
import CLIENT_CSS from "../src/dashboard.client.css";
import { createDashboardRuntime, emptyAccountPayload } from "./helpers/dom.ts";

const settle = async () => { for (let i = 0; i < 300; i++) await Promise.resolve(); };
const run = (rt: any, expr: string) => vm.runInContext(expr, rt.sandbox);
const text = (rt: any, sel: string): string => String(rt.getEl(sel).textContent);
const html = (rt: any, sel: string): string => String(rt.getEl(sel).innerHTML);

describe("Fase 2 - Análisis (Patrones, cobertura y evidencia navegable)", () => {
  describe("1. Ajedrez: posición, patrones y cobertura Stockfish", () => {
    it("shouldContainChessPatternsCardAndEngineProfileDetailsInsideChessTab", () => {
      expect(DASHBOARD_HTML).toContain('id="chessPatternsCard"');
      expect(DASHBOARD_HTML).toContain('id="chessPatternColorCard"');
      expect(DASHBOARD_HTML).toContain('id="chessPatternOppCard"');
      expect(DASHBOARD_HTML).toContain('id="chessPatternEngineCard"');
      expect(DASHBOARD_HTML).toContain('id="chessEngineProfileDetails"');

      const chessSection = DASHBOARD_HTML.slice(
        DASHBOARD_HTML.indexOf('id="chessTab"'),
        DASHBOARD_HTML.indexOf('id="langTab"'),
      );
      expect(chessSection).toContain('id="chessPatternsCard"');
      expect(chessSection).toContain('id="chessEngineProfileDetails"');
      expect(chessSection).toContain('id="profileKpis"');
      expect(chessSection).toContain('id="profilePhases"');
      expect(chessSection).toContain('id="profileReviewCard"');
    });

    it("shouldRenderColorAndOpponentSynthesisWithWilsonCIsAndExplicitSampleSizes", () => {
      const rt = createDashboardRuntime("/chess");
      const summary = { games: 60, winRate: 0.65, scoreRate: 0.68 };
      const color = {
        groups: [
          { key: "white", games: 25, decided: 25, winRate: 0.68, winRateCi: { lower: 0.48, upper: 0.83 } },
          { key: "black", games: 35, decided: 35, winRate: 0.62, winRateCi: { lower: 0.45, upper: 0.77 } },
        ],
        difference: { diff: 0.06, lower: -0.18, upper: 0.30 },
      };
      const opponents = {
        macro: [
          { key: "bot", games: 51, winRate: 0.66, winRateCi: { lower: 0.53, upper: 0.78 } },
          { key: "pvp", games: 9, winRate: 0.55, winRateCi: { lower: 0.23, upper: 0.83 } },
        ],
      };
      const timeline = {
        snapshots: [{ createdAt: "2026-10-30T10:00:00Z", elo: 900 }],
      };

      run(rt, `renderChessPatterns(${JSON.stringify(summary)}, ${JSON.stringify(color)}, ${JSON.stringify(opponents)}, ${JSON.stringify(timeline)})`);

      const colVal = text(rt, "#chessPatternColorVal");
      const colMeta = text(rt, "#chessPatternColorMeta");
      // Individual Wilson CIs must be visible in colVal
      expect(colVal).toContain("Blancas 68.0% [48–83]");
      expect(colVal).toContain("Negras 62.0% [45–77]");
      // Sample size and difference CI must be in colMeta
      expect(colMeta).toContain("n=60");
      expect(colMeta).toContain("25/35 decididas");
      expect(colMeta).toContain("Dif: +6.0 pp · IC95 [−18, +30]");

      const oppVal = text(rt, "#chessPatternOppVal");
      const oppMeta = text(rt, "#chessPatternOppMeta");
      expect(oppVal).toContain("Bots 66,0 %");
      expect(oppVal).toContain("PvP 55,0 %");
      expect(oppMeta).toContain("Bots n=51");
      expect(oppMeta).toContain("PvP n=9");
      expect(oppMeta).toContain("muestra pequeña; incertidumbre visible");
    });

    it("shouldFormatStockfishCoverageWithExplicitDenominatorAndNeverBorrowDateFromEloSnapshot", () => {
      const rt = createDashboardRuntime("/chess");
      const summary = { games: 100 };
      const timeline = { snapshots: [{ createdAt: "2026-10-30T14:00:00Z", elo: 1000 }] };
      const color = { groups: [] };
      const opponents = { macro: [] };

      // Case 1: Pending analysis (0 analysed games)
      run(rt, `renderChessPatterns(${JSON.stringify(summary)}, ${JSON.stringify(color)}, ${JSON.stringify(opponents)}, ${JSON.stringify(timeline)})`);
      run(rt, `updateChessEngineCoverage({ analysed: 0 }, 100)`);
      expect(text(rt, "#chessEngineCoverageVal")).toBe("0 de 100 partidas analizadas (0 %)");
      expect(text(rt, "#chessEngineCoverageMeta")).toContain("Análisis pendiente");
      expect(text(rt, "#chessEngineCoverageMeta")).toContain("Denominador: 100 partidas guardadas en el historial (elegibles para análisis)");

      // Case 2: Partial analysis without its own date - MUST NOT borrow date from ELO snapshot
      run(rt, `updateChessEngineCoverage({ analysed: 42 }, 100)`);
      expect(text(rt, "#chessEngineCoverageVal")).toBe("42 de 100 partidas analizadas (42.0 %)");
      expect(text(rt, "#chessEngineCoverageMeta")).toBe("Denominador: 100 partidas guardadas en el historial (elegibles para análisis)");
      expect(text(rt, "#chessEngineCoverageMeta")).not.toContain("observado");

      // Case 3: Analysis with explicit observation date from engine profile payload
      run(rt, `updateChessEngineCoverage({ analysed: 42, observedAt: "2026-11-02T10:00:00Z" }, 100)`);
      expect(text(rt, "#chessEngineCoverageMeta")).toBe("Denominador: 100 partidas guardadas en el historial (elegibles para análisis) · observado 2026-11-02");
    });

    it("shouldPreserveProfileRouteNavigationWithoutLeavingTwoActivePanelsSimultaneously", () => {
      const rt = createDashboardRuntime("/profile");
      expect(rt.getEl("#tabBtnProfile").className).toBe("side-item active");
      expect(rt.getEl("#tabBtnProfile").getAttribute("aria-current")).toBe("page");
      // Exactly one panel active: #chessTab is visible and active; #profileTab is kept hidden
      expect(rt.getEl("#chessTab").hidden).toBe(false);
      expect(rt.getEl("#chessTab").classList.contains("active")).toBe(true);
      expect(rt.getEl("#profileTab").hidden).toBe(true);
      expect(rt.getEl("#profileTab").classList.contains("active")).toBe(false);
      expect(rt.getEl("#chessEngineProfileDetails").open).toBe(true);
    });
  });

  describe("2. Evidencia navegable", () => {
    it("shouldFilterMatchesAndScrollWhenColorChipsAreClicked", () => {
      const rt = createDashboardRuntime("/chess");
      let scrolledCard = false;
      rt.getEl("#allMatchesCard").scrollIntoView = () => { scrolledCard = true; };

      expect(DASHBOARD_HTML).toContain('data-chip="color:white"');
      expect(DASHBOARD_HTML).toContain('data-chip="color:black"');

      run(rt, `filterMatchesAndScroll('color', 'white')`);
      expect(run(rt, "chip.color")).toBe("white");
      expect(scrolledCard).toBe(true);

      scrolledCard = false;
      run(rt, `filterMatchesAndScroll('color', 'black')`);
      expect(run(rt, "chip.color")).toBe("black");
      expect(scrolledCard).toBe(true);
    });

    it("shouldFilterMatchesAndScrollWhenOpponentChipsAreClicked", () => {
      const rt = createDashboardRuntime("/chess");
      let scrolledCard = false;
      rt.getEl("#allMatchesCard").scrollIntoView = () => { scrolledCard = true; };

      expect(DASHBOARD_HTML).toContain('data-chip="type:pvp"');
      expect(DASHBOARD_HTML).toContain('data-chip="type:bot"');

      run(rt, `filterMatchesAndScroll('type', 'pvp')`);
      expect(run(rt, "chip.type")).toBe("pvp");
      expect(scrolledCard).toBe(true);

      scrolledCard = false;
      run(rt, `filterMatchesAndScroll('type', 'bot')`);
      expect(run(rt, "chip.type")).toBe("bot");
      expect(scrolledCard).toBe(true);
    });

    it("shouldIssueApiMatchesRequestsWithExpectedFilterQueryParams", async () => {
      const requests: string[] = [];
      const fetchApi = async (url: string) => {
        requests.push(url);
        if (url.startsWith("/api/matches")) {
          return { ok: true, status: 200, json: async () => ({ rows: [], total: 0, compact: false }) };
        }
        return { ok: true, status: 200, json: async () => emptyAccountPayload(url) };
      };
      const rt = createDashboardRuntime("/chess", undefined, fetchApi);
      await settle();

      run(rt, `filterMatchesAndScroll('color', 'white')`);
      await settle();
      expect(requests.some((u) => u.startsWith("/api/matches") && u.includes("color=white"))).toBe(true);

      run(rt, `filterMatchesAndScroll('type', 'pvp')`);
      await settle();
      expect(requests.some((u) => u.startsWith("/api/matches") && u.includes("opponentType=pvp"))).toBe(true);
    });

    it("shouldProvideDirectOpenGameActionForSuggestedReviewMatchesWithoutHtmlInjectionRisk", () => {
      const rt = createDashboardRuntime("/chess");
      let openedGameId = "";
      rt.sandbox.openGame = (id: string) => { openedGameId = id; };

      const profile = {
        analysed: 10,
        review: {
          worst: [{ matchId: 'game_malicious"onclick=alert(1)', opponent: "Stockfish 8", serious: 4, acpl: 250 }],
        },
      };

      run(rt, `updateChessPatternSuggested(${JSON.stringify(profile)})`);
      const suggestedEl = rt.getEl("#chessPatternSuggested");
      expect(suggestedEl.textContent).toContain("Partida sugerida para revisión: ");

      // Test safe DOM click execution
      const btn = suggestedEl.children[0];
      expect(btn).toBeDefined();
      expect(btn?.tagName).toBe("BUTTON");
      expect(btn?.textContent).toBe("Revisar vs Stockfish 8 (4 errores graves)");
      if (btn && btn.onclick) btn.onclick();
      expect(openedGameId).toBe('game_malicious"onclick=alert(1)');
    });
  });

  describe("3. Idiomas: separar conceptos (avance, estructura y actividad)", () => {
    const courses = [
      { courseId: "XC_ES", title: "Inglés desde Español", xp: 5000, fromLanguage: "es", learningLanguage: "en" },
      { courseId: "XB_EN", title: "Alemán desde Inglés", xp: 2000, fromLanguage: "en", learningLanguage: "de" },
    ];
    const baseLangs = { totalXp: 7000, currentCourseId: "XC_ES", courses };

    it("shouldRenderCurricularProgressWhenStrictComparabilityHoldsWithDeltaTotalUnitsZero", () => {
      const rt = createDashboardRuntime("/languages");
      const analytics = {
        curriculum: {
          totalCourses: 2,
          recentDeltas: [
            { courseId: "XC_ES", status: "comparable", deltaCompletedUnits: 3, deltaTotalUnits: 0 },
            { courseId: "XB_EN", status: "comparable", deltaCompletedUnits: 0, deltaTotalUnits: 0 },
          ],
        },
      };

      run(rt, `renderLanguagesView(${JSON.stringify(baseLangs)}, ${JSON.stringify(analytics)}, { summaries: [] }, null)`);

      expect(text(rt, "#langCurricularProgressDetail")).toBe(
        "+3 unidades completadas en Inglés desde Español (mismo árbol curricular: denominador idéntico)"
      );
      expect(text(rt, "#langCourseStructureDetail")).toBe(
        "Árbol curricular estable sin cambios estructurales en los cursos observados"
      );
    });

    it("shouldNotPresentNullOrNonZeroDeltaTotalUnitsAsCurricularProgress", () => {
      const rt = createDashboardRuntime("/languages");
      // Case A: deltaTotalUnits is null (unknown, not verified zero)
      const analyticsNull = {
        curriculum: {
          totalCourses: 2,
          recentDeltas: [
            { courseId: "XC_ES", status: "comparable", deltaCompletedUnits: 5, deltaTotalUnits: null },
          ],
        },
      };

      run(rt, `renderLanguagesView(${JSON.stringify(baseLangs)}, ${JSON.stringify(analyticsNull)}, { summaries: [] }, null)`);
      expect(text(rt, "#langCurricularProgressDetail")).toBe(
        "Sin observaciones curriculares con denominador idéntico (no se calcula avance)"
      );

      // Case B: structural change (deltaTotalUnits != 0)
      const analyticsStructural = {
        curriculum: {
          totalCourses: 2,
          recentDeltas: [
            { courseId: "XC_ES", status: "structural_change", deltaCompletedUnits: 5, deltaTotalUnits: 10 },
            { courseId: "XB_EN", status: "insufficient_observation" },
          ],
        },
      };

      run(rt, `renderLanguagesView(${JSON.stringify(baseLangs)}, ${JSON.stringify(analyticsStructural)}, { summaries: [] }, null)`);
      expect(text(rt, "#langCurricularProgressDetail")).toBe(
        "Sin observaciones curriculares con denominador idéntico (no se calcula avance)"
      );
      expect(text(rt, "#langCourseStructureDetail")).toBe(
        "1 curso(s) con CAMBIO ESTRUCTURAL en el árbol curricular (variación en total de unidades; progreso no comparable)"
      );
    });

    it("shouldClearlyDifferentiateAccountActivityFromCurricularProgressAndCompetence", () => {
      const rt = createDashboardRuntime("/languages");
      const todayIso = new Date().toISOString().slice(0, 10);
      const xpData = {
        summaries: [{ date: todayIso, gainedXp: 120 }],
      };
      const analytics = {
        curriculum: { totalCourses: 2, recentDeltas: [] },
      };

      run(rt, `renderLanguagesView(${JSON.stringify(baseLangs)}, ${JSON.stringify(analytics)}, ${JSON.stringify(xpData)}, null)`);

      const actText = text(rt, "#langAccountActivityDetail");
      expect(actText).toContain("+120 XP hoy (cuenta)");
      expect(actText).toContain("No refleja competencia lingüística");
      expect(DASHBOARD_HTML).toContain("CUENTA · NO ES COMPETENCIA");
    });
  });
});
