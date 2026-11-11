import { TestBed } from '@angular/core/testing';
import { EvalFinding, Evaluation, EvaluationCards, evalState } from './evaluation-cards';
import { CHANGES, SALIENCE_GRID } from './evaluation-fixtures';

// Port of the card parts of tests/frontendEvaluations.test.ts. Legacy rendered renderEvaluations(payload) to a string; here
// the shared <m-evaluation-cards> renders with What Changed's own contract: findingFor = the finding with the evaluation's id.
type Payload = { findings: readonly { id: string; claim: string; evidence: string }[]; evaluations: readonly unknown[] };
const WIN = 'Del 20 al 27 de septiembre';
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

  it('shouldSpeakTheGamesVerdictWordsNotTheEngineStates', () => {
    for (const d of [CHANGES.base, CHANGES.wide, CHANGES.decided9]) expect(html(d)).not.toMatch(/AFIRMADO|INDICIO|INSUFICIENTE/);
  });

  it('shouldShowClaimAndEvidenceWhenEvaluationIsAfirmado', () => {
    const h = html(CHANGES.base);
    expect(h).toContain('Confirmado');
    expect(h).toContain('Asimetría por color');
    expect(h).toContain('Evidencia:');
    expect(h).toContain('Del 20 al 27 de septiembre');
  });

  it('shouldExplainWhatIsMissingWhenEvaluationIsIndicio', () => {
    const h = html(CHANGES.decided9);
    expect(h).toContain('Posible señal');
    expect(h).toContain('Tienes 9 partidas con ganador; hacen falta 10 para fiarse.');
    expect(h).toContain('no podemos darla por buena');
  });

  it('shouldShowIntervalReasonWhenIntervalIncludesZero', () => {
    expect(html(CHANGES.wide)).toContain('entre −16 y +72 puntos de %, es decir, también podría no existir');
  });

  it('shouldMarkInsuficienteWhenDataIsUnavailable', () => {
    const h = html(CHANGES.histZero);
    expect(h).toContain('Aún pocos datos');
    expect(h).toContain('Aún no tenemos suficientes días anteriores para saber cuál es tu XP normal.');
  });

  it('shouldMarkSinIndicioWhenEffectIsBelowCriterion', () => {
    const h = html(CHANGES.below);
    expect(h).toContain('Sin señales de cambio');
    expect(h).toContain('Entre blancas y negras hay 4,0 puntos de % de diferencia');
    expect(h).toContain('no demuestra que no haya habido cambio');
  });

  it('shouldMarkInsuficienteNotSinIndicioWhenTheWindowIsTooShort', () => {
    const h = txt(card(render(CHANGES.short), 'Mayor XP diario'));
    expect(h).not.toContain('Sin señales de cambio');
    expect(h).toContain('Aún pocos datos');
    expect(h).toContain('El periodo tiene 2 días completos; hacen falta 3.');
  });

  it('shouldNotRenderMissingHistoricalReferenceAsZeroWhenRateHasNoReference', () => {
    const h = html(CHANGES.noRefRate);
    expect(h).toContain('15 XP por día en este periodo; aún no hay historial con el que comparar (+1355 XP)');
    expect(h).not.toContain('0 XP por día con registro histórico');
  });

  it('shouldShowHistoricalReferenceWhenItExists', () => {
    expect(html(CHANGES.refRate)).toContain('20 XP por día en este periodo vs 50 XP por día en tu historial (+140 XP)');
  });

  it('shouldMarkRatingJumpInsuficienteWhenNoRatingIsObservedInTheWindow', () => {
    const h = txt(card(render(CHANGES.noRating), 'Salto de ELO'));
    expect(h).toContain('Aún pocos datos');
    expect(h).not.toContain('Sin señales de cambio');
    expect(h).toContain('Falta una lectura de tu ELO antes o después de este periodo');
  });

  it('shouldQuoteTheCriteriaCarriedByTheEvaluationNotACopy', () => {
    const p = copy(CHANGES.decided9);
    p.evaluations.find((e: Evaluation) => e.id === 'CHESS_COLOR_ASYMMETRY')!.criteria = { minDecided: 77, minDiffPp: 15 };
    expect(html(p)).toContain('hacen falta 77 para fiarse.');
  });

  it('shouldNotInventACriterionWhenTheEvaluationCarriesNone', () => {
    const p = copy(CHANGES.decided9);
    delete p.evaluations.find((e: Evaluation) => e.id === 'CHESS_COLOR_ASYMMETRY')!.criteria;
    const h = html(p);
    expect(h).toContain('Tienes 9 partidas con ganador; todavía no se llega al mínimo para fiarse.');
    expect(h).not.toContain('al menos 10');
  });

  it('shouldNotCallXpObservedInAWindowLearningPace', () => {
    expect(html(CHANGES.pace)).not.toMatch(/aprendizaje|Aceleración/);
  });

  it('shouldRenderIndicioWithAmberPill', () => {
    const pill = [...render(CHANGES.decided9).querySelectorAll('.pill')].find((p) => p.textContent === 'Posible señal')!;
    expect(pill.className).toBe('pill pill-selected');
  });

  it('shouldNotClaimCalibratedLimitsWhenNoBandIsAdmitted', () => {
    expect(html(CHANGES.base)).toContain('aún no sabemos qué es habitual en ti; datos hasta el');
  });

  it('shouldOrderAfirmadoBeforeIndicioBeforeSinIndicio', () => {
    const h = html(CHANGES.wide);
    expect(h.indexOf('Posible señal')).toBeGreaterThan(-1);
    expect(h.indexOf('Posible señal')).toBeLessThan(h.indexOf('Sin señales de cambio'));
    const states = cards(render(CHANGES.wide)).map((c) => c.querySelector('.pill:not(.pill-scope)')!.textContent);
    const order = ['Confirmado', 'Posible señal', 'Aún pocos datos', 'Sin señales de cambio'];
    expect(states.map((s) => order.indexOf(s!))).toEqual([...states.map((s) => order.indexOf(s!))].sort());
  });
});

