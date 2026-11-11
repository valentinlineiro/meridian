import { afterEach, describe, expect, it, vi } from "vitest";
import { onFailure } from "../src/api/router.ts";
import { logInternalError, mapError } from "../src/api/errors.ts";
import { NotFoundError } from "../src/application/errors.ts";

// An internal 500 used to leave no trace (the exception was mapped and dropped), so a burst of 500s could not be diagnosed.
const logged = () => (console.error as unknown as ReturnType<typeof vi.fn>).mock.calls.map((c) => JSON.parse(String(c[0])));

describe("internal errors leave a trace", () => {
  afterEach(() => vi.restoreAllMocks());

  it("shouldLogNameAndMessageButKeepTheResponseOpaqueWhenAnUnmappedErrorEscapes", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = onFailure(new Error("D1_ERROR: database is overloaded"));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ ok: false, error: "internal error" });
    expect(logged()).toEqual([{ event: "internal_error", name: "Error", message: "D1_ERROR: database is overloaded" }]);
  });

  it("shouldLogWhenMapErrorFallsThroughToA500", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(mapError({ json: (b: unknown, s: number) => new Response(JSON.stringify(b), { status: s }) } as never, new TypeError("boom")).status).toBe(500);
    expect(logged()).toEqual([{ event: "internal_error", name: "TypeError", message: "boom" }]);
  });

  it("shouldNotLogAMappedDomainErrorBecauseItIsNotAFault", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(onFailure(new NotFoundError("missing")).status).toBe(404);
    expect(console.error).not.toHaveBeenCalled();
  });

  it("shouldTruncateALongMessageAndSurviveAThrownNonError", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    logInternalError(new Error("x".repeat(1000)));
    logInternalError("plain string");
    const [a, b] = logged();
    expect(a.message).toHaveLength(300);
    expect(b).toEqual({ event: "internal_error", name: "string", message: "plain string" });
  });
});
