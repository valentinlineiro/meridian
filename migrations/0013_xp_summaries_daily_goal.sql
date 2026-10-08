-- 0013_xp_summaries_daily_goal.sql
-- P2 K7: dailyGoalXp per day (contract §3, D2). Nullable: NULL = never observed. No backfill here.
ALTER TABLE xp_summaries ADD COLUMN daily_goal_xp INTEGER;
