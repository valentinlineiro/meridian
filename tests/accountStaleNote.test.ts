import { describe, it, expect } from "vitest";
import { createDashboardRuntime } from "./helpers/dom.ts";

const note = (langs: object) => (createDashboardRuntime("/").sandbox as any).accountStaleNote(langs);

describe("dashboard account freshness note", () => {
  it("shouldSayXpAndStreakWereNeverObservedWhenNoObservationExists", () => {
    expect(note({ updatedAt: "2026-10-05T06:00:00Z", totalXpObservedAt: null, streakObservedAt: null })).toBe(" · XP y racha: sin observar");
  });

  it("shouldShowTheObservationDateWhenXpIsOlderThanTheLastSnapshot", () => {
    expect(note({ updatedAt: "2026-10-05T06:00:00Z", totalXpObservedAt: "2026-09-25T06:53:56Z", streakObservedAt: "2026-09-25T06:53:56Z" }))
      .toBe(" · XP y racha observados el 2026-09-25");
  });

  it("shouldStaySilentWhenXpAndStreakWereObservedInTheLastSnapshot", () => {
    expect(note({ updatedAt: "2026-10-05T06:00:00Z", totalXpObservedAt: "2026-10-05T06:00:00Z", streakObservedAt: "2026-10-05T06:00:00Z" })).toBe("");
  });
});
