import type { SessionClaims, SessionCodec } from "../../ports/authPort.ts";

const b64u = (b: ArrayBuffer | Uint8Array | string) =>
  Buffer.from(typeof b === "string" ? b : new Uint8Array(b)).toString("base64url");

const MIN_SECRET_BYTES = 32;

// Stateless signed session: base64url(claims).base64url(HMAC-SHA256). No server-side session store.
export function createHmacSessionCodec(secret: string): SessionCodec | null {
  if (new TextEncoder().encode(secret).length < MIN_SECRET_BYTES) return null; // fail closed on weak/missing secret
  const key = crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
  return {
    async sign(claims) {
      const payload = b64u(JSON.stringify(claims));
      return `${payload}.${b64u(await crypto.subtle.sign("HMAC", await key, new TextEncoder().encode(payload)))}`;
    },
    async verify(token) {
      try {
        const [payload, sig, extra] = token.split(".");
        if (!payload || !sig || extra !== undefined) return null;
        const ok = await crypto.subtle.verify("HMAC", await key, Buffer.from(sig, "base64url"), new TextEncoder().encode(payload));
        if (!ok) return null;
        const c = JSON.parse(Buffer.from(payload, "base64url").toString()) as Partial<SessionClaims>;
        return typeof c.sub === "string" && typeof c.exp === "number" ? { sub: c.sub, exp: c.exp } : null;
      } catch {
        return null;
      }
    },
  };
}
