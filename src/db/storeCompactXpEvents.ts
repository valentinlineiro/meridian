export const A7_EXTRACTOR_VERSION = 1;
export type CompactXpState = "value" | "invalid" | "absent";

export interface ObservedCourseState {
  state: CompactXpState;
  xp: number | null;
}

export interface CompactXpEvent {
  snapshot_id: string;
  course_id: string;
  user_id: string;
  source: string;
  observed_at: string;
  state: CompactXpState;
  xp: number | null;
  prev_state: CompactXpState | null;
  last_xp: number | null;
  extractor_version: number;
}

interface CourseHistory {
  state: CompactXpState;
  xp: number | null;
  lastXp: number | null;
}

interface SeriesStatus {
  user_id: string;
  source: string;
  head_at: string | null;
  head_id: string | null;
  dirty_at: string | null;
  dirty_id: string | null;
  repair_cursor_at: string | null;
  repair_cursor_id: string | null;
  repair_watermark_at: string | null;
  repair_watermark_id: string | null;
  version: number;
  repair_version: number;
}

interface EventRow {
  snapshot_id: string;
  course_id: string;
  user_id: string;
  source: string;
  observed_at: string;
  state: CompactXpState;
  xp: number | null;
  prev_state: CompactXpState | null;
  last_xp: number | null;
  extractor_version: number;
}

interface SnapshotRow {
  id: string;
  created_at: string;
  raw_json: string;
}

export function extractCompactCourseStates(rawJson: string): Map<string, ObservedCourseState> {
  const data = JSON.parse(rawJson);
  const rawCourses: unknown[] = Array.isArray(data?.courses)
    ? data.courses
    : Array.isArray(data?.user?.courses)
      ? data.user.courses
      : [];
  const states = new Map<string, ObservedCourseState>();
  for (const value of rawCourses) {
    if (typeof value !== "object" || value === null || Array.isArray(value)) continue;
    const course = value as Record<string, unknown>;
    const id = course.id ?? course.courseId;
    if (typeof id !== "string" || states.has(id)) continue;
    const xp = course.xp;
    states.set(id, typeof xp === "number" && Number.isFinite(xp)
      ? { state: "value", xp }
      : { state: "invalid", xp: null });
  }
  return states;
}

function stateForCourse(states: Map<string, ObservedCourseState>, courseId: string): ObservedCourseState {
  return states.get(courseId) ?? { state: "absent", xp: null };
}

function sameState(a: ObservedCourseState, b: ObservedCourseState): boolean {
  return a.state === b.state && (a.state !== "value" || a.xp === b.xp);
}

function historyFromEvent(event: EventRow): CourseHistory {
  return {
    state: event.state,
    xp: event.xp,
    lastXp: event.state === "value" ? event.xp : event.last_xp,
  };
}

function buildEventsForSnapshot(args: {
  snapshotId: string;
  userId: string;
  source: string;
  observedAt: string;
  states: Map<string, ObservedCourseState>;
  history: Map<string, CourseHistory>;
  courseIds: Set<string>;
}): CompactXpEvent[] {
  const { snapshotId, userId, source, observedAt, states, history, courseIds } = args;
  const events: CompactXpEvent[] = [];
  const ids = new Set([...courseIds, ...states.keys()]);
  for (const courseId of [...ids].sort()) {
    const current = stateForCourse(states, courseId);
    const previous = history.get(courseId);
    if (!previous) {
      if (current.state !== "absent") {
        events.push({
          snapshot_id: snapshotId,
          course_id: courseId,
          user_id: userId,
          source,
          observed_at: observedAt,
          state: current.state,
          xp: current.state === "value" ? current.xp : null,
          prev_state: null,
          last_xp: null,
          extractor_version: A7_EXTRACTOR_VERSION,
        });
        history.set(courseId, {
          state: current.state,
          xp: current.xp,
          lastXp: current.state === "value" ? current.xp : null,
        });
      }
      continue;
    }

    if (!sameState(previous, current)) {
      events.push({
        snapshot_id: snapshotId,
        course_id: courseId,
        user_id: userId,
        source,
        observed_at: observedAt,
        state: current.state,
        xp: current.state === "value" ? current.xp : null,
        prev_state: previous.state,
        last_xp: previous.lastXp,
        extractor_version: A7_EXTRACTOR_VERSION,
      });
    }
    history.set(courseId, {
      state: current.state,
      xp: current.xp,
      lastXp: current.state === "value" ? current.xp : previous.lastXp,
    });
  }
  return events;
}

