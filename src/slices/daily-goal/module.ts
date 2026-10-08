import { Container, Token } from "../../kernel/container.ts";
import { CLOCK, DB } from "../../composition/tokens.ts";
import { GetDailyGoal } from "./application/GetDailyGoal.ts";
import { SetDailyGoal } from "./application/SetDailyGoal.ts";
import { D1DailyGoalRepository } from "./infrastructure/D1DailyGoalRepository.ts";
import { D1ProviderAccountLookup } from "./infrastructure/D1ProviderAccountLookup.ts";
import type { DailyGoalRepository } from "./ports/DailyGoalRepository.ts";
import type { ProviderAccountLookup } from "./ports/ProviderAccountLookup.ts";

export const DAILY_GOAL_REPOSITORY = new Token<DailyGoalRepository>("DailyGoalRepository");
export const PROVIDER_ACCOUNT_LOOKUP = new Token<ProviderAccountLookup>("ProviderAccountLookup");
export const GET_DAILY_GOAL = new Token<GetDailyGoal>("GetDailyGoal");
export const SET_DAILY_GOAL = new Token<SetDailyGoal>("SetDailyGoal");

export function registerDailyGoal(c: Container): void {
  c.register(PROVIDER_ACCOUNT_LOOKUP, (k) => new D1ProviderAccountLookup(k.resolve(DB), "duolingo"))
    .register(DAILY_GOAL_REPOSITORY, (k) => new D1DailyGoalRepository(k.resolve(DB)))
    .register(GET_DAILY_GOAL, (k) => new GetDailyGoal(k.resolve(PROVIDER_ACCOUNT_LOOKUP), k.resolve(DAILY_GOAL_REPOSITORY)))
    .register(SET_DAILY_GOAL, (k) => new SetDailyGoal(k.resolve(PROVIDER_ACCOUNT_LOOKUP), k.resolve(DAILY_GOAL_REPOSITORY), k.resolve(CLOCK)));
}
