import { Hono } from "hono";
import { z } from "zod";
import { InvalidCommandError } from "../../../application/errors.ts";
import type { Container } from "../../../kernel/container.ts";
import { GET_DAILY_GOAL, SET_DAILY_GOAL } from "../module.ts";

type Vars = { Variables: { email: string | null; container: Container } };
const body = z.object({ dailyGoalXp: z.number().nullable() });

export const dailyGoalRoutes = new Hono<Vars>();

dailyGoalRoutes.get("/", async (c) => {
  const ownerEmail = c.get("email")!;
  return c.json({ ok: true, dailyGoalXp: await c.get("container").resolve(GET_DAILY_GOAL).execute({ ownerEmail }) });
});

dailyGoalRoutes.put("/", async (c) => {
  const ownerEmail = c.get("email")!;
  const parsed = body.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw new InvalidCommandError("dailyGoalXp must be a number or null");
  const dailyGoalXp = await c.get("container").resolve(SET_DAILY_GOAL).execute({ ownerEmail, dailyGoalXp: parsed.data.dailyGoalXp });
  return c.json({ ok: true, dailyGoalXp });
});
