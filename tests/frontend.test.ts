import { describe, it, expect } from "vitest";
import vm from "node:vm";
import {
  DASHBOARD_HTML,
  formatMatchDate,
  renderHeroCard,
  renderProgressBar,
  renderDistributionBar,
  renderActivityStrip,
  renderMethodologyDisclosure,
  escapeHtml
} from "../src/frontend.ts";
import { getElementHtmlById, createDashboardRuntime } from "./helpers/dom.ts";

describe("dashboard otros course names", () => {
  it("shouldMapKnownCoursePrefixesToHumanNames", () => {
    expect(DASHBOARD_HTML).toMatch(/CHESS:\s*['"]Chess['"]/);
    expect(DASHBOARD_HTML).toMatch(/MUSIC:\s*['"]Música['"]/);
    expect(DASHBOARD_HTML).toMatch(/MATH:\s*['"]Matemáticas['"]/);
  });

  it("shouldFallBackToTitleOrIdForUnknownPrefix", () => {
    expect(DASHBOARD_HTML).toMatch(/friendlyOtherName/);
    // fallback branch must reference c.title and c.id, not just the prefix map
    const fnBody = DASHBOARD_HTML.match(/function friendlyOtherName\(c\)\{([\s\S]*?)\}/)?.[1] ?? "";
    expect(fnBody).toMatch(/c\.title/);
    expect(fnBody).toMatch(/c\.id/);
  });
});

describe("dashboard tabs", () => {
  it("shouldHaveChessAndLanguageTabPanels", () => {
    expect(DASHBOARD_HTML).toMatch(/id="chessTab"/);
    expect(DASHBOARD_HTML).toMatch(/id="langTab"/);
    expect(DASHBOARD_HTML).toMatch(/class="tab-panel[^"]*active/); // one panel starts active
  });

  it("shouldReadInitialTabFromLocationHashSynchronously", () => {
    expect(DASHBOARD_HTML).toMatch(/function showTab\(/);
    expect(DASHBOARD_HTML).toMatch(/function initTab\(\)\{[\s\S]*?location\.hash/);
    // initTab must run at script load, not inside init()'s async fetch chain
    const initFnBody = DASHBOARD_HTML.match(/async function init\(\)\{([\s\S]*?)\n\}/)?.[1] ?? "";
    expect(initFnBody).not.toMatch(/initTab/);
    // initTab() must actually be invoked at script top level
    expect(DASHBOARD_HTML).toMatch(/\ninitTab\(\);/);
  });

  it("shouldNormalizeAnyTabNameToOverviewLanguagesOrChess", () => {
    const fnBody = DASHBOARD_HTML.match(/function showTab\(name\)\{([\s\S]*?)\n\}/)?.[1] ?? "";
    // showTab must not trust its argument verbatim into the URL/hash
    expect(fnBody).toMatch(/const tab\s*=\s*\(name\s*===\s*['"]languages['"]\s*\|\|\s*name\s*===\s*['"]chess['"]\)\s*\?\s*name\s*:\s*['"]overview['"]/);
    expect(fnBody).toMatch(/history\.replaceState\(null,\s*'',\s*targetPath\)/);
  });
});

describe("dashboard 3-tab navigation", () => {
  it("shouldHaveOverviewLanguagesAndChessTabPanels", () => {
    expect(DASHBOARD_HTML).toMatch(/id="overviewTab"/);
    expect(DASHBOARD_HTML).toMatch(/id="langTab"/);
    expect(DASHBOARD_HTML).toMatch(/id="chessTab"/);
  });

  it("shouldNormalizeTabNamesToOverviewLanguagesOrChess", () => {
    expect(DASHBOARD_HTML).toMatch(/showTab\(name\)/);
    expect(DASHBOARD_HTML).toMatch(/overview|languages|chess/);
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

  it("shouldDefineRenderOverviewFunction", () => {
    expect(DASHBOARD_HTML).toMatch(/function renderOverview\(/);
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

  it("shouldDefineRenderLanguagesViewFunction", () => {
    expect(DASHBOARD_HTML).toMatch(/function renderLanguagesView\(/);
  });

  it("shouldPrioritizeCurricularProgressionAndIsolateAccountXpInLongitudinalPanel", () => {
    expect(DASHBOARD_HTML).toMatch(/Cambio curricular observado:/);
    expect(DASHBOARD_HTML).toMatch(/Actividad reciente \(cuenta\):/);
    expect(DASHBOARD_HTML).toMatch(/totalCourses\)?\s*\|\|\s*courses\.length/);
    expect(DASHBOARD_HTML).not.toMatch(/courses\.length\s*\|\|\s*13/);
  });

  it("shouldFallbackToCurriculumAnalyticsInHeroCardWhenDetailMissing", () => {
    expect(DASHBOARD_HTML).toMatch(/activeTotal\s*===\s*0\s*&&\s*analytics\s*&&\s*analytics\.curriculum/);
  });

  it("shouldDefensivelyGuardUndefinedCompletedUnitsWhenComputingRatio", () => {
    expect(DASHBOARD_HTML).toMatch(/const comp\s*=\s*s\.completedUnits\s*\|\|\s*0;\s*const ratio\s*=\s*s\.totalUnits\s*\?\s*\(comp\s*\/\s*s\.totalUnits\)/);
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

  it("shouldDefineRenderChessViewFunction", () => {
    expect(DASHBOARD_HTML).toMatch(/function renderChessView\(/);
  });

  it("shouldMergeIncomingStatsIntoLastChessStatsWithoutDiscardingCache", () => {
    expect(DASHBOARD_HTML).toMatch(/if\(stats\)\s*lastChessStats\s*=\s*Object\.assign\(lastChessStats\s*\|\|\s*\{\},\s*stats\)/);
    expect(DASHBOARD_HTML).toMatch(/const st\s*=\s*lastChessStats\s*\|\|\s*stats\s*\|\|\s*\{\}/);
  });

  it("shouldUpdateMatchesSubtitleConditionedOnCompactMode", () => {
    const fnBody = DASHBOARD_HTML.match(/function renderChessView\(stats,\s*matches\)\{([\s\S]*?)\n\}/)?.[1] ?? "";
    expect(fnBody).toMatch(/compact\s*\?\s*['"]Partidas recientes \(['"]\s*\+\s*Math\.min\(10,\s*mList\.length\)\s*\+\s*['"] mostradas\)['"]\s*:\s*['"]Todas las partidas \(50 por página\)['"]/);
  });

  it("shouldUpdateHeroStreakPillClassBasedOnStreakKind", () => {
    const fnBody = DASHBOARD_HTML.match(/function renderChessView\(stats,\s*matches\)\{([\s\S]*?)\n\}/)?.[1] ?? "";
    expect(fnBody).toMatch(/elHeroStreak\.className\s*=\s*['"]pill['"]\s*\+\s*\(s\.currentStreak\s*\?\s*\(s\.currentStreakKind\s*===\s*['"]loss['"]\s*\?\s*['"] pill-loss['"]\s*:\s*['"] pill-win['"]\)\s*:\s*['"]['"]\)/);
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
  it("shouldDefaultToTenRowsWithAnExpandButton", () => {
    expect(DASHBOARD_HTML).toMatch(/let compact\s*=\s*true/);
    expect(DASHBOARD_HTML).toMatch(/compact\s*\?\s*10\s*:\s*50/);
    expect(DASHBOARD_HTML).toMatch(/function showAllMatches\(\)/);
    expect(DASHBOARD_HTML).toMatch(/id="btnAllMatches"/);
  });

  it("shouldHideFiltersAndPagerUntilExpanded", () => {
    expect(DASHBOARD_HTML).toMatch(/id="matchFilters"[^>]*style="display:none"/);
    expect(DASHBOARD_HTML).toMatch(/id="matchPager"[^>]*style="display:none"/);
  });

  it("shouldDerivePagerStepFromASinglePageSizeSource", () => {
    // pager buttons must not hardcode a page size that can drift from the fetch limit
    expect(DASHBOARD_HTML).not.toMatch(/onclick="loadM\(off[+-]50\)"/);
    expect(DASHBOARD_HTML).toMatch(/onclick="prevPage\(\)"/);
    expect(DASHBOARD_HTML).toMatch(/onclick="nextPage\(\)"/);
    expect(DASHBOARD_HTML).toMatch(/function pageSize\(\)\{\s*return compact\s*\?\s*10\s*:\s*50;\s*\}/);
    expect(DASHBOARD_HTML).toMatch(/function prevPage\(\)\{\s*loadM\(off-pageSize\(\)\);\s*\}/);
    expect(DASHBOARD_HTML).toMatch(/function nextPage\(\)\{\s*loadM\(off\+pageSize\(\)\);\s*\}/);
    // the disabled check must use the same pageSize(), not a hardcoded 50
    expect(DASHBOARD_HTML).toMatch(/q\('#next'\)\.disabled=\s*off\+pageSize\(\)\s*>=\s*d\.total/);
  });
});

describe("dashboard path progress", () => {
  it("shouldRenderSectionDetailBehindNativeDetails", () => {
    const renderLangBody = DASHBOARD_HTML.match(/function renderLang\(d\)\{([\s\S]*?)\n\}/)?.[1] ?? "";
    expect(renderLangBody).toMatch(/<details/);
    expect(renderLangBody).toMatch(/<summary/);
  });

  it("shouldSkipActiveLevelBarWhenNoActiveSection", () => {
    const renderLangBody = DASHBOARD_HTML.match(/function renderLang\(d\)\{([\s\S]*?)\n\}/)?.[1] ?? "";
    // the active-level block must be conditional on `act`, not rendered unconditionally
    expect(renderLangBody).toMatch(/act\s*\?/);
  });
});

describe("dashboard chess refresh", () => {
  it("shouldLoadChessDashboardOnInit", () => {
    expect(DASHBOARD_HTML).toMatch(/async function loadChessDashboard\(\)\{/);
    const initBody = DASHBOARD_HTML.match(/async function init\(\)\{([\s\S]*?)\n\}/)?.[1] ?? "";
    expect(initBody).toMatch(/await loadChessDashboard\(\)/);
  });
});

describe("dashboard rival search", () => {
  it("shouldSendSearchQueryToServerWhenTypingRival", () => {
    const loadMBody = DASHBOARD_HTML.match(/async function loadM\(o\)\{([\s\S]*?)\n\}/)?.[1] ?? "";
    expect(loadMBody).toMatch(/p\.set\('q',/);
    const onSearchLine = DASHBOARD_HTML.match(/function onSearch\(\)\{[^\n]*/)![0];
    expect(onSearchLine).toMatch(/loadM\(0\)/);
  });

  it("shouldNotFilterLoadedPageOnClientWhenSearching", () => {
    const renderRowsBody = DASHBOARD_HTML.match(/function renderRows\(\)\{([\s\S]*?)\n\}[\s\S]*?async function loadM/)?.[1] ?? "";
    expect(renderRowsBody).not.toMatch(/\.filter\(/);
    expect(DASHBOARD_HTML).not.toMatch(/qFilter/);
  });
});

describe("dashboard chips", () => {
  it("shouldSendChipParamsToServerWhenLoadingMatches", () => {
    const loadMBody = DASHBOARD_HTML.match(/async function loadM\(o\)\{([\s\S]*?)\n\}/)?.[1] ?? "";
    expect(loadMBody).toMatch(/chip\.type/);
    expect(loadMBody).toMatch(/p\.set\('opponentType',chip\.type\)/);
    expect(loadMBody).toMatch(/p\.set\('result',chip\.result\)/);
    expect(loadMBody).toMatch(/p\.set\('color',chip\.color\)/);
  });

  it("shouldReloadFirstPageWhenTogglingChip", () => {
    const setChipLine = DASHBOARD_HTML.match(/function setChip\(group,value[^\n]*/)![0];
    expect(setChipLine).toMatch(/loadM\(0\)/);
  });

  it("shouldShowChipsOutsideHiddenFilters", () => {
    expect(DASHBOARD_HTML).toMatch(/id="matchChips"/);
    const chipsPos = DASHBOARD_HTML.indexOf('id="matchChips"');
    const hiddenPos = DASHBOARD_HTML.indexOf('id="matchFilters"');
    expect(chipsPos).toBeLessThan(hiddenPos);
    expect(DASHBOARD_HTML).toMatch(/Todos/);
  });

  it("shouldResetChipsWhenClearingFilters", () => {
    const clearFBody = DASHBOARD_HTML.match(/function clearF\(\)\{[^\n]*/)![0];
    expect(clearFBody).toMatch(/setChip\('type',''(,[^)]*)?\)/);
    expect(clearFBody).toMatch(/setChip\('result',''(,[^)]*)?\)/);
    expect(clearFBody).toMatch(/setChip\('color',''(,[^)]*)?\)/);
  });

  it("shouldTriggerSingleLoadWhenClearingFilters", () => {
    const clearFBody = DASHBOARD_HTML.match(/function clearF\(\)\{[^\n]*/)![0];
    // setChip(group,value) fires loadM(0); a silent third arg must suppress it
    expect(DASHBOARD_HTML).toMatch(/function setChip\(group,value,[^)]*\)/);
    const setChipLine = DASHBOARD_HTML.match(/function setChip\(group,value,[^\n]*/)![0];
    expect(setChipLine).toMatch(/loadM\(0\)/);
    // loadM(0) must be conditional on silent — an unconditional loadM(0) would still pass the call-shape asserts above
    expect(setChipLine).toMatch(/if\s*\(\s*!silent\s*\)\s*loadM\(0\)/);
    // first two chip resets must be silent, last one fires the single loadM(0)
    const silentResets = (clearFBody.match(/setChip\('(?:type|result|color)','',\s*true\)/g) ?? []).length;
    expect(silentResets).toBe(2);
    const directLoads = (clearFBody.match(/loadM\(0\)/g) ?? []).length;
    const loudResets = (clearFBody.match(/setChip\([^)]*\)/g) ?? []).filter((c) => !c.includes("true")).length;
    expect(directLoads + loudResets).toBe(1);
  });

  it("shouldNotKeepLegacyFilterSelects", () => {
    expect(DASHBOARD_HTML).not.toMatch(/id="fType"/);
    expect(DASHBOARD_HTML).not.toMatch(/id="fRes"/);
    expect(DASHBOARD_HTML).not.toMatch(/id="fCol"/);
    expect(DASHBOARD_HTML).not.toMatch(/q\('#fType'\)/);
  });
});

describe("dashboard WR gap and ELO wording", () => {
  it("shouldHeadlineWhiteBlackWinRateGapWhenBothGroupsExist", () => {
    expect(DASHBOARD_HTML).toMatch(/id="colDiff"/);
    const dashBody = DASHBOARD_HTML.match(/async function loadChessDashboard\(\)\{([\s\S]*?)\n\}/)?.[1] ?? "";
    expect(dashBody).toMatch(/colDiff/);
    expect(dashBody).toMatch(/winRate/);
  });

  it("shouldFormatColDiffWithExplicitSignHandlingWithoutDoubleSign", () => {
    const fnBody = DASHBOARD_HTML.match(/function renderChessView\(stats,\s*matches\)\{([\s\S]*?)\n\}/)?.[1] ?? "";
    expect(fnBody).toMatch(/diff\s*>\s*0\s*\?\s*['"]\+['"]\s*:\s*['"]['"]/);
    expect(DASHBOARD_HTML).not.toMatch(/→\s*\+\s*['"]\s*\+\s*\(\(wh\.winRate/);
  });

  it("shouldLabelEloAsSyncObserved", () => {
    expect(DASHBOARD_HTML).toMatch(/ELO observado en sincronizaciones/);
    expect(DASHBOARD_HTML).not.toMatch(/ELO observado por snapshot/);
  });

  it("shouldKeepPvpSampleSizeVisible", () => {
    const oppBody = DASHBOARD_HTML.match(/function renderCompare\(groups, totalGames\)\{([\s\S]*?)\n\}/)?.[1] ?? "";
    expect(oppBody).toMatch(/g\.games/);
  });
});

describe("dashboard languages sync feedback", () => {
  it("shouldShowALanguagesTabSyncTimestamp", () => {
    expect(DASHBOARD_HTML).toMatch(/id="langSyncMeta"/);
    const renderLangBody = DASHBOARD_HTML.match(/function renderLang\(d\)\{([\s\S]*?)\n\}/)?.[1] ?? "";
    expect(renderLangBody).toMatch(/langSyncMeta/);
  });

  it("shouldBaseTheSyncTimestampOnTheSnapshotCreatedAtNotJustActivityDate", () => {
    // "Sincronizado" must reflect when the snapshot was actually captured (d.createdAt,
    // returned by /api/stats/lang), not just the last day with xp_summaries activity —
    // those are different facts and conflating them was the bug being fixed here.
    const renderLangBody = DASHBOARD_HTML.match(/function renderLang\(d\)\{([\s\S]*?)\n\}/)?.[1] ?? "";
    expect(renderLangBody).toMatch(/'Sincronizado '\+relDate\(d\.createdAt\)/);
    expect(renderLangBody).toMatch(/Actividad hasta/);
  });
});

describe("dashboard UX-PR2 hierarchy and reading", () => {
  it("shouldLabelEloDeltaExplicitlyVsFirstSnapshot", () => {
    const dashBody = DASHBOARD_HTML.match(/async function loadChessDashboard\(\)\{([\s\S]*?)\n\}/)?.[1] ?? "";
    expect(dashBody).toMatch(/vs primer snapshot/);
  });

  it("shouldExpressRecentFormDifferenceInPercentagePoints", () => {
    const formBody = DASHBOARD_HTML.match(/function renderForm\(r\)\{([\s\S]*?)\n\}/)?.[1] ?? "";
    expect(formBody).toMatch(/pp\s+WR\s+vs\s+anteriores/);
    expect(formBody).toMatch(/pp\s+score\s+vs\s+anteriores/);
  });

  it("shouldOnlyRenderRecentColorSplitIfBothColorsHaveGames", () => {
    const formBody = DASHBOARD_HTML.match(/function renderForm\(r\)\{([\s\S]*?)\n\}/)?.[1] ?? "";
    // Must guard that both colors exist and have games > 0
    expect(formBody).toMatch(/wh\.games\s*>\s*0\s*&&\s*bl\.games\s*>\s*0/);
  });

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

  it("shouldRenderFormatMatchDateInDashboardHtmlRows", () => {
    expect(DASHBOARD_HTML).toMatch(/function formatMatchDate\(/);
    const renderRowsBody = DASHBOARD_HTML.match(/function renderRows\(\)\{([\s\S]*?)\n\}/)?.[1] ?? "";
    expect(renderRowsBody).toMatch(/formatMatchDate\(m\.played_at,\s*m\.first_seen_at\)/);
  });

  it("shouldIncludeFullDateInTitleAttributeWhenPlayedAtIsSet", () => {
    const renderRowsBody = DASHBOARD_HTML.match(/function renderRows\(\)\{([\s\S]*?)\n\}/)?.[1] ?? "";
    expect(renderRowsBody).toMatch(/title=/);
    expect(renderRowsBody).toMatch(/m\.played_at\s*\?\s*new Date\(m\.played_at \* 1000\)\.toLocaleString\('es-ES'\)/);
    expect(renderRowsBody).toMatch(/data-l="Fecha"'\s*\+\s*\(fullDate \? ' title="' \+ fullDate \+ '"' : ''\)/);
  });
});

describe("dashboard end condition context and filter", () => {
  it("shouldIncludeLossAndDrawContextContainersInResultsCard", () => {
    const resCard = DASHBOARD_HTML.match(/<div class="card" id="resCard">[\s\S]*?<\/div>\s*<\/div>/)?.[0] ?? "";
    expect(resCard).toMatch(/id="lossContext"/);
    expect(resCard).toMatch(/id="drawContext"/);
  });

  it("shouldRenderLossAndDrawBreakdownFromResults", () => {
    const dashBody = DASHBOARD_HTML.match(/async function loadChessDashboard\(\)\{([\s\S]*?)\n\}/)?.[1] ?? "";
    expect(dashBody).toMatch(/endConditions/);
    expect(dashBody).toMatch(/#lossContext/);
    expect(dashBody).toMatch(/#drawContext/);
    expect(dashBody).toMatch(/ahogados/);
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

  it("shouldSendEndConditionParamInLoadMatches", () => {
    const loadMBody = DASHBOARD_HTML.match(/async function loadM\(o\)\{([\s\S]*?)\n\}/)?.[1] ?? "";
    expect(loadMBody).toMatch(/p\.set\('endCondition',/);
    expect(loadMBody).toMatch(/#fEnd/);
  });

  it("shouldResetEndConditionFilterWhenClearingFilters", () => {
    const clearFBody = DASHBOARD_HTML.match(/function clearF\(\)\{[^\n]*/)![0];
    expect(clearFBody).toMatch(/q\('#fEnd'\)\.value\s*=\s*''/);
  });

  it("shouldRenderEndConditionBadgeInMatchRows", () => {
    const tblHead = DASHBOARD_HTML.match(/<table class="tbl"><thead><tr>([\s\S]*?)<\/tr><\/thead>/)?.[1] ?? "";
    expect(tblHead).toMatch(/<th>Fin<\/th>/);
    const renderRowsBody = DASHBOARD_HTML.match(/function renderRows\(\)\{([\s\S]*?)\n\}/)?.[1] ?? "";
    expect(renderRowsBody).toMatch(/data-l="Fin"/);
    expect(renderRowsBody).toMatch(/m\.end_condition/);
  });
});

describe("dashboard opponent segmentation and filter", () => {
  it("shouldDisplayOpponentsByFamilyHeaderAndMacroContainerInOppCard", () => {
    const oppCard = DASHBOARD_HTML.match(/<div class="card" id="oppCard">[\s\S]*?<\/div>\s*<\/div>/)?.[0] ?? "";
    expect(oppCard).toMatch(/Oponentes por familia/);
    expect(oppCard).toMatch(/id="oppMacro"/);
  });

  it("shouldRenderMacroSummaryAndSegmentsInOppCard", () => {
    const dashBody = DASHBOARD_HTML.match(/async function loadChessDashboard\(\)\{([\s\S]*?)\n\}/)?.[1] ?? "";
    expect(dashBody).toMatch(/o\.macro/);
    expect(dashBody).toMatch(/o\.segments/);
    expect(dashBody).toMatch(/#oppMacro/);
  });

  it("shouldIncludePvpSmallSampleSizeIndicatorInRenderCompare", () => {
    const oppBody = DASHBOARD_HTML.match(/function renderCompare\(groups, totalGames\)\{([\s\S]*?)\n\}/)?.[1] ?? "";
    expect(oppBody).toMatch(/muestra pequeña/);
    expect(oppBody).toMatch(/n=/);
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

  it("shouldSendOpponentSegmentOrTypeParamInLoadMatches", () => {
    const loadMBody = DASHBOARD_HTML.match(/async function loadM\(o\)\{([\s\S]*?)\n\}/)?.[1] ?? "";
    expect(loadMBody).toMatch(/#fOpp/);
    expect(loadMBody).toMatch(/opponentSegment/);
    expect(loadMBody).toMatch(/p\.set\('opponentSegment'/);
  });

  it("shouldResetOpponentFilterWhenClearingFilters", () => {
    const clearFBody = DASHBOARD_HTML.match(/function clearF\(\)\{[^\n]*/)![0];
    expect(clearFBody).toMatch(/q\('#fOpp'\)\.value\s*=\s*''/);
  });

  it("shouldRenderOpponentSegmentBadgeInMatchRows", () => {
    expect(DASHBOARD_HTML).toMatch(/function pillSegment\(/);
    const renderRowsBody = DASHBOARD_HTML.match(/function renderRows\(\)\{([\s\S]*?)\n\}/)?.[1] ?? "";
    expect(renderRowsBody).toMatch(/m\.opponent_segment/);
    expect(renderRowsBody).toMatch(/pillSegment/);
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

  it("shouldFetchAndRenderOpeningsInLoadChessDashboard", () => {
    const dashBody = DASHBOARD_HTML.match(/async function loadChessDashboard\(\)\{([\s\S]*?)\n\}/)?.[1] ?? "";
    expect(dashBody).toMatch(/api\/stats\/openings/);
    expect(dashBody).toMatch(/openingsCard|#openingsCard/);
  });

  it("shouldRenderOpeningsWithRenderCompare", () => {
    const dashBody = DASHBOARD_HTML.match(/async function loadChessDashboard\(\)\{([\s\S]*?)\n\}/)?.[1] ?? "";
    expect(dashBody).toMatch(/renderCompare/);
  });
});

describe("dashboard phases card", () => {
  it("shouldHavePhasesCardInHtml", () => {
    expect(DASHBOARD_HTML).toMatch(/id="phasesCard"/);
  });

  it("shouldFetchAndRenderPhasesInLoadChessDashboard", () => {
    const dashBody = DASHBOARD_HTML.match(/async function loadChessDashboard\(\)\{([\s\S]*?)\n\}/)?.[1] ?? "";
    expect(dashBody).toMatch(/api\/stats\/phases/);
    expect(dashBody).toMatch(/phasesCard|#phasesCard/);
  });

  it("shouldShowMedianPliesInPhasesCard", () => {
    const dashBody = DASHBOARD_HTML.match(/async function loadChessDashboard\(\)\{([\s\S]*?)\n\}/)?.[1] ?? "";
    expect(dashBody).toMatch(/medianPlies/);
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

  it("shouldSendPhaseAndOpeningParamsInLoadMatches", () => {
    const loadMBody = DASHBOARD_HTML.match(/async function loadM\(o\)\{([\s\S]*?)\n\}/)?.[1] ?? "";
    expect(loadMBody).toMatch(/#fPhase/);
    expect(loadMBody).toMatch(/p\.set\('phase',/);
    expect(loadMBody).toMatch(/#fOpening/);
    expect(loadMBody).toMatch(/p\.set\('opening',/);
  });

  it("shouldPopulateOpeningFilterFromOpeningStatsGroupedByColor", () => {
    expect(DASHBOARD_HTML).toMatch(/function populateOpeningFilter\(op\)/);
    expect(DASHBOARD_HTML).toMatch(/op\.white/);
    expect(DASHBOARD_HTML).toMatch(/op\.black/);
    expect(DASHBOARD_HTML).toMatch(/fOpening/);
  });

  it("shouldResetPhaseAndOpeningFiltersWhenClearing", () => {
    const clearFBody = DASHBOARD_HTML.match(/function clearF\(\)\{[^\n]*/)?.[0] ?? "";
    expect(clearFBody).toMatch(/q\('#fPhase'\)\.value\s*=\s*''/);
    expect(clearFBody).toMatch(/q\('#fOpening'\)\.value\s*=\s*''/);
  });
});

describe("dashboard phase and opening badges in match rows", () => {
  it("shouldRenderPhaseAndOpeningBadgesInMatchRows", () => {
    const renderRowsBody = DASHBOARD_HTML.match(/function renderRows\(\)\{([\s\S]*?)\n\}/)?.[1] ?? "";
    expect(renderRowsBody).toMatch(/m\.phase_key/);
    expect(renderRowsBody).toMatch(/m\.opening_key/);
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
    expect(css480).toMatch(/\.elo-hero\s+b\s*\{[^}]*font-size:\s*22px/);
    expect(css480).toMatch(/\.kpi\s*\{[^}]*padding:\s*10px\s+12px/);
    expect(css480).toMatch(/\.card\s*\{[^}]*padding:\s*12px/);
  });

  it("shouldInitializeTabsSynchronouslyFromLocationHashWithoutException", () => {
    const initTabBody = DASHBOARD_HTML.match(/function initTab\(\)\{([\s\S]*?)\n\}/)?.[1] ?? "";
    expect(initTabBody).toMatch(/location\.hash/);
    expect(initTabBody).toMatch(/showTab\(/);
    expect(DASHBOARD_HTML).toMatch(/function showTab\(name\)\{([\s\S]*?)\n\}/);
    expect(DASHBOARD_HTML).toMatch(/initTab\(\);/);
  });
});

describe("dashboard UI primitives behavioral tests", () => {
  describe("renderDistributionBar", () => {
    it("shouldCalculateAccurateProportionsForKnownWinLossDraw", () => {
      const html = renderDistributionBar({
        wins: 30,
        losses: 15,
        draws: 5,
        label: "Win rate (50 partidas)",
        meta: "30W · 15L · 5D"
      });
      expect(html).toContain('class="distribution-bar"');
      expect(html).toContain('style="width:60.0%"');
      expect(html).toContain('style="width:30.0%"');
      expect(html).toContain('style="width:10.0%"');
      expect(html).toContain('title="30W · 15L · 5D (50 partidas)"');
      expect(html).toContain("Win rate (50 partidas)");
      expect(html).toContain("30W · 15L · 5D");
    });

    it("shouldSafelyHandleZeroGamesWithoutZeroDivisionOrNan", () => {
      const html = renderDistributionBar({ wins: 0, losses: 0, draws: 0 });
      expect(html).not.toContain("NaN");
      expect(html).not.toContain("Infinity");
      expect(html).toContain('style="width:0%"');
      expect(html).toContain('title="0W · 0L · 0D (0 partidas)"');
    });
  });

  describe("renderProgressBar", () => {
    it("shouldCalculateAccuratePercentageForCurricularUnits", () => {
      const html = renderProgressBar({ current: 33, total: 300, label: "Progreso curricular" });
      expect(html).toContain("Progreso curricular");
      expect(html).toContain("33 / 300 unidades (11.0%)");
      expect(html).toContain('style="width:11.0%"');
    });

    it("shouldClampPercentageTo100WhenCurrentExceedsTotal", () => {
      const html = renderProgressBar({ current: 350, total: 300 });
      expect(html).toContain('style="width:100.0%"');
    });

    it("shouldReturnZeroPercentWhenTotalIsZeroWithoutNan", () => {
      const html = renderProgressBar({ current: 0, total: 0 });
      expect(html).not.toContain("NaN");
      expect(html).toContain('style="width:0%"');
    });

    it("shouldOmitPercentageWhenShowPercentIsFalse", () => {
      const html = renderProgressBar({ label: "Progreso", current: 10, total: 20, showPercent: false });
      expect(html).not.toContain("(50.0%)");
      expect(html).toContain("10 / 20 unidades");
    });
  });

  describe("renderHeroCard", () => {
    it("shouldRenderFullHeroCardWithProgressAndMeta", () => {
      const html = renderHeroCard({
        id: "testHero",
        title: "Curso Activo",
        badge: '<span class="pill pill-win">ACTIVO</span>',
        primary: "Francés",
        secondary: "Desde Español",
        progress: { current: 33, total: 300, label: "Unidades completadas" },
        meta: "Sincronizado hoy"
      });
      expect(html).toContain('id="testHero"');
      expect(html).toContain("Curso Activo");
      expect(html).toContain("Francés");
      expect(html).toContain("Desde Español");
      expect(html).toContain("ACTIVO");
      expect(html).toContain("Unidades completadas");
      expect(html).toContain("33 / 300 unidades (11.0%)");
      expect(html).toContain("Sincronizado hoy");
    });

    it("shouldRenderMinimalHeroCardWithoutProgressOrMeta", () => {
      const html = renderHeroCard({
        primary: "Overview"
      });
      expect(html).toContain("Overview");
      expect(html).not.toContain("progress-bar");
      expect(html).not.toContain("border-top");
    });
  });

  describe("renderActivityStrip", () => {
    it("shouldRenderSevenDayDotsWithCorrectActiveStatusAndTooltips", () => {
      const days = [
        { date: "2026-09-23", dayLetter: "X", active: true, color: "#2ea043", bottomLabel: "549", tooltip: "2026-09-23: 549 XP" },
        { date: "2026-09-24", dayLetter: "J", active: false, bottomLabel: "—" },
      ];
      const html = renderActivityStrip({ id: "testStrip", label: "Actividad", summary: "549 XP · 1 día", days });
      expect(html).toContain('id="testStrip"');
      expect(html).toContain("Actividad");
      expect(html).toContain("549 XP · 1 día");
      expect(html).toContain("background:#2ea043");
      expect(html).toContain("background:#1e2e44");
      expect(html).toContain("549");
      expect(html).toContain("title=\"2026-09-23: 549 XP\"");
    });
  });

  describe("renderMethodologyDisclosure", () => {
    it("shouldRenderDisclosureAccordionWithItemsAndLinks", () => {
      const html = renderMethodologyDisclosure({
        id: "testMethod",
        title: "¿Cómo sabemos esto?",
        items: [
          { term: "D1 snapshots", desc: "Datos inmutables observados." }
        ],
        links: [
          { href: "/raw", text: "Datos técnicos", target: "_blank" }
        ]
      });
      expect(html).toContain('id="testMethod"');
      expect(html).toContain("<details class=\"methodology-disclosure\"");
      expect(html).toContain("¿Cómo sabemos esto?");
      expect(html).toContain("<b>D1 snapshots:</b> Datos inmutables observados.");
      expect(html).toContain('href="/raw"');
      expect(html).toContain('target="_blank"');
    });
  });

  describe("escapeHtml", () => {
    it("shouldEscapeSpecialHtmlCharacters", () => {
      expect(escapeHtml("<script>alert(\"xss\")&</script>")).toBe("&lt;script&gt;alert(&quot;xss&quot;)&amp;&lt;/script&gt;");
    });

    it("shouldHandleNullAndUndefinedGracefully", () => {
      expect(escapeHtml(null)).toBe("");
      expect(escapeHtml(undefined)).toBe("");
    });
  });

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

  it("shouldDefineResolveSelectedCourseIdFunctionWith3TierHierarchy", () => {
    expect(DASHBOARD_HTML).toMatch(/function resolveSelectedCourseId\(/);
    expect(DASHBOARD_HTML).toMatch(/longitudinal_selected_course/);
    const fnBody = DASHBOARD_HTML.match(/function resolveSelectedCourseId\([^)]*\)\{([\s\S]*?)\n\}/)?.[1] ?? "";
    expect(fnBody).toMatch(/courses\[0\]/);
    expect(fnBody).toMatch(/localStorage/);
  });

  it("shouldExcludeDuolingoCurrentCourseIdFromUiSelectionFallback", () => {
    const fnBody = DASHBOARD_HTML.match(/function resolveSelectedCourseId\([^)]*\)\{([\s\S]*?)\n\}/)?.[1] ?? "";
    expect(fnBody).not.toMatch(/currentCourseId/);
  });

  it("shouldNotHaveActivoBadgeInLangCatalogRendering", () => {
    const rvBody = DASHBOARD_HTML.match(/function renderLanguagesView\([\s\S]*?\n\}\n/)?.[0] ?? "";
    expect(rvBody).not.toMatch(/pill-win[^"]*">ACTIVO/);
  });

  it("shouldHavePillSelectedBadgeInTemplate", () => {
    expect(DASHBOARD_HTML).toMatch(/pill-selected/);
  });

  it("shouldUseResolveSelectedCourseIdInLoadLanguagesDashboard", () => {
    const loadBody = DASHBOARD_HTML.match(/async function loadLanguagesDashboard\(\)\{([\s\S]*?)\n\}/)?.[1] ?? "";
    expect(loadBody).toMatch(/resolveSelectedCourseId/);
  });

  it("shouldLabelOverviewLangCardWithCursoDestacadoNotCursoActivo", () => {
    const overviewCard = DASHBOARD_HTML.match(/id="overviewLangCard"[\s\S]*?id="overviewChessCard"/)?.[0] ?? "";
    expect(overviewCard).not.toMatch(/Curso Activo/);
  });
});

describe("course selection bidirectional sync and selectCourse", () => {
  it("shouldDefineSelectCourseFunctionInScript", () => {
    expect(DASHBOARD_HTML).toMatch(/function selectCourse\(/);
  });

  it("shouldHaveLangCourseSelectWithOnchangeSelectCourse", () => {
    expect(DASHBOARD_HTML).toMatch(/id="langCourseSelect"[^>]*onchange="selectCourse\(this\.value\)"/);
  });

  it("shouldDefineCourseDetailCacheForMemoization", () => {
    expect(DASHBOARD_HTML).toMatch(/courseDetailCache/);
  });

  it("shouldPersistSelectionToLocalStorageInSelectCourse", () => {
    const fn = DASHBOARD_HTML.match(/function selectCourse\([^)]*\)\{([\s\S]*?)\n\}/)?.[1] ?? "";
    expect(fn).toMatch(/localStorage/);
    expect(fn).toMatch(/longitudinal_selected_course/);
  });

  it("shouldUpdateUrlWithHistoryReplaceStateInSelectCourse", () => {
    const fn = DASHBOARD_HTML.match(/function selectCourse\([^)]*\)\{([\s\S]*?)\n\}/)?.[1] ?? "";
    expect(fn).toMatch(/history\.replaceState|replaceState/);
  });

  it("shouldRenderClickableCatalogRowsWithSelectCourseOnclick", () => {
    const rvBody = DASHBOARD_HTML.match(/function renderLanguagesView\([\s\S]*?\n\}\n/)?.[0] ?? "";
    expect(rvBody).toMatch(/selectCourse\(/);
    expect(rvBody).toMatch(/pill-selected/);
  });
});

describe("Overview reflects selectedCourseId, not duolingoCurrentCourseId (audit fix)", () => {
  it("shouldResolveSelectedCourseIdInLoadOverviewDashboardInsteadOfCurrentCourseId", () => {
    const fnBody = DASHBOARD_HTML.match(/async function loadOverviewDashboard\(\)\{([\s\S]*?)\n\}/)?.[1] ?? "";
    expect(fnBody).toMatch(/resolveSelectedCourseId/);
    expect(fnBody).not.toMatch(/langs\.currentCourseId/);
  });

  it("shouldFindActiveCourseBySelectedCourseIdInRenderOverview", () => {
    const fnBody = DASHBOARD_HTML.match(/function renderOverview\(data\)\{([\s\S]*?)\n\}\n/)?.[0] ?? "";
    expect(fnBody).toMatch(/selectedCourseId/);
    expect(fnBody).not.toMatch(/activeCid\s*=\s*langs\?\.currentCourseId/);
  });

  it("shouldShareOneCourseProgressFunctionBetweenOverviewAndLanguages", () => {
    expect(DASHBOARD_HTML).toMatch(/function getCourseProgress\(/);
    const overviewLangCardBody = DASHBOARD_HTML.match(/function renderOverviewLangCard\([\s\S]*?\n\}\n/)?.[0] ?? "";
    const langBody = DASHBOARD_HTML.match(/function renderLanguagesView\([\s\S]*?\n\}\n/)?.[0] ?? "";
    expect(overviewLangCardBody).toMatch(/getCourseProgress\(/);
    expect(langBody).toMatch(/getCourseProgress\(/);
    // the two previously-duplicated "sum a single active course's sections" loops must be gone from the callers
    expect(DASHBOARD_HTML.match(/function getCourseProgress\(/g)?.length).toBe(1);
    expect(DASHBOARD_HTML).not.toMatch(/for\(const s of actDetail\.sections\)/);
    expect(DASHBOARD_HTML).not.toMatch(/for\(const s of data\.activeDetail\.sections\)/);
  });

  it("shouldNotHardcodeAFakeSyncStatusInOverviewSyncMeta", () => {
    const fnBody = DASHBOARD_HTML.match(/function renderOverview\(data\)\{([\s\S]*?)\n\}\n/)?.[0] ?? "";
    expect(fnBody).not.toMatch(/Pulso unificado y verificado por dominio/);
  });

  it("shouldShowPerDomainSyncStatusInOverview", () => {
    const fnBody = DASHBOARD_HTML.match(/function renderOverview\(data\)\{([\s\S]*?)\n\}\n/)?.[0] ?? "";
    expect(fnBody).toMatch(/Idiomas/);
    expect(fnBody).toMatch(/Ajedrez/);
  });

  it("shouldRefreshOverviewLangCardLiveWhenSelectCourseRunsWithoutReload", () => {
    // selectCourse() is called while the user stays in the SPA (no reload); Overview's
    // already-rendered DOM must be patched too, not just Languages'.
    expect(DASHBOARD_HTML).toMatch(/function renderOverviewLangCard\(/);
    const overviewBody = DASHBOARD_HTML.match(/function renderOverview\(data\)\{([\s\S]*?)\n\}\n/)?.[0] ?? "";
    expect(overviewBody).toMatch(/renderOverviewLangCard\(/);
    const selectCourseBody = DASHBOARD_HTML.match(/async function selectCourse\([^)]*\)\{([\s\S]*?)\n\}/)?.[1] ?? "";
    expect(selectCourseBody).toMatch(/renderOverviewLangCard\(/);
  });
});

describe("Languages consultation-pattern audit fixes", () => {
  describe("Finding A: curriculum stability synthesis must not conflate insufficient_observation with stable", () => {
    it("shouldNotLabelAnyDeltaStatusAsEstableInTheSynthesisComputation", () => {
      const rvBody = DASHBOARD_HTML.match(/function renderLanguagesView\([\s\S]*?\n\}\n/)?.[0] ?? "";
      expect(rvBody).not.toMatch(/estables/);
      expect(rvBody).not.toMatch(/stableCount/);
    });

    it("shouldComputeSeparateCountsForComparableStructuralAndInsufficientStatuses", () => {
      const rvBody = DASHBOARD_HTML.match(/function renderLanguagesView\([\s\S]*?\n\}\n/)?.[0] ?? "";
      expect(rvBody).toMatch(/status\s*===\s*['"]comparable['"]/);
      expect(rvBody).toMatch(/status\s*===\s*['"]structural_change['"]/);
      expect(rvBody).toMatch(/status\s*===\s*['"]insufficient_observation['"]/);
    });

    it("shouldSurfaceInsufficientObservationCountInTheSynthesisText", () => {
      const rvBody = DASHBOARD_HTML.match(/function renderLanguagesView\([\s\S]*?\n\}\n/)?.[0] ?? "";
      expect(rvBody).toMatch(/observación insuficiente/);
    });
  });

  describe("Finding B: account-level XP must be labeled 'cuenta' wherever shown next to a course context", () => {
    it("shouldNotRenderAccountDailyXpInCourseHeroCard", () => {
      const rvBody = DASHBOARD_HTML.match(/function renderLanguagesView\([\s\S]*?\n\}\n/)?.[0] ?? "";
      expect(rvBody).not.toMatch(/xpTodayStr/);
      expect(rvBody).not.toMatch(/XP hoy/);
      // the course-scoped XP must remain distinctly labeled as "curso", not blended into the account figure
      expect(rvBody).toMatch(/XP acumulado en el curso/);
    });

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
    it("shouldListenForHashchangeAndReRunInitTab", () => {
      expect(DASHBOARD_HTML).toMatch(/addEventListener\(\s*['"]hashchange['"]\s*,\s*initTab\s*\)/);
    });

    it("shouldMarkInactivePanelsWithNativeHiddenAttributeForAssistiveTech", () => {
      const fnBody = DASHBOARD_HTML.match(/function showTab\(name\)\{([\s\S]*?)\n\}/)?.[1] ?? "";
      expect(fnBody).toMatch(/q\('#overviewTab'\)\.hidden\s*=\s*tab\s*!==?\s*['"]overview['"]/);
      expect(fnBody).toMatch(/q\('#langTab'\)\.hidden\s*=\s*tab\s*!==?\s*['"]languages['"]/);
      expect(fnBody).toMatch(/q\('#chessTab'\)\.hidden\s*=\s*tab\s*!==?\s*['"]chess['"]/);
    });

    it("shouldMarkTheMobileCardLabelGeneratedContentAsDecorativeSoItNeverReachesAssistiveTech", () => {
      // content: attr(data-l) alone leaks into the accessibility tree even when the whole
      // panel is display:none/hidden (observed in Chromium a11y snapshots at mobile widths).
      // The CSS alt-text syntax (content / "") is the standards-based way to mark generated
      // content as decorative so it's never exposed as accessible text.
      expect(DASHBOARD_HTML).toMatch(/\.tbl td::before\{content:attr\(data-l\)\s*\/\s*""/);
    });
  });

  describe("empty curricular progress must read as an explicit system state, not a bare dash", () => {
    it("shouldExplainMissingProgressInOverviewLangCard", () => {
      const fnBody = DASHBOARD_HTML.match(/function renderOverviewLangCard\([\s\S]*?\n\}\n/)?.[0] ?? "";
      expect(fnBody).not.toMatch(/elLangUnits\.textContent\s*=\s*'—'/);
      expect(fnBody).toMatch(/Sin observación/);
    });

    it("shouldExplainMissingProgressInLanguagesDetailView", () => {
      const fnBody = DASHBOARD_HTML.match(/function renderLanguagesView\([\s\S]*?\n\}\n/)?.[0] ?? "";
      expect(fnBody).not.toMatch(/elProg\.textContent\s*=\s*'—'/);
      expect(fnBody).toMatch(/Sin observación/);
    });
  });

  describe("longitudinal comparability card must account for every catalogued course, not just the ones with 2+ Path observations", () => {
    it("shouldListCoursesMissingFromRecentDeltasAsWaitingForASecondObservation", () => {
      const fnBody = DASHBOARD_HTML.match(/function renderLanguagesAnalytics\([\s\S]*?\n\}\n/)?.[0] ?? "";
      expect(fnBody).toMatch(/deltaByCourse/);
      expect(fnBody).toMatch(/esperando 2ª observación/i);
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

  it("shouldNotRenderAccountDailyXPInCourseHeroCardInsideRenderLanguagesView", () => {
    const fnBody = DASHBOARD_HTML.match(/function renderLanguagesView\([\s\S]*?\n\}\n/)?.[0] ?? "";
    expect(fnBody).not.toMatch(/xpTodayStr/);
    expect(fnBody).not.toMatch(/XP hoy/);
    expect(fnBody).toMatch(/XP acumulado en el curso/);
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