describe('evaluation cards: verdict first, criteria on demand', () => {
  it('shouldCollapseEvaluationsWithoutAnAnswerAndKeepAffirmedOnesOpen', () => {
    const el = render(CHANGES.short);
    const xp = card(el, 'Mayor XP diario');
    expect(xp.tagName).toBe('DETAILS');
    expect(xp.className.replace(/ ?u-\S+/g, '').trim()).toBe('card evcard');
    expect(xp.hasAttribute('open')).toBe(false);
    expect(txt(xp)).toContain('Aún pocos datos');
    expect(txt(xp)).toContain('El periodo tiene 2 días completos; hacen falta 3.');
    const affirmed = cards(el).find((c) => txt(c).includes('Confirmado'))!;
    expect(affirmed.tagName).toBe('DIV');
    expect(affirmed.className.replace(/ ?u-\S+/g, '').trim()).toBe('card');
  });
});

describe('A7: calibrated rules abstain on screen', () => {
  const elo = (p: Payload) => txt(card(render(p), 'Salto de ELO'));
  it('shouldShowInsuficienteWithTheObservedEffectWhenTheUsualVariationIsUnknown', () => {
    const h = elo(CHANGES.eloDown40);
    expect(h).toContain('Aún pocos datos');
    expect(h).toContain('Tu ELO ha bajado 40 puntos en 10 partidas. Todavía no sabemos cuánto varía normalmente');
    expect(h).not.toContain('Sin señales de cambio');
  });
  it('shouldShowSinIndicioWhenThereIsNoEffect', () => {
    expect(elo(CHANGES.elo0)).toContain('Sin señales de cambio');
  });
  it('shouldAttributeCalibrationOnlyToTheRulesThatUseIt', () => {
    const el = render(CHANGES.base);
    expect(txt(card(el, 'Asimetría por color'))).toContain('este método incluye el valor real en unas 95 de cada 100 repeticiones');
    expect(txt(card(el, 'Asimetría por color'))).not.toContain('calibrados');
    for (const t of ['Salto de ELO', 'Mayor XP diario']) {
      expect(txt(card(el, t))).toContain('aún no sabemos qué es habitual en ti; datos hasta el 5 de noviembre');
      expect(txt(card(el, t))).not.toContain('lo habitual en ti, calculado hasta');
    }
  });
  it('shouldClaimCalibrationOnlyWhenTheEdgeOfTheDirectionIsAdmitted', () => {
    expect(elo(CHANGES.up30UpBand)).toContain('lo habitual en ti, calculado hasta el ');
    expect(elo(CHANGES.down30UpBand)).toContain('aún no sabemos qué es habitual en ti');
    expect(elo(CHANGES.down30DownBand)).toContain('lo habitual en ti, calculado hasta');
    expect(txt(card(render(CHANGES.xpAdmitted), 'Mayor XP diario'))).toContain('lo habitual en ti, calculado hasta');
    expect(txt(card(render(CHANGES.xp14Admitted), 'Mayor XP diario'))).toContain('aún no sabemos qué es habitual en ti');
  });
  it('shouldNeverQuoteTheRetiredFixedThresholds', () => {
    const h = html(CHANGES.retired);
    expect(h).not.toMatch(/25 puntos|1,3|200 XP|al menos 25|al menos 200/);
    expect(txt(card(render(CHANGES.retired), 'Salto de ELO'))).not.toContain('Confirmado');
  });
});

describe('audit P8: evaluation cards use the same notation', () => {
  it('shouldWriteTheObservedRatesAndTheReasonsWithCommaAndSpace', () => {
    const h = html(CHANGES.p8);
    expect(h).toContain('Blancas 64,7 % · Negras 52,3 %');
    expect(h).toContain('Entre blancas y negras hay 12,4 puntos de % de diferencia');
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
    expect(txt(card(el, 'Salto de ELO'))).toContain('Sin señales de cambio');
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
    expect(txt(el)).toContain('El cambio que se ve no llega al mínimo exigido.');
    expect(txt(el)).toContain('Del 20 al 27 de septiembre · este método incluye el valor real en unas 95 de cada 100 repeticiones');
  });
});
