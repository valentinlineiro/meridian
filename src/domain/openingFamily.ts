// Opening families (no variants), named from the first plies of the game in coordinate notation. The longest matching prefix wins, so a specific line
// beats the generic "open game" / "closed game" buckets. Prefixes are at most 5 plies long.
const LINES: ReadonlyArray<readonly [key: string, prefix: string]> = [
  ["ruy_lopez", "e2e4 e7e5 g1f3 b8c6 f1b5"],
  ["italian", "e2e4 e7e5 g1f3 b8c6 f1c4"],
  ["scotch", "e2e4 e7e5 g1f3 b8c6 d2d4"],
  ["four_knights", "e2e4 e7e5 g1f3 b8c6 b1c3"],
  ["petrov", "e2e4 e7e5 g1f3 g8f6"],
  ["philidor", "e2e4 e7e5 g1f3 d7d6"],
  ["kings_gambit", "e2e4 e7e5 f2f4"],
  ["vienna", "e2e4 e7e5 b1c3"],
  ["open_game", "e2e4 e7e5"],
  ["sicilian", "e2e4 c7c5"],
  ["french", "e2e4 e7e6"],
  ["caro_kann", "e2e4 c7c6"],
  ["scandinavian", "e2e4 d7d5"],
  ["alekhine", "e2e4 g8f6"],
  ["pirc", "e2e4 d7d6"],
  ["pirc", "e2e4 g7g6"],
  ["queens_gambit", "d2d4 d7d5 c2c4"],
  ["london", "d2d4 d7d5 c1f4"],
  ["closed_game", "d2d4 d7d5"],
  ["indian", "d2d4 g8f6"],
  ["dutch", "d2d4 f7f5"],
  ["english", "c2c4"],
  ["reti", "g1f3 d7d5"],
  ["reti", "g1f3 g8f6"],
  ["bird", "f2f4"],
  ["larsen", "b2b3"],
  ["vant_kruijs", "e2e3"],
  ["mieses", "d2d3"],
  ["saragossa", "c2c3"],
];

export const OPENING_FAMILY_LABELS: Record<string, string> = {
  ruy_lopez: "Española (Ruy López)",
  italian: "Italiana",
  scotch: "Escocesa",
  four_knights: "Cuatro Caballos",
  petrov: "Petrov (Rusa)",
  philidor: "Philidor",
  kings_gambit: "Gambito de Rey",
  vienna: "Vienesa",
  open_game: "Partida Abierta",
  sicilian: "Siciliana",
  french: "Francesa",
  caro_kann: "Caro-Kann",
  scandinavian: "Escandinava",
  alekhine: "Alekhine",
  pirc: "Pirc / Moderna",
  queens_gambit: "Gambito de Dama",
  london: "Sistema Londres",
  closed_game: "Partida Cerrada",
  indian: "Defensas Indias",
  dutch: "Holandesa",
  english: "Inglesa",
  reti: "Reti",
  bird: "Bird",
  larsen: "Larsen",
  vant_kruijs: "Van't Kruijs",
  mieses: "Mieses",
  saragossa: "Saragossa",
  other: "Otra apertura",
  unclassified: "Sin datos",
};

const PARSED = LINES.map(([key, prefix]) => ({ key, plies: prefix.split(" ") })).sort((a, b) => b.plies.length - a.plies.length);

export function classifyOpeningFamily(moves: readonly string[]): string {
  if (moves.length < 2) return "unclassified";
  const head = moves.slice(0, 5).map((m) => m.trim().toLowerCase());
  return PARSED.find((l) => l.plies.every((p, i) => head[i] === p))?.key ?? "other";
}
