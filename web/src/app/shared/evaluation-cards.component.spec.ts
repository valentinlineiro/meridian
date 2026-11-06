import { TestBed } from '@angular/core/testing';
import { EvalFinding, Evaluation, EvaluationCards, evalState } from './evaluation-cards.component';
import { CHANGES, SALIENCE_GRID } from './evaluation-fixtures';

// Port of the card parts of tests/frontendEvaluations.test.ts. Legacy rendered renderEvaluations(payload) to a string; here
// the shared <m-evaluation-cards> renders with What Changed's own contract: findingFor = the finding with the evaluation's id.
type Payload = { findings: readonly { id: string; claim: string; evidence: string }[]; evaluations: readonly unknown[] };
const WIN = '2026-09-20 → 2026-09-27';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const copy = (v: unknown): any => structuredClone(v);

function render(p: Payload, win = WIN): HTMLElement {
  const f = TestBed.createComponent(EvaluationCards);
  f.componentRef.setInput('evaluations', p.evaluations);
  f.componentRef.setInput('findingFor', (e: Evaluation): EvalFinding | undefined => p.findings.find((x) => x.id === e.id));
  f.componentRef.setInput('win', win);
  f.detectChanges();
  return f.nativeElement;
}
const txt = (el: Element) => el.textContent!.replace(/\s+/g, ' ');
const cards = (el: HTMLElement) => [...el.querySelectorAll<HTMLElement>(':scope > .card')];
const card = (el: HTMLElement, title: string) => cards(el).find((c) => c.querySelector('h3')?.textContent === title)!;
const html = (p: Payload) => txt(render(p));

