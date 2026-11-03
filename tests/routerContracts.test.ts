import { describe, it, expect } from "vitest";
import worker from "./helpers/adminWorker.ts";
import type { Env } from "../src/types.ts";

const env = { DB: { prepare: () => null } } as unknown as Env;

describe("router contracts", () => {
  it("shouldReturn404NotFoundWhenRouteIsUnknown", async () => {
    const res = await worker.fetch(new Request("http://localhost/api/does-not-exist"), env);
    expect(res.status).toBe(404);
    const body = (await res.json()) as any;
    expect(body).toEqual({ ok: false, error: "not found" });
  });

  it.each(["https://app.example", "https://evil.example", "null"])("shouldNeverEmitCorsHeadersForOrigin %s", async (origin) => {
    const res = await worker.fetch(new Request("http://localhost/api/does-not-exist", { headers: { origin } }), env);
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("shouldRefusePreflightsSoBrowsersBlockCrossOriginCalls", async () => {
    const res = await worker.fetch(
      new Request("http://localhost/api/import", { method: "OPTIONS", headers: { origin: "https://app.example" } }),
      env
    );
    expect(res.status).toBe(401);
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("shouldMarkApiResponsesNoStoreAndNoSniffEvenWhenUnauthorized", async () => {
    for (const path of ["/api/does-not-exist", "/api/import"]) {
      const res = await worker.fetch(new Request(`http://localhost${path}`, { method: path === "/api/import" ? "POST" : "GET" }), env);
      expect(res.headers.get("cache-control")).toBe("no-store");
      expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    }
  });

  it("shouldReturn500InternalErrorWhenEnvIsInvalid", async () => {
    const res = await worker.fetch(new Request("http://localhost/"), {
      DB: {},
    } as unknown as Env);
    expect(res.status).toBe(500);
    const body = (await res.json()) as any;
    expect(body).toEqual({ ok: false, error: "internal error" });
  });
});
