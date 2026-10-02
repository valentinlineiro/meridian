import { describe, it, expect } from "vitest";
import { upsertMatches } from "../src/db/store.ts";
import type { MatchRow } from "../src/types.ts";

const row = (match_id: string): { row: MatchRow; raw: any } => ({
  row: {
    match_id, user_id: "1000001", opponent_id: null, opponent_name: null, opponent_type: "bot",
    opponent_elo: null, opponent_suspected_cheating: 0, user_color: "white", result: "win",
    outcome: "win", reviewed: 0, pvp_match_type: "normal", page_number: 0, index_in_page: 0, page_elo: null,
    played_at: null,
  },
  raw: { matchId: match_id },
});

// In-memory D1 double: SELECT IN filters the map, batch applies upsert-or-update.
const memDb = (matches: Map<string, any>) =>
  ({
    prepare: (sql: string) => ({
      bind: (...args: any[]) => ({
        all: async () =>
          sql.startsWith("SELECT match_id")
            ? { results: args.filter((id) => matches.has(id)).map((match_id) => ({ match_id })) }
            : { results: [] },
        first: async () => null,
        __apply: () => {
          if (sql.startsWith("INSERT INTO matches")) {
            const id = args[0];
            matches.set(id, { last_seen_at: args[args.length - 1] });
          }
        },
      }),
    }),
    batch: async (stmts: any[]) => {
      for (const s of stmts) s.__apply?.();
      return stmts.map(() => ({ meta: { changes: 1 } })); // D1 quirk: 1 even on conflict-update
    },
  }) as any;

describe("upsertMatches insert counting", () => {
  it("shouldCountOnlyTrueInsertsWhenUpsertingMatches", async () => {
    const db = memDb(new Map());
    const { added } = await upsertMatches(db, [row("a"), row("b"), row("c")], "snap1", "2026-09-25T00:00:00Z");
    expect(added).toBe(3);
  });

  it("shouldCountZeroNewWhenReupsertingSameMatches", async () => {
    const db = memDb(new Map());
    const items = [row("a"), row("b")];
    expect((await upsertMatches(db, items, "snap1", "2026-09-25T00:00:00Z")).added).toBe(2);
    // Same rows again + one genuinely new: batch metadata alone would claim 3.
    expect((await upsertMatches(db, [...items, row("c")], "snap2", "2026-09-25T01:00:00Z")).added).toBe(1);
  });
});