describe('evaluation cards (P0)', () => {
  it('shouldAgreeWithDomainSalienceForEveryEvaluationOverAGrid', () => {
    const want = { finding: ['AFIRMADO'], inconclusive: ['INDICIO'], no_indication: ['SIN INDICIO', 'INSUFICIENTE'] } as Record<string, string[]>;
    expect(SALIENCE_GRID.length).toBeGreaterThan(10);
    for (const { e, salience } of SALIENCE_GRID as { e: Evaluation; salience: string }[]) {
      const got = evalState(e);
      const onlyUncalibrated = e.reasons!.length === 1 && e.reasons![0] === 'calibration_unavailable';
      if (onlyUncalibrated) expect(got).toBe(salience === 'inconclusive' ? 'INSUFICIENTE' : 'SIN INDICIO');
      else expect(want[salience]).toContain(got);
      const limited = e.reasons!.some((r) => r === 'data_unavailable' || r === 'span_too_short' || r === 'insufficient_sample' || (r === 'calibration_unavailable' && got === 'INSUFICIENTE'));
      if (got === 'INSUFICIENTE') expect(limited).toBe(true);
      if (got === 'SIN INDICIO') expect(limited).toBe(false);
    }
  });

  it('shouldShowClaimAndEvidenceWhenEvaluationIsAfirmado', () => {
    const h = html(CHANGES.base);
    expect(h).toContain('AFIRMADO');
    expect(h).toContain('Asimetría por color');
    expect(h).toContain('Evidencia:');
    expect(h).toContain('2026-09-20 → 2026-09-27');
  });

  it('shouldExplainWhatIsMissingWhenEvaluationIsIndicio', () => {
    const h = html(CHANGES.decided9);
    expect(h).toContain('INDICIO');
    expect(h).toContain('9 partidas decididas observadas; el criterio exige al menos 10.');
    expect(h).toContain('no podemos afirmarla');
  });

  it('shouldShowIntervalReasonWhenIntervalIncludesZero', () => {
    expect(html(CHANGES.wide)).toContain('[−16, 72] pp incluye 0');
  });

  it('shouldMarkInsuficienteWhenDataIsUnavailable', () => {
    const h = html(CHANGES.histZero);
    expect(h).toContain('INSUFICIENTE');
    expect(h).toContain('No hay media histórica de referencia.');
  });

  it('shouldMarkSinIndicioWhenEffectIsBelowCriterion', () => {
    const h = html(CHANGES.below);
    expect(h).toContain('SIN INDICIO');
    expect(h).toContain('Diferencia observada entre colores: 4,0 pp');
    expect(h).toContain('no equivale a demostrar que no hubo cambio');
  });

  it('shouldMarkInsuficienteNotSinIndicioWhenTheWindowIsTooShort', () => {
    const h = txt(card(render(CHANGES.short), 'Mayor XP diario'));
    expect(h).not.toContain('SIN INDICIO');
    expect(h).toContain('INSUFICIENTE');
    expect(h).toContain('La ventana contiene 2 días completos (UTC); el criterio exige al menos 3.');
  });

  it('shouldNotRenderMissingHistoricalReferenceAsZeroWhenRateHasNoReference', () => {
    const h = html(CHANGES.noRefRate);
    expect(h).toContain('15 XP por día con registro en la ventana; no hay referencia histórica disponible (+1355 XP)');
    expect(h).not.toContain('0 XP por día con registro histórico');
  });

  it('shouldShowHistoricalReferenceWhenItExists', () => {
    expect(html(CHANGES.refRate)).toContain('20 XP por día con registro en la ventana vs 50 XP por día con registro histórico (+140 XP)');
  });

  it('shouldMarkRatingJumpInsuficienteWhenNoRatingIsObservedInTheWindow', () => {
    const h = txt(card(render(CHANGES.noRating), 'Salto de ELO'));
    expect(h).toContain('INSUFICIENTE');
    expect(h).not.toContain('SIN INDICIO');
    expect(h).toContain('dos observaciones de ELO en snapshots distintos');
  });

  it('shouldQuoteTheCriteriaCarriedByTheEvaluationNotACopy', () => {
    const p = copy(CHANGES.decided9);
    p.evaluations.find((e: Evaluation) => e.id === 'CHESS_COLOR_ASYMMETRY')!.criteria = { minDecided: 77, minDiffPp: 15 };
    expect(html(p)).toContain('el criterio exige al menos 77.');
  });

  it('shouldNotInventACriterionWhenTheEvaluationCarriesNone', () => {
    const p = copy(CHANGES.decided9);
    delete p.evaluations.find((e: Evaluation) => e.id === 'CHESS_COLOR_ASYMMETRY')!.criteria;
    const h = html(p);
    expect(h).toContain('9 partidas decididas observadas; no se alcanza el criterio.');
    expect(h).not.toContain('al menos 10');
  });

  it('shouldNotCallXpObservedInAWindowLearningPace', () => {
    expect(html(CHANGES.pace)).not.toMatch(/aprendizaje|Aceleración/);
  });

  it('shouldRenderIndicioWithAmberPill', () => {
    const pill = [...render(CHANGES.decided9).querySelectorAll('.pill')].find((p) => p.textContent === 'INDICIO')!;
    expect(pill.className).toBe('pill pill-warn');
  });

  it('shouldNotClaimCalibratedLimitsWhenNoBandIsAdmitted', () => {
    expect(html(CHANGES.base)).toContain('sin banda calibrada todavía; datos evaluados hasta');
  });

  it('shouldOrderAfirmadoBeforeIndicioBeforeSinIndicio', () => {
    const h = html(CHANGES.wide);
    expect(h.indexOf('INDICIO')).toBeGreaterThan(-1);
    expect(h.indexOf('INDICIO')).toBeLessThan(h.indexOf('SIN INDICIO'));
    const states = cards(render(CHANGES.wide)).map((c) => c.querySelector('.pill:not(.pill-scope)')!.textContent);
    const order = ['AFIRMADO', 'INDICIO', 'INSUFICIENTE', 'SIN INDICIO'];
    expect(states.map((s) => order.indexOf(s!))).toEqual([...states.map((s) => order.indexOf(s!))].sort());
  });
});

describe('evaluation cards: verdict first, criteria on demand', () => {
  it('shouldCollapseEvaluationsWithoutAnAnswerAndKeepAffirmedOnesOpen', () => {
    const el = render(CHANGES.short);
    const xp = card(el, 'Mayor XP diario');
    expect(xp.tagName).toBe('DETAILS');
    expect(xp.className).toBe('card evcard');
    expect(xp.hasAttribute('open')).toBe(false);
    expect(txt(xp)).toContain('INSUFICIENTE');
    expect(txt(xp)).toContain('La ventana contiene 2 días completos (UTC); el criterio exige al menos 3.');
    const affirmed = cards(el).find((c) => txt(c).includes('AFIRMADO'))!;
    expect(affirmed.tagName).toBe('DIV');
    expect(affirmed.className).toBe('card');
  });
});

