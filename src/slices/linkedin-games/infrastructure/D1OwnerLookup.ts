import { normalizeEmail } from "../../../domain/user.ts";
import type { OwnerLookup } from "../ports/OwnerLookup.ts";

// The Meridian user id (users.id), not a provider account: LinkedIn Games has no provider account of its own.
export class D1OwnerLookup implements OwnerLookup {
  constructor(private readonly db: D1Database) {}

  async resolveOwnerId(email: string): Promise<string | null> {
    const row = await this.db.prepare("SELECT user_id FROM user_identities WHERE provider = 'cloudflare_access' AND subject = ?")
      .bind(normalizeEmail(email)).first<{ user_id: string }>();
    return row?.user_id ?? null;
  }
}
