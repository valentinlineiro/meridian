// Builds the git-ignored wrangler.production.jsonc from the tracked wrangler.jsonc (placeholder D1 id) and the CI environment.
// Run: node --experimental-strip-types scripts/makeProductionConfig.ts   (reads D1_DATABASE_ID, SYNC_REPO, SYNC_WORKFLOW, SYNC_REF)
import { readFileSync, writeFileSync } from "node:fs";

const PLACEHOLDER = "00000000-0000-0000-0000-000000000000";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
type Env = Record<string, string | undefined>;

export function buildProductionConfig(base: any, env: Env): unknown {
  const id = env.D1_DATABASE_ID ?? "";
  if (!UUID.test(id) || id === PLACEHOLDER) throw new Error("D1_DATABASE_ID must be the real database UUID");
  const bindings = (base.d1_databases ?? []).filter((d: any) => d.binding === "DB" && d.database_id === PLACEHOLDER);
  if (bindings.length !== 1) throw new Error("wrangler.jsonc must have exactly one DB binding with the placeholder database_id");
  for (const k of ["SYNC_REPO", "SYNC_WORKFLOW", "SYNC_REF"]) {
    if (!env[k]) throw new Error(`${k} must be set: without it a deploy would turn Sync off`);
  }
  if (!/^[\w.-]+\/[\w.-]+$/.test(env.SYNC_REPO!)) throw new Error("SYNC_REPO must look like owner/repo");
  const cfg = structuredClone(base);
  cfg.d1_databases.find((d: any) => d.binding === "DB").database_id = id;
  cfg.vars = { ...cfg.vars, SYNC_REPO: env.SYNC_REPO, SYNC_WORKFLOW: env.SYNC_WORKFLOW, SYNC_REF: env.SYNC_REF };
  return cfg;
}

if (process.argv[1]?.endsWith("makeProductionConfig.ts")) {
  const cfg = buildProductionConfig(JSON.parse(readFileSync("wrangler.jsonc", "utf8")), process.env);
  writeFileSync("wrangler.production.jsonc", JSON.stringify(cfg, null, 2) + "\n");
  console.log("wrangler.production.jsonc written (database id not printed)");
}
