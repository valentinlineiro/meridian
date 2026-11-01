import { DomainError } from "../kernel/errors.ts";
import { phaseOfPly, type ThreatPhase } from "./mateThreats.ts";

// What the engine says about one game, from the owner's side. Version 1 freezes the constants below: changing any of them means v2 and a full re-analysis.
export const ENGINE_EVAL_VERSION = 1;
const CLIP = 1000;          // centipawns, applied before the loss is computed
const SERIOUS = 300;        // a move losing at least this much is a serious error
const DECISIVE_BEFORE = -150; // a decisive moment starts from better than this ...
const DECISIVE_AFTER = -300;  // ... and ends at or below this
const SUSTAINED = 300;      // |eval| held for three consecutive positions
const SUSTAINED_RUN = 3;
const MAX_WORST = 5;

export interface WorstMove { ply: number; loss: number; best: string }
export interface EngineEvalOk {
  moves: number;
  loss: number;
  byPhase: Record<ThreatPhase, [moves: number, serious: number]>;
  decisivePly: number | null;
  sustainedAdv: boolean;
  sustainedDis: boolean;
  minEval: number;
  maxEval: number;
  worst: WorstMove[];
}

const clip = (v: number) => Math.max(-CLIP, Math.min(CLIP, v));

// evals: centipawns from White's side, one per position (plies + 1), mates already mapped beyond any centipawn score. bests[i]: the engine's best move (UCI) in position i.
export function summarizeEngineGame(evals: readonly number[], bests: readonly (string | null)[], userColor: "white" | "black"): EngineEvalOk {
  const sign = userColor === "white" ? 1 : -1;
  const mine = evals.map((e) => clip(sign * e));
  const out: EngineEvalOk = {
    moves: 0, loss: 0, byPhase: { opening: [0, 0], middlegame: [0, 0], endgame: [0, 0] }, decisivePly: null,
    sustainedAdv: false, sustainedDis: false, minEval: Math.min(...mine), maxEval: Math.max(...mine), worst: [],
  };
  const first = userColor === "white" ? 0 : 1; // position i is the owner's turn when i has the colour's parity
  const serious: WorstMove[] = [];
  for (let i = first; i < evals.length - 1; i += 2) {
    const before = mine[i]!, after = mine[i + 1]!, loss = Math.max(0, before - after), ply = i + 1;
    const tally = out.byPhase[phaseOfPly(ply)];
    out.moves++; out.loss += loss; tally[0]++;
    if (loss >= SERIOUS) { tally[1]++; if (bests[i]) serious.push({ ply, loss, best: bests[i]! }); } // no best move (never for a position with a move to make): counted, not listed
    // the study's definition: the move is itself a serious error, and an opponent reply is on record (a move that ends the record gets no verdict)
    if (out.decisivePly === null && loss >= SERIOUS && i + 2 < evals.length && before > DECISIVE_BEFORE && after <= DECISIVE_AFTER) out.decisivePly = ply;
  }
  out.worst = serious.sort((a, b) => b.loss - a.loss || a.ply - b.ply).slice(0, MAX_WORST);
  let up = 0, down = 0;
  for (const e of mine) {
    up = e >= SUSTAINED ? up + 1 : 0; down = e <= -SUSTAINED ? down + 1 : 0;
    if (up >= SUSTAINED_RUN) out.sustainedAdv = true;
    if (down >= SUSTAINED_RUN) out.sustainedDis = true;
  }
  return out;
}

// ── The stored contract ──
// One JSON column, three states that never blur: NULL (pending), ok (analysed), invalid (the history cannot be replayed or evaluated).
export type EngineInvalidReason = "illegal_game" | "corrupt_game" | "engine_error";
export type StoredEngineEval = ({ v: 1; status: "ok" } & EngineEvalOk) | { v: 1; status: "invalid"; reason: EngineInvalidReason };

export class InvalidEngineEval extends DomainError {
  constructor(message: string) { super("INVALID_ENGINE_EVAL", message); }
}

const PHASES: ThreatPhase[] = ["opening", "middlegame", "endgame"];
const REASONS: readonly string[] = ["illegal_game", "corrupt_game", "engine_error"];
const UCI = /^[a-h][1-8][a-h][1-8][qrbn]?$/;
const isCount = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && n >= 0;
const isEval = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && Math.abs(n) <= CLIP;

