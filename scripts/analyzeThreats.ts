// Computes the mate-threat result of every game that has none yet and posts it to the Worker.
// Run by the collector's scheduled workflow from a pinned checkout of this repository:
//   WORKER=https://… IMPORT_TOKEN=… node --experimental-transform-types scripts/analyzeThreats.ts
// (transform-types, not strip-types: the domain errors use constructor parameter properties.)
// Safe to repeat and to interrupt: a game is written by one request and leaves the pending queue only when its result is stored.
// Logs carry counts and HTTP statuses only, never ids or moves.
import { pathToFileURL } from "node:url";
import { analyzeMateThreats } from "../src/domain/mateThreats.ts";
import { CorruptGame, IllegalGame, parseStoredGame } from "../src/domain/gameReplay.ts";

export interface AnalyzeOptions {
  fetch: typeof fetch;
  worker: string;
  importToken: string;
  limit?: number;
  budgetMs?: number;
  now?: () => number;
  log?: (line: string) => void;
}
export interface AnalyzeMetrics { batches: number; ok: number; invalid: number; failed: number; remaining: number; aborted: string | null }

const REJECTED = "worker rejected IMPORT_TOKEN (401)";

export async function analyze(opts: AnalyzeOptions): Promise<AnalyzeMetrics> {
  const { fetch, worker, importToken, now = Date.now, log = () => {} } = opts;
  const limit = Math.min(opts.limit ?? 100, 100);
  const budgetMs = opts.budgetMs ?? 12 * 60_000;
  const headers = { Authorization: `Bearer ${importToken}`, "User-Agent": "meridian-analyzer" };
  const m: AnalyzeMetrics = { batches: 0, ok: 0, invalid: 0, failed: 0, remaining: 0, aborted: null };
  const started = now();

  for (;;) {
    const res = await fetch(`${worker}/api/chess/matches/pending-threats?limit=${limit}`, { headers });
    if (res.status === 401) { m.aborted = REJECTED; return m; }
    if (!res.ok) { m.aborted = `pending-threats ${res.status}`; return m; }
    const { items = [], totalPending = 0 } = await res.json() as { items?: { match_id: string; user_color: string | null; move_history: string }[]; totalPending?: number };
    m.remaining = totalPending;
    if (!items.length) return m;
    m.batches++;

    let progressed = 0;
    for (const game of items) {
      if (now() - started >= budgetMs) return m; // between games, never in the middle of one
      const body = compute(game.user_color, game.move_history);
      if (!body) { m.failed++; log("skipped a game whose colour is unknown"); continue; }
      const post = await fetch(`${worker}/api/chess/matches/${encodeURIComponent(game.match_id)}/threats`, {
        method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      if (post.status === 401) { m.aborted = REJECTED; return m; }
      if (!post.ok) { m.failed++; log(`post failed: ${post.status}`); continue; }
      if (body.status === "ok") m.ok++; else m.invalid++;
      m.remaining--;
      progressed++;
    }
    if (!progressed) { m.aborted = "no progress: every game of a batch failed"; return m; }
  }
}

function compute(userColor: string | null, moveHistory: string) {
  const color = userColor?.trim().toLowerCase();
  if (color !== "white" && color !== "black") return null;
  try {
    const { moves } = parseStoredGame(moveHistory, "[]");
    return { status: "ok" as const, ...analyzeMateThreats(moves, color) };
  } catch (e) {
    if (e instanceof IllegalGame) return { status: "invalid" as const, reason: "illegal_game" as const };
    if (e instanceof CorruptGame) return { status: "invalid" as const, reason: "corrupt_game" as const };
    throw e;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const need = (k: string) => process.env[k] || (console.error(`missing ${k}`), process.exit(2));
  // No default Worker on purpose (same as the collector): a default could write to the wrong database.
  const m = await analyze({ fetch, worker: need("WORKER"), importToken: need("IMPORT_TOKEN"), log: (s) => console.error(`  ${s}`) });
  console.log(`threats: ${JSON.stringify(m)}`);
  process.exit(m.aborted ? 1 : 0);
}
