import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TRAJECTORY } from '../evaluations/evaluation-fixtures';
import { Trajectory } from './trajectory';

// Port of tests/frontendTrajectory.test.ts, tests/frontendTrajectoryEvaluations.test.ts and the trajectory cases of
// tests/frontendErrorIsNotZero.test.ts and tests/frontendEmptyAndErrorStates.test.ts. Payloads are the domain's own
// (evaluation-fixtures.ts, frozen from evaluateTrajectory with the legacy tests' inputs).
const FAIL = Symbol('500');
const QUIET = 'No hay patrones longitudinales suficientemente estables registrados en tu historial.';
const copy = <T>(v: T): T => structuredClone(v) as T;
type Any = Record<string, any>;
const chessFinding = (metrics: Any = {}, gamesCount: unknown = 160) => ({
  type: 'CHESS_COLOR_ASYMMETRY_LONGITUDINAL', sample: { gamesCount },
  metrics: { dominantColor: 'white', globalWhiteWinRate: 62.4, globalBlackWinRate: 47, ...metrics },
});
const langFinding = (metrics: Any = {}) => ({
  type: 'LANG_FOCUS_SHIFT_LONGITUDINAL', sample: {},
  metrics: { previousCourseId: 'DUOLINGO_RU_ES', newCourseId: 'DUOLINGO_FR_ES', h1PreviousCourseShare: 80, h1PreviousCourseXp: 4000, h2NewCourseShare: 70, h2NewCourseXp: 3500, ...metrics },
});

