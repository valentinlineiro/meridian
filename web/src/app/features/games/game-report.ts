import { Component, computed, input } from '@angular/core';
import { fmtDate } from '../../core/format';
import { safe } from '../../core/guard';
import { verdictFor } from '../../core/words';
import { Help } from '../../shared/help';
import { Section } from '../../shared/section';
import { resultBars, ResultBars } from '../../shared/result-bars';
import { Stats } from '../../shared/stats';
import { VerdictPill } from '../../shared/verdict';
import { fmtClock } from '../../core/format';
import { diagnosisBlock, evidenceLines, evolutionFacts, extraLines, levelRows, normalRange, reportSentence, resultSplit, secondsWeeks, weekdayReport, weekdayWins, weeklyBeat, weeklyTimes } from './game-report.model';
import { GamesChart } from './games-chart';
import { figures, gbeatStreak, formLines, gdays, interpretationLines, Range, RANGE_NAMES, staleTitle, Summary, trajectory } from './games.model';

type Wk = NonNullable<ReturnType<typeof weeklyTimes>>[number];

/**
 * The report of one game: regularity first, then level, evolution and what the data do and do not say. Every block is built on its own
 * (a body it cannot read degrades that block alone); nothing here is computed beyond what game-report.model.ts returns.
 */
@Component({
  selector: 'app-game-report',
  imports: [GamesChart, Help, ResultBars, Section, Stats, VerdictPill],
  templateUrl: './game-report.html',
})
export class GameReport {
  readonly summary = input.required<Summary>();
  readonly game = input.required<string>();
  readonly range = input.required<Range>();

  protected readonly fmtDate = fmtDate;
  protected readonly gdays = gdays;
  protected readonly x = computed(() => this.summary().games[this.game()]!);
  protected readonly rangeName = computed(() => RANGE_NAMES[this.range()]);
  protected readonly verdict = computed(() => safe(() => verdictFor(this.x().interpretation), null));
  protected readonly sentence = computed(() => safe(() => reportSentence(this.x(), this.range()), [] as string[]));
  protected readonly how = computed(() => safe(() => [...interpretationLines(this.x()), ...formLines(this.x(), this.range())], [] as string[]));
  /** Too little history to judge: the report says what is missing instead of the evolution. */
  protected readonly few = computed(() => safe(() => this.x().interpretation.label === 'datos_insuficientes', false));
  protected readonly nr = computed(() => safe(() => normalRange(this.x(), this.range()), null));
  protected readonly weekly = computed(() => safe(() => weeklyBeat(this.x()), null));
  protected readonly weekdays = computed(() => safe(() => weekdayReport(this.x()), null));
  protected readonly diag = computed(() => safe(() => diagnosisBlock(this.x()), null));
  protected readonly level = computed(() => safe(() => levelRows(this.x()), null));
  protected readonly facts = computed(() => safe(() => {
    const f = evolutionFacts(this.x(), this.range());
    return [f.adjusted, f.recent, f.trend].map((m) => ({ l: m.title, v: m.value, s: m.note }));
  }, null));
  /** The weekly (90-day) trajectory the chart draws; null when it cannot be read. */
  protected readonly traj = computed(() => safe(() => trajectory(this.summary(), this.game(), '90'), null));
  /** The run of days beating the average, as the list says it: a stale manual log is "sin racha activa", never a zero. */
  protected readonly streak = computed(() => safe(() => ({ now: gbeatStreak(this.x(), this.summary()), stale: staleTitle(this.x(), this.summary()), max: gdays(this.x().beatStreak.max), maxDate: this.x().beatStreak.maxDate ?? null }), null));
  protected readonly seconds = computed(() => safe(() => secondsWeeks(this.x()), null));
  protected readonly extras = computed(() => safe(() => extraLines(this.x()), [] as string[]));
  protected readonly evidence = computed(() => safe(() => evidenceLines(this.x()), [] as string[]));

