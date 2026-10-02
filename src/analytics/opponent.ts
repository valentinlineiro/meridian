export type OpponentSegment =
  | "noisy_neural"
  | "neural"
  | "blended"
  | "stockfish"
  | "pvp"
  | "unknown";

export const OPPONENT_SEGMENT_LABELS: Record<OpponentSegment, string> = {
  noisy_neural: "Noisy Neural",
  neural: "Neural",
  blended: "Blended",
  stockfish: "Stockfish",
  pvp: "PvP",
  unknown: "Desconocido",
};

export function classifyOpponentSegment(
  opponentId: string | null | undefined,
  opponentType?: string | null | undefined
): OpponentSegment {
  const raw = (opponentId || "").trim();
  if (!raw) return opponentType === "pvp" ? "pvp" : "unknown";
  if (/^\d+$/.test(raw)) return "pvp";
  const id = raw.toLowerCase();
  if (id.startsWith("noisy_neural")) return "noisy_neural";
  if (id.startsWith("neural")) return "neural";
  if (id.startsWith("blended")) return "blended";
  if (id.includes("stockfish")) return "stockfish";
  return "unknown";
}
