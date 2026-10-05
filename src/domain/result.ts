// What a match result means. One classifier and one denominator for every route that talks about wins.

type RawResult = { result?: string | null; outcome?: string | null };

export function resultOf(m: RawResult): "win" | "loss" | "draw" | "unknown" {
  const r = (m.result ?? m.outcome ?? "").toLowerCase();
  if (r.includes("win") || r.includes("victor") || r === "won") return "win";
  if (r.includes("los") || r.includes("defeat")) return "loss";
  if (r.includes("draw") || r.includes("tie") || r.includes("stalemate")) return "draw";
  return "unknown";
}

export function summarize(rows: readonly RawResult[]) {
  let wins = 0, losses = 0, draws = 0;
  for (const m of rows) {
    const r = resultOf(m);
    if (r === "win") wins++; else if (r === "loss") losses++; else if (r === "draw") draws++;
  }
  const games = rows.length;
  const decided = wins + losses + draws;
  // Rates use decided games only: an unknown result is not a loss, so it stays out of the denominator and is reported apart.
  return { games, wins, losses, draws, unknown: games - decided, winRate: decided ? wins / decided : null, scoreRate: decided ? (wins + 0.5 * draws) / decided : null, decided };
}
