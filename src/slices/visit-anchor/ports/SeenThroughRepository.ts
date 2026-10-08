import type { SeenThrough } from "../domain/SeenThrough.ts";

// One current value per owner; null means "never marked".
export interface SeenThroughRepository {
  find(ownerId: string): Promise<SeenThrough | null>;
  // Stores `to` only if it is later than what is stored (or nothing is): the value never moves backwards,
  // even when two devices race. The guard lives here because the check-then-write of a use case is not atomic.
  advance(ownerId: string, to: SeenThrough, at: string): Promise<void>;
}
