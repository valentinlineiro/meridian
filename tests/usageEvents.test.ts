import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// The keep/cut rules (docs/audits/metrics-meridian-keep-cut.md) judge these by Umami events: a dropped attribute would read as "unused".
const TAGGED: Record<string, string[]> = {
  "features/chess/chess-periods.ts": ['data-umami-event="chess-detail"'],
  "features/chess/chess.html": ['event="chess-profile"'],
  "features/chess/components/matches-table.ts": ["'chess-game-open'"],
  "features/games/games.html": ['data-umami-event="games-weekday"'],
  "features/games/game-report.html": ['event="report-more"', 'event="report-when"', 'event="report-regular"', 'event="report-trust"'],
  "features/languages/languages.html": ['data-umami-event="languages-detail"'],
  "shared/games-register/games-register.ts": ['data-umami-event="games-save"'],
  "shared/section.ts": ['[attr.data-umami-event]="event() || null"'],
};

describe("usage events", () => {
  it.each(Object.entries(TAGGED))("shouldCarryItsEventsWhenReading %s", (file, needles) => {
    const source = readFileSync(`web/src/app/${file}`, "utf8");
    for (const needle of needles) expect(source).toContain(needle);
  });
});
