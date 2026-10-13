#!/usr/bin/env node

// Read-only production audit for A7 P1. This script only issues fixed SELECT
// statements against the production D1 API. Raw payloads stay in memory and
// are never printed or uploaded as artifacts.
const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const apiToken = process.env.CLOUDFLARE_API_TOKEN;
const databaseId = process.env.D1_DATABASE_ID;
const sourceName = "duolingo-lang";
const pageSize = 10;

for (const [name, value] of Object.entries({ accountId, apiToken, databaseId })) {
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
}

const endpoint = `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`;
let totalRowsRead = 0;
let totalRowsWritten = 0;
let totalSqlDurationMs = 0;

async function select(sql, params = []) {
  if (!/^SELECT\\b/i.test(sql.trim())) throw new Error("Production audit permits SELECT only");
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ sql, params: params.map(String) }),
  });
  const payload = await response.json();
  if (!response.ok || payload.success !== true) {
    throw new Error(`Read-only D1 query failed (HTTP ${response.status}); details intentionally omitted`);
  }
  const result = payload.result?.[0];
  if (!result?.success) throw new Error("D1 query did not succeed; details intentionally omitted");
  totalRowsRead += Number(result.meta?.rows_read ?? 0);
  totalRowsWritten += Number(result.meta?.rows_written ?? 0);
  totalSqlDurationMs += Number(result.meta?.duration ?? 0);
  return result.results ?? [];
}

function observedStates(snapshot) {
  let payload;
  try { payload = JSON.parse(snapshot.raw_json); }
  catch { throw new Error("Production raw_json contains invalid JSON; payload omitted"); }
  const states = new Map();
  const courses = Array.isArray(payload?.courses) ? payload.courses : [];
  for (const entry of courses) {
    const id = entry?.id ?? entry?.courseId;
    if (typeof id !== "string" || states.has(id)) continue;
    const xp = entry?.xp;
    states.set(id, typeof xp === "number" && Number.isFinite(xp)
      ? { state: "value", xp }
      : { state: "invalid", xp: null });
  }
  return states;
}

function sameState(a, b) {
  return a.state === b.state && (a.state !== "value" || a.xp === b.xp);
}

function stateAt(states, courseId) {
  return states.get(courseId) ?? { state: "absent", xp: null };
}

function deriveEvents(snapshots, courseIds) {
  const history = new Map();
  const events = [];
  for (const snapshot of snapshots) {
    const states = observedStates(snapshot);
    for (const courseId of courseIds) {
      const current = stateAt(states, courseId);
      const previous = history.get(courseId);
      if (!previous) {
        if (current.state !== "absent") {
          events.push({
            snapshot_id: snapshot.id,
            observed_at: snapshot.created_at,
            course_id: courseId,
            state: current.state,
            xp: current.state === "value" ? current.xp : null,
            prev_state: null,
            last_xp: null,
          });
          history.set(courseId, {
            state: current.state,
            xp: current.state === "value" ? current.xp : null,
            last_xp: current.state === "value" ? current.xp : null,
          });
        }
        continue;
      }
      if (!sameState(previous, current)) {
        events.push({
          snapshot_id: snapshot.id,
          observed_at: snapshot.created_at,
          course_id: courseId,
          state: current.state,
          xp: current.state === "value" ? current.xp : null,
          prev_state: previous.state,
          last_xp: previous.last_xp,
        });
      }
      history.set(courseId, {
        state: current.state,
        xp: current.state === "value" ? current.xp : null,
        last_xp: current.state === "value" ? current.xp : previous.last_xp,
      });
    }
  }
  return events;
}

function reconstructAndCompare(snapshots, courseIds, events) {
  const eventsBySnapshot = new Map();
  for (const event of events) {
    const key = String(event.snapshot_id);
    if (!eventsBySnapshot.has(key)) eventsBySnapshot.set(key, []);
    eventsBySnapshot.get(key).push(event);
  }
  const current = new Map();
  let compared = 0;
  let mismatches = 0;
  for (const snapshot of snapshots) {
    for (const event of eventsBySnapshot.get(String(snapshot.id)) ?? []) {
      current.set(event.course_id, { state: event.state, xp: event.xp });
    }
    const observed = observedStates(snapshot);
    for (const courseId of courseIds) {
      const actual = current.get(courseId) ?? { state: "absent", xp: null };
      const expected = stateAt(observed, courseId);
      compared++;
      if (!sameState(actual, expected)) mismatches++;
    }
  }
  return { compared, mismatches };
}

