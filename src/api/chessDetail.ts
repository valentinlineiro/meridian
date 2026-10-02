import { json } from "./import.ts";
import { mapErrorToResponse } from "./errors.ts";
import { normalizeMatchDetail } from "../normalization/chessDetail.ts";
import { matchDetailEnvelope } from "./schemas.ts";
import { createD1MatchAdapter } from "../infrastructure/d1/d1MatchAdapter.ts";
import { recordMatchDetail } from "../application/recordMatchDetail.ts";

export async function handleSaveMatchDetail(db: D1Database, req: Request, matchId: string): Promise<Response> {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "invalid json body" }, 400);
  }

  if (!matchDetailEnvelope.safeParse(body).success) {
    return json({ ok: false, error: "invalid match detail payload" }, 400);
  }

  if (body && !body.matchId && !body.match_id) {
    body.matchId = matchId;
  }

  const record = normalizeMatchDetail(body);
  if (!record) {
    return json({ ok: false, error: "invalid match detail payload" }, 400);
  }

  const matchPort = createD1MatchAdapter(db);
  try {
    const result = await recordMatchDetail(matchPort, record);
    return json({ ok: true, matchId: result.matchId });
  } catch (e) {
    const mapped = mapErrorToResponse(e);
    if (mapped) return mapped;
    throw e;
  }
}

export async function handleGetMatchDetail(db: D1Database, matchId: string): Promise<Response> {
  const matchPort = createD1MatchAdapter(db);
  const record = await matchPort.getMatchDetail(matchId);
  if (!record) {
    return json({ ok: false, error: "match detail not found" }, 404);
  }
  return json(record);
}

export async function handleGetPendingMatchDetails(db: D1Database, req: Request): Promise<Response> {
  const url = new URL(req.url);
  const rawLimit = url.searchParams.get("limit");
  let limit = 50;
  if (rawLimit !== null) {
    const parsed = parseInt(rawLimit, 10);
    if (!isNaN(parsed) && parsed > 0) {
      limit = Math.min(parsed, 100);
    }
  }

  const matchPort = createD1MatchAdapter(db);
  const pending = await matchPort.getPendingMatchIds(limit);

  return json({
    ok: true,
    items: pending.items,
    totalPending: pending.totalPending,
    next: pending.next,
  });
}
