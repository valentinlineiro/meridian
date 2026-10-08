import { describe, it, expect } from "vitest";
import { evaluateChanges, salience, type WhatChangedDeltas } from "../src/domain/whatChanged.ts";
import { createDashboardRuntime } from "./helpers/dom.ts";

const ctx = { userId: "u1", baselineAt: "2026-09-20T00:00:00.000Z", until: "2026-09-27T00:00:00.000Z" };
const clear = { diff: 40, lower: 10, upper: 60 }, wide = { diff: 40, lower: -16, upper: 72 };
type Over = { chess?: Partial<WhatChangedDeltas["chess"]>; languages?: Partial<WhatChangedDeltas["languages"]> };
const deltas = (o: Over = {}): WhatChangedDeltas => ({
  chess: { gamesCount: 20, decidedCount: 20, ratingDelta: 0, baselineRating: 800, currentRating: 800, intervalWinRate: 50, intervalWhiteWinRate: 70, intervalBlackWinRate: 30, historicalWinRateDelta: null, colorDelta: clear, historicalDelta: null, ...o.chess },
  languages: { intervalDays: 7, xpGained: 500, sessionsCount: 5, totalSessionMinutes: 60, baselineCourseId: "A", currentCourseId: "A", courseChanged: false, dailyXpRate: 100, historicalDailyXpRate: 50, ...o.languages },
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
    for (const decidedCount of [0, 9, 40])
      for (const colorDelta of [null, clear, wide])
        for (const [w, b] of [[null, null], [70, 30], [55, 45]] as const)
          for (const [intervalDays, xpGained, hist] of [[7, 500, 50], [2, 500, 50], [7, 100, 50], [7, 500, 0]] as const)
            for (const e of evaluateChanges(deltas({ chess: { decidedCount, colorDelta, intervalWhiteWinRate: w, intervalBlackWinRate: b }, languages: { intervalDays, xpGained, historicalDailyXpRate: hist } }), ctx).evaluations) {
              const got = rt.sandbox.evalState(e);
              expect([want[salience(e)]].flat()).toContain(got);
              const limited = e.reasons.some((r) => r === "data_unavailable" || r === "span_too_short" || r === "insufficient_sample");
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
    expect(h).toContain("No hay ritmo histórico de referencia.");
  });

  it("shouldMarkSinIndicioWhenEffectIsBelowCriterion", () => {
    const h = html({ chess: { intervalWhiteWinRate: 52, intervalBlackWinRate: 48 } });
    expect(h).toContain("SIN INDICIO");
    expect(h).toContain("Diferencia observada entre colores: 4.0 pp");
    expect(h).toContain("no equivale a demostrar que no hubo cambio");
  });

  it("shouldMarkInsuficienteNotSinIndicioWhenSampleIsShortAndEffectIsAlsoBelowCriterion", () => {
    const h = html({ languages: { xpGained: 0, dailyXpRate: 0 } }).split('<div class="card"').find((c) => c.includes("Aceleración de ritmo"))!;
    expect(h).not.toContain("SIN INDICIO");
    expect(h).toContain("INSUFICIENTE");
    expect(h).toContain("0 XP ganados en la ventana; el criterio exige al menos 200.");
  });

  it("shouldNotRenderMissingHistoricalReferenceAsZeroWhenRateHasNoReference", () => {
    const h = html({ languages: { historicalDailyXpRate: 0, dailyXpRate: 15, xpGained: 1355 } });
    expect(h).toContain("15 XP/día en la ventana; no hay referencia histórica disponible (+1355 XP)");
    expect(h).not.toContain("0 XP/día histórico");
  });

  it("shouldShowHistoricalReferenceWhenItExists", () => {
    expect(html({ languages: { historicalDailyXpRate: 50, dailyXpRate: 20, xpGained: 140, intervalDays: 7 } })).toContain("20 XP/día en la ventana vs 50 XP/día histórico (+140 XP)");
  });

  it("shouldRenderIndicioWithAmberPill", () => {
    expect(html({ chess: { decidedCount: 9 } })).toContain('class="pill pill-warn">INDICIO');
  });

  it("shouldShowReadableWindowInChangesHeader", async () => {
    const rt = createDashboardRuntime("/changes");
    rt.sandbox.fetch = async () => ({ ok: true, json: async () => ({}) });
    await rt.sandbox.fetchWhatChanged("2026-10-01T10:37:59.169Z");
    expect(rt.getEl("#changesHeader").innerHTML).toContain("2026-10-01 10:37 UTC");
    expect(rt.getEl("#changesHeader").innerHTML).not.toContain("10:37:59.169Z");
  });

  it("shouldDisclaimFixedThresholdWhenEvaluationIsThresholdKind", () => {
    expect(html()).toContain("umbral fijo, sin intervalo de confianza");
  });

  it("shouldOrderAfirmadoBeforeIndicioBeforeSinIndicio", () => {
    const h = html({ chess: { colorDelta: wide } });
    expect(h.indexOf("INDICIO")).toBeGreaterThan(-1);
    expect(h.indexOf("INDICIO")).toBeLessThan(h.indexOf("SIN INDICIO"));
  });
});
