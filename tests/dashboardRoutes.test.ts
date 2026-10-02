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
