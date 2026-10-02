import type { TrajectoryPort } from "../ports/trajectoryPort.ts";
import { NotFoundError } from "./errors.ts";
import {
  evaluateTrajectoryPatterns,
  type TrajectoryFinding,
} from "../domain/trajectory.ts";

export interface GetTrajectoryInput {
  userId?: string | null;
}

export interface TrajectoryResult {
  userId: string;
  temporalSpan: {
    startedAt: string | null;
    endedAt: string | null;
    totalDays: number | null;
  };
  findings: TrajectoryFinding[];
}

export async function getTrajectoryUseCase(
  port: TrajectoryPort,
  input: GetTrajectoryInput
): Promise<TrajectoryResult> {
  const userId = await port.resolveUserId(input.userId);
  if (!userId) {
    throw new NotFoundError(
      input.userId
        ? `User '${input.userId}' not found`
        : "No default user identity found"
    );
  }

  const [chessData, languagesData] = await Promise.all([
    port.getChessTrajectoryData(userId),
    port.getLanguagesTrajectoryData(userId),
  ]);

  const findings = evaluateTrajectoryPatterns({
    chess: chessData,
    languages: languagesData,
  });

  // Calculate composite temporal span
  const startCandidates = [chessData.startedAt, languagesData.startedAt].filter(
    (d): d is string => d !== null
  );
  const endCandidates = [chessData.endedAt, languagesData.endedAt].filter(
    (d): d is string => d !== null
  );

  let startedAt: string | null = null;
  let endedAt: string | null = null;
  let totalDays: number | null = null;

  if (startCandidates.length > 0 && endCandidates.length > 0) {
    startCandidates.sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
    endCandidates.sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
    const firstStart = startCandidates[0];
    const lastEnd = endCandidates[endCandidates.length - 1];

    if (firstStart !== undefined && lastEnd !== undefined) {
      startedAt = firstStart;
      endedAt = lastEnd;
      totalDays = Math.max(
        0,
        Math.floor(
          (new Date(lastEnd).getTime() - new Date(firstStart).getTime()) /
            (1000 * 60 * 60 * 24)
        )
      );
    }
  }

  return {
    userId,
    temporalSpan: {
      startedAt,
      endedAt,
      totalDays,
    },
    findings,
  };
}
