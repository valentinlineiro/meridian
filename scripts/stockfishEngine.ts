// A single Stockfish.js (WASM) process behind the narrowest interface the analysis needs. One thread and a fixed hash, so two runs give the same evaluation.
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";

export interface Evaluator {
  // Centipawns from White's side (a mate is mapped beyond any centipawn score) and the engine's best move in UCI.
  eval(fen: string): Promise<{ cp: number; best: string | null }>;
  close(): void;
}

export const ENGINE_DEPTH = 12; // part of contract v1
const EVAL_TIMEOUT_MS = 60_000; // one position at depth 12 takes tens of milliseconds; a minute means the engine is stuck

const CLI = new URL("../node_modules/stockfish/scripts/cli.js", import.meta.url).pathname;
const MATE = 10000;

async function start(depth: number): Promise<Evaluator> {
  const p: ChildProcessWithoutNullStreams = spawn("node", [CLI]);
  let buf = "", last: { kind: string; v: number } | null = null;
  let onReady: (() => void) | null = null;
  let pending: { res: (r: { best: string | null; score: typeof last }) => void; rej: (e: Error) => void } | null = null;
  p.stdout.on("data", (d) => {
    buf += d;
    for (let i = buf.indexOf("\n"); i >= 0; i = buf.indexOf("\n")) {
      const l = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (l === "readyok") onReady?.();
      if (l.startsWith("info") && l.includes(" score ")) { const m = l.match(/score (cp|mate) (-?\d+)/); if (m) last = { kind: m[1]!, v: +m[2]! }; }
      if (l.startsWith("bestmove")) { const r = pending; pending = null; const best = l.split(" ")[1]; r?.res({ best: best && best !== "(none)" ? best : null, score: last }); }
    }
  });
  p.on("error", (e) => pending?.rej(e));
  p.stdin.on("error", (e) => pending?.rej(e)); // a dead engine must fail the evaluation, not crash the process with an unhandled EPIPE
  p.on("exit", () => pending?.rej(new Error("engine exited")));
  const ready = new Promise<void>((res) => (onReady = res));
  p.stdin.write("uci\nsetoption name Hash value 16\nsetoption name Threads value 1\nisready\n");
  let t: ReturnType<typeof setTimeout>;
  const initTimeout = new Promise<never>((_, rej) => { t = setTimeout(() => rej(new Error("engine init timeout")), EVAL_TIMEOUT_MS); });
  try { await Promise.race([ready, initTimeout]); } catch (e) { p.kill(); throw e; } finally { clearTimeout(t!); }
  return {
    eval(fen: string) {
      last = null;
      return new Promise((res, rej) => {
        const timer = setTimeout(() => { pending = null; rej(new Error("engine timeout")); }, EVAL_TIMEOUT_MS);
        pending = { res: ({ best, score }) => {
          clearTimeout(timer);
          if (!score) return res({ cp: 0, best }); // no score (no legal move): neutral, as in the study
          const v = score.kind === "cp" ? score.v : (score.v > 0 ? MATE - score.v : -MATE - score.v);
          res({ cp: fen.split(" ")[1] === "w" ? v : -v, best });
        }, rej: (e) => { clearTimeout(timer); rej(e); } };
        p.stdin.write(`position fen ${fen}\ngo depth ${depth}\n`);
      });
    },
    close() { p.stdin.write("quit\n"); p.kill(); },
  };
}

// A timed-out engine may still emit its late bestmove, which would resolve the NEXT evaluation with the wrong position's result.
// So a timeout discards the process; the next eval starts a fresh one.
export async function createStockfish(depth = ENGINE_DEPTH): Promise<Evaluator> {
  let cur: Evaluator | null = await start(depth);
  return {
    async eval(fen) {
      cur ??= await start(depth);
      try { return await cur.eval(fen); }
      catch (e) { cur.close(); cur = null; throw e; }
    },
    close() { cur?.close(); cur = null; },
  };
}
