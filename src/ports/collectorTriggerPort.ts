export interface CollectorRunStatus {
  runId: number;
  status: string;
  conclusion: string | null;
  htmlUrl: string | null;
}

// Asks the (private) collector to run now and reports how that run is going.
export interface CollectorTriggerPort {
  activeRun(): Promise<{ runId: number } | null>; // a queued or in-progress run, whatever started it
  start(): Promise<{ runId: number }>;
  status(runId: number): Promise<CollectorRunStatus>;
}

// Resolves the source account that belongs to the signed-in owner.
export interface ProviderAccountPort {
  resolveProviderUserId(email: string): Promise<string | null>;
}
