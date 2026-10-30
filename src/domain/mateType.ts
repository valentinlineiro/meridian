import { Chess, type Square } from "chess.js";

export type MateType = "back_rank" | "scholars" | "fools" | "smothered" | "queen" | "rook" | "bishop" | "knight" | "pawn";

export const MATE_TYPE_LABELS: Record<string, string> = {
  back_rank: "Mate del pasillo",
  scholars: "Mate del pastor",
  fools: "Mate del loco",
  smothered: "Mate ahogado",
  queen: "Mate con dama",
  rook: "Mate con torre",
  bishop: "Mate con alfil",
  knight: "Mate con caballo",
  pawn: "Mate con peón",
};

const BY_PIECE = { q: "queen", r: "rook", b: "bishop", n: "knight", p: "pawn" } as const;

const neighbours = (sq: Square): Square[] => {
  const f = sq.charCodeAt(0), r = Number(sq[1]);
  const out: Square[] = [];
  for (let df = -1; df <= 1; df++) for (let dr = -1; dr <= 1; dr++) {
    const nf = f + df, nr = r + dr;
    if ((df || dr) && nf >= 97 && nf <= 104 && nr >= 1 && nr <= 8) out.push(`${String.fromCharCode(nf)}${nr}` as Square);
  }
  return out;
};

// Only a game that ends in checkmate has a type; anything else (including moves that do not replay) is null.
// "Pasillo" = the mated king stands on its back rank and the checking rook/queen is on that same rank.
export function classifyMate(moves: readonly string[]): MateType | null {
  const chess = new Chess();
  try {
    for (const m of moves) chess.move({ from: m.slice(0, 2), to: m.slice(2, 4), promotion: m.slice(4, 5) || undefined });
  } catch {
    return null;
  }
  return classifyMatePosition(chess);
}

// The mate is named for the piece that gives check, which after a discovered check is not the piece that moved. In a double check the moved piece wins.
export function classifyMatePosition(chess: Chess): MateType | null {
  const history = chess.history({ verbose: true });
  if (!history.length || !chess.isCheckmate()) return null;

  const last = history.at(-1)!;
  const mated = chess.turn();
  const king = chess.board().flat().find((p) => p && p.type === "k" && p.color === mated)!.square;
  const checkers = chess.attackers(king, mated === "w" ? "b" : "w");
  const from = checkers.includes(last.to) ? last.to : checkers[0]!;
  const piece = chess.get(from)!.type as keyof typeof BY_PIECE;

  if (history.length === 4) return "fools";
  if (history.length <= 8 && piece === "q" && (from === "f7" || from === "f2")) return "scholars";
  if (piece === "n" && neighbours(king).every((s) => chess.get(s)?.color === mated)) return "smothered";
  const backRank = mated === "w" ? "1" : "8";
  if ((piece === "r" || piece === "q") && king[1] === backRank && from[1] === backRank) return "back_rank";
  return BY_PIECE[piece];
}
