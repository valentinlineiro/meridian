import { json } from "./import.ts";
import { resolveProviderUserId } from "../db/users.ts";
import { handleLangStats } from "./stats.ts";

// The collector is a GitHub Actions workflow (collector.yml) in COLLECTOR_REPO ("owner/name"); "Sincronizar" dispatches it.
const CLOCK_SKEW_MS = 10_000; // GitHub stamps created_at with its own clock
const WORKFLOW_PATH = ".github/workflows/collector.yml";
const REPO_RE = /^[A-Za-z0-9][A-Za-z0-9-]*\/(?!\.{1,2}$)[\w.-]+$/;


export async function handleMeStats(db: D1Database, url: URL, email: string | null): Promise<Response> {
  if (!email) return json({ ok: false, error: "unauthorized", code: "UNAUTHORIZED" }, 401);
  const providerUserId = await resolveProviderUserId(db, email, "duolingo");
  if (!providerUserId) return json({ ok: false, error: "no provider account", code: "NO_PROVIDER_ACCOUNT" }, 404);
  const proxied = new URL(url.toString());
  proxied.searchParams.set("userId", providerUserId);
  return handleLangStats(db, proxied);
}

export async function handleMeSync(
  db: D1Database,
  email: string | null,
  fetcher: typeof fetch,
  token: string | null,
  repo: string | null,
): Promise<Response> {
  if (!email) return json({ ok: false, error: "unauthorized", code: "UNAUTHORIZED" }, 401);
  const providerUserId = await resolveProviderUserId(db, email, "duolingo");
  if (!providerUserId) return json({ ok: false, error: "no provider account", code: "NO_PROVIDER_ACCOUNT" }, 404);
  if (!token) return json({ ok: false, error: "GITHUB_ACTIONS_TOKEN not set" }, 500);
  if (!repo || !REPO_RE.test(repo)) return json({ ok: false, error: "COLLECTOR_REPO not set" }, 500);
  const dispatchedAt = new Date().toISOString();
  const res = await fetcher(`https://api.github.com/repos/${repo}/actions/workflows/collector.yml/dispatches`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "Content-Type": "application/json", "User-Agent": "meridian-worker" },
    body: JSON.stringify({ ref: "main", inputs: { provider_user_id: providerUserId } }),
  });
  if (!res.ok) {
    const txt = await (res as any).text?.().catch(() => "") ?? "";
    return json({ ok: false, error: `dispatch failed ${res.status} ${String(txt).slice(0, 120)}` }, 502);
  }
  // Resolve the newly created run — never fall back to an old run.
  let runId: number | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 700));
    const r = await fetcher(`https://api.github.com/repos/${repo}/actions/workflows/collector.yml/runs?event=workflow_dispatch&per_page=5`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "User-Agent": "meridian-worker" },
    });
    if (!r.ok) break;
    const j: any = await r.json().catch(() => null);
    const runs: any[] = j?.workflow_runs ?? [];
    // Only a dispatched run that exists and was created after our dispatch (minus clock skew) can be the one we started.
    // A run without created_at is never a candidate; the list is newest first.
    const since = new Date(Date.parse(dispatchedAt) - CLOCK_SKEW_MS).toISOString();
    const candidate = runs.find((x) => x.event === "workflow_dispatch" && typeof x.created_at === "string" && x.created_at >= since);
    if (candidate?.id) { runId = candidate.id; break; }
  }
  if (!runId) return json({ ok: false, error: "workflow run not found after dispatch", code: "RUN_NOT_FOUND" }, 502);
  return json({ ok: true, providerUserId, dispatchedAt, runId });
}

export async function handleMeSyncStatus(
  db: D1Database,
  email: string | null,
  url: URL,
  fetcher: typeof fetch,
  token: string | null,
  repo: string | null,
): Promise<Response> {
  if (!email) return json({ ok: false, error: "unauthorized", code: "UNAUTHORIZED" }, 401);
  const providerUserId = await resolveProviderUserId(db, email, "duolingo");
  if (!providerUserId) return json({ ok: false, error: "no provider account", code: "NO_PROVIDER_ACCOUNT" }, 404);
  if (!token) return json({ ok: false, error: "GITHUB_ACTIONS_TOKEN not set" }, 500);
  if (!repo || !REPO_RE.test(repo)) return json({ ok: false, error: "COLLECTOR_REPO not set" }, 500);
  const runIdParam = url.searchParams.get("runId");
  if (runIdParam) {
    const id = Number(runIdParam);
    if (!Number.isFinite(id)) return json({ ok: false, error: "invalid runId" }, 400);
    const r = await fetcher(`https://api.github.com/repos/${repo}/actions/runs/${id}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "User-Agent": "meridian-worker" },
    });
    if (!r.ok) {
      const txt = await (r as any).text?.().catch(() => "") ?? "";
      return json({ ok: false, error: `status failed ${r.status} ${String(txt).slice(0, 80)}` }, 502);
    }
    const j: any = await r.json();
    // /actions/runs/:id answers for any run in the repo: only the collector's are ours to report.
    if (String(j?.path ?? "").split("@")[0] !== WORKFLOW_PATH) return json({ ok: false, error: "run does not belong to the collector workflow", code: "RUN_NOT_COLLECTOR" }, 404);
    return json({ status: j.status, conclusion: j.conclusion, runId: j.id, htmlUrl: j.html_url, providerUserId });
  }
  const r = await fetcher(`https://api.github.com/repos/${repo}/actions/workflows/collector.yml/runs?per_page=5`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "User-Agent": "meridian-worker" },
  });
  if (!r.ok) return json({ ok: false, error: "status failed" }, 502);
  const j: any = await r.json();
  const run = (j.workflow_runs ?? []).find((x: any) => x.name === "collector") ?? j.workflow_runs?.[0];
  if (!run) return json({ status: "unknown", conclusion: null, providerUserId });
  return json({ status: run.status, conclusion: run.conclusion, runId: run.id, htmlUrl: run.html_url, providerUserId });
}