describe('Trajectory', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<Trajectory>;
  let el: HTMLElement;

  const tick = async () => { TestBed.tick(); await new Promise((r) => setTimeout(r)); TestBed.tick(); };
  const open = async (body: unknown) => {
    fixture = TestBed.createComponent(Trajectory);
    el = fixture.nativeElement;
    await tick();
    const r = http.expectOne('/api/trajectory');
    expect(r.request.method).toBe('GET');
    if (body === FAIL) r.flush({ error: 'x' }, { status: 500, statusText: 'x' });
    else r.flush(body as object);
    await tick();
    http.verify(); // one request per visit
    return el;
  };
  const findings = () => el.querySelector('#trajectoryFindings')!;
  const html = () => findings().textContent!.replace(/\s+/g, ' ');
  /** The card whose h3 is `title`, as text. */
  const cardText = (title: string) => [...findings().querySelectorAll('.card')].find((c) => c.querySelector('h3')?.textContent === title)?.textContent ?? '';
  const empty = () => el.querySelector<HTMLElement>('#trajectoryEmpty');

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  describe('Frontend Trajectory Tab', () => {
    it('shouldIncludeTrajectoryTabButtonAndSectionInMarkup', async () => {
      await open({ findings: [], evaluations: [], temporalSpan: null });
      expect(el.querySelector('#trajectoryTab')).not.toBeNull();
      expect(el.querySelector('#trajectoryHeader h1')!.textContent).toBe('Tu trayectoria');
      expect(el.querySelector('#trajectorySubtitle')!.textContent).toBe('Síntesis de patrones estables a lo largo de tu historial completo');
      expect(findings()).not.toBeNull();
      expect(empty()).not.toBeNull();
      // rulings 1: no legacy tab-panel/hidden
      expect(el.querySelector('.tab-panel, [hidden]')).toBeNull();
    });

    it('shouldProjectChessAsymmetryMetricsIntoFactualCopy', async () => {
      await open({ findings: [chessFinding()], temporalSpan: null });
      expect(html()).toContain('Asimetría por color');
      expect(html()).toContain('Tu rendimiento con blancas ha sido consistentemente superior al de negras.');
      expect(html()).toContain('Evidencia: 160 partidas · 62 % blancas · 47 % negras · patrón consistente en ambas mitades');
    });

    it('shouldSayBlackIsSuperiorWhenBlackDominates', async () => {
      await open({ findings: [chessFinding({ dominantColor: 'black' })] });
      expect(html()).toContain('Tu rendimiento con negras ha sido consistentemente superior al de blancas.');
    });

    it('shouldProjectLanguageShiftMetricsIntoFactualCopy', async () => {
      await open({ findings: [langFinding()] });
      expect(html()).toContain('Desplazamiento de foco');
      expect(html()).toContain('Tu foco principal de aprendizaje se ha desplazado de Ruso a Francés.');
    });

    it('shouldStateThatLanguageXpIsANetObservedGainWithoutVerifiedContinuity', async () => {
      await open({ findings: [langFinding()] });
      expect(html()).toContain('80 % de tu XP en la primera mitad (4000 XP) → 70 % en la segunda (3500 XP) · XP neto observado entre capturas; no se ha verificado que la serie sea continua');
    });

    it('shouldDisplayQuietEmptyMessageWhenNoFindingsArePresent', async () => {
      await open({ findings: [], evaluations: [], temporalSpan: null });
      expect(empty()!.textContent!.trim()).toBe(QUIET);
      expect(findings().children.length).toBe(0);
    });

    it('shouldTranslateCourseIdsToHumanNamesInLanguageShiftCopy', async () => {
      await open({ findings: [langFinding({ previousCourseId: 'DUOLINGO_RU_EN', newCourseId: 'DUOLINGO_XX_EN' })] });
      // a known language gets its name; an unknown one keeps its id, as in legacy
      expect(html()).toContain('se ha desplazado de Ruso a DUOLINGO_XX_EN.');
    });

    it('shouldSkipAFindingOfAnUnknownType', async () => {
      await open({ findings: [{ type: 'SOMETHING_NEW', metrics: {} }, langFinding()] });
      expect(findings().querySelectorAll('.card').length).toBe(1);
      expect(empty()).toBeNull();
    });
  });

  describe('trajectory evaluations in the UI (P1 #4)', () => {
    it('shouldShowTheEmittedPatternAsAfirmadoWithItsClaimAndWindow', async () => {
      await open(TRAJECTORY.afirmado);
      expect(html()).toContain('AFIRMADO');
      expect(html()).toContain('consistentemente superior');
      expect(html()).toContain('2026-05-01 → 2026-09-01');
      expect(empty()).toBeNull();
    });

    it('shouldLabelTheEvaluationWithItsOwnWindowNotTheCompositeSpanOfTheResponse', async () => {
      const p = copy(TRAJECTORY.indicio) as Any;
      p['temporalSpan'] = { startedAt: '2026-01-01T00:00:00.000Z', endedAt: '2026-09-01T00:00:00.000Z', totalDays: 243 };
      await open(p);
      expect(html()).toContain('Ventana: 2026-05-01 → 2026-09-01');
      expect(html()).not.toContain('2026-01-01');
    });

    it('shouldExplainWhyThereIsNoPatternInsteadOfShowingAnEmptyTab', async () => {
      await open(TRAJECTORY.indicio);
      expect(html()).toContain('INDICIO');
      expect(html()).toContain('días con actividad: 59');
      expect(html()).toContain('El criterio exige al menos 40 decididas por color y 60 días con actividad.');
      expect(empty()).toBeNull();
    });

    it('shouldExplainAPersistenceFailureWithTheSignedDifferencesOfBothHalves', async () => {
      await open(TRAJECTORY.persistence);
      expect(html()).toContain('+25 pp en la primera y +5 pp en la segunda');
      expect(html()).toContain('el criterio exige al menos 10 pp en ambas');
    });

    it('shouldMarkInsuficienteWhenTheHistoryIsTooShort', async () => {
      await open(TRAJECTORY.short);
      expect(html()).toContain('INSUFICIENTE');
      expect(html()).toContain('cubre 59 días; el criterio exige al menos 60');
    });

    it('shouldLabelTheLanguageFocusShiftSinEvaluarBecauseItHasNoEvaluation', async () => {
      await open(TRAJECTORY.langShift);
      expect(html()).toContain('Desplazamiento de foco');
      expect(html().match(/SIN EVALUAR/g)!.length).toBe(1);
      expect(findings().querySelectorAll('.pill.pill-scope').length).toBe(2); // evaluation card scope + the SIN EVALUAR label
    });

    it('shouldRenderPlainCardsWhenThePayloadHasNoEvaluations', async () => {
      const p = copy(TRAJECTORY.afirmado) as Any;
      delete p['evaluations'];
      await open(p);
      expect(html()).toContain('Asimetría por color');
      expect(html()).not.toContain('AFIRMADO');
    });

    it('shouldShowTheQuietEmptyMessageWhenThereIsNothingAtAll', async () => {
      await open({ userId: 'u', temporalSpan: { startedAt: null, endedAt: null, totalDays: null }, findings: [] });
      expect(empty()!.textContent!.trim()).toBe(QUIET);
    });

    it('shouldUseTheResponseSpanWhenTheEvaluationCarriesNoWindow', async () => {
      const p = copy(TRAJECTORY.indicio) as Any;
      delete p['evaluations'][0].metrics.startedAt;
      p['temporalSpan'] = { startedAt: '2026-01-01T00:00:00.000Z', endedAt: '2026-09-01T00:00:00.000Z' };
      await open(p);
      expect(html()).toContain('Ventana: 2026-01-01 → 2026-09-01');
    });

    it('shouldSaySinFechasWhenNeitherTheEvaluationNorTheResponseHasAWindow', async () => {
      const p = copy(TRAJECTORY.indicio) as Any;
      delete p['evaluations'][0].metrics.startedAt;
      p['temporalSpan'] = null;
      await open(p);
      expect(html()).toContain('Ventana: sin fechas');
    });
  });

  describe('what changed / trajectory: absent values are not zero', () => {
    it('shouldNotRoundAMissingColourRateToZeroPercent', async () => {
      await open({ evaluations: [], temporalSpan: null, findings: [chessFinding({ globalWhiteWinRate: null, globalBlackWinRate: 40 }, 10)] });
      expect(html()).toContain('— blancas');
      expect(html()).not.toContain('0 % blancas');
      expect(html()).toContain('40 % negras');
    });
  });

  describe('trajectory: an error message does not outlive the error', () => {
    it('shouldNotKeepTheErrorTextWhenALaterLoadSucceedsWithNoPatterns', async () => {
      await open(FAIL);
      expect(empty()!.textContent).toMatch(/Error al cargar/);
      fixture.destroy();
      await open({ findings: [], evaluations: [], temporalSpan: null }); // the next visit
      expect(empty()!.textContent).not.toMatch(/Error/);
    });
  });

  describe('an error is never an empty state (ruling 3)', () => {
    it('shouldSayErrorAndNeverTheQuietCopyWhenTheRequestFails', async () => {
      await open(FAIL);
      expect(empty()!.textContent!.trim()).toBe('Error al cargar tu trayectoria.');
      expect(el.textContent).not.toContain(QUIET);
      expect(findings().children.length).toBe(0);
    });

    it('shouldShowNeitherCopyWhileLoading', async () => {
      fixture = TestBed.createComponent(Trajectory);
      el = fixture.nativeElement;
      await tick();
      expect(empty()).toBeNull();
      expect(el.querySelector('#trajectoryHeader h1')!.textContent).toBe('Tu trayectoria');
      http.expectOne('/api/trajectory').flush({ findings: [] });
      await tick();
    });

    it('shouldSayErrorWhenTheBodyIsNotAnObject', async () => {
      await open('<html>' as unknown as object);
      expect(empty()!.textContent!.trim()).toBe('Error al cargar tu trayectoria.');
    });
  });

  describe('a malformed part degrades alone (ruling 2)', () => {
    it('shouldShowTheChessCardAsUnavailableInsteadOfNaNWhenARateIsNotANumber', async () => {
      await open({ findings: [chessFinding({ globalWhiteWinRate: 'high' }), langFinding()] });
      const cards = [...findings().querySelectorAll('.card')];
      expect(cards.length).toBe(2);
      expect(cards[0].textContent).toContain('Asimetría por color');
      expect(cards[0].textContent).toContain('No disponible');
      expect(html()).not.toContain('NaN');
      expect(cards[1].textContent).toContain('se ha desplazado de Ruso a Francés');
    });

    it('shouldShowTheChessCardAsUnavailableWhenTheSampleIsMissing', async () => {
      await open({ findings: [{ type: 'CHESS_COLOR_ASYMMETRY_LONGITUDINAL', metrics: { dominantColor: 'white', globalWhiteWinRate: 60, globalBlackWinRate: 40 } }, langFinding()] });
      expect(cardText('Asimetría por color')).toContain('No disponible');
      expect(html()).not.toContain('undefined');
      expect(html()).toContain('Desplazamiento de foco');
    });

    it('shouldShowTheLanguageCardAsUnavailableWhenAnXpIsNotANumber', async () => {
      await open({ findings: [chessFinding(), langFinding({ h2NewCourseXp: '3500 XP' })] });
      expect(cardText('Desplazamiento de foco')).toContain('No disponible');
      expect(html()).toContain('consistentemente superior');
    });

    it('shouldShowTheEvaluationsAsUnavailableWhenTheyAreNotAList', async () => {
      await open({ findings: [langFinding()], evaluations: { CHESS: 1 } });
      expect(cardText('Evaluaciones')).toContain('No disponible');
      expect(html()).toContain('Desplazamiento de foco');
      expect(empty()).toBeNull();
    });

    it('shouldShowTheFindingsAsUnavailableWhenTheyAreNotAList', async () => {
      await open({ ...copy(TRAJECTORY.indicio), findings: 'none' });
      expect(cardText('Patrones')).toContain('No disponible');
      expect(html()).toContain('INDICIO');
    });

    it('shouldKeepTheAfirmadoCardWhenItsFindingCannotBeRead', async () => {
      const p = copy(TRAJECTORY.afirmado) as Any;
      p['findings'][0].metrics.globalWhiteWinRate = 'x';
      await open(p);
      expect(html()).toContain('AFIRMADO');
      expect(html()).not.toContain('NaN');
      expect(empty()).toBeNull();
    });

    it('shouldSkipAFindingThatIsNotAnObject', async () => {
      await open({ findings: [null, 3, langFinding()] });
      expect(findings().querySelectorAll('.card').length).toBe(1);
    });
  });

  it('shouldCancelTheRequestWhenTheViewIsLeftBeforeItAnswers', async () => {
    fixture = TestBed.createComponent(Trajectory);
    await tick();
    const r = http.expectOne('/api/trajectory');
    fixture.destroy();
    expect(r.cancelled).toBe(true); // a late answer has nothing left to paint into
  });
});
