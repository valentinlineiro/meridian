export interface Cell { score: string; avg: string }
export type Values = Record<string, Cell>;
/** What the day already holds, as the day request returns it. */
export type Stored = Record<string, { score?: string | null; avg?: string | null }>;
export type FieldCode = 'game' | 'score' | 'avg' | 'date';
export interface RowError { field: FieldCode; text: string }
export interface Plan {
  set: { game: string; score: string; avg?: string | null }[];
  remove: string[];
  errors: Record<string, RowError>;
}

/**
 * The time field is its own reading: digits are the seconds and minutes, right to left, so "106" is "1:06" and "48" is "0:48".
 * Anything that is not a digit is ignored (a pasted "1:06" gives the same), zero is empty, and four digits are the most a time takes.
 * Backspace removes a digit, never the colon, because the colon is always rebuilt.
 */
export function maskTime(raw: string): string {
  const d = raw.replace(/\D/g, '').replace(/^0+/, '').slice(0, 4);
  return d ? `${d.length > 2 ? d.slice(0, -2) : '0'}:${d.slice(-2).padStart(2, '0')}` : '';
}
export const isTime = (t: string): boolean => /^\d{1,2}:[0-5]\d$/.test(t);

export function errorText(field: FieldCode, typed: string, reason: string): string {
  if (field === 'score') return `«${typed}» no es un tiempo. Escríbelo como m:ss, por ejemplo 1:06.`;
  if (field === 'avg') return `«${typed}» no es una media válida. Escríbela como m:ss, por ejemplo 0:53.`;
  return reason;
}

/** Turns the sheet into the day save: what to set, what to remove, and the rows that cannot be saved as they are. */
export function plan(values: Values, removed: ReadonlySet<string>, stored: Stored | null | undefined, games: string[]): Plan {
  const out: Plan = { set: [], remove: [], errors: {} };
  for (const g of games) {
    const had = stored?.[g];
    if (removed.has(g) && had) { out.remove.push(g); continue; }
    const c = values[g] ?? { score: '', avg: '' };
    if (!c.score && !c.avg) continue;
    if (!c.score) out.errors[g] = { field: 'score', text: 'Falta tu tiempo. La media sola no se guarda.' };
    else if (!isTime(c.score)) out.errors[g] = { field: 'score', text: errorText('score', c.score, '') };
    else if (c.avg && !isTime(c.avg)) out.errors[g] = { field: 'avg', text: errorText('avg', c.avg, '') };
    else out.set.push({ game: g, score: c.score, ...(c.avg ? { avg: c.avg } : had?.avg ? { avg: null } : {}) });
  }
  return out;
}

/** The games whose rows differ from what is stored: the loss a discard would cause. */
export function dirtyGames(values: Values, removed: ReadonlySet<string>, stored: Stored | null | undefined, games: string[]): string[] {
  return games.filter((g) => {
    const had = stored?.[g], c = values[g] ?? { score: '', avg: '' };
    return removed.has(g) ? !!had : c.score !== (had?.score ?? '') || c.avg !== (had?.avg ?? '');
  });
}
