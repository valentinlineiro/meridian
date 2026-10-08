import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const wf = readFileSync(new URL("../.github/workflows/deploy.yml", import.meta.url).pathname, "utf8");
const deployJob = wf.slice(wf.indexOf("\n  deploy:"));
const before = (marker: string) => wf.slice(0, wf.indexOf(marker));
// Lines that execute something: not comments, not echo/error messages.
const commands = wf.split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#") && !l.startsWith("echo") && !l.includes("::error::"));

describe("deploy workflow", () => {
  it("shouldNeverRunOnPullRequests", () => {
    expect(wf).not.toContain("pull_request");
  });

  it("shouldDeployOnlyFromMain", () => {
    expect(wf).toMatch(/branches: \[main\]/);
    expect(deployJob).toContain("github.ref == 'refs/heads/main'");
  });

  it("shouldStayInertOnPushUntilTheRepositoryVariableEnablesIt", () => {
    expect(wf).toContain("github.event_name == 'workflow_dispatch' || vars.CD_AUTO_DEPLOY == 'true'");
  });

  it("shouldRunTheSameGatesAsCiBeforeDeploying", () => {
    expect(wf).toContain("npm run typecheck");
    expect(wf).toContain("python3 scripts/check_architecture_boundaries.py");
    expect(wf).toContain("npm test");
    expect(deployJob).toMatch(/needs: verify/);
  });

  it("shouldReadEveryCredentialFromSecretsAndNeverInline", () => {
    for (const s of ["CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID", "D1_DATABASE_ID"]) expect(wf).toContain(`secrets.${s}`);
    expect(wf).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/);
  });

  it("shouldGenerateTheProductionConfigAndPassItExplicitlyToEveryWranglerCommand", () => {
    expect(wf).toContain("scripts/makeProductionConfig.ts");
    const wranglerLines = commands.filter((l) => /npx wrangler/.test(l));
    expect(wranglerLines.length).toBeGreaterThan(0);
    for (const l of wranglerLines) expect(l).toContain("--config wrangler.production.jsonc");
    expect(wf).not.toMatch(/--config wrangler\.jsonc/);
  });

  it("shouldGenerateTheConfigBeforeAnyWranglerCommandRuns", () => {
    const firstWrangler = wf.search(/npx wrangler/);
    expect(wf.indexOf("scripts/makeProductionConfig.ts")).toBeLessThan(firstWrangler);
  });

  it("shouldNeverApplyMigrationsButRefuseToDeployWhenOneIsPending", () => {
    expect(commands.filter((l) => l.includes("migrations apply"))).toEqual([]);
    expect(wf).toContain("migrations list");
    expect(before("wrangler deploy")).toContain("No migrations to apply");
  });

  it("shouldCheckTheDeploymentAfterwards", () => {
    expect(wf).toMatch(/PROD_URL/);
    expect(wf.indexOf("wrangler deploy")).toBeLessThan(wf.indexOf("/api/stats/lang"));
  });

  it("shouldNotOverlapTwoDeploymentsNorCancelOneInFlight", () => {
    expect(wf).toContain("group: deploy-production");
    expect(wf).toContain("cancel-in-progress: false");
  });
});
