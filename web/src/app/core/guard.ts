// A malformed body must degrade its own card, never throw into a template (shared by every view).

/** A list as the API promised it, or null. */
export const list = <T>(v: T[] | null | undefined | unknown): T[] | null => Array.isArray(v) ? v as T[] : null;
/** Runs a view builder; a body it cannot read gives `fallback` (that card's unavailable or absent state). */
export const safe = <T, F>(build: () => T, fallback: F): T | F => { try { return build(); } catch (e) { console.error(e); return fallback; } };
