import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// A classic script tolerates a function declared twice (the last one silently wins); the wrangler build, which treats
// the file as a module when its Text rule is missing, rejects it. Keep the file free of that ambiguity.
describe("dashboard client script", () => {
  it("shouldDeclareEachTopLevelFunctionOnceWhenLoadedAsAScript", () => {
    const source = readFileSync(resolve(__dirname, "../src/dashboard.client.js"), "utf8");
    const names = [...source.matchAll(/^(?:async )?function (\w+)\(/gm)].map((m) => m[1]!);
    const duplicated = names.filter((n, i) => names.indexOf(n) !== i);
    expect(duplicated).toEqual([]);
  });
});
