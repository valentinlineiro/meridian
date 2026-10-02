import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);

describe("Architecture Boundaries", () => {
  it("shouldPassArchitectureBoundaryChecksWhenGuardScriptIsRun", () => {
    const output = execSync("python3 scripts/check_architecture_boundaries.py", {
      encoding: "utf-8",
    });
    expect(output).toContain("check_architecture_boundaries: OK");
  });
  it("shouldRejectDomainOrApplicationImportingHonoOrZodWhenGuardRuns", () => {
    const probe = new URL("../src/domain/__guard_rule5_probe.ts", import.meta.url);
    const { writeFileSync, rmSync } = require("node:fs");
    writeFileSync(probe, 'import { z } from "zod";\nexport const probe = z.string();\n');
    let failed = false;
    let output = "";
    try {
      output = execSync("python3 scripts/check_architecture_boundaries.py", { encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] });
    } catch (e: any) {
      failed = true;
      output = String(e.stdout ?? "") + String(e.stderr ?? "");
    } finally {
      rmSync(probe, { force: true });
    }
    expect(failed).toBe(true);
    expect(output).toContain("forbidden framework import");
  });
});
