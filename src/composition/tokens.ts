import { Token } from "../kernel/container.ts";

export const DB = new Token<D1Database>("DB");
export const CLOCK = new Token<() => Date>("Clock");
