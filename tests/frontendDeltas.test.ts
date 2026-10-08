import { describe, it, expect } from "vitest";
import { DASHBOARD_HTML } from "../src/frontend.ts";

const fn = (name: string) => DASHBOARD_HTML.match(new RegExp(`function ${name}\\([^)]*\\)\\{[\\s\\S]*?\\n\\}`))![0];
const evaluations = DASHBOARD_HTML.slice(DASHBOARD_HTML.indexOf("function evalState"), DASHBOARD_HTML.indexOf("function renderWhatChanged")); // functions plus the constants they share
const lib = ["esc", "fmtDelta", "scaleDelta", "setColDiff", "pctCi", "renderForm"].map(fn).join("\n") + "\n" + evaluations + "\n" + fn("renderWhatChanged");
function run(call: string, els: Record<string, any> = {}) {
  const q = (sel: string) => (els[sel] ??= { innerHTML: "", textContent: "", style: {} });
  new Function("q", "document", `${lib}; ${call}`)(q, { getElementById: () => null });
  return els;
}
const fmt = (d: any) => new Function(`${fn("fmtDelta")}; return fmtDelta(${JSON.stringify(d)});`)() as string;

describe("fmtDelta", () => {
  it("shouldShowSignedDiffWithItsIntervalAndNoVerdictWhenIntervalExcludesZero", () => {
    expect(fmt({ diff: 25, lower: 3.8, upper: 43.3 })).toBe("+25.0 pp · IC95 [+4, +43]");
  });
  it("shouldSayInsufficientEvidenceWhenIntervalIncludesZero", () => {
    expect(fmt({ diff: 2.5, lower: -23, upper: 25.4 })).toBe("+2.5 pp · IC95 [−23, +25] · sin evidencia suficiente");
    expect(fmt({ diff: 5, lower: 0, upper: 9 })).toContain("sin evidencia suficiente"); // lower ≤ 0 ≤ upper
  });
  it("shouldNeverClaimNoDifference", () => expect(fmt({ diff: 0, lower: -5, upper: 5 })).not.toMatch(/sin diferencia/i));
  it("shouldShowDashWithoutDelta", () => expect(fmt(null)).toBe("—"));
  it("shouldNotPrintSignedZeroForTheDiff", () => expect(fmt({ diff: -0.04, lower: -0.3, upper: 0.2 })).toMatch(/^0\.0 pp · IC95 \[−0, \+0\]/));
});

describe("fmtDelta rounding frontier", () => {
  it("shouldKeepTheTrueSignOfALimitThatRoundsToZeroAndNotLabelIt", () => {
    const t = fmt({ diff: 10, lower: 0.4, upper: 20 });
    expect(t).toBe("+10.0 pp · IC95 [+0, +20]"); // excludes 0: no label, and the sign shows it
  });
  it("shouldLabelWhenALimitRoundsToZeroFromBelow", () => {
    expect(fmt({ diff: 10, lower: -0.4, upper: 20 })).toBe("+10.0 pp · IC95 [−0, +20] · sin evidencia suficiente");
  });
  it("shouldLabelWhenALimitIsExactlyZero", () => {
    expect(fmt({ diff: 10, lower: 0, upper: 20 })).toBe("+10.0 pp · IC95 [0, +20] · sin evidencia suficiente");
  });
});

describe("color difference line", () => {
  const groups = [{ key: "white", winRate: 0.7 }, { key: "black", winRate: 0.45 }];
  it("shouldShowRatesAndTheDifferenceWithItsInterval", () => {
    const els = run(`setColDiff(${JSON.stringify({ groups, difference: { diff: 0.25, lower: 0.038, upper: 0.433 } })})`);
    expect(els["#colDiff"].textContent).toBe("Blancas 70.0% · Negras 45.0% → +25.0 pp · IC95 [+4, +43]");
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
    expect(html).toContain("+2.5 pp · IC95 [−23, +25] · sin evidencia suficiente vs anteriores");
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
    expect(html).toContain("+20.0 pp · IC95 [−1, +38] · sin evidencia suficiente");
  });
});
