import { describe, it, expect } from "vitest";
import vm from "node:vm";
import { DASHBOARD_HTML } from "../src/frontend.ts";
import { getElementHtmlById, createDashboardRuntime } from "./helpers/dom.ts";

// The browser's own formatMatchDate, evaluated in the dashboard script's context.
const formatMatchDateRuntime = createDashboardRuntime("/overview");
const formatMatchDate = (playedAt?: number | null, firstSeenAt?: string | null): string =>
  vm.runInContext(`formatMatchDate(${JSON.stringify(playedAt)}, ${JSON.stringify(firstSeenAt)})`, formatMatchDateRuntime.sandbox);

describe("dashboard tabs", () => {
  it("shouldHaveChessAndLanguageTabPanels", () => {
    expect(DASHBOARD_HTML).toMatch(/id="chessTab"/);
    expect(DASHBOARD_HTML).toMatch(/id="langTab"/);
    expect(DASHBOARD_HTML).toMatch(/class="tab-panel[^"]*active/); // one panel starts active
  });

});

describe("dashboard 3-tab navigation", () => {
  it("shouldHaveOverviewLanguagesAndChessTabPanels", () => {
    expect(DASHBOARD_HTML).toMatch(/id="overviewTab"/);
    expect(DASHBOARD_HTML).toMatch(/id="langTab"/);
    expect(DASHBOARD_HTML).toMatch(/id="chessTab"/);
  });

  it("shouldHaveSharedDesignSystemCssClasses", () => {
    expect(DASHBOARD_HTML).toMatch(/\.hero-card/);
    expect(DASHBOARD_HTML).toMatch(/\.activity-strip/);
    expect(DASHBOARD_HTML).toMatch(/\.progress-bar/);
    expect(DASHBOARD_HTML).toMatch(/\.distribution-bar/);
    expect(DASHBOARD_HTML).toMatch(/\.methodology-disclosure/);
  });
});

describe("dashboard overview view", () => {
  it("shouldRenderVerifiedActivityHeroAndStreakInOverview", () => {
    expect(DASHBOARD_HTML).toMatch(/id="overviewHero"/);
    expect(DASHBOARD_HTML).toMatch(/id="overviewStreak"/);
    expect(DASHBOARD_HTML).toMatch(/id="overviewSyncMeta"/);
  });

  it("shouldRenderDomainSummaryCardsWithDirectLinks", () => {
    expect(DASHBOARD_HTML).toMatch(/showTab\('languages'\)/);
    expect(DASHBOARD_HTML).toMatch(/showTab\('chess'\)/);
  });

  it("shouldRenderIndependentWeeklyStripsInOverview", () => {
    expect(DASHBOARD_HTML).toMatch(/id="overviewLangWeek"/);
    expect(DASHBOARD_HTML).toMatch(/id="overviewChessWeek"/);
  });

});

describe("dashboard languages view hierarchy", () => {
  it("shouldRenderActiveCourseHeroCardWithUnitsProgress", () => {
    expect(DASHBOARD_HTML).toMatch(/id="langCourseHero"/);
    expect(DASHBOARD_HTML).toMatch(/id="langAccountCard"/);
  });

  it("shouldRenderObservedChangesSectionForLongitudinal", () => {
    expect(DASHBOARD_HTML).toMatch(/Cambios observados/i);
    // must distinguish "comparable, no structural change" from "insufficient_observation" — never claim "estable"
    expect(DASHBOARD_HTML).toMatch(/cursos comparables sin cambio estructural/i);
  });

  it("shouldRenderMethodologyDisclosureInLanguages", () => {
    expect(DASHBOARD_HTML).toMatch(/¿Cómo sabemos esto\?/);
    expect(DASHBOARD_HTML).toMatch(/ΔtotalUnits\s*=\s*0/);
  });

  it("shouldLabelTheLongitudinalPanelAsCurricularChangeAndAccountActivity", () => {
    expect(DASHBOARD_HTML).toMatch(/Cambio curricular observado:/);
    expect(DASHBOARD_HTML).toMatch(/Actividad reciente \(cuenta\):/);
  });

});

describe("dashboard chess view hierarchy", () => {
  it("shouldRenderChessHeroCardWithEloAndDistributionBar", () => {
    expect(DASHBOARD_HTML).toMatch(/id="chessHero"/);
  });

  it("shouldRenderColorPerformanceBeforeRecentMatches", () => {
    const html = DASHBOARD_HTML;
    const colorIdx = html.indexOf('Rendimiento por color');
    const matchesIdx = html.indexOf('Partidas recientes');
    expect(colorIdx).toBeGreaterThan(0);
    expect(matchesIdx).toBeGreaterThan(colorIdx);
  });

  it("shouldRenderMethodologyDisclosureInChess", () => {
    expect(DASHBOARD_HTML).toMatch(/id="chessMethodology"/);
    expect(DASHBOARD_HTML).toMatch(/Result\/Outcome/);
  });

});

