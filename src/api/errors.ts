import { json } from "./import.ts";
import { DomainError } from "../kernel/errors.ts";
import { InvalidCommandError, NotFoundError, OwnershipViolationError, SyncAlreadyRunningError, SyncUnavailableError } from "../application/errors.ts";

import type { Context } from "hono";

// External status of each domain rule. A DomainError whose code is missing here is a bug (500), never a silent default.
const DOMAIN_STATUS: Record<string, number> = {
  INVALID_DAILY_GOAL: 400,
};

export function mapErrorToResponse(e: unknown): Response | null {
  if (e instanceof DomainError && e.code in DOMAIN_STATUS) return json({ ok: false, code: e.code, error: e.message }, DOMAIN_STATUS[e.code]!);
  if (e instanceof InvalidCommandError) return json({ ok: false, code: e.code, error: e.message }, 400);
  if (e instanceof NotFoundError) return json({ ok: false, code: e.code, error: e.message }, 404);
  if (e instanceof SyncAlreadyRunningError) return json({ ok: false, code: e.code, error: e.message, runId: e.runId }, 409);
  if (e instanceof SyncUnavailableError) return json({ ok: false, code: e.code, error: e.message }, 502);
  if (e instanceof OwnershipViolationError) return json({ ok: false, code: e.code, error: e.message }, 403);
  return null;
}

export function mapError(c: Context<any>, err: unknown): Response {
  const mapped = mapErrorToResponse(err);
  if (mapped) return mapped;
  return c.json({ ok: false, error: "internal error" }, 500);
}
