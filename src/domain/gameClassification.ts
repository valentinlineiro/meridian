import { classifyOpeningFamily } from "./openingFamily.ts";
import { classifyMate, type MateType } from "./mateType.ts";

export interface GameClassification { openingFamily: string; mateType: MateType | null }

export const classifyGame = (moves: readonly string[]): GameClassification => ({
  openingFamily: classifyOpeningFamily(moves),
  mateType: classifyMate(moves),
});
