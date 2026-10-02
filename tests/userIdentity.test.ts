import { describe, it, expect } from "vitest";
import { syntheticSnapshot } from "../demo/syntheticCourse.ts";
import { normalizeEmail } from "../src/domain/user.ts";
import { resolveProviderUserId } from "../src/db/users.ts";
import { handleMeStats } from "../src/api/me.ts";
import { handleLangStats } from "../src/api/stats.ts";
describe("normalizeEmail", () => {
  it("shouldNormalizeEmailWhenCasedAndSpaced", () => {
    expect(normalizeEmail("  Valen@Example.COM ")).toBe("valen@example.com");
  });
});
describe("resolveProviderUserId", () => {
  it("shouldResolveProviderUserIdWhenEmailLinked", async () => {
    const db = {
      prepare: (sql: string) => ({
        bind: (...args: any[]) => ({
          first: async () => {
            // Access identity (cloudflare_access/valen@example.com) → User → provider account (duolingo/1000001)
            if (sql.includes("user_identities") && args[0] === "valen@example.com" && args[1] === "duolingo") return { provider_user_id: "1000001" };
            return null;
          },
        }),
      }),
    } as any;
    expect(await resolveProviderUserId(db, " Valen@Example.COM ", "duolingo")).toBe("1000001");
  });
  it("shouldReturnNullWhenIdentityNotLinked", async () => {
    const db = { prepare: () => ({ bind: () => ({ first: async () => null }) }) } as any;
    expect(await resolveProviderUserId(db, "unknown@example.com", "duolingo")).toBeNull();
  });
});
describe("GET /api/me/stats/lang", () => {
  it("shouldReturnSameHistoryAsLegacyWhenAuthenticated", async () => {
    const stubDb = { prepare: () => ({ bind() { return this; }, all: async () => ({ results: [{ raw_json: JSON.stringify({ user:{totalXp:100}, courses:[], xp_summaries:[], currentCourse:null }), created_at:"2026-09-24T00:00:00Z" }] }), first: async () => ({ provider_user_id:"1000001" }) }) } as any;
    const res = await handleMeStats(stubDb, new URL("http://x/api/me/stats/lang"), "valen@example.com");
    const body:any = await res.json();
    expect(body.courseProgressHistory).toBeDefined();
  });
  it("shouldMatchLegacyCourseProgressHistoryWhenSameProviderUserId", async () => {
    const snap = syntheticSnapshot();
    const stubDbFor = (providerUserId: string) => ({
      prepare: (sql: string) => ({
        bind(...args:any[]) {
          return {
            all: async () => ({ results: [{ raw_json: JSON.stringify(snap), created_at:"2026-09-24T00:00:00Z" }] }),
            first: async () => ({ provider_user_id: providerUserId })
          };
        }
      })
    }) as any;
    const legacy = await (await handleLangStats(stubDbFor("1000001"), new URL("http://x/api/stats/lang?userId=1000001"))).json() as any;
    const me = await (await handleMeStats(stubDbFor("1000001"), new URL("http://x/api/me/stats/lang"), "valen@example.com")).json() as any;
    expect(me.courseProgressHistory).toEqual(legacy.courseProgressHistory);
  });
});
