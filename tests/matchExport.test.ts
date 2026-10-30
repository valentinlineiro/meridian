import { describe, it, expect, beforeEach } from "vitest";
import worker from "../src/index.ts";
import type { Env } from "../src/types.ts";
import { toCsv } from "../src/domain/matchExport.ts";
import { createHmacSessionCodec } from "../src/infrastructure/auth/hmacSessionCodec.ts";
import { createSqliteD1 } from "./helpers/sqliteD1.ts";

describe("toCsv", () => {
  it("shouldQuoteAndDoubleQuotesWhenFieldHasCommaQuoteOrNewline", () => {
    const csv = toCsv(["a", "b"], [['x,y', 'say "hi"'], ["l1\nl2", "ok"]]);
    expect(csv).toBe('a,b\r\n"x,y","say ""hi"""\r\n"l1\nl2",ok\r\n');
  });

  it("shouldNeutralizeFormulaWhenTextStartsWithTabOrCarriageReturn", () => {
    expect(toCsv(["n"], [["\tx"], ["\rx"]])).toBe("n\r\n'\tx\r\n\"'\rx\"\r\n");
  });

  it("shouldWriteEmptyCellWhenValueIsNull", () => {
    expect(toCsv(["a", "b"], [[null, 3]])).toBe("a,b\r\n,3\r\n");
  });

  it("shouldNeutralizeFormulaWhenTextStartsWithFormulaTrigger", () => {
    expect(toCsv(["n"], [["=HYPERLINK(1)"], ["+1"], ["@x"], ["-5"], [-5]])).toBe("n\r\n'=HYPERLINK(1)\r\n'+1\r\n'@x\r\n'-5\r\n-5\r\n");
  });
});

const SECRET = "x".repeat(48);
const ADMIN = "owner@example.com";
const cookie = async () => `__Host-session=${await createHmacSessionCodec(SECRET)!.sign({ sub: ADMIN, exp: Math.floor(Date.now() / 1000) + 600 })}`;

describe("GET /api/export/matches.csv", () => {
  let db: ReturnType<typeof createSqliteD1>["db"];
  let env: Env;
  beforeEach(() => {
    const s = createSqliteD1(["0001_init.sql", "0004_users.sql", "0005_played_at.sql", "0006_match_details.sql", "0007_openings_and_phases.sql", "0017_opening_family_mate_type.sql", "0018_mate_threats.sql"]);
    db = s.db;
    env = { DB: s.d1, IMPORT_TOKEN: "secret", SESSION_SECRET: SECRET, ADMIN_EMAIL: ADMIN, ADMIN_PASSWORD_HASH: "x" } as unknown as Env;
    db.exec(`
      INSERT INTO users (id, created_at) VALUES ('owner', 'd');
      INSERT INTO user_identities (user_id, provider, subject, created_at) VALUES ('owner', 'cloudflare_access', '${ADMIN}', 'd');
      INSERT INTO user_provider_accounts (user_id, provider, provider_user_id, created_at) VALUES ('owner', 'duolingo', 'u1', 'd');
      INSERT INTO matches (match_id, user_id, snapshot_id, first_seen_at, last_seen_at, raw_json, played_at, result, user_color, opponent_name, opponent_elo)
        VALUES ('m1', 'u1', 's', 'd', 'd', '{}', 1700000000, 'win', 'white', 'Ana, "la" rival', 1200),
               ('m2', 'u1', 's', 'd', 'd', '{}', 1700000100, 'loss', 'black', 'Bob', 1300),
               ('other', 'u2', 's', 'd', 'd', '{}', 1700000200, 'win', 'white', 'Eve', 900);
      INSERT INTO match_details (match_id, user_id, status, move_history, move_timestamps, elo_after, end_condition, opening_key, ply_count, opening_family, mate_type)
        VALUES ('m1', 'u1', 'done', '[]', '[]', 1010, 'checkmate', 'italian', 41, 'sicilian', 'back_rank');
    `);
  });
  const get = async (withSession = true) =>
    worker.fetch(new Request("https://stats.example.com/api/export/matches.csv", { headers: withSession ? { cookie: await cookie() } : {} }), env);

  it("shouldExportOnlyOwnMatchesOldestFirstWithDetailColumnsWhenAuthenticated", async () => {
    const res = await get();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/csv");
    expect(res.headers.get("content-disposition")).toMatch(/^attachment; filename="meridian-partidas-\d{4}-\d{2}-\d{2}\.csv"$/);
    const lines = (await res.text()).replace(/^﻿/, "").trimEnd().split("\r\n");
    expect(lines[0]).toBe("match_id,played_at,user_color,result,outcome,opponent_name,opponent_type,opponent_elo,pvp_match_type,elo_after,end_condition,opening_key,phase_key,ply_count,session_duration,opening_family,mate_type");
    expect(lines).toHaveLength(3);
    expect(lines[1]).toBe('m1,2023-11-14T22:13:20Z,white,win,,"Ana, ""la"" rival",,1200,,1010,checkmate,italian,,41,,Siciliana,Mate del pasillo');
  });

  it("shouldOrderByPlayedAtWithUndatedFirstWhenRowsWereInsertedOutOfOrder", async () => {
    db.exec(`INSERT INTO matches (match_id, user_id, snapshot_id, first_seen_at, last_seen_at, raw_json, played_at)
      VALUES ('late-insert-oldest', 'u1', 's', 'd', 'd', '{}', 1600000000), ('undated', 'u1', 's', 'd', 'd', '{}', NULL)`);
    const rows = (await (await get()).text()).trimEnd().split("\r\n").slice(1).map((l) => l.split(",")[0]);
    expect(rows).toEqual(["undated", "late-insert-oldest", "m1", "m2"]);
  });

  it("shouldLeaveDetailColumnsEmptyWhenMatchHasNoDetail", async () => {
    const lines = (await (await get()).text()).trimEnd().split("\r\n");
    expect(lines[2]).toBe("m2,2023-11-14T22:15:00Z,black,loss,,Bob,,1300,,,,,,,,,");
  });

  it("shouldWriteTheNamesAndNotTheKeysForOpeningFamilyAndMateType", async () => {
    db.exec("UPDATE match_details SET opening_family = 'ruy_lopez', mate_type = 'smothered' WHERE match_id = 'm1'");
    const lines = (await (await get()).text()).replace(/^﻿/, "").trimEnd().split("\r\n");
    expect(lines[1]!.endsWith(",Española (Ruy López),Mate ahogado")).toBe(true);
  });

  it("shouldLeaveTheFamilyEmptyWhenTheOpeningCouldNotBeClassified", async () => {
    db.exec("UPDATE match_details SET opening_family = 'unclassified', mate_type = NULL WHERE match_id = 'm1'");
    const lines = (await (await get()).text()).replace(/^﻿/, "").trimEnd().split("\r\n");
    expect(lines[1]!.endsWith(",41,,,")).toBe(true);
  });

  it("shouldStartWithUtf8BomWhenExcelMustReadAccents", async () => {
    expect([...new Uint8Array(await (await get()).arrayBuffer()).slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
  });

  it("shouldRefuseWhenNoSession", async () => {
    expect((await get(false)).status).toBe(401);
  });

  it("shouldRespond404WhenSessionOwnerHasNoProviderAccount", async () => {
    db.exec("DELETE FROM user_provider_accounts");
    expect((await get()).status).toBe(404);
  });
});
