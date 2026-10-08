import { Container } from "../kernel/container.ts";
import type { Env } from "../types.ts";
import { registerDailyGoal } from "../slices/daily-goal/module.ts";
import { registerVisitAnchor } from "../slices/visit-anchor/module.ts";
import { CLOCK, DB } from "./tokens.ts";

// The one place that knows every adapter. Lazy: a request only builds what its route resolves.
export function buildContainer(env: Env): Container {
  const c = new Container()
    .register(DB, () => env.DB)
    .register(CLOCK, () => () => new Date());
  registerDailyGoal(c);
  registerVisitAnchor(c);
  return c;
}