function compareTransitions(snapshots, courseIds, events) {
  const previous = new Map();
  const expected = [];
  for (const snapshot of snapshots) {
    const states = observedStates(snapshot);
    for (const courseId of courseIds) {
      const current = stateAt(states, courseId);
      const p = previous.get(courseId);
      if (!p) {
        if (current.state !== "absent") {
          expected.push([String(snapshot.id), courseId, current.state, current.xp, null, null]);
          previous.set(courseId, { ...current, last_xp: current.state === "value" ? current.xp : null });
        }
        continue;
      }
      if (!sameState(p, current)) {
        expected.push([
          String(snapshot.id), courseId, current.state,
          current.state === "value" ? current.xp : null,
          p.state, p.last_xp,
        ]);
      }
      previous.set(courseId, {
        ...current,
        xp: current.state === "value" ? current.xp : null,
        last_xp: current.state === "value" ? current.xp : p.last_xp,
      });
    }
  }
  const actual = events.map(e => [
    String(e.snapshot_id), e.course_id, e.state, e.xp, e.prev_state, e.last_xp,
  ]);
  const sort = rows => rows.map(row => JSON.stringify(row)).sort();
  const a = sort(actual), b = sort(expected);
  let mismatches = 0;
  if (a.length !== b.length) mismatches += Math.abs(a.length - b.length);
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) mismatches++;
  return { expectedTransitions: expected.length, eventTransitions: events.length, mismatches };
}

const summary = await select(
  "SELECT COUNT(*) AS n, COUNT(DISTINCT user_id) AS users, MIN(created_at) AS first_at, MAX(created_at) AS last_at FROM snapshots WHERE source = ?",
  [sourceName],
);
const expectedCount = Number(summary[0]?.n ?? 0);
if (!expectedCount) throw new Error("No production snapshots found for the expected source");
const snapshots = [];
for (let offset = 0; offset < expectedCount; offset += pageSize) {
  const rows = await select(
    "SELECT id, user_id, source, created_at, raw_json FROM snapshots WHERE source = ? ORDER BY created_at, id LIMIT ? OFFSET ?",
    [sourceName, pageSize, offset],
  );
  snapshots.push(...rows);
}
if (snapshots.length !== expectedCount) throw new Error("Production snapshot pagination was incomplete");

const groups = new Map();
for (const snapshot of snapshots) {
  const key = `${snapshot.user_id}\\u0000${snapshot.source}`;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(snapshot);
}

let courseCount = 0;
let cellsCompared = 0;
let reconstructionMismatches = 0;
let expectedEventCount = 0;
let transitionMismatches = 0;
let transitionCount = 0;
let descendingTransitions = 0;

for (const group of groups.values()) {
  group.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)) || String(a.id).localeCompare(String(b.id)));
  const courseIds = new Set();
  for (const snapshot of group) for (const id of observedStates(snapshot).keys()) courseIds.add(id);
  const ids = [...courseIds].sort();
  courseCount = Math.max(courseCount, ids.length);
  const events = deriveEvents(group, ids);
  const reconstruction = reconstructAndCompare(group, ids, events);
  const transitions = compareTransitions(group, ids, events);
  cellsCompared += reconstruction.compared;
  reconstructionMismatches += reconstruction.mismatches;
  expectedEventCount += events.length;
  transitionMismatches += transitions.mismatches;
  transitionCount += transitions.eventTransitions;
  descendingTransitions += events.filter(e => e.state === "value" && e.last_xp !== null && e.xp < e.last_xp).length;
}

const report = {
  source: sourceName,
  snapshots: snapshots.length,
  users: groups.size,
  coursesPerUserMax: courseCount,
  cellsCompared,
  reconstructionMismatches,
  derivedEvents: expectedEventCount,
  transitionCount,
  transitionMismatches,
  descendingTransitions,
  firstObservedAt: summary[0]?.first_at ?? null,
  lastObservedAt: summary[0]?.last_at ?? null,
  productionRowsRead: totalRowsRead,
  productionRowsWritten: totalRowsWritten,
  productionSqlDurationMs: Math.round(totalSqlDurationMs * 1000) / 1000,
  rawPayloadsLoggedOrArtifacted: false,
  pass: reconstructionMismatches === 0 && transitionMismatches === 0 && totalRowsWritten === 0,
};
console.log(JSON.stringify(report, null, 2));
if (!report.pass) process.exitCode = 1;
