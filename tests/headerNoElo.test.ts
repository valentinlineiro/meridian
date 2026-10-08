import { describe, it, expect } from "vitest";
import { DASHBOARD_HTML } from "../src/frontend.ts";

describe("header (P1 #6)", () => {
  it("shouldNotCarryAChessEloThatOnlyOneTabFilled", () => {
    expect(DASHBOARD_HTML).not.toMatch(/eloHero|eloSub|elo-hero/);
  });
  it("shouldKeepTheEloAndItsDeltaOnTheChessHeroAndTheOverviewCard", () => {
    expect(DASHBOARD_HTML).toContain('id="chessHeroElo"');
    expect(DASHBOARD_HTML).toContain('id="overviewChessElo"');
    expect(DASHBOARD_HTML).toContain("vs primer snapshot");
  });
});
