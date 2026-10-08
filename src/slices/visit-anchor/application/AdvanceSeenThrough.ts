import { NotFoundError } from "../../../application/errors.ts";
import { SeenThrough } from "../domain/SeenThrough.ts";
import type { ProviderAccountLookup } from "../ports/ProviderAccountLookup.ts";
import type { SeenThroughRepository } from "../ports/SeenThroughRepository.ts";

export class AdvanceSeenThrough {
  constructor(
    private readonly accounts: ProviderAccountLookup,
    private readonly seen: SeenThroughRepository,
    private readonly now: () => Date,
  ) {}

  // Returns the value in force afterwards: the requested one if it advanced, the stored one if it was not later.
  async execute(command: { ownerEmail: string; seenThrough: unknown }): Promise<string> {
    const ownerId = await this.accounts.resolveProviderUserId(command.ownerEmail);
    if (!ownerId) throw new NotFoundError("no provider account");
    const requested = SeenThrough.of(command.seenThrough, this.now());
    const current = await this.seen.find(ownerId);
    if (current && !requested.isAfter(current)) return current.iso;
    await this.seen.advance(ownerId, requested, this.now().toISOString());
    return (await this.seen.find(ownerId))?.iso ?? requested.iso;
  }
}
