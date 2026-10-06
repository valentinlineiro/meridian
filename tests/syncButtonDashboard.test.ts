import { describe, it, expect } from "vitest";
import { DASHBOARD_HTML } from "../src/frontend.ts";

describe("dashboard sync button", () => {
  it("shouldShowASyncButtonInTheHeaderNextToLogout", () => {
    const header = DASHBOARD_HTML.match(/<header>([\s\S]*?)<\/header>/)?.[1] ?? "";
    expect(header).toMatch(/<button id="syncBtn"[^>]*onclick="doSync\(\)"[^>]*>Sincronizar<\/button>/);
    expect(header.indexOf("syncBtn")).toBeLessThan(header.indexOf('action="/logout"'));
  });

  it("shouldDispatchThenPollTheRunAndRefreshTheDashboards", () => {
    const body = DASHBOARD_HTML.match(/async function doSync\(\)\{([\s\S]*?)\n\}/)?.[1] ?? "";
    expect(body).toMatch(/fetch\('\/api\/me\/sync',\{method:'POST'\}\)/);
    expect(body).toMatch(/\/api\/me\/sync\/status\?runId=/);
    for (const refresh of ["loadChessDashboard", "loadLanguagesDashboard", "loadOverviewDashboard"]) expect(body).toContain(refresh);
    expect(body).toMatch(/Sin cambios/);
  });
});