describe("dashboard /raw placement", () => {
  it("shouldNotLinkToRawFromTheHeader", () => {
    const header = DASHBOARD_HTML.match(/<header>[\s\S]*?<\/header>/)?.[0] ?? "";
    expect(header).not.toMatch(/\/raw/);
  });

  it("shouldStillLinkToRawSomewhereOnThePage", () => {
    expect(DASHBOARD_HTML).toMatch(/href="\/raw"/);
  });
});

describe("dashboard compact matches table", () => {
  it("shouldHideFiltersAndPagerUntilExpanded", () => {
    expect(DASHBOARD_HTML).toMatch(/id="matchFilters"[^>]*style="display:none"/);
    expect(DASHBOARD_HTML).toMatch(/id="matchPager"[^>]*style="display:none"/);
  });
});

describe("dashboard chips", () => {
  it("shouldShowChipsOutsideHiddenFilters", () => {
    expect(DASHBOARD_HTML).toMatch(/id="matchChips"/);
    const chipsPos = DASHBOARD_HTML.indexOf('id="matchChips"');
    const hiddenPos = DASHBOARD_HTML.indexOf('id="matchFilters"');
    expect(chipsPos).toBeLessThan(hiddenPos);
    expect(DASHBOARD_HTML).toMatch(/Todos/);
  });

  it("shouldNotKeepLegacyFilterSelects", () => {
    expect(DASHBOARD_HTML).not.toMatch(/id="fType"/);
    expect(DASHBOARD_HTML).not.toMatch(/id="fRes"/);
    expect(DASHBOARD_HTML).not.toMatch(/id="fCol"/);
    expect(DASHBOARD_HTML).not.toMatch(/q\('#fType'\)/);
  });
});

describe("dashboard WR gap and ELO wording", () => {

  it("shouldLabelEloAsSyncObserved", () => {
    expect(DASHBOARD_HTML).toMatch(/ELO observado en sincronizaciones/);
    expect(DASHBOARD_HTML).not.toMatch(/ELO observado por snapshot/);
  });

});


describe("dashboard UX-PR2 hierarchy and reading", () => {

  it("shouldDemoteOpponentEloToACollapsibleDetailsBlock", () => {
    expect(DASHBOARD_HTML).toMatch(/<details[^>]*id="eloDetails"/);
    expect(DASHBOARD_HTML).toMatch(/<summary[^>]*>[\s\S]*?ELO del rival/);
  });

  it("shouldHaveDescriptiveColorAndOpponentComparisonSectionHeaderNotAPerformanceClaim", () => {
    // "¿Dónde rindes diferente?" frames a descriptive win-rate comparison as a claim about
    // player performance; opponent-family win rate is confounded by opponent strength, which
    // the data can't isolate. The header must stay descriptive.
    expect(DASHBOARD_HTML).not.toMatch(/¿Dónde rindes diferente\?/);
    expect(DASHBOARD_HTML).toMatch(/Comparativa por color y oponente/);
  });

  it("shouldCaveatOpponentFamilyCardAboutOpponentDifficultyConfoundWithoutTouchingColorCard", () => {
    const oppCard = DASHBOARD_HTML.match(/<div class="card" id="oppCard">[\s\S]*?<\/div>\s*<\/div>/)?.[0] ?? "";
    expect(oppCard).toMatch(/no aíslan la dificultad del rival/);
    const colCard = DASHBOARD_HTML.match(/<div class="card" id="colCard">[\s\S]*?<\/div>\s*<\/div>/)?.[0] ?? "";
    expect(colCard).not.toMatch(/no aíslan la dificultad del rival/);
    expect(colCard).toMatch(/Rendimiento por color/);
  });

  it("shouldIncludeCompactMobileStylesForSmallScreens", () => {
    expect(DASHBOARD_HTML).toMatch(/@media\s*\(\s*max-width:\s*(?:480|375)px\s*\)/);
  });
});

describe("dashboard match date/time formatting", () => {
  it("shouldFormatPlayedAtWithDateAndTime", () => {
    // 1790000000 = Sep 2026
    const formatted = formatMatchDate(1790000000, "2026-09-20T14:13:20.000Z");
    expect(formatted).toMatch(/·/);
    expect(formatted).toMatch(/\d{1,2}:\d{2}/);
  });

  it("shouldFallBackToFirstSeenAtWhenPlayedAtIsNull", () => {
    const formatted = formatMatchDate(null, "2026-09-20T14:13:20.000Z");
    expect(formatted).not.toMatch(/·/);
    expect(formatted).not.toBe("—");
  });

  it("shouldFallBackToDashWhenBothAreMissing", () => {
    expect(formatMatchDate(null, null)).toBe("—");
    expect(formatMatchDate(undefined, undefined)).toBe("—");
  });

});

