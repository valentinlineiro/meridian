import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { render } from "../web/scripts/evaluation-fixtures.gen.ts";

// The web specs render payloads frozen from src/domain; a domain change must regenerate them, or the specs test stale data.
describe("web evaluation fixtures", () => {
  it("shouldMatchWhatTheDomainAnswersTodayWhenTheFixturesAreCommitted", () => {
    const committed = readFileSync(new URL("../web/src/app/shared/evaluation-fixtures.ts", import.meta.url).pathname, "utf8");
    expect(render() === committed, "regenerate: npx vite-node web/scripts/evaluation-fixtures.gen.ts > web/src/app/shared/evaluation-fixtures.ts").toBe(true);
  });
});
