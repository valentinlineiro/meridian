import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// Product wording rules that held for the legacy dashboard (epistemicWording, noTicketIdsInUi, headerNoElo,
// pruneLegacyLanguages) now checked over what the Angular app ships: every non-spec source under web/src/app.
const ROOT = "web/src/app";
const sources = (readdirSync(ROOT, { recursive: true }) as string[])
  .filter((f) => /\.(ts|html)$/.test(f) && !f.endsWith(".spec.ts") && !f.includes("evaluation-fixtures"))
  .map((f) => ({ file: f, text: readFileSync(join(ROOT, f), "utf8") }));
const withoutComments = (s: string) => s.replace(/<!--[\s\S]*?-->/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("what the Angular app shows", () => {
  it("shouldScanTheWholeApp", () => expect(sources.length).toBeGreaterThan(30));

  it.each([
    ["significance claims", /significativ/i],
    ["a fixed small-sample threshold", /muestra pequeña/i],
    ["internal ticket ids", /#1\d\.\d/],
    ["the header ELO that only one tab filled", /eloHero|eloSub|elo-hero/],
    ["the hidden legacy languages container", /langLegacyContainer|langRitmo|langEvoNote|setLangMetric|friendlyOtherName/],
  ])("shouldNeverShow %s", (_what, pattern) => {
    expect(sources.filter((s) => pattern.test(withoutComments(s.text))).map((s) => s.file)).toEqual([]);
  });
});

// Layout rules the legacy tests pinned on src/dashboard.client.css (frontend, ux-viewport, canonicalRouting, uxPhase1);
// web/src/styles.css carries that stylesheet, so they are checked there.
describe("the global stylesheet", () => {
  const css = readFileSync("web/src/styles.css", "utf8");
  it.each([
    ["the 480px phone breakpoint", /@media\s*\(\s*max-width:\s*480px\s*\)\s*\{/],
    ["the 760/860/700px breakpoints", /(?=[\s\S]*@media\s*\(\s*max-width:\s*760px\s*\))(?=[\s\S]*@media\s*\(\s*max-width:\s*860px\s*\))(?=[\s\S]*@media\s*\(\s*max-width:\s*700px\s*\))/],
    ["one column for .grid2 under 860px", /@media\s*\(\s*max-width:\s*860px\s*\)\s*\{[^}]*\.grid2\s*\{[^}]*grid-template-columns:\s*1fr/],
    ["mobile card labels as decorative generated content", /\.tbl td::before\{content:attr\(data-l\)\s*\/\s*""/],
    ["a sticky first column in the games table", /(?=[\s\S]*\.gtable\s*th:first-child[^}]*position:\s*sticky)(?=[\s\S]*\.gtable\s*td:first-child[^}]*position:\s*sticky)/],
    ["44px touch targets", /min-height:\s*44px/],
  ])("shouldKeep %s", (_what, rule) => expect(css).toMatch(rule));
});
