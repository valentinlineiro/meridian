import { gameName, Verdict, VERDICT_ORDER, verdictFor, verdictKey } from '../../core/words';

// The shape of GET /api/me/linkedin-games/changes (src/slices/linkedin-games/application/GetGamesChange.ts). The web never sees the engine behind it.
export type GameState =
  | { kind: 'mejorando' } | { kind: 'bajando' } | { kind: 'estable' }
  | { kind: 'senal'; dir: 'mejorando' | 'bajando' }
  | { kind: 'pocos_datos'; reason: 'cobertura_insuficiente' | 'sin_calibracion' };
export type GameOutcome =
  | { kind: 'cambio_confirmado'; from: GameState; to: GameState }
  | { kind: 'senal'; to: GameState }
  | { kind: 'sin_cambios'; state: GameState }
  | { kind: 'evidencia'; sub: 'ganada' | 'perdida' | 'ausente'; from: GameState; to: GameState }
  | { kind: 'no_concluyente'; from: GameState; to: GameState };
export interface GameChangeRow { game: string; from: GameState | null; to: GameState; outcome: GameOutcome | null }
export interface GamesChange {
  mode: 'compare' | 'current-only' | 'invalid-window';
  since: string | null; until: string;
  elapsedDays: number | null; playedDaysInWindow: number | null;
  games: GameChangeRow[];
}

export interface GamesChangeView {
  heading: string;
  summary: string;
  notice: string | null;
  rows: { game: string; verdict: Verdict; text: string }[];
}

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic'];
const short = (d: string) => `${Number(d.slice(8, 10))} ${MONTHS[Number(d.slice(5, 7)) - 1]}`;
const days = (n: number) => `${n} ${n === 1 ? 'día' : 'días'}`;
const LABEL: Record<'mejorando' | 'bajando' | 'estable', string> = { mejorando: 'Mejorando', bajando: 'Bajando', estable: 'Estable' };
const label = (s: GameState) => LABEL[s.kind === 'senal' || s.kind === 'pocos_datos' ? 'estable' : s.kind];

const VERDICT_OF_STATE = (s: GameState): Verdict =>
  s.kind === 'mejorando' ? verdictFor({ label: 'mejora_sostenida', pending: null })
    : s.kind === 'bajando' ? verdictFor({ label: 'deterioro', pending: null })
    : s.kind === 'senal' ? verdictFor({ label: 'estable', pending: s.dir === 'bajando' ? 'deterioro' : 'mejora_sostenida' })
    : s.kind === 'pocos_datos' ? verdictFor({ label: 'datos_insuficientes', pending: null })
    : verdictFor({ label: 'estable', pending: null });
const NO_CONCLUYENTE: Verdict = { state: 'no-signal', dir: null, label: 'No concluyente', pill: 'pill', sentence: '' };
const SIN_CAMBIOS: Verdict = { state: 'no-signal', dir: null, label: 'Sin cambios', pill: 'pill', sentence: '' };

const isUncalibrated = (s: GameState) => s.kind === 'pocos_datos' && s.reason === 'sin_calibracion';
const SIN_CALIBRACION = 'sin calibración todavía, no se puede valorar su tendencia.';


function rowOf(r: GameChangeRow, c: GamesChange) {
  const name = gameName(r.game), o = r.outcome, since = c.since ? short(c.since) : '', until = short(c.until);
  if (!o) {
    const v = VERDICT_OF_STATE(r.to);
    return { verdict: v, group: 10 + VERDICT_ORDER.indexOf(verdictKey(v)), text: `${name}: ${isUncalibrated(r.to) ? SIN_CALIBRACION : `${v.label}. ${v.sentence}`}` };
  }
  switch (o.kind) {
    case 'cambio_confirmado': {
      const evidence = o.to.kind === 'bajando' ? 'Vas más lento que antes y se mantiene desde hace una semana.'
        : o.to.kind === 'mejorando' ? 'Vas más rápido que antes y se mantiene desde hace una semana.' : 'Ya no se aprecia la tendencia.';
      return { verdict: VERDICT_OF_STATE(o.to), group: 0, text: `${name}: de ${label(o.from)} a ${label(o.to)} (${since} → ${until}). ${evidence}` };
    }
    case 'senal':
      return { verdict: VERDICT_OF_STATE(o.to), group: 1, text: `${name}: posible ${o.to.kind === 'senal' && o.to.dir === 'mejorando' ? 'mejora' : 'empeoramiento'}. Se confirma si se repite la semana que viene.` };
    case 'no_concluyente':
      return { verdict: NO_CONCLUYENTE, group: 2, text: `${name}: no se puede concluir. Su tendencia estaba confirmada y dejó de estarlo.` };
    case 'sin_cambios':
      return { verdict: SIN_CAMBIOS, group: 3, text: `${name}: sigue ${label(o.state)}, igual que el ${since}.` };
    case 'evidencia': {
      const v = VERDICT_OF_STATE(o.to);
      if (isUncalibrated(o.to)) return { verdict: v, group: 4, text: `${name}: ${SIN_CALIBRACION}` };
      const text = o.sub === 'ganada' ? `${name}: ahora hay datos suficientes. Está ${label(o.to)}. El ${since} no había base para compararlo.`
        : o.sub === 'perdida' ? `${name}: ya no hay datos suficientes para valorarlo.` : `${name}: pocos datos para comparar.`;
      return { verdict: v, group: 4, text };
    }
  }
}

function summaryOf(rows: { group: number }[], mode: GamesChange['mode']): string {
  if (mode === 'current-only') return '';
  const n = (g: number) => rows.filter((r) => r.group === g).length;
  const parts: [number, (k: number) => string][] = [
    [n(0), (k) => `${k} ${k === 1 ? 'cambió' : 'cambiaron'}`], [n(1), (k) => `${k} ${k === 1 ? 'señal' : 'señales'}`],
    [n(2), (k) => `${k} no ${k === 1 ? 'concluyente' : 'concluyentes'}`], [n(3), (k) => `${k} sin cambios`], [n(4), (k) => `${k} con pocos datos`],
  ];
  return parts.filter(([k]) => k > 0).map(([k, f]) => f(k)).join(', ');
}

export function gamesChangeView(c: GamesChange): GamesChangeView {
  const heading = c.mode === 'current-only' ? 'Games · estado actual' : c.mode === 'invalid-window' || c.elapsedDays === null ? 'Games'
    : `Games · ${short(c.since!)} → ${short(c.until)} (${days(c.elapsedDays)})`;
  const built = c.mode === 'invalid-window' ? [] : c.games.map((g) => ({ game: g.game, ...rowOf(g, c) }));
  built.sort((a, b) => a.group - b.group || a.game.localeCompare(b.game));
  const notice = c.mode === 'invalid-window' ? 'Esta ventana es demasiado corta para comparar.'
    : c.games.length === 0 ? 'Aún no hay partidas de Games.'
    : c.mode === 'compare' && c.playedDaysInWindow === 0 ? 'No registraste Games en este periodo.' : null;
  return { heading, summary: summaryOf(built, c.mode), notice, rows: built.map(({ game, verdict, text }) => ({ game, verdict, text })) };
}
