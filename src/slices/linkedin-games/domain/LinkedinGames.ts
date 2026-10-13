import { DomainError } from "../../../kernel/errors.ts";

// The games recorded by hand. Keys match the ingestion contract (docs/contracts/2026-10-13-linkedin-games-ingestion-contract.md).
export const GAME_KEYS = ["wend", "tango", "zip", "patches", "mini_sudoku", "queens"] as const;
export type GameKey = (typeof GAME_KEYS)[number];

export class InvalidGameResult extends DomainError {
  constructor(message: string) {
    super("INVALID_GAME_RESULT", message);
  }
}

export class InvalidPlayDate extends DomainError {
  constructor(message = "the play date must be a real calendar date (YYYY-MM-DD)") {
    super("INVALID_PLAY_DATE", message);
  }
}

const secondsOf = (t: string): number => {
  const m = /^(\d{1,2}):([0-5]\d)$/.exec(t);
  if (!m) throw new InvalidGameResult(`"${t}" is not a time as M:SS`);
  return Number(m[1]) * 60 + Number(m[2]);
};

export function assertPlayDate(v: string): string {
  const d = /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T00:00:00Z`) : null;
  if (!d || Number.isNaN(d.getTime()) || !d.toISOString().startsWith(v)) throw new InvalidPlayDate();
  return v;
}

const MAX_UTC_OFFSET_HOURS = 14; // UTC+14: the earliest calendar date any place on Earth can already be on

// The calendar date it is "now" for the player: in their timezone when it is a valid IANA name, otherwise the latest
// date any timezone could be on, so a valid date is never rejected around midnight for want of a timezone.
export function playerToday(now: Date, tz?: string): string {
  if (tz) {
    try {
      return new Intl.DateTimeFormat("sv-SE", { timeZone: tz }).format(now);
    } catch { /* unknown timezone: fall back below */ }
  }
  return new Date(now.getTime() + MAX_UTC_OFFSET_HOURS * 3_600_000).toISOString().slice(0, 10);
}

export function assertNotFuture(date: string, today: string): string {
  if (date > today) throw new InvalidPlayDate("the play date cannot be after today");
  return date;
}

export interface GameEntry {
  number: number | null;
  score: string;
  scoreSeconds: number;
  avg?: string;
  avgSeconds?: number;
}

export function gameEntry(game: string, input: { score: string; avg?: string | null; number?: number | null }): GameEntry {
  if (!(GAME_KEYS as readonly string[]).includes(game)) throw new InvalidGameResult(`unknown game "${game}"`);
  const number = input.number ?? null;
  if (number !== null && !(Number.isInteger(number) && number > 0)) throw new InvalidGameResult("the puzzle number must be a positive integer");
  const entry: GameEntry = { number, score: input.score.trim(), scoreSeconds: secondsOf(input.score.trim()) };
  if (input.avg != null && input.avg.trim() !== "") {
    entry.avg = input.avg.trim();
    entry.avgSeconds = secondsOf(entry.avg);
  }
  return entry;
}

// A day's cumulative record: what the contract (L8) requires every capture to carry.
export interface DayRecord {
  schema: 1;
  date: string;
  tz?: string;
  games: Record<string, unknown>;
  capturedAt?: string;
}

export const emptyDay = (date: string, tz?: string): DayRecord => ({ schema: 1, date, ...(tz ? { tz } : {}), games: {} });

// Editing a game updates what was typed and keeps what was not: an empty average or puzzle number never erases a stored
// one, and metadata from another capture survives. There is deliberately no way to clear a field (see contract L10).
export function withGame(day: DayRecord, game: string, entry: GameEntry): DayRecord {
  const prev = day.games[game];
  const base = prev && typeof prev === "object" && !Array.isArray(prev) ? (prev as Record<string, unknown>) : {};
  const merged: Record<string, unknown> = { ...base, ...entry };
  if (entry.number === null && base.number != null) merged.number = base.number;
  return { ...day, games: { ...day.games, [game]: merged } };
}

// Same games (ignoring when it was captured): saving it again would only add a duplicate version.
export const sameGames = (a: DayRecord, b: DayRecord): boolean => JSON.stringify(sortKeys(a.games)) === JSON.stringify(sortKeys(b.games));
const sortKeys = (v: unknown): unknown =>
  v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys((v as any)[k])])) : v;
