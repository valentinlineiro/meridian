import { Container } from "../kernel/container.ts";
import type { Env } from "../types.ts";
import { ingestSnapshot } from "../api/import.ts";
import { registerLinkedinGames } from "../slices/linkedin-games/module.ts";
import { registerDailyGoal } from "../slices/daily-goal/module.ts";
import { registerVisitAnchor } from "../slices/visit-anchor/module.ts";
import { CLOCK, DB, INGEST_SNAPSHOT } from "./tokens.ts";

// The one place that knows every adapter. Lazy: a request only builds what its route resolves.
export function buildContainer(env: Env): Container {
  const c = new Container()
    .register(DB, () => env.DB)
    .register(CLOCK, () => () => new Date())
    .register(INGEST_SNAPSHOT, () => (args) => ingestSnapshot(env.DB, args));
  registerDailyGoal(c);
  registerVisitAnchor(c);
  registerLinkedinGames(c);
  return c;
}
