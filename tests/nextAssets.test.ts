import { describe, it, expect } from "vitest";
import worker from "../src/index.ts";
import adminWorker from "./helpers/adminWorker.ts";
import type { Env } from "../src/types.ts";

// Workers Assets serves web/dist/browser at its root and answers "/" with index.html (html_handling default).
const FILES: Record<string, [string, string]> = {
  "/": ['<!doctype html><base href="/next/"><app-root></app-root>', "text/html"],
  "/main-ABC123.js": ["console.log(1)", "text/javascript"],
};
const requested: string[] = [];
const ASSETS = {
  fetch: async (req: Request) => {
    const path = new URL(req.url).pathname;
    requested.push(path);
    if (path === "/index.html") return new Response(null, { status: 307, headers: { location: "/" } }); // html_handling, as in Miniflare
    const file = FILES[path];
    return file ? new Response(file[0], { headers: { "content-type": file[1] } }) : new Response("nope", { status: 404 });
  },
};
const env = { DB: { prepare: () => null }, ASSETS } as unknown as Env;
const get = (path: string, w: { fetch: (r: Request, e: Env) => Response | Promise<Response> } = adminWorker) =>
  w.fetch(new Request("https://stats.example.com" + path, { redirect: "manual" }), env);

describe("Angular frontend under /next", () => {
  it.each(["/next", "/next/", "/next/languages/X"])("shouldRedirectToLoginWhenNextRequestedWithoutSession %s", async (path) => {
    const res = await get(path, worker);
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe(`/login?next=${encodeURIComponent(path)}`);
  });

  it.each(["/next", "/next/", "/next/languages/X"])("shouldServeIndexWhenDeepLinkUnderNextHasSession %s", async (path) => {
    const res = await get(path);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("<app-root>");
    expect(res.headers.get("content-type")).toContain("text/html");
    const csp = res.headers.get("content-security-policy") ?? "";
    expect(csp).toContain("script-src 'self'");
    expect(csp).toBe(
      "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; form-action 'self'; base-uri 'self'; frame-ancestors 'none'",
    );
    expect(res.headers.get("x-frame-options")).toBe("DENY");
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("shouldServeBundleWithItsContentTypeWhenFileExists", async () => {
    const res = await get("/next/main-ABC123.js");
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("console.log(1)");
    expect(res.headers.get("content-type")).toBe("text/javascript");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("shouldReturn404WhenAssetWithExtensionIsMissing", async () => {
    requested.length = 0;
    const res = await get("/next/missing-chunk.js");
    expect(res.status).toBe(404);
    expect(requested).toEqual(["/missing-chunk.js"]); // no SPA fallback for files
  });

  it("shouldKeepTheRedirectUnderNextWhenAssetsRedirect", async () => {
    const res = await get("/next/index.html");
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("/next/");
  });

  it("shouldKeepLegacyDashboardAtRoot", async () => {
    const res = await get("/");
    expect(res.status).toBe(200);
    const csp = res.headers.get("content-security-policy") ?? "";
    expect(csp).toContain("script-src 'unsafe-inline'");
    expect(csp).not.toContain("script-src 'self'");
  });
});
