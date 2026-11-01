import type { MatchPort } from "../ports/matchPort.ts";
import { assertEngineEvalInvariants, ENGINE_EVAL_VERSION, type EngineEvalOk, type EngineInvalidReason } from "../domain/engineEval.ts";
import { NotFoundError } from "./errors.ts";

// What the collector may send. The version is never part of it: the server stamps the contract version it validated against.
export type EngineEvalBody = ({ status: "ok" } & EngineEvalOk) | { status: "invalid"; reason: EngineInvalidReason };

export async function recordEngineEval(port: MatchPort, matchId: string, body: EngineEvalBody): Promise<void> {
  const target = await port.getThreatTarget(matchId); // plyCount + owner's colour, the same facts the mate-threat contract checks against
  if (!target) throw new NotFoundError(`match ${matchId} has no analysable detail`);
  if (body.status === "invalid") {
    await port.saveEngineEval(matchId, { v: ENGINE_EVAL_VERSION, status: "invalid", reason: body.reason });
    return;
  }
  const { status: _status, ...ok } = body;
  assertEngineEvalInvariants(ok, target); // throws before anything is written
  await port.saveEngineEval(matchId, { v: ENGINE_EVAL_VERSION, status: "ok", ...ok });
}
