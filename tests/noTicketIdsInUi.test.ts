import { describe, it, expect } from "vitest";
import { DASHBOARD_HTML } from "../src/frontend.ts";

// P1 #6: internal ticket ids (#16.9, #16.6c) are not for the user. Code comments, test names and contract docs keep them.
describe("no internal ticket ids in what the user reads", () => {
  it("shouldNotShowTicketIdsInTheMarkup", () => {
    const markup = DASHBOARD_HTML.slice(0, DASHBOARD_HTML.indexOf("<script>")).replace(/<!--[\s\S]*?-->/g, "");
    expect(markup).not.toMatch(/#1\d\.\d/);
  });
  it("shouldNotShowTicketIdsInStringsRenderedByTheScript", () => {
    const script = DASHBOARD_HTML.slice(DASHBOARD_HTML.indexOf("<script>")).replace(/^\s*\/\/.*$/gm, "");
    expect(script).not.toMatch(/['"`][^'"`\n]*#1\d\.\d[^'"`\n]*['"`]/);
  });
});
