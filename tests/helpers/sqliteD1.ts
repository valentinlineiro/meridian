import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
const require = createRequire(import.meta.url);
const { DatabaseSync } = require("node:sqlite");

// In-memory SQLite exposed through the slice of the D1 API the app uses.
export function createSqliteD1(migrations: string[]) {
  const db = new DatabaseSync(":memory:");
  for (const m of migrations) db.exec(readFileSync(new URL(`../../migrations/${m}`, import.meta.url).pathname, "utf8"));
  const stmt = (sql: string, args: any[] = []) => ({
    bind: (...a: any[]) => stmt(sql, a),
    all: async () => ({ results: db.prepare(sql).all(...args) }),
    first: async () => db.prepare(sql).get(...args) ?? null,
    run: async () => ({ meta: { changes: Number(db.prepare(sql).run(...args).changes) } }),
  });
  return { db, d1: { prepare: (sql: string) => stmt(sql) } as unknown as D1Database };
}
