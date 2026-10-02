// Fully invented demo dataset: one account, three courses, 60 chess matches over 30 days.
// Nothing here is derived from a real account or a real upstream response.
import { syntheticSnapshot } from "./syntheticCourse.ts";

export const DEMO_USER = "demo-user";
const DAY = 86_400;
export const DEMO_START = Date.UTC(2026, 8, 1) / 1000; // 2026-09-01T00:00:00Z

// W/L/D with deliberate streaks (a 6-win run, a 4-loss run) so streak and trend analytics have something to find.
const RESULTS = "WWWWWWLWDWLLLLWDWWLWWWDLLWWWWWLDWWWLWWDWLLWWWWDWLWWLWWDWWWWL";
const NAMES = { W: "win", L: "loss", D: "draw" } as const;

/** Chess matches [from, to) as one snapshot payload. Later snapshots re-send earlier matches, as a real history page does. */
export function demoChessSnapshot(from = 0, to = RESULTS.length) {
  const matchHistory = [...RESULTS].slice(from, to).map((r, k) => {
    const i = from + k;
    const ts = DEMO_START + Math.floor((i * 30 * DAY) / RESULTS.length);
    const pvp = i % 7 === 3;
    const opponentId = pvp ? `fixture-opponent-${String(i).padStart(3, "0")}` : `fixture-bot-${String(i % 10).padStart(3, "0")}`;
    const result = NAMES[r as keyof typeof NAMES];
    return {
      matchId: pvp ? `pvp|${ts}|${DEMO_USER}|${opponentId}` : `bot|${ts}|${opponentId}-${i}`,
      opponentId,
      opponentName: pvp ? `Rival ${i}` : `Bot ${i % 10}`,
      opponentType: pvp ? "pvp" : "bot",
      opponentEloRating: pvp ? 800 + (i % 9) * 25 : null, // optional field: absent for bots
      opponentSuspectedCheating: pvp && i % 14 === 3,
      outcome: result,
      result,
      userColor: i % 2 === 0 ? "white" : "black",
      ...(i % 11 === 0 ? {} : { reviewed: i % 5 === 0 }), // optional field omitted now and then
      pvpMatchType: pvp ? (i % 2 ? "rapid" : "blitz") : null,
    };
  });
  return { source: "duolingo-chess", userId: DEMO_USER, data: { eloRating: 900, matchHistory, activeMatches: [], paginationToken: null } };
}

const day = (n: number) => ({ date: DEMO_START + n * DAY, gainedXp: 20 + (n % 5) * 15, numSessions: 1 + (n % 3), totalSessionTime: 300 + (n % 4) * 120 });

/** Language snapshots at two points in time: the active section advances from 2 to 4 completed units. */
export function demoLanguageSnapshots() {
  const early = syntheticSnapshot({ activeCompleted: 2, courseXp: 12_000, totalXp: 50_000, streak: 90, xpSummaries: Array.from({ length: 10 }, (_, n) => day(n)) });
  const late = syntheticSnapshot({ activeCompleted: 4, courseXp: 14_000, totalXp: 52_500, streak: 108, xpSummaries: Array.from({ length: 28 }, (_, n) => day(n)) });
  for (const s of [early, late]) s.user.id = DEMO_USER;
  return [
    { at: "2026-09-10T12:00:00Z", payload: { source: "duolingo-lang", userId: DEMO_USER, data: early } },
    { at: "2026-09-28T12:00:00Z", payload: { source: "duolingo-lang", userId: DEMO_USER, data: late } },
  ];
}
