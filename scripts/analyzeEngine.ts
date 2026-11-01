// Evaluates every game that has no engine result yet and posts the per-game summary to the Worker.
// Run by the collector's scheduled workflow from a pinned checkout of this repository, with stockfish installed beside it:
//   WORKER=https://… IMPORT_TOKEN=… node --experimental-transform-types scripts/analyzeEngine.ts
import { pathToFileURL } from "node:url";
import { Chess } from "chess.js";
import { runQueue, type AnalyzeOptions, type AnalyzeMetrics } from "./analysisQueue.ts";
import { createStockfish, type Evaluator } from "./stockfishEngine.ts";
import { summarizeEngineGame } from "../src/domain/engineEval.ts";
import { CorruptGame, IllegalGame, parseStoredGame } from "../src/domain/gameReplay.ts";

const MATED = 10000;

// One evaluation per position (moves + 1). A position with no legal move is not sent to the engine: mate counts as the study did (±10000 for the side that gave it), any other end as 0.
export async function evaluateGame(moves: readonly string[], evaluator: Evaluator): Promise<{ evals: number[]; bests: (string | null)[] }> {
  const chess = new Chess();
  const evals: number[] = [], bests: (string | null)[] = [];
  const score = async () => {
    if (chess.isCheckmate()) { evals.push(chess.turn() === "w" ? -MATED : MATED); bests.push(null); }
    else if (chess.isGameOver()) { evals.push(0); bests.push(null); }
    else { const r = await evaluator.eval(chess.fen()); evals.push(r.cp); bests.push(r.best); }
  };
  await score();
  for (let i = 0; i < moves.length; i++) {
    const uci = moves[i]!;
    try { chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci.slice(4, 5) || undefined }); }
    catch { throw new IllegalGame(`illegal move ${uci} at ply ${i + 1}`); }
    await score();
  }
  return { evals, bests };
}

export const analyzeEngine = (opts: AnalyzeOptions & { evaluator: Evaluator }): Promise<AnalyzeMetrics> =>
  runQueue(opts, {
    name: "engine",
    async compute(userColor, moveHistory) {
      const color = userColor?.trim().toLowerCase();
      if (color !== "white" && color !== "black") return null;
      let moves: string[];
      try { moves = parseStoredGame(moveHistory, "[]").moves; }
      catch (e) { if (e instanceof CorruptGame) return { status: "invalid", reason: "corrupt_game" }; throw e; }
      try {
        const { evals, bests } = await evaluateGame(moves, opts.evaluator);
        return { status: "ok", ...summarizeEngineGame(evals, bests, color) };
      } catch (e) {
        if (e instanceof IllegalGame) return { status: "invalid", reason: "illegal_game" };
        opts.log?.("engine failed on a game"); // an engine fault is not a verdict on the game: nothing is posted and the game stays pending
        return null;
      }
    },
  });

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const need = (k: string) => process.env[k] || (console.error(`missing ${k}`), process.exit(2));
  const worker = need("WORKER"), importToken = need("IMPORT_TOKEN");
  const budgetMs = process.env.ENGINE_BUDGET_MS ? Number(process.env.ENGINE_BUDGET_MS) : undefined;
  const evaluator = await createStockfish();
  try {
    const m = await analyzeEngine({ fetch, worker, importToken, budgetMs, evaluator, log: (s) => console.error(`  ${s}`) });
    console.log(`engine: ${JSON.stringify(m)}`);
    evaluator.close();
    process.exit(m.aborted ? 1 : 0);
  } catch (e) {
    evaluator.close();
    console.error(`analysis stopped: ${e instanceof Error ? e.name : "unknown error"}`);
    process.exit(1);
  }
}
