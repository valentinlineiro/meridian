import { describe, it, expect, vi } from "vitest";
import { loginUseCase, authenticateSession, type LoginInput } from "../src/application/authUseCase.ts";
import { InvalidCredentialsError, TooManyAttemptsError } from "../src/application/errors.ts";
import type { LoginThrottle, PasswordVerifier, SessionCodec } from "../src/ports/authPort.ts";

const NOW = 1_700_000_000_000;
const input: LoginInput = { email: "Owner@Example.com", password: "pw", adminEmail: "owner@example.com", passwordHash: "H", nowMs: NOW, ttlSeconds: 100 };

function ports(passwordOk = true, locked = false) {
  const passwords: PasswordVerifier = { verify: vi.fn(async () => passwordOk) };
  const sessions: SessionCodec = { sign: vi.fn(async (c) => `signed:${c.sub}:${c.exp}`), verify: vi.fn(async () => null) };
  const throttle: LoginThrottle = { tryAcquire: vi.fn(async () => !locked), reset: vi.fn(async () => {}) };
  return { passwords, sessions, throttle };
}

describe("loginUseCase", () => {
  it("shouldIssueSessionAndResetThrottleWhenCredentialsAreValid", async () => {
    const p = ports();
    const token = await loginUseCase(p, input);
    expect(token).toBe(`signed:owner@example.com:${NOW / 1000 + 100}`);
    expect(p.throttle.tryAcquire).toHaveBeenCalledWith(NOW);
    expect(p.throttle.reset).toHaveBeenCalled();
  });

  it("shouldRejectAndKeepTheReservedAttemptWhenPasswordIsWrong", async () => {
    const p = ports(false);
    await expect(loginUseCase(p, input)).rejects.toBeInstanceOf(InvalidCredentialsError);
    expect(p.throttle.tryAcquire).toHaveBeenCalledWith(NOW);
    expect(p.throttle.reset).not.toHaveBeenCalled();
    expect(p.sessions.sign).not.toHaveBeenCalled();
  });

  it("shouldStillVerifyThePasswordWhenEmailIsWrongToAvoidATimingOracle", async () => {
    const p = ports(true);
    await expect(loginUseCase(p, { ...input, email: "stranger@example.com" })).rejects.toBeInstanceOf(InvalidCredentialsError);
    expect(p.passwords.verify).toHaveBeenCalled();
    expect(p.throttle.reset).not.toHaveBeenCalled();
  });

  it("shouldRefuseWithoutCheckingThePasswordWhenLocked", async () => {
    const p = ports(true, true);
    await expect(loginUseCase(p, input)).rejects.toBeInstanceOf(TooManyAttemptsError);
    expect(p.passwords.verify).not.toHaveBeenCalled();
  });
});

describe("authenticateSession", () => {
  const codec = (claims: { sub: string; exp: number } | null): SessionCodec => ({ sign: async () => "", verify: async () => claims });
  const ok = { sub: "owner@example.com", exp: NOW / 1000 + 10 };

  it("shouldReturnAdminEmailWhenSessionIsValid", async () => {
    expect(await authenticateSession(codec(ok), "t", "Owner@Example.com", NOW)).toBe("Owner@Example.com");
  });
  it("shouldReturnNullWhenTokenIsMissing", async () => expect(await authenticateSession(codec(ok), undefined, "owner@example.com", NOW)).toBeNull());
  it("shouldReturnNullWhenSignatureIsInvalid", async () => expect(await authenticateSession(codec(null), "t", "owner@example.com", NOW)).toBeNull());
  it("shouldReturnNullWhenExpired", async () => {
    expect(await authenticateSession(codec({ ...ok, exp: NOW / 1000 }), "t", "owner@example.com", NOW)).toBeNull();
  });
  it("shouldReturnNullWhenSubjectIsNotTheConfiguredOwner", async () => {
    expect(await authenticateSession(codec({ ...ok, sub: "other@example.com" }), "t", "owner@example.com", NOW)).toBeNull();
  });
});
