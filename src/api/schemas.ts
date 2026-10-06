// src/api/schemas.ts
import { z } from "zod";

export const envSchema = z.object({
  DB: z.custom<D1Database>((v) => typeof (v as any)?.prepare === "function"),
  IMPORT_TOKEN: z.string().optional(),
  ADMIN_EMAIL: z.string().optional(),
  ADMIN_PASSWORD_HASH: z.string().optional(),
  SESSION_SECRET: z.string().optional(),
  GITHUB_ACTIONS_TOKEN: z.string().optional(), // dispatches the collector workflow ("Sincronizar")
  COLLECTOR_REPO: z.string().optional(),       // "owner/name" of the repo that holds collector.yml
  COLLECTOR_REF: z.string().optional(),        // branch to dispatch it on (default "main")
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

