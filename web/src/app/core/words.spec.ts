import { beatDays, intervalVerdict, PERIODS, speedWords, typicalTime, verdictFor, VERDICT_ORDER } from './words';

describe('words', () => {
  it('shouldPutARatioInTheRightPlainSpeedPhrase', () => {
    expect([0.5, 0.89, 0.9, 1.09, 1.1, 1.39, 1.4, 1.79, 1.8, 2.04, 2.49, 2.5, 4.4].map(speedWords)).toEqual([
      'más lento', 'más lento', 'a la par', 'a la par', 'un poco más rápido', 'un poco más rápido', 'bastante más rápido', 'bastante más rápido',
      'el doble de rápido', 'el doble de rápido', 'el doble de rápido', 'mucho más rápido', 'mucho más rápido',
    ]);
    expect(speedWords(null)).toBe('—');
  });

  it('shouldSayHowManyDaysOutOfHowMany', () => {
    expect(beatDays(20, 23)).toBe('20 de 23 días');
    expect(beatDays(1, 1)).toBe('1 de 1 día');
    expect(beatDays(null, 5)).toBe('—');
    expect(beatDays(3, 0)).toBe('—');
  });

  it('shouldSayTheNormalTimeWithItsUsualRange', () => {
    expect(typicalTime(52, 47, 60)).toEqual({ main: '0:52', range: 'suele estar entre 0:47 y 1:00' });
    expect(typicalTime(52, null, 60)).toEqual({ main: '0:52', range: '' });
    expect(typicalTime(null, 1, 2)).toEqual({ main: '—', range: '' });
  });

  it('shouldNameThePeriodsTheWayAPlayerSaysThem', () => {
    expect(PERIODS.map((p) => p.l)).toEqual(['Semana', '4 semanas', '3 meses', 'Todo']);
    expect(PERIODS.map((p) => p.phrase)).toEqual(['la última semana', 'las últimas 4 semanas', 'los últimos 3 meses', 'todo el histórico']);
  });

  it('shouldNeverCallNoSignalAProofThatNothingChanged', () => {
    const v = verdictFor({ label: 'estable', pending: null });
    expect(v.label).toBe('Estable');
    expect(v.sentence).toBe('No se ve ningún cambio claro en las últimas 4 semanas.');
    expect(v.sentence).not.toMatch(/sin cambios|no hubo cambio|estable/i);
  });

  it('shouldMapTheEngineLabelsToOneVocabularyWithADirection', () => {
    expect(verdictFor({ label: 'mejora_sostenida', pending: null })).toMatchObject({ state: 'confirmed', dir: 'up', label: 'Mejorando', pill: 'pill pill-win' });
    expect(verdictFor({ label: 'deterioro', pending: null })).toMatchObject({ state: 'confirmed', dir: 'down', label: 'Bajando', pill: 'pill pill-warn' });
    expect(verdictFor({ label: 'datos_insuficientes', pending: null })).toMatchObject({ state: 'few-data', label: 'Pocos datos', pill: 'pill pill-draw' });
    expect(verdictFor({ label: 'estable', pending: null })).toMatchObject({ state: 'no-signal', pill: 'pill' });
  });

  it('shouldCallAnUnconfirmedSignalPossibleWithItsDirection', () => {
    const down = verdictFor({ label: 'estable', pending: 'deterioro' });
    expect(down).toMatchObject({ state: 'possible', dir: 'down', label: 'Posible bajada' });
    expect(down.sentence).toBe('Puede que vayas algo más lento. Si se repite la semana que viene, lo confirmamos.');
    expect(verdictFor({ label: 'estable', pending: 'mejora_sostenida' })).toMatchObject({ state: 'possible', dir: 'up', label: 'Posible mejora' });
  });

  it('shouldListWhatNeedsAttentionFirst', () => {
    expect(VERDICT_ORDER).toEqual(['confirmed-down', 'possible-down', 'possible-up', 'confirmed-up', 'no-signal', 'few-data']);
  });

  describe('intervalVerdict (one observation window against a baseline, with its 95% interval)', () => {
    it('shouldSayPossibleRiseWhenTheIntervalIsAboveZero', () => {
      expect(intervalVerdict({ diff: 6, lower: 1, upper: 11 })).toMatchObject({ state: 'possible', dir: 'up', label: 'Posible mejora', pill: 'pill pill-selected' });
    });
    it('shouldSayPossibleFallWhenTheIntervalIsBelowZero', () => {
      expect(intervalVerdict({ diff: -6, lower: -11, upper: -1 })).toMatchObject({ state: 'possible', dir: 'down', label: 'Posible bajada' });
    });
    it('shouldSayNoSignalWhenTheIntervalIncludesZero', () => {
      for (const d of [{ diff: 6, lower: -8, upper: 20 }, { diff: 0, lower: 0, upper: 3 }, { diff: 2, lower: -3, upper: 0 }])
        expect(intervalVerdict(d)).toMatchObject({ state: 'no-signal', dir: null, label: 'Estable' });
    });
    it('shouldSayFewDataWhenThereIsNoDelta', () => {
      expect(intervalVerdict(null)).toMatchObject({ state: 'few-data', dir: null, label: 'Pocos datos' });
    });
    it('shouldNeverConfirmBecauseNoPersistenceRuleIsApplied', () => {
      for (const d of [{ diff: 30, lower: 20, upper: 40 }, { diff: -30, lower: -40, upper: -20 }, null]) expect(intervalVerdict(d).state).not.toBe('confirmed');
    });
  });
});
