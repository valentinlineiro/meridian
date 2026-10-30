// RFC 4180 CSV. Text that starts like a spreadsheet formula gets a leading ' so Excel/Sheets read it as text (opponent names are untrusted).
// Known cost: a text starting with '-' keeps the visible ' in a plain CSV; numbers are never prefixed.
const FORMULA_START = /^[=+\-@\t\r]/;

const cell = (v: string | number | null): string => {
  if (v === null) return "";
  const s = typeof v === "string" && FORMULA_START.test(v) ? `'${v}` : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
};

export function toCsv(header: readonly string[], rows: ReadonlyArray<ReadonlyArray<string | number | null>>): string {
  return [header, ...rows].map((r) => r.map(cell).join(",") + "\r\n").join("");
}
