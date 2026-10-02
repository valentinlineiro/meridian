// Walk JSON and record {path, type}. Caller upserts into schema_observations.
export type Observation = { path: string; valueType: string; example: string | null };

export function observeSchema(data: any, maxNodes = 5000): Observation[] {
  const counts = new Map<string, { n: number; example: string | null }>();
  let visited = 0;
  const typeOf = (v: any) => (v === null ? "null" : Array.isArray(v) ? "array" : typeof v);
  const walk = (v: any, path: string) => {
    if (visited++ > maxNodes) return;
    if (Array.isArray(v)) {
      // record array itself, then walk first 3 items with [] suffix
      const k = path + "|array";
      bump(k, v.length > 0 ? JSON.stringify(v[0])?.slice(0, 200) ?? null : null);
      v.slice(0, 3).forEach((item) => walk(item, path + "[]"));
      return;
    }
    if (v && typeof v === "object") {
      for (const [key, val] of Object.entries(v)) walk(val, path ? `${path}.${key}` : `$${key.startsWith("$") ? "" : "."}${key}`);
      return;
    }
    bump(`${path}|${typeOf(v)}`, JSON.stringify(v)?.slice(0, 200) ?? null);
  };
  const bump = (k: string, ex: string | null) => {
    const e = counts.get(k);
    if (e) { e.n++; if (!e.example && ex) e.example = ex; }
    else counts.set(k, { n: 1, example: ex });
  };
  if (data && typeof data === "object") {
    if (Array.isArray(data)) walk(data, "$");
    else for (const [k, v] of Object.entries(data)) walk(v, "$." + k);
  }
  return [...counts.entries()].map(([k, v]) => {
    const i = k.lastIndexOf("|");
    return { path: k.slice(0, i), valueType: k.slice(i + 1), example: v.example };
  });
}
