import { json } from "./import.ts";
import { DomainError } from "../kernel/errors.ts";
import { InvalidCommandError, NotFoundError, OwnershipViolationError, SyncAlreadyRunningError, SyncUnavailableError } from "../application/errors.ts";

import type { Context } from "hono";

// External status of each domain rule. A DomainError whose code is missing here is a bug (500), never a silent default.
const DOMAIN_STATUS: Record<string, number> = {
  INVALID_DAILY_GOAL: 400,
  INVALID_SEEN_THROUGH: 400,
  INVALID_GAME_RESULT: 400,
  INVALID_PLAY_DATE: 400,
  ILLEGAL_GAME: 422,
  CORRUPT_GAME: 422,
  INVALID_MATE_THREATS: 422,
  INVALID_ENGINE_EVAL: 422,
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

/** Name and message only (never the request or its data): the response stays opaque, the log says why. */
export function logInternalError(e: unknown): void {
  const name = e instanceof Error ? e.name : typeof e;
  const message = e instanceof Error ? e.message : String(e);
  console.error(JSON.stringify({ event: "internal_error", name, message: message.slice(0, 300) }));
}

const OVERLOADED = /D1 DB is overloaded|Too many resources consumed/i;

/** The opaque answer to an unmapped failure. D1 saying it is overloaded is a "try again shortly" (503 + Retry-After), not a bug (500). Always logged. */
export function internalErrorResponse(e: unknown): Response {
  logInternalError(e);
  if (e instanceof Error && OVERLOADED.test(e.message)) {
    const res = json({ ok: false, error: "temporarily overloaded", code: "D1_OVERLOADED" }, 503);
    res.headers.set("Retry-After", "10"); // D1's window is 10 s
    return res;
  }
  return json({ ok: false, error: "internal error" }, 500);
}

export function mapError(_c: Context<any>, err: unknown): Response {
  return mapErrorToResponse(err) ?? internalErrorResponse(err);
}
