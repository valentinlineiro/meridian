import { describe, it, expect } from "vitest";
import { createDashboardRuntime } from "./helpers/dom.ts";

// The daily goal control and the colours it drives, run against the real dashboard script.
const reply = (body: unknown, ok = true, status = 200) => ({ ok, status, json: async () => body });

function setup(respond: (url: string, init?: RequestInit) => ReturnType<typeof reply>) {
  const rt = createDashboardRuntime("/");
  const calls: { url: string; init?: RequestInit }[] = [];
  rt.sandbox.console = { error() {}, log() {} };
  rt.sandbox.fetch = async (url: string, init?: RequestInit) => { calls.push({ url, init }); return respond(url, init); };
  rt.sandbox.window.fetch = rt.sandbox.fetch;
  return { rt, calls, input: rt.getEl("#langGoalInput"), status: rt.getEl("#langGoalStatus") };
}

describe("goalColor", () => {
  const { rt } = setup(() => reply({}));
  const color = (xp: number, goal: number | null) => rt.sandbox.goalColor(xp, goal);

  it("shouldNotUseFixedXpThresholdsWhenNoGoalIsSet", () => {
    expect(color(0, null)).toBe("#1e2e44");
    expect(color(1, null)).toBe(color(99, null));
    expect(color(99, null)).toBe(color(100, null));
    expect(color(100, null)).toBe(color(500, null));
    expect(color(5000, null)).toBe(color(1, null));
  });

  it("shouldMarkTheDayAsMetOnlyWhenXpReachesTheGoal", () => {
    expect(color(49, 50)).not.toBe(color(50, 50));
    expect(color(50, 50)).toBe("#2ea043");
    expect(color(500, 50)).toBe("#2ea043");
    expect(color(49, 50)).toBe("#58a6ff");
    expect(color(0, 50)).toBe("#1e2e44");
  });

  it("shouldMoveTheThresholdWhenTheGoalChanges", () => {
    expect(color(100, 100)).toBe("#2ea043");
    expect(color(100, 200)).toBe("#58a6ff");
  });
});
