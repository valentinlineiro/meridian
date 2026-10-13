import { Token } from "../kernel/container.ts";

export const DB = new Token<D1Database>("DB");
export const CLOCK = new Token<() => Date>("Clock");
// The shared snapshot pipeline (src/api/import.ts), for slices that write snapshots of their own source.
export const INGEST_SNAPSHOT = new Token<(args: { source: string; userId: string; data: unknown }) => Promise<unknown>>("IngestSnapshot");
