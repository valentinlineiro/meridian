// src/api/schemas.ts
import { z } from "zod";

export const envSchema = z.object({
  DB: z.custom<D1Database>((v) => typeof (v as any)?.prepare === "function"),
  IMPORT_TOKEN: z.string().optional(),
  ADMIN_EMAIL: z.string().optional(),
  ADMIN_PASSWORD_HASH: z.string().optional(),
  SESSION_SECRET: z.string().optional(),
  GITHUB_ACTIONS_TOKEN: z.string().optional(),
  SYNC_REPO: z.string().optional(),
  SYNC_WORKFLOW: z.string().optional(),
  SYNC_REF: z.string().optional(),
});

export const importPayloadSchema = z.object({
  source: z.string().min(1),
  userId: z.union([z.string().min(1), z.number()]),
  data: z.record(z.string(), z.unknown()),
  syncId: z.string().optional(),
  isAuxiliary: z.boolean().optional(),
  originalCourseId: z.string().optional(),
  observedCourseId: z.string().optional(),
});

const count = z.number().int().nonnegative();
const tally = z.tuple([count, count, count]);
// Strict on purpose: the version and any unknown key are rejected, so the collector cannot decide what contract a result was validated against.
export const mateThreatsBody = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("ok"), faced: count, neutralized: count, missed: count, unpunished: count,
    byPhase: z.object({ opening: tally, middlegame: tally, endgame: tally }).strict(),
    missedPlies: z.array(z.number().int()).max(500),
  }).strict(),
  z.object({ status: z.literal("invalid"), reason: z.enum(["illegal_game", "corrupt_game"]) }).strict(),
]);

export const matchDetailEnvelope = z.record(z.string(), z.unknown());

export const whatChangedQuerySchema = z.object({
  since: z.string().datetime().optional(),
  until: z.string().datetime().optional(),
  userId: z.string().min(1).optional(),
}).refine(data => {
  if (data.since && data.until) {
    return new Date(data.since) < new Date(data.until);
  }
  return true;
}, {
  message: "since must be strictly before until",
  path: ["since"],
});

export const trajectoryQuerySchema = z.object({
  userId: z.string().trim().min(1).optional(),
});
export type TrajectoryQuery = z.infer<typeof trajectoryQuerySchema>;

