import { Hono } from "hono";
import { z } from "zod";
import { InvalidCommandError } from "../../../application/errors.ts";
import type { Container } from "../../../kernel/container.ts";
import { EXPORT_GAME_RESULTS, GET_DAY, GET_GAMES_CHANGE, GET_SUMMARY, IMPORT_GAME_RESULTS, RECORD_GAME_RESULT } from "../module.ts";

type Vars = { Variables: { email: string | null; container: Container } };
const body = z.object({
  date: z.string(),
  game: z.string(),
  score: z.string(),
  avg: z.string().nullish(),
  number: z.number().nullish(),
  tz: z.string().max(64).optional(),
});

const importBody = z.object({ text: z.string().max(50_000), today: z.string(), apply: z.boolean().optional(), tz: z.string().max(64).optional() });

export const linkedinGamesRoutes = new Hono<Vars>();

linkedinGamesRoutes.get("/", async (c) => {
  const date = c.req.query("date") ?? new Date().toISOString().slice(0, 10);
  const day = await c.get("container").resolve(GET_DAY).execute({ ownerEmail: c.get("email")!, date });
  return c.json({ ok: true, day });
});

linkedinGamesRoutes.get("/summary", async (c) => {
  const today = c.req.query("today") ?? new Date().toISOString().slice(0, 10);
  const summary = await c.get("container").resolve(GET_SUMMARY).execute({ ownerEmail: c.get("email")!, today });
  return c.json({ ok: true, summary });
});

// What changed in each game between two play dates (each one closes its day); without `since`, only the current state of each game.
linkedinGamesRoutes.get("/changes", async (c) => {
  const until = c.req.query("until") ?? new Date().toISOString().slice(0, 10);
  const change = await c.get("container").resolve(GET_GAMES_CHANGE).execute({ ownerEmail: c.get("email")!, since: c.req.query("since") ?? null, until });
  return c.json({ ok: true, change });
});

linkedinGamesRoutes.get("/export.csv", async (c) => {
  const csv = await c.get("container").resolve(EXPORT_GAME_RESULTS).execute({ ownerEmail: c.get("email")! });
  return new Response(csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="linkedin-games.csv"' } });
});

linkedinGamesRoutes.put("/", async (c) => {
  const parsed = body.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw new InvalidCommandError("date, game and score are required strings; number must be a number");
  const day = await c.get("container").resolve(RECORD_GAME_RESULT).execute({ ownerEmail: c.get("email")!, ...parsed.data });
  return c.json({ ok: true, day });
});

// Typed or pasted results (see domain/GamesText). apply=false is a dry run: it answers what would change and writes nothing.
linkedinGamesRoutes.post("/import", async (c) => {
  const parsed = importBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw new InvalidCommandError("text and today are required strings; apply must be a boolean");
  const result = await c.get("container").resolve(IMPORT_GAME_RESULTS).execute({ ownerEmail: c.get("email")!, ...parsed.data, apply: parsed.data.apply === true });
  return c.json({ ok: true, ...result });
});
