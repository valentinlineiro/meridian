import { describe, it, expect } from "vitest";
import { handleStats } from "../src/api/stats.ts";

// A D1 stub that records SQL; every query returns no rows.
function recordingDb() {
  const sqls: string[] = [];
  const stmt = (sql: string) => {
    const s: any = { bind: () => s, all: async () => ({ results: [] }), first: async () => null };
    sqls.push(sql);
    return s;
  };
  return { db: { prepare: stmt } as any, sqls };
}
const fullScan = (sqls: string[]) => sqls.some((q) => /SELECT \* FROM matches\b/.test(q));

describe("handleStats full matches read", () => {
  it.each(["timeline", "opponents"])("shouldNotReadAllMatchesWhen%sNeedsNoRows", async (kind) => {
    const { db, sqls } = recordingDb();
    await handleStats(db, kind, new URL(`http://x/api/stats/${kind}`));
    expect(fullScan(sqls)).toBe(false);
  });

  it.each(["recent", "summary", "results", "color", "opponent-elo"])("shouldReadAllMatchesWhen%sAggregatesInJs", async (kind) => {
    const { db, sqls } = recordingDb();
    await handleStats(db, kind, new URL(`http://x/api/stats/${kind}`));
    expect(fullScan(sqls)).toBe(true);
  });
});
