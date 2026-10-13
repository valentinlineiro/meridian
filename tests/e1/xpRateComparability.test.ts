import { describe, it, expect } from "vitest";
import { setupTestDb } from "../helpers/testDb.ts";
import { createD1WhatChangedAdapter } from "../../src/infrastructure/d1/d1WhatChangedAdapter.ts";
import { getWhatChangedUseCase } from "../../src/application/getWhatChangedUseCase.ts";
import { normalizeLanguagePayload } from "../../src/normalization/languages.ts";
import { containedUtcDays } from "../../src/domain/utcDays.ts";

// Amendment A5 (docs/contracts/2026-10-06-discarded-signals-contract.md §13), tests exigidos §13.10. Synthetic data only. These began
// as the E1 characterization tests of defect F1 and now state the approved contract; the numbers are the same fixtures.
const day = (iso: string) => Math.floor(new Date(`${iso}T00:00:00Z`).getTime() / 1000);
const dates = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => `2026-09-${String(from + i).padStart(2, "0")}`);

function world(rows: Array<[date: string, xp: number]>) {
  const { db, d1 } = setupTestDb();
  db.prepare("INSERT INTO users (id, created_at) VALUES ('u1', '2026-01-01')").run();
  for (const [date, xp] of rows) {
    db.prepare(`INSERT INTO xp_summaries (user_id, date, gained_xp, num_sessions, total_session_time, updated_at)
      VALUES ('u1', ?, ?, ?, 60, '2026-12-31')`).run(day(date), xp, xp > 0 ? 1 : 0);
  }
  return createD1WhatChangedAdapter(d1);
}

// 14 days of history at 100 XP (09-01..09-14) and four window days at 150 XP (09-15..09-18): the true ratio is 1.5.
const HIST_AND_WINDOW: Array<[string, number]> = [
  ...dates(1, 14).map((d) => [d, 100] as [string, number]),
  ...dates(15, 18).map((d) => [d, 150] as [string, number]),
];

async function lang(adapter: ReturnType<typeof world>, since: string, until: string) {
  const r = await getWhatChangedUseCase(adapter, { since, until, userId: "u1" });
  return { r, ev: r.evaluations.find((e) => e.id === "LANG_XP_ACCELERATION")! };
}

