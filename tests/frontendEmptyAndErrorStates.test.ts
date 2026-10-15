import { describe, it, expect } from "vitest";
import { createDashboardRuntime, fetchOnly } from "./helpers/dom.ts";

// PR 2 of the frontend audit: an empty window, a failed request and an unavailable total are three different things.
const settle = async () => { for (let i = 0; i < 300; i++) await Promise.resolve(); };
const http500 = async () => ({ ok: false, status: 500, json: async () => ({ ok: false, error: "internal error" }) });
const ok = (body: unknown) => async () => ({ ok: true, status: 200, json: async () => body });
const text = (rt: any, sel: string): string => rt.getEl(sel).textContent;

const quietPayload = (evaluations: unknown[]) => ({
  interval: { since: "2026-10-01T00:00:00.000Z", until: "2026-10-08T00:00:00.000Z" },
  chess: { gamesCount: 0, intervalWinRate: null, historicalDelta: null },
  languages: { xpGained: 0, sessionsCount: 0, totalSessionMinutes: 0, baselineCourseId: null, currentCourseId: null, courseChanged: false },
  streak: { baselineStreak: null, currentStreak: null, streakDelta: null, status: "active" },
  findings: [], evaluations,
});
const evaluation = { id: "LANG_XP_ACCELERATION", kind: "threshold", status: "not_emitted", reasons: ["data_unavailable"], metrics: { observedDays: 0 }, criteria: {} };
const activePayload = { ...quietPayload([evaluation]), languages: { ...quietPayload([]).languages, xpGained: 40, sessionsCount: 2 } };

describe("what changed: a quiet window still says what could not be judged", () => {
  it("shouldKeepTheEvaluationsWhenTheWindowHasNoActivity", () => {
    const rt = createDashboardRuntime("/changes");
    rt.sandbox.renderWhatChanged(quietPayload([evaluation]));
    expect(text(rt, "#changesEmpty")).toMatch(/^No hay actividad registrada entre/);
    expect(rt.getEl("#changesFindings").innerHTML).toContain("INSUFICIENTE");
    expect(rt.getEl("#changesActivity").innerHTML).toBe("");
  });
});

describe("what changed: a failed load does not leave another window's data under the new header", () => {
  const boot = async () => {
    let mode: "ok" | "500" | "malformed" = "ok";
    const rt = createDashboardRuntime("/changes", undefined, fetchOnly(["/api/what-changed"], async () =>
      mode === "500" ? http500() : mode === "malformed" ? ok({})() : ok(activePayload)()));
    await settle();
    return { rt, set: (m: typeof mode) => { mode = m; } };
  };

  it("shouldClearFindingsAndActivityWhenTheRequestFails", async () => {
    const { rt, set } = await boot();
    expect(rt.getEl("#changesFindings").innerHTML).toContain("INSUFICIENTE");
    set("500");
    await rt.sandbox.fetchWhatChanged("2026-09-01T00:00:00.000Z");
    expect(rt.getEl("#changesFindings").innerHTML).toBe("");
    expect(rt.getEl("#changesActivity").innerHTML).toBe("");
    expect(text(rt, "#changesEmpty")).toMatch(/Error al cargar/);
  });

  it("shouldSayTheAnswerWasIncompleteInsteadOfKeepingTheOldBody", async () => {
    const { rt, set } = await boot();
    set("malformed");
    await rt.sandbox.fetchWhatChanged("2026-09-01T00:00:00.000Z");
    expect(rt.getEl("#changesFindings").innerHTML).toBe("");
    expect(text(rt, "#changesEmpty")).toMatch(/incompleta/);
  });
});

describe("trajectory: an error message does not outlive the error", () => {
  it("shouldNotKeepTheErrorTextWhenALaterLoadSucceedsWithNoPatterns", async () => {
    let fail = true;
    const rt = createDashboardRuntime("/trajectory", undefined, fetchOnly(["/api/trajectory"], async () =>
      fail ? http500() : ok({ findings: [], evaluations: [], temporalSpan: null })()));
    await settle();
    expect(text(rt, "#trajectoryEmpty")).toMatch(/Error al cargar/);
    fail = false;
    await rt.sandbox.fetchTrajectory();
    expect(text(rt, "#trajectoryEmpty")).not.toMatch(/Error/);
  });
});

describe("overview: the catalogue total", () => {
  it("shouldNotSumUnknownCourseXpAsZero", () => {
    const rt = createDashboardRuntime("/overview");
    rt.renderOverviewLangCard({ totalXp: null, courses: [{ courseId: "A", xp: 100 }, { courseId: "B", xp: null }] }, null);
    expect(text(rt, "#overviewLangCatalogXp")).toBe("2 cursos · — XP");
  });
});