describe('A7: calibrated rules abstain on screen', () => {
  const elo = (p: Payload) => txt(card(render(p), 'Salto de ELO'));
  it('shouldShowInsuficienteWithTheObservedEffectWhenTheUsualVariationIsUnknown', () => {
    const h = elo(CHANGES.eloDown40);
    expect(h).toContain('INSUFICIENTE');
    expect(h).toContain('Cambio de ELO observado: −40 puntos en 10 partidas entre las dos lecturas. Sin referencia de variación habitual todavía.');
    expect(h).not.toContain('SIN INDICIO');
  });
  it('shouldShowSinIndicioWhenThereIsNoEffect', () => {
    expect(elo(CHANGES.elo0)).toContain('SIN INDICIO');
  });
  it('shouldAttributeCalibrationOnlyToTheRulesThatUseIt', () => {
    const el = render(CHANGES.base);
    expect(txt(card(el, 'Asimetría por color'))).toContain('con intervalo de confianza del 95 %');
    expect(txt(card(el, 'Asimetría por color'))).not.toContain('calibrados');
    for (const t of ['Salto de ELO', 'Mayor XP diario']) {
      expect(txt(card(el, t))).toContain('sin banda calibrada todavía; datos evaluados hasta 2026-11-05');
      expect(txt(card(el, t))).not.toContain('calibrados con tu historial');
    }
  });
  it('shouldClaimCalibrationOnlyWhenTheEdgeOfTheDirectionIsAdmitted', () => {
    expect(elo(CHANGES.up30UpBand)).toContain('calibrados con tu historial (hasta ');
    expect(elo(CHANGES.down30UpBand)).toContain('sin banda calibrada todavía');
    expect(elo(CHANGES.down30DownBand)).toContain('calibrados con tu historial');
    expect(txt(card(render(CHANGES.xpAdmitted), 'Mayor XP diario'))).toContain('calibrados con tu historial');
    expect(txt(card(render(CHANGES.xp14Admitted), 'Mayor XP diario'))).toContain('sin banda calibrada todavía');
  });
  it('shouldNeverQuoteTheRetiredFixedThresholds', () => {
    const h = html(CHANGES.retired);
    expect(h).not.toMatch(/25 puntos|1,3|200 XP|al menos 25|al menos 200/);
    expect(txt(card(render(CHANGES.retired), 'Salto de ELO'))).not.toContain('AFIRMADO');
  });
});

describe('audit P8: evaluation cards use the same notation', () => {
  it('shouldWriteTheObservedRatesAndTheReasonsWithCommaAndSpace', () => {
    const h = html(CHANGES.p8);
    expect(h).toContain('Blancas 64,7 % · Negras 52,3 %');
    expect(h).toContain('Diferencia observada entre colores: 12,4 pp');
    expect(h.match(/.{0,25}(\d\.\d+ ?(%|pp)|\d%).{0,10}/g)).toBeNull();
  });
});

describe('evaluation cards: a malformed evaluation degrades alone', () => {
  it('shouldShowOnlyTheMalformedEvaluationAsUnavailable', () => {
    const p = copy(CHANGES.decided9);
    p.evaluations.find((e: Evaluation) => e.id === 'CHESS_COLOR_ASYMMETRY')!.reasons = 'insufficient_sample';
    const el = render(p);
    expect(cards(el).length).toBe(3);
    expect(txt(card(el, 'Asimetría por color'))).toContain('No disponible');
    expect(txt(card(el, 'Salto de ELO'))).toContain('SIN INDICIO');
    expect(txt(card(el, 'Mayor XP diario'))).not.toContain('No disponible');
  });

  it('shouldShowTheCardAsUnavailableInsteadOfNaNWhenAMetricIsNotANumber', () => {
    const p = copy(CHANGES.decided9);
    p.evaluations.find((e: Evaluation) => e.id === 'CHESS_COLOR_ASYMMETRY')!.metrics.decidedCount = 'nine';
    const el = render(p);
    expect(el.textContent).not.toContain('NaN');
    expect(txt(card(el, 'Asimetría por color'))).toContain('No disponible');
    expect(cards(el).length).toBe(3);
  });

  it('shouldSkipAnEntryThatIsNotAnEvaluationAndKeepTheOthers', () => {
    const p = { findings: [], evaluations: [null, 7, ...copy(CHANGES.decided9).evaluations] };
    const el = render(p);
    expect(cards(el).length).toBe(3);
  });

  it('shouldNeverPrintUndefinedAsTheTitleOfAnEvaluationWithoutId', () => {
    const el = render({ findings: [], evaluations: [{ kind: 'statistical', status: 'not_emitted', reasons: ['effect_below_threshold'], metrics: {}, criteria: {} }] });
    expect(el.querySelector('h3')!.textContent).toBe('Evaluación'); // same name as its "No disponible" card
    expect(txt(el)).not.toContain('undefined');
  });

  it('shouldNameAnUnknownEvaluationByItsIdWithAnEmptyScope', () => {
    const el = render({ findings: [], evaluations: [{ id: 'NEW_RULE', kind: 'statistical', status: 'not_emitted', reasons: ['effect_below_threshold'], metrics: {}, criteria: {} }] });
    expect(el.querySelector('h3')!.textContent).toBe('NEW_RULE');
    expect(txt(el)).toContain('El efecto observado no alcanza el criterio.');
    expect(txt(el)).toContain(`Ventana: ${WIN} · con intervalo de confianza del 95 %`);
  });
});
