import type { MatchPort } from "../ports/matchPort.ts";
import { assertMateThreatsInvariants, MATE_THREATS_VERSION, type InvalidReason, type MateThreatsOk } from "../domain/mateThreats.ts";
import { NotFoundError } from "./errors.ts";

// What the collector may send. The version is never part of it: the server stamps the contract version it validated against.
export type MateThreatsBody = ({ status: "ok" } & MateThreatsOk) | { status: "invalid"; reason: InvalidReason };

export async function recordMateThreats(port: MatchPort, matchId: string, body: MateThreatsBody): Promise<void> {
  const target = await port.getThreatTarget(matchId);
  if (!target) throw new NotFoundError(`match ${matchId} has no analysable detail`);
  if (body.status === "invalid") {
    await port.saveMateThreats(matchId, { v: MATE_THREATS_VERSION, status: "invalid", reason: body.reason });
    return;
  }
  const { status: _status, ...ok } = body;
  assertMateThreatsInvariants(ok, target); // throws before anything is written
  await port.saveMateThreats(matchId, { v: MATE_THREATS_VERSION, status: "ok", ...ok });
}