function isAfter(at: string, id: string, headAt: string | null, headId: string | null): boolean {
  if (headAt === null || headId === null) return true;
  return at > headAt || (at === headAt && id > headId);
}

function markDirtyStatement(
  db: D1Database,
  args: { userId: string; source: string; snapshotId: string; observedAt: string },
  extraWhere: string,
  extraBindings: Array<string | number | null>
): D1PreparedStatement {
  const { userId, source, snapshotId, observedAt } = args;
  return db.prepare(
    "UPDATE observation_series_status SET " +
      "dirty_at=CASE WHEN dirty_at IS NULL OR (?,?) < (dirty_at,dirty_id) THEN ? ELSE dirty_at END, " +
      "dirty_id=CASE WHEN dirty_at IS NULL OR (?,?) < (dirty_at,dirty_id) THEN ? ELSE dirty_id END, " +
      "repair_cursor_at=CASE WHEN repair_cursor_at IS NOT NULL AND (?,?) <= (repair_cursor_at,repair_cursor_id) THEN NULL ELSE repair_cursor_at END, " +
      "repair_cursor_id=CASE WHEN repair_cursor_at IS NOT NULL AND (?,?) <= (repair_cursor_at,repair_cursor_id) THEN NULL ELSE repair_cursor_id END, " +
      "repair_version=repair_version + CASE WHEN repair_watermark_at IS NOT NULL AND (?,?) <= (repair_watermark_at,repair_watermark_id) THEN 1 ELSE 0 END, " +
      "version=version+1 " +
      "WHERE user_id=? AND source=? AND head_id=? AND " + extraWhere
  ).bind(
    observedAt, snapshotId, observedAt,
    observedAt, snapshotId, snapshotId,
    observedAt, snapshotId,
    observedAt, snapshotId,
    observedAt, snapshotId,
    userId, source, snapshotId,
    ...extraBindings
  );
}

