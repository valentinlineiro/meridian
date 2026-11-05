import { describe, it, expect } from "vitest";
import { evaluateChanges, salience, type WhatChangedDeltas } from "../src/domain/whatChanged.ts";
import { createDashboardRuntime, fetchOnly } from "./helpers/dom.ts";
import { ADMITTED, withAdmitted } from "./fixtures/calibration.ts";

const ctx = { userId: "u1", baselineAt: "2026-09-20T00:00:00.000Z", until: "2026-09-27T00:00:00.000Z" };
const clear = { diff: 40, lower: 10, upper: 60 }, wide = { diff: 40, lower: -16, upper: 72 };
type Over = { chess?: Partial<WhatChangedDeltas["chess"]>; languages?: Partial<WhatChangedDeltas["languages"]> };
const deltas = (o: Over = {}): WhatChangedDeltas => ({
  chess: { gamesCount: 20, decidedCount: 20, ratingDelta: 0, ratingGames: 20, baselineRating: 800, currentRating: 800, intervalWinRate: 50, intervalWhiteWinRate: 70, intervalBlackWinRate: 30, historicalWinRateDelta: null, colorDelta: clear, historicalDelta: null, ...o.chess },
  languages: { intervalDays: 7, observedDays: 1, partialDaysExcluded: 0, historicalObservedDays: 1, historicalSpanDays: null, historicalSpanStart: null, xpGained: 500, sessionsCount: 5, totalSessionMinutes: 60, baselineCourseId: "A", currentCourseId: "A", courseChanged: false, dailyXpRate: 100, historicalDailyXpRate: 50, ...o.languages },
  streak: { baselineStreak: 10, currentStreak: 12, streakDelta: 2, status: "active", streakStarted: false, streakMilestone: null },
});
const payload = (o: Over = {}) => {
  const { findings, evaluations } = evaluateChanges(deltas(o), ctx);
  return {
    interval: { since: ctx.baselineAt, until: ctx.until },
    chess: { gamesCount: 20 }, languages: { xpGained: 500, sessionsCount: 5 }, streak: {},
    findings, evaluations,
  };
};
const html = (o: Over = {}) => createDashboardRuntime("/changes").sandbox.renderEvaluations(payload(o)) as string;

