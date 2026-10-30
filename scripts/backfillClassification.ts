// Fills match_details.opening_family / mate_type for matches saved before migration 0017.
//   node --experimental-strip-types scripts/backfillClassification.ts <rows.json> [--apply-sql=<out.sql>]
// <rows.json> is [{match_id, end_condition, move_history}] or the output of `wrangler d1 execute --json` over that query. Without --apply-sql it only prints counts (dry run).
// The script never touches a database: the owner applies the generated SQL.
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { classifyGame } from "../src/domain/gameClassification.ts";

export interface BackfillRow { match_id: string; end_condition: string | null; move_history: string }
export interface BackfillCounts { families: Record<string, number>; mates: Record<string, number>; skipped: number }

const BATCH = 100;
const quote = (s: string) => `'${s.replaceAll("'", "''")}'`;

const parseMoves = (json: string): string[] | null => {
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) && v.every((m) => typeof m === "string") ? v : null;
  } catch {
    return null;
  }
};

// Run after applying the SQL and compare with the dry-run counts: a stale id or a partly applied batch shows up as a difference.
const VERIFY_SQL = "SELECT opening_family, COUNT(*) AS n FROM match_details GROUP BY opening_family;\nSELECT mate_type, COUNT(*) AS n FROM match_details WHERE mate_type IS NOT NULL GROUP BY mate_type;\n";

export function buildBackfill(rows: readonly BackfillRow[]): { sql: string; counts: BackfillCounts; verifySql: string } {
  const counts: BackfillCounts = { families: {}, mates: {}, skipped: 0 };
  const statements: string[] = [];
  for (const r of [...rows].sort((a, b) => (a.match_id < b.match_id ? -1 : a.match_id > b.match_id ? 1 : 0))) {
    const moves = parseMoves(r.move_history);
    if (!moves) { counts.skipped++; continue; }
    const { openingFamily, mateType } = classifyGame(moves);
    counts.families[openingFamily] = (counts.families[openingFamily] ?? 0) + 1;
    const mate = r.end_condition === "checkmate" ? mateType : null; // the board and the recorded ending must agree
    if (mate) counts.mates[mate] = (counts.mates[mate] ?? 0) + 1;
    statements.push(`UPDATE match_details SET opening_family=${quote(openingFamily)}, mate_type=${mate ? quote(mate) : "NULL"} WHERE match_id=${quote(r.match_id)};`);
  }
  const batches: string[] = [];
  for (let i = 0; i < statements.length; i += BATCH) batches.push(`-- batch ${i / BATCH + 1}\n${statements.slice(i, i + BATCH).join("\n")}`);
  return { sql: batches.join("\n") + (batches.length ? "\n" : ""), counts, verifySql: VERIFY_SQL };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [file, ...flags] = process.argv.slice(2);
  if (!file) { console.error("usage: backfillClassification.ts <rows.json> [--apply-sql=<out.sql>]"); process.exit(2); }
  const raw = JSON.parse(readFileSync(file, "utf8"));
  const rows: BackfillRow[] = Array.isArray(raw) && raw[0]?.results ? raw.flatMap((b: { results: BackfillRow[] }) => b.results) : raw;
  const { sql, counts, verifySql } = buildBackfill(rows);
  console.log(JSON.stringify(counts, null, 2));
  const out = flags.find((f) => f.startsWith("--apply-sql="))?.slice("--apply-sql=".length);
  if (out) { writeFileSync(out, sql); console.log(`wrote ${out}\nafter applying, verify with:\n${verifySql}`); } else console.log("dry run: no SQL written");
}
