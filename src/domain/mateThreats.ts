import { Chess, type Move } from "chess.js";
import { IllegalGame } from "./gameReplay.ts";

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
