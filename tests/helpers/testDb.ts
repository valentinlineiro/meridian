import type { D1Database } from "@cloudflare/workers-types";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const { DatabaseSync } = require("node:sqlite");

export interface TestDbInstance {
  db: any;
  d1: D1Database;
}

export function setupTestDb(): TestDbInstance {
  const db = new DatabaseSync(":memory:");
  const migrationFiles = [
    "0001_init.sql",
    "0002_collection_runs.sql",
    "0004_users.sql",
    "0005_played_at.sql",
    "0006_match_details.sql",
    "0007_openings_and_phases.sql",
    "0008_languages.sql",
    "0009_course_sections_pk.sql",
    "0011_user_state_observed_at.sql",
    "0012_observation_series.sql",
    "0013_xp_summaries_daily_goal.sql",
    "0014_course_path_state.sql",
  ];

  for (const file of migrationFiles) {
    const sql = readFileSync(new URL(`../../migrations/${file}`, import.meta.url).pathname, "utf8");
    db.exec(sql);
  }

  function createPreparedStatement(sql: string, boundArgs: any[] = []): any {
    const sanitizeArgs = (args: any[]) =>
      args.map((a) => (a === undefined ? null : typeof a === "boolean" ? (a ? 1 : 0) : a));

    return {
      bind(...args: any[]) {
        return createPreparedStatement(sql, [...boundArgs, ...sanitizeArgs(args)]);
      },
      first: async <T = unknown>(colName?: string): Promise<T | null> => {
        const row = db.prepare(sql).get(...boundArgs);
        if (!row) return null;
        if (colName) return (row as any)[colName] ?? null;
        return row as T;
      },
      all: async <T = unknown>(): Promise<{ results: T[] }> => {
        const results = db.prepare(sql).all(...boundArgs) as T[];
        return { results };
      },
      run: async () => {
        const res = db.prepare(sql).run(...boundArgs);
        return { meta: { changes: Number(res.changes) } };
      },
    };
  }

  const d1 = {
    prepare(sql: string) {
      return createPreparedStatement(sql);
    },
    async batch(statements: any[]) {
      const results = [];
      for (const stmt of statements) {
        results.push(await stmt.run());
      }
      return results;
    },
    async exec(sql: string) {
      db.exec(sql);
      return { count: 1, duration: 0 };
    },
  } as unknown as D1Database;

  return { db, d1 };
}
