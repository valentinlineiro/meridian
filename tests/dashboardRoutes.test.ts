import { describe, it, expect } from "vitest";
import worker from "./helpers/adminWorker.ts";
import type { Env } from "../src/types.ts";

describe("Dashboard deep-link routes", () => {
  it.each(["/trajectory", "/changes"])("shouldServeDashboardWhenRequestingTabPath %s", async (path) => {
    const res = await worker.fetch(new Request("http://localhost" + path), { DB: { prepare: () => null } } as unknown as Env);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
  });

  it("shouldOfferALogoutFormPostingToLogout", async () => {
    const html = await (await worker.fetch(new Request("http://localhost/"), { DB: { prepare: () => null } } as unknown as Env)).text();
    expect(html).toContain('<form method="post" action="/logout"');
  });
});

describe("HTML security headers", () => {
  it.each(["/", "/chess", "/raw"])("shouldSendCspAndAntiFramingHeadersWhenServing %s", async (path) => {
    const res = await worker.fetch(new Request("http://localhost" + path), { DB: { prepare: () => null } } as unknown as Env);
    const csp = res.headers.get("content-security-policy") ?? "";
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("connect-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).not.toMatch(/https?:|\*/); // nothing may load from, or send to, another origin
    expect(res.headers.get("x-frame-options")).toBe("DENY");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("cache-control")).toBe("no-store");
  });
});
