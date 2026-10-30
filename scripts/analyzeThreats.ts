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
  sleep?: (ms: number) => Promise<void>;
  log?: (line: string) => void;
}
export interface AnalyzeMetrics { batches: number; ok: number; invalid: number; failed: number; remaining: number; aborted: string | null }

const REJECTED = "worker rejected IMPORT_TOKEN (401)";
const ATTEMPTS = 4; // one try and three retries, waiting 1 s, 2 s, 4 s: enough for a dropped connection, short enough for a 15-minute job

// Connection errors and 5xx answers are transient, and both routes are idempotent (a retried POST replaces, never adds), so they are retried
// with a growing wait. Anything else (2xx, 4xx) is final and returned at once. null = unreachable on every attempt; otherwise the last response.
async function send(o: Required<Pick<AnalyzeOptions, "fetch" | "sleep">>, url: string, init: RequestInit): Promise<Response | null> {
  let last: Response | null = null;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      last = await o.fetch(url, init);
      if (last.status < 500) return last;
    } catch { last = null; }
    if (attempt < ATTEMPTS) await o.sleep(1000 * 2 ** (attempt - 1));
  }
  return last;
}

export async function analyze(opts: AnalyzeOptions): Promise<AnalyzeMetrics> {
  const { fetch, worker, importToken, now = Date.now, sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms)), log = () => {} } = opts;
  const limit = Math.min(opts.limit ?? 100, 100);
  const budgetMs = opts.budgetMs ?? 12 * 60_000;
  const headers = { Authorization: `Bearer ${importToken}`, "User-Agent": "meridian-analyzer" };
  const m: AnalyzeMetrics = { batches: 0, ok: 0, invalid: 0, failed: 0, remaining: 0, aborted: null };
  const started = now();

  for (;;) {
    const res = await send({ fetch, sleep }, `${worker}/api/chess/matches/pending-threats?limit=${limit}`, { headers });
    if (!res) { m.aborted = `pending-threats unreachable after ${ATTEMPTS} attempts`; return m; }
    if (res.status === 401) { m.aborted = REJECTED; return m; }
    if (!res.ok) { m.aborted = `pending-threats ${res.status}${res.status >= 500 ? ` after ${ATTEMPTS} attempts` : ""}`; return m; }
    const { items = [], totalPending = 0 } = await res.json() as { items?: { match_id: string; user_color: string | null; move_history: string }[]; totalPending?: number };
    m.remaining = totalPending;
    if (!items.length) return m;
    m.batches++;

    let progressed = 0;
    for (const game of items) {
      if (now() - started >= budgetMs) return m; // between games, never in the middle of one
      const body = compute(game.user_color, game.move_history);
      if (!body) { m.failed++; log("skipped a game whose colour is unknown"); continue; }
      const post = await send({ fetch, sleep }, `${worker}/api/chess/matches/${encodeURIComponent(game.match_id)}/threats`, {
        method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      if (post?.status === 401) { m.aborted = REJECTED; return m; }
      if (!post || !post.ok) { m.failed++; log(`post failed: ${post ? post.status : "unreachable"}`); continue; }
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
  try {
    const m = await analyze({ fetch, worker: need("WORKER"), importToken: need("IMPORT_TOKEN"), log: (s) => console.error(`  ${s}`) });
    console.log(`threats: ${JSON.stringify(m)}`);
    process.exit(m.aborted ? 1 : 0);
  } catch (e) {
    // an unexpected error ends the run with one line; whatever was already written stays written
    console.error(`analysis stopped: ${e instanceof Error ? e.name : "unknown error"}`);
    process.exit(1);
  }
}
