import type { DailyGoal } from "../domain/DailyGoal.ts";

// One current goal per owner; null means "no goal set".
export interface DailyGoalRepository {
  find(ownerId: string): Promise<DailyGoal | null>;
  save(ownerId: string, goal: DailyGoal | null, at: string): Promise<void>;
}
