import { describe, it, expect } from "vitest";
import { createDashboardRuntime } from "./helpers/dom.ts";

// P1 #6: numbers the product no longer shows. The API and its contract keep carrying them (an amendment would be needed to slim the payload).
const analytics = () => ({
  activity: { activeDays: 10 },
  period: { calendarDays: 30 },
  intensity: {
    global: { xpPerSession: 28, secondsPerSession: 60, xpPerMinute: 28 },
    dailyDistribution: { xpPerSessionMedian: 30, secondsPerSessionMedian: 62, xpPerMinuteMedian: 29 },
  },
  weekdayProfile: [],
  historicalConcentration: {
    totalLinguisticXp: 112000, hhi: 0.3552, effectiveCourseCount: 2.82, top3SharePercentage: 90,
    courses: [{ courseId: "A", title: "Demo Alpha", sharePercentage: 60 }, { courseId: "B", title: "Demo Beta", sharePercentage: 40 }],
  },
  curriculum: { recentDeltas: [] },
});
const render = () => {
  const rt = createDashboardRuntime("/languages");
  rt.sandbox.renderLanguagesAnalytics(analytics());
  return rt;
};

describe("concentration card without HHI / top-3 / effective courses", () => {
  it("shouldNotShowTheConcentrationIndices", () => {
    const html = render().getEl("#langConcentrationBody").innerHTML;
    expect(html).not.toMatch(/HHI|Cursos efectivos|Cuota Top 3|1 \/ HHI|0\.3552|2\.82/);
  });
  it("shouldKeepTheShareByCourseAndTheLifetimeTotal", () => {
    const html = render().getEl("#langConcentrationBody").innerHTML;
    expect(html).toContain("Demo Alpha");
    expect(html).toContain("60.0%");
    expect(html).toMatch(/Total vitalicio lingüístico: 112[.,]000 XP en 2 cursos\./);
  });
});
