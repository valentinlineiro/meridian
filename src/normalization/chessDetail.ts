import type { MatchDetailRecord } from "../types.ts";

export function normalizeMatchDetail(input: any): MatchDetailRecord | null {
  if (!input || typeof input !== "object") return null;

  const matchObj = input.match && typeof input.match === "object" ? input.match : null;

  const matchId = String(input.matchId ?? input.match_id ?? matchObj?.id ?? "").trim();
  const userId = String(input.userId ?? input.user_id ?? "").trim();
  if (!matchId) return null;

  const moveHistory = Array.isArray(input.moveHistory)
    ? input.moveHistory.map(String)
    : Array.isArray(input.move_history)
    ? input.move_history.map(String)
    : Array.isArray(matchObj?.moveHistory)
    ? matchObj.moveHistory.map(String)
    : null;

  if (!moveHistory) return null;

  const moveTimestamps = Array.isArray(input.moveTimestamps)
    ? input.moveTimestamps.map(Number).filter(Number.isFinite)
    : Array.isArray(input.move_timestamps)
    ? input.move_timestamps.map(Number).filter(Number.isFinite)
    : Array.isArray(matchObj?.moveTimestamps)
    ? matchObj.moveTimestamps.map(Number).filter(Number.isFinite)
    : [];

  const bToI = (v: unknown): number | null => (typeof v === "boolean" ? (v ? 1 : 0) : v === 1 || v === 0 ? v : null);
  const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? Math.trunc(v) : null);
  const float = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

  const pred = input.predictedEloAfterResult ?? {};

  return {
    match_id: matchId,
    user_id: userId,
    opponent_id: typeof input.opponentId === "string" ? input.opponentId : typeof input.opponent_id === "string" ? input.opponent_id : null,
    is_hard_match: bToI(input.isHardMatch ?? input.is_hard_match),
    is_placement_match: bToI(input.isPlacementMatch ?? input.is_placement_match),
    is_revenge_match: bToI(input.isRevengeMatch ?? input.is_revenge_match),
    predicted_elo_win: num(pred.win ?? input.predicted_elo_win),
    predicted_elo_loss: num(pred.loss ?? input.predicted_elo_loss),
    predicted_elo_draw: num(pred.draw ?? input.predicted_elo_draw),
    elo_after: num(input.eloAfter ?? input.elo_after ?? input.eloRating),
    outcome: typeof input.outcome === "string" ? input.outcome : typeof matchObj?.outcome === "string" ? matchObj.outcome : null,
    end_condition: typeof input.endCondition === "string" ? input.endCondition : typeof input.end_condition === "string" ? input.end_condition : typeof matchObj?.endCondition === "string" ? matchObj.endCondition : null,
    status: typeof input.status === "string" ? input.status : typeof matchObj?.status === "string" ? matchObj.status : "completed",
    move_history: JSON.stringify(moveHistory),
    move_timestamps: JSON.stringify(moveTimestamps),
    final_fen: typeof input.finalFen === "string" ? input.finalFen : typeof input.boardFen === "string" ? input.boardFen : typeof matchObj?.boardFen === "string" ? matchObj.boardFen : null,
    reaction: input.reaction ? JSON.stringify(input.reaction) : null,
    session_duration: float(input.sessionDuration ?? input.session_duration),
  };
}