describe("dashboard end condition context and filter", () => {
  it("shouldIncludeLossAndDrawContextContainersInResultsCard", () => {
    const resCard = DASHBOARD_HTML.match(/<div class="card" id="resCard">[\s\S]*?<\/div>\s*<\/div>/)?.[0] ?? "";
    expect(resCard).toMatch(/id="lossContext"/);
    expect(resCard).toMatch(/id="drawContext"/);
  });

  it("shouldIncludeEndConditionFilterSelectWithOptions", () => {
    expect(DASHBOARD_HTML).toMatch(/<select id="fEnd"/);
    const selectHtml = DASHBOARD_HTML.match(/<select id="fEnd"[\s\S]*?<\/select>/)?.[0] ?? "";
    expect(selectHtml).toMatch(/value=""[^>]*>Fin:\s*Todos/);
    expect(selectHtml).toMatch(/value="checkmate"/);
    expect(selectHtml).toMatch(/value="disconnection"/);
    expect(selectHtml).toMatch(/value="stalemate"/);
    expect(selectHtml).toMatch(/value="repetition"/);
    expect(selectHtml).toMatch(/value="resignation"/);
  });

  it("shouldHaveAFinColumnInTheMatchesTable", () => {
    const tblHead = DASHBOARD_HTML.match(/<table class="tbl"><thead><tr>([\s\S]*?)<\/tr><\/thead>/)?.[1] ?? "";
    expect(tblHead).toMatch(/<th>Fin<\/th>/);
  });
});

describe("dashboard opponent segmentation and filter", () => {
  it("shouldDisplayOpponentsByFamilyHeaderAndMacroContainerInOppCard", () => {
    const oppCard = DASHBOARD_HTML.match(/<div class="card" id="oppCard">[\s\S]*?<\/div>\s*<\/div>/)?.[0] ?? "";
    expect(oppCard).toMatch(/Oponentes por familia/);
    expect(oppCard).toMatch(/id="oppMacro"/);
  });

  it("shouldIncludeOpponentFilterSelectWithOptions", () => {
    expect(DASHBOARD_HTML).toMatch(/<select id="fOpp"/);
    const selectHtml = DASHBOARD_HTML.match(/<select id="fOpp"[\s\S]*?<\/select>/)?.[0] ?? "";
    expect(selectHtml).toMatch(/value=""[^>]*>Rival:\s*Todos/);
    expect(selectHtml).toMatch(/value="bot"[^>]*>Bots:\s*Todos/);
    expect(selectHtml).toMatch(/value="seg:noisy_neural"[^>]*>Noisy Neural/);
    expect(selectHtml).toMatch(/value="seg:neural"[^>]*>Neural/);
    expect(selectHtml).toMatch(/value="seg:blended"[^>]*>Blended/);
    expect(selectHtml).toMatch(/value="seg:stockfish"[^>]*>Stockfish/);
    expect(selectHtml).toMatch(/value="seg:pvp"[^>]*>PvP/);
  });

});

describe("dashboard script syntax validity", () => {
  it("shouldParseScriptWithoutSyntaxErrors", () => {
    const scripts = DASHBOARD_HTML.match(/<script>([\s\S]*?)<\/script>/g) ?? [];
    expect(scripts.length).toBeGreaterThan(0);
    for (const s of scripts) {
      const code = s.replace(/<script>/, "").replace(/<\/script>/, "");
      expect(() => new Function(code)).not.toThrow();
    }
  });
});

describe("dashboard openings card", () => {
  it("shouldHaveOpeningsCardWithTabsInHtml", () => {
    expect(DASHBOARD_HTML).toMatch(/id="openingsCard"/);
    expect(DASHBOARD_HTML).toMatch(/Blancas/);
    expect(DASHBOARD_HTML).toMatch(/Negras/);
  });

});

describe("dashboard phases card", () => {
  it("shouldHavePhasesCardInHtml", () => {
    expect(DASHBOARD_HTML).toMatch(/id="phasesCard"/);
  });

});

describe("dashboard phase and opening filters", () => {
  it("shouldIncludePhaseFilterSelectWithOptions", () => {
    expect(DASHBOARD_HTML).toMatch(/<select id="fPhase"/);
    const selectHtml = DASHBOARD_HTML.match(/<select id="fPhase"[\s\S]*?<\/select>/)?.[0] ?? "";
    expect(selectHtml).toMatch(/value=""[^>]*>Fase:\s*Todas/);
    expect(selectHtml).toMatch(/value="opening"/);
    expect(selectHtml).toMatch(/value="middlegame"/);
    expect(selectHtml).toMatch(/value="endgame"/);
  });

  it("shouldIncludeOpeningFilterSelectWithOptions", () => {
    expect(DASHBOARD_HTML).toMatch(/<select id="fOpening"/);
    const selectHtml = DASHBOARD_HTML.match(/<select id="fOpening"[\s\S]*?<\/select>/)?.[0] ?? "";
    expect(selectHtml).toMatch(/value=""[^>]*>Apertura:\s*Todas/);
  });

  it("shouldPopulateOpeningFilterFromOpeningStatsGroupedByColor", () => {
    expect(DASHBOARD_HTML).toMatch(/function populateOpeningFilter\(op\)/);
    expect(DASHBOARD_HTML).toMatch(/op\.white/);
    expect(DASHBOARD_HTML).toMatch(/op\.black/);
    expect(DASHBOARD_HTML).toMatch(/fOpening/);
  });

});

