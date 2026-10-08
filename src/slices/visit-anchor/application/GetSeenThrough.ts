import { NotFoundError } from "../../../application/errors.ts";
import type { ProviderAccountLookup } from "../ports/ProviderAccountLookup.ts";
import type { SeenThroughRepository } from "../ports/SeenThroughRepository.ts";

// Reading never writes: the anchor moves only through AdvanceSeenThrough.
export class GetSeenThrough {
  constructor(private readonly accounts: ProviderAccountLookup, private readonly seen: SeenThroughRepository) {}

  async execute(query: { ownerEmail: string }): Promise<string | null> {
    const ownerId = await this.accounts.resolveProviderUserId(query.ownerEmail);
    if (!ownerId) throw new NotFoundError("no provider account");
    return (await this.seen.find(ownerId))?.iso ?? null;
  }
}
