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
    await put(zip);
    await new Promise((r) => setTimeout(r, 5));
    await put({ date: "2026-10-13", game: "queens", score: "1:10" });
    expect(rows()).toHaveLength(2);
    const body: any = await (await get("2026-10-13")).json();
    expect(Object.keys(body.day.games).sort()).toEqual(["queens", "zip"]);
  });

  it("shouldServeTheCorrectedValueWhenAResultIsCorrectedBackToAnEarlierOne", async () => {
    for (const score of ["0:08", "0:09", "0:08"]) {
      await put({ ...zip, score });
      await new Promise((r) => setTimeout(r, 5)); // created_at has millisecond resolution
    }
    expect(rows()).toHaveLength(3);
    const body: any = await (await get("2026-10-13")).json();
    expect(body.day.games.zip.score).toBe("0:08");
    expect(new Set(rows().map((r: any) => JSON.parse(r.raw_json).capturedAt)).size).toBe(3);
  });

  it("shouldNotAddAVersionWhenTheSameRequestIsRetried", async () => {
    await put(zip);
    await put(zip);
    expect(rows()).toHaveLength(1);
  });

  it("shouldAnswer400WhenThePlayDateIsInTheFuture", async () => {
    const res = await put({ ...zip, date: "2999-01-01" });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ ok: false, code: "INVALID_PLAY_DATE" });
    expect(rows()).toHaveLength(0);
  });

  it("shouldFileTheResultUnderThePlayDateNotTheEntryDate", async () => {
    await put({ ...zip, date: "2026-10-01" });
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
});
