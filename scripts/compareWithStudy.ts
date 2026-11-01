// Acceptance check for contract v1: summarizeEngineGame against the evaluations of the 2026-10-30 study, game by game.
//   node --experimental-transform-types scripts/compareWithStudy.ts ~/code/experiments/audit/all.jsonl
// The reference below is the study's own loop (profile.mjs / patterns.mjs), written out independently of src/domain/engineEval.ts.
import { readFileSync } from "node:fs";
import { summarizeEngineGame } from "../src/domain/engineEval.ts";

const clip = (v: number) => Math.max(-1000, Math.min(1000, v));
const games = readFileSync(process.argv[2]!, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
let diffs = 0, moves = 0, serious = 0, adv = 0, advWins = 0, thrown = 0, lost = 0, decisive = 0;
for (const g of games) {
  const color = g.me === "w" ? "white" : "black", sgn = g.me === "w" ? 1 : -1;
  let rm = 0, rs = 0, rl = 0, rd: number | null = null;
  for (let i = 0; i < g.sans.length; i++) {
    if ((i % 2 === 0) !== (g.me === "w")) continue;
    const before = clip(sgn * g.evals[i]), after = clip(sgn * g.evals[i + 1]), loss = Math.max(0, before - after);
    rm++; rl += loss; if (loss >= 300) rs++;
    if (rd === null && loss >= 300 && i < g.sans.length - 1 && before > -150 && after <= -300) rd = i + 1;
  }
  const mine: number[] = g.evals.map((e: number) => clip(sgn * e));
  let run = 0, rAdv = false;
  for (const e of mine) { run = e >= 300 ? run + 1 : 0; if (run >= 3) rAdv = true; }
  const s = summarizeEngineGame(g.evals, g.best, color);
  if (s.moves !== rm || s.loss !== rl || s.decisivePly !== rd || s.sustainedAdv !== rAdv || s.byPhase.opening[1] + s.byPhase.middlegame[1] + s.byPhase.endgame[1] !== rs) diffs++;
  moves += s.moves; serious += rs;
  if (rAdv) { adv++; if (g.result === "win") advWins++; if (g.result === "loss") thrown++; }
  if (g.result === "loss" && (g.end === "checkmate" || g.end === "disconnection")) { lost++; if (s.decisivePly !== null) decisive++; }
}
console.log(`games ${games.length} | discrepancies ${diffs} | serious per 100 own moves ${(100 * serious / moves).toFixed(2)}`);
console.log(`sustained +300: ${adv} games, ${(100 * advWins / adv).toFixed(0)}% won, ${thrown} lost | decisive moment in ${decisive} of ${lost} games lost by mate or disconnection`);
