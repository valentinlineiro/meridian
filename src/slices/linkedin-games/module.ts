import { Container, Token } from "../../kernel/container.ts";
import { CLOCK, DB, INGEST_SNAPSHOT } from "../../composition/tokens.ts";
import { GetDay } from "./application/GetDay.ts";
import { RecordGameResult } from "./application/RecordGameResult.ts";
import { D1DayRecordStore } from "./infrastructure/D1DayRecordStore.ts";
import { D1OwnerLookup } from "./infrastructure/D1OwnerLookup.ts";
import type { DayRecordStore } from "./ports/DayRecordStore.ts";
import type { OwnerLookup } from "./ports/OwnerLookup.ts";

export const OWNER_LOOKUP = new Token<OwnerLookup>("LinkedinGamesOwnerLookup");
export const DAY_RECORD_STORE = new Token<DayRecordStore>("DayRecordStore");
export const GET_DAY = new Token<GetDay>("GetDay");
export const RECORD_GAME_RESULT = new Token<RecordGameResult>("RecordGameResult");

export function registerLinkedinGames(c: Container): void {
  c.register(OWNER_LOOKUP, (k) => new D1OwnerLookup(k.resolve(DB)))
    .register(DAY_RECORD_STORE, (k) => new D1DayRecordStore(k.resolve(DB), k.resolve(INGEST_SNAPSHOT)))
    .register(GET_DAY, (k) => new GetDay(k.resolve(OWNER_LOOKUP), k.resolve(DAY_RECORD_STORE)))
    .register(RECORD_GAME_RESULT, (k) => new RecordGameResult(k.resolve(OWNER_LOOKUP), k.resolve(DAY_RECORD_STORE), k.resolve(CLOCK)));
}
