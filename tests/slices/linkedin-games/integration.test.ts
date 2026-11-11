import { describe, it, expect, beforeEach } from "vitest";
import worker from "../../../src/index.ts";
import type { Env } from "../../../src/types.ts";
import { createHmacSessionCodec } from "../../../src/infrastructure/auth/hmacSessionCodec.ts";
import { setupTestDb } from "../../helpers/testDb.ts";

const SECRET = "x".repeat(48), ADMIN = "owner@example.com", BASE = "https://stats.example.com";
const SAME = { "sec-fetch-site": "same-origin", "content-type": "application/json" };
const cookie = async () => `__Host-session=${await createHmacSessionCodec(SECRET)!.sign({ sub: ADMIN, exp: Math.floor(Date.now() / 1000) + 600 })}`;

let state: ReturnType<typeof setupTestDb>;
let env: Env;
beforeEach(() => {
  state = setupTestDb();
  state.db.exec(`INSERT INTO users VALUES ('u1','t'); INSERT INTO user_identities VALUES ('u1','cloudflare_access','${ADMIN}','t');`);
  env = { DB: state.d1, IMPORT_TOKEN: "t", SESSION_SECRET: SECRET, ADMIN_EMAIL: ADMIN, ADMIN_PASSWORD_HASH: "x" } as unknown as Env;
});

const put = async (body: unknown, headers: Record<string, string> = {}) =>
  worker.fetch(new Request(`${BASE}/api/me/linkedin-games`, { method: "PUT", headers: { cookie: await cookie(), ...SAME, ...headers }, body: JSON.stringify(body) }), env);
// A save that is expected to succeed: a refused one fails here, with its body, instead of surfacing as a wrong value later.
const putOk = async (body: unknown, headers: Record<string, string> = {}) => {
  const res = await put(body, headers);
  expect(res.status, await res.clone().text()).toBe(200);
  return res;
};
const get = async (date: string) =>
  worker.fetch(new Request(`${BASE}/api/me/linkedin-games?date=${date}`, { headers: { cookie: await cookie() } }), env);
const rows = () => state.db.prepare("SELECT source, user_id, raw_json FROM snapshots WHERE source='linkedin-games' ORDER BY created_at, rowid").all();
const zip = { date: "2026-10-13", game: "zip", score: "0:08", avg: "0:17", number: 449 };

