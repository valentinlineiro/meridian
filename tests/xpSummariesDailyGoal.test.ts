import { describe, it, expect } from "vitest";
import { setupTestDb } from "./helpers/testDb.ts";
import { upsertXpSummaries, type StoredXpSummary } from "../src/db/storeLanguages.ts";
import { normalizeLanguagePayload } from "../src/normalization/languages.ts";

const day = (o: Partial<StoredXpSummary> = {}): StoredXpSummary => ({
  userId: "u1", date: 1790121600, gainedXp: 80, numSessions: 3, totalSessionTime: 400,
  streakExtended: 1, frozen: 0, repaired: 0, dailyGoalXp: 50, ...o,
});
const read = (db: any) => db.prepare("SELECT daily_goal_xp, updated_at FROM xp_summaries WHERE user_id='u1'").get();

describe("K7: xp_summaries.daily_goal_xp", () => {
  it("shouldStoreDailyGoalXpWhenInserted", async () => {
    const { db, d1 } = setupTestDb();
    await upsertXpSummaries(d1, [day()], "t1");
    expect(read(db)).toMatchObject({ daily_goal_xp: 50, updated_at: "t1" });
  });

  it("shouldNotRewriteTheRowWhenNothingChanged", async () => {
    const { db, d1 } = setupTestDb();
    await upsertXpSummaries(d1, [day()], "t1");
    await upsertXpSummaries(d1, [day()], "t2");
    expect(read(db).updated_at).toBe("t1");
  });

  it("shouldRewriteTheRowWhenOnlyDailyGoalXpChanged", async () => {
    const { db, d1 } = setupTestDb();
    await upsertXpSummaries(d1, [day()], "t1");
    await upsertXpSummaries(d1, [day({ dailyGoalXp: 60 })], "t2");
    expect(read(db)).toMatchObject({ daily_goal_xp: 60, updated_at: "t2" });
  });

  it("shouldTreatNullToValueAndValueToNullAsChanges", async () => {
    const { db, d1 } = setupTestDb();
    await upsertXpSummaries(d1, [day({ dailyGoalXp: null })], "t1");
    await upsertXpSummaries(d1, [day({ dailyGoalXp: null })], "t2");
    expect(read(db)).toMatchObject({ daily_goal_xp: null, updated_at: "t1" });
    await upsertXpSummaries(d1, [day({ dailyGoalXp: 50 })], "t3");
    expect(read(db)).toMatchObject({ daily_goal_xp: 50, updated_at: "t3" });
    await upsertXpSummaries(d1, [day({ dailyGoalXp: null })], "t4");
    expect(read(db)).toMatchObject({ daily_goal_xp: null, updated_at: "t4" });
  });

  it("shouldRewriteTheRowWhenAnotherFieldChanged", async () => {
    const { db, d1 } = setupTestDb();
    await upsertXpSummaries(d1, [day()], "t1");
    await upsertXpSummaries(d1, [day({ gainedXp: 90 })], "t2");
    expect(db.prepare("SELECT gained_xp FROM xp_summaries").get().gained_xp).toBe(90);
    expect(read(db).updated_at).toBe("t2");
  });

  it("shouldNormalizeDailyGoalXpAsNullWhenAbsent", () => {
    const n = normalizeLanguagePayload({ userId: "u1", data: { xpSummaries: [{ date: 1, dailyGoalXp: 50 }, { date: 2 }] } });
    expect(n.xpSummaries.map((s) => s.dailyGoalXp)).toEqual([50, null]);
  });
});