describe("evaluation cards (P0)", () => {
  it("shouldAgreeWithDomainSalienceForEveryEvaluationOverAGrid", () => {
    const rt = createDashboardRuntime("/changes");
    const want = { finding: "AFIRMADO", inconclusive: "INDICIO", no_indication: ["SIN INDICIO", "INSUFICIENTE"] } as const;
    const onlyUncalibrated = (e: any) => e.reasons.length === 1 && e.reasons[0] === "calibration_unavailable";
    for (const decidedCount of [0, 9, 40])
      for (const colorDelta of [null, clear, wide])
        for (const [w, b] of [[null, null], [70, 30], [55, 45]] as const)
          for (const [intervalDays, xpGained, hist] of [[7, 500, 50], [2, 500, 50], [7, 100, 50], [7, 500, 0]] as const)
            for (const e of evaluateChanges(deltas({ chess: { decidedCount, colorDelta, intervalWhiteWinRate: w, intervalBlackWinRate: b }, languages: { intervalDays, xpGained, historicalDailyXpRate: hist } }), ctx).evaluations) {
              const got = rt.sandbox.evalState(e);
              // A7 §15.2.4: not knowing the usual variation is "inconclusive" in the domain but reads INSUFICIENTE on screen (SIN INDICIO if there is no effect)
              if (onlyUncalibrated(e)) expect(got).toBe(salience(e) === "inconclusive" ? "INSUFICIENTE" : "SIN INDICIO");
              else expect([want[salience(e)]].flat()).toContain(got);
              const limited = e.reasons.some((r) => r === "data_unavailable" || r === "span_too_short" || r === "insufficient_sample" || (r === "calibration_unavailable" && got === "INSUFICIENTE"));
              if (got === "INSUFICIENTE") expect(limited).toBe(true);
              if (got === "SIN INDICIO") expect(limited).toBe(false); // never "nothing found" when the evidence was limited
            }
  });

  it("shouldShowClaimAndEvidenceWhenEvaluationIsAfirmado", () => {
    const h = html();
    expect(h).toContain("AFIRMADO");
    expect(h).toContain("Asimetría por color");
    expect(h).toContain("Evidencia:");
    expect(h).toContain("2026-09-20 → 2026-09-27");
  });

  it("shouldExplainWhatIsMissingWhenEvaluationIsIndicio", () => {
    const h = html({ chess: { decidedCount: 9 } });
    expect(h).toContain("INDICIO");
    expect(h).toContain("9 partidas decididas observadas; el criterio exige al menos 10.");
    expect(h).toContain("no podemos afirmarla");
  });

  it("shouldShowIntervalReasonWhenIntervalIncludesZero", () => {
    expect(html({ chess: { colorDelta: wide } })).toContain("[-16, 72] pp incluye 0");
  });

  it("shouldMarkInsuficienteWhenDataIsUnavailable", () => {
    const h = html({ languages: { historicalDailyXpRate: 0 } });
    expect(h).toContain("INSUFICIENTE");
    expect(h).toContain("No hay media histórica de referencia.");
  });

  it("shouldMarkSinIndicioWhenEffectIsBelowCriterion", () => {
    const h = html({ chess: { intervalWhiteWinRate: 52, intervalBlackWinRate: 48 } });
    expect(h).toContain("SIN INDICIO");
    expect(h).toContain("Diferencia observada entre colores: 4,0 pp");
    expect(h).toContain("no equivale a demostrar que no hubo cambio");
  });

  it("shouldMarkInsuficienteNotSinIndicioWhenTheWindowIsTooShort", () => {
    const h = html({ languages: { intervalDays: 2 } }).split(/<(?:div|details) class="card/).find((c) => c.includes("Mayor XP diario"))!;
    expect(h).not.toContain("SIN INDICIO");
    expect(h).toContain("INSUFICIENTE");
    expect(h).toContain("La ventana contiene 2 días completos (UTC); el criterio exige al menos 3.");
  });

  it("shouldNotRenderMissingHistoricalReferenceAsZeroWhenRateHasNoReference", () => {
    const h = html({ languages: { historicalDailyXpRate: 0, dailyXpRate: 15, xpGained: 1355 } });
    expect(h).toContain("15 XP por día con registro en la ventana; no hay referencia histórica disponible (+1355 XP)");
    expect(h).not.toContain("0 XP por día con registro histórico");
  });

  it("shouldShowHistoricalReferenceWhenItExists", () => {
    expect(html({ languages: { historicalDailyXpRate: 50, dailyXpRate: 20, xpGained: 140, intervalDays: 7 } })).toContain("20 XP por día con registro en la ventana vs 50 XP por día con registro histórico (+140 XP)");
  });

  it("shouldMarkRatingJumpInsuficienteWhenNoRatingIsObservedInTheWindow", () => {
    const h = html({ chess: { ratingDelta: null, currentRating: null } }).split(/<(?:div|details) class="card/).find((c) => c.includes("Salto de ELO"))!;
    expect(h).toContain("INSUFICIENTE");
    expect(h).not.toContain("SIN INDICIO");
    expect(h).toContain("dos observaciones de ELO en snapshots distintos");
  });

  it("shouldQuoteTheCriteriaCarriedByTheEvaluationNotACopy", () => {
    const rt = createDashboardRuntime("/changes");
    const p = payload({ chess: { decidedCount: 9 } });
    p.evaluations.find((e) => e.id === "CHESS_COLOR_ASYMMETRY")!.criteria = { minDecided: 77, minDiffPp: 15 };
    expect(rt.sandbox.renderEvaluations(p)).toContain("el criterio exige al menos 77.");
  });

  it("shouldNotInventACriterionWhenTheEvaluationCarriesNone", () => {
    const rt = createDashboardRuntime("/changes");
    const p = payload({ chess: { decidedCount: 9 } });
    delete (p.evaluations.find((e) => e.id === "CHESS_COLOR_ASYMMETRY") as any).criteria;
    const h = rt.sandbox.renderEvaluations(p);
    expect(h).toContain("9 partidas decididas observadas; no se alcanza el criterio.");
    expect(h).not.toContain("al menos 10");
  });

  it("shouldNotCallXpObservedInAWindowLearningPace", () => {
    expect(html({ languages: { dailyXpRate: 100, historicalDailyXpRate: 50 } })).not.toMatch(/aprendizaje|Aceleración/);
  });

  it("shouldRenderIndicioWithAmberPill", () => {
    expect(html({ chess: { decidedCount: 9 } })).toContain('class="pill pill-warn">INDICIO');
  });

  it("shouldShowReadableWindowInChangesHeader", async () => {
    const rt = createDashboardRuntime("/changes");
    rt.sandbox.fetch = fetchOnly("/api/what-changed", async () => ({ ok: true, json: async () => ({}) }));
    await rt.sandbox.fetchWhatChanged("2026-10-01T10:37:59.169Z");
    expect(rt.getEl("#changesHeader").innerHTML).toContain("2026-10-01 10:37 UTC");
    expect(rt.getEl("#changesHeader").innerHTML).not.toContain("10:37:59.169Z");
  });

  it("shouldNotClaimCalibratedLimitsWhenNoBandIsAdmitted", () => {
    expect(html()).toContain("sin banda calibrada todavía; datos evaluados hasta");
  });

  it("shouldOrderAfirmadoBeforeIndicioBeforeSinIndicio", () => {
    const h = html({ chess: { colorDelta: wide } });
    expect(h.indexOf("INDICIO")).toBeGreaterThan(-1);
    expect(h.indexOf("INDICIO")).toBeLessThan(h.indexOf("SIN INDICIO"));
  });
});

describe("evaluation cards: verdict first, criteria on demand", () => {
  it("shouldCollapseEvaluationsWithoutAnAnswerAndKeepAffirmedOnesOpen", () => {
    const h = html({ languages: { intervalDays: 2 } });
    const cards = h.split(/(?=<(?:div|details) class="card)/);
    const xp = cards.find((c) => c.includes("Mayor XP diario"))!;
    expect(xp.startsWith('<details class="card evcard"')).toBe(true);
    expect(xp).not.toContain(" open"); // closed by default
    expect(xp).toContain("INSUFICIENTE");
    expect(xp).toContain("La ventana contiene 2 días completos (UTC); el criterio exige al menos 3."); // the criteria are still there, one tap away
    const affirmed = cards.find((c) => c.includes("AFIRMADO"))!;
    expect(affirmed.startsWith('<div class="card"')).toBe(true);
  });
});

describe("A7: calibrated rules abstain on screen", () => {
  const elo = (chess: any) => html({ chess }).split(/(?=<(?:div|details) class="card)/).find((c) => c.includes("Salto de ELO"))!;
  it("shouldShowInsuficienteWithTheObservedEffectWhenTheUsualVariationIsUnknown", () => {
    const h = elo({ ratingDelta: -40, ratingGames: 10, gamesCount: 30 });
    expect(h).toContain("INSUFICIENTE");
    expect(h).toContain("Cambio de ELO observado: -40 puntos en 10 partidas entre las dos lecturas. Sin referencia de variación habitual todavía.");
    expect(h).not.toContain("SIN INDICIO");
  });
  it("shouldShowSinIndicioWhenThereIsNoEffect", () => {
    expect(elo({ ratingDelta: 0 })).toContain("SIN INDICIO");
  });
  it("shouldAttributeCalibrationOnlyToTheRulesThatUseIt", () => {
    const cards = html().split(/(?=<(?:div|details) class="card)/);
    const of = (t: string) => cards.find((c) => c.includes(t))!;
    expect(of("Asimetría por color")).toContain("con intervalo de confianza del 95 %");
    expect(of("Asimetría por color")).not.toContain("calibrados");
    // the shipped artefact admits no edge: neither calibrated rule may claim to be calibrated
    for (const t of ["Salto de ELO", "Mayor XP diario"]) {
      expect(of(t)).toContain("sin banda calibrada todavía; datos evaluados hasta 2026-11-05");
      expect(of(t)).not.toContain("calibrados con tu historial");
    }
  });
  it("shouldClaimCalibrationOnlyWhenTheEdgeOfTheDirectionIsAdmitted", () => {
    const withBands = (over: any, cal: any) => {
      const p = { ...payload(over) } as any;
      p.evaluations = evaluateChanges(deltas(over), ctx, cal).evaluations;
      return createDashboardRuntime("/changes").sandbox.renderEvaluations(p) as string;
    };
    const eloCard = (h: string) => h.split(/(?=<(?:div|details) class="card)/).find((c) => c.includes("Salto de ELO"))!;
    const up = withAdmitted({ upper95: { 10: 74 } }); // only the rise is calibrated
    expect(eloCard(withBands({ chess: { ratingDelta: 30, ratingGames: 10 } }, up))).toContain("calibrados con tu historial (hasta ");
    expect(eloCard(withBands({ chess: { ratingDelta: -30, ratingGames: 10 } }, up))).toContain("sin banda calibrada todavía");
    expect(eloCard(withBands({ chess: { ratingDelta: -30, ratingGames: 10 } }, withAdmitted({ lower95: { 10: -62 } })))).toContain("calibrados con tu historial");
    const xp = (h: string) => h.split(/(?=<(?:div|details) class="card)/).find((c) => c.includes("Mayor XP diario"))!;
    expect(xp(withBands({}, ADMITTED))).toContain("calibrados con tu historial"); // XP window of 7 days has upper95 admitted
    expect(xp(withBands({ languages: { intervalDays: 14 } }, ADMITTED))).toContain("sin banda calibrada todavía");
  });
  it("shouldNeverQuoteTheRetiredFixedThresholds", () => {
    const h = html({ chess: { ratingDelta: 30 }, languages: { dailyXpRate: 70, historicalDailyXpRate: 50, xpGained: 100 } }); // ratio 1,4: not the retired 1,3
    expect(h).not.toMatch(/25 puntos|1,3|200 XP|al menos 25|al menos 200/);
    expect(h).not.toContain("AFIRMADO Salto");
  });
});

describe("audit P8: evaluation cards use the same notation", () => {
  it("shouldWriteTheObservedRatesAndTheReasonsWithCommaAndSpace", () => {
    const h = html({ chess: { intervalWhiteWinRate: 64.7, intervalBlackWinRate: 52.3 } }).replace(/<[^>]*>/g, " ");
    expect(h).toContain("Blancas 64,7 % · Negras 52,3 %");
    expect(h).toContain("Diferencia observada entre colores: 12,4 pp");
    expect(h.match(/.{0,25}(\d\.\d+ ?(%|pp)|\d%).{0,10}/g)).toBeNull();
  });
});
