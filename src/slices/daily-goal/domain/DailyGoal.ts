import { DomainError } from "../../../kernel/errors.ts";

export const MAX_DAILY_GOAL_XP = 10000;

export class InvalidDailyGoal extends DomainError {
  constructor() {
    super("INVALID_DAILY_GOAL", `the daily goal must be an integer between 1 and ${MAX_DAILY_GOAL_XP} XP`);
  }
}

export class DailyGoal {
  private constructor(readonly xp: number) {}

  static of(xp: number): DailyGoal {
    if (!Number.isInteger(xp) || xp < 1 || xp > MAX_DAILY_GOAL_XP) throw new InvalidDailyGoal();
    return new DailyGoal(xp);
  }
}
