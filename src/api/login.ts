export const SESSION_COOKIE = "__Host-session"; // __Host-: Secure, Path=/, no Domain
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

const SECURITY_HEADERS = {
  "content-type": "text/html; charset=utf-8",
  "cache-control": "no-store",
  "x-frame-options": "DENY",
  "x-content-type-options": "nosniff",
  "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'",
} as const;

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

// Only same-site absolute paths. Browsers strip tab/newline when parsing a Location, so "/\t/evil.example" would
// become "//evil.example": reject every control char, space and backslash, and a leading "//".
export const safeNext = (next: string | null | undefined): string =>
  next && /^\/(?!\/)[^\x00-\x20\x7f\\]*$/.test(next) ? next : "/";

export function loginPage(next: string, error?: string, status = 200): Response {
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Acceso · Meridian</title>
<style>:root{color-scheme:light dark}body{font-family:system-ui,sans-serif;max-width:22rem;margin:12vh auto;padding:0 16px}
h1{font-size:1.2rem}label{display:block;margin:.8rem 0 .2rem;font-size:.9rem}
input{width:100%;box-sizing:border-box;padding:.6rem;font-size:1rem}button{margin-top:1rem;width:100%;padding:.7rem;font-size:1rem}
.err{color:#b42318;margin-top:.8rem}</style></head><body>
<h1>Meridian</h1>
<form method="post" action="/login">
<input type="hidden" name="next" value="${esc(next)}">
<label for="email">Email</label><input id="email" name="email" type="email" autocomplete="username" required autofocus>
<label for="password">Contraseña</label><input id="password" name="password" type="password" autocomplete="current-password" required>
<button type="submit">Entrar</button>
${error ? `<p class="err" role="alert">${esc(error)}</p>` : ""}
</form></body></html>`;
  return new Response(html, { status, headers: SECURITY_HEADERS });
}

export const sessionCookie = (token: string, maxAge = SESSION_TTL_SECONDS) =>
  `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;

export const redirect = (to: string, cookie?: string): Response =>
  new Response(null, { status: 303, headers: { location: to, "cache-control": "no-store", ...(cookie ? { "set-cookie": cookie } : {}) } });

// State-changing requests authenticated by cookie must come from our own origin (CSRF defence in depth on top of SameSite=Lax).
export function isSameOrigin(req: Request): boolean {
  const site = req.headers.get("sec-fetch-site");
  if (site) return site === "same-origin";
  const origin = req.headers.get("origin");
  return !!origin && origin === new URL(req.url).origin;
}
