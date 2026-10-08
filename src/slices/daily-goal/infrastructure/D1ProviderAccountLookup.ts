import { normalizeEmail } from "../../../domain/user.ts";
import type { ProviderAccountLookup } from "../ports/ProviderAccountLookup.ts";

export class D1ProviderAccountLookup implements ProviderAccountLookup {
  constructor(private readonly db: D1Database, private readonly provider: string) {}

  async resolveProviderUserId(email: string): Promise<string | null> {
    const row = await this.db.prepare(
      `SELECT upa.provider_user_id
       FROM user_identities ui
       JOIN user_provider_accounts upa ON upa.user_id = ui.user_id
       WHERE ui.provider = 'cloudflare_access' AND ui.subject = ? AND upa.provider = ?`)
      .bind(normalizeEmail(email), this.provider).first<{ provider_user_id: string }>();
    return row?.provider_user_id ?? null;
  }
}
