import { normalizeEmail } from "../domain/user.ts";
export async function resolveProviderUserId(db: D1Database, email: string, provider: string): Promise<string | null> {
  const norm = normalizeEmail(email);
  const row = await db
    .prepare(
      `SELECT upa.provider_user_id
       FROM user_identities ui
       JOIN user_provider_accounts upa ON upa.user_id = ui.user_id
       WHERE ui.provider = 'cloudflare_access' AND ui.subject = ? AND upa.provider = ?`
    )
    .bind(norm, provider)
    .first<{ provider_user_id: string }>();
  return row?.provider_user_id ?? null;
}
export async function findUserIdByIdentity(db: D1Database, email: string): Promise<string | null> {
  const row = await db
    .prepare("SELECT user_id FROM user_identities WHERE provider = 'cloudflare_access' AND subject = ?")
    .bind(normalizeEmail(email))
    .first<{ user_id: string }>();
  return row?.user_id ?? null;
}
