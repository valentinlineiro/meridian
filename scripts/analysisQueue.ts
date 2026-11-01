// The loop shared by the scheduled analyses (mate threats, engine evaluation): pull the pending games, compute each one, post the result.
// Safe to repeat and to interrupt: a game is written by one request and leaves the pending queue only when its result is stored.
// Logs carry counts and HTTP statuses only, never ids or moves.
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
// A queue the Worker serves at pending-<name> and accepts results for at /<id>/<name>. compute returns the body to post, or null for a game it cannot even attempt (unknown colour).
export interface QueueJob { name: "threats" | "engine"; compute(userColor: string | null, moveHistory: string): Promise<Record<string, unknown> | null> | Record<string, unknown> | null }
export interface AnalyzeMetrics { batches: number; ok: number; invalid: number; failed: number; remaining: number; aborted: string | null }

const REJECTED = "worker rejected IMPORT_TOKEN (401)";
const ATTEMPTS = 4; // one try and three retries, waiting 1 s, 2 s, 4 s: enough for a dropped connection, short enough for a 15-minute job

// undici reports every network failure as TypeError("fetch failed") with the system error in `cause`. Only the codes below are a dropped,
// reset or timed-out connection that a later attempt can fix; anything else (an AbortError, an invalid URL, a certificate or DNS-name problem)
// would fail the same way again and is surfaced instead.
const TRANSIENT = new Set(["ECONNRESET", "ECONNREFUSED", "ETIMEDOUT", "EPIPE", "EAI_AGAIN", "ENETUNREACH", "EHOSTUNREACH", "UND_ERR_SOCKET", "UND_ERR_CONNECT_TIMEOUT", "UND_ERR_HEADERS_TIMEOUT", "UND_ERR_BODY_TIMEOUT"]);
function isTransient(e: unknown): boolean {
  if (!(e instanceof TypeError) || e.message !== "fetch failed") return false;
  const code = (e.cause as { code?: unknown } | undefined)?.code;
  return typeof code === "string" && TRANSIENT.has(code);
}

// Connection errors and 5xx answers are transient, and both routes are idempotent (a retried POST replaces, never adds), so they are retried
// with a growing wait. Anything else (2xx, 4xx) is final and returned at once; a non-transient exception propagates. null = unreachable on every attempt; otherwise the last response.
async function send(o: Required<Pick<AnalyzeOptions, "fetch" | "sleep">>, url: string, init: RequestInit): Promise<Response | null> {
  let last: Response | null = null;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      last = await o.fetch(url, init);
      if (last.status < 500) return last;
    } catch (e) {
      if (!isTransient(e)) throw e; // cancellations, bad URLs, certificate problems and bugs are not worth a retry
      last = null;
    }
    if (attempt < ATTEMPTS) await o.sleep(1000 * 2 ** (attempt - 1));
  }
  return last;
}

export async function runQueue(opts: AnalyzeOptions, job: QueueJob): Promise<AnalyzeMetrics> {
  const { fetch, worker, importToken, now = Date.now, sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms)), log = () => {} } = opts;
  const limit = Math.min(opts.limit ?? 100, 100);
  const budgetMs = opts.budgetMs ?? 12 * 60_000;
  const headers = { Authorization: `Bearer ${importToken}`, "User-Agent": "meridian-analyzer" };
  const m: AnalyzeMetrics = { batches: 0, ok: 0, invalid: 0, failed: 0, remaining: 0, aborted: null };
  const started = now();
  const failedIds = new Set<string>();

  for (;;) {
    const res = await send({ fetch, sleep }, `${worker}/api/chess/matches/pending-${job.name}?limit=${limit}`, { headers });
    if (!res) { m.aborted = `pending-${job.name} unreachable after ${ATTEMPTS} attempts`; return m; }
    if (res.status === 401) { m.aborted = REJECTED; return m; }
    if (!res.ok) { m.aborted = `pending-${job.name} ${res.status}${res.status >= 500 ? ` after ${ATTEMPTS} attempts` : ""}`; return m; }
    const { items = [], totalPending = 0 } = await res.json() as { items?: { match_id: string; user_color: string | null; move_history: string }[]; totalPending?: number };
    m.remaining = totalPending;
    if (!items.length) return m;
    m.batches++;

    let progressed = 0;
    for (const game of items) {
      if (failedIds.has(game.match_id)) continue; // a game that could not be computed or posted stays pending, but is not retried again within this run
      if (now() - started >= budgetMs) return m; // between games, never in the middle of one
      const body = await job.compute(game.user_color, game.move_history);
      if (!body) { m.failed++; failedIds.add(game.match_id); log("skipped a game that could not be computed"); continue; }
      const post = await send({ fetch, sleep }, `${worker}/api/chess/matches/${encodeURIComponent(game.match_id)}/${job.name}`, {
        method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      if (post?.status === 401) { m.aborted = REJECTED; return m; }
      if (!post || !post.ok) { m.failed++; failedIds.add(game.match_id); log(`post failed: ${post ? post.status : "unreachable"}`); continue; }
      if (body.status === "ok") m.ok++; else m.invalid++;
      m.remaining--;
      progressed++;
    }
    if (!progressed) { m.aborted = "no progress: every game of a batch failed"; return m; }
  }
}

