import { describe, it, expect } from "vitest";
import { evaluateTrajectory, type TrajectoryInput } from "../src/domain/trajectory.ts";
import { createDashboardRuntime, fetchOnly } from "./helpers/dom.ts";

const era = (ww: number, wd: number, bw: number, bd: number) => ({ whiteGames: wd, whiteDecided: wd, whiteWins: ww, blackGames: bd, blackDecided: bd, blackWins: bw });
const input = (o: Partial<TrajectoryInput["chess"]> = {}, lang = false): TrajectoryInput => ({
  chess: { startedAt: "2026-05-01T00:00:00.000Z", endedAt: "2026-09-01T00:00:00.000Z", totalGames: 160, activeDays: 75, ...era(60, 80, 40, 80), h1: era(30, 40, 20, 40), h2: era(30, 40, 20, 40), ...o },
  languages: lang
    ? { startedAt: "2026-01-01T00:00:00.000Z", endedAt: "2026-09-01T00:00:00.000Z", activeDays: 90, h1: { courses: [{ courseId: "DUOLINGO_XC_EN", xp: 5000 }] }, h2: { courses: [{ courseId: "DUOLINGO_XB_EN", xp: 5000 }, { courseId: "DUOLINGO_XC_EN", xp: 500 }] } }
    : { startedAt: null, endedAt: null, activeDays: 0, h1: { courses: [] }, h2: { courses: [] } },
});
const payload = (i: TrajectoryInput, withEvaluations = true) => {
  const r = evaluateTrajectory(i);
  return { userId: "u", temporalSpan: { startedAt: i.chess.startedAt, endedAt: i.chess.endedAt, totalDays: 123 }, findings: r.findings, ...(withEvaluations ? { evaluations: r.evaluations } : {}) };
};
async function render(p: unknown) {
  const rt = createDashboardRuntime("/trajectory");
  rt.sandbox.fetch = fetchOnly("/api/trajectory", async () => ({ ok: true, json: async () => p }));
  await rt.sandbox.fetchTrajectory();
  return { html: rt.getEl("#trajectoryFindings").innerHTML as string, empty: rt.getEl("#trajectoryEmpty").style.display as string };
}

describe("trajectory evaluations in the UI (P1 #4)", () => {
  it("shouldShowTheEmittedPatternAsAfirmadoWithItsClaimAndWindow", async () => {
    const { html, empty } = await render(payload(input()));
    expect(html).toContain("AFIRMADO");
    expect(html).toContain("consistentemente superior");
    expect(html).toContain("2026-05-01 → 2026-09-01");
    expect(empty).toBe("none");
  });

  it("shouldLabelTheEvaluationWithItsOwnWindowNotTheCompositeSpanOfTheResponse", async () => {
    const p = payload(input({ activeDays: 59 }));
    p.temporalSpan = { startedAt: "2026-01-01T00:00:00.000Z", endedAt: "2026-09-01T00:00:00.000Z", totalDays: 243 }; // languages start earlier
    const { html } = await render(p);
    expect(html).toContain("Ventana: 2026-05-01 → 2026-09-01");
    expect(html).not.toContain("2026-01-01");
  });

  it("shouldExplainWhyThereIsNoPatternInsteadOfShowingAnEmptyTab", async () => {
    const { html, empty } = await render(payload(input({ activeDays: 59 })));
    expect(html).toContain("INDICIO");
    expect(html).toContain("días con actividad: 59");
    expect(html).toContain("El criterio exige al menos 40 decididas por color y 60 días con actividad.");
    expect(empty).toBe("none"); // the evaluation is the content
  });

  it("shouldExplainAPersistenceFailureWithTheSignedDifferencesOfBothHalves", async () => {
    const { html } = await render(payload(input({ h2: era(30, 40, 28, 40) })));
    expect(html).toContain("+25 pp en la primera y +5 pp en la segunda");
    expect(html).toContain("el criterio exige al menos 10 pp en ambas");
  });

  it("shouldMarkInsuficienteWhenTheHistoryIsTooShort", async () => {
    const { html } = await render(payload(input({ endedAt: "2026-06-29T00:00:00.000Z" })));
    expect(html).toContain("INSUFICIENTE");
    expect(html).toContain("cubre 59 días; el criterio exige al menos 60");
  });

  it("shouldLabelTheLanguageFocusShiftSinEvaluarBecauseItHasNoEvaluation", async () => {
    const { html } = await render(payload(input({ activeDays: 59 }, true)));
    expect(html).toContain("Desplazamiento de foco");
    expect(html.match(/SIN EVALUAR/g)!.length).toBe(1); // the plain card says it has no status
    expect(html.match(/pill pill-scope/g)!.length).toBe(2); // evaluation card scope + the SIN EVALUAR label
  });

  it("shouldRenderPlainCardsWhenThePayloadHasNoEvaluations", async () => {
    const { html } = await render(payload(input(), false));
    expect(html).toContain("Asimetría por color");
    expect(html).not.toContain("AFIRMADO");
  });

  it("shouldShowTheQuietEmptyMessageWhenThereIsNothingAtAll", async () => {
    const { empty } = await render({ userId: "u", temporalSpan: { startedAt: null, endedAt: null, totalDays: null }, findings: [] });
    expect(empty).toBe("block");
  });
});
