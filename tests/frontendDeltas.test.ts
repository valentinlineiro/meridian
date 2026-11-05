import { describe, it, expect } from "vitest";
import { callDashboard } from "./helpers/dom.ts";

const run = (call: string): Record<string, any> => callDashboard(call).els;
const fmt = (d: any): string => callDashboard(`fmtDelta(${JSON.stringify(d)})`).result;

describe("fmtDelta", () => {
  it("shouldShowSignedDiffWithItsIntervalAndNoVerdictWhenIntervalExcludesZero", () => {
    expect(fmt({ diff: 25, lower: 3.8, upper: 43.3 })).toBe("+25,0 pp · IC95 [+3,8; +43,3]");
  });
  it("shouldSayInsufficientEvidenceWhenIntervalIncludesZero", () => {
    expect(fmt({ diff: 2.5, lower: -23, upper: 25.4 })).toBe("+2,5 pp · IC95 [−23,0; +25,4] · sin evidencia suficiente");
    expect(fmt({ diff: 5, lower: 0, upper: 9 })).toContain("sin evidencia suficiente"); // lower ≤ 0 ≤ upper
  });
  it("shouldNeverClaimNoDifference", () => expect(fmt({ diff: 0, lower: -5, upper: 5 })).not.toMatch(/sin diferencia/i));
  it("shouldShowDashWithoutDelta", () => expect(fmt(null)).toBe("—"));
  it("shouldNotPrintSignedZeroForTheDiff", () => expect(fmt({ diff: -0.04, lower: -0.3, upper: 0.2 })).toMatch(/^0,0 pp · IC95 \[−0,3; \+0,2\]/));
});

describe("fmtDelta rounding frontier", () => {
  it("shouldKeepTheTrueSignOfALimitThatRoundsToZeroAndNotLabelIt", () => {
    const t = fmt({ diff: 10, lower: 0.4, upper: 20 });
    expect(t).toBe("+10,0 pp · IC95 [+0,4; +20,0]"); // excludes 0: no label, and the sign shows it
  });
  it("shouldLabelWhenALimitRoundsToZeroFromBelow", () => {
    expect(fmt({ diff: 10, lower: -0.4, upper: 20 })).toBe("+10,0 pp · IC95 [−0,4; +20,0] · sin evidencia suficiente");
  });
  it("shouldLabelWhenALimitIsExactlyZero", () => {
    expect(fmt({ diff: 10, lower: 0, upper: 20 })).toBe("+10,0 pp · IC95 [0,0; +20,0] · sin evidencia suficiente");
  });
});

describe("color difference line", () => {
  const groups = [{ key: "white", winRate: 0.7 }, { key: "black", winRate: 0.45 }];
  it("shouldShowRatesAndTheDifferenceWithItsInterval", () => {
    const els = run(`setColDiff(${JSON.stringify({ groups, difference: { diff: 0.25, lower: 0.038, upper: 0.433 } })})`);
    expect(els["#colDiff"].textContent).toBe("Blancas 70,0 % · Negras 45,0 % → +25,0 pp · IC95 [+3,8; +43,3]");
  });
  it("shouldStayUntouchedWhenAColourHasNoWinRate", () => {
    const els = run(`setColDiff(${JSON.stringify({ groups: [groups[0], { key: "black", winRate: null }], difference: null })})`);
    expect(els["#colDiff"]).toBeUndefined();
  });
});

describe("form card delta", () => {
  const side = (o: any) => ({ key: "x", games: 20, wins: 13, losses: 7, draws: 0, decided: 20, winRate: 0.65, scoreRate: 0.65, winRateCi: null, ...o });
  const form = (r: any) => run(`renderForm(${JSON.stringify(r)})`)["#form"].innerHTML as string;

  it("shouldShowTheDeltaWithIntervalAndTheInsufficientEvidenceLabel", () => {
    const html = form({ ...side({ limit: 20 }), before: side({ games: 40 }), delta: { diff: 0.025, lower: -0.23, upper: 0.254 } });
    expect(html).toContain("+2,5 pp · IC95 [−23,0; +25,4] · sin evidencia suficiente vs anteriores");
  });
  it("shouldNotShowAScoreDelta", () => {
    const html = form({ ...side({ limit: 20 }), before: side({ games: 40, scoreRate: 0.3 }), delta: { diff: 0.3, lower: 0.1, upper: 0.5 } });
    expect(html).not.toMatch(/score vs anteriores/);
  });
  it("shouldShowNoDeltaWhenThereIsNone", () => {
    expect(form({ ...side({ limit: 20 }), before: side({ games: 0, winRate: null }), delta: null })).not.toContain("vs anteriores</div>");
  });
});

describe("what-changed historical delta", () => {
  it("shouldRenderTheHistoricalDeltaWithItsInterval", () => {
    const data = {
      userId: "u", interval: { since: "a", until: "b" }, baseline: { status: "exactOrPrevious", observedAt: "a" },
      chess: { gamesCount: 20, decidedCount: 20, unknownCount: 0, ratingDelta: 0, baselineRating: 800, currentRating: 800, intervalWinRate: 70, whiteWinRate: null, blackWinRate: null, historicalWinRateDelta: 20, colorDelta: null, historicalDelta: { diff: 20, lower: -1.2, upper: 38 } },
      languages: { xpGained: 450, sessionsCount: 6, totalSessionMinutes: 35, baselineCourseId: null, currentCourseId: null, courseChanged: false }, streak: { baselineStreak: 1, currentStreak: 2, streakDelta: 1, status: "active", streakStarted: false, streakMilestone: null }, findings: [],
    };
    const els = run(`renderWhatChanged(${JSON.stringify(data)})`);
    const html = Object.values(els).map((e: any) => e.innerHTML).join("");
    expect(html).toContain("+20,0 pp · IC95 [−1,2; +38,0] · sin evidencia suficiente");
  });
});

describe("audit P7/P8: one notation, and an indicator that says something", () => {
  const call = (expr: string) => callDashboard(expr).result;
  it("shouldWriteIntervalsLikeTheColourConclusionDoes", () => {
    // the Comparativa line and the Patrones conclusion are on one screen: same one-decimal, comma notation
    expect(fmt({ diff: 5.6, lower: 1.04, upper: 10.3 })).toBe("+5,6 pp · IC95 [+1,0; +10,3]");
  });
  it("shouldWritePercentagesWithACommaAndASpace", () => {
    expect(call("pc1(64.66)")).toBe("64,7 %");
    expect(call("pctCi(0.646, { lower: 0.62, upper: 0.68 })")).toBe("64,6 % [62–68]");
    expect(call("pct(1, 3)")).toBe("33,3 %");
  });
  it("shouldSayHowFarBackTheXpRecordGoesInsteadOfASaturatedRatio", () => {
    expect(call("activeDaysText(90, 90, 1782345600)")).toBe("90 de 90 días con XP (registro desde 2026-06-25)");
    expect(call("activeDaysText(2, 3, null)")).toBe("2 de 3 días con XP");
    expect(call("activeDaysText(2, 3, NaN)")).toBe("2 de 3 días con XP");
  });
});
