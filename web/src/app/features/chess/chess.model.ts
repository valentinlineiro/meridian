// API shapes the Chess view reads (src/api/stats.ts) and the small helpers its components share.
export interface Ci { lower: number; upper: number }
export interface Delta { diff: number; lower: number; upper: number }

/** One row of a comparison (colour, opponent segment, opening, phase): src/domain/result.ts summarize() plus a key. */
export interface Group {
  key: string; label?: string | null; name?: string | null;
  games: number; wins: number; losses: number; draws: number; unknown?: number; decided?: number;
  winRate?: number | null; winRateCi?: Ci | null; scoreRate?: number | null;
  disconnections?: number | null; competitive?: { decided: number; winRate?: number | null; winRateCi?: Ci | null } | null;
}

export interface Summary {
  games?: number | null; wins?: number | null; losses?: number | null; draws?: number | null;
  winRate?: number | null; scoreRate?: number | null; currentElo?: number | null; latestElo?: number | null; firstElo?: number | null;
  currentStreak?: number | null; currentStreakKind?: string | null; longestWin?: number | null; longestLoss?: number | null;
}
export interface Results { endConditions?: Record<string, { loss?: number; draw?: number } | undefined> }
export interface ColorStats { groups?: Group[]; difference?: Delta | null }
export interface Opponents { macro?: (Partial<Group> & { key: string; games: number })[]; segments?: Group[]; groups?: Group[] }
export interface OpponentElo { count: number; buckets?: Record<string, number> | unknown[]; min?: number | null; max?: number | null; average?: number | null; note?: string | null }
export interface Timeline { snapshots?: { createdAt: string; elo?: number | null }[] }
export interface Recent extends Partial<Group> { limit?: number; delta?: Delta | null; before?: Partial<Group> | null }
export interface Openings { error?: unknown; white?: Group[]; black?: Group[]; unclassified?: number; population?: { hydrated: number; totalMatches: number } }
export interface Phases { error?: unknown; phases?: Group[]; medianPlies?: number | null; population?: { hydrated?: number | null } }
export interface Mates { error?: unknown; given?: { label: string; games: number }[]; received?: { label: string; games: number }[]; unclassified?: number }
export interface Tally { faced: number; neutralized: number; missed: number; unpunished: number; rate: number | null; games?: number }
export interface Threats {
  error?: unknown; analysed?: number; pending?: number; invalid?: number; unknownVersion?: number; gamesWithMissed?: number;
  totals?: Tally; byPhase?: Record<'opening' | 'middlegame' | 'endgame', Tally>; recent?: Tally; rest?: Tally;
}

/** Everything one load of the Chess view read. null = that request failed ("No disponible"). summary failing fails the load. */
export interface ChessData {
  s: Summary; r: Results | null; c: ColorStats | null; o: Opponents | null; e: OpponentElo | null; t: Timeline | null;
  op: Openings | null; ph: Phases | null; mt: Mates | null; th: Threats | null; rec: Recent | null;
}

export const NA = 'No disponible';
/** A list as the API promised it, or null: a malformed body degrades its own card instead of throwing into the template. */
export const list = <T>(v: T[] | null | undefined | unknown): T[] | null => Array.isArray(v) ? v as T[] : null;
/** Runs a view builder; a body it cannot read gives `fallback` (that card's unavailable or absent state). */
export const safe = <T, F>(build: () => T, fallback: F): T | F => { try { return build(); } catch (e) { console.error(e); return fallback; } };
export const es = (n: number) => n.toLocaleString('es-ES');
export const dec1 = (v: number) => v.toFixed(1).replace('.', ',');
export const pc0 = (v: number) => Math.round(v) + ' %';
export const fmt = (n: unknown) => n == null ? '—' : String(n);
/** Signed integer with the typographic minus: +100, −40, 0. */
export const signedInt = (n: number) => (n > 0 ? '+' : '') + String(n).replace('-', '−');
export const scaleDelta = (d: Delta | null | undefined, k: number): Delta | null => d ? { diff: d.diff * k, lower: d.lower * k, upper: d.upper * k } : null;

/** '1 derrota', '3 derrotas' */
export const streakWord = (n: number | null | undefined, kind: string | null | undefined): string => {
  const w = kind === 'win' ? ['victoria', 'victorias'] : kind === 'loss' ? ['derrota', 'derrotas'] : null;
  return w ? w[n === 1 ? 0 : 1] : (kind || '—');
};