  // The first look: the big number and the key figures, then three charts that answer three different questions.
  protected readonly figs = computed(() => safe(() => figures(this.x(), this.range()), null));
  protected readonly bars = computed(() => safe(() => resultBars(this.x().series), null));
  protected readonly time = computed(() => safe(() => normalRange(this.x(), this.range())?.median ?? '—', '—'));
  protected readonly best = computed(() => safe(() => fmtClock(Math.round(this.x().best.seconds)), '—'));

  /** Am I improving? Your median time and the published average, week by week (less is better). */
  protected readonly evo = computed(() => safe(() => {
    const w = weeklyTimes(this.x());
    if (!w) return null;
    const secs = w.flatMap((k) => [k.own, ...(k.ref == null ? [] : [k.ref])]);
    const lo = Math.min(...secs), hi = Math.max(...secs), pad = Math.max(2, (hi - lo) * .1), top = hi + pad, bottom = lo - pad;
    const X = (i: number) => w.length < 2 ? 185 : 40 + i * 286 / (w.length - 1), Y = (v: number) => 10 + (top - v) / (top - bottom) * 80;
    const line = (f: (k: Wk) => number | null) => w.flatMap((k, i) => { const v = f(k); return v == null ? [] : [X(i).toFixed(1) + ',' + Y(v).toFixed(1)]; }).join(' ');
    const last = w[w.length - 1]!, c = (v: number) => fmtClock(Math.round(v));
    return {
      own: line((k) => k.own), ref: line((k) => k.ref), lastX: X(w.length - 1).toFixed(1), lastY: Y(last.own).toFixed(1),
      ticks: [top, (top + bottom) / 2, bottom].map((v) => ({ y: Y(v).toFixed(1), t: c(v) })),
      from: w[0]!.start, to: last.start, ownNow: c(last.own), refNow: last.ref == null ? '—' : c(last.ref),
      aria: `Tiempo mediano semanal, tuyo y de la media de LinkedIn, en las últimas ${w.length} semanas: de ${c(w[0]!.own)} a ${c(last.own)}.`,
    };
  }, null));

  /** When do I play best? The share of results that beat the average, per weekday, next to the game's overall share. */
  protected readonly wd = computed(() => safe(() => {
    const r = weekdayWins(this.x());
    const Y = (v: number) => 90 - v * 70;
    return {
      overallY: r.overall == null ? null : Y(r.overall).toFixed(1),
      bars: r.rows.map((d, i) => { const h = d.rate == null ? 3 : Math.max(3, d.rate * 70); return { x: 4 + i * 46.5, cx: 21 + i * 46.5, y: (90 - h).toFixed(1), h, ty: (90 - h - 5).toFixed(1), letter: d.letter, day: d.day, enough: d.rate != null, stands: d.stands, text: d.rate == null ? '—' : this.pct(d.rate), n: d.n, tip: d.rate == null ? `${d.day}: pocas partidas (n = ${d.n})` : `${d.day}: ${this.pct(d.rate)} · ${this.count(d.losses, 'derrota')}, ${this.count(d.wins, 'victoria')}` }; }),
    };
  }, null));

  /** How many of my results are better, level or worse than the average (the period's results). */
  protected readonly split = computed(() => safe(() => {
    const r = resultSplit(this.x(), this.range(), this.summary().to);
    if (!r) return null;
    const p = (n: number) => `${n} · ${Math.round(n / r.n * 100)} %`;
    return {
      above: p(r.above), line: p(r.line), below: p(r.below), flex: [r.above, r.line, r.below],
      aria: `Resultados de ${RANGE_NAMES[this.range()]} (${r.n} partidas con media): ${r.above} por encima, ${r.line} en línea y ${r.below} por debajo.`,
    };
  }, null));

  protected count = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;
  protected pct = (r: number) => Math.round(r * 100) + ' %';
  protected short = (d: string) => d.slice(8, 10) + '/' + d.slice(5, 7);
}
