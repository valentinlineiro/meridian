import { describe, it, expect, beforeEach } from "vitest";
import { GetDailyGoal } from "../../../src/slices/daily-goal/application/GetDailyGoal.ts";
import { SetDailyGoal } from "../../../src/slices/daily-goal/application/SetDailyGoal.ts";
import { InvalidDailyGoal } from "../../../src/slices/daily-goal/domain/DailyGoal.ts";
import { NotFoundError } from "../../../src/application/errors.ts";
import { InMemoryDailyGoalRepository, providerAccounts } from "./fakes.ts";

const OWNER = "owner@example.com";
let goals: InMemoryDailyGoalRepository;
let set: SetDailyGoal;
let get: GetDailyGoal;

beforeEach(() => {
  goals = new InMemoryDailyGoalRepository();
  const accounts = providerAccounts({ [OWNER]: "2000001" });
  set = new SetDailyGoal(accounts, goals, () => new Date("2026-10-08T10:00:00Z"));
  get = new GetDailyGoal(accounts, goals);
});

describe("SetDailyGoal", () => {
  it("shouldStoreTheGoalWhenItIsValid", async () => {
    expect(await set.execute({ ownerEmail: OWNER, dailyGoalXp: 50 })).toBe(50);
    expect(await get.execute({ ownerEmail: OWNER })).toBe(50);
  });

  it("shouldReplaceTheGoalWhenItChanges", async () => {
    await set.execute({ ownerEmail: OWNER, dailyGoalXp: 50 });
    await set.execute({ ownerEmail: OWNER, dailyGoalXp: 80 });
    expect(await get.execute({ ownerEmail: OWNER })).toBe(80);
  });

  it("shouldClearTheGoalWhenNullIsGiven", async () => {
    await set.execute({ ownerEmail: OWNER, dailyGoalXp: 50 });
    expect(await set.execute({ ownerEmail: OWNER, dailyGoalXp: null })).toBeNull();
    expect(await get.execute({ ownerEmail: OWNER })).toBeNull();
  });

  it.each([[0], [-1], [2.5], [10001], [NaN], [Infinity]])("shouldRejectTheGoalWhenItIs %s", async (xp) => {
    await expect(set.execute({ ownerEmail: OWNER, dailyGoalXp: xp })).rejects.toBeInstanceOf(InvalidDailyGoal);
    expect(await get.execute({ ownerEmail: OWNER })).toBeNull();
  });

  it("shouldKeepThePreviousGoalWhenTheNewOneIsInvalid", async () => {
    await set.execute({ ownerEmail: OWNER, dailyGoalXp: 50 });
    await expect(set.execute({ ownerEmail: OWNER, dailyGoalXp: 0 })).rejects.toBeInstanceOf(InvalidDailyGoal);
    expect(await get.execute({ ownerEmail: OWNER })).toBe(50);
  });

  it("shouldFailWithNotFoundWhenTheOwnerHasNoProviderAccount", async () => {
    await expect(set.execute({ ownerEmail: "stranger@example.com", dailyGoalXp: 50 })).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("GetDailyGoal", () => {
  it("shouldReturnNullWhenNoGoalWasEverConfigured", async () => {
    expect(await get.execute({ ownerEmail: OWNER })).toBeNull();
  });

  it("shouldFailWithNotFoundWhenTheOwnerHasNoProviderAccount", async () => {
    await expect(get.execute({ ownerEmail: "stranger@example.com" })).rejects.toBeInstanceOf(NotFoundError);
  });
});
