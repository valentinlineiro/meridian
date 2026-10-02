// LOCAL DEVELOPMENT ENTRY ONLY (`wrangler dev src/dev.ts`, e2e). wrangler.jsonc `main` stays src/index.ts, so this
// file is never deployed. It establishes the admin identity in code instead of verifying an Access JWT, and
// refuses any host that is not loopback, so even an accidental deploy would not open anything.
import { Hono } from "hono";
import { app, onFailure, onNotFound } from "./api/router.ts";
import type { Env } from "./types.ts";

const dev = new Hono<{ Bindings: Env; Variables: { email: string | null } }>();
dev.use("*", async (c, next) => {
  const host = new URL(c.req.url).hostname;
  if (host !== "localhost" && host !== "127.0.0.1") return c.text("dev entry only serves loopback hosts", 403);
  c.set("email", c.req.header("x-debug-email") ?? c.env.ADMIN_EMAIL ?? "dev@localhost");
  return next();
});
dev.route("/", app);
dev.onError(onFailure);
dev.notFound(onNotFound);

export default { fetch: dev.fetch };