// What the figures must satisfy on their own, with no knowledge of the game. Returns the first violation, or null.
function selfInconsistency(p: EngineEvalOk): string | null {
  if (!p || !isCount(p.moves) || !isCount(p.loss)) return "moves and loss must be non-negative integers";
  let moves = 0, serious = 0;
  for (const ph of PHASES) {
    const t = p.byPhase?.[ph];
    if (!Array.isArray(t) || t.length !== 2 || !t.every(isCount)) return `phase ${ph} must be two non-negative integers`;
    if (t[1]! > t[0]!) return `phase ${ph} has more serious errors than moves`;
    moves += t[0]!; serious += t[1]!;
  }
  if (moves !== p.moves) return "phase moves must add up to moves";
  if (!isEval(p.minEval) || !isEval(p.maxEval) || p.minEval > p.maxEval) return "minEval and maxEval must be integers within the clip, in order";
  if (typeof p.sustainedAdv !== "boolean" || typeof p.sustainedDis !== "boolean") return "sustained flags must be booleans";
  if (p.sustainedAdv && p.maxEval < SUSTAINED) return "sustained advantage needs maxEval of at least +300";
  if (p.sustainedDis && p.minEval > -SUSTAINED) return "sustained disadvantage needs minEval of at most -300";
  if (p.decisivePly !== null && (!Number.isInteger(p.decisivePly) || p.decisivePly < 1)) return "decisivePly must be a positive integer or null";
  if (!Array.isArray(p.worst) || p.worst.length > MAX_WORST || p.worst.length > serious) return "worst must be at most five entries and no more than the serious errors";
  let sum = 0, prev: WorstMove | null = null;
  for (const w of p.worst) {
    if (!w || !Number.isInteger(w.ply) || w.ply < 1 || !Number.isInteger(w.loss) || w.loss < SERIOUS || w.loss > 2 * CLIP || typeof w.best !== "string" || !UCI.test(w.best)) return "worst entries must be serious losses with a UCI best move";
    if (prev && (w.loss > prev.loss || (w.loss === prev.loss && w.ply <= prev.ply))) return "worst must be sorted by loss descending, then ply";
    sum += w.loss; prev = w;
  }
  if (sum > p.loss) return "worst losses cannot exceed the total loss";
  if (p.loss > 2 * CLIP * p.moves) return "loss cannot exceed 2000 centipawns per move (the evaluation is clipped before the loss is taken)";
  if (p.loss < SERIOUS * serious) return "loss cannot be below 300 centipawns per serious error";
  if (p.decisivePly !== null && (serious === 0 || p.minEval > -SUSTAINED)) return "a decisive moment is a serious error that reaches -300 or worse";
  return null;
}

// Everything the server can know: the figures against each other, and the plies against the stored game (its length and the owner's colour).
export function assertEngineEvalInvariants(p: EngineEvalOk, ctx: { plyCount: number; userColor: "white" | "black" }): void {
  const bad = selfInconsistency(p);
  if (bad) throw new InvalidEngineEval(bad);
  const parity = ctx.userColor === "white" ? 1 : 0;
  const ownMoves = ctx.userColor === "white" ? Math.ceil(ctx.plyCount / 2) : Math.floor(ctx.plyCount / 2);
  if (p.moves !== ownMoves) throw new InvalidEngineEval(`moves must be the owner's ${ownMoves} moves of the game`);
  if ((p.sustainedAdv || p.sustainedDis) && ctx.plyCount < 2) throw new InvalidEngineEval("a sustained run needs at least three positions");
  if (p.decisivePly !== null && p.decisivePly >= ctx.plyCount) throw new InvalidEngineEval("a decisive moment needs an opponent reply on record");
  // the phase of each of the owner's moves is fixed by the game's length and the owner's colour
  const expected: Record<ThreatPhase, number> = { opening: 0, middlegame: 0, endgame: 0 };
  for (let ply = parity === 1 ? 1 : 2; ply <= ctx.plyCount; ply += 2) expected[phaseOfPly(ply)]++;
  for (const ph of PHASES) if (p.byPhase[ph][0] !== expected[ph]) throw new InvalidEngineEval(`phase ${ph} must hold ${expected[ph]} of the owner's moves`);
  const own = (ply: number) => ply >= 1 && ply <= ctx.plyCount && ply % 2 === parity;
  if (p.decisivePly !== null && !own(p.decisivePly)) throw new InvalidEngineEval("decisivePly is not one of the owner's moves");
  const seen = new Set<number>();
  for (const w of p.worst) {
    if (!own(w.ply)) throw new InvalidEngineEval(`ply ${w.ply} is not one of the owner's moves`);
    if (seen.has(w.ply)) throw new InvalidEngineEval("worst repeats a ply");
    seen.add(w.ply);
  }
  for (const ph of PHASES) if (p.worst.filter((w) => phaseOfPly(w.ply) === ph).length > p.byPhase[ph][1]) throw new InvalidEngineEval(`worst lists more errors in ${ph} than the phase has`);
}

export type ReadEngineEval =
  | { state: "pending" }
  | { state: "ok"; value: EngineEvalOk }
  | { state: "invalid"; reason: EngineInvalidReason }
  | { state: "unknown" };

// Readers never trust the column: an unknown version, malformed JSON or contradictory figures are "unknown" and counted apart.
export function readEngineEval(raw: string | null): ReadEngineEval {
  if (raw === null) return { state: "pending" };
  let o: any;
  try { o = JSON.parse(raw); } catch { return { state: "unknown" }; }
  if (!o || typeof o !== "object" || o.v !== ENGINE_EVAL_VERSION) return { state: "unknown" };
  if (o.status === "invalid") return REASONS.includes(o.reason) ? { state: "invalid", reason: o.reason } : { state: "unknown" };
  if (o.status !== "ok") return { state: "unknown" };
  const { moves, loss, byPhase, decisivePly, sustainedAdv, sustainedDis, minEval, maxEval, worst } = o;
  const value: EngineEvalOk = { moves, loss, byPhase, decisivePly, sustainedAdv, sustainedDis, minEval, maxEval, worst };
  return selfInconsistency(value) ? { state: "unknown" } : { state: "ok", value };
}