describe("linkedin games manual entry over HTTP and D1", () => {
  it("shouldStoreTheDayAsASnapshotOfTheOwnerAndServeItBack", async () => {
    expect((await put(zip)).status).toBe(200);
    const stored = rows();
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ source: "linkedin-games", user_id: "u1" });
    expect(JSON.parse(stored[0].raw_json).games.zip).toMatchObject({ scoreSeconds: 8, avgSeconds: 17 });
    const body: any = await (await get("2026-10-13")).json();
    expect(body.day.games.zip.score).toBe("0:08");
  });

  it("shouldAccumulateGamesAcrossSavesAndLeaveTheLatestVersionComplete", async () => {
    await putOk(zip);
    await new Promise((r) => setTimeout(r, 5));
    await putOk({ date: "2026-10-13", game: "queens", score: "1:10" });
    expect(rows()).toHaveLength(2);
    const body: any = await (await get("2026-10-13")).json();
    expect(Object.keys(body.day.games).sort()).toEqual(["queens", "zip"]);
  });

  it("shouldServeTheCorrectedValueWhenAResultIsCorrectedBackToAnEarlierOne", async () => {
    for (const score of ["0:08", "0:09", "0:08"]) {
      await putOk({ ...zip, score });
      await new Promise((r) => setTimeout(r, 5)); // created_at has millisecond resolution
    }
    expect(rows()).toHaveLength(3);
    const body: any = await (await get("2026-10-13")).json();
    expect(body.day.games.zip.score).toBe("0:08");
    expect(new Set(rows().map((r: any) => JSON.parse(r.raw_json).capturedAt)).size).toBe(3);
  });

  it("shouldKeepAverageAndPuzzleNumberInTheCurrentVersionWhenOnlyTheTimeIsCorrected", async () => {
    await putOk(zip);
    await new Promise((r) => setTimeout(r, 5));
    await putOk({ date: "2026-10-13", game: "zip", score: "0:09", avg: null, number: null });
    const body: any = await (await get("2026-10-13")).json();
    expect(body.day.games.zip).toEqual({ number: 449, score: "0:09", scoreSeconds: 9, avg: "0:17", avgSeconds: 17 });
  });

  it("shouldNotAddAVersionWhenTheSameRequestIsRetried", async () => {
    await putOk(zip);
    await putOk(zip);
    expect(rows()).toHaveLength(1);
  });

  it("shouldAnswer400WhenThePlayDateIsInTheFuture", async () => {
    const res = await put({ ...zip, date: "2999-01-01" });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ ok: false, code: "INVALID_PLAY_DATE" });
    expect(rows()).toHaveLength(0);
  });

  it("shouldFileTheResultUnderThePlayDateNotTheEntryDate", async () => {
    await putOk({ ...zip, date: "2026-10-01" });
    expect(JSON.parse(rows()[0].raw_json).date).toBe("2026-10-01");
    expect(((await (await get("2026-10-13")).json()) as any).day.games).toEqual({});
  });

  it("shouldAnswer400WithStableCodeWhenTheResultIsInvalid", async () => {
    const res = await put({ ...zip, score: "fast" });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ ok: false, code: "INVALID_GAME_RESULT" });
    expect(rows()).toHaveLength(0);
  });

  it("shouldRefuseTheImportTokenAndCrossOriginWrites", async () => {
    const bearer = await worker.fetch(new Request(`${BASE}/api/me/linkedin-games`, { method: "PUT", headers: { authorization: "Bearer t", ...SAME }, body: JSON.stringify(zip) }), env);
    expect(bearer.status).toBe(401);
    expect((await put(zip, { "sec-fetch-site": "cross-site" })).status).toBe(403);
    expect(rows()).toHaveLength(0);
  });

  const summary = async (headers: Record<string, string> = {}) =>
    worker.fetch(new Request(`${BASE}/api/me/linkedin-games/summary?today=2026-10-14`, { headers }), env);

  it("shouldReturnTheSummaryOfTheOwnerWhenSnapshotsExist", async () => {
    await putOk(zip);
    await new Promise((r) => setTimeout(r, 5));
    await putOk({ ...zip, score: "0:05" }); // edited: a second version of the same date
    const res = await summary({ cookie: await cookie() });
    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.summary).toMatchObject({ days: 1, from: "2026-10-13", playStreak: { current: 1, max: 1 } });
    expect(body.summary.games.zip).toMatchObject({ n: 1, best: { seconds: 5, date: "2026-10-13" } });
  });

  it("shouldServeWindowsAndTrajectoryPerGameWithoutARootLevelAllField", async () => {
    expect((await put(zip)).status).toBe(200); // 2026-10-13, today is 2026-10-14 in the summary request
    const body: any = await (await summary({ cookie: await cookie() })).json();
    expect(Object.keys(body.summary).sort()).toEqual(["days", "difficulty", "from", "games", "playStreak", "to", "weekdays"]);
    const z = body.summary.games.zip;
    expect(z.firstDate).toBe("2026-10-13");
    expect(z.windows["28"].eff).toEqual({ median: 17 / 8, nEff: 1 });
    expect(z.windows["28"].time).toEqual({ median: 8, p25: 8, p75: 8, nTime: 1 });
    expect(z.windows["28"].prev).toBeNull();
    expect(z.trajectory["7"]).toEqual([{ start: "2026-10-13", n: 1, eff: 17 / 8, beat: 1 }, { start: "2026-10-14", n: 0, eff: null, beat: null }]);
  });

  // 170 consecutive days of zip ending 2026-10-14, inserted directly (one snapshot per date)
  const seedZip = (days = 170) => {
    for (let i = 0; i < days; i++) {
      const date = new Date(Date.parse("2026-10-14T00:00:00Z") - (days - 1 - i) * 86_400_000).toISOString().slice(0, 10);
      const raw = JSON.stringify({ schema: 1, date, games: { zip: { number: null, score: "0:10", scoreSeconds: 10, avg: "0:20", avgSeconds: 20 + (i % 7) } } });
      state.db.prepare("INSERT INTO snapshots (id, created_at, source, user_id, raw_json, games_count, pages_count, checksum, size_bytes) VALUES (?,?,'linkedin-games','u1',?,0,0,?,?)")
        .run(`s${i}`, `${date}T10:00:00Z`, raw, `c${i}`, raw.length);
    }
  };

  it("shouldServeTheMeasuresInterpretationAndBandsOfACalibratedGame", async () => {
    seedZip();
    const g: any = ((await (await summary({ cookie: await cookie() })).json()) as any).summary.games.zip;
    expect(g.trend112).toMatchObject({ days: 112, n: 112 });
    expect(Number.isFinite(g.trend112.rho) && Number.isFinite(g.trend112.slopePctPer28d)).toBe(true);
    expect(g.recent28vBase56).toMatchObject({ nCur: 28, nBase: 56 });
    expect(g.interpretation.bands).toEqual({ "28": [-0.2552, 0.3433], "28v56": [-0.2263, 0.2971], rho112: [-0.1888, 0.183] });
    expect(g.interpretation.calibratedThrough).toBe("2026-11-03");
    expect(Object.keys(g.interpretation).sort()).toEqual(["bands", "calibratedThrough", "candidate", "label", "pending", "previousCandidate", "reason"]);
    expect(g.windows["28"].delta.effRel).toMatchObject({ band: [-0.2552, 0.3433] });
    expect(["up", "down", "flat"]).toContain(g.windows["28"].delta.effRel.arrow);
    expect(g.regression).toBe(g.interpretation.label === "deterioro");
  });

  it("shouldMarkAGameWithoutCalibrationAsInsufficientOverHttp", async () => {
    expect((await put({ ...zip, game: "tango", score: "0:45", avg: "0:50" })).status).toBe(200);
    const g: any = ((await (await summary({ cookie: await cookie() })).json()) as any).summary.games.tango;
    expect(g.interpretation).toMatchObject({ label: "datos_insuficientes", reason: "sin_calibracion", bands: null, calibratedThrough: null });
    expect(g.trend112).toBeNull();
  });

  it("shouldKeepTheFieldsOfTheOlderContractAndTheMeasuresOfP0InTheSameResponse", async () => {
    seedZip();
    const g: any = ((await (await summary({ cookie: await cookie() })).json()) as any).summary.games.zip;
    for (const k of ["n", "nWithAvg", "beatAvgRate", "efficiency", "best", "beatStreak", "regression", "series", "firstDate", "windows", "trajectory"]) expect(g).toHaveProperty(k);
    expect(Object.keys(g.windows["7"].delta.effRel).sort()).toEqual(["nCur", "nPrev", "value"]); // no arrow outside the 28-day window
  });

  it("shouldNotIncludeAnotherUsersSnapshots", async () => {
    state.db.exec(`INSERT INTO users VALUES ('u2','t');`);
    state.db.prepare("INSERT INTO snapshots (id, created_at, source, user_id, raw_json, games_count, pages_count, checksum, size_bytes) VALUES ('s1','2026-10-13T10:00:00Z','linkedin-games','u2',?,0,0,'c1',1)")
      .run(JSON.stringify({ schema: 1, date: "2026-10-13", games: { zip: { scoreSeconds: 8, avgSeconds: 17 } } }));
    const body: any = await (await summary({ cookie: await cookie() })).json();
    expect(body.summary.days).toBe(0);
  });

  it("shouldAnswer401WhenThereIsNoSession", async () => {
    expect((await summary()).status).toBe(401);
  });

  it("shouldAnswer400WhenTodayIsNotARealDate", async () => {
    const res = await worker.fetch(new Request(`${BASE}/api/me/linkedin-games/summary?today=2026-13-45`, { headers: { cookie: await cookie() } }), env);
    expect(res.status).toBe(400);
  });
});

