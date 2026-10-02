import { json } from "./import.ts";
import { NotFoundError, OwnershipViolationError } from "../application/errors.ts";

import type { Context } from "hono";

export function mapErrorToResponse(e: unknown): Response | null {
  if (e instanceof NotFoundError) return json({ ok: false, code: e.code, error: e.message }, 404);
  if (e instanceof OwnershipViolationError) return json({ ok: false, code: e.code, error: e.message }, 403);
  return null;
}

export function mapError(c: Context<any>, err: unknown): Response {
  const mapped = mapErrorToResponse(err);
  if (mapped) return mapped;
  return c.json({ ok: false, error: "internal error" }, 500);
}
