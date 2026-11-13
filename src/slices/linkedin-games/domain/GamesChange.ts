import type { Interpretation } from "./GameStats.ts";

// What changed in a game between two dates, judged only by the verdict the interpretation engine already publishes at each date.
// No rule of the engine is repeated here: this maps its output to a state and compares two states (design 2026-11-13, §5).
export type Direction = "mejorando" | "bajando";
export type GameState =
  | { kind: "mejorando" }
  | { kind: "bajando" }
  | { kind: "estable" }
  | { kind: "senal"; dir: Direction } // published "estable" with an unconfirmed candidate
  | { kind: "pocos_datos"; reason: "cobertura_insuficiente" | "sin_calibracion" };

export type GameOutcome =
  | { kind: "cambio_confirmado"; from: GameState; to: GameState }
  | { kind: "senal"; to: GameState }
  | { kind: "sin_cambios"; state: GameState }
  | { kind: "evidencia"; sub: "ganada" | "perdida" | "ausente"; from: GameState; to: GameState }
  | { kind: "no_concluyente"; from: GameState; to: GameState };

export function stateOf(i: Pick<Interpretation, "label" | "reason" | "pending">): GameState {
  switch (i.label) {
    case "mejora_sostenida": return { kind: "mejorando" };
    case "deterioro": return { kind: "bajando" };
    case "datos_insuficientes": return { kind: "pocos_datos", reason: i.reason === "sin_calibracion" ? "sin_calibracion" : "cobertura_insuficiente" };
    default:
      if (i.pending === "deterioro") return { kind: "senal", dir: "bajando" };
      if (i.pending === "mejora_sostenida") return { kind: "senal", dir: "mejorando" };
      return { kind: "estable" };
  }
}

// The published label behind a state: a senal is still "estable" until it is confirmed.
const published = (s: GameState): "mejorando" | "bajando" | "estable" => (s.kind === "senal" ? "estable" : (s.kind as "mejorando" | "bajando" | "estable"));

/** Rules R1..R5 of the design, first match wins. */
export function classify(from: GameState, to: GameState): GameOutcome {
  if (from.kind === "pocos_datos" || to.kind === "pocos_datos") {
    return { kind: "evidencia", sub: from.kind === "pocos_datos" ? (to.kind === "pocos_datos" ? "ausente" : "ganada") : "perdida", from, to };
  }
  if ((from.kind === "mejorando" || from.kind === "bajando") && to.kind === "senal" && to.dir === from.kind) return { kind: "no_concluyente", from, to };
  if (published(from) !== published(to)) return { kind: "cambio_confirmado", from, to };
  if (to.kind === "senal") return { kind: "senal", to };
  return { kind: "sin_cambios", state: to };
}
