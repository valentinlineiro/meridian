import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting, TestRequest } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from '../../app.routes';
import { BROWSER_LOCATION } from '../../core/api-client';
import { legacyRedirect } from '../../core/legacy-url';
import { CHANGES } from '../evaluations/evaluation-fixtures';
import { Changes } from './changes';

// Port of tests/frontendWhatChanged.test.ts, tests/frontendVisitAnchor.test.ts and the What Changed cases of
// tests/frontendEmptyAndErrorStates.test.ts, tests/frontendErrorIsNotZero.test.ts, tests/frontendNetwork.test.ts,
// tests/frontendEvaluations.test.ts and tests/frontendDeltas.test.ts. The legacy stateful fake server becomes `serve`, which
// answers every pending request through HttpTestingController.
type Any = Record<string, any>;
const DAY = 864e5;
const NOW = Date.parse('2026-10-08T12:00:00.000Z');
const iso = (msAgo: number) => new Date(NOW - msAgo).toISOString();
const FAIL = Symbol('500'), NET = Symbol('network');
type Reply = Any | typeof FAIL | typeof NET;

const quiet = (since: string, until: string): Any => ({
  interval: { since, until }, baseline: { status: 'exactOrPrevious', observedAt: since },
  chess: { gamesCount: 0, ratingDelta: null, baselineRating: null, currentRating: null, intervalWinRate: null, whiteWinRate: null, blackWinRate: null, historicalWinRateDelta: null },
  languages: { xpGained: 0, sessionsCount: 0, totalSessionMinutes: 0, baselineCourseId: null, currentCourseId: null, courseChanged: false },
  streak: { baselineStreak: null, currentStreak: null, streakDelta: null, status: 'active', streakStarted: false, streakMilestone: null },
  findings: [], evaluations: [],
});
const evaluation = { id: 'LANG_XP_ACCELERATION', kind: 'threshold', status: 'not_emitted', reasons: ['data_unavailable'], metrics: { observedDays: 0 }, criteria: {} };
const quietPayload = (evaluations: unknown[]): Any => ({
  interval: { since: '2026-10-01T00:00:00.000Z', until: '2026-10-08T00:00:00.000Z' },
  chess: { gamesCount: 0, intervalWinRate: null, historicalDelta: null },
  languages: { xpGained: 0, sessionsCount: 0, totalSessionMinutes: 0, baselineCourseId: null, currentCourseId: null, courseChanged: false },
  streak: { baselineStreak: null, currentStreak: null, streakDelta: null, status: 'active' },
  findings: [], evaluations,
});
const activePayload: Any = { ...quietPayload([evaluation]), languages: { ...quietPayload([])['languages'], xpGained: 40, sessionsCount: 2 } };
const withXp = (xp: number): Any => ({ ...activePayload, languages: { ...activePayload['languages'], xpGained: xp } });

const NO_GAMES: Any = { ok: true, change: { mode: 'compare', since: '2026-10-01', until: '2026-10-08', elapsedDays: 7, playedDaysInWindow: 0, games: [] } };
const ZIP_DOWN: Any = { ok: true, change: { mode: 'compare', since: '2026-10-01', until: '2026-10-08', elapsedDays: 7, playedDaysInWindow: 5, games: [
  { game: 'zip', from: { kind: 'estable' }, to: { kind: 'bajando' }, outcome: { kind: 'cambio_confirmado', from: { kind: 'estable' }, to: { kind: 'bajando' } } }] } };

interface Server {
  anchor: string | null; getStatus: number | typeof NET; putStatus: number;
  puts: string[]; anchorReads: number; whatChanged: { since: string; until: string }[]; langReads: number;
  /** The /api/me/linkedin-games/changes requests (since is null in the history mode) and its answer. */
  gamesAsked: { since: string | null; until: string }[]; gamesChange: Reply;
  /** The /api/what-changed answer for a window (default: a quiet body whose until is `shownUntil` or the one asked for). */
  wc: (since: string, until: string) => Reply; langs: Reply; shownUntil?: string;
}

