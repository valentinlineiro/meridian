import { TestBed, ComponentFixture } from '@angular/core/testing';
import { GameReport } from './game-report';
import type { Range, Summary } from './games.model';

// Synthetic Queens-like summary: only what the report reads.
const BANDS = { '28': [-0.2776, 0.3829], '28v56': [-0.2423, 0.3495], rho112: [-0.1512, 0.1652] };
const win = (median: number, p25: number, p75: number, k: number, nBeat: number) => ({
  time: { median, p25, p75, nTime: nBeat }, eff: { median: 2.0375, nEff: nBeat }, beat: { rate: k / nBeat, k, nBeat },
});
const weekBuckets = [[4, .75], [7, .86], [7, .86], [7, 1], [7, .86], [7, 1], [7, .71], [7, .86], [7, .71], [7, .71], [7, .86], [7, 1], [2, .5]]
  .map(([n, beat], i) => ({ start: `2026-08-${String(10 + i).padStart(2, '0')}`, n: n!, eff: 1.6 + (i % 3) * .3, beat: beat! }));
const cell = (dow: number, n: number, losses: number, lo: number | null, hi: number | null) => ({ dow, n, losses, rate: n ? losses / n : null, lo, hi });
const queens = (o: Record<string, unknown> = {}) => ({
  n: 177, firstDate: '2026-05-17',
  windows: { '7': win(43, 40.5, 51.5, 6, 7), '28': win(43, 36.75, 52, 24, 28), '90': win(43, 35, 52, 75, 89), all: win(46, 36, 56, 146, 177) },
  best: { seconds: 19, date: '2026-09-28' }, beatStreak: { current: 1, max: 13 },
  interpretation: { label: 'estable', reason: null, pending: null, calibratedThrough: '2026-11-03', bands: BANDS },
  adjusted: { label: 'sin_cambio', elasticity: .35, n: 177, windows: { '7': { pct: 11.6, n: 7 }, '28': { pct: 6.09, n: 28 }, '90': { pct: 8.1, n: 89 }, all: { pct: 0, n: 177 } }, trend: { pctPer28d: .3, noise: [-4.7, 4.06], weeks: 16 } },
  recent28vBase56: { delta: -0.0676, nCur: 28, nBase: 55 }, trend112: { rho: .058, slopePctPer28d: 2.32, n: 111, days: 112 },
  trajectory: { '7': [], '28': [], '90': weekBuckets, all: [] },
  losses: { losses: 29, near: 15, cells: [cell(0, 26, 14, .3546, .7124), cell(1, 26, 5, .085, .3787), cell(2, 24, 8, .17, .5), cell(3, 5, 2, null, null), cell(4, 25, 0, 0, .13), cell(5, 25, 0, 0, .13), cell(6, 26, 0, 0, .13)] },
  series: [], ...o,
});
const summary = (games: Record<string, unknown>) => ({ days: 177, from: '2026-05-17', to: '2026-11-10', playStreak: { current: 1, max: 13 }, games }) as unknown as Summary;
const fewData = () => queens({ n: 64, interpretation: { label: 'datos_insuficientes', reason: 'cobertura_insuficiente', pending: null, calibratedThrough: '2026-11-03', bands: BANDS } });

