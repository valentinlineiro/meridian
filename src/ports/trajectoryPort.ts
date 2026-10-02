import type {
  ChessTrajectoryInput,
  LanguagesTrajectoryInput,
} from "../domain/trajectory.ts";

export interface TrajectoryPort {
  resolveUserId(explicitUserId?: string | null): Promise<string | null>;
  getChessTrajectoryData(userId: string): Promise<ChessTrajectoryInput>;
  getLanguagesTrajectoryData(userId: string): Promise<LanguagesTrajectoryInput>;
}
