import { json } from "./import.ts";
import { mapErrorToResponse } from "./errors.ts";
import { requestSyncUseCase, getSyncStatusUseCase } from "../application/syncUseCases.ts";
import { createGithubActionsTrigger } from "../infrastructure/github/githubActionsTrigger.ts";
import { resolveProviderUserId } from "../db/users.ts";

export interface SyncEnv {
  db: D1Database;
  email: string | null;
  token: string | null;
  target: { repo: string; workflow: string; ref: string } | null; // null = Sync not configured on this deployment
}

function deps(env: SyncEnv) {
  const trigger = createGithubActionsTrigger({ ...(env.target as NonNullable<SyncEnv["target"]>), token: env.token as string });
  return { trigger, accounts: { resolveProviderUserId: (email: string) => resolveProviderUserId(env.db, email, "duolingo") } };
}

function guard(env: SyncEnv): Response | null {
  if (!env.email) return json({ ok: false, error: "unauthorized", code: "UNAUTHORIZED" }, 401);
  if (!env.token) return json({ ok: false, error: "GITHUB_ACTIONS_TOKEN not set" }, 500);
  if (!env.target) return json({ ok: false, error: "sync is not configured", code: "SYNC_NOT_CONFIGURED" }, 503);
  return null;
}

async function respond(run: () => Promise<unknown>): Promise<Response> {
  try {
    return json({ ok: true, ...(await run() as object) });
  } catch (e) {
    return mapErrorToResponse(e) ?? json({ ok: false, error: "internal error" }, 500);
  }
}

export async function handleSyncRequest(env: SyncEnv): Promise<Response> {
  return guard(env) ?? respond(() => requestSyncUseCase(deps(env), { email: env.email as string }));
}

export async function handleSyncStatus(env: SyncEnv, url: URL): Promise<Response> {
  const denied = guard(env);
  if (denied) return denied;
  const runId = Number(url.searchParams.get("runId"));
  if (!Number.isInteger(runId) || runId <= 0) return json({ ok: false, error: "runId required" }, 400);
  return respond(() => getSyncStatusUseCase(deps(env), { email: env.email as string, runId }));
}
