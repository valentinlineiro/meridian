import type { D1Database } from "@cloudflare/workers-types";

export async function resolveUserIdWithD1(
  db: D1Database,
  explicitUserId?: string | null
): Promise<string | null> {
  if (explicitUserId) {
    const found = await db
      .prepare(`
        SELECT 1 FROM (
          SELECT id AS user_id FROM users WHERE id = ?
          UNION
          SELECT user_id FROM user_state WHERE user_id = ?
          UNION
          SELECT user_id FROM courses WHERE user_id = ?
          UNION
          SELECT user_id FROM matches WHERE user_id = ?
        ) LIMIT 1
      `)
      .bind(explicitUserId, explicitUserId, explicitUserId, explicitUserId)
      .first<{ 1: number }>()
      .then((r) => r !== null, () => false);

    return found ? explicitUserId : null;
  }
  // Resolve among data owners first (user_state / courses / matches), falling back to users
  const dataOwners = await db
    .prepare(`
      SELECT user_id FROM (
        SELECT user_id FROM user_state
        UNION SELECT user_id FROM courses
        UNION SELECT user_id FROM matches
      ) LIMIT 2
    `)
    .all<{ user_id: string }>()
    .then((r) => r.results ?? [], () => null);

  if (dataOwners === null) return null;
  if (dataOwners.length > 0) return dataOwners.length === 1 ? dataOwners[0]!.user_id : null;

  const userRows = await db
    .prepare("SELECT id AS user_id FROM users LIMIT 2")
    .all<{ user_id: string }>()
    .then((r) => r.results ?? [], () => []);
  return userRows.length === 1 ? userRows[0]!.user_id : null;
}