describe("linkedin games import over HTTP and D1", () => {
  const imp = async (body: unknown, headers: Record<string, string> = {}) =>
    worker.fetch(new Request(`${BASE}/api/me/linkedin-games/import`, { method: "POST", headers: { cookie: await cookie(), ...SAME, ...headers }, body: JSON.stringify(body) }), env);
  const text = "P, 5, 16\nZ, 6, 12";
  const today = new Date().toISOString().slice(0, 10);

  it("shouldPreviewWithoutWritingAndThenStoreOneSnapshotOfTheDayWhenApplied", async () => {
    const preview = await imp({ text, today });
    expect(preview.status).toBe(200);
    expect(await preview.json()).toMatchObject({ ok: true, applied: false, errors: [], days: [{ date: today, games: [{ game: "patches", status: "new" }, { game: "zip", status: "new" }] }] });
    expect(rows()).toHaveLength(0);

    const applied = await imp({ text, today, apply: true });
    expect(await applied.json()).toMatchObject({ applied: true });
    expect(rows()).toHaveLength(1);
    expect(JSON.parse((rows()[0] as { raw_json: string }).raw_json).games.zip.score).toBe("0:06");
    expect((await (await get(today)).json() as { day: { games: object } }).day.games).toHaveProperty("patches");
  });

  it("shouldAnswerWithLineErrorsAndWriteNothingWhenATextLineIsNotUnderstood", async () => {
    const r = await imp({ text: "Z, 6, 12\nhola", today, apply: true });
    expect(await r.json()).toMatchObject({ applied: false, errors: [{ line: 2 }] });
    expect(rows()).toHaveLength(0);
  });

  it("shouldRefuseTheImportTokenAloneAndACrossSiteRequest", async () => {
    const machine = await worker.fetch(new Request(`${BASE}/api/me/linkedin-games/import`, { method: "POST", headers: { authorization: "Bearer t", ...SAME }, body: JSON.stringify({ text, today, apply: true }) }), env);
    expect(machine.status).toBe(401);
    const cross = await imp({ text, today, apply: true }, { "sec-fetch-site": "cross-site" });
    expect(cross.status).toBeGreaterThanOrEqual(400);
    expect(rows()).toHaveLength(0);
  });

  it("shouldRejectABodyWithoutTextOrToday", async () => {
    expect((await imp({ today })).status).toBe(400);
    expect((await imp({ text })).status).toBe(400);
  });
});
