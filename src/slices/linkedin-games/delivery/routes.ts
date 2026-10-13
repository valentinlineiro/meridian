import { Hono } from "hono";
import { z } from "zod";
import { InvalidCommandError } from "../../../application/errors.ts";
import type { Container } from "../../../kernel/container.ts";
import { GET_DAY, RECORD_GAME_RESULT } from "../module.ts";

type Vars = { Variables: { email: string | null; container: Container } };
const body = z.object({
  date: z.string(),
  game: z.string(),
  score: z.string(),
  avg: z.string().nullish(),
  number: z.number().nullish(),
  tz: z.string().max(64).optional(),
});

export const linkedinGamesRoutes = new Hono<Vars>();

linkedinGamesRoutes.get("/", async (c) => {
  const date = c.req.query("date") ?? new Date().toISOString().slice(0, 10);
  const day = await c.get("container").resolve(GET_DAY).execute({ ownerEmail: c.get("email")!, date });
  return c.json({ ok: true, day });
});

linkedinGamesRoutes.put("/", async (c) => {
  const parsed = body.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw new InvalidCommandError("date, game and score are required strings; number must be a number");
  const day = await c.get("container").resolve(RECORD_GAME_RESULT).execute({ ownerEmail: c.get("email")!, ...parsed.data });
  return c.json({ ok: true, day });
});
