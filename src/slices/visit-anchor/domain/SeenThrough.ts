import { DomainError } from "../../../kernel/errors.ts";

// Tolerance for a client clock slightly ahead of the server's: a legitimate mark must not be refused for it.
export const CLOCK_SKEW_MS = 5 * 60 * 1000;

export class InvalidSeenThrough extends DomainError {
  constructor() {
    super("INVALID_SEEN_THROUGH", "seenThrough must be an ISO-8601 instant that is not in the future");
  }
}

// "The changes up to this instant have been seen". Always normalised to UTC ISO so instants compare as strings.
export class SeenThrough {
  private constructor(readonly iso: string) {}

  static of(value: unknown, now: Date): SeenThrough {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T/.test(value)) throw new InvalidSeenThrough();
    const at = new Date(value);
    if (Number.isNaN(at.getTime()) || at.getTime() > now.getTime() + CLOCK_SKEW_MS) throw new InvalidSeenThrough();
    return new SeenThrough(at.toISOString());
  }

  // Rebuilds a value that was already validated when it was stored.
  static restore(iso: string): SeenThrough {
    return new SeenThrough(iso);
  }

  isAfter(other: SeenThrough): boolean {
    return this.iso > other.iso;
  }
}
