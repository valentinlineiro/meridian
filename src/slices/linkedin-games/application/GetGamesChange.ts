import { NotFoundError } from "../../../application/errors.ts";
import { assertPlayDate, type DayRecord } from "../domain/LinkedinGames.ts";
import { summarize } from "../domain/GameStats.ts";
import { classify, stateOf, type GameOutcome, type GameState } from "../domain/GamesChange.ts";
import type { DayRecordStore } from "../ports/DayRecordStore.ts";
import type { OwnerLookup } from "../ports/OwnerLookup.ts";

export interface GameChangeRow { game: string; from: GameState | null; to: GameState; outcome: GameOutcome | null }
export interface GamesChange {
  mode: "compare" | "current-only" | "invalid-window";
  since: string | null;
  until: string;
  elapsedDays: number | null; // until − since, never counted with both ends
  playedDaysInWindow: number | null; // days with at least one result in (since, until]
  games: GameChangeRow[];
}

const NO_BASE: GameState = { kind: "pocos_datos", reason: "cobertura_insuficiente" };
const dayNo = (d: string) => Date.parse(`${d}T00:00:00Z`) / 86_400_000;
const played = (d: DayRecord) => Object.values(d.games).some((g) => typeof (g as { scoreSeconds?: unknown } | null)?.scoreSeconds === "number" && (g as { scoreSeconds: number }).scoreSeconds > 0);

/**
 * The state of every game as the data said on `date`, closing that day (inclusive). The history is cut at `date` before the engine runs:
 * the engine already bounds its windows, but the truncation keeps the answer from depending on that.
 */
export function statesAt(days: DayRecord[], date: string): Map<string, GameState> {
  const s = summarize(days.filter((d) => d.date <= date), date);
  return new Map(Object.entries(s.games).map(([g, x]) => [g, stateOf(x.interpretation)]));
}

export class GetGamesChange {
  constructor(private readonly owners: OwnerLookup, private readonly days: DayRecordStore) {}

  async execute(q: { ownerEmail: string; since: string | null; until: string }): Promise<GamesChange> {
    const until = assertPlayDate(q.until);
    const since = q.since === null ? null : assertPlayDate(q.since);
    const ownerId = await this.owners.resolveOwnerId(q.ownerEmail);
    if (!ownerId) throw new NotFoundError("no owner account");
    if (since !== null && since >= until) return { mode: "invalid-window", since, until, elapsedDays: null, playedDaysInWindow: null, games: [] };
    const days = await this.days.all(ownerId);
    const end = statesAt(days, until);
    if (since === null) {
      return { mode: "current-only", since, until, elapsedDays: null, playedDaysInWindow: null, games: [...end].map(([game, to]) => ({ game, from: null, to, outcome: null })) };
    }
    const start = statesAt(days, since);
    return {
      mode: "compare", since, until,
      elapsedDays: dayNo(until) - dayNo(since),
      playedDaysInWindow: days.filter((d) => d.date > since && d.date <= until && played(d)).length,
      games: [...end].map(([game, to]) => { const from = start.get(game) ?? NO_BASE; return { game, from, to, outcome: classify(from, to) }; }),
    };
  }
}
