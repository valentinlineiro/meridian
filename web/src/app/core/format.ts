export interface Delta { diff: number; lower: number; upper: number }

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** 'YYYY-MM-DD' -> '03-nov'; anything else comes back as it came. */
export const shortDate = (d: string): string => {
  const m = /^\d{4}-(\d{2})-(\d{2})$/.exec(String(d));
  return m ? `${m[2]}-${MONTHS[Number(m[1]) - 1]}` : String(d);
};

export const relDate = (iso: string): string => {
  if (!iso) return '—';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 864e5);
  return days <= 0 ? 'hoy' : days === 1 ? 'ayer' : `hace ${days}d`;
};

export const pc1 = (n: number): string => `${n.toFixed(1).replace('.', ',')} %`;

export const pctCi = (rate: number | null | undefined, ci?: { lower: number; upper: number } | null): string =>
  rate != null ? pc1(rate * 100) + (ci ? ` [${Math.round(ci.lower * 100)}–${Math.round(ci.upper * 100)}]` : '') : '—';

// raw: a limit keeps its true sign even when it rounds to 0, so [+0,4; …] reads as "excludes 0".
const signed = (v: number, raw = false): string => {
  const n = Math.abs(v).toFixed(1), t = n.replace('.', ',');
  return v === 0 || (!raw && Number(n) === 0) ? t : (v > 0 ? '+' : '−') + t;
};

/** Delta in percentage points; never shown without its interval. */
export const fmtDelta = (d: Delta | null | undefined): string =>
  d
    ? `${signed(d.diff)} pp · IC95 [${signed(d.lower, true)}; ${signed(d.upper, true)}]` +
      (d.lower <= 0 && d.upper >= 0 ? ' · sin evidencia suficiente' : '')
    : '—';

export const formatMatchDate = (playedAt?: number | null, firstSeenAt?: string | null): string => {
  if (playedAt && Number.isFinite(playedAt)) {
    const d = new Date(playedAt * 1000);
    return `${d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })} · ${d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`;
  }
  return firstSeenAt ? new Date(firstSeenAt).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }) : '—';
};

export interface ColorConclusion { detectable: boolean; rule: boolean; line1: string; line2: string }
/**
 * Port of colorConclusion (src/dashboard.client.js:1204), shared by Ajedrez, Trayectoria and Qué cambió: is a colour
 * difference DETECTABLE (its 95% interval excludes 0) and does it meet the stricter rule? lo/hi in percentage points.
 */
export const colorConclusion = (diff: number | null | undefined, lo: number | null | undefined, hi: number | null | undefined,
  rule?: { known?: boolean; met?: boolean; label?: string } | null): ColorConclusion | null => {
  if (lo == null || hi == null) return null;
  const n1 = (v: number) => Math.abs(v).toFixed(1).replace('.', ','), sg = (v: number) => (v > 0 ? '+' : v < 0 ? '−' : '') + n1(v);
  const det = lo > 0 || hi < 0;
  const ruleTxt = rule && rule.known === false ? 'sin evaluar' : rule?.met ? 'sí' : 'no demostrado';
  return {
    detectable: det, rule: rule?.met === true,
    line1: `Diferencia detectable: ${det ? 'sí' : 'no'} (${diff != null ? sg(diff) + ' pp · ' : ''}IC95 [${sg(lo)}; ${sg(hi)}] pp, ${det ? 'excluye 0' : 'incluye 0'})`,
    line2: `${rule?.label || 'Patrón persistente'}: ${ruleTxt}`,
  };
};
