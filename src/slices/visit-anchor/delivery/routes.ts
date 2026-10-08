import { Hono } from "hono";
import { z } from "zod";
import { InvalidCommandError } from "../../../application/errors.ts";
import type { Container } from "../../../kernel/container.ts";
import { ADVANCE_SEEN_THROUGH, GET_SEEN_THROUGH } from "../module.ts";

type Vars = { Variables: { email: string | null; container: Container } };
const body = z.object({ seenThrough: z.string() });

export const visitAnchorRoutes = new Hono<Vars>();

visitAnchorRoutes.get("/", async (c) => {
  const ownerEmail = c.get("email")!;
  return c.json({ ok: true, seenThrough: await c.get("container").resolve(GET_SEEN_THROUGH).execute({ ownerEmail }) });
});

visitAnchorRoutes.put("/", async (c) => {
  const ownerEmail = c.get("email")!;
  const parsed = body.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw new InvalidCommandError("seenThrough must be a string");
  const seenThrough = await c.get("container").resolve(ADVANCE_SEEN_THROUGH).execute({ ownerEmail, seenThrough: parsed.data.seenThrough });
  return c.json({ ok: true, seenThrough });
});
