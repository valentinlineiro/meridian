import { Component, computed, input } from '@angular/core';
import { fmtDate } from '../../core/format';
import { safe } from '../../core/guard';
import { verdictFor } from '../../core/words';
import { Help } from '../../shared/help';
import { Section } from '../../shared/section';
import { Stats } from '../../shared/stats';
import { VerdictPill } from '../../shared/verdict';
import { evidenceLines, evolutionFacts, levelRows, normalRange, reportSentence, weekdayReport, weeklyBeat } from './game-report.model';
import { GamesChart } from './games-chart';
import { gdays, interpretationLines, Range, RANGE_NAMES, Summary, trajectory } from './games.model';

/**
 * The report of one game: regularity first, then level, evolution and what the data do and do not say. Every block is built on its own
 * (a body it cannot read degrades that block alone); nothing here is computed beyond what game-report.model.ts returns.
 */
@Component({
  selector: 'app-game-report',
  imports: [GamesChart, Help, Section, Stats, VerdictPill],
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
  protected readonly how = computed(() => safe(() => interpretationLines(this.x()), [] as string[]));
  /** Too little history to judge: the report says what is missing instead of the evolution. */
  protected readonly few = computed(() => safe(() => this.x().interpretation.label === 'datos_insuficientes', false));
  protected readonly nr = computed(() => safe(() => normalRange(this.x(), this.range()), null));
  protected readonly weekly = computed(() => safe(() => weeklyBeat(this.x()), null));
  protected readonly weekdays = computed(() => safe(() => weekdayReport(this.x()), null));
  protected readonly level = computed(() => safe(() => levelRows(this.x()), null));
  protected readonly facts = computed(() => safe(() => {
    const f = evolutionFacts(this.x(), this.range());
    return [f.adjusted, f.recent, f.trend].map((m) => ({ l: m.title, v: m.value, s: m.note }));
  }, null));
  /** The weekly (90-day) trajectory the chart draws; null when it cannot be read. */
  protected readonly traj = computed(() => safe(() => trajectory(this.summary(), this.game(), '90'), null));
  protected readonly evidence = computed(() => safe(() => evidenceLines(this.x()), [] as string[]));

  protected count = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;
  protected pct = (r: number) => Math.round(r * 100) + ' %';
  protected short = (d: string) => d.slice(8, 10) + '/' + d.slice(5, 7);
}
