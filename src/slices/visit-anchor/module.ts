import { Container, Token } from "../../kernel/container.ts";
import { CLOCK, DB } from "../../composition/tokens.ts";
import { AdvanceSeenThrough } from "./application/AdvanceSeenThrough.ts";
import { GetSeenThrough } from "./application/GetSeenThrough.ts";
import { D1ProviderAccountLookup } from "./infrastructure/D1ProviderAccountLookup.ts";
import { D1SeenThroughRepository } from "./infrastructure/D1SeenThroughRepository.ts";
import type { ProviderAccountLookup } from "./ports/ProviderAccountLookup.ts";
import type { SeenThroughRepository } from "./ports/SeenThroughRepository.ts";

export const VISIT_ANCHOR_ACCOUNTS = new Token<ProviderAccountLookup>("VisitAnchorProviderAccountLookup");
export const SEEN_THROUGH_REPOSITORY = new Token<SeenThroughRepository>("SeenThroughRepository");
export const GET_SEEN_THROUGH = new Token<GetSeenThrough>("GetSeenThrough");
export const ADVANCE_SEEN_THROUGH = new Token<AdvanceSeenThrough>("AdvanceSeenThrough");

export function registerVisitAnchor(c: Container): void {
  c.register(VISIT_ANCHOR_ACCOUNTS, (k) => new D1ProviderAccountLookup(k.resolve(DB), "duolingo"))
    .register(SEEN_THROUGH_REPOSITORY, (k) => new D1SeenThroughRepository(k.resolve(DB)))
    .register(GET_SEEN_THROUGH, (k) => new GetSeenThrough(k.resolve(VISIT_ANCHOR_ACCOUNTS), k.resolve(SEEN_THROUGH_REPOSITORY)))
    .register(ADVANCE_SEEN_THROUGH, (k) => new AdvanceSeenThrough(k.resolve(VISIT_ANCHOR_ACCOUNTS), k.resolve(SEEN_THROUGH_REPOSITORY), k.resolve(CLOCK)));
}
