import { compactXpIngestStatements, repairCompactXpEvents } from "../implementation/src/db/storeCompactXpEvents.ts";

const COURSE_COUNT = 16;
const BENCH_ROWS = 850;
const TARGET_BYTES = 72_000;

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

async function runBatch(db, statements) {
  if (statements.length) await db.batch(statements);
}

async function ensureRuntimeSchema(db) {
  await runBatch(db, [
    db.prepare("CREATE TABLE IF NOT EXISTS runtime_snapshots (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, source TEXT NOT NULL, created_at TEXT NOT NULL, raw_json TEXT NOT NULL, checksum TEXT UNIQUE)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_runtime_snapshots_user_source_created ON runtime_snapshots(user_id,source,created_at,id)"),
    db.prepare("CREATE TABLE IF NOT EXISTS runtime_observation_series_status (user_id TEXT NOT NULL, source TEXT NOT NULL, head_at TEXT, head_id TEXT, dirty_at TEXT, dirty_id TEXT, repair_cursor_at TEXT, repair_cursor_id TEXT, repair_watermark_at TEXT, repair_watermark_id TEXT, version INTEGER NOT NULL DEFAULT 0, repair_version INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(user_id,source)) WITHOUT ROWID"),
    db.prepare("CREATE TABLE IF NOT EXISTS runtime_course_xp_events (snapshot_id TEXT NOT NULL REFERENCES runtime_snapshots(id), course_id TEXT NOT NULL, user_id TEXT NOT NULL, source TEXT NOT NULL, observed_at TEXT NOT NULL, state TEXT NOT NULL CHECK(state IN ('value','invalid','absent')), xp REAL, prev_state TEXT, last_xp REAL, extractor_version INTEGER NOT NULL, CHECK((state='value' AND xp IS NOT NULL) OR (state<>'value' AND xp IS NULL)), PRIMARY KEY(snapshot_id,course_id)) WITHOUT ROWID"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_runtime_course_xp_events_latest ON runtime_course_xp_events(user_id,source,course_id,observed_at DESC,snapshot_id DESC)"),
  ]);
}

async function runtimeIngest(db, snapshot) {
  const statements = await compactXpIngestStatements(runtimeDb, {
    snapshotId: snapshot.id, userId: snapshot.user_id, source: snapshot.source,
    observedAt: snapshot.created_at, rawJson: snapshot.raw_json,
  });
  await db.batch([
    db.prepare("INSERT INTO snapshots(id,user_id,source,created_at,raw_json,checksum) VALUES(?,?,?,?,?,?)")
      .bind(snapshot.id,snapshot.user_id,snapshot.source,snapshot.created_at,snapshot.raw_json,snapshot.checksum ?? null),
    ...statements,
  ]);
}

function runtimeDbAdapter(db) {
  const rewrite = (sql) => sql
    .replace(/\bobservation_series_status\b/g, "runtime_observation_series_status")
    .replace(/\bcourse_xp_events\b/g, "runtime_course_xp_events")
    .replace(/\bsnapshots\b/g, "runtime_snapshots");
  return {
    prepare(sql) { return db.prepare(rewrite(sql)); },
    batch(statements) { return db.batch(statements); },
  };
}

async function runtimeScenario(db) {
  const runtimeDb = runtimeDbAdapter(db);
  await ensureRuntimeSchema(runtimeDb);
  await runtimeDb.batch([
    runtimeDb.prepare("DELETE FROM course_xp_events"),
    runtimeDb.prepare("DELETE FROM observation_series_status"),
    runtimeDb.prepare("DELETE FROM snapshots"),
  ]);
  const source = "duolingo-lang";
  const orderedUser = "runtime-ordered";
  const t1 = "2026-10-01T00:00:00.000Z";
  const t2 = "2026-10-01T00:01:00.000Z";
  const t3 = "2026-10-01T00:02:00.000Z";
  const t4 = "2026-10-01T00:03:00.000Z";
  const make = (id,user,at,xp,totalXp) => ({
    id, user_id:user, source, created_at:at, checksum:id,
    raw_json:JSON.stringify({ user:{ totalXp }, courses:[{ id:"A", xp }, { id:"B", xp:5 }] }),
  });
  await runtimeIngest(runtimeDb, make("ordered-1",orderedUser,t1,100,100));
  await runtimeIngest(runtimeDb, make("ordered-3",orderedUser,t3,90,102));
  await runtimeIngest(runtimeDb, make("ordered-2",orderedUser,t2,95,101));
  const beforeRepair = await runtimeDb.prepare(
    "SELECT head_at,head_id,dirty_at,dirty_id FROM observation_series_status WHERE user_id=? AND source=?"
  ).bind(orderedUser,source).first();
  const firstChunk = await repairCompactXpEvents(runtimeDb,orderedUser,source,1);
  await runtimeIngest(runtimeDb, make("ordered-4",orderedUser,t4,80,103));
  let repairCalls = 1;
  let repairResult = firstChunk;
  while (repairResult.status === "progress" && repairCalls < 8) {
    repairResult = await repairCompactXpEvents(runtimeDb,orderedUser,source,10);
    repairCalls++;
  }
  const orderedStatus = await runtimeDb.prepare(
    "SELECT head_at,head_id,dirty_at,repair_watermark_at FROM observation_series_status WHERE user_id=? AND source=?"
  ).bind(orderedUser,source).first();
  const orderedEvents = await runtimeDb.prepare(
    "SELECT observed_at,state,xp,prev_state,last_xp FROM course_xp_events WHERE user_id=? AND source=? AND course_id='A' ORDER BY observed_at"
  ).bind(orderedUser,source).all();
  const expectedOrdered = [
    [t1,"value",100,null,null], [t2,"value",95,"value",100],
    [t3,"value",90,"value",95], [t4,"value",80,"value",90],
  ];
  const actualOrdered = orderedEvents.results.map(e => [e.observed_at,e.state,e.xp,e.prev_state,e.last_xp]);
  const orderedParity = JSON.stringify(actualOrdered) === JSON.stringify(expectedOrdered);

  const raceUser = "runtime-race";
  const raceRows = Array.from({length:20},(_,i) => {
    const at = new Date(Date.UTC(2026,9,2,0,0,i)).toISOString();
    return {
      id:"race-" + String(i).padStart(2,"0"), user_id:raceUser, source, created_at:at,
      checksum:"race-" + String(i).padStart(2,"0"),
      raw_json:JSON.stringify({ user:{ totalXp:200+i }, courses:[{ id:"A", xp:200+i }] }),
      expectedXp:200+i,
    };
  });
  await Promise.all(raceRows.map(async snapshot => {
    const statements = await compactXpIngestStatements(runtimeDb, {
      snapshotId:snapshot.id, userId:snapshot.user_id, source:snapshot.source,
      observedAt:snapshot.created_at, rawJson:snapshot.raw_json,
    });
    await new Promise(resolve => setTimeout(resolve,25));
    await runtimeDb.batch([
      runtimeDb.prepare("INSERT INTO snapshots(id,user_id,source,created_at,raw_json,checksum) VALUES(?,?,?,?,?,?)")
        .bind(snapshot.id,snapshot.user_id,snapshot.source,snapshot.created_at,snapshot.raw_json,snapshot.checksum),
      ...statements,
    ]);
  }));
  const raceAfterIngest = await runtimeDb.prepare(
    "SELECT head_at,head_id,dirty_at,dirty_id FROM observation_series_status WHERE user_id=? AND source=?"
  ).bind(raceUser,source).first();
  const raceSnapshotCount = Number((await runtimeDb.prepare(
    "SELECT COUNT(*) AS n FROM snapshots WHERE user_id=? AND source=?"
  ).bind(raceUser,source).first()).n);
  let raceRepairCalls = 0;
  let raceStatus = raceAfterIngest;
  while (raceStatus?.dirty_at && raceRepairCalls < 8) {
    const repaired = await repairCompactXpEvents(runtimeDb,raceUser,source,10);
    if (repaired.status === "conflict") break;
    raceRepairCalls++;
    raceStatus = await runtimeDb.prepare(
      "SELECT head_at,head_id,dirty_at,dirty_id FROM observation_series_status WHERE user_id=? AND source=?"
    ).bind(raceUser,source).first();
  }
  const raceEvents = await runtimeDb.prepare(
    "SELECT snapshot_id,observed_at,state,xp,prev_state,last_xp FROM course_xp_events WHERE user_id=? AND source=? AND course_id='A' ORDER BY observed_at"
  ).bind(raceUser,source).all();
  const expectedRace = raceRows.map((row,i) => [
    row.id,row.created_at,"value",row.expectedXp,i===0?null:"value",i===0?null:row.expectedXp-1,
  ]);
  const actualRace = raceEvents.results.map(e => [e.snapshot_id,e.observed_at,e.state,e.xp,e.prev_state,e.last_xp]);
  const raceParity = JSON.stringify(actualRace) === JSON.stringify(expectedRace);
  const raceStatusFinal = await runtimeDb.prepare(
    "SELECT head_at,head_id,dirty_at,repair_watermark_at FROM observation_series_status WHERE user_id=? AND source=?"
  ).bind(raceUser,source).first();

  const conflictUser = "runtime-conflict";
  await runtimeIngest(runtimeDb, make("conflict-1",conflictUser,t1,100,100));
  const conflictTarget = make("conflict-2",conflictUser,t2,90,101);
  await runtimeDb.prepare("INSERT INTO snapshots(id,user_id,source,created_at,raw_json,checksum) VALUES(?,?,?,?,?,?)")
    .bind(conflictTarget.id,conflictTarget.user_id,conflictTarget.source,conflictTarget.created_at,conflictTarget.raw_json,conflictTarget.checksum).run();
  const conflictStatements = await compactXpIngestStatements(runtimeDb, {
    snapshotId:conflictTarget.id, userId:conflictTarget.user_id, source:conflictTarget.source,
    observedAt:conflictTarget.created_at, rawJson:conflictTarget.raw_json,
  });
  // Simulate a concurrent writer leaving a conflicting event while advancing head.
  await runtimeDb.batch([
    runtimeDb.prepare("INSERT INTO course_xp_events(snapshot_id,course_id,user_id,source,observed_at,state,xp,prev_state,last_xp,extractor_version) VALUES(?,?,?,?,?,?,?,?,?,1)")
      .bind(conflictTarget.id,"A",conflictUser,source,t2,"value",89,"value",100),
    runtimeDb.prepare("UPDATE observation_series_status SET head_at=?,head_id=?,version=version+1 WHERE user_id=? AND source=? AND head_id=?")
      .bind(t2,conflictTarget.id,conflictUser,source,"conflict-1"),
  ]);
  await runtimeDb.batch(conflictStatements);
  const conflictStatus = await runtimeDb.prepare(
    "SELECT head_at,head_id,dirty_at FROM observation_series_status WHERE user_id=? AND source=?"
  ).bind(conflictUser,source).first();
  let conflictRepairCalls = 0;
  let conflictRepair = { status: "progress" };
  while (conflictRepair.status === "progress" && conflictRepairCalls < 5) {
    conflictRepair = await repairCompactXpEvents(runtimeDb,conflictUser,source,10);
    conflictRepairCalls++;
  }
  const conflictEvents = await runtimeDb.prepare(
    "SELECT observed_at,xp,prev_state,last_xp FROM course_xp_events WHERE user_id=? AND source=? AND course_id='A' ORDER BY observed_at"
  ).bind(conflictUser,source).all();
  const conflictParity = JSON.stringify(conflictEvents.results.map(e => [e.observed_at,e.xp,e.prev_state,e.last_xp])) ===
    JSON.stringify([[t1,100,null,null],[t2,90,"value",100]]);
  const conflictFinal = await runtimeDb.prepare(
    "SELECT head_at,dirty_at FROM observation_series_status WHERE user_id=? AND source=?"
  ).bind(conflictUser,source).first();

  const extraUser = "runtime-extra";
  await runtimeIngest(runtimeDb, make("extra-1",extraUser,t1,100,100));
  const extraTarget = make("extra-2",extraUser,t2,100,101);
  await runtimeDb.prepare("INSERT INTO snapshots(id,user_id,source,created_at,raw_json,checksum) VALUES(?,?,?,?,?,?)")
    .bind(extraTarget.id,extraTarget.user_id,extraTarget.source,extraTarget.created_at,extraTarget.raw_json,extraTarget.checksum).run();
  const extraStatements = await compactXpIngestStatements(runtimeDb, {
    snapshotId:extraTarget.id, userId:extraTarget.user_id, source:extraTarget.source,
    observedAt:extraTarget.created_at, rawJson:extraTarget.raw_json,
  });
  await runtimeDb.prepare("INSERT INTO course_xp_events(snapshot_id,course_id,user_id,source,observed_at,state,xp,prev_state,last_xp,extractor_version) VALUES(?,?,?,?,?,?,?,?,?,1)")
    .bind(extraTarget.id,"A",extraUser,source,t2,"value",100,"value",100).run();
  await runtimeDb.batch(extraStatements);
  const extraStatus = await runtimeDb.prepare(
    "SELECT head_at,head_id,dirty_at FROM observation_series_status WHERE user_id=? AND source=?"
  ).bind(extraUser,source).first();
  let extraRepairCalls = 0;
  let extraRepair = { status: "progress" };
  while (extraRepair.status === "progress" && extraRepairCalls < 5) {
    extraRepair = await repairCompactXpEvents(runtimeDb,extraUser,source,10);
    extraRepairCalls++;
  }
  const extraEvents = await runtimeDb.prepare(
    "SELECT COUNT(*) AS n FROM course_xp_events WHERE user_id=? AND source=? AND course_id='A'"
  ).bind(extraUser,source).first();
  const extraFinal = await runtimeDb.prepare(
    "SELECT head_at,dirty_at FROM observation_series_status WHERE user_id=? AND source=?"
  ).bind(extraUser,source).first();

  return {
    ordered: {
      initialHeadDidNotRewind: beforeRepair?.head_at === t3,
      lateSnapshotMarkedDirty: beforeRepair?.dirty_at === t2,
      firstRepairStatus: firstChunk.status,
      repairCalls,
      eventCount: orderedEvents.results.length,
      parity: orderedParity,
      finalHeadIsLatest: orderedStatus?.head_at === t4,
      dirtyCleared: orderedStatus?.dirty_at === null,
      pass: beforeRepair?.head_at === t3 && beforeRepair?.dirty_at === t2 && firstChunk.status === "progress" &&
        orderedParity && orderedStatus?.head_at === t4 && orderedStatus?.dirty_at === null && orderedStatus?.repair_watermark_at === null,
    },
    concurrent: {
      concurrentIngests: raceRows.length,
      snapshotsPreserved: raceSnapshotCount === raceRows.length,
      initiallyMarkedDirty: Boolean(raceAfterIngest?.dirty_at),
      repairCalls: raceRepairCalls,
      eventCount: raceEvents.results.length,
      parity: raceParity,
      finalHeadIsLatest: raceStatusFinal?.head_at === raceRows[raceRows.length-1]?.created_at,
      dirtyCleared: raceStatusFinal?.dirty_at === null,
      pass: raceSnapshotCount === raceRows.length && raceParity && raceStatusFinal?.head_at === raceRows[raceRows.length-1]?.created_at && raceStatusFinal?.dirty_at === null,
    },
    b1Conflict: {
      markedDirty: Boolean(conflictStatus?.dirty_at),
      repairedParity: conflictParity,
      finalHead: conflictFinal?.head_at === t2,
      dirtyCleared: conflictFinal?.dirty_at === null,
      pass: Boolean(conflictStatus?.dirty_at) && conflictParity && conflictFinal?.head_at === t2 && conflictFinal?.dirty_at === null,
    },
    b1ExtraWithoutExpectedEvents: {
      markedDirty: Boolean(extraStatus?.dirty_at),
      eventCountAfterRepair: Number(extraEvents.n),
      finalHead: extraFinal?.head_at === t2,
      dirtyCleared: extraFinal?.dirty_at === null,
      pass: Boolean(extraStatus?.dirty_at) && Number(extraEvents.n) === 1 && extraFinal?.head_at === t2 && extraFinal?.dirty_at === null,
    },
    pass: orderedParity && orderedStatus?.head_at === t4 && orderedStatus?.dirty_at === null &&
      raceSnapshotCount === raceRows.length && raceParity && raceStatusFinal?.head_at === raceRows[raceRows.length-1]?.created_at && raceStatusFinal?.dirty_at === null &&
      Boolean(conflictStatus?.dirty_at) && conflictParity && conflictFinal?.head_at === t2 && conflictFinal?.dirty_at === null &&
      Boolean(extraStatus?.dirty_at) && Number(extraEvents.n) === 1 && extraFinal?.head_at === t2 && extraFinal?.dirty_at === null,
  };
}

async function ensureSchema(db) {
  await runBatch(db, [
    db.prepare("CREATE TABLE IF NOT EXISTS snapshots (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, source TEXT NOT NULL, observed_at TEXT NOT NULL, raw_json TEXT NOT NULL)"),
    db.prepare("CREATE INDEX IF NOT EXISTS snapshots_series_order ON snapshots(user_id, source, observed_at, id)"),
    db.prepare("CREATE TABLE IF NOT EXISTS series_status (user_id TEXT NOT NULL, source TEXT NOT NULL, head_at TEXT, head_id INTEGER, dirty_at TEXT, version INTEGER NOT NULL DEFAULT 0, repair_watermark_at TEXT, repair_watermark_id INTEGER, repair_cursor_at TEXT, repair_cursor_id INTEGER, repair_version INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(user_id, source))"),
    db.prepare("CREATE TABLE IF NOT EXISTS events (snapshot_id INTEGER NOT NULL, user_id TEXT NOT NULL, source TEXT NOT NULL, course_id TEXT NOT NULL, observed_at TEXT NOT NULL, state TEXT NOT NULL, xp REAL, prev_state TEXT, last_xp REAL, PRIMARY KEY(snapshot_id, course_id))"),
    db.prepare("CREATE TABLE IF NOT EXISTS atomic_probe (id INTEGER PRIMARY KEY, value TEXT NOT NULL)"),
  ]);
}

function payloadFor(i, filler = false) {
  const courses = Array.from({ length: COURSE_COUNT }, (_, c) => ({
    id: `C${c}`,
    xp: 1000 + c * 100 + (c === 0 ? i : 0),
  }));
  const obj = { courses };
  if (filler) {
    obj.padding = "x".repeat(Math.max(0, TARGET_BYTES - JSON.stringify(obj).length - 20));
  }
  return JSON.stringify(obj);
}

async function seedBench(db) {
  const check = await db.prepare("SELECT COUNT(*) AS n FROM snapshots WHERE user_id='bench' AND source='bench'").first();
  if (Number(check?.n ?? 0) === BENCH_ROWS) return { seeded: false, rows: BENCH_ROWS };
  const del = await db.prepare("DELETE FROM snapshots WHERE user_id='bench' AND source='bench'").run();
  const batchSize = 5;
  for (let start = 0; start < BENCH_ROWS; start += batchSize) {
    const stmts = [];
    for (let i = start; i < Math.min(BENCH_ROWS, start + batchSize); i++) {
      const at = new Date(Date.UTC(2026, 8, 1, 0, 0, i * 30)).toISOString();
      stmts.push(db.prepare("INSERT INTO snapshots(user_id, source, observed_at, raw_json) VALUES('bench','bench',?,?)").bind(at, payloadFor(i, true)));
    }
    await db.batch(stmts);
  }
  return { seeded: true, rows: BENCH_ROWS, approxPayloadBytesEach: TARGET_BYTES };
}

async function seedP1(db) {
  const count = await db.prepare("SELECT COUNT(*) AS n FROM snapshots WHERE user_id='p1' AND source='fixture'").first();
  if (Number(count?.n ?? 0) === 120) return { seeded: false, snapshots: 120 };
  await db.prepare("DELETE FROM events WHERE user_id='p1' AND source='fixture'").run();
  await db.prepare("DELETE FROM snapshots WHERE user_id='p1' AND source='fixture'").run();
  const stmts = [];
  for (let i = 0; i < 120; i++) {
    const courses = Array.from({ length: COURSE_COUNT }, (_, c) => ({
      id: `C${c}`,
      xp: 1000 + c * 100 + (c === 0 ? i : 0),
    }));
    const at = new Date(Date.UTC(2026, 8, 1, 0, i, 0)).toISOString();
    stmts.push(db.prepare("INSERT INTO snapshots(user_id, source, observed_at, raw_json) VALUES('p1','fixture',?,?)").bind(at, JSON.stringify({ courses })));
    if (stmts.length === 10) { await db.batch(stmts.splice(0)); }
  }
  if (stmts.length) await db.batch(stmts);
  const snaps = await db.prepare("SELECT id, observed_at, raw_json FROM snapshots WHERE user_id='p1' AND source='fixture' ORDER BY observed_at, id").all();
  const events = [];
  const last = new Map();
  for (const snap of snaps.results) {
    const data = JSON.parse(snap.raw_json);
    for (const course of data.courses) {
      const prev = last.get(course.id);
      if (!prev || prev.xp !== course.xp) {
        events.push(db.prepare("INSERT INTO events(snapshot_id,user_id,source,course_id,observed_at,state,xp,prev_state,last_xp) VALUES(?,?,?,?,?,'value',? ,?,?)")
          .bind(snap.id, 'p1', 'fixture', course.id, snap.observed_at, course.xp, prev ? 'value' : null, prev ? prev.xp : null));
      }
      last.set(course.id, { xp: course.xp });
    }
  }
  for (let i = 0; i < events.length; i += 50) await db.batch(events.slice(i, i + 50));
  return { seeded: true, snapshots: snaps.results.length, events: events.length };
}

async function semantics(db) {
  await db.prepare("DELETE FROM atomic_probe").run();
  let batchRejected = false;
  try {
    await db.batch([
      db.prepare("INSERT INTO atomic_probe(id,value) VALUES(1,'first')"),
      db.prepare("INSERT INTO atomic_probe(id,value) VALUES(2,NULL)"),
    ]);
  } catch {
    batchRejected = true;
  }
  const atomicCount = Number((await db.prepare("SELECT COUNT(*) AS n FROM atomic_probe").first()).n);
  await db.prepare("DELETE FROM series_status WHERE user_id='tuple-probe'").run();
  await db.prepare("INSERT INTO series_status(user_id,source,head_at,head_id,version) VALUES('tuple-probe','probe','2026-10-13T10:00:00.000Z',10,0)").run();
  const cases = [];
  for (const [label, at, id, expected] of [
    ["later timestamp", "2026-10-13T10:00:01.000Z", 1, 1],
    ["same timestamp larger id", "2026-10-13T10:00:00.000Z", 11, 1],
    ["same timestamp smaller id", "2026-10-13T10:00:00.000Z", 9, 0],
    ["earlier timestamp larger id", "2026-10-13T09:59:59.999Z", 99, 0],
  ]) {
    const row = await db.prepare("SELECT ((?, ?) > (head_at, head_id)) AS newer FROM series_status WHERE user_id='tuple-probe' AND source='probe'").bind(at, id).first();
    cases.push({ label, expected: Boolean(expected), actual: Boolean(row?.newer), pass: Boolean(row?.newer) === Boolean(expected) });
  }
  return {
    batchRejected,
    atomicityRollbackPass: batchRejected && atomicCount === 0,
    atomicCountAfterFailure: atomicCount,
    tupleCases: cases,
    tuplePass: cases.every(c => c.pass),
    note: "Tests real D1 behavior through a disposable database; does not prove the complete proposed A7 batch because the repository has no A7 runtime implementation yet.",
  };
}

async function measure(db, windowSize) {
  let cursorAt = "0000-01-01T00:00:00.000Z";
  let cursorId = 0;
  let rows = 0;
  let rowsRead = 0;
  let rowsWritten = 0;
  let sqlDurationMs = 0;
  let parsedBytes = 0;
  const started = performance.now();
  while (rows < windowSize) {
    const limit = Math.min(10, windowSize - rows);
    const result = await db.prepare("SELECT id, observed_at, raw_json FROM snapshots WHERE user_id='bench' AND source='bench' AND (observed_at, id) > (?, ?) ORDER BY observed_at, id LIMIT ?").bind(cursorAt, cursorId, limit).all();
    const meta = result.meta ?? {};
    rowsRead += Number(meta.rows_read ?? 0);
    rowsWritten += Number(meta.rows_written ?? 0);
    sqlDurationMs += Number(meta.duration ?? 0);
    if (!result.results.length) break;
    for (const row of result.results) {
      JSON.parse(row.raw_json);
      parsedBytes += row.raw_json.length;
      cursorAt = row.observed_at;
      cursorId = row.id;
      rows++;
    }
  }
  return {
    requestedSnapshots: windowSize,
    snapshotsRead: rows,
    payloadBytesParsed: parsedBytes,
    wallMs: Math.round((performance.now() - started) * 100) / 100,
    reportedSqlDurationMs: Math.round(sqlDurationMs * 1000) / 1000,
    rowsRead,
    rowsWritten,
    chunkSize: 10,
    caveat: "One run in a disposable D1; repeat runs and production-like contention are needed before selecting K.",
  };
}

async function auditP1(db) {
  const snaps = await db.prepare("SELECT id, observed_at, raw_json FROM snapshots WHERE user_id='p1' AND source='fixture' ORDER BY observed_at, id").all();
  const actual = await db.prepare("SELECT snapshot_id, course_id, observed_at, state, xp, prev_state, last_xp FROM events WHERE user_id='p1' AND source='fixture' ORDER BY observed_at, snapshot_id, course_id").all();
  function expectedEvents(snapshotRows) {
    const prev = new Map();
    const out = [];
    for (const snap of snapshotRows) {
      for (const course of JSON.parse(snap.raw_json).courses) {
        const p = prev.get(course.id);
        if (!p || p.xp !== course.xp) {
          out.push({ snapshot_id: snap.id, course_id: course.id, observed_at: snap.observed_at, state: "value", xp: course.xp, prev_state: p ? "value" : null, last_xp: p ? p.xp : null });
        }
        prev.set(course.id, { xp: course.xp });
      }
    }
    return out;
  }
  const expected = expectedEvents(snaps.results);
  const canonical = rows => rows.map(r => [r.snapshot_id, r.course_id, r.observed_at, r.state, r.xp, r.prev_state, r.last_xp]).sort((a,b) => a[2].localeCompare(b[2]) || a[0]-b[0] || a[1].localeCompare(b[1]));
  const cleanPass = JSON.stringify(canonical(actual.results)) === JSON.stringify(canonical(expected));
  const target = expected.find(e => e.course_id === "C0" && JSON.parse(snaps.results.find(s => s.id === e.snapshot_id).raw_json).courses[0].xp > 1050);
  const orderedC0 = expected.filter(e => e.course_id === "C0");
  const idx = orderedC0.findIndex(e => e.snapshot_id === target.snapshot_id);
  const next = orderedC0[idx + 1];
  await db.prepare("UPDATE events SET xp=xp+999 WHERE user_id='p1' AND source='fixture' AND snapshot_id=? AND course_id='C0'").bind(target.snapshot_id).run();
  await db.prepare("UPDATE events SET last_xp=last_xp+999 WHERE user_id='p1' AND source='fixture' AND snapshot_id=? AND course_id='C0'").bind(next.snapshot_id).run();
  const corrupted = await db.prepare("SELECT snapshot_id, course_id, observed_at, state, xp, prev_state, last_xp FROM events WHERE user_id='p1' AND source='fixture' ORDER BY observed_at, snapshot_id, course_id").all();
  const corruptionDetected = JSON.stringify(canonical(corrupted.results)) !== JSON.stringify(canonical(expected));
  return {
    snapshots: snaps.results.length,
    expectedEvents: expected.length,
    cleanSeriesParityPass: cleanPass,
    coordinatedXpLastXpCorruptionInjected: true,
    fullRawJsonParityDetectsCorruption: corruptionDetected,
    pass: cleanPass && corruptionDetected,
    caveat: "This exercises the P1 parity algorithm on synthetic D1 fixtures, not on the private production history.",
  };
}

async function measureChunk(db, chunkSize) {
  const samples = [];
  for (let i = 0; i < 5; i++) {
    const started = performance.now();
    const result = await db.prepare("SELECT id, observed_at, raw_json FROM snapshots WHERE user_id='bench' AND source='bench' ORDER BY observed_at, id LIMIT ?").bind(chunkSize).all();
    let parsedBytes = 0;
    for (const row of result.results) {
      JSON.parse(row.raw_json);
      parsedBytes += row.raw_json.length;
    }
    samples.push({
      wallMs: Math.round((performance.now() - started) * 100) / 100,
      reportedSqlDurationMs: Math.round(Number(result.meta?.duration ?? 0) * 1000) / 1000,
      rowsRead: Number(result.meta?.rows_read ?? 0),
      rowsWritten: Number(result.meta?.rows_written ?? 0),
      payloadBytesParsed: parsedBytes,
      snapshotsRead: result.results.length,
    });
  }
  const median = key => {
    const sorted = samples.map(s => s[key]).sort((a,b) => a-b);
    return sorted[Math.floor(sorted.length / 2)];
  };
  return {
    requestedChunk: chunkSize,
    repetitions: samples.length,
    snapshotsRead: median("snapshotsRead"),
    payloadBytesParsed: median("payloadBytesParsed"),
    wallMs: median("wallMs"),
    maxWallMs: Math.max(...samples.map(s => s.wallMs)),
    reportedSqlDurationMs: median("reportedSqlDurationMs"),
    rowsRead: median("rowsRead"),
    rowsWritten: median("rowsWritten"),
    samples,
    note: "Five single-query + parse samples on disposable D1; median reported, maximum wall time retained.",
  };
}

async function livenessD1(db) {
  await db.prepare("DELETE FROM events WHERE user_id='race' AND source='probe'").run();
  await db.prepare("DELETE FROM snapshots WHERE user_id='race' AND source='probe'").run();
  await db.prepare("DELETE FROM series_status WHERE user_id='race' AND source='probe'").run();
  await db.prepare("INSERT INTO series_status(user_id,source,head_at,head_id,dirty_at,version) VALUES('race','probe',NULL,NULL,NULL,0)").run();

  const initialInserts = [];
  for (let i = 0; i < 20; i++) {
    const at = new Date(Date.UTC(2026, 9, 1, 0, 0, i)).toISOString();
    initialInserts.push(db.prepare("INSERT INTO snapshots(user_id,source,observed_at,raw_json) VALUES('race','probe',?,?)").bind(at, payloadFor(i, false)));
  }
  await db.batch(initialInserts);
  const initial = await db.prepare("SELECT id, observed_at, raw_json FROM snapshots WHERE user_id='race' AND source='probe' ORDER BY observed_at,id").all();
  const staleReads = await Promise.all(initial.results.map(() => db.prepare("SELECT version,head_at,head_id,dirty_at FROM series_status WHERE user_id='race' AND source='probe'").first()));
  const versionsRead = [...new Set(staleReads.map(x => Number(x.version)))];

  await Promise.all(initial.results.map(async (snap, i) => {
    const v = Number(staleReads[i].version);
    const xp = JSON.parse(snap.raw_json).courses[0].xp;
    const insert = db.prepare("INSERT INTO events(snapshot_id,user_id,source,course_id,observed_at,state,xp,prev_state,last_xp) SELECT ?, 'race','probe','C0',?,'value',?,NULL,NULL WHERE EXISTS (SELECT 1 FROM series_status WHERE user_id='race' AND source='probe' AND version=? AND dirty_at IS NULL AND (head_at IS NULL OR (?,?) > (head_at,head_id))) ON CONFLICT DO NOTHING").bind(snap.id, snap.observed_at, xp, v, snap.observed_at, snap.id);
    const advance = db.prepare("UPDATE series_status SET head_at=?,head_id=?,version=version+1 WHERE user_id='race' AND source='probe' AND version=? AND dirty_at IS NULL AND (head_at IS NULL OR (?,?) > (head_at,head_id))").bind(snap.observed_at, snap.id, v, snap.observed_at, snap.id);
    const mark = db.prepare("UPDATE series_status SET dirty_at=CASE WHEN dirty_at IS NULL OR dirty_at > ? THEN ? ELSE dirty_at END,version=version+1 WHERE user_id='race' AND source='probe' AND head_id IS NOT ?").bind(snap.observed_at, snap.observed_at, snap.id);
    await db.batch([insert, advance, mark]);
  }));

  const afterRace = await db.prepare("SELECT head_at,head_id,dirty_at,version,repair_version FROM series_status WHERE user_id='race' AND source='probe'").first();
  const raceEvents = Number((await db.prepare("SELECT COUNT(*) AS n FROM events WHERE user_id='race' AND source='probe'").first()).n);
  const snapshotsAfterRace = Number((await db.prepare("SELECT COUNT(*) AS n FROM snapshots WHERE user_id='race' AND source='probe'").first()).n);
  const watermark = initial.results[initial.results.length - 1];

  // Start the repair and capture its independent repair_version. General version
  // changes on every write; repair_version changes only when the repaired prefix
  // is invalidated or repair progress/publication changes.
  await db.prepare("UPDATE series_status SET repair_watermark_at=?,repair_watermark_id=?,repair_cursor_at=NULL,repair_cursor_id=NULL,repair_version=repair_version+1,version=version+1 WHERE user_id='race' AND source='probe' AND dirty_at IS NOT NULL").bind(watermark.observed_at, watermark.id).run();
  const repairStart = await db.prepare("SELECT head_at,head_id,dirty_at,version,repair_watermark_at,repair_watermark_id,repair_version FROM series_status WHERE user_id='race' AND source='probe'").first();
  const versionBeforeTail = Number(repairStart.version);
  const repairVersionBeforeTail = Number(repairStart.repair_version);

  // New in-order snapshots arrive after the watermark and after the repair read.
  // They increment the general version, but must not invalidate this prefix epoch.
  const tailInserts = [];
  for (let i = 20; i < 25; i++) {
    const at = new Date(Date.UTC(2026, 9, 1, 0, 0, i)).toISOString();
    tailInserts.push(db.prepare("INSERT INTO snapshots(user_id,source,observed_at,raw_json) VALUES('race','probe',?,?)").bind(at, payloadFor(i, false)));
    tailInserts.push(db.prepare("UPDATE series_status SET dirty_at=CASE WHEN dirty_at IS NULL OR dirty_at > ? THEN ? ELSE dirty_at END,version=version+1 WHERE user_id='race' AND source='probe'").bind(at, at));
  }
  await db.batch(tailInserts);

  const oldGuard = await db.prepare("UPDATE series_status SET head_at=?,head_id=?,dirty_at=NULL,version=version+1 WHERE user_id='race' AND source='probe' AND version=?").bind(watermark.observed_at, watermark.id, versionBeforeTail).run();
  const oldGuardRejected = Number(oldGuard.meta?.changes ?? 0) === 0;
  const afterOldGuard = await db.prepare("SELECT head_at,head_id,dirty_at,version,repair_watermark_at,repair_watermark_id,repair_version FROM series_status WHERE user_id='race' AND source='probe'").first();
  const tailDidNotInvalidateRepairEpoch = Number(afterOldGuard.repair_version) === repairVersionBeforeTail && Number(afterOldGuard.version) > versionBeforeTail;

  const all = await db.prepare("SELECT id,observed_at,raw_json FROM snapshots WHERE user_id='race' AND source='probe' ORDER BY observed_at,id").all();
  function expectedFor(snapshotRows) {
    const previous = new Map();
    const expected = [];
    for (const snap of snapshotRows) {
      for (const course of JSON.parse(snap.raw_json).courses) {
        const p = previous.get(course.id);
        if (!p || p.xp !== course.xp) {
          expected.push({ snapshot_id: snap.id, course_id: course.id, observed_at: snap.observed_at, state: "value", xp: course.xp, prev_state: p ? "value" : null, last_xp: p ? p.xp : null });
        }
        previous.set(course.id, { xp: course.xp });
      }
    }
    return expected;
  }
  const canonical = rows => rows.map(r => [r.snapshot_id,r.course_id,r.observed_at,r.state,r.xp,r.prev_state,r.last_xp]).sort((a,b) => a[2].localeCompare(b[2]) || a[0]-b[0] || a[1].localeCompare(b[1]));
  const prefix = all.results.filter(s => s.observed_at < watermark.observed_at || (s.observed_at === watermark.observed_at && s.id <= watermark.id));
  const tail = all.results.filter(s => s.observed_at > watermark.observed_at || (s.observed_at === watermark.observed_at && s.id > watermark.id));
  const current = await db.prepare("SELECT head_at,head_id,dirty_at,version,repair_watermark_at,repair_watermark_id,repair_version FROM series_status WHERE user_id='race' AND source='probe'").first();
  const prefixExpected = expectedFor(prefix);
  const prefixGuard = "user_id='race' AND source='probe' AND repair_version=? AND dirty_at IS NOT NULL AND repair_watermark_at=? AND repair_watermark_id=? AND (SELECT COUNT(*) FROM snapshots WHERE user_id='race' AND source='probe' AND (observed_at,id) <= (?,?))=?";
  const prefixInsert = prefixExpected.map(e => db.prepare("INSERT INTO events(snapshot_id,user_id,source,course_id,observed_at,state,xp,prev_state,last_xp) SELECT ?, 'race','probe',?,?, ?,?,?,? WHERE EXISTS (SELECT 1 FROM series_status WHERE " + prefixGuard + ") ON CONFLICT DO NOTHING").bind(e.snapshot_id,e.course_id,e.observed_at,e.state,e.xp,e.prev_state,e.last_xp,repairVersionBeforeTail,watermark.observed_at,watermark.id,watermark.observed_at,watermark.id,prefix.length));
  const prefixBatch = [
    db.prepare("DELETE FROM events WHERE user_id='race' AND source='probe' AND (observed_at,snapshot_id) <= (?,?) AND EXISTS (SELECT 1 FROM series_status WHERE " + prefixGuard + ")").bind(watermark.observed_at,watermark.id,repairVersionBeforeTail,watermark.observed_at,watermark.id,watermark.observed_at,watermark.id,prefix.length),
    ...prefixInsert,
    db.prepare("UPDATE series_status SET head_at=?,head_id=?,dirty_at=?,repair_watermark_at=NULL,repair_watermark_id=NULL,repair_cursor_at=NULL,repair_cursor_id=NULL,repair_version=repair_version+1,version=version+1 WHERE user_id='race' AND source='probe' AND repair_version=? AND dirty_at IS NOT NULL AND repair_watermark_at=? AND repair_watermark_id=? AND (?,?) >= (head_at,head_id) AND (SELECT COUNT(*) FROM snapshots WHERE user_id='race' AND source='probe' AND (observed_at,id) <= (?,?))=?").bind(watermark.observed_at,watermark.id,tail[0]?.observed_at ?? null,repairVersionBeforeTail,watermark.observed_at,watermark.id,watermark.observed_at,watermark.id,watermark.observed_at,watermark.id,prefix.length),
  ];
  await db.batch(prefixBatch);
  const afterPrefix = await db.prepare("SELECT head_at,head_id,dirty_at,version,repair_watermark_at,repair_watermark_id,repair_version FROM series_status WHERE user_id='race' AND source='probe'").first();
  const prefixPublished = afterPrefix.head_id === watermark.id && afterPrefix.dirty_at === tail[0]?.observed_at && afterPrefix.repair_watermark_at === null;
  const prefixCount = Number((await db.prepare("SELECT COUNT(*) AS n FROM events WHERE user_id='race' AND source='probe'").first()).n);

  const latest = all.results[all.results.length-1];
  await db.prepare("UPDATE series_status SET repair_watermark_at=?,repair_watermark_id=?,repair_cursor_at=NULL,repair_cursor_id=NULL,repair_version=repair_version+1,version=version+1 WHERE user_id='race' AND source='probe' AND dirty_at=?").bind(latest.observed_at,latest.id,tail[0]?.observed_at).run();
  const tailRepair = await db.prepare("SELECT dirty_at,version,repair_watermark_at,repair_watermark_id,repair_version FROM series_status WHERE user_id='race' AND source='probe'").first();
  const fullExpected = expectedFor(all.results);
  const tailExpected = fullExpected.filter(e => e.observed_at > watermark.observed_at || (e.observed_at === watermark.observed_at && e.snapshot_id > watermark.id));
  const tailGuard = "user_id='race' AND source='probe' AND repair_version=? AND dirty_at=? AND repair_watermark_at=? AND repair_watermark_id=? AND (SELECT COUNT(*) FROM snapshots WHERE user_id='race' AND source='probe' AND (observed_at,id) > (?,?))=?";
  const tailBatch = [
    db.prepare("DELETE FROM events WHERE user_id='race' AND source='probe' AND (observed_at,snapshot_id) > (?,?) AND EXISTS (SELECT 1 FROM series_status WHERE " + tailGuard + ")").bind(watermark.observed_at,watermark.id,Number(tailRepair.repair_version),tail[0]?.observed_at,latest.observed_at,latest.id,watermark.observed_at,watermark.id,tail.length),
    ...tailExpected.map(e => db.prepare("INSERT INTO events(snapshot_id,user_id,source,course_id,observed_at,state,xp,prev_state,last_xp) SELECT ?, 'race','probe',?,?, ?,?,?,? WHERE EXISTS (SELECT 1 FROM series_status WHERE " + tailGuard + ") ON CONFLICT DO NOTHING").bind(e.snapshot_id,e.course_id,e.observed_at,e.state,e.xp,e.prev_state,e.last_xp,Number(tailRepair.repair_version),tail[0]?.observed_at,latest.observed_at,latest.id,watermark.observed_at,watermark.id,tail.length)),
    db.prepare("UPDATE series_status SET head_at=?,head_id=?,dirty_at=NULL,repair_watermark_at=NULL,repair_watermark_id=NULL,repair_cursor_at=NULL,repair_cursor_id=NULL,repair_version=repair_version+1,version=version+1 WHERE user_id='race' AND source='probe' AND repair_version=? AND dirty_at=? AND repair_watermark_at=? AND repair_watermark_id=? AND (?,?) >= (head_at,head_id) AND (SELECT COUNT(*) FROM snapshots WHERE user_id='race' AND source='probe' AND (observed_at,id) > (?,?))=?").bind(latest.observed_at,latest.id,Number(tailRepair.repair_version),tail[0]?.observed_at,latest.observed_at,latest.id,latest.observed_at,latest.id,watermark.observed_at,watermark.id,tail.length),
  ];
  await db.batch(tailBatch);

  const finalStatus = await db.prepare("SELECT head_at,head_id,dirty_at,version,repair_watermark_at,repair_watermark_id,repair_version FROM series_status WHERE user_id='race' AND source='probe'").first();
  const finalEvents = await db.prepare("SELECT snapshot_id,course_id,observed_at,state,xp,prev_state,last_xp FROM events WHERE user_id='race' AND source='probe' ORDER BY observed_at,snapshot_id,course_id").all();
  const finalParity = JSON.stringify(canonical(finalEvents.results)) === JSON.stringify(canonical(fullExpected));
  return {
    staleReadsAllSameVersion: versionsRead.length === 1,
    staleWriterAttempts: initial.results.length,
    snapshotsAfterRace,
    oneWinnerEventCount: raceEvents === 1,
    dirtyAfterRace: Boolean(afterRace.dirty_at),
    tailArrivalInvalidatesOldGuard: oldGuardRejected && Boolean(afterOldGuard.dirty_at),
    tailArrivalDoesNotInvalidateRepairEpoch: tailDidNotInvalidateRepairEpoch,
    prefixPublishedBeforeTail: prefixPublished,
    prefixEventsAfterRepair: prefixCount,
    tailSnapshots: tail.length,
    finalParity,
    finalHeadAtLatest: finalStatus.head_id === latest.id,
    dirtyCleared: finalStatus.dirty_at === null,
    pass: versionsRead.length === 1 && snapshotsAfterRace === 20 && raceEvents === 1 && Boolean(afterRace.dirty_at) && oldGuardRejected && tailDidNotInvalidateRepairEpoch && prefixPublished && tail.length === 5 && finalParity && finalStatus.head_id === latest.id && finalStatus.dirty_at === null,
    note: "D1-backed reference protocol test. A separate repair_version lets later-than-watermark ingests proceed without invalidating the current prefix. It is not the production A7 implementation.",
  };
}


function livenessSimulation() {
  function rng(seed) {
    let x = seed >>> 0;
    return () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return (x >>> 0) / 4294967296; };
  }
  function run(mode, seed, p = 0.9, chunk = 3) {
    const random = rng(seed);
    const target = 20;
    let total = target;
    let completed = 0;
    let attempts = 0;
    let failed = 0;
    let arrivals = 0;
    while (completed < total && attempts < 3000) {
      attempts++;
      const n = Math.min(chunk, total - completed);
      const newArrival = random() < p;
      if (newArrival) arrivals++;
      if (mode === "current" && newArrival) { failed++; total++; continue; }
      completed += n;
      // A fixed watermark freezes the current repair target. New arrivals remain
      // outside this repair and are handled by the next ordered pass.
    }
    return { completed: completed >= total, attempts, failed, arrivals, total };
  }
  const current = Array.from({ length: 100 }, (_, i) => run("current", i + 1));
  const watermark = Array.from({ length: 100 }, (_, i) => run("watermark", i + 1));
  const median = values => values.sort((a,b) => a-b)[Math.floor(values.length / 2)];
  return {
    workload: "synthetic adversarial model: 20 initial snapshots, 90% chance of an arrival during each attempt, chunk=3, max 3000 attempts, 100 deterministic seeds",
    currentProtocol: { completed: current.filter(x => x.completed).length, medianAttempts: median(current.map(x => x.attempts)), maxAttempts: Math.max(...current.map(x => x.attempts)) },
    fixedWatermarkPrototype: { completed: watermark.filter(x => x.completed).length, medianAttempts: median(watermark.map(x => x.attempts)), maxAttempts: Math.max(...watermark.map(x => x.attempts)) },
    note: "Simulation only. It does not prove a production protocol; watermark implementation still needs D1-backed interleaving tests.",
  };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      if (url.pathname === "/setup") {
        await ensureSchema(env.DB);
        const bench = await seedBench(env.DB);
        const p1 = await seedP1(env.DB);
        return json({ ok: true, schema: true, bench, p1 });
      }
      if (url.pathname === "/runtime-scenario") {
        const result = await runtimeScenario(env.DB);
        return json(result, result.pass ? 200 : 500);
      }
      if (url.pathname === "/semantics") return json(await semantics(env.DB));
      if (url.pathname === "/measure") {
        const size = Number(url.searchParams.get("n"));
        if (![1, 42, 294, 850].includes(size)) return json({ error: "n must be 1, 42, 294 or 850" }, 400);
        return json(await measure(env.DB, size));
      }
      if (url.pathname === "/measure-chunk") {
        const size = Number(url.searchParams.get("k"));
        if (![1, 3, 10, 25].includes(size)) return json({ error: "k must be 1, 3, 10 or 25" }, 400);
        return json(await measureChunk(env.DB, size));
      }
      if (url.pathname === "/p1") return json(await auditP1(env.DB));
      if (url.pathname === "/liveness-d1") return json(await livenessD1(env.DB));
      if (url.pathname === "/liveness") return json(livenessSimulation());
      return json({ service: "meridian-a7-d1-validation", endpoints: ["/setup", "/semantics", "/measure?n=1|42|294|850", "/measure-chunk?k=1|3|10|25", "/p1", "/liveness", "/liveness-d1"] });
    } catch (error) {
      return json({ ok: false, error: String(error?.stack ?? error) }, 500);
    }
  },
};