export async function compactXpIngestStatements(
  db: D1Database,
  args: { snapshotId: string; userId: string; source: string; observedAt: string; rawJson: string }
): Promise<D1PreparedStatement[]> {
  const { snapshotId, userId, source, observedAt, rawJson } = args;
  if (source !== "duolingo-lang") return [];

  const status = await db.prepare(
    "SELECT user_id,source,head_at,head_id,dirty_at,dirty_id,repair_cursor_at,repair_cursor_id,repair_watermark_at,repair_watermark_id,version,repair_version " +
    "FROM observation_series_status WHERE user_id=? AND source=?"
  ).bind(userId, source).first<SeriesStatus>();

  const version = Number(status?.version ?? 0);
  const clean = !status?.dirty_at;
  const inOrder = clean && isAfter(observedAt, snapshotId, status?.head_at ?? null, status?.head_id ?? null);
  const currentStates = extractCompactCourseStates(rawJson);
  const history = new Map<string, CourseHistory>();
  const knownCourseIds = new Set<string>(currentStates.keys());

  if (inOrder) {
    const rows = await db.prepare(
      "SELECT snapshot_id,course_id,user_id,source,observed_at,state,xp,prev_state,last_xp,extractor_version " +
      "FROM course_xp_events WHERE user_id=? AND source=? ORDER BY course_id,observed_at DESC,snapshot_id DESC"
    ).bind(userId, source).all<EventRow>();
    for (const row of rows.results) {
      knownCourseIds.add(row.course_id);
      if (!history.has(row.course_id)) history.set(row.course_id, historyFromEvent(row));
    }
  }

  const expectedEvents = inOrder
    ? buildEventsForSnapshot({ snapshotId, userId, source, observedAt, states: currentStates, history, courseIds: knownCourseIds })
    : [];

  const stmts: D1PreparedStatement[] = [];
  // I0: create an empty status row in the same batch as the snapshot; no prior read is required.
  stmts.push(db.prepare(
    "INSERT INTO observation_series_status (user_id,source,head_at,head_id,dirty_at,dirty_id,repair_cursor_at,repair_cursor_id,repair_watermark_at,repair_watermark_id,version,repair_version) " +
    "VALUES (?,?,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,0,0) ON CONFLICT(user_id,source) DO NOTHING"
  ).bind(userId, source));

  // I2: publish each derived event only if the version and temporal guard still hold in SQL.
  for (const event of expectedEvents) {
    stmts.push(db.prepare(
      "INSERT INTO course_xp_events (snapshot_id,course_id,user_id,source,observed_at,state,xp,prev_state,last_xp,extractor_version) " +
      "SELECT ?,?,?,?,?,?,?,?,?,? WHERE EXISTS (" +
      "SELECT 1 FROM observation_series_status WHERE user_id=? AND source=? AND version=? AND dirty_at IS NULL " +
      "AND (head_at IS NULL OR (?,?) > (head_at,head_id))) ON CONFLICT DO NOTHING"
    ).bind(
      event.snapshot_id, event.course_id, event.user_id, event.source, event.observed_at,
      event.state, event.xp, event.prev_state, event.last_xp, event.extractor_version,
      userId, source, version, observedAt, snapshotId
    ));
  }

  // I3: advance the head under exactly the same SQL guard as I2.
  stmts.push(db.prepare(
    "UPDATE observation_series_status SET head_at=?,head_id=?,version=version+1 " +
    "WHERE user_id=? AND source=? AND version=? AND dirty_at IS NULL " +
    "AND (head_at IS NULL OR (?,?) > (head_at,head_id))"
  ).bind(observedAt, snapshotId, userId, source, version, observedAt, snapshotId));

  if (inOrder) {
    // I3b-1: a conflicting event is not silently accepted after ON CONFLICT DO NOTHING.
    for (const event of expectedEvents) {
      const where = "EXISTS (SELECT 1 FROM course_xp_events WHERE snapshot_id=? AND user_id=? AND source=? AND course_id=? " +
        "AND (state IS NOT ? OR xp IS NOT ? OR prev_state IS NOT ? OR last_xp IS NOT ?))";
      stmts.push(markDirtyStatement(db, { userId, source, snapshotId, observedAt }, where, [
        snapshotId, userId, source, event.course_id, event.state, event.xp, event.prev_state, event.last_xp
      ]));
    }

    // I3b-2: also detects extra rows, including an unexpected event when no event was calculated.
    stmts.push(markDirtyStatement(
      db,
      { userId, source, snapshotId, observedAt },
      "(SELECT COUNT(*) FROM course_xp_events WHERE snapshot_id=? AND user_id=? AND source=?) <> ?",
      [snapshotId, userId, source, expectedEvents.length]
    ));
  }

  // I4: if I2/I3 lost the race or the snapshot is late, retain the snapshot and mark the series dirty.
  stmts.push(db.prepare(
    "UPDATE observation_series_status SET " +
      "dirty_at=CASE WHEN dirty_at IS NULL OR (?,?) < (dirty_at,dirty_id) THEN ? ELSE dirty_at END, " +
      "dirty_id=CASE WHEN dirty_at IS NULL OR (?,?) < (dirty_at,dirty_id) THEN ? ELSE dirty_id END, " +
      "repair_cursor_at=CASE WHEN repair_cursor_at IS NOT NULL AND (?,?) <= (repair_cursor_at,repair_cursor_id) THEN NULL ELSE repair_cursor_at END, " +
      "repair_cursor_id=CASE WHEN repair_cursor_at IS NOT NULL AND (?,?) <= (repair_cursor_at,repair_cursor_id) THEN NULL ELSE repair_cursor_id END, " +
      "repair_version=repair_version + CASE WHEN repair_watermark_at IS NOT NULL AND (?,?) <= (repair_watermark_at,repair_watermark_id) THEN 1 ELSE 0 END, " +
      "version=version+1 WHERE user_id=? AND source=? AND head_id IS NOT ?"
  ).bind(
    observedAt, snapshotId, observedAt,
    observedAt, snapshotId, snapshotId,
    observedAt, snapshotId,
    observedAt, snapshotId,
    observedAt, snapshotId,
    userId, source, snapshotId
  ));

  return stmts;
}

