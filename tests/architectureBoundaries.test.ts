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

describe("Architecture Boundaries: vertical slices", () => {
  const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = require("node:fs");
  const { tmpdir } = require("node:os");
  const { join, dirname } = require("node:path");

  // Runs the guard on a throwaway repo holding exactly the given files.
  const guard = (files: Record<string, string>) => {
    const root = mkdtempSync(join(tmpdir(), "guard-"));
    try {
      for (const [rel, text] of Object.entries(files)) {
        mkdirSync(dirname(join(root, rel)), { recursive: true });
        writeFileSync(join(root, rel), text);
      }
      const out = execSync(`python3 scripts/check_architecture_boundaries.py ${root}`, { encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] });
      return { failed: false, output: out };
    } catch (e: any) {
      return { failed: true, output: String(e.stdout ?? "") + String(e.stderr ?? "") };
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  };
  const x = (layer: string, file = "A.ts") => `src/slices/x/${layer}/${file}`;

  it("shouldRejectTheDomainImportingAnalyticsOrNormalization", () => {
    for (const dep of ["analytics", "normalization"]) {
      const r = guard({ "src/domain/D.ts": `import type { T } from "../${dep}/t.ts";\n`, [`src/${dep}/t.ts`]: "export type T = number;\n" });
      expect(r.failed).toBe(true);
      expect(r.output).toContain("forbidden domain import");
    }
  });

  it("shouldAcceptASliceThatRespectsItsLayers", () => {
    const r = guard({
      [x("domain", "D.ts")]: "export const d = 1;\n",
      [x("ports", "P.ts")]: 'import { d } from "../domain/D.ts";\n',
      [x("application", "U.ts")]: 'import { d } from "../domain/D.ts";\nimport type { P } from "../ports/P.ts";\n',
      [x("infrastructure", "I.ts")]: 'import type { P } from "../ports/P.ts";\n',
      [x("delivery", "R.ts")]: 'import { z } from "zod";\nimport { U } from "../application/U.ts";\n',
    });
    expect(r.failed).toBe(false);
  });

  it.each([
    ["delivery", 'import { I } from "../infrastructure/I.ts";', "cannot depend on infrastructure"],
    ["application", 'import { I } from "../infrastructure/I.ts";', "cannot depend on infrastructure"],
    ["domain", 'import { U } from "../application/U.ts";', "cannot depend on application"],
    ["infrastructure", 'import { U } from "../application/U.ts";', "cannot depend on application"],
    ["delivery", 'import { q } from "../../../db/store.ts";', "cannot depend on db"],
    ["application", 'import type { P } from "../../../ports/collectorTriggerPort.ts";', "cannot depend on ports"],
    ["infrastructure", 'import type { P } from "../../../ports/collectorTriggerPort.ts";', "cannot depend on ports"],
    ["domain", 'import { Hono } from "hono";', "forbidden framework import"],
    ["application", 'import { z } from "zod";', "forbidden framework import"],
  ])("shouldRejectAnImportThatBreaksTheLayerRulesWhen %s imports %s", (layer, line, message) => {
    const r = guard({ [x(layer)]: line + "\n" });
    expect(r.failed).toBe(true);
    expect(r.output).toContain(message);
  });

  it("shouldRejectASliceImportingAnotherSlice", () => {
    const r = guard({ [x("application", "U.ts")]: 'import { o } from "../../other/domain/O.ts";\n' });
    expect(r.failed).toBe(true);
    expect(r.output).toContain("cross-slice");
  });

  it("shouldRejectTheKernelImportingAnythingOutsideItself", () => {
    const r = guard({ "src/kernel/k.ts": 'import { d } from "../domain/user.ts";\n' });
    expect(r.failed).toBe(true);
    expect(r.output).toContain("the kernel depends on nothing else");
  });

  it("shouldRejectASliceTestWhoseNameDoesNotFollowTheConvention", () => {
    const r = guard({ "tests/slices/x/a.test.ts": 'it("works", () => {});\nit("shouldDoItWhenReady", () => {});\n' });
    expect(r.failed).toBe(true);
    expect(r.output).toContain("must follow shouldDoWhateverWhenInputIsWhatever");
    expect(r.output).not.toContain("shouldDoItWhenReady");
  });
});
