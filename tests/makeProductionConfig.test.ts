import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { buildProductionConfig } from "../scripts/makeProductionConfig.ts";

const PLACEHOLDER = "00000000-0000-0000-0000-000000000000";
const REAL = "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";
const base = () => ({ name: "meridian", d1_databases: [{ binding: "DB", database_name: "meridian", database_id: PLACEHOLDER, migrations_dir: "./migrations" }] });
const env = (over: Record<string, string | undefined> = {}) => ({ D1_DATABASE_ID: REAL, SYNC_REPO: "acme/collector", SYNC_WORKFLOW: "collector.yml", SYNC_REF: "ops", ...over });

describe("buildProductionConfig", () => {
  it("shouldPutTheRealDatabaseIdAndTheSyncVarsIntoTheConfig", () => {
    const cfg = buildProductionConfig(base(), env()) as any;
    expect(cfg.d1_databases[0].database_id).toBe(REAL);
    expect(cfg.vars).toEqual({ SYNC_REPO: "acme/collector", SYNC_WORKFLOW: "collector.yml", SYNC_REF: "ops" });
    expect(cfg.name).toBe("meridian");
  });

  it("shouldNotMutateTheTrackedConfig", () => {
    const b = base();
    buildProductionConfig(b, env());
    expect(b.d1_databases[0]!.database_id).toBe(PLACEHOLDER);
  });

  it.each([[undefined], [""], [PLACEHOLDER], ["not-a-uuid"], [REAL.toUpperCase()]])("shouldRefuseWhenTheDatabaseIdIs %s", (id) => {
    expect(() => buildProductionConfig(base(), env({ D1_DATABASE_ID: id }))).toThrow(/D1_DATABASE_ID/);
  });

  it("shouldRefuseToBuildFromAConfigThatIsNotThePublicPlaceholder", () => {
    const b = base();
    b.d1_databases[0]!.database_id = REAL;
    expect(() => buildProductionConfig(b, env())).toThrow(/placeholder/);
  });

  it("shouldRefuseWhenThereIsNoDbBinding", () => {
    expect(() => buildProductionConfig({ name: "meridian", d1_databases: [] }, env())).toThrow(/placeholder/);
  });

  it.each([["SYNC_REPO"], ["SYNC_WORKFLOW"], ["SYNC_REF"]])("shouldRefuseWhenSyncVariableIsMissing %s", (k) => {
    expect(() => buildProductionConfig(base(), env({ [k]: "" }))).toThrow(new RegExp(k));
  });

  it.each([["acme"], ["acme/"], ["a/b/c"], ["acme collector"]])("shouldRefuseAMalformedSyncRepo %s", (repo) => {
    expect(() => buildProductionConfig(base(), env({ SYNC_REPO: repo }))).toThrow(/SYNC_REPO/);
  });

  it("shouldAcceptTheTrackedWranglerConfigAsItsBase", () => {
    const tracked = JSON.parse(readFileSync(new URL("../wrangler.jsonc", import.meta.url).pathname, "utf8"));
    expect(() => buildProductionConfig(tracked, env())).not.toThrow();
  });
});
