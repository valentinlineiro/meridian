import { Chess } from "chess.js";
import { DomainError } from "../kernel/errors.ts";

export class IllegalGame extends DomainError {
  constructor(message: string) { super("ILLEGAL_GAME", message); }
}

// Stored data that is not a move list at all (bad JSON, wrong shapes): a data-integrity problem, distinct from legal-move violations.
export class CorruptGame extends DomainError {
  constructor(message: string) { super("CORRUPT_GAME", message); }
}

export interface Ply { san: string; fen: string; t: number | null }
export interface GameHeaders { event: string; date: string | null; white: string; black: string; result: "1-0" | "0-1" | "1/2-1/2" | "*"; termination?: string | null }
export interface Game { startFen: string; plies: Ply[]; pgn: string }

const COORD_MOVE = /^[a-h][1-8][a-h][1-8][qrbn]?$/;

// Reads the two persisted JSON columns. Timestamps may be fewer than moves (the time is then null) or more (the extras are ignored): the collector filters
// non-finite values, so a length mismatch is a known quirk of the source, not corruption.
export function parseStoredGame(moveJson: string, timestampJson: string): { moves: string[]; timestamps: number[] } {
  let moves: unknown, timestamps: unknown;
  try {
    moves = JSON.parse(moveJson);
    timestamps = JSON.parse(timestampJson);
  } catch {
    throw new CorruptGame("stored move data is not valid JSON");
  }
  if (!Array.isArray(moves) || !moves.every((m) => typeof m === "string")) throw new CorruptGame("stored moves are not a list of strings");
  if (!Array.isArray(timestamps) || !timestamps.every((t) => typeof t === "number" && Number.isFinite(t))) throw new CorruptGame("stored move times are not a list of numbers");
  return { moves, timestamps };
}

// The Result header is the declared result of the match, not derived from the board: resignations, timeouts and disconnections end games the position does not decide.
// `moves` are the coordinate moves Duolingo stores ("e2e4", "e7e8q"); every one is validated against the rules, so a corrupt history never renders a wrong board.
export function replayGame(moves: readonly string[], timestamps: readonly number[], h: GameHeaders): Game {
  const chess = new Chess();
  chess.setHeader("Event", h.event);
  if (h.termination) chess.setHeader("Termination", h.termination);
  if (h.date) chess.setHeader("Date", h.date);
  chess.setHeader("White", h.white);
  chess.setHeader("Black", h.black);
  chess.setHeader("Result", h.result);
  const plies: Ply[] = moves.map((m, i) => {
    if (!COORD_MOVE.test(m)) throw new IllegalGame(`malformed move "${m}" at ply ${i + 1}`);
    let san: string;
    try {
      san = chess.move({ from: m.slice(0, 2), to: m.slice(2, 4), promotion: m.slice(4, 5) || undefined }).san;
    } catch {
      throw new IllegalGame(`illegal move "${m}" at ply ${i + 1}`);
    }
    return { san, fen: chess.fen(), t: timestamps[i] ?? null };
  });
  return { startFen: new Chess().fen(), plies, pgn: chess.pgn() };
}
