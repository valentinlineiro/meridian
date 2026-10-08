import type { SeenThrough } from "../../../src/slices/visit-anchor/domain/SeenThrough.ts";
import type { ProviderAccountLookup } from "../../../src/slices/visit-anchor/ports/ProviderAccountLookup.ts";
import type { SeenThroughRepository } from "../../../src/slices/visit-anchor/ports/SeenThroughRepository.ts";

// Honours the port's contract: advance() keeps the later of the stored and the given value.
export class InMemorySeenThroughRepository implements SeenThroughRepository {
  readonly values = new Map<string, SeenThrough>();
  writes = 0;
  async find(ownerId: string) { return this.values.get(ownerId) ?? null; }
  async advance(ownerId: string, to: SeenThrough) {
    const current = this.values.get(ownerId);
    if (current && !to.isAfter(current)) return;
    this.values.set(ownerId, to);
    this.writes++;
  }
}

export const providerAccounts = (byEmail: Record<string, string>): ProviderAccountLookup => ({
  resolveProviderUserId: async (email) => byEmail[email] ?? null,
});
