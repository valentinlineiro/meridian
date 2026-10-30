import { Chess } from "chess.js";
import { DomainError } from "../kernel/errors.ts";

export class IllegalGame extends DomainError {
  constructor(message: string) { super("ILLEGAL_GAME", message); }
}

export interface Ply { san: string; fen: string; t: number | null }
export interface GameHeaders { event: string; date: string | null; white: string; black: string; result: "1-0" | "0-1" | "1/2-1/2" | "*" }
export interface Game { plies: Ply[]; pgn: string }

// `moves` are the coordinate moves Duolingo stores ("e2e4", "e7e8q"); every one is validated against the rules, so a corrupt history never renders a wrong board.
export function replayGame(moves: readonly string[], timestamps: readonly number[], h: GameHeaders): Game {
  const chess = new Chess();
  chess.setHeader("Event", h.event);
  if (h.date) chess.setHeader("Date", h.date);
  chess.setHeader("White", h.white);
  chess.setHeader("Black", h.black);
  chess.setHeader("Result", h.result);
  const plies: Ply[] = moves.map((m, i) => {
    let san: string;
    try {
      san = chess.move({ from: m.slice(0, 2), to: m.slice(2, 4), promotion: m.slice(4, 5) || undefined }).san;
    } catch {
      throw new IllegalGame(`illegal move "${m}" at ply ${i + 1}`);
    }
    return { san, fen: chess.fen(), t: timestamps[i] ?? null };
  });
  return { plies, pgn: chess.pgn() };
}
