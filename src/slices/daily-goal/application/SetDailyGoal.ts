import { NotFoundError } from "../../../application/errors.ts";
import { DailyGoal } from "../domain/DailyGoal.ts";
import type { DailyGoalRepository } from "../ports/DailyGoalRepository.ts";
import type { ProviderAccountLookup } from "../ports/ProviderAccountLookup.ts";

export class SetDailyGoal {
  constructor(
    private readonly accounts: ProviderAccountLookup,
    private readonly goals: DailyGoalRepository,
    private readonly now: () => Date,
  ) {}

  async execute(command: { ownerEmail: string; dailyGoalXp: number | null }): Promise<number | null> {
    const ownerId = await this.accounts.resolveProviderUserId(command.ownerEmail);
    if (!ownerId) throw new NotFoundError("no provider account");
    const goal = command.dailyGoalXp === null ? null : DailyGoal.of(command.dailyGoalXp);
    await this.goals.save(ownerId, goal, this.now().toISOString());
    return goal?.xp ?? null;
  }
}
