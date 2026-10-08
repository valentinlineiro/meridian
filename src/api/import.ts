import { sha256Hex, stableStringify } from "../ingestion/hash.ts";
import { extractMatches, collectPages } from "../normalization/matches.ts";
import { normalizeLanguagePayload } from "../normalization/languages.ts";
import { observeSchema } from "../ingestion/schemaObserve.ts";
import { extractObservations } from "../normalization/observations.ts";
import { extractPathTree } from "../normalization/pathTree.ts";
import { applyPathState } from "../db/storePathState.ts";
import { observationStatements } from "../db/storeObservations.ts";
import { insertSnapshot, upsertMatches, recordObservations } from "../db/store.ts";
import {
  insertLanguageSnapshot,
  upsertUserState,
  upsertCourses,
  upsertCourseSections,
  upsertXpSummaries,
} from "../db/storeLanguages.ts";

export type IngestSummary = {
  snapshotId: string;
  deduplicated: boolean;
  pages: number;
  matchesReceived: number;
  newMatches: number;
  existingMatches: number;
  knownOpponentElo: number;
  unknownOpponentElo: number;
  coursesCount?: number;
  sectionsCount?: number;
  xpSummariesCount?: number;
};

export interface IngestArgs {
  source: string;
  userId: string;
  data: any;
  syncId?: string;
  isAuxiliary?: boolean;
  originalCourseId?: string;
  observedCourseId?: string;
  createdAt?: string;
}

// Shared pipeline: legacy POST /api/import and the ingest client use this.
export async function ingestSnapshot(db: D1Database, args: IngestArgs): Promise<IngestSummary> {
  const { source, userId, data } = args;
  if (!source || !userId || data === undefined) throw new Error("ingest requires source, userId, data");
  const checksum = await sha256Hex(source + "|" + userId + "|" + stableStringify(data));
  const dup = await db.prepare("SELECT id, games_count FROM snapshots WHERE checksum=?").bind(checksum).first<{ id: string; games_count: number }>();
  if (dup) return { snapshotId: dup.id, deduplicated: true, pages: 0, matchesReceived: dup.games_count, newMatches: 0, existingMatches: dup.games_count, knownOpponentElo: 0, unknownOpponentElo: 0 };

  const now = args.createdAt ?? new Date().toISOString();
  const id = crypto.randomUUID();
  const rawJson = JSON.stringify(data);

  // The snapshot row carries the UNIQUE checksum that deduplicates retries, so it is written LAST: if anything before it
  // fails, the identical retry is not mistaken for a duplicate and re-applies the (idempotent) derived state.
  if (source === "duolingo-lang") {
    const { userState, courses, sections, xpSummaries } = normalizeLanguagePayload({
      userId,
      data,
      isAuxiliary: args.isAuxiliary,
      originalCourseId: args.originalCourseId,
      observedCourseId: args.observedCourseId,
    });

    await upsertUserState(db, userState, now);
    await upsertCourses(db, courses, now);
    if (sections.length > 0) {
      await upsertCourseSections(db, sections, now);
    }
    if (xpSummaries.length > 0) {
      await upsertXpSummaries(db, xpSummaries, now);
    }
    await recordObservations(db, observeSchema(data), now);
    const path = extractPathTree(data);
    if (path) await applyPathState(db, { userId, snapshotId: id, observedAt: now, ...path }); // K5, idempotent like the writes above

    await insertLanguageSnapshot(db, {
      id,
      createdAt: now,
      source,
      userId,
      rawJson,
      gamesCount: 0,
      pagesCount: 0,
      checksum,
      sizeBytes: new TextEncoder().encode(rawJson).length,
      syncId: args.syncId,
      isAuxiliary: userState.isAuxiliary,
      originalCourseId: userState.originalCourseId,
      observedCourseId: userState.observedCourseId,
    }, observationStatements(db, extractObservations(source, rawJson, { snapshotId: id, userId, observedAt: now, isAuxiliary: userState.isAuxiliary })));

    return {
      snapshotId: id,
      deduplicated: false,
      pages: 0,
      matchesReceived: 0,
      newMatches: 0,
      existingMatches: 0,
      knownOpponentElo: 0,
      unknownOpponentElo: 0,
      coursesCount: courses.length,
      sectionsCount: sections.length,
      xpSummariesCount: xpSummaries.length,
    };
  }

  // Chess snapshot ingestion
  const items = extractMatches(data, userId);
  const pages = collectPages(data).length;
  const { added } = await upsertMatches(db, items, id, now);
  const known = items.filter((i) => i.row.opponent_elo != null).length;
  await recordObservations(db, observeSchema(data), now);
  await insertSnapshot(db, { id, createdAt: now, source, userId, rawJson, gamesCount: items.length, pagesCount: pages, checksum, sizeBytes: new TextEncoder().encode(rawJson).length },
    observationStatements(db, extractObservations(source, rawJson, { snapshotId: id, userId, observedAt: now })));
  return { snapshotId: id, deduplicated: false, pages, matchesReceived: items.length, newMatches: added, existingMatches: items.length - added, knownOpponentElo: known, unknownOpponentElo: items.length - known };
}

export async function handleImport(db: D1Database, body: any): Promise<Response> {
  const source = typeof body?.source === "string" ? body.source : null;
  const userId = body?.userId != null ? String(body.userId) : "";
  const syncId = typeof body?.syncId === "string" ? body.syncId : undefined;
  const isAuxiliary = typeof body?.isAuxiliary === "boolean" ? body.isAuxiliary : undefined;
  const originalCourseId = typeof body?.originalCourseId === "string" ? body.originalCourseId : undefined;
  const observedCourseId = typeof body?.observedCourseId === "string" ? body.observedCourseId : undefined;
  try {
    return json({
      ok: true,
      ...(await ingestSnapshot(db, {
        source: source!,
        userId,
        data: body?.data,
        syncId,
        isAuxiliary,
        originalCourseId,
        observedCourseId,
      })),
    });
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    return json({ ok: false, error: msg }, msg.includes("requires") ? 400 : 500);
  }
}

export const json = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status, headers: { "content-type": "application/json" } });
