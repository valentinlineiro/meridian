import { NotFoundError, SyncAlreadyRunningError } from "./errors.ts";
import type { CollectorRunStatus, CollectorTriggerPort, ProviderAccountPort } from "../ports/collectorTriggerPort.ts";

export interface SyncDeps {
  accounts: ProviderAccountPort;
  trigger: CollectorTriggerPort;
}

async function requireProviderUserId(accounts: ProviderAccountPort, email: string): Promise<string> {
  const id = await accounts.resolveProviderUserId(email);
  if (!id) throw new NotFoundError("no provider account");
  return id;
}

export async function requestSyncUseCase(deps: SyncDeps, input: { email: string }): Promise<{ providerUserId: string; runId: number }> {
  const providerUserId = await requireProviderUserId(deps.accounts, input.email);
  // The collector switches the account's active course while it runs: never let two runs overlap.
  const active = await deps.trigger.activeRun();
  if (active) throw new SyncAlreadyRunningError(active.runId);
  const { runId } = await deps.trigger.start();
  return { providerUserId, runId };
}

export async function getSyncStatusUseCase(
  deps: SyncDeps,
  input: { email: string; runId: number },
): Promise<CollectorRunStatus & { providerUserId: string }> {
  const providerUserId = await requireProviderUserId(deps.accounts, input.email);
  return { ...(await deps.trigger.status(input.runId)), providerUserId };
}
