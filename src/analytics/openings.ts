export interface OpeningClassification {
  key: string;
  name: string;
  notation: string;
  color: "white" | "black" | null;
}

export const WHITE_OPENINGS: Record<string, { name: string; notation: string }> = {
  "e2e4": { name: "Peón de Rey", notation: "1. e4" },
  "d2d4": { name: "Peón de Dama", notation: "1. d4" },
  "e2e3": { name: "Apertura Van't Kruijs", notation: "1. e3" },
  "d2d3": { name: "Apertura Mieses", notation: "1. d3" },
  "c2c3": { name: "Apertura Saragossa", notation: "1. c3" },
  "c2c4": { name: "Apertura Inglesa", notation: "1. c4" },
  "g1f3": { name: "Apertura Reti / Zukertort", notation: "1. Cf3" },
};

export const BLACK_OPENINGS: Record<string, { name: string; notation: string }> = {
  "e2e4 e7e5": { name: "Partida Abierta", notation: "1. e4 e5" },
  "d2d4 d7d5": { name: "Partida Cerrada", notation: "1. d4 d5" },
  "e2e4 e7e6": { name: "Defensa Francesa", notation: "1. e4 e6" },
  "e2e4 c7c5": { name: "Defensa Siciliana", notation: "1. e4 c5" },
  "e2e4 c7c6": { name: "Defensa Caro-Kann", notation: "1. e4 c6" },
  "e2e4 d7d5": { name: "Defensa Escandinava", notation: "1. e4 d5" },
  "e2e3 e7e5": { name: "Respuesta a Van't Kruijs", notation: "1. e3 e5" },
  "g1f3 d7d5": { name: "Defensa contra Reti", notation: "1. Cf3 d5" },
  "d2d4 e7e6": { name: "Defensa Horwitz", notation: "1. d4 e6" },
  "d2d4 d7d6": { name: "Defensa Pirc / India", notation: "1. d4 d6" },
  "d2d4 g8f6": { name: "Defensas Indias", notation: "1. d4 Cf6" },
};

export function classifyOpening(
  moves: string[] | null | undefined,
  userColor: "white" | "black" | null | undefined
): OpeningClassification {
  const safeMoves = Array.isArray(moves) ? moves : [];

  if (userColor !== "white" && userColor !== "black") {
    return { key: "unclassified", name: "Sin datos", notation: "-", color: null };
  }

  if (userColor === "white") {
    const raw0 = safeMoves[0];
    if (!raw0) {
      return { key: "unclassified", name: "Sin datos", notation: "-", color: "white" };
    }
    const move0 = raw0.trim().toLowerCase();
    if (!move0) {
      return { key: "unclassified", name: "Sin datos", notation: "-", color: "white" };
    }
    const match = WHITE_OPENINGS[move0];
    if (match) {
      return { key: move0, name: match.name, notation: match.notation, color: "white" };
    }
    return { key: "other_white", name: "Otras secuencias con Blancas", notation: move0, color: "white" };
  } else {
    const raw0 = safeMoves[0];
    const raw1 = safeMoves[1];
    if (!raw0 || !raw1) {
      return { key: "unclassified", name: "Sin datos", notation: "-", color: "black" };
    }
    const m0 = raw0.trim().toLowerCase();
    const m1 = raw1.trim().toLowerCase();
    if (!m0 || !m1) {
      return { key: "unclassified", name: "Sin datos", notation: "-", color: "black" };
    }
    const pair = `${m0} ${m1}`;
    const match = BLACK_OPENINGS[pair];
    if (match) {
      return { key: pair, name: match.name, notation: match.notation, color: "black" };
    }
    return { key: "other_black", name: "Otras secuencias con Negras", notation: pair, color: "black" };
  }
}