describe("A5: the XP rate compares whole UTC days with whole UTC days", () => {
  it("shouldGiveTheSameRatioAndStateWhenOnlyTheHourOfTheWindowEdgesChanges", async () => {
    const a = world(HIST_AND_WINDOW);
    // the same four contained days (15..18) and the same reference (days <= 13): the day holding each edge is partial and excluded
    const ws = [
      ["2026-09-14T00:01:00.000Z", "2026-09-19T00:00:00.000Z"],
      ["2026-09-14T12:00:00.000Z", "2026-09-19T00:01:00.000Z"],
      ["2026-09-14T23:59:00.000Z", "2026-09-19T23:59:00.000Z"],
    ] as const;
    for (const [since, until] of ws) {
      const { r, ev } = await lang(a, since, until);
      expect(r.languages.xpGained).toBe(600);
      expect(ev.metrics.ratio).toBeCloseTo(1.5, 5);
      expect(ev.status).toBe("emitted");
      expect(ev.metrics.intervalDays).toBe(4);
    }
  });

  it("shouldExcludeTheDayOfUntilAndTheDayOfSinceAndDeclareThemWhenTheEdgesAreNotMidnights", async () => {
    const { r, ev } = await lang(world(HIST_AND_WINDOW), "2026-09-14T23:59:00.000Z", "2026-09-18T00:01:00.000Z");
    expect(r.languages.xpGained).toBe(450); // 09-15, 09-16, 09-17; 09-18 holds `until` (00:01) and is partial
    expect(ev.metrics.partialDaysExcluded).toBe(2);
    expect(ev.metrics.intervalDays).toBe(3);
  });

  it("shouldNotCountAnyDayInBothTheIntervalAndTheReferenceWhenTheWindowIsAnyOfAGrid", async () => {
    // day d carries 2^d XP: a day in both sides would repeat a bit
    const a = world(Array.from({ length: 20 }, (_, i) => [`2026-09-${String(i + 1).padStart(2, "0")}`, 2 ** i] as [string, number]));
    for (const since of ["2026-09-08T00:00:00.000Z", "2026-09-08T00:01:00.000Z", "2026-09-08T23:59:00.000Z"])
      for (const until of ["2026-09-15T00:00:00.000Z", "2026-09-15T00:01:00.000Z", "2026-09-15T23:59:00.000Z"]) {
        const interval = await a.getLanguagesInterval("u1", since, until);
        const cov = await a.getHistoricalXpCoverage("u1", since);
        const reference = Math.round((await a.getHistoricalDailyXpRate("u1", since)) * cov.observedDays);
        expect(interval.xpGained & reference).toBe(0);
      }
  });

  it("shouldReportSpanTooShortWhenTheElapsedTimeIsThreeDaysButOnlyTwoWholeDaysAreContained", async () => {
    const { ev } = await lang(world(HIST_AND_WINDOW), "2026-09-14T12:00:00.000Z", "2026-09-17T12:00:00.000Z");
    expect(ev.metrics.intervalDays).toBe(2);
    expect(ev.reasons).toContain("span_too_short");
  });

  it("shouldReportDataUnavailableWhenNoDayWithARecordPrecedesTheWindow", async () => {
    const { ev } = await lang(world(dates(15, 18).map((d) => [d, 150] as [string, number])), "2026-09-14T12:00:00.000Z", "2026-09-19T00:00:00.000Z");
    expect(ev.reasons).toContain("data_unavailable");
    expect(ev.status).toBe("not_emitted");
    expect(ev.metrics.historicalObservedDays).toBe(0);
    expect(ev.metrics.historicalSpanDays).toBeUndefined(); // null, not 0
  });

  it("shouldReportDataUnavailableWhenNoDayOfTheWindowHasARecord", async () => {
    const { ev } = await lang(world(dates(1, 14).map((d) => [d, 100] as [string, number])), "2026-09-14T12:00:00.000Z", "2026-09-19T00:00:00.000Z");
    expect(ev.reasons).toContain("data_unavailable");
    expect(ev.metrics.observedDays).toBe(0);
    expect(ev.metrics.dailyRate).toBeUndefined(); // not "0 XP/day"
  });

  it("shouldDivideBothSidesByTheirDaysWithARecordWhenTheWindowHasDaysWithoutRows", async () => {
    // provisional base (§13.5): XP per day WITH A RECORD on both sides. Window days 15 and 17 only; 16 and 18 have no row.
    const rows: Array<[string, number]> = [...dates(1, 14).map((d) => [d, 100] as [string, number]), ["2026-09-15", 300], ["2026-09-17", 300]];
    const { r, ev } = await lang(world(rows), "2026-09-14T12:00:00.000Z", "2026-09-19T00:00:00.000Z");
    expect(r.languages.xpGained).toBe(600);
    expect(ev.metrics.intervalDays).toBe(4); // contained, with or without a row
    expect(ev.metrics.observedDays).toBe(2);
    expect(ev.metrics.dailyRate).toBe(300); // 600 / 2 days with a record
    expect(ev.metrics.historicalRate).toBe(100);
  });

  it("shouldExposeCoverageAsADescriptiveFactThatNoEmissionConditionReadsWhenDaysWithoutRowsExist", async () => {
    const dense = world([...dates(1, 14).map((d) => [d, 100] as [string, number]), ...dates(15, 18).map((d) => [d, 150] as [string, number])]);
    const sparse = world([...dates(1, 14).filter((_, i) => i % 2 === 1).map((d) => [d, 100] as [string, number]), ...dates(15, 18).map((d) => [d, 150] as [string, number])]);
    const a = await lang(dense, "2026-09-14T12:00:00.000Z", "2026-09-19T00:00:00.000Z");
    const b = await lang(sparse, "2026-09-14T12:00:00.000Z", "2026-09-19T00:00:00.000Z");
    expect(a.ev.metrics).toMatchObject({ historicalSpanDays: 13, historicalObservedDays: 13, historicalSpanStart: "2026-09-01" });
    expect(b.ev.metrics).toMatchObject({ historicalSpanDays: 12, historicalObservedDays: 6, historicalSpanStart: "2026-09-02" });
    expect(b.ev.status).toBe(a.ev.status); // same record rate, 100 % vs 50 % coverage: same emission
    expect(b.ev.metrics.ratio).toBe(a.ev.metrics.ratio);
  });

  it("shouldKeepADayWithoutARowInTheCoverageDenominatorWhenAnInteriorRowIsMissing", async () => {
    const all = dates(1, 14).map((d) => [d, 100] as [string, number]);
    const withHole = all.filter(([d]) => d !== "2026-09-07");
    const a = await world(all).getHistoricalXpCoverage("u1", "2026-09-15T00:00:00.000Z");
    const b = await world(withHole).getHistoricalXpCoverage("u1", "2026-09-15T00:00:00.000Z");
    expect(b.spanDays).toBe(a.spanDays); // the missing day stays in the denominator
    expect(b.observedDays).toBe(a.observedDays - 1);
  });

  it("shouldReturnNoCoverageWhenTheUserHasNoRowBeforeTheWindow", async () => {
    expect(await world([]).getHistoricalXpCoverage("u1", "2026-09-15T00:00:00.000Z")).toEqual({ spanStart: null, spanDays: null, observedDays: 0 });
  });
});

describe("A5: contained days of a window", () => {
  it("shouldCountWholeDaysAndPartialDaysWhenEdgesAreMidnightsOrNot", () => {
    expect(containedUtcDays("2026-09-14T00:00:00.000Z", "2026-09-18T00:00:00.000Z")).toMatchObject({ count: 4, partialDaysExcluded: 0 });
    expect(containedUtcDays("2026-09-14T00:01:00.000Z", "2026-09-18T00:01:00.000Z")).toMatchObject({ count: 3, partialDaysExcluded: 2 });
    expect(containedUtcDays("2026-09-14T08:00:00.000Z", "2026-09-14T18:00:00.000Z")).toMatchObject({ count: 0, partialDaysExcluded: 1 });
  });
});

describe("A5: unknown is not zero at the XP layer", () => {
  it("shouldNotWriteARowWhenGainedXpIsAbsentAndKeepAnObservedZero", () => {
    const { xpSummaries } = normalizeLanguagePayload({
      userId: "u1",
      data: { xpSummaries: [{ date: 1790121600 }, { date: 1790208000, gainedXp: 0 }] },
    });
    expect(xpSummaries.map((s) => [s.date, s.gainedXp])).toEqual([[1790208000, 0]]);
  });

  it("shouldCountAnObservedZeroAsADayWithARecordWhenGainedXpIsZero", async () => {
    const rows: Array<[string, number]> = [...dates(1, 14).map((d) => [d, 100] as [string, number]), ["2026-09-15", 0], ["2026-09-16", 400]];
    const { ev } = await lang(world(rows), "2026-09-14T12:00:00.000Z", "2026-09-17T00:00:00.000Z");
    expect(ev.metrics.observedDays).toBe(2);
    expect(ev.metrics.dailyRate).toBe(200); // 400 XP over the two days with a record, one of them an observed zero
  });
});
