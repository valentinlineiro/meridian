// src/index.ts
import type { Env } from "./types.ts";
import { app } from "./api/router.ts";

export default {
  async fetch(req: Request, env: Env, ctx?: ExecutionContext): Promise<Response> {
    return app.fetch(req, env, ctx);
  },
};
