import { classifyOpeningFamily } from "./openingFamily.ts";
import { classifyMate, type MateType } from "./mateType.ts";

export interface GameClassification { openingFamily: string; mateType: MateType | null }

// The two answers are independent on purpose: the opening rests on the plies of the matched line, so a corrupt tail keeps a proven family, while a mate needs
// the whole game to replay. Callers that know the recorded ending must also require it to be a checkmate before keeping the mate type.
export const classifyGame = (moves: readonly string[]): GameClassification => ({
  openingFamily: classifyOpeningFamily(moves),
  mateType: classifyMate(moves),
});
