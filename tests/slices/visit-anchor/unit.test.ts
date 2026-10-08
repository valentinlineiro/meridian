import { describe, it, expect, beforeEach } from "vitest";
import { AdvanceSeenThrough } from "../../../src/slices/visit-anchor/application/AdvanceSeenThrough.ts";
import { GetSeenThrough } from "../../../src/slices/visit-anchor/application/GetSeenThrough.ts";
import { CLOCK_SKEW_MS, InvalidSeenThrough, SeenThrough } from "../../../src/slices/visit-anchor/domain/SeenThrough.ts";
import { NotFoundError } from "../../../src/application/errors.ts";
import { InMemorySeenThroughRepository, providerAccounts } from "./fakes.ts";

const OWNER = "owner@example.com";
const NOW = new Date("2026-10-08T12:00:00.000Z");
let seen: InMemorySeenThroughRepository;
let advance: AdvanceSeenThrough;
let get: GetSeenThrough;

beforeEach(() => {
  seen = new InMemorySeenThroughRepository();
  const accounts = providerAccounts({ [OWNER]: "2000001" });
  advance = new AdvanceSeenThrough(accounts, seen, () => NOW);
  get = new GetSeenThrough(accounts, seen);
});

describe("SeenThrough", () => {
  it("shouldNormaliseToUtcIsoWhenTheInstantHasAnOffset", () => {
    expect(SeenThrough.of("2026-10-08T13:30:00+02:00", NOW).iso).toBe("2026-10-08T11:30:00.000Z");
  });

  it.each([["not a date"], ["2026-10-08"], [""], [123], [null], [undefined], ["2026-13-45T00:00:00Z"]])("shouldRejectTheInstantWhenItIs %s", (value) => {
    expect(() => SeenThrough.of(value, NOW)).toThrow(InvalidSeenThrough);
  });

  it("shouldAcceptAnInstantWithinTheClockSkewAndRejectOneBeyondIt", () => {
    expect(() => SeenThrough.of(new Date(NOW.getTime() + CLOCK_SKEW_MS).toISOString(), NOW)).not.toThrow();
    expect(() => SeenThrough.of(new Date(NOW.getTime() + CLOCK_SKEW_MS + 1000).toISOString(), NOW)).toThrow(InvalidSeenThrough);
  });
});

describe("GetSeenThrough", () => {
  it("shouldReturnNullWhenNothingWasEverMarked", async () => {
    expect(await get.execute({ ownerEmail: OWNER })).toBeNull();
  });

  it("shouldNotWriteWhenReading", async () => {
    await get.execute({ ownerEmail: OWNER });
    expect(seen.writes).toBe(0);
    expect(seen.values.size).toBe(0);
  });

  it("shouldFailWithNotFoundWhenTheOwnerHasNoProviderAccount", async () => {
    await expect(get.execute({ ownerEmail: "stranger@example.com" })).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("AdvanceSeenThrough", () => {
  it("shouldStoreTheInstantWhenNothingWasMarked", async () => {
    expect(await advance.execute({ ownerEmail: OWNER, seenThrough: "2026-10-05T10:00:00Z" })).toBe("2026-10-05T10:00:00.000Z");
    expect(await get.execute({ ownerEmail: OWNER })).toBe("2026-10-05T10:00:00.000Z");
  });

  it("shouldAdvanceWhenTheInstantIsLater", async () => {
    await advance.execute({ ownerEmail: OWNER, seenThrough: "2026-10-05T10:00:00Z" });
    expect(await advance.execute({ ownerEmail: OWNER, seenThrough: "2026-10-07T10:00:00Z" })).toBe("2026-10-07T10:00:00.000Z");
  });

  it("shouldKeepTheStoredInstantAndNotWriteWhenTheInstantIsOlder", async () => {
    await advance.execute({ ownerEmail: OWNER, seenThrough: "2026-10-07T10:00:00Z" });
    const writes = seen.writes;
    expect(await advance.execute({ ownerEmail: OWNER, seenThrough: "2026-10-01T10:00:00Z" })).toBe("2026-10-07T10:00:00.000Z");
    expect(seen.writes).toBe(writes);
  });

  it("shouldBeIdempotentWhenTheSameInstantIsSentAgain", async () => {
    await advance.execute({ ownerEmail: OWNER, seenThrough: "2026-10-07T10:00:00Z" });
    const writes = seen.writes;
    expect(await advance.execute({ ownerEmail: OWNER, seenThrough: "2026-10-07T10:00:00Z" })).toBe("2026-10-07T10:00:00.000Z");
    expect(seen.writes).toBe(writes);
  });

  it("shouldKeepThePreviousInstantWhenTheNewOneIsInTheFuture", async () => {
    await advance.execute({ ownerEmail: OWNER, seenThrough: "2026-10-07T10:00:00Z" });
    await expect(advance.execute({ ownerEmail: OWNER, seenThrough: "2027-01-01T00:00:00Z" })).rejects.toBeInstanceOf(InvalidSeenThrough);
    expect(await get.execute({ ownerEmail: OWNER })).toBe("2026-10-07T10:00:00.000Z");
  });

  it("shouldFailWithNotFoundWhenTheOwnerHasNoProviderAccount", async () => {
    await expect(advance.execute({ ownerEmail: "stranger@example.com", seenThrough: "2026-10-07T10:00:00Z" })).rejects.toBeInstanceOf(NotFoundError);
  });
});
