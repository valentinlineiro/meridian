import type { GameKey } from "./LinkedinGames.ts";

export interface ParsedEntry { line: number; date: string; game: GameKey; score: string; avg: string | null }
export interface LineError { line: number; text: string; reason: string }

// The one place to teach the parser a game. Pinpoint and Crossclimb are not here on purpose: they need their own result shape
// (guesses, not time) and an explicit decision first (contract L10).
const ALIASES: Record<string, GameKey> = {
  p: "patches", patches: "patches", w: "wend", wend: "wend", s: "mini_sudoku", sudoku: "mini_sudoku", minisudoku: "mini_sudoku",
  z: "zip", zip: "zip", q: "queens", queens: "queens", t: "tango", tango: "tango",
};
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[\s_-]+/g, "");
const gameOf = (s: string): GameKey | undefined => ALIASES[norm(s)];

const SECONDS = /^\d{1,4}$/;
const CLOCK = /^\d{1,2}:[0-5]\d$/;
/** Seconds or M:SS in, M:SS out (the form the domain stores and validates); null when it is neither. */
const clock = (t: string): string | null =>
  CLOCK.test(t) ? t : SECONDS.test(t) && Number(t) <= 5999 ? `${Math.floor(Number(t) / 60)}:${String(Number(t) % 60).padStart(2, "0")}` : null;

const SHORT = /^([A-Za-zÀ-ÿ_][A-Za-zÀ-ÿ_ -]*?)[\s,;|:]+(\d{1,2}:[0-5]\d|\d{1,4})(?:[\s,;|]+(\d{1,2}:[0-5]\d|\d{1,4}))?$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DELIMS = ["\t", "|", ";", ","];
const MARKDOWN_RULE = /^[\s|:-]+$/;

const minusDays = (date: string, n: number): string => new Date(Date.parse(`${date}T00:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10);

/**
 * Free text the owner types (`Z, 6, 12`, one game per line, optional `ayer` / `2026-11-08` date lines) or a pasted table with
 * Fecha / Juego / Mi_seg / Media_seg columns (CSV, TSV or Markdown). Never throws: what it cannot read comes back as a line error.
 */
export function parseGamesText(text: string, today: string): { entries: ParsedEntry[]; errors: LineError[] } {
  const entries: ParsedEntry[] = [];
  const errors: LineError[] = [];
  let date = today;
  let table: { delim: string; fecha: number; juego: number; mi: number; media: number } | null = null;

  text.split(/\r?\n/).forEach((raw, i) => {
    const line = i + 1;
    const t = raw.trim();
    if (!t) return;
    const fail = (reason: string) => errors.push({ line, text: t, reason });
    const push = (d: string, g: string, score: string | null, avg: string | null, what: string) => {
      const game = gameOf(g);
      if (!game) return fail(`juego desconocido «${g}»`);
      if (score === null) return fail(`${what}: tiempo no válido`);
      entries.push({ line, date: d, game, score, avg });
    };

    if (table) {
      if (MARKDOWN_RULE.test(t) && t.includes("-")) return;
      const c = t.replace(/^\||\|$/g, "").split(table.delim).map((x) => x.trim());
      const d = /^(\d{4}-\d{2}-\d{2})(?:[ T].*)?$/.exec(c[table.fecha] ?? "")?.[1];
      if (!d) return fail("fecha no válida (se espera AAAA-MM-DD)");
      const rawAvg = c[table.media] ?? "";
      return push(d, c[table.juego] ?? "", clock(c[table.mi] ?? ""), rawAvg === "" ? null : clock(rawAvg), "Mi_seg");
    }

    const delim = DELIMS.find((x) => t.includes(x));
    if (delim) {
      const head = t.replace(/^\||\|$/g, "").split(delim).map((x) => norm(x));
      const at = (...names: string[]) => head.findIndex((h) => names.includes(h));
      if (at("fecha") >= 0 && at("juego") >= 0 && at("miseg", "mi") >= 0) {
        table = { delim, fecha: at("fecha"), juego: at("juego"), mi: at("miseg", "mi"), media: at("mediaseg", "media") };
        return;
      }
    }

    if (ISO_DATE.test(t)) { date = t; return; }
    const word = norm(t);
    if (word === "hoy") { date = today; return; }
    if (word === "ayer") { date = minusDays(today, 1); return; }

    const m = SHORT.exec(t);
    if (!m) return fail("no se entiende la línea (esperaba «juego, mis segundos, media»)");
    push(date, m[1]!, clock(m[2]!), m[3] === undefined ? null : clock(m[3]), "tiempo");
  });

  return { entries, errors };
}