describe('Changes', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<Changes>;
  let el: HTMLElement;
  let server: Server;

  const tick = async () => { TestBed.tick(); await new Promise((r) => setTimeout(r)); TestBed.tick(); };
  const pending = (): TestRequest[] => http.match(() => true).filter((r) => !r.cancelled);
  const answer = (r: TestRequest, reply: Reply) => {
    if (reply === FAIL) r.flush({ ok: false, error: 'internal error' }, { status: 500, statusText: 'x' });
    else if (reply === NET) r.error(new ProgressEvent('error'));
    else r.flush(reply);
  };
  const handle = (r: TestRequest) => {
    const { url, method } = r.request;
    if (url === '/api/me/changes-anchor' && method === 'PUT') {
      const t = (r.request.body as { seenThrough: string }).seenThrough;
      server.puts.push(t);
      if (server.putStatus !== 200) return r.flush({}, { status: server.putStatus, statusText: 'x' });
      if (!server.anchor || t > server.anchor) server.anchor = t;
      return r.flush({ ok: true, seenThrough: server.anchor });
    }
    if (url === '/api/me/changes-anchor') {
      server.anchorReads++;
      if (server.getStatus === NET) return answer(r, NET);
      return server.getStatus === 200 ? r.flush({ ok: true, seenThrough: server.anchor }) : r.flush({}, { status: server.getStatus, statusText: 'x' });
    }
    if (url === '/api/what-changed') {
      expect(method).toBe('GET');
      const since = r.request.params.get('since')!, until = r.request.params.get('until')!;
      server.whatChanged.push({ since, until });
      return answer(r, server.wc(since, until));
    }
    if (url === '/api/languages') { server.langReads++; return answer(r, server.langs); }
    if (url === '/api/me/linkedin-games/changes') { server.gamesAsked.push({ since: r.request.params.get('since'), until: r.request.params.get('until')! }); return answer(r, server.gamesChange); }
    throw new Error('unexpected request ' + method + ' ' + url);
  };
  /** Answers every request until none is left (the legacy fake server). */
  const settle = async () => { await tick(); for (let i = 0; i < 20; i++) { const p = pending(); if (!p.length) return; p.forEach(handle); await tick(); } };
  const setup = (o: Partial<Server> = {}) => {
    server = { anchor: null, getStatus: 200, putStatus: 200, puts: [], anchorReads: 0, whatChanged: [], langReads: 0, langs: { courses: [] }, gamesAsked: [], gamesChange: NO_GAMES, ...o,
      wc: o.wc ?? ((since, until) => quiet(since, server.shownUntil ?? until)) };
    return server;
  };
  const open = async (o: Partial<Server> = {}) => {
    if (!server) setup(o);
    fixture = TestBed.createComponent(Changes);
    el = fixture.nativeElement;
    await settle();
    return el;
  };
  const text = (sel: string) => el.querySelector(sel)?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  const header = () => text('#changesHeader');
  const empty = () => el.querySelector<HTMLElement>('#changesEmpty');
  const findings = () => text('#changesFindings');
  const activity = () => text('#changesActivity');
  const button = (label: string) => [...el.querySelectorAll<HTMLButtonElement>('#changesHeader button')].find((b) => b.textContent!.trim() === label)!;
  const markBtn = () => el.querySelector<HTMLButtonElement>('#btnMarkSeen');
  const click = async (label: string) => { button(label).click(); await settle(); };
  const row = (label: string) => [...el.querySelectorAll('#changesActivity .row')].find((r) => r.querySelector('span')?.textContent === label)?.querySelector('b, .pill')?.textContent ?? null;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    localStorage.clear();
    server = undefined as unknown as Server;
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => { vi.useRealTimers(); http.match((r) => r.url === '/api/me/linkedin-games/changes'); /* the Games section asks on its own: tests about the evaluations need not answer it */ http.verify(); }); // real timers first: a failed verify must not leave fake ones to the next file

  describe('Frontend What Changed Navigation & Visual Engine', () => {
    it('shouldParseChangesHashRouteWhenHashIsChanges', () => {
      expect(legacyRedirect('/overview', '#/changes', '')).toBe('/changes');
    });

    it('shouldIncludeChangesTabSectionWithRequiredContainersWhenRendered', async () => {
      await open();
      for (const id of ['changesTab', 'changesHeader', 'changesFindings', 'changesActivity']) expect(el.querySelector('#' + id)).not.toBeNull();
      expect(empty()).toBeNull(); // a quiet window is not a page-level claim: it is said inside the folded Actividad block
      expect(activity()).toContain('Sin actividad registrada de ajedrez ni idiomas');
      expect(el.querySelector('.tab-panel, [hidden]')).toBeNull(); // ruling 1
    });

    it('shouldFoldTheActivityBlockByDefault', async () => {
      await open({ wc: () => activePayload });
      const block = el.querySelector<HTMLDetailsElement>('#changesActivity details')!;
      expect(block).not.toBeNull();
      expect(block.open).toBe(false);
      expect(block.querySelector('summary')!.textContent).toContain('Actividad en la ventana');
    });

    it('shouldShowTheGamesSectionWhenChessAndLanguagesHaveNoActivity', async () => {
      await open({ gamesChange: ZIP_DOWN }); // the quiet default: nothing in chess or languages
      expect(empty()).toBeNull(); // the old page-level "no activity" claim ignored Games
      expect(text('#changesGames')).toContain('Zip: de Estable a Bajando');
    });

    it('shouldAskGamesForTheSamePlayDatesAsTheWindowShown', async () => {
      await open();
      await click('Últimos 7 días');
      const last = server.gamesAsked.at(-1)!;
      expect(last.since).toBe('2026-10-01');
      expect(last.until).toBe('2026-10-08');
    });

    it('shouldRenderEmptyStateWhenNoActivityRecordedInInterval', async () => {
      await open({ wc: () => ({ ...quiet('2026-09-24T00:00:00.000Z', '2026-10-01T00:00:00.000Z'),
        chess: { gamesCount: 0, ratingDelta: 0, baselineRating: 1200, currentRating: 1200, intervalWinRate: null },
        languages: { xpGained: 0, sessionsCount: 0, totalSessionMinutes: 0, baselineCourseId: 'DUOLINGO_EN_ES', currentCourseId: 'DUOLINGO_EN_ES', courseChanged: false },
        streak: { baselineStreak: 50, currentStreak: 50, streakDelta: 0, status: 'active' } }) });
      expect(empty()).toBeNull();
      expect(activity()).toContain('Sin actividad registrada de ajedrez ni idiomas entre 2026-09-24 00:00 UTC y 2026-10-01 00:00 UTC.');
      expect(el.querySelector('#changesFindings')!.children.length).toBe(0);
      expect(el.querySelectorAll('#changesActivity .row')).toHaveLength(0); // the block only says it was quiet
    });

    it('shouldRenderDeltaCardsAndFindingsWhenActivityExistsInInterval', async () => {
      await open({
        langs: { courses: [{ courseId: 'DUOLINGO_EN_ES', title: 'Spanish EN' }, { courseId: 'DUOLINGO_XC_ES', title: 'Spanish XC' }] },
        wc: () => ({ ...quiet('2026-09-24T00:00:00.000Z', '2026-10-01T00:00:00.000Z'),
          chess: { gamesCount: 15, ratingDelta: 35, baselineRating: 1200, currentRating: 1235, intervalWinRate: 60.0, whiteWinRate: 66.7, blackWinRate: 50.0, historicalWinRateDelta: 5.2 },
          languages: { xpGained: 450, sessionsCount: 6, totalSessionMinutes: 35, baselineCourseId: 'DUOLINGO_EN_ES', currentCourseId: 'DUOLINGO_XC_ES', courseChanged: true },
          streak: { baselineStreak: 45, currentStreak: 52, streakDelta: 7, status: 'active', streakStarted: false, streakMilestone: 50 },
          findings: [{ id: 'CHESS_RATING_JUMP', category: 'chess', title: 'Salto de ELO', claim: 'Incremento notable de rating (+35)', evidence: 'Rating inicial 1200 subió a 1235',
            baselineAt: '2026-09-24T00:00:00.000Z', until: '2026-10-01T00:00:00.000Z', metrics: { delta: 35 } }],
          evaluations: undefined }),
      });
      expect(empty()).toBeNull();
      expect(findings()).toContain('Salto de ELO');
      expect(findings()).toContain('EVENTO CHESS');
      expect(findings()).toContain('Incremento notable de rating (+35)');
      expect(findings()).toContain('Evidencia: Rating inicial 1200 subió a 1235');
      expect(text('#changesFindings h2')).toBe('🔎 Descubrimientos'); // no evaluations: the events are discoveries
      expect(activity()).toContain('Actividad en la ventana');
      expect(row('Partidas jugadas')).toBe('15');
      expect(row('% de victorias en este periodo')).toBe('60,0 %');
      expect(row('XP ganado')).toBe('+450');
      expect(row('Sesiones completadas')).toBe('6');
      expect(row('Tiempo invertido')).toBe('35 min');
      expect(row('Curso activo')).toBe('Spanish EN → Spanish XC');
      expect(row('Racha actual')).toBe('🔥 52');
      expect(row('Racha anterior')).toBe('45');
      expect(row('Cambio en la racha')).toBe('+7');
      expect(row('Estado')).toBe('active');
      expect(el.querySelector('#changesActivity .pill')!.className).toBe('pill pill-win');
      // already stated by an evaluation: not repeated as a second representation
      expect(activity()).not.toContain('Delta ELO');
      expect(activity()).not.toContain('Blancas vs Negras');
      expect(activity()).not.toContain('66.7%');
    });

    it('shouldRenderASingleActivityCardWithChessLanguagesAndStreakBlocks', async () => {
      await open({ wc: () => ({ ...quiet('2026-09-24T00:00:00.000Z', '2026-10-01T00:00:00.000Z'),
        chess: { gamesCount: 3, ratingDelta: null, baselineRating: 800, currentRating: null, intervalWinRate: null, historicalDelta: null },
        languages: { xpGained: 0, sessionsCount: 2, totalSessionMinutes: 4, baselineCourseId: null, currentCourseId: null, courseChanged: false } }) });
      expect(el.querySelectorAll('#changesActivity details')).toHaveLength(1);
      const titles = [...el.querySelectorAll('#changesActivity .muted')].map((d) => d.textContent);
      for (const title of ['Ajedrez', 'Idiomas', 'Racha']) expect(titles).toContain(title);
      expect(row('Racha actual')).toBe('🔥 —');
      expect(row('Cambio en la racha')).toBe('—');
    });

    it('shouldFetchWhatChangedWithSevenDayBaselineWhenNoStoredVisitTimestampExists', async () => {
      await open();
      expect(server.whatChanged).toEqual([{ since: iso(7 * DAY), until: iso(0) }]);
      expect(header()).toContain('Marcar como visto');
      for (const b of ['Últimos 7 días', 'Últimos 30 días', 'Desde última visita']) expect(button(b)).toBeDefined();
      expect(button('Desde última visita').getAttribute('aria-pressed')).toBe('true');
      expect(button('Últimos 7 días').getAttribute('aria-pressed')).toBe('false');
    });
  });

  describe('what changed: the active course is a catalogue course', () => {
    const payload = (cur: string) => ({ interval: { since: '2026-10-01T00:00:00.000Z', until: '2026-10-08T00:00:00.000Z' },
      chess: { gamesCount: 1, intervalWinRate: 50, historicalDelta: 0 },
      languages: { xpGained: 5, sessionsCount: 1, totalSessionMinutes: 3, baselineCourseId: cur, currentCourseId: cur, courseChanged: false },
      streak: { baselineStreak: 1, currentStreak: 1, streakDelta: 0, status: 'active' }, findings: [], evaluations: [] });

    it('shouldNotShowARawCourseIdOutsideTheCatalogue', async () => {
      let cur = 'CHESS_CH';
      await open({ langs: { courses: [{ courseId: 'RU_EN', title: 'Russian EN' }] }, wc: () => payload(cur) });
      expect(activity()).not.toContain('CHESS_CH');
      expect(activity()).not.toContain('Curso activo');
      cur = 'RU_EN';
      await click('Últimos 7 días');
      expect(row('Curso activo')).toBe('Russian EN');
      expect(server.langReads).toBe(1); // the catalogue is read once per visit
    });

    it('shouldShowNoCourseWhenTheCatalogueCannotBeRead', async () => {
      await open({ langs: FAIL, wc: () => payload('RU_EN') });
      expect(activity()).not.toContain('Curso activo');
      expect(row('XP ganado')).toBe('+5'); // the rest of the card is there
    });
  });

  describe('visit anchor in What Changed (P1 #8)', () => {
    it('shouldShowSevenDaysAndSaySoWhenThereIsNoAnchor', async () => {
      await open();
      expect(header()).toContain('Sin visita registrada: mostrando los últimos 7 días (2026-10-01 12:00 UTC y 2026-10-08 12:00 UTC)');
      expect(server.whatChanged[0]!.since).toBe(iso(7 * DAY));
      expect(header()).toContain('Marcar como visto');
    });

    it('shouldAskForTheChangesSinceTheServerAnchor', async () => {
      const anchor = iso(3 * DAY);
      await open({ anchor });
      expect(server.whatChanged).toEqual([{ since: anchor, until: iso(0) }]);
      expect(header()).toContain('Desde tu última visita (2026-10-05 12:00 UTC) hasta 2026-10-08 12:00 UTC');
      expect(header()).not.toContain('Sin visita registrada');
    });

    it('shouldNeverWriteTheAnchorWhenOnlyReadingOrSwitchingWindows', async () => {
      await open({ anchor: iso(3 * DAY) });
      await click('Últimos 7 días');
      await click('Últimos 30 días');
      await click('Desde última visita');
      expect(server.puts).toEqual([]);
    });

    it('shouldMarkTheUntilOfTheWindowShownNotTheTimeOfTheClick', async () => {
      const shown = iso(2 * 60_000); // the response the user is looking at ends two minutes before the click
      await open({ anchor: iso(3 * DAY), shownUntil: shown });
      vi.setSystemTime(NOW + 60_000);
      markBtn()!.click();
      await settle();
      expect(server.puts).toEqual([shown]);
      expect(server.anchor).toBe(shown);
    });

    it('shouldReloadFromTheNewAnchorAfterMarking', async () => {
      const shown = iso(60_000);
      await open({ anchor: iso(3 * DAY), shownUntil: shown });
      markBtn()!.click();
      await settle();
      expect(server.whatChanged.at(-1)!.since).toBe(shown);
      expect(header()).toContain('Desde tu última visita (2026-10-08 11:59 UTC)');
      expect(server.anchorReads).toBe(1); // the PUT answered the new anchor: no second read
    });

    it('shouldReturnToTheVisitWindowAfterMarkingFromAWiderWindow', async () => {
      await open({ anchor: iso(10 * DAY) });
      await click('Últimos 30 días');
      markBtn()!.click();
      await settle();
      expect(server.puts).toEqual([iso(0)]);
      expect(server.whatChanged.at(-1)).toEqual({ since: iso(0), until: new Date(NOW + 1000).toISOString() }); // since == now: until moves one second on
      expect(button('Desde última visita').getAttribute('aria-pressed')).toBe('true');
    });

    it('shouldOfferMarkingOnlyWhenTheWindowCoversEverythingNotYetSeen', async () => {
      await open({ anchor: iso(10 * DAY) });
      expect(markBtn()).not.toBeNull();
      await click('Últimos 7 días'); // starts after the anchor: 3 unseen days fall outside it
      expect(markBtn()).toBeNull();
      expect(header()).toContain('Para marcar como visto, elige «Desde última visita»: esta ventana no cubre todo lo que no has visto.');
      await click('Últimos 30 días'); // starts before the anchor: covers it all
      expect(markBtn()).not.toBeNull();
      expect(header()).not.toContain('esta ventana no cubre');
    });

    it('shouldNotOfferMarkingInAFixedWindowWhenThereIsNoAnchor', async () => {
      await open();
      await click('Últimos 7 días');
      expect(markBtn()).toBeNull();
      expect(header()).not.toContain('esta ventana no cubre'); // nothing seen yet: no note either
    });

    it('shouldSayItWhenTheAnchorCannotBeRead', async () => {
      await open({ getStatus: 404 });
      expect(header()).toContain('No se pudo leer tu última visita: mostrando los últimos 7 días (2026-10-01 12:00 UTC y 2026-10-08 12:00 UTC)');
      expect(server.whatChanged[0]!.since).toBe(iso(7 * DAY));
    });

    it('shouldSayItWhenTheAnchorReadNeverGetsAnAnswer', async () => {
      await open({ getStatus: NET });
      expect(header()).toContain('No se pudo leer tu última visita');
      expect(server.puts).toEqual([]);
    });

    it('shouldTreatAnAnchorBodyItCannotReadAsUnreadableAndWriteNothing', async () => {
      localStorage.setItem('lastVisitedAt', iso(4 * DAY));
      setup();
      server.anchor = 42 as unknown as string; // not an instant
      await open();
      expect(header()).toContain('No se pudo leer tu última visita');
      expect(server.puts).toEqual([]);
      expect(localStorage.getItem('lastVisitedAt')).not.toBeNull();
    });

    it('shouldShowAFailureAndKeepTheAnchorWhenSavingFails', async () => {
      const anchor = iso(3 * DAY);
      await open({ anchor, putStatus: 500 });
      markBtn()!.click();
      await settle();
      expect(server.anchor).toBe(anchor);
      expect(markBtn()!.textContent!.trim()).toBe('No se pudo guardar; reintenta');
      expect(server.whatChanged).toHaveLength(1); // nothing reloads: the window shown stays
      expect(header()).toContain('Desde tu última visita (2026-10-05 12:00 UTC)');
    });

    it('shouldNotSubmitTwiceWhileTheSaveIsInFlight', async () => {
      await open({ anchor: iso(3 * DAY) });
      markBtn()!.click();
      await tick();
      markBtn()!.click();
      await tick();
      expect(markBtn()!.disabled).toBe(true);
      const puts = pending().filter((r) => r.request.method === 'PUT'); // match() takes them: answer them here
      expect(puts).toHaveLength(1);
      puts.forEach(handle);
      await settle();
      expect(server.puts).toHaveLength(1);
    });

    it('shouldPutTheShownInstantAsSeenThroughToTheAnchorRoute', async () => {
      await open({ anchor: iso(3 * DAY) });
      markBtn()!.click();
      await tick();
      const put = pending().find((r) => r.request.method === 'PUT')!;
      expect(put.request.url).toBe('/api/me/changes-anchor');
      expect(put.request.body).toEqual({ seenThrough: iso(0) });
      handle(put);
      await settle();
    });

    it('shouldDoNothingWhenMarkingBeforeTheWindowHasAnswered', async () => {
      setup({ anchor: iso(3 * DAY) });
      fixture = TestBed.createComponent(Changes);
      el = fixture.nativeElement;
      await tick();
      pending().forEach(handle); // the anchor answers; /api/what-changed is still in flight
      await tick();
      expect(markBtn()).not.toBeNull();
      markBtn()!.click();
      await tick();
      const p = pending();
      expect(p.filter((r) => r.request.method === 'PUT')).toHaveLength(0); // legacy changesShownUntil = null until the answer
      p.forEach(handle);
      await settle();
      expect(server.puts).toEqual([]);
    });

    describe('one-time migration of the old browser value', () => {
      it('shouldUploadTheLocalValueOnceWhenTheServerHasNoAnchorAndDropTheKey', async () => {
        const legacy = iso(4 * DAY);
        localStorage.setItem('lastVisitedAt', legacy);
        await open();
        expect(server.puts).toEqual([legacy]);
        expect(localStorage.getItem('lastVisitedAt')).toBeNull();
        expect(server.whatChanged[0]!.since).toBe(legacy);
      });

      it('shouldIgnoreTheLocalValueAndDropTheKeyWhenTheServerAlreadyHasAnAnchor', async () => {
        const anchor = iso(1 * DAY);
        localStorage.setItem('lastVisitedAt', iso(9 * DAY));
        await open({ anchor });
        expect(server.puts).toEqual([]);
        expect(localStorage.getItem('lastVisitedAt')).toBeNull();
        expect(server.whatChanged[0]!.since).toBe(anchor);
      });

      it('shouldKeepTheLocalValueWhenTheUploadFailsForAnotherReasonThanTheValue', async () => {
        localStorage.setItem('lastVisitedAt', iso(4 * DAY));
        await open({ putStatus: 500 });
        expect(localStorage.getItem('lastVisitedAt')).not.toBeNull();
        expect(header()).toContain('Sin visita registrada'); // the anchor stays what the server said
      });

      it('shouldDropAnInvalidLocalValueWhenTheServerRejectsIt', async () => {
        localStorage.setItem('lastVisitedAt', 'garbage');
        await open({ putStatus: 400 });
        expect(localStorage.getItem('lastVisitedAt')).toBeNull();
      });

      it('shouldNotTouchTheLocalValueWhenTheServerCannotBeRead', async () => {
        localStorage.setItem('lastVisitedAt', iso(4 * DAY));
        await open({ getStatus: 500 });
        expect(server.puts).toEqual([]);
        expect(localStorage.getItem('lastVisitedAt')).not.toBeNull();
      });

      it('shouldMigrateOnlyOnceAcrossWindowSwitches', async () => {
        localStorage.setItem('lastVisitedAt', iso(4 * DAY));
        await open({ putStatus: 500 });
        await click('Últimos 7 días');
        await click('Desde última visita');
        expect(server.puts).toHaveLength(1);
      });
    });
  });

  describe('opening straight on What Changed', () => {
    it('shouldShowTheWindowHeaderWhenThePageOpensOnTheChangesRoute', async () => {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({ providers: [provideRouter(routes), provideHttpClient(), provideHttpClientTesting(),
        { provide: BROWSER_LOCATION, useValue: { pathname: '/changes', search: '', hash: '', href: '', reload: () => {} } }] });
      http = TestBed.inject(HttpTestingController);
      setup();
      const harness = await RouterTestingHarness.create();
      await harness.navigateByUrl('/changes');
      await settle();
      harness.detectChanges();
      el = harness.routeNativeElement as HTMLElement;
      expect(TestBed.inject(Router).url).toBe('/changes');
      expect(header()).toContain('2026-10-08'); // the window the client asked for: until = now
    });
  });

  describe('the request plumbing', () => {
    it('shouldAskOnceForTheAnchorAndOncePerWindowChoice', async () => {
      await open();
      await click('Últimos 7 días');
      await click('Últimos 30 días');
      await click('Últimos 30 días'); // the same choice again asks again (legacy setChangesInterval)
      expect(server.anchorReads).toBe(1);
      expect(server.whatChanged.map((w) => w.since)).toEqual([iso(7 * DAY), iso(7 * DAY), iso(30 * DAY), iso(30 * DAY)]);
      expect(button('Últimos 30 días').getAttribute('aria-pressed')).toBe('true');
      expect(button('Desde última visita').getAttribute('aria-pressed')).toBe('false');
      expect(header()).toContain('Mostrando cambios entre 2026-09-08 12:00 UTC y 2026-10-08 12:00 UTC');
    });

    it('shouldCancelTheRequestWhenTheViewIsLeftBeforeItAnswers', async () => {
      setup();
      fixture = TestBed.createComponent(Changes);
      await tick();
      const anchor = http.expectOne('/api/me/changes-anchor');
      anchor.flush({ ok: true, seenThrough: null });
      await tick();
      const wc = http.expectOne((r) => r.url === '/api/what-changed');
      fixture.destroy();
      expect(wc.cancelled).toBe(true);
    });

    it('shouldCancelTheAnchorReadWhenTheViewIsLeftBeforeItAnswers', async () => {
      setup();
      fixture = TestBed.createComponent(Changes);
      await tick();
      const anchor = http.expectOne('/api/me/changes-anchor');
      fixture.destroy();
      expect(anchor.cancelled).toBe(true);
    });
  });

  describe('what changed: a quiet window still says what could not be judged', () => {
    it('shouldKeepTheEvaluationsWhenTheWindowHasNoActivity', async () => {
      await open({ wc: () => quietPayload([evaluation]) });
      expect(empty()).toBeNull();
      expect(activity()).toMatch(/^Actividad en la ventana\s*Sin actividad registrada de ajedrez ni idiomas entre/);
      expect(findings()).toContain('Pocos datos');
      expect(el.querySelectorAll('#changesActivity .row')).toHaveLength(0); // the block only says it was quiet
    });
  });

  describe("what changed: a failed load does not leave another window's data under the new header", () => {
    let mode: 'ok' | 'fail' | 'net' | 'malformed';
    const boot = async () => {
      mode = 'ok';
      await open({ wc: () => mode === 'fail' ? FAIL : mode === 'net' ? NET : mode === 'malformed' ? {} : activePayload });
      expect(findings()).toContain('Pocos datos');
    };

    it('shouldClearFindingsAndActivityWhenTheRequestFails', async () => {
      await boot();
      mode = 'fail';
      await click('Últimos 30 días');
      expect(el.querySelector('#changesFindings')!.children.length).toBe(0);
      expect(el.querySelector('#changesActivity')!.children.length).toBe(0);
      expect(empty()!.textContent).toBe('Error al cargar cambios (/api/what-changed).');
    });

    it('shouldSayConnectionErrorAndNeverTheQuietCopyWhenTheRequestGetsNoAnswer', async () => {
      await boot();
      mode = 'net';
      await click('Últimos 30 días');
      expect(empty()!.textContent).toBe('Error de conexión al cargar cambios.');
      expect(activity()).not.toContain('Sin actividad registrada');
      expect(el.querySelector('#changesActivity')!.children.length).toBe(0);
    });

    it('shouldSayTheAnswerWasIncompleteInsteadOfKeepingTheOldBody', async () => {
      await boot();
      mode = 'malformed';
      await click('Últimos 30 días');
      expect(el.querySelector('#changesFindings')!.children.length).toBe(0);
      expect(empty()!.textContent).toBe('Respuesta incompleta al cargar cambios (/api/what-changed).');
    });

    it('shouldSayIncompleteWhenTheBodyIsNotAnObject', async () => {
      await open({ wc: () => 'x' as unknown as Any });
      expect(empty()!.textContent).toMatch(/incompleta/);
    });

    it('shouldShowNeitherCopyWhileLoading', async () => {
      setup();
      fixture = TestBed.createComponent(Changes);
      el = fixture.nativeElement;
      await tick();
      pending().forEach(handle); // anchor answered, what-changed in flight
      await tick();
      expect(header()).toContain('Sin visita registrada');
      expect(empty()).toBeNull();
      await settle();
    });

    it('shouldNotOfferMarkingWhatWasNotShownAfterAFailure', async () => {
      await open({ anchor: iso(3 * DAY), wc: () => FAIL });
      markBtn()!.click();
      await settle();
      expect(server.puts).toEqual([]);
    });
  });

  describe('what changed: an old response never overwrites a window chosen later', () => {
    const bootDeferred = async () => {
      await open({ wc: () => activePayload });
      button('Últimos 30 días').click(); // older choice, request in flight
      await tick();
      const early = pending().find((r) => r.request.url === '/api/what-changed')!;
      button('Últimos 7 días').click(); // later choice
      await tick();
      const late = pending().find((r) => r.request.url === '/api/what-changed')!;
      return { early, late };
    };

    it('shouldKeepTheLaterWindowWhenTheEarlierOneAnswersLast', async () => {
      const { early, late } = await bootDeferred();
      expect(early.cancelled).toBe(true); // the older choice can no longer answer
      late.flush(withXp(77));
      await tick();
      expect(row('XP ganado')).toBe('+77');
      expect(header()).toContain('Mostrando cambios entre 2026-10-01 12:00 UTC');
    });

    it('shouldNotWipeTheLaterWindowWhenTheEarlierRequestFailsLate', async () => {
      const { early, late } = await bootDeferred();
      late.flush(withXp(77));
      await tick();
      expect(early.cancelled).toBe(true);
      expect(row('XP ganado')).toBe('+77');
      expect(empty()).toBeNull();
    });
  });

  describe('timeouts on What Changed', () => {
    it('shouldShowTheConnectionErrorWhenWhatChangedNeverAnswers', async () => {
      setup();
      vi.useRealTimers();
      vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] /* rxjs timeout schedules with setInterval */ });
      vi.setSystemTime(NOW);
      fixture = TestBed.createComponent(Changes);
      el = fixture.nativeElement;
      const step = async () => { TestBed.tick(); await vi.advanceTimersByTimeAsync(0); TestBed.tick(); };
      await step();
      http.expectOne('/api/me/changes-anchor').flush({ ok: true, seenThrough: null });
      await step();
      const wc = http.expectOne((r) => r.url === '/api/what-changed');
      await vi.advanceTimersByTimeAsync(10_000);
      await step();
      expect(wc.cancelled).toBe(true);
      expect(empty()!.textContent).toBe('Error de conexión al cargar cambios.');
    });

    it('shouldKeepTheLaterWindowWhenAnEarlierRequestTimesOutAfterIt', async () => {
      await open({ wc: () => withXp(5) });
      vi.useRealTimers();
      vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] /* rxjs timeout schedules with setInterval */ });
      vi.setSystemTime(NOW);
      const step = async () => { TestBed.tick(); await vi.advanceTimersByTimeAsync(0); TestBed.tick(); };
      button('Últimos 30 días').click();
      await step();
      button('Últimos 7 días').click();
      await step();
      const late = http.expectOne((r) => r.url === '/api/what-changed' && r.params.get('since') === iso(7 * DAY));
      const early = http.expectOne((r) => r.url === '/api/what-changed' && r.params.get('since') === iso(30 * DAY));
      expect(early.cancelled).toBe(true);
      late.flush(withXp(9));
      await step();
      const shown = activity();
      await vi.advanceTimersByTimeAsync(10_000); // the first window's timer would have fired by now
      await step();
      expect(activity()).toBe(shown);
      expect(row('XP ganado')).toBe('+9');
      expect(empty()).toBeNull();
    });
  });

  describe('what changed / trajectory: absent values are not zero', () => {
    it('shouldNotPrintNullMinutesWhenTheSessionTimeIsUnknown', async () => {
      await open({ wc: () => ({ interval: { since: '2026-10-01T00:00:00.000Z', until: '2026-10-08T00:00:00.000Z' },
        chess: { gamesCount: 0, intervalWinRate: null, historicalDelta: null },
        languages: { xpGained: 5, sessionsCount: 1, totalSessionMinutes: null, baselineCourseId: null, currentCourseId: 'X', courseChanged: false },
        streak: { baselineStreak: null, currentStreak: null, streakDelta: null, status: 'active' }, findings: [], evaluations: [] }) });
      expect(activity()).not.toContain('null');
      expect(row('Tiempo invertido')).toBe('—');
      expect(row('% de victorias en este periodo')).toBe('—');
      expect(row('Cambio en tu % de victorias')).toBe('—');
    });
  });

  describe('what-changed historical delta', () => {
    it('shouldRenderTheHistoricalDeltaWithItsInterval', async () => {
      await open({ wc: () => ({ ...activePayload, chess: { gamesCount: 20, intervalWinRate: 70, historicalDelta: { diff: 20, lower: -1.2, upper: 38 } } }) });
      expect(row('Cambio en tu % de victorias')).toBe('+20,0 puntos de % (entre −1,2 y +38,0) · sin evidencia suficiente');
    });
  });

  describe('evaluations in What Changed', () => {
    it('shouldShowReadableWindowInChangesHeader', async () => {
      vi.setSystemTime(Date.parse('2026-10-01T10:37:59.169Z') + 7 * DAY); // the 7-day window starts at 10:37:59.169
      await open({ wc: () => ({}) });
      await click('Últimos 7 días');
      expect(header()).toContain('2026-10-01 10:37 UTC');
      expect(header()).not.toContain('10:37:59.169Z');
    });

    it('shouldHeadTheSectionAsEvaluationsWithItsLegendAndKeepEventsAfterTheCards', async () => {
      const base = CHANGES.base as Any;
      const event = { id: 'STREAK_MILESTONE', category: 'streak', title: 'Hito de racha', claim: 'Racha de 50 días', evidence: 'Racha 45 → 52' };
      await open({ wc: () => ({ ...activePayload, findings: [...base['findings'], event], evaluations: base['evaluations'] }) });
      expect(text('#changesFindings h2')).toBe('Evaluaciones');
      expect(findings()).toContain('Qué se observó, con qué criterio y qué no se puede afirmar todavía.');
      const cards = [...el.querySelectorAll('#changesFindings .card')];
      expect(cards.at(-1)!.textContent).toContain('Hito de racha');
      expect(cards.at(-1)!.querySelector('.pill-win')!.textContent).toBe('EVENTO');
      expect(cards.at(-1)!.querySelector('.pill-scope')!.textContent).toBe('STREAK');
      // an evaluated finding is not repeated as an event
      expect(cards.filter((c) => c.textContent!.includes('EVENTO'))).toHaveLength(1);
      expect(findings()).toContain('Del 1 al 8 de octubre');
    });

    it('shouldKeepTheDecimalCommaOfAFindingTextAsTheDomainWroteIt', async () => {
      const base = CHANGES.base as Any; // A8: the domain writes "40,0 pp"; the view never reformats a claim
      await open({ wc: () => ({ ...activePayload, findings: base['findings'], evaluations: base['evaluations'] }) });
      const claim = (base['findings'] as Any[]).find((f) => f['id'] === 'CHESS_COLOR_ASYMMETRY')!['claim'] as string;
      expect(claim).toMatch(/\d,\d/);
      expect(findings()).toContain(claim);
      expect(findings()).not.toMatch(/\d\.\d pp/);
    });

    it('shouldRenderNothingInFindingsWhenThereAreNeitherEvaluationsNorEvents', async () => {
      await open({ wc: () => ({ ...withXp(3), evaluations: [] }) });
      expect(el.querySelector('#changesFindings')!.children.length).toBe(0);
      expect(row('XP ganado')).toBe('+3');
    });
  });

  describe('a malformed part degrades alone (ruling 2)', () => {
    const open2 = (over: Any) => open({ wc: () => ({ ...activePayload, ...over }) });

    it('shouldShowTheEventAsUnavailableWhenItsCategoryIsNotText', async () => {
      await open2({ findings: [{ id: 'A', title: 'Roto', category: 7, claim: 'c', evidence: 'e' }, { id: 'B', title: 'Bueno', category: 'chess', claim: 'c2', evidence: 'e2' }] });
      const cards = [...el.querySelectorAll('#changesFindings .card')].map((c) => c.textContent!.replace(/\s+/g, ' '));
      expect(cards.find((c) => c.includes('Roto'))).toContain('No disponible');
      expect(cards.find((c) => c.includes('Bueno'))).toContain('EVENTO CHESS');
      expect(row('XP ganado')).toBe('+40');
    });

    it('shouldSkipAFindingThatIsNotAnObject', async () => {
      await open2({ findings: [null, 'x', { id: 'B', title: 'Bueno', category: 'chess', claim: 'c2', evidence: 'e2' }] });
      expect(findings()).toContain('Bueno');
    });

    it('shouldShowEvaluationsAsUnavailableWhenTheyAreNotAList', async () => {
      await open2({ evaluations: { a: 1 }, findings: [{ id: 'B', title: 'Bueno', category: 'chess', claim: 'c2', evidence: 'e2' }] });
      const na = [...el.querySelectorAll('#changesFindings .card')].find((c) => c.querySelector('h3')?.textContent === 'Evaluaciones');
      expect(na!.textContent).toContain('No disponible');
      expect(findings()).toContain('Bueno');
      expect(row('XP ganado')).toBe('+40');
    });

    it('shouldShowFindingsAsUnavailableWhenTheyAreNotAList', async () => {
      await open2({ findings: 'oops' });
      const na = [...el.querySelectorAll('#changesFindings .card')].find((c) => c.querySelector('h3')?.textContent === 'Hallazgos');
      expect(na!.textContent).toContain('No disponible');
      expect(findings()).toContain('Pocos datos'); // the evaluations still render
      expect(empty()).toBeNull(); // not a quiet window: it could not be read
    });

    it('shouldShowDashesInsteadOfNaNWhenActivityNumbersAreNotNumbers', async () => {
      await open2({ chess: { gamesCount: 'x', intervalWinRate: 'y', historicalDelta: { diff: 'a', lower: 1, upper: 2 } },
        languages: { xpGained: 'z', sessionsCount: null, totalSessionMinutes: 'm' }, streak: { currentStreak: 'q', baselineStreak: {}, streakDelta: 'd' } });
      expect(activity()).not.toContain('NaN');
      for (const r of ['Partidas jugadas', '% de victorias en este periodo', 'Cambio en tu % de victorias', 'XP ganado', 'Sesiones completadas', 'Tiempo invertido', 'Racha anterior', 'Cambio en la racha']) expect(row(r)).toBe('—');
      expect(row('Racha actual')).toBe('🔥 —');
      expect(row('Estado')).toBe('—');
      expect(el.querySelector('#changesActivity .pill')!.className).toBe('pill pill-loss');
    });

    it('shouldIgnoreCatalogueEntriesThatAreNotCourses', async () => {
      await open({ langs: { courses: [null, 'x', { courseId: 'RU_EN', title: 'Russian EN' }] },
        wc: () => ({ ...activePayload, languages: { xpGained: 5, sessionsCount: 1, currentCourseId: 'RU_EN', courseChanged: false } }) });
      expect(row('Curso activo')).toBe('Russian EN');
      expect(row('XP ganado')).toBe('+5');
    });

    it('shouldShowNoCourseWhenTheCatalogueIsNotAList', async () => {
      await open({ langs: { courses: 'x' }, wc: () => ({ ...activePayload, languages: { xpGained: 5, sessionsCount: 1, currentCourseId: 'RU_EN', courseChanged: false } }) });
      expect(activity()).not.toContain('Curso activo');
      expect(row('XP ganado')).toBe('+5');
    });

    it('shouldUseTheRequestedWindowInTheEmptyCopyWhenTheIntervalIsMissing', async () => {
      await open({ wc: () => ({ ...quietPayload([]), interval: undefined }) });
      expect(activity()).toContain('Sin actividad registrada de ajedrez ni idiomas entre 2026-10-01 12:00 UTC y 2026-10-08 12:00 UTC.');
    });
  });

  describe('fmtWhen', () => {
    it('shouldPrintTheRawValueWhenTheAnchorIsNotAnInstant', async () => {
      await open({ anchor: 'not-a-date' });
      expect(header()).toContain('Desde tu última visita (not-a-date)');
    });
  });
});
