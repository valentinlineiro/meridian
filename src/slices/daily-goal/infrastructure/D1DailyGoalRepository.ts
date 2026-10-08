import { DailyGoal } from "../domain/DailyGoal.ts";
import type { DailyGoalRepository } from "../ports/DailyGoalRepository.ts";

export class D1DailyGoalRepository implements DailyGoalRepository {
  constructor(private readonly db: D1Database) {}

  async find(ownerId: string): Promise<DailyGoal | null> {
    const row = await this.db.prepare("SELECT daily_goal_xp FROM user_settings WHERE user_id = ?").bind(ownerId).first<{ daily_goal_xp: number | null }>();
    return row?.daily_goal_xp == null ? null : DailyGoal.of(row.daily_goal_xp);
  }

  async save(ownerId: string, goal: DailyGoal | null, at: string): Promise<void> {
    await this.db.prepare(`INSERT INTO user_settings (user_id, daily_goal_xp, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET daily_goal_xp = excluded.daily_goal_xp, updated_at = excluded.updated_at
      WHERE user_settings.daily_goal_xp IS NOT excluded.daily_goal_xp`).bind(ownerId, goal?.xp ?? null, at).run();
  }
}
