import type { DailyGoal } from "../../../src/slices/daily-goal/domain/DailyGoal.ts";
import type { DailyGoalRepository } from "../../../src/slices/daily-goal/ports/DailyGoalRepository.ts";
import type { ProviderAccountLookup } from "../../../src/slices/daily-goal/ports/ProviderAccountLookup.ts";

export class InMemoryDailyGoalRepository implements DailyGoalRepository {
  readonly goals = new Map<string, DailyGoal | null>();
  async find(ownerId: string) { return this.goals.get(ownerId) ?? null; }
  async save(ownerId: string, goal: DailyGoal | null) { this.goals.set(ownerId, goal); }
}

export const providerAccounts = (byEmail: Record<string, string>): ProviderAccountLookup => ({
  resolveProviderUserId: async (email) => byEmail[email] ?? null,
});
