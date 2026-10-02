import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url).pathname, "utf8");

describe("deployed entry point", () => {
  it("shouldDeploySrcIndexAndNeverTheDevEntry", () => {
    expect(read("wrangler.jsonc")).toMatch(/"main":\s*"src\/index\.ts"/);
  });
  it("shouldNotImportTheDevEntryOrTheTestHelperFromProductionCode", () => {
    for (const f of ["src/index.ts", "src/api/router.ts"]) expect(read(f)).not.toMatch(/from\s+["'][^"']*(\/dev|adminWorker)/);
  });
  it("shouldOnlyLetTheDevEntryServeLoopbackHosts", () => {
    expect(read("src/dev.ts")).toMatch(/127\.0\.0\.1/);
    expect(read("src/dev.ts")).toMatch(/403/);
  });
});
