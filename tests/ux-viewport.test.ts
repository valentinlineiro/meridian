import { describe, it, expect } from "vitest";
import { DASHBOARD_HTML } from "../src/frontend.ts";

describe("chess dashboard DOM hierarchy & viewport rules", () => {
  const htmlTemplate = DASHBOARD_HTML.split("<script>")[0];

  it("shouldOrderSectionsLogicallyInChessTab", () => {
    const kpisPos = DASHBOARD_HTML.indexOf('id="kpis"');
    const formCardPos = DASHBOARD_HTML.indexOf('id="formCard"');
    const diffHeaderPos = DASHBOARD_HTML.indexOf("Comparativa por color y oponente");
    const colCardPos = DASHBOARD_HTML.indexOf('id="colCard"');
    const oppCardPos = DASHBOARD_HTML.indexOf('id="oppCard"');
    const evoHeaderPos = DASHBOARD_HTML.indexOf("Evolución & detalle");
    const evoCardPos = DASHBOARD_HTML.indexOf('id="evoCard"');
    const resCardPos = DASHBOARD_HTML.indexOf('id="resCard"');
    const eloDetailsPos = DASHBOARD_HTML.indexOf('id="eloDetails"');
    const matchesCardPos = DASHBOARD_HTML.indexOf("<h2>Partidas</h2>");

    // All elements must exist
    expect(kpisPos).toBeGreaterThan(-1);
    expect(formCardPos).toBeGreaterThan(-1);
    expect(diffHeaderPos).toBeGreaterThan(-1);
    expect(colCardPos).toBeGreaterThan(-1);
    expect(oppCardPos).toBeGreaterThan(-1);
    expect(evoHeaderPos).toBeGreaterThan(-1);
    expect(evoCardPos).toBeGreaterThan(-1);
    expect(resCardPos).toBeGreaterThan(-1);
    expect(eloDetailsPos).toBeGreaterThan(-1);
    expect(matchesCardPos).toBeGreaterThan(-1);

    // 1. Resumen global (.kpis) comes before #formCard
    expect(kpisPos).toBeLessThan(formCardPos);

    // 2. #formCard ("Forma actual") comes before "Comparativa por color y oponente"
    expect(formCardPos).toBeLessThan(diffHeaderPos);

    // 3. "Comparativa por color y oponente" section precedes "Evolución & detalle"
    expect(diffHeaderPos).toBeLessThan(colCardPos);
    expect(colCardPos).toBeLessThan(oppCardPos);
    expect(oppCardPos).toBeLessThan(evoHeaderPos);

    // 4. "Evolución & detalle" precedes collapsible opponent ELO details
    expect(evoHeaderPos).toBeLessThan(evoCardPos);
    expect(evoCardPos).toBeLessThan(resCardPos);
    expect(resCardPos).toBeLessThan(eloDetailsPos);

    // 5. Collapsible opponent ELO details comes before Partidas table
    expect(eloDetailsPos).toBeLessThan(matchesCardPos);
  });

  it("shouldPlaceFormaActualImmediatelyFollowingKpis", () => {
    // There should be no intervening cards or headers between </section> of .kpis and #formCard
    const kpisClosePos = DASHBOARD_HTML.indexOf('</section>', DASHBOARD_HTML.indexOf('id="kpis"'));
    const formCardPos = DASHBOARD_HTML.indexOf('id="formCard"');
    expect(kpisClosePos).toBeGreaterThan(-1);
    expect(formCardPos).toBeGreaterThan(kpisClosePos);

    const between = DASHBOARD_HTML.slice(kpisClosePos + '</section>'.length, formCardPos).trim();
    // Only whitespace or formatting between closing of kpis and #formCard div
    expect(between).toMatch(/^<div class="card"$/m);
  });

  it("shouldHaveDetailsEloDetailsCollapsedByDefault", () => {
    const detailsMatch = DASHBOARD_HTML.match(/<details[^>]*id="eloDetails"[^>]*>/);
    expect(detailsMatch).not.toBeNull();
    const detailsTag = detailsMatch![0];

    // Native HTML <details> is open only when the boolean 'open' attribute is present
    expect(detailsTag).not.toMatch(/\bopen\b/i);
    expect(detailsTag).toContain('class="card"');
  });

  it("shouldNotContainRedundantKpiSubInHtmlTemplate", () => {
    expect(htmlTemplate).not.toMatch(/id="kpiSub"/);
    expect(htmlTemplate).not.toMatch(/class="[^"]*kpi-sub[^"]*"/);
  });

  it("shouldIncludeCompactMobileMediaQueriesForSmallScreens", () => {
    // Check that CSS contains @media(max-width:480px)
    expect(DASHBOARD_HTML).toMatch(/@media\s*\(\s*max-width:\s*480px\s*\)\s*\{/);

    const mediaMatch = DASHBOARD_HTML.match(/@media\s*\(\s*max-width:\s*480px\s*\)\s*\{([\s\S]*?)\n\}/);
    expect(mediaMatch).not.toBeNull();
    const cssBody = mediaMatch![1];

    // Compact styles for header, elo-hero, kpis, kpi, and card on mobile (375px/480px)
    expect(cssBody).toMatch(/\.elo-hero\s+b\s*\{[^}]*font-size:\s*22px/);
    expect(cssBody).toMatch(/\.kpis\s*\{[^}]*gap:\s*8px/);
    expect(cssBody).toMatch(/\.kpi\s*\{[^}]*padding:\s*10px\s+12px/);
    expect(cssBody).toMatch(/\.kpi\s+b\s*\{[^}]*font-size:\s*20px/);
    expect(cssBody).toMatch(/\.kpi\s+label\s*\{[^}]*font-size:\s*10px/);
    expect(cssBody).toMatch(/\.card\s*\{[^}]*padding:\s*12px/);
    expect(cssBody).toMatch(/header\s*\{[^}]*padding:\s*10px\s+14px/);
    expect(cssBody).toMatch(/main\s*\{[^}]*padding:\s*12px\s+10px\s+32px/);
  });
});