describe('GameReport', () => {
  let fixture: ComponentFixture<GameReport>;
  let el: HTMLElement;
  const open = async (s: Summary, game = 'queens', range: Range = '28') => {
    fixture = TestBed.createComponent(GameReport);
    fixture.componentRef.setInput('summary', s);
    fixture.componentRef.setInput('game', game);
    fixture.componentRef.setInput('range', range);
    await fixture.whenStable();
    el = fixture.nativeElement;
    return el;
  };
  const text = (id: string) => el.querySelector('#' + id)!.textContent!.replace(/\s+/g, ' ').trim();

  it('shouldHeadWithTheCalibratedVerdictItsSourceAndTheFactualSentence', async () => {
    await open(summary({ queens: queens() }));
    expect(el.querySelector('#gameReportHero .pill')!.textContent).toBe('▬ Estable');
    expect(el.querySelector('#gameReportHero app-help summary')!.textContent).toBe('Cómo se calcula');
    expect(text('gameReportSentence')).toContain('Le ganas a la media el 86 % de los días (24 de 28, las últimas 4 semanas)');
    expect(text('gameReportSentence')).toContain('En las 11 semanas completas, entre el 71 % y el 100 % de los días');
    expect(text('gameReportSentence')).toContain('Se pierde más los lunes');
  });

  it('shouldKeepTheAdjustedFormFormulasInComoSeCalcula', async () => {
    await open(summary({ queens: queens() }));
    const help = text('gameReportHero');
    expect(help).toContain('Forma descontando la dificultad');
    expect(help).toContain('Tendencia:');
  });

  describe('first look: the figures and three charts', () => {
    const weekly = Array.from({ length: 12 }, (_, i) => ({ weekStart: `2026-08-${String(3 + i).padStart(2, '0')}`, n: 7, nWithAvg: 7, medianSec: 70 - i, medianAvgSec: 65, medianEff: 1.1 }));
    const series = [{ date: '2026-11-08', eff: 1.5, roll: 1 }, { date: '2026-11-09', eff: 1.0, roll: 1 }, { date: '2026-11-10', eff: 0.7, roll: 1 }];

    it('shouldOpenWithYourTrendBeforeTheLinkedInComparison', async () => {
      await open(summary({ queens: queens({ series }) }));
      const card = el.querySelector('#gameReportFigures')!;
      expect(card.firstElementChild!.textContent).toContain('Tu tendencia');
      expect(card.querySelector('.gr-ref')!.textContent).toContain('Frente a la media de LinkedIn');
      expect(card.querySelector('#gameReportVerdictSentence')!.compareDocumentPosition(card.querySelector('.gr-ref')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it('shouldHeadWithTheBigNumberTheKeyFiguresAndTheVerdictSentence', async () => {
      await open(summary({ queens: queens({ series }) }));
      expect(text('gameFigBig')).toBe('+104 %');
      expect(text('gameFigCap')).toBe('más rápido que la media');
      expect(text('gameFigTime')).toBe('0:43');
      expect(text('gameFigBest')).toBe('0:19');
      expect(text('gameFigGames')).toBe('177');
      expect(text('gameFigStreak')).toMatch(/^1 día/);
      expect(text('gameReportVerdictSentence')).toBe('No hay cambios en las últimas 4 semanas.');
      expect(el.querySelector('#gameReportFigures .gbars')).not.toBeNull();
    });

    it('shouldDrawYourTimeAgainstTheAverageOverTwelveWeeks', async () => {
      await open(summary({ queens: queens({ weekly }) }));
      const svg = el.querySelector('#gameChartEvolution svg')!;
      expect(svg.getAttribute('aria-label')).toBe('Tiempo mediano semanal, tuyo y de la media de LinkedIn, en las últimas 12 semanas: de 1:10 a 0:59.');
      expect(svg.querySelectorAll('polyline')).toHaveLength(2);
      expect(text('gameChartEvolution')).toContain('menos es mejor');
    });

    it('shouldSayTheWeeklySeriesIsUnavailableInsteadOfDrawingAnEmptyChart', async () => {
      await open(summary({ queens: queens() }));
      expect(el.querySelector('#gameChartEvolution svg')).toBeNull();
      expect(text('gameChartEvolution')).toContain('No disponible');
    });

    it('shouldDrawOneBarPerWeekdayAndFadeTheDaysWithTooFewResults', async () => {
      await open(summary({ queens: queens() }));
      const bars = [...el.querySelectorAll('#gameChartWeekdays [data-day]')];
      expect(bars).toHaveLength(7);
      expect(bars[3]!.getAttribute('data-enough')).toBe('false'); // Thursday: 5 results
      expect(bars[0]!.getAttribute('data-enough')).toBe('true');
      expect(text('gameChartWeekdays')).toContain('46 %'); // Monday: 12 of 26
    });

    it('shouldSplitTheResultsAboveInLineAndBelowTheAverage', async () => {
      await open(summary({ queens: queens({ series }) }));
      expect([text('gameSplitAbove'), text('gameSplitLine'), text('gameSplitBelow')]).toEqual(['1 · 33 %', '1 · 33 %', '1 · 33 %']);
      expect(el.querySelector('#gameSplitBar')!.getAttribute('aria-label')).toBe('Resultados de las últimas 4 semanas (3 partidas con media): 1 por encima, 1 en línea y 1 por debajo.');
    });

    it('shouldKeepTheDetailsClosedUnderMasDetalle', async () => {
      await open(summary({ queens: queens({ series }) }));
      const more = el.querySelector<HTMLDetailsElement>('#gameReportMore')!;
      expect(more.open).toBe(false);
      expect(more.querySelector('#gameReportHero')).not.toBeNull();
      expect(more.querySelector('#gameReportWeekdaysNote')).not.toBeNull();
    });
  });

  describe('regularidad', () => {
    it('shouldGiveTheNormalRangeWithItsNAndTheBestTime', async () => {
      await open(summary({ queens: queens() }));
      const t = text('gameReportRange');
      expect(t).toContain('0:37 – 0:52');
      expect(t).toContain('mediana 0:43');
      expect(t).toContain('mejor de siempre 0:19');
      expect(t).toContain('n = 28');
    });
    it('shouldDrawEachWeekWithItsValueAndMarkTheIncompleteOnes', async () => {
      await open(summary({ queens: queens() }));
      const weeks = [...el.querySelectorAll('#gameReportWeeks [data-complete]')];
      expect(weeks).toHaveLength(13);
      expect(weeks.map((w) => w.getAttribute('data-complete')).filter((c) => c === 'false')).toHaveLength(2);
      expect(weeks[3].textContent).toContain('100'); // the value is printed, not a tooltip
    });
    it('shouldGiveWinsAndLossesPerWeekdayInTheChartAndNotRepeatThemInATable', async () => {
      await open(summary({ queens: queens() }));
      const tips = [...el.querySelectorAll('#gameChartWeekdays [data-day] title')].map((t) => t.textContent);
      expect(tips[0]).toBe('lunes: 46 % · 14 derrotas, 12 victorias');
      expect(tips[3]).toBe('jueves: pocas partidas (n = 5)');
      expect(el.querySelector('#gameReportWeekdays')).toBeNull();
      expect(text('gameReportWeekdaysNote')).toContain('Entre semana la media es mucho más rápida');
    });
    it('shouldUseTheSingularForOneLossOrOneWin', async () => {
      const cells = [0, 1, 2, 3, 4, 5, 6].map((d) => cell(d, 10, d === 4 ? 1 : d === 5 ? 9 : 5, 0, .9));
      await open(summary({ queens: queens({ losses: { losses: 41, near: 0, cells } }) }));
      const tips = [...el.querySelectorAll('#gameChartWeekdays [data-day] title')].map((t) => t.textContent);
      expect(tips[4]).toContain('1 derrota, 9 victorias');
      expect(tips[5]).toContain('9 derrotas, 1 victoria');
    });
    it('shouldNotPrintAZeroStreakWhenTheManualLogIsStale', async () => {
      const stale = { ...summary({ queens: queens({ beatStreak: { current: 0, max: 13 } }) }), playStreak: { current: 0, max: 13 }, to: '2026-11-03' } as unknown as Summary;
      await open(stale);
      expect(text('gameReportStreak')).toContain('sin racha activa');
      expect(text('gameReportStreak')).toContain('Sin registro desde 3 nov 2026');
      expect(text('gameReportStreak')).toContain('máxima 13 días');
      expect(text('gameReportStreak')).not.toMatch(/actual 0/);
    });
    it('shouldGiveTheStreaks', async () => {
      await open(summary({ queens: queens() }));
      expect(text('gameReportStreak')).toContain('actual 1 día');
      expect(text('gameReportStreak')).toContain('máxima 13 días');
    });
  });

  it('shouldShowTheLevelOfEveryPeriodAndMarkTheChosenOne', async () => {
    await open(summary({ queens: queens() }), 'queens', '90');
    const rows = [...el.querySelectorAll('#gameReportLevel tbody tr')];
    expect(rows.map((r) => r.querySelector('td')!.textContent!.trim())).toEqual(['Semana', '4 semanas', '3 meses', 'Todo']);
    expect(rows.filter((r) => r.getAttribute('data-selected') === 'true').map((r) => r.querySelector('td')!.textContent!.trim())).toEqual(['3 meses']);
    expect(rows[2].textContent).toContain('75 de 89 (84 %)');
  });

  describe('evolución', () => {
    it('shouldDrawTheWeeklyChartWithItsDataTableAndSayEstimatedOrDetectableInVisibleText', async () => {
      await open(summary({ queens: queens() }));
      expect(el.querySelector('#gameReportEvolution app-games-chart svg')).not.toBeNull();
      expect(el.querySelector('#gameReportEvolution app-help table')).not.toBeNull();
      const t = text('gameReportFacts');
      expect(t).toContain('Forma descontando la dificultad');
      expect(t).toContain('sin cambio detectable · ruido −5 % a +4 % · las últimas 4 semanas · n = 28');
      expect(t).toContain('dentro del ruido de este juego (−24 % a +35 %) · n = 28 y 55');
      expect(t).toContain('estimada · sin cambio detectable · n = 111');
    });
    it('shouldDegradeOnlyTheEvolutionBlockWhenTheTrajectoryIsMalformed', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {}); // safe() logs the unreadable block
    await open(summary({ queens: queens({ trajectory: { '90': 'broken' } }) }));
      expect(text('gameReportEvolution')).toContain('No disponible');
      expect(el.querySelector('#gameReportRange')).not.toBeNull(); // the rest of the report stands
      expect(el.querySelector('#gameReportLevel')).not.toBeNull();
    });
  });

  it('shouldShowWhatIsMissingInsteadOfAVerdictAndTheEvolutionWhenTheGameHasTooFewResults', async () => {
    await open(summary({ tango: fewData() }), 'tango');
    expect(el.querySelector('#gameReportHero .pill')!.textContent).toBe('○ Pocos datos');
    expect(el.textContent).toContain('Faltan observaciones');
    expect(el.querySelector('#gameReportLevel')).not.toBeNull(); // the level is still measurable
    expect(el.querySelector('#gameReportEvolution')).toBeNull();
    expect(el.textContent).not.toMatch(/sin cambio detectable|Ninguna señal supera/i);
  });

  it('shouldApplyThePeriodOnlyToTheBlocksThatDependOnIt', async () => {
    await open(summary({ queens: queens() }), 'queens', '28');
    const weeksBefore = el.querySelector('#gameReportWeeks')!.innerHTML, daysBefore = el.querySelector('#gameChartWeekdays')!.innerHTML;
    const rangeBefore = text('gameReportRange'), factsBefore = text('gameReportFacts');
    fixture.componentRef.setInput('range', '7');
    await fixture.whenStable();
    expect(text('gameReportRange')).not.toBe(rangeBefore);
    expect(text('gameReportRange')).toContain('0:41 – 0:52'); // 40.5 and 51.5 rounded
    expect(text('gameReportFacts')).not.toBe(factsBefore);
    expect(el.querySelector('#gameReportWeeks')!.innerHTML).toBe(weeksBefore);
    expect(el.querySelector('#gameChartWeekdays')!.innerHTML).toBe(daysBefore);
    expect(text('gameReportWeeksWindow')).toContain('90 días');
    expect(text('gameReportWeekdaysWindow')).toContain('todo el histórico');
  });

  describe('fase 2: segundos, ahorro, amplitud y días atípicos', () => {
    const phase2 = { weekly: [{ weekStart: '2026-10-26', n: 7, nWithAvg: 7, medianSec: 43, medianAvgSec: 61, medianEff: 1.42 }, { weekStart: '2026-11-02', n: 2, nWithAvg: 2, medianSec: 50, medianAvgSec: 60, medianEff: 1.2 }],
      savings: { medianSec: 12, totalSec: 5400, n: 150 }, effSpread: { p25: 1.5, p75: 3, ratio: 2, n: 150 }, outliers: { n: 150, minN: 20, good: [{ date: '2026-10-03', eff: 5 }], bad: [] } };

    it('shouldShowTheWeeksInSecondsNewestFirstAndMarkTheIncompleteOnes', async () => {
      await open(summary({ queens: queens(phase2) }));
      const rows = [...el.querySelectorAll('#gameReportSeconds tbody tr')].map((r) => r.textContent!.replace(/\s+/g, ' ').trim());
      expect(rows[0]).toContain('2 nov 2026');
      expect(rows[0]).toContain('0:50');
      expect(rows[0]).toContain('incompleta');
      expect(rows[1]).toContain('0:43');
      expect(rows[1]).toContain('1:01');
      expect(rows[1]).not.toContain('incompleta');
    });

    it('shouldSayTheSavingsTheSpreadAndTheOutliersWithTheirN', async () => {
      await open(summary({ queens: queens(phase2) }));
      const t = text('gameReportExtras');
      expect(t).toContain('ahorras 12 s en la partida mediana (n = 150)');
      expect(t).toContain('Amplitud de la velocidad: de ×1,50 a ×3,00');
      expect(t).toContain('1 muy bueno (3 oct 2026)');
      expect(t).toContain('no calibrada');
    });

    it('shouldShowTheDateOfTheLongestStreak', async () => {
      await open(summary({ queens: queens({ beatStreak: { current: 1, max: 13, maxDate: '2026-10-31' } }) }));
      expect(text('gameReportStreak')).toContain('máxima 13 días (hasta el 31 oct 2026)');
    });

    it('shouldRenderNothingNewWhenTheSummaryPredatesThePhase', async () => {
      await open(summary({ queens: queens() }));
      expect(el.querySelector('#gameReportSeconds')).toBeNull();
      expect(el.querySelector('#gameReportExtras')).toBeNull();
      expect(text('gameReportStreak')).not.toContain('hasta el');
    });
  });
  describe('fase 3: qué destaca', () => {
    const diag = (o: Record<string, unknown> = {}) => ({ status: 'vigente', calibratedThrough: '2026-11-11', dimensions: { weekday: { evaluable: true, reason: null, p: .3 }, regularity: { evaluable: true, reason: null, p: .4 } }, findings: [], watch: null, ...o });
    it('shouldKeepFindingsAndWatchApartAndLeaveTheVerdictAlone', async () => {
      const f = { dimension: 'weekday', sign: 1, kind: 'debilidad', dow: 0, pAdjusted: .01 };
      await open(summary({ queens: queens({ diagnosis: diag({ findings: [f], watch: { dimension: 'regularity', p: .1, unconfirmed: false } }) }) }));
      expect(el.querySelector('#gameReportHighlights .hl')!.textContent).toContain('Debilidad · Los lunes se pierde más');
      expect(text('gameReportWatch')).toContain('Para observar');
      expect(el.querySelector('#gameReportHero .pill')!.textContent).toBe('▬ Estable');
    });
    it('shouldShowOnlyTheStaleMessageWhenExpired', async () => {
      await open(summary({ queens: queens({ diagnosis: diag({ status: 'caducada', dimensions: null }) }) }));
      expect(text('gameReportHighlights')).toContain('Calibración caducada; pendiente de actualizar');
      expect(el.querySelector('.hl')).toBeNull();
    });
    it('shouldNotSayNothingStandsOutWhenTheDayCannotBeTested', async () => {
      await open(summary({ queens: queens({ diagnosis: diag({ dimensions: { weekday: { evaluable: false, reason: 'sin_derrotas_suficientes', p: null }, regularity: { evaluable: true, reason: null, p: .4 } } }) }) }));
      expect(text('gameReportHighlights')).toContain('Sin derrotas suficientes para contrastar el día');
      expect(text('gameReportHighlights')).not.toContain('Nada destaca');
    });
    it('shouldRenderNoBlockWhenTheSummaryPredatesThePhase', async () => {
      await open(summary({ queens: queens() }));
      expect(el.querySelector('#gameReportHighlights')).toBeNull();
    });
  });
});
