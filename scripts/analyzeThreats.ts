// Computes the mate-threat result of every game that has none yet and posts it to the Worker.
// Run by the collector's scheduled workflow from a pinned checkout of this repository:
//   WORKER=https://… IMPORT_TOKEN=… node --experimental-transform-types scripts/analyzeThreats.ts
// (transform-types, not strip-types: the domain errors use constructor parameter properties.)
import { pathToFileURL } from "node:url";
import { runQueue, type AnalyzeOptions, type AnalyzeMetrics } from "./analysisQueue.ts";
import { analyzeMateThreats } from "../src/domain/mateThreats.ts";
import { CorruptGame, IllegalGame, parseStoredGame } from "../src/domain/gameReplay.ts";

export type { AnalyzeOptions, AnalyzeMetrics };

export const analyze = (opts: AnalyzeOptions): Promise<AnalyzeMetrics> => runQueue(opts, { name: "threats", compute });

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
