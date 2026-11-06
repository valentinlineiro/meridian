import { colorConclusion, fmtDelta, formatMatchDate, pc1, pctCi, relDate, shortDate } from './format';
import { esc } from './escape';

describe('format', () => {
  it('shouldUseCommaDecimalsAndTypographicMinus', () => {
    expect(fmtDelta({ diff: 25, lower: 3.8, upper: 43.3 })).toBe('+25,0 pp · IC95 [+3,8; +43,3]');
    expect(fmtDelta({ diff: 2.5, lower: -23, upper: 25.4 })).toBe('+2,5 pp · IC95 [−23,0; +25,4] · sin evidencia suficiente');
  });
  it('shouldShowDashWhenThereIsNoDelta', () => expect(fmtDelta(null)).toBe('—'));
  it('shouldNeverClaimNoDifference', () => expect(fmtDelta({ diff: 0, lower: -5, upper: 5 })).not.toMatch(/sin diferencia/i)); // tests/frontendDeltas
  it('shouldWriteIntervalsLikeTheColourConclusionDoes', () => expect(fmtDelta({ diff: 5.6, lower: 1.04, upper: 10.3 })).toBe('+5,6 pp · IC95 [+1,0; +10,3]'));
  it('shouldNotPrintSignedZeroForTheDiff', () => {
    expect(fmtDelta({ diff: -0.04, lower: -0.3, upper: 0.2 })).toMatch(/^0,0 pp · IC95 \[−0,3; \+0,2\]/);
  });
  it('shouldKeepTheTrueSignOfALimitThatRoundsToZeroAndNotLabelIt', () => {
    expect(fmtDelta({ diff: 10, lower: 0.4, upper: 20 })).toBe('+10,0 pp · IC95 [+0,4; +20,0]');
  });
  it('shouldLabelWhenALimitIsZeroOrRoundsToZeroFromBelow', () => {
    expect(fmtDelta({ diff: 10, lower: -0.4, upper: 20 })).toBe('+10,0 pp · IC95 [−0,4; +20,0] · sin evidencia suficiente');
    expect(fmtDelta({ diff: 10, lower: 0, upper: 20 })).toBe('+10,0 pp · IC95 [0,0; +20,0] · sin evidencia suficiente');
  });
  it('shouldWritePercentWithSpace', () => {
    expect(pc1(62)).toBe('62,0 %');
    expect(pctCi(0.646, { lower: 0.62, upper: 0.68 })).toBe('64,6 % [62–68]');
    expect(pctCi(0.646, null)).toBe('64,6 %');
    expect(pctCi(null, null)).toBe('—');
  });
  it('shouldFormatShortDateAsDayAndSpanishMonth', () => {
    expect(shortDate('2026-11-03')).toBe('03-nov');
    expect(shortDate('x')).toBe('x');
  });
  it('shouldSayRelativeDaysInSpanish', () => {
    vi.useFakeTimers().setSystemTime(new Date('2026-11-06T12:00:00Z'));
    try {
      expect(relDate('')).toBe('—');
      expect(relDate('2026-11-06T01:00:00Z')).toBe('hoy');
      expect(relDate('2026-11-05T01:00:00Z')).toBe('ayer');
      expect(relDate('2026-11-01T12:00:00Z')).toBe('hace 5d');
    } finally {
      vi.useRealTimers();
    }
  });
  it('shouldFormatMatchDateWithTimeThenFallBackToFirstSeenThenDash', () => {
    expect(formatMatchDate(1790000000, '2026-09-20T14:13:20.000Z')).toMatch(/·.*\d{1,2}:\d{2}/);
    const fallback = formatMatchDate(null, '2026-09-28T12:00:00Z');
    expect(fallback).toMatch(/\d{1,2}\s+[a-záéíóú]+/i);
    expect(fallback).not.toContain('·');
    expect(formatMatchDate(undefined, undefined)).toBe('—');
  });
  it('shouldEscapeHtmlInBuiltStrings', () => {
    expect(esc('<img src="x" onerror=a&b>')).toBe('&lt;img src=&quot;x&quot; onerror=a&amp;b&gt;');
    expect(esc(null)).toBe('');
  });
});

// Ports of uxPhase4 "5. Color" / "10. Ajustes de revisión" colorConclusion cases.
describe('colorConclusion', () => {
  it('shouldSayNoWhenTheIntervalIncludesZero', () => {
    expect(colorConclusion(3.4, -5, 12, { met: false })).toMatchObject({ detectable: false, line1: 'Diferencia detectable: no (+3,4 pp · IC95 [−5,0; +12,0] pp, incluye 0)' });
    expect(colorConclusion(5.6, 0.9, 10.3, { met: false })).toMatchObject({ detectable: true, line2: 'Patrón persistente: no demostrado' });
    expect(colorConclusion(5.6, 0.9, 10.3, { met: true })).toMatchObject({ line2: 'Patrón persistente: sí' });
  });
  it('shouldShowTheObservedDifferenceWithOneDecimalAndTheSameIntervalPrecision', () => {
    expect(colorConclusion(5.575, 0.886, 10.266, { met: false })!.line1).toBe('Diferencia detectable: sí (+5,6 pp · IC95 [+0,9; +10,3] pp, excluye 0)');
    expect(colorConclusion(-13.3, -35, 11, { met: false })!.line1).toBe('Diferencia detectable: no (−13,3 pp · IC95 [−35,0; +11,0] pp, incluye 0)');
  });
  it('shouldSaySinEvaluarWhenTheRuleIsUnknownAndNothingWithoutAnInterval', () => {
    expect(colorConclusion(1, 0.5, 2, { known: false, label: 'X' })!.line2).toBe('X: sin evaluar');
    expect(colorConclusion(1, null, 2)).toBeNull();
  });
});
