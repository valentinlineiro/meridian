import { SyncUnavailableError } from "../../application/errors.ts";
import type { CollectorRunStatus, CollectorTriggerPort } from "../../ports/collectorTriggerPort.ts";

const API = "https://api.github.com";
const FIND_ATTEMPTS = 5;
const FIND_DELAY_MS = 1000;
const CLOCK_SKEW_MS = 5000;

export interface GithubActionsTriggerConfig {
  repo: string; // "owner/name" of the repository that hosts the collector workflow
  workflow: string; // workflow file name, e.g. "collector.yml"
  ref: string;
  token: string;
  fetcher?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

export function createGithubActionsTrigger(cfg: GithubActionsTriggerConfig): CollectorTriggerPort {
  const fetcher = cfg.fetcher ?? fetch;
  const sleep = cfg.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const now = cfg.now ?? Date.now;
  const headers = {
    Authorization: `Bearer ${cfg.token}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "meridian-worker", // GitHub rejects requests without one
  };
  const base = `${API}/repos/${cfg.repo}/actions`;

  async function get(url: string): Promise<any> {
    const res = await fetcher(url, { headers });
    if (!res.ok) throw new SyncUnavailableError(`github responded ${res.status}`);
    return res.json();
  }

  return {
    async activeRun() {
      for (const status of ["in_progress", "queued"]) {
        const list = await get(`${base}/workflows/${cfg.workflow}/runs?status=${status}&per_page=1`);
        const run = (list.workflow_runs ?? [])[0];
        if (run) return { runId: run.id };
      }
      return null;
    },
    async start() {
      const since = now() - CLOCK_SKEW_MS;
      const res = await fetcher(`${base}/workflows/${cfg.workflow}/dispatches`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ ref: cfg.ref }),
      });
      if (!res.ok) throw new SyncUnavailableError(`dispatch failed ${res.status}`);
      for (let i = 0; i < FIND_ATTEMPTS; i++) {
        await sleep(FIND_DELAY_MS);
        const list = await get(`${base}/workflows/${cfg.workflow}/runs?event=workflow_dispatch&per_page=5`);
        const run = (list.workflow_runs ?? []).find((r: any) => Date.parse(r.created_at) >= since);
        if (run) return { runId: run.id };
      }
      throw new SyncUnavailableError("workflow run not found after dispatch");
    },
    async status(runId): Promise<CollectorRunStatus> {
      const r = await get(`${base}/runs/${runId}`);
      return { runId: r.id, status: r.status, conclusion: r.conclusion ?? null, htmlUrl: r.html_url ?? null };
    },
  };
}
