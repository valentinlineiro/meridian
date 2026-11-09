import { NotFoundError } from "../../../application/errors.ts";
import { GAME_KEYS } from "../domain/LinkedinGames.ts";
import type { DayRecordStore } from "../ports/DayRecordStore.ts";
import type { OwnerLookup } from "../ports/OwnerLookup.ts";

const HEADER = "fecha,juego,miseg,mediaseg";
const secs = (v: unknown): string => (typeof v === "number" && Number.isFinite(v) && v > 0 ? String(v) : "");

/** Every recorded result as CSV, in the same columns the quick entry reads back (fecha, juego, miseg, mediaseg): export and import round-trip. */
export class ExportGameResults {
  constructor(private readonly owners: OwnerLookup, private readonly days: DayRecordStore) {}

  async execute(q: { ownerEmail: string }): Promise<string> {
    const ownerId = await this.owners.resolveOwnerId(q.ownerEmail);
    if (!ownerId) throw new NotFoundError("no owner account");
    const lines = [HEADER];
    for (const d of await this.days.all(ownerId)) {
      for (const game of GAME_KEYS) {
        const e = d.games[game] as { scoreSeconds?: unknown; avgSeconds?: unknown } | null | undefined;
        if (!secs(e?.scoreSeconds)) continue; // unplayed or malformed: nothing to export
        lines.push(`${d.date},${game},${secs(e!.scoreSeconds)},${secs(e!.avgSeconds)}`);
      }
    }
    return lines.join("\n") + "\n";
  }
}
