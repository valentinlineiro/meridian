import { Chess, type Move } from "chess.js";
import { IllegalGame } from "./gameReplay.ts";
import { DomainError } from "../kernel/errors.ts";

// A threat is a position where it is my turn and the opponent would have a mate in 1 if I passed. This module judges what I did about it.
export const MATE_THREATS_VERSION = 1;

export type ThreatPhase = "opening" | "middlegame" | "endgame";
export type PhaseTally = [neutralized: number, missed: number, unpunished: number];
export interface MateThreatsOk {
  faced: number;
  neutralized: number;
  missed: number;
  unpunished: number;
  byPhase: Record<ThreatPhase, PhaseTally>;
  missedPlies: number[];
}

// By the ply of my move (1-based over the whole game), not by the game's phase_key.
export function phaseOfPly(ply: number): ThreatPhase {
  return ply <= 20 ? "opening" : ply <= 60 ? "middlegame" : "endgame";
}

// The opponent's mating moves if I passed. null when I am in check: a side in check cannot pass, so there is no threat to judge.
// chess.js loads a position with the side NOT to move in check without complaint, so that case must be excluded explicitly.
export function matesIfIPassed(fen: string): Move[] | null {
  if (new Chess(fen).inCheck()) return null;
  const parts = fen.split(" ");
  parts[1] = parts[1] === "w" ? "b" : "w";
  parts[3] = "-"; // the en passant square belongs to the real side to move, never to the flipped one
  return new Chess(parts.join(" ")).moves({ verbose: true }).filter((m) => m.san.endsWith("#"));
}

const hasMate = (chess: Chess): boolean => chess.moves().some((san) => san.endsWith("#"));

export function analyzeMateThreats(moves: readonly string[], userColor: "white" | "black"): MateThreatsOk {
  const me = userColor === "white" ? "w" : "b";
  const out: MateThreatsOk = {
    faced: 0, neutralized: 0, missed: 0, unpunished: 0,
    byPhase: { opening: [0, 0, 0], middlegame: [0, 0, 0], endgame: [0, 0, 0] }, missedPlies: [],
  };
  const chess = new Chess();
  let pending: { ply: number; mateStays: boolean } | null = null;

  for (let i = 0; i < moves.length; i++) {
    const uci = moves[i]!;
    const mine = chess.turn() === me;
    // a threat needs an opponent reply on record: a move that ends the record gets no verdict
    const threatened = mine && i + 1 < moves.length && !!matesIfIPassed(chess.fen())?.length;
    let played: Move;
    try { played = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci.slice(4, 5) || undefined }); }
    catch { throw new IllegalGame(`illegal move ${uci} at ply ${i + 1}`); }

    if (pending) {
      const tally = out.byPhase[phaseOfPly(pending.ply)];
      out.faced++;
      if (played.san.endsWith("#")) { out.missed++; tally[1]++; out.missedPlies.push(pending.ply); }
      else if (pending.mateStays) { out.unpunished++; tally[2]++; }
      else { out.neutralized++; tally[0]++; }
      pending = null;
    }
    if (threatened) pending = { ply: i + 1, mateStays: hasMate(chess) };
  }
  return out;
}

// ── The stored contract ──
// One JSON column, three states that never blur: NULL (pending), ok (analysed, possibly with zero threats), invalid (the history cannot be replayed).
export type InvalidReason = "illegal_game" | "corrupt_game";
export type StoredMateThreats = ({ v: 1; status: "ok" } & MateThreatsOk) | { v: 1; status: "invalid"; reason: InvalidReason };

export class InvalidMateThreats extends DomainError {
  constructor(message: string) { super("INVALID_MATE_THREATS", message); }
}

const PHASES: ThreatPhase[] = ["opening", "middlegame", "endgame"];
const isCount = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && n >= 0;

// What the counters must satisfy on their own, with no knowledge of the game. Returns the first violation, or null.
function selfInconsistency(p: MateThreatsOk): string | null {
  if (!p || ![p.faced, p.neutralized, p.missed, p.unpunished].every(isCount)) return "counts must be non-negative integers";
  if (p.faced !== p.neutralized + p.missed + p.unpunished) return "faced must equal neutralized + missed + unpunished";
  const sums = [0, 0, 0];
  for (const ph of PHASES) {
    const t = p.byPhase?.[ph];
    if (!Array.isArray(t) || t.length !== 3 || !t.every(isCount)) return `phase ${ph} must be three non-negative integers`;
    for (let i = 0; i < 3; i++) sums[i]! += t[i]!;
  }
  if (sums[0] !== p.neutralized || sums[1] !== p.missed || sums[2] !== p.unpunished) return "phase tallies must add up to the totals";
  if (!Array.isArray(p.missedPlies) || p.missedPlies.length !== p.missed) return "missedPlies must have one entry per missed threat";
  return null;
}

// Everything the server can know about a result: the counters against each other, and the plies against the stored game (its length and the owner's colour).
export function assertMateThreatsInvariants(p: MateThreatsOk, ctx: { plyCount: number; userColor: "white" | "black" }): void {
  const bad = selfInconsistency(p);
  if (bad) throw new InvalidMateThreats(bad);
  const parity = ctx.userColor === "white" ? 1 : 0; // white moves on odd plies, black on even
  let prev = 0;
  for (const ply of p.missedPlies) {
    if (!Number.isInteger(ply) || ply < 1 || ply > ctx.plyCount) throw new InvalidMateThreats(`ply ${ply} is outside the game`);
    if (ply % 2 !== parity) throw new InvalidMateThreats(`ply ${ply} is not one of the owner's moves`);
    if (ply <= prev) throw new InvalidMateThreats("missedPlies must be strictly increasing");
    prev = ply;
  }
}

export type ReadMateThreats =
  | { state: "pending" }
  | { state: "ok"; value: MateThreatsOk }
  | { state: "invalid"; reason: InvalidReason }
  | { state: "unknown" };

// Readers never trust the column: a version they do not know, malformed JSON or contradictory counters are "unknown" and counted apart.
export function readMateThreats(raw: string | null): ReadMateThreats {
  if (raw === null) return { state: "pending" };
  let o: any;
  try { o = JSON.parse(raw); } catch { return { state: "unknown" }; }
  if (!o || typeof o !== "object" || o.v !== MATE_THREATS_VERSION) return { state: "unknown" };
  if (o.status === "invalid") return o.reason === "illegal_game" || o.reason === "corrupt_game" ? { state: "invalid", reason: o.reason } : { state: "unknown" };
  if (o.status !== "ok") return { state: "unknown" };
  const { faced, neutralized, missed, unpunished, byPhase, missedPlies } = o;
  const value: MateThreatsOk = { faced, neutralized, missed, unpunished, byPhase, missedPlies };
  return selfInconsistency(value) ? { state: "unknown" } : { state: "ok", value };
}