describe("dashboard smoke test: markup validity, 3 panels, and responsive viewport", () => {
  it("shouldContainValidDoctypeAndProperlyClosedTags", () => {
    expect(DASHBOARD_HTML).toMatch(/^<!doctype html>/i);
    expect(DASHBOARD_HTML).toMatch(/<html lang="es">/);
    expect(DASHBOARD_HTML).toMatch(/<\/html>\s*$/);

    // Sanitize script and style contents to avoid inner JS/CSS strings (<, >) confusing HTML tag parser
    const sanitized = DASHBOARD_HTML
      .replace(/<script[\s\S]*?<\/script>/gi, "<script></script>")
      .replace(/<style[\s\S]*?<\/style>/gi, "<style></style>");

    const voidTags = new Set(["meta", "link", "img", "br", "hr", "input", "col"]);
    const stack: string[] = [];
    const tagRegex = /<\/?([a-zA-Z0-9]+)(\s[^>]*)?\/?>/g;
    let match;
    const errors: string[] = [];

    while ((match = tagRegex.exec(sanitized)) !== null) {
      const full = match[0];
      const tag = match[1]?.toLowerCase();
      if (!tag || voidTags.has(tag) || full.endsWith("/>") || tag === "!doctype") continue;
      if (full.startsWith("</")) {
        const last = stack.pop();
        if (last !== tag) {
          errors.push(`Mismatched closing tag: expected </${last}>, found </${tag}> at index ${match.index}`);
        }
      } else {
        stack.push(tag);
      }
    }

    expect(errors).toEqual([]);
    expect(stack).toEqual([]);
  });

  it("shouldContainValidJavaScriptInsideScriptTag", () => {
    const scriptMatch = DASHBOARD_HTML.match(/<script>([\s\S]*?)<\/script>/i);
    expect(scriptMatch).not.toBeNull();
    const scriptCode = scriptMatch?.[1] ?? "";
    let parseError: unknown = null;
    try {
      new vm.Script(scriptCode);
    } catch (e) {
      parseError = e;
    }
    expect(parseError).toBeNull();
  });

  it("shouldRenderAllThreePanelsWithTheirExpectedSections", () => {
    // 1. Navigation Shell & Tab buttons
    expect(DASHBOARD_HTML).toMatch(/id="tabBtnOverview"/);
    expect(DASHBOARD_HTML).toMatch(/id="tabBtnLang"/);
    expect(DASHBOARD_HTML).toMatch(/id="tabBtnChess"/);

    // 2. Overview Panel & expected sections
    expect(DASHBOARD_HTML).toMatch(/<section id="overviewTab" class="tab-panel active">/);
    expect(DASHBOARD_HTML).toMatch(/id="overviewHero"/);
    expect(DASHBOARD_HTML).toMatch(/id="overviewStreak"/);
    expect(DASHBOARD_HTML).toMatch(/id="overviewSyncMeta"/);
    expect(DASHBOARD_HTML).toMatch(/id="overviewLangCard"/);
    expect(DASHBOARD_HTML).toMatch(/id="overviewChessCard"/);
    expect(DASHBOARD_HTML).toMatch(/id="overviewLangWeekCard"/);
    expect(DASHBOARD_HTML).toMatch(/id="overviewChessWeekCard"/);

    // 3. Languages Panel & expected sections
    expect(DASHBOARD_HTML).toMatch(/<section id="langTab" class="tab-panel">/);
    expect(DASHBOARD_HTML).toMatch(/id="langEmpty"/);
    expect(DASHBOARD_HTML).toMatch(/id="langContent"/);
    expect(DASHBOARD_HTML).toMatch(/id="langGlobalView"/);
    expect(DASHBOARD_HTML).toMatch(/id="langCourseHero"/);
    expect(DASHBOARD_HTML).toMatch(/id="langAccountCard"/);
    expect(DASHBOARD_HTML).toMatch(/id="langSyncMeta"/);
    expect(DASHBOARD_HTML).toMatch(/id="langWeekCard"/);
    expect(DASHBOARD_HTML).toMatch(/id="langCoursesList"/);
    expect(DASHBOARD_HTML).toMatch(/id="langObservedChangesCard"/);
    expect(DASHBOARD_HTML).toMatch(/id="langComparabilityCard"/);
    expect(DASHBOARD_HTML).toMatch(/id="langMethodology"/);
    expect(DASHBOARD_HTML).toMatch(/id="langDetailView"/);
    expect(DASHBOARD_HTML).toMatch(/id="btnBackToLanguages"/);

    // 4. Chess Panel & expected sections
    expect(DASHBOARD_HTML).toMatch(/<section id="chessTab" class="tab-panel">/);
    expect(DASHBOARD_HTML).toMatch(/id="chessHero"/);
    expect(DASHBOARD_HTML).toMatch(/id="chessHeroElo"/);
    expect(DASHBOARD_HTML).toMatch(/id="chessHeroDist"/);
    expect(DASHBOARD_HTML).toMatch(/id="kpis"/);
    expect(DASHBOARD_HTML).toMatch(/id="formCard"/);
    expect(DASHBOARD_HTML).toMatch(/id="colCard"/);
    expect(DASHBOARD_HTML).toMatch(/id="oppCard"/);
    expect(DASHBOARD_HTML).toMatch(/id="openingsCard"/);
    expect(DASHBOARD_HTML).toMatch(/id="phasesCard"/);
    expect(DASHBOARD_HTML).toMatch(/id="evoCard"/);
    expect(DASHBOARD_HTML).toMatch(/id="resCard"/);
    expect(DASHBOARD_HTML).toMatch(/id="eloDetails"/);
    expect(DASHBOARD_HTML).toMatch(/id="allMatchesCard"/);
    expect(DASHBOARD_HTML).toMatch(/id="chessMatchesSubtitle"/);
    expect(DASHBOARD_HTML).toMatch(/id="btnAllMatches"/);
    expect(DASHBOARD_HTML).toMatch(/id="chessMethodology"/);
  });

  it("shouldIncludeResponsiveViewportAndMediaQueries", () => {
    // Viewport meta
    expect(DASHBOARD_HTML).toMatch(/<meta name="viewport" content="width=device-width,initial-scale=1">/);

    // Tablet & mobile media queries
    expect(DASHBOARD_HTML).toMatch(/@media\s*\(\s*max-width:\s*760px\s*\)\s*\{/);
    expect(DASHBOARD_HTML).toMatch(/@media\s*\(\s*max-width:\s*860px\s*\)\s*\{/);
    expect(DASHBOARD_HTML).toMatch(/@media\s*\(\s*max-width:\s*700px\s*\)\s*\{/);
    expect(DASHBOARD_HTML).toMatch(/@media\s*\(\s*max-width:\s*480px\s*\)\s*\{/);

    // Responsive layout rules check
    const cssMatch = DASHBOARD_HTML.match(/<style>([\s\S]*?)<\/style>/i);
    expect(cssMatch).not.toBeNull();
    const css = cssMatch![1];
    expect(css).toMatch(/\.grid2\s*\{[^}]*grid-template-columns:\s*1fr\s+1fr/);
    expect(css).toMatch(/@media\s*\(\s*max-width:\s*860px\s*\)\s*\{[^}]*\.grid2\s*\{[^}]*grid-template-columns:\s*1fr/);
    
    const media480Match = DASHBOARD_HTML.match(/@media\s*\(\s*max-width:\s*480px\s*\)\s*\{([\s\S]*?)\n\}/);
    expect(media480Match).not.toBeNull();
    const css480 = media480Match![1];
    expect(css480).toMatch(/\.kpi\s*\{[^}]*padding:\s*10px\s+12px/);
    expect(css480).toMatch(/\.card\s*\{[^}]*padding:\s*12px/);
  });

});

describe("dashboard UI primitives behavioral tests", () => {
  describe("formatMatchDate", () => {
    it("shouldFormatNumericTimestampCorrectly", () => {
      const formatted = formatMatchDate(1727500000);
      expect(formatted).toMatch(/\d{1,2}\s+[a-záéíóú]+/i);
    });

    it("shouldFallbackToFirstSeenAtWhenPlayedAtIsMissing", () => {
      const formatted = formatMatchDate(null, "2026-09-28T12:00:00Z");
      expect(formatted).toMatch(/\d{1,2}\s+[a-záéíóú]+/i);
    });

    it("shouldReturnDashWhenBothTimestampsAreMissing", () => {
      expect(formatMatchDate(null, null)).toBe("—");
    });
  });
});


describe("course selection decoupling and resolution hierarchy", () => {
  it("shouldHaveLangCourseSelectDropdownInTemplate", () => {
    expect(DASHBOARD_HTML).toMatch(/id="langCourseSelect"/);
  });

  it("shouldUseCursoSeleccionadoInsteadOfCursoActivo", () => {
    expect(DASHBOARD_HTML).toMatch(/Curso seleccionado/);
    const langHeroSection = DASHBOARD_HTML.match(/id="langCourseHero"[\s\S]*?id="langActiveProgress"/)?.[0] ?? "";
    expect(langHeroSection).not.toMatch(/Curso Activo/);
  });

  it("shouldHavePillSelectedBadgeInTemplate", () => {
    expect(DASHBOARD_HTML).toMatch(/pill-selected/);
  });

  it("shouldLabelOverviewLangCardWithCursoDestacadoNotCursoActivo", () => {
    const overviewCard = DASHBOARD_HTML.match(/id="overviewLangCard"[\s\S]*?id="overviewChessCard"/)?.[0] ?? "";
    expect(overviewCard).not.toMatch(/Curso Activo/);
  });
});

describe("course selection bidirectional sync and selectCourse", () => {

  it("shouldHaveLangCourseSelectWithOnchangeSelectCourse", () => {
    expect(DASHBOARD_HTML).toMatch(/id="langCourseSelect"[^>]*onchange="selectCourse\(this\.value\)"/);
  });

});


describe("Languages consultation-pattern audit fixes", () => {

  describe("Finding B: account-level XP must be labeled 'cuenta' wherever shown next to a course context", () => {

    it("shouldLabelWeeklyActivityCardAsCuenta", () => {
      const weekCard = DASHBOARD_HTML.match(/id="langWeekCard"[\s\S]*?<\/div>\s*<\/div>/)?.[0] ?? "";
      expect(weekCard).toMatch(/Actividad de cuenta · últimos 7 días/);
    });

    it("shouldLabelNinetyDayActivityCardAsCuenta", () => {
      const timelineCard = DASHBOARD_HTML.match(/Actividad de cuenta — últimos 90 días[\s\S]{0,20}/)?.[0] ?? "";
      expect(timelineCard).toMatch(/cuenta/);
    });
  });
});

describe("Power User benchmark fixes (2026-09-29)", () => {
  describe("hashchange must re-run tab routing (same-tab hash nav previously left the old panel showing)", () => {

    it("shouldMarkTheMobileCardLabelGeneratedContentAsDecorativeSoItNeverReachesAssistiveTech", () => {
      // content: attr(data-l) alone leaks into the accessibility tree even when the whole
      // panel is display:none/hidden (observed in Chromium a11y snapshots at mobile widths).
      // The CSS alt-text syntax (content / "") is the standards-based way to mark generated
      // content as decorative so it's never exposed as accessible text.
      expect(DASHBOARD_HTML).toMatch(/\.tbl td::before\{content:attr\(data-l\)\s*\/\s*""/);
    });
  });


});

describe("dashboard #16.9.2 strict scope boundary isolation", () => {
  it("shouldEnforcePhysicalCardBoundarySeparationBetweenLangCourseHeroAndLangAccountCard", () => {
    expect(DASHBOARD_HTML).toMatch(/id="langCourseHero"/);
    expect(DASHBOARD_HTML).toMatch(/id="langAccountCard"/);
    const courseHero = getElementHtmlById(DASHBOARD_HTML, "langCourseHero");
    const accountCard = getElementHtmlById(DASHBOARD_HTML, "langAccountCard");
    expect(courseHero).not.toBe("");
    expect(accountCard).not.toBe("");
    expect(courseHero).not.toContain('id="langAccountCard"');
    expect(accountCard).not.toContain('id="langCourseHero"');
  });

  it("shouldStrictlyIsolateCourseElementsInLangCourseHeroWithoutAccountLevelMetrics", () => {
    const courseHero = getElementHtmlById(DASHBOARD_HTML, "langCourseHero");
    expect(courseHero).toContain('id="langCourseSelect"');
    expect(courseHero).toContain('id="langActiveProgress"');
    expect(courseHero).not.toContain('id="langAccountXp"');
    expect(courseHero).not.toContain('id="langAccountStreak"');
    expect(courseHero).not.toContain('id="langAccountDays"');
    expect(courseHero).not.toContain('id="langAccountCourses"');
    expect(courseHero).not.toContain('id="langHeroXp"');
    expect(courseHero).not.toContain('id="langHeroStreak"');
    expect(courseHero).not.toContain('id="langHeroDays"');
    expect(courseHero).not.toContain('id="langHeroCourses"');
  });

  it("shouldStrictlyIsolateAccountElementsInLangAccountCardWithoutCourseLevelElements", () => {
    const accountCard = getElementHtmlById(DASHBOARD_HTML, "langAccountCard");
    expect(accountCard).toContain('id="langAccountXp"');
    expect(accountCard).toContain('id="langAccountStreak"');
    expect(accountCard).toContain('id="langAccountDays"');
    expect(accountCard).toContain('id="langAccountCourses"');
    expect(accountCard).toContain('id="langSyncMeta"');

    // Must NOT contain legacy ambiguous Hero KPI IDs
    expect(accountCard).not.toContain('id="langHeroXp"');
    expect(accountCard).not.toContain('id="langHeroStreak"');
    expect(accountCard).not.toContain('id="langHeroDays"');
    expect(accountCard).not.toContain('id="langHeroCourses"');

    expect(accountCard).not.toContain('id="langCourseSelect"');
    expect(accountCard).not.toContain('id="langActiveProgress"');
  });

  it("shouldDisplayCURSOAndCUENTASemanticScopeAnchors", () => {
    expect(DASHBOARD_HTML).toMatch(/\.pill-scope\b/);
    const courseHero = getElementHtmlById(DASHBOARD_HTML, "langCourseHero");
    expect(courseHero).toMatch(/class="[^"]*pill-scope[^"]*"[^>]*>\s*CURSO\s*</);
    const accountCard = getElementHtmlById(DASHBOARD_HTML, "langAccountCard");
    expect(accountCard).toMatch(/class="[^"]*pill-scope[^"]*"[^>]*>\s*CUENTA\s*</);
  });

  it("shouldDisplayAccountScopeAndMicroDisclosureOnLangWeekCard", () => {
    const weekCard = getElementHtmlById(DASHBOARD_HTML, "langWeekCard");
    expect(weekCard).toContain("Actividad de cuenta · últimos 7 días");
    expect(weekCard).toContain("Incluye actividad de todos los cursos y actividades registradas en la fuente.");
    expect(weekCard).toMatch(/class="[^"]*pill-scope[^"]*"[^>]*>\s*CUENTA\s*</);
  });

  it("shouldDisplayAccountScopeOnOverviewWeekCardOverviewLangWeekCard", () => {
    const overviewWeek = getElementHtmlById(DASHBOARD_HTML, "overviewLangWeekCard");
    expect(overviewWeek).toContain("Cuenta · últimos 7 días");
    expect(overviewWeek).toContain("Actividad global registrada en la cuenta");
  });

});

describe("dashboard #16.9.2 runtime value and scope isolation", () => {
  it("shouldMaintainStrictCourseXPAccountXPValueIsolationAtRuntime", () => {
    const rt = createDashboardRuntime("/languages");
    const langsData = {
      totalXp: 421500,
      streak: 1212,
      currentCourseId: "XB_EN",
      courses: [
        { courseId: "XB_EN", title: "Demo Beta", xp: 94000, fromLanguage: "en", learningLanguage: "xb" },
        { courseId: "XC_ES", title: "Demo Gamma", xp: 45000, fromLanguage: "es", learningLanguage: "xc" },
      ],
    };
    const xpData = {
      summaries: [
        { date: Math.floor(Date.now() / 1000), gainedXp: 5072, numSessions: 89, totalSessionTime: 5220 },
      ],
    };

    rt.renderLanguagesView(langsData, null, xpData, null);

    // 1. Course XP ≠ Account XP
    expect(rt.getEl("#langActiveHeroMeta").textContent).toMatch(/94[.,]?000\s*XP acumulado en el curso/);
    expect(rt.getEl("#langActiveHeroMeta").textContent).not.toMatch(/421[.,]?500/);
    expect(rt.getEl("#langAccountXp").textContent).toMatch(/421[.,]?500\s*XP/);
    expect(rt.getEl("#langAccountXp").textContent).not.toMatch(/94[.,]?000/);
    expect(rt.getEl("#langAccountStreak").textContent).toMatch(/🔥\s*1[.,]?212\s*días/);
    expect(rt.getEl("#langAccountDays").textContent).toBe("1 / 1 días activos");
    expect(rt.getEl("#langAccountCourses").textContent).toBe("2 cursos");
  });

  it("shouldChangeONLYCourseScopedDataWhenSelectingFRESWithoutAlteringAccountMetrics", () => {
    const rt = createDashboardRuntime("/languages");
    const langsData = {
      totalXp: 421500,
      streak: 1212,
      currentCourseId: "XB_EN",
      courses: [
        { courseId: "XB_EN", title: "Demo Beta", xp: 94000, fromLanguage: "en", learningLanguage: "xb" },
        { courseId: "XC_ES", title: "Demo Gamma", xp: 45000, fromLanguage: "es", learningLanguage: "xc" },
      ],
    };
    const xpData = {
      summaries: [
        { date: Math.floor(Date.now() / 1000), gainedXp: 5072, numSessions: 89, totalSessionTime: 5220 },
      ],
    };

    // Initial render: default is XB_EN (max XP)
    rt.renderLanguagesView(langsData, null, xpData, null);
    expect(rt.getEl("#langActiveHeroMeta").textContent).toMatch(/94[.,]?000\s*XP acumulado en el curso/);
    expect(rt.getEl("#langAccountXp").textContent).toMatch(/421[.,]?500\s*XP/);

    // Change route to /languages/XC_ES and re-render
    rt.sandbox.location.pathname = "/languages/XC_ES";
    rt.renderLanguagesView(langsData, null, xpData, null);

    // 2. COURSE metrics reflect Demo Gamma (45,000 XP, ES → XC)
    expect(rt.getEl("#langActiveHeroMeta").textContent).toMatch(/45[.,]?000\s*XP acumulado en el curso/);
    expect(rt.getEl("#langActiveHeroMeta").textContent).toContain("ES → XC");
    expect(rt.getEl("#langActiveHeroMeta").textContent).not.toMatch(/94[.,]?000/);

    // 4. ACCOUNT metrics remain strictly identical
    expect(rt.getEl("#langAccountXp").textContent).toMatch(/421[.,]?500\s*XP/);
    expect(rt.getEl("#langAccountStreak").textContent).toMatch(/🔥\s*1[.,]?212\s*días/);
    expect(rt.getEl("#langAccountDays").textContent).toBe("1 / 1 días activos");
    expect(rt.getEl("#langAccountCourses").textContent).toBe("2 cursos");
  });

  it("shouldChangeONLYCourseScopedDataWhenSwitchingBackToRUEN", () => {
    const rt = createDashboardRuntime("/languages/XC_ES");
    const langsData = {
      totalXp: 421500,
      streak: 1212,
      currentCourseId: "XB_EN",
      courses: [
        { courseId: "XB_EN", title: "Demo Beta", xp: 94000, fromLanguage: "en", learningLanguage: "xb" },
        { courseId: "XC_ES", title: "Demo Gamma", xp: 45000, fromLanguage: "es", learningLanguage: "xc" },
      ],
    };
    const xpData = {
      summaries: [
        { date: Math.floor(Date.now() / 1000), gainedXp: 5072, numSessions: 89, totalSessionTime: 5220 },
      ],
    };

    rt.renderLanguagesView(langsData, null, xpData, null);
    expect(rt.getEl("#langActiveHeroMeta").textContent).toMatch(/45[.,]?000\s*XP acumulado en el curso/);

    // Switch to XB_EN
    rt.sandbox.location.pathname = "/languages/XB_EN";
    rt.renderLanguagesView(langsData, null, xpData, null);

    // 3. COURSE metrics return to Demo Beta
    expect(rt.getEl("#langActiveHeroMeta").textContent).toMatch(/94[.,]?000\s*XP acumulado en el curso/);
    expect(rt.getEl("#langActiveHeroMeta").textContent).toContain("EN → XB");

    // ACCOUNT metrics remain strictly identical
    expect(rt.getEl("#langAccountXp").textContent).toMatch(/421[.,]?500\s*XP/);
    expect(rt.getEl("#langAccountStreak").textContent).toMatch(/🔥\s*1[.,]?212\s*días/);
    expect(rt.getEl("#langAccountDays").textContent).toBe("1 / 1 días activos");
    expect(rt.getEl("#langAccountCourses").textContent).toBe("2 cursos");
  });

  it("shouldNeverDeriveWeeklyOr90DayActivityFromTheSelectedCourse", () => {
    const rt = createDashboardRuntime("/languages");
    const langsData = {
      totalXp: 421500,
      streak: 1212,
      currentCourseId: "XB_EN",
      courses: [
        { courseId: "XB_EN", title: "Demo Beta", xp: 94000, fromLanguage: "en", learningLanguage: "xb" },
        { courseId: "XC_ES", title: "Demo Gamma", xp: 45000, fromLanguage: "es", learningLanguage: "xc" },
      ],
    };
    const now = Math.floor(Date.now() / 1000);
    const xpData = {
      summaries: [
        { date: now, gainedXp: 5072, numSessions: 89, totalSessionTime: 5220 },
      ],
    };

    rt.renderLanguagesView(langsData, null, xpData, null);
    const initialWeekSummary = rt.getEl("#langWeekSummary").textContent;
    expect(initialWeekSummary).toMatch(/5[.,]?072\s*XP/);
    expect(initialWeekSummary).toContain("89 ses");

    // Switch course to XC_ES
    rt.sandbox.location.pathname = "/languages/XC_ES";
    rt.renderLanguagesView(langsData, null, xpData, null);

    // 5. Weekly summary is completely unaffected by course selection
    expect(rt.getEl("#langWeekSummary").textContent).toBe(initialWeekSummary);
    expect(rt.getEl("#langWeekSummary").textContent).toMatch(/5[.,]?072\s*XP/);
  });

  it("shouldEnsureOverviewTabConsumesTheSameAccountLevelSourceForWeeklyActivity", () => {
    const rt = createDashboardRuntime("/overview");
    const langsData = {
      totalXp: 421500,
      streak: 1212,
      currentCourseId: "XB_EN",
      courses: [
        { courseId: "XB_EN", title: "Demo Beta", xp: 94000, fromLanguage: "en", learningLanguage: "xb" },
      ],
    };

    // Ensure selectedCourseId is initialized by resolving view or setting it
    rt.renderLanguagesView(langsData, null, { summaries: [] }, null);
    rt.renderOverviewLangCard(langsData, null);

    // 6. Overview course card shows course selection, while catalog XP reflects total catalog
    expect(rt.getEl("#overviewLangActiveCourse").textContent).toContain("Demo Beta");
    expect(rt.getEl("#overviewLangCatalogXp").textContent).toMatch(/421[.,]?500\s*XP/);
  });
});


