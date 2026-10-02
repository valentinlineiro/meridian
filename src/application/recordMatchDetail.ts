import type { MatchPort, EnrichedMatchDetailRecord } from "../ports/matchPort.ts";
import type { MatchDetailRecord } from "../types.ts";
import { classifyPhase } from "../analytics/phases.ts";
import { classifyOpening } from "../analytics/openings.ts";
import { NotFoundError, OwnershipViolationError } from "./errors.ts";

export async function recordMatchDetail(
  port: MatchPort,
  record: MatchDetailRecord
): Promise<{ matchId: string }> {
  const matchInfo = await port.getMatchUserAndColor(record.match_id);
  if (!matchInfo) {
    throw new NotFoundError(`match ${record.match_id} not found`);
  }
  if (record.user_id && record.user_id !== matchInfo.userId) {
    throw new OwnershipViolationError(
      `match ${record.match_id} belongs to ${matchInfo.userId}, not ${record.user_id}`
    );
  }
  const ownerId = record.user_id || matchInfo.userId;

  let moves: string[] = [];
  if (typeof record.move_history === "string") {
    try {
      const parsed = JSON.parse(record.move_history);
      if (Array.isArray(parsed)) {
        moves = parsed.map(String);
      }
    } catch {
      moves = [];
    }
  } else if (Array.isArray(record.move_history)) {
    moves = (record.move_history as any[]).map(String);
  }

  const plyCount = moves.length;
  const phaseKey = classifyPhase(plyCount);

  let userColor: string | null = (record.user_color ?? (record as any).userColor ?? null);
  if (!userColor) {
    userColor = matchInfo.userColor ?? null;
  }

  const normColor = userColor?.trim().toLowerCase() ?? null;
  const openingKey = classifyOpening(
    moves,
    normColor === "white" || normColor === "black" ? normColor : null
  ).key;

  const enriched: EnrichedMatchDetailRecord = {
    ...record,
    user_id: ownerId,
    ply_count: plyCount,
    phase_key: phaseKey,
    opening_key: openingKey,
  };

  await port.saveMatchDetail(enriched);

  return { matchId: record.match_id };
}
