import { json } from "./import.ts";
import { resolveProviderUserId } from "../db/users.ts";
import { handleLangStats } from "./stats.ts";

export async function handleMeStats(db: D1Database, url: URL, email: string | null): Promise<Response> {
  if (!email) return json({ ok: false, error: "unauthorized", code: "UNAUTHORIZED" }, 401);
  const providerUserId = await resolveProviderUserId(db, email, "duolingo");
  if (!providerUserId) return json({ ok: false, error: "no provider account", code: "NO_PROVIDER_ACCOUNT" }, 404);
  const proxied = new URL(url.toString());
  proxied.searchParams.set("userId", providerUserId);
  return handleLangStats(db, proxied);
}
