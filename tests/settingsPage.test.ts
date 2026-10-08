import { describe, it, expect } from "vitest";
import { createDashboardRuntime } from "./helpers/dom.ts";
import { SETTINGS_HTML } from "../src/settingsPage.ts";
import { DASHBOARD_HTML } from "../src/frontend.ts";

const reply = (body: unknown, ok = true, status = 200) => ({ ok, status, json: async () => body });

function setup(respond: (url: string, init?: RequestInit) => ReturnType<typeof reply>) {
  const rt = createDashboardRuntime("/settings", SETTINGS_HTML);
  const calls: { url: string; init?: RequestInit }[] = [];
  rt.sandbox.console = { error() {}, log() {} };
  rt.sandbox.fetch = async (url: string, init?: RequestInit) => { calls.push({ url, init }); return respond(url, init); };
  rt.sandbox.window.fetch = rt.sandbox.fetch;
  const puts = () => calls.filter((c) => c.init?.method === "PUT");
  return { rt, calls, puts, input: rt.getEl("#goalInput"), status: rt.getEl("#goalStatus") };
}

describe("settings page: daily goal", () => {
  it("shouldShowTheStoredGoalWhenThePageLoads", async () => {
    const { rt, input } = setup(() => reply({ ok: true, dailyGoalXp: 80 }));
    await rt.sandbox.loadSettings();
    expect(input.value).toBe("80");
  });

  it("shouldLeaveTheFieldEmptyWhenNoGoalIsConfigured", async () => {
    const { rt, input } = setup(() => reply({ ok: true, dailyGoalXp: null }));
    await rt.sandbox.loadSettings();
    expect(input.value).toBe("");
  });

  it("shouldPutTheGoalAndReportSavedWhenValid", async () => {
    const { rt, puts, input, status } = setup(() => reply({ ok: true, dailyGoalXp: 80 }));
    input.value = " 80 ";
    await rt.sandbox.saveDailyGoal();
    expect(puts()).toHaveLength(1);
    expect(puts()[0]!.url).toBe("/api/me/settings");
    expect(JSON.parse(String(puts()[0]!.init?.body))).toEqual({ dailyGoalXp: 80 });
    expect(status.textContent).toBe("Guardado.");
  });

  it("shouldSendNullWhenTheFieldIsEmptied", async () => {
    const { rt, puts, input, status } = setup(() => reply({ ok: true, dailyGoalXp: null }));
    input.value = "";
    await rt.sandbox.saveDailyGoal();
    expect(JSON.parse(String(puts()[0]!.init?.body))).toEqual({ dailyGoalXp: null });
    expect(status.textContent).toBe("Objetivo eliminado.");
  });

  it.each([["0"], ["-3"], ["2.5"], ["abc"], ["10001"]])("shouldNotCallTheApiForInvalidInput %s", async (raw) => {
    const { rt, puts, input, status } = setup(() => reply({ ok: true }));
    input.value = raw;
    await rt.sandbox.saveDailyGoal();
    expect(puts()).toHaveLength(0);
    expect(status.textContent).toMatch(/entero entre 1 y 10000/);
  });

  it("shouldShowTheServerErrorWhenTheSaveIsRefused", async () => {
    const { rt, input, status } = setup(() => reply({ ok: false, error: "unauthorized" }, false, 401));
    input.value = "60";
    await rt.sandbox.saveDailyGoal();
    expect(status.textContent).toBe("No se pudo guardar: unauthorized");
  });
});

describe("where the goal is edited", () => {
  it("shouldLinkTheDashboardHeaderToTheSettingsPage", () => {
    expect(DASHBOARD_HTML).toContain('href="/settings"');
  });

  it("shouldNotOfferTheGoalControlOnTheDashboard", () => {
    expect(DASHBOARD_HTML).not.toContain("langGoalInput");
    expect(DASHBOARD_HTML).not.toContain("saveDailyGoal");
  });

  it("shouldKeepTheReadOnlyGoalSummaryWithALinkToSettingsOnTheDashboard", () => {
    expect(DASHBOARD_HTML).toContain('id="langGoalToday"');
    expect(DASHBOARD_HTML).toMatch(/id="langGoalRow"[\s\S]*href="\/settings"/);
  });
});
