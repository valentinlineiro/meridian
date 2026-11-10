import { describe, it, expect } from "vitest";
import worker from "../src/index.ts";
import adminWorker from "./helpers/adminWorker.ts";
import type { Env } from "../src/types.ts";

// Workers Assets serves web/dist/browser at its root and answers "/" with index.html (html_handling default).
const FILES: Record<string, [string, string]> = {
  "/": ['<!doctype html><base href="/"><app-root></app-root>', "text/html"],
  "/main-XYZ.js": ["console.log(1)", "text/javascript"],
  "/styles-XYZ.css": ["body{}", "text/css"],
  "/sw.js": ["self.skipWaiting()", "text/javascript"],
};
const requested: string[] = [];
const ASSETS = {
  fetch: async (req: Request) => {
    const path = new URL(req.url).pathname;
    requested.push(path);
    if (path === "/media/index.html") return new Response(null, { status: 307, headers: { location: "/media/" } }); // html_handling, as in Miniflare
    const file = FILES[path];
    return file ? new Response(file[0], { headers: { "content-type": file[1] } }) : new Response("nope", { status: 404 });
  },
};
const env = { DB: { prepare: () => null }, ASSETS } as unknown as Env;
const get = (path: string, w: { fetch: (r: Request, e: Env) => Response | Promise<Response> } = adminWorker) =>
  w.fetch(new Request("https://stats.example.com" + path, { redirect: "manual" }), env);

const ANGULAR_CSP =
  "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; manifest-src 'self'; worker-src 'self'; form-action 'self'; base-uri 'self'; frame-ancestors 'none'";
const CANONICAL = [
  "/", "/index.html", "/overview", "/overview/", "/chess", "/chess/", "/languages", "/languages/", "/languages/DUOLINGO_ES",
  "/changes", "/trajectory", "/profile", "/games", "/games/", "/settings",
];

const expectAngularIndex = async (res: Response) => {
  expect(res.status).toBe(200);
  expect(await res.text()).toContain("<app-root>");
  expect(res.headers.get("content-type")).toContain("text/html");
  expect(res.headers.get("content-security-policy")).toBe(ANGULAR_CSP);
  expect(res.headers.get("x-frame-options")).toBe("DENY");
  expect(res.headers.get("cache-control")).toBe("no-store");
  expect(res.headers.get("x-content-type-options")).toBe("nosniff");
  expect(res.headers.get("referrer-policy")).toBe("same-origin");
};

describe("Angular frontend at the root", () => {
  it.each(CANONICAL)("shouldServeAngularIndexAtEveryCanonicalPath %s", async (path) => {
    requested.length = 0;
    await expectAngularIndex(await get(path));
    expect(requested).toEqual(["/"]); // always the index, whatever the client route
  });

  it.each([
    ["/next", "/"],
    ["/next/", "/"],
    ["/next/chess", "/chess"],
    ["/next/languages/DUOLINGO_ES?from=a&b=c", "/languages/DUOLINGO_ES?from=a&b=c"],
    ["/next/main-XYZ.js", "/main-XYZ.js"],
  ])("shouldRedirectNextPrefixToRoot %s", async (path, location) => {
    const res = await get(path);
    expect(res.status).toBe(301);
    expect(res.headers.get("location")).toBe(location);
  });

  it("shouldNotTreatPathsMerelyStartingWithNextAsThePrefix", async () => {
    await expectAngularIndex(await get("/nextish"));
  });

  it("shouldKeepLoginAndLogoutAsServerPages", async () => {
    requested.length = 0;
    const login = await get("/login?next=%2Fchess", worker);
    expect(login.status).toBe(200);
    expect(await login.text()).toContain('action="/login"');
    const logout = await adminWorker.fetch( // /logout needs a session

      new Request("https://stats.example.com/logout", { method: "POST", redirect: "manual", headers: { "sec-fetch-site": "same-origin" } }),
      env,
    );
    expect(logout.status).toBe(303);
    expect(logout.headers.get("location")).toBe("/login");
    expect(requested).toEqual([]); // neither touched the bundle
  });

  it("shouldRedirectLegacyLinkedinGamesPath", async () => {
    const res = await get("/linkedin-games");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/games");
  });

  it.each(["/", "/overview", "/languages/DUOLINGO_ES?from=a&b=c", "/settings", "/next/chess", "/main-XYZ.js", "/missing-chunk.js"])(
    "shouldRedirectToLoginWithoutSession %s",
    async (path) => {
      requested.length = 0;
      const res = await get(path, worker);
      expect(res.status).toBe(303);
      expect(res.headers.get("location")).toBe(`/login?next=${encodeURIComponent(path)}`);
      expect(requested).toEqual([]); // nothing of the bundle leaks before login
    },
  );

  it("shouldKeepApiJsonWithoutSession", async () => {
    const res = await get("/api/unknown", worker);
    expect(res.status).toBe(401);
    expect(res.headers.get("content-type")).toContain("application/json");
  });

  it.each([["/main-XYZ.js", "text/javascript", "console.log(1)"], ["/styles-XYZ.css", "text/css", "body{}"]])(
    "shouldServeBundleFilesAtRootWhenSession %s",
    async (path, type, body) => {
      const res = await get(path);
      expect(res.status).toBe(200);
      expect(await res.text()).toBe(body);
      expect(res.headers.get("content-type")).toBe(type);
      expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    },
  );

  it("shouldRevalidateServiceWorkerOnEveryVisit", async () => {
    expect((await get("/sw.js")).headers.get("cache-control")).toBe("no-cache");
    expect((await get("/main-XYZ.js")).headers.get("cache-control")).toBeNull();
  });

  it.each(["/manifest.webmanifest", "/icons/icon-192.png", "/sw.js"])("shouldKeepPwaFilesBehindTheSession %s", async (path) => {
    expect((await get(path, worker)).status).toBe(303); // hence crossorigin="use-credentials" on the manifest link
  });

  it("shouldReturn404WhenAssetWithExtensionIsMissing", async () => {
    requested.length = 0;
    const res = await get("/missing-chunk.js");
    expect(res.status).toBe(404);
    expect(requested).toEqual(["/missing-chunk.js"]); // no SPA fallback for files
  });

  it.each(["/unknown", "/a/b/c", "/languages/X/extra"])("shouldReturnRealIndexForUnknownExtensionlessPathUnderAngularRoutes %s", async (path) => {
    // the client router sends unknown paths to /overview
    await expectAngularIndex(await get(path));
  });

  it.each(["/api/unknown", "/api/some/route/nobody/wrote"])("shouldKeepApiNotFoundAsJson %s", async (path) => {
    requested.length = 0;
    const res = await get(path);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ ok: false, error: "not found" });
    expect(requested).toEqual([]);
  });

  it("shouldRemoveRawRoute", async () => {
    // /raw has no server page any more: it is an unknown client route (SPA index; the client redirects it to /overview)
    await expectAngularIndex(await get("/raw"));
  });

  it("shouldPassAssetRedirectsThroughUnchanged", async () => {
    const res = await get("/media/index.html");
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("/media/");
  });

  it.each(["/", "/chess", "/login", "/raw", "/settings"])("shouldNeverServeTheLegacyInlineScriptCsp %s", async (path) => {
    const csp = (await get(path, path === "/login" ? worker : adminWorker)).headers.get("content-security-policy") ?? "";
    expect(csp).not.toContain("script-src 'unsafe-inline'");
  });
});
