import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { pbkdf2PasswordVerifier, isWellFormedHash } from "../src/infrastructure/auth/pbkdf2PasswordVerifier.ts";

const run = (input: string) =>
  spawnSync("node", [new URL("../scripts/hash-password.mjs", import.meta.url).pathname], { input, encoding: "utf8", env: { PATH: process.env.PATH } });

// The Worker secret ADMIN_PASSWORD_HASH is generated with this script and is not recoverable from Cloudflare.
describe("scripts/hash-password.mjs", () => {
  it("shouldPrintAHashTheWorkerAcceptsWhenGivenALongPassword", async () => {
    const r = run("a-long-random-password-123");
    expect(r.status).toBe(0);
    expect(isWellFormedHash(r.stdout)).toBe(true);
    expect(await pbkdf2PasswordVerifier.verify("a-long-random-password-123", r.stdout)).toBe(true);
    expect(await pbkdf2PasswordVerifier.verify("another-long-password-1", r.stdout)).toBe(false);
  });

  it("shouldRejectAShortPasswordWithoutPrintingAHash", () => {
    const r = run("short");
    expect(r.status).toBe(1);
    expect(r.stdout).toBe("");
  });
});
