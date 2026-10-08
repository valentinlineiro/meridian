import { NotFoundError } from "../../../application/errors.ts";
import type { DailyGoalRepository } from "../ports/DailyGoalRepository.ts";
import type { ProviderAccountLookup } from "../ports/ProviderAccountLookup.ts";

export class GetDailyGoal {
  constructor(private readonly accounts: ProviderAccountLookup, private readonly goals: DailyGoalRepository) {}

  async execute(query: { ownerEmail: string }): Promise<number | null> {
    const ownerId = await this.accounts.resolveProviderUserId(query.ownerEmail);
    if (!ownerId) throw new NotFoundError("no provider account");
    return (await this.goals.find(ownerId))?.xp ?? null;
  }
}
