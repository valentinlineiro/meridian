import { describe, it, expect } from "vitest";
import { hashPassword, isWellFormedHash, pbkdf2PasswordVerifier } from "../src/infrastructure/auth/pbkdf2PasswordVerifier.ts";
import { createHmacSessionCodec } from "../src/infrastructure/auth/hmacSessionCodec.ts";
import { createD1LoginThrottle, MAX_FAILURES, WINDOW_MS } from "../src/infrastructure/d1/d1LoginThrottleAdapter.ts";
import { createSqliteD1 } from "./helpers/sqliteD1.ts";

describe("pbkdf2PasswordVerifier", () => {
  it("shouldVerifyWhenPasswordMatchesItsHash", async () => {
    expect(await pbkdf2PasswordVerifier.verify("correct horse", await hashPassword("correct horse"))).toBe(true);
  });
  it("shouldRejectWhenPasswordIsWrong", async () => {
    expect(await pbkdf2PasswordVerifier.verify("nope", await hashPassword("correct horse"))).toBe(false);
  });
  it("shouldProduceDifferentHashesForTheSamePasswordBecauseOfTheSalt", async () => {
    expect(await hashPassword("x")).not.toBe(await hashPassword("x"));
  });
  it.each(["", "garbage", "pbkdf2-sha256$100000$onlythree", "md5$1$a$b", "pbkdf2-sha256$abc$a$b", "pbkdf2-sha256$999999999$a$b"])(
    "shouldRejectMalformedOrAbusiveStoredHash (%s)", async (stored) => {
      expect(await pbkdf2PasswordVerifier.verify("x", stored)).toBe(false);
    });
});

describe("isWellFormedHash", () => {
  it("shouldAcceptAHashProducedByHashPassword", async () => expect(isWellFormedHash(await hashPassword("x", 1000))).toBe(true));
  it.each(["", "x", "pbkdf2-sha256$1000$a", "pbkdf2-sha256$1000$a$b$c", "pbkdf2-sha256$0$a$b", "pbkdf2-sha256$100001$a$b", "bcrypt$10$a$b"])(
    "shouldRejectMalformed (%s)", (h) => expect(isWellFormedHash(h)).toBe(false));
});

describe("hmacSessionCodec", () => {
  const secret = "s".repeat(40);
  const claims = { sub: "owner@example.com", exp: 4_000_000_000 };

  it("shouldRoundTripSignedClaims", async () => {
    const c = createHmacSessionCodec(secret)!;
    expect(await c.verify(await c.sign(claims))).toEqual(claims);
  });
  it("shouldRejectTamperedPayload", async () => {
    const c = createHmacSessionCodec(secret)!;
    const [, sig] = (await c.sign(claims)).split(".");
    const forged = Buffer.from(JSON.stringify({ sub: "owner@example.com", exp: 9_999_999_999 })).toString("base64url");
    expect(await c.verify(`${forged}.${sig}`)).toBeNull();
  });
  it("shouldRejectTokenSignedWithAnotherSecret", async () => {
    const token = await createHmacSessionCodec("a".repeat(40))!.sign(claims);
    expect(await createHmacSessionCodec("b".repeat(40))!.verify(token)).toBeNull();
  });
  it.each(["", "a", "a.b", "a.b.c", "....", "%%%.%%%"])("shouldRejectGarbage (%s)", async (t) => {
    expect(await createHmacSessionCodec(secret)!.verify(t)).toBeNull();
  });
  it("shouldRefuseToCreateACodecFromAWeakSecret", () => {
    expect(createHmacSessionCodec("short")).toBeNull();
    expect(createHmacSessionCodec("")).toBeNull();
  });
});

describe("d1LoginThrottle", () => {
  const setup = () => createD1LoginThrottle(createSqliteD1(["0010_login_failures.sql"]).d1);
  const T = 1_000_000_000_000;

  it("shouldAllowExactlyMaxAttemptsWithinTheWindowThenLock", async () => {
    const t = setup();
    for (let i = 0; i < MAX_FAILURES; i++) expect(await t.tryAcquire(T + i)).toBe(true);
    expect(await t.tryAcquire(T + 100)).toBe(false);
  });
  it("shouldNotExtendTheLockWhileLocked", async () => {
    const t = setup();
    for (let i = 0; i < MAX_FAILURES; i++) await t.tryAcquire(T);
    for (let i = 0; i < 50; i++) expect(await t.tryAcquire(T + WINDOW_MS - 1)).toBe(false); // hammering records nothing
    expect(await t.tryAcquire(T + WINDOW_MS + 1)).toBe(true); // lock ends WINDOW after the last reserved attempt
  });
  it("shouldNeverExceedMaxUnderConcurrentBursts", async () => {
    const t = setup();
    const results = await Promise.all(Array.from({ length: 200 }, () => t.tryAcquire(T)));
    expect(results.filter(Boolean)).toHaveLength(MAX_FAILURES);
  });
  it("shouldClearOnReset", async () => {
    const t = setup();
    for (let i = 0; i < MAX_FAILURES; i++) await t.tryAcquire(T);
    await t.reset();
    expect(await t.tryAcquire(T + 1)).toBe(true);
  });
});
