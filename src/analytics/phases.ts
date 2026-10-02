export type PhaseKey = "opening" | "middlegame" | "endgame" | "unknown";

export interface PhaseMetadata {
  key: PhaseKey;
  label: string;
  description: string;
}

export const PHASE_META: Record<PhaseKey, PhaseMetadata> = {
  opening: { key: "opening", label: "Apertura (< 40 plies)", description: "Resuelta en fase temprana" },
  middlegame: { key: "middlegame", label: "Medio juego (40–80 plies)", description: "Desarrollo y combate táctico" },
  endgame: { key: "endgame", label: "Final (> 80 plies)", description: "Simplificación y final profundo" },
  unknown: { key: "unknown", label: "Desconocida", description: "Sin jugadas registradas" },
};

export function classifyPhase(plyCount: number): PhaseKey {
  if (plyCount <= 0 || !Number.isFinite(plyCount)) return "unknown";
  if (plyCount < 40) return "opening";
  if (plyCount <= 80) return "middlegame";
  return "endgame";
}