function latestHistoryBefore(dbRows: EventRow[]): Map<string, CourseHistory> {
  const history = new Map<string, CourseHistory>();
  for (const row of dbRows) if (!history.has(row.course_id)) history.set(row.course_id, historyFromEvent(row));
  return history;
}

export interface CompactXpRepairResult {
  status: "clean" | "progress" | "conflict" | "empty";
  snapshotsProcessed: number;
  eventsRebuilt: number;
  watermarkAt: string | null;
  watermarkId: string | null;
  dirtyAt: string | null;
}

export async function repairCompactXpEvents(
  db: D1Database,
  userId: string,
  source = "duolingo-lang",
  chunkSize = 10
): Promise<CompactXpRepairResult> {
  if (!Number.isInteger(chunkSize) || chunkSize < 1 || chunkSize > 25) throw new Error("chunkSize must be 1..25");

  let status = await db.prepare(
    "SELECT user_id,source,head_at,head_id,dirty_at,dirty_id,repair_cursor_at,repair_cursor_id,repair_watermark_at,repair_watermark_id,version,repair_version " +
    "FROM observation_series_status WHERE user_id=? AND source=?"
  ).bind(userId, source).first<SeriesStatus>();
  if (!status?.dirty_at) {
    return { status: "clean", snapshotsProcessed: 0, eventsRebuilt: 0, watermarkAt: status?.head_at ?? null, watermarkId: status?.head_id ?? null, dirtyAt: null };
  }

  if (!status.repair_watermark_at || !status.repair_watermark_id) {
    // Capture the watermark atomically in SQL. A tail arrival before this statement is
    // included; one after it is beyond the watermark and cannot starve repair startup.
    await db.prepare(
      "UPDATE observation_series_status SET " +
      "repair_watermark_at=(SELECT created_at FROM snapshots WHERE user_id=? AND source=? ORDER BY created_at DESC,id DESC LIMIT 1)," +
      "repair_watermark_id=(SELECT id FROM snapshots WHERE user_id=? AND source=? ORDER BY created_at DESC,id DESC LIMIT 1)," +
      "repair_cursor_at=NULL,repair_cursor_id=NULL,repair_version=repair_version+1,version=version+1 " +
      "WHERE user_id=? AND source=? AND dirty_at IS NOT NULL AND repair_watermark_at IS NULL " +
      "AND EXISTS (SELECT 1 FROM snapshots WHERE user_id=? AND source=?)"
    ).bind(userId, source, userId, source, userId, source, userId, source).run();
    status = await db.prepare(
      "SELECT user_id,source,head_at,head_id,dirty_at,dirty_id,repair_cursor_at,repair_cursor_id,repair_watermark_at,repair_watermark_id,version,repair_version " +
      "FROM observation_series_status WHERE user_id=? AND source=?"
    ).bind(userId, source).first<SeriesStatus>();
    if (!status?.repair_watermark_at || !status.repair_watermark_id) {
      return { status: "empty", snapshotsProcessed: 0, eventsRebuilt: 0, watermarkAt: null, watermarkId: null, dirtyAt: status?.dirty_at ?? null };
    }
  }

  const watermarkAt = status.repair_watermark_at;
  const watermarkId = status.repair_watermark_id;
  const startAt = status.repair_cursor_at ?? status.dirty_at;
  const startId = status.repair_cursor_id ?? status.dirty_id;
  if (!startAt || !startId) return { status: "conflict", snapshotsProcessed: 0, eventsRebuilt: 0, watermarkAt, watermarkId, dirtyAt: status.dirty_at };

  const rangeSql = status.repair_cursor_at
    ? "(created_at,id) > (?,?) AND (created_at,id) <= (?,?)"
    : "(created_at,id) >= (?,?) AND (created_at,id) <= (?,?)";
  const eventRangeSql = status.repair_cursor_at
    ? "(observed_at,snapshot_id) > (?,?) AND (observed_at,snapshot_id) <= (?,?)"
    : "(observed_at,snapshot_id) >= (?,?) AND (observed_at,snapshot_id) <= (?,?)";
  const rangeBindings = status.repair_cursor_at
    ? [status.repair_cursor_at, status.repair_cursor_id, watermarkAt, watermarkId]
    : [status.dirty_at, status.dirty_id, watermarkAt, watermarkId];

  const remainingCountRow = await db.prepare(
    "SELECT COUNT(*) AS n FROM snapshots WHERE user_id=? AND source=? AND " + rangeSql
  ).bind(userId, source, ...rangeBindings).first<{ n: number }>();
  const remainingCount = Number(remainingCountRow?.n ?? 0);
  if (remainingCount === 0) {
    return { status: "conflict", snapshotsProcessed: 0, eventsRebuilt: 0, watermarkAt, watermarkId, dirtyAt: status.dirty_at };
  }

  const chunk = await db.prepare(
    "SELECT id,created_at,raw_json FROM snapshots WHERE user_id=? AND source=? AND " + rangeSql +
    " ORDER BY created_at,id LIMIT ?"
  ).bind(userId, source, ...rangeBindings, chunkSize).all<SnapshotRow>();
  if (!chunk.results.length) {
    return { status: "conflict", snapshotsProcessed: 0, eventsRebuilt: 0, watermarkAt, watermarkId, dirtyAt: status.dirty_at };
  }

  const first = chunk.results[0]!;
  const previousRows = await db.prepare(
    "SELECT snapshot_id,course_id,user_id,source,observed_at,state,xp,prev_state,last_xp,extractor_version FROM (" +
      "SELECT snapshot_id,course_id,user_id,source,observed_at,state,xp,prev_state,last_xp,extractor_version," +
      "ROW_NUMBER() OVER (PARTITION BY course_id ORDER BY observed_at DESC,snapshot_id DESC) AS rn " +
      "FROM course_xp_events WHERE user_id=? AND source=? AND (observed_at,snapshot_id) < (?,?)) WHERE rn=1 " +
      "ORDER BY course_id"
  ).bind(userId, source, first.created_at, first.id).all<EventRow>();
  const history = latestHistoryBefore(previousRows.results);
  const courseIds = new Set<string>(history.keys());
  const rebuilt: CompactXpEvent[] = [];
  for (const snapshot of chunk.results) {
    const states = extractCompactCourseStates(snapshot.raw_json);
    for (const id of states.keys()) courseIds.add(id);
    rebuilt.push(...buildEventsForSnapshot({
      snapshotId: snapshot.id,
      userId,
      source,
      observedAt: snapshot.created_at,
      states,
      history,
      courseIds,
    }));
  }

  const cursorAt = status.repair_cursor_at;
  const cursorId = status.repair_cursor_id;
  const repairVersion = Number(status.repair_version);
  const dirtyAt = status.dirty_at;
  const dirtyId = status.dirty_id;
  const guard = "user_id=? AND source=? AND repair_version=? AND dirty_at=? AND dirty_id=? AND repair_watermark_at=? AND repair_watermark_id=? " +
    "AND ((repair_cursor_at IS NULL AND repair_cursor_id IS NULL) OR (repair_cursor_at IS ? AND repair_cursor_id IS ?)) " +
    "AND (SELECT COUNT(*) FROM snapshots WHERE user_id=? AND source=? AND " + rangeSql + ")=?";
  const guardBindings = [
    userId, source, repairVersion, dirtyAt, dirtyId, watermarkAt, watermarkId,
    cursorAt, cursorId, userId, source, ...rangeBindings, remainingCount
  ];

  const stmts: D1PreparedStatement[] = [];
  stmts.push(db.prepare(
    "DELETE FROM course_xp_events WHERE user_id=? AND source=? AND " + eventRangeSql +
    " AND EXISTS (SELECT 1 FROM observation_series_status WHERE " + guard + ")"
  ).bind(userId, source, ...rangeBindings, ...guardBindings));

  for (const event of rebuilt) {
    stmts.push(db.prepare(
      "INSERT INTO course_xp_events (snapshot_id,course_id,user_id,source,observed_at,state,xp,prev_state,last_xp,extractor_version) " +
      "SELECT ?,?,?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM observation_series_status WHERE " + guard + ")"
    ).bind(
      event.snapshot_id, event.course_id, event.user_id, event.source, event.observed_at,
      event.state, event.xp, event.prev_state, event.last_xp, event.extractor_version,
      ...guardBindings
    ));
  }

  const isFinalChunk = chunk.results.length >= remainingCount;
  if (!isFinalChunk) {
    const last = chunk.results[chunk.results.length - 1]!;
    stmts.push(db.prepare(
      "UPDATE observation_series_status SET repair_cursor_at=?,repair_cursor_id=?,repair_version=repair_version+1,version=version+1 " +
      "WHERE " + guard
    ).bind(last.created_at, last.id, ...guardBindings));
  } else {
    stmts.push(db.prepare(
      "UPDATE observation_series_status SET head_at=repair_watermark_at,head_id=repair_watermark_id," +
      "dirty_at=(SELECT created_at FROM snapshots WHERE user_id=? AND source=? AND (created_at,id) > (repair_watermark_at,repair_watermark_id) ORDER BY created_at,id LIMIT 1)," +
      "dirty_id=(SELECT id FROM snapshots WHERE user_id=? AND source=? AND (created_at,id) > (repair_watermark_at,repair_watermark_id) ORDER BY created_at,id LIMIT 1)," +
      "repair_cursor_at=NULL,repair_cursor_id=NULL,repair_watermark_at=NULL,repair_watermark_id=NULL,repair_version=repair_version+1,version=version+1 " +
      "WHERE " + guard
    ).bind(userId, source, userId, source, ...guardBindings));
  }

  const result = await db.batch(stmts);
  const lastResult = result[result.length - 1] as { meta?: { changes?: number } } | undefined;
  const changes = Number(lastResult?.meta?.changes ?? 0);
  if (changes !== 1) {
    return { status: "conflict", snapshotsProcessed: 0, eventsRebuilt: 0, watermarkAt, watermarkId, dirtyAt };
  }
  const next = await db.prepare(
    "SELECT head_at,head_id,dirty_at,dirty_id,repair_watermark_at,repair_watermark_id,repair_cursor_at,repair_cursor_id,repair_version,version " +
    "FROM observation_series_status WHERE user_id=? AND source=?"
  ).bind(userId, source).first<Partial<SeriesStatus>>();
  return {
    status: next?.dirty_at ? "progress" : "clean",
    snapshotsProcessed: chunk.results.length,
    eventsRebuilt: rebuilt.length,
    watermarkAt: next?.repair_watermark_at ?? watermarkAt,
    watermarkId: next?.repair_watermark_id ?? watermarkId,
    dirtyAt: next?.dirty_at ?? null,
  };
}

function eventInsertStatement(db: D1Database, event: CompactXpEvent): D1PreparedStatement {
  return db.prepare(
    "INSERT INTO course_xp_events (snapshot_id,course_id,user_id,source,observed_at,state,xp,prev_state,last_xp,extractor_version) " +
    "VALUES (?,?,?,?,?,?,?,?,?,?)"
  ).bind(
    event.snapshot_id, event.course_id, event.user_id, event.source, event.observed_at,
    event.state, event.xp, event.prev_state, event.last_xp, event.extractor_version
  );
}
