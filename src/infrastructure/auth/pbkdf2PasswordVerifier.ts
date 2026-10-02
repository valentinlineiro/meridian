import type { PasswordVerifier } from "../../ports/authPort.ts";

// Workers cap PBKDF2 at 100k iterations; the password is a long random one, so this is for offline-hash resistance only.
const ITERATIONS = 100_000;
const FORMAT = "pbkdf2-sha256";

const b64u = (b: Uint8Array) => Buffer.from(b).toString("base64url");
const fromB64u = (s: string) => new Uint8Array(Buffer.from(s, "base64url"));

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256));
}

export async function hashPassword(password: string, iterations = ITERATIONS): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `${FORMAT}$${iterations}$${b64u(salt)}$${b64u(await derive(password, salt, iterations))}`;
}

export function isWellFormedHash(stored: string): boolean {
  const [fmt, it, salt, hash, extra] = stored.split("$");
  const n = Number(it);
  return fmt === FORMAT && Number.isInteger(n) && n >= 1 && n <= ITERATIONS && !!salt && !!hash && extra === undefined;
}

export const pbkdf2PasswordVerifier: PasswordVerifier = {
  async verify(password, stored) {
    try {
      const [fmt, it, salt, hash] = stored.split("$");
      const iterations = Number(it);
      if (fmt !== FORMAT || !Number.isInteger(iterations) || iterations < 1 || iterations > ITERATIONS || !salt || !hash) return false;
      const expected = fromB64u(hash);
      const actual = await derive(password, fromB64u(salt), iterations);
      if (expected.length !== actual.length) return false;
      let diff = 0;
      for (let i = 0; i < actual.length; i++) diff |= actual[i]! ^ expected[i]!;
      return diff === 0;
    } catch {
      return false;
    }
  },
};
