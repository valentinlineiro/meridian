// Test composition: the real router with the admin identity established in code (like src/dev.ts).
// Use the real `src/index.ts` worker instead when the test is about the access boundary itself.
import { Hono } from "hono";
import { app, onFailure, onNotFound } from "../../src/api/router.ts";
import type { Env } from "../../src/types.ts";

const admin = new Hono<{ Bindings: Env; Variables: { email: string | null } }>();
admin.use("*", async (c, next) => {
  c.set("email", c.req.header("x-debug-email") ?? "valen@example.com");
  return next();
});
admin.route("/", app);
admin.onError(onFailure);
admin.notFound(onNotFound);

export default { fetch: admin.fetch };
