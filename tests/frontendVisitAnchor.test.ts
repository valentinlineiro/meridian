import { describe, it, expect } from "vitest";
import { createDashboardRuntime, fetchOnly } from "./helpers/dom.ts";

const DAY = 864e5;
const iso = (msAgo: number) => new Date(Date.now() - msAgo).toISOString();
const flush = () => new Promise((r) => setTimeout(r, 25));

// A stateful fake of the two endpoints involved; records every request.
function setup(opts: { anchor?: string | null; getStatus?: number; putStatus?: number; shownUntil?: string } = {}) {
  // not "/changes": booting on that route would start a fetchWhatChanged of its own that interleaves with the one under test
  const rt = createDashboardRuntime("/overview");
  const server = { anchor: opts.anchor ?? null, puts: [] as string[], whatChanged: [] as { since: string; until: string }[], getStatus: opts.getStatus ?? 200, putStatus: opts.putStatus ?? 200 };
  rt.sandbox.fetch = fetchOnly(["/api/me/changes-anchor", "/api/what-changed"], async (url: string, init?: any) => {
    if (url.startsWith("/api/me/changes-anchor")) {
      if (init?.method === "PUT") {
        const t = JSON.parse(init.body).seenThrough as string;
        server.puts.push(t);
        if (server.putStatus !== 200) return { ok: false, status: server.putStatus, json: async () => ({}) };
        if (!server.anchor || t > server.anchor) server.anchor = t;
        return { ok: true, status: 200, json: async () => ({ ok: true, seenThrough: server.anchor }) };
      }
      return server.getStatus === 200
        ? { ok: true, status: 200, json: async () => ({ ok: true, seenThrough: server.anchor }) }
        : { ok: false, status: server.getStatus, json: async () => ({}) };
    }
    const u = new URL(url, "http://x");
    const since = u.searchParams.get("since")!, until = u.searchParams.get("until")!;
    server.whatChanged.push({ since, until });
    return {
      ok: true, status: 200,
      json: async () => ({
        interval: { since, until: opts.shownUntil ?? until }, baseline: { status: "exactOrPrevious", observedAt: since },
        chess: { gamesCount: 0, ratingDelta: null, baselineRating: null, currentRating: null, intervalWinRate: null, whiteWinRate: null, blackWinRate: null, historicalWinRateDelta: null },
        languages: { xpGained: 0, sessionsCount: 0, totalSessionMinutes: 0, baselineCourseId: null, currentCourseId: null, courseChanged: false },
        streak: { baselineStreak: null, currentStreak: null, streakDelta: null, status: "active", streakStarted: false, streakMilestone: null },
        findings: [], evaluations: [],
      }),
    };
  });
  return { rt, server, header: () => rt.getEl("#changesHeader").innerHTML as string };
}

describe("visit anchor in What Changed (P1 #8)", () => {
  it("shouldShowSevenDaysAndSaySoWhenThereIsNoAnchor", async () => {
    const { rt, server, header } = setup();
    await rt.sandbox.fetchWhatChanged();
    expect(header()).toContain("Sin visita registrada: mostrando los últimos 7 días");
    const since = new Date(server.whatChanged[0]!.since).getTime();
    expect(Math.abs(Date.now() - 7 * DAY - since)).toBeLessThan(60_000);
    expect(header()).toContain("Marcar como visto");
  });

  it("shouldAskForTheChangesSinceTheServerAnchor", async () => {
    const anchor = iso(3 * DAY);
    const { rt, server, header } = setup({ anchor });
    await rt.sandbox.fetchWhatChanged();
    expect(server.whatChanged[0]!.since).toBe(anchor);
    expect(header()).toContain("Desde tu última visita (");
    expect(header()).not.toContain("Sin visita registrada");
  });

  it("shouldNeverWriteTheAnchorWhenOnlyReadingOrSwitchingWindows", async () => {
    const { rt, server } = setup({ anchor: iso(3 * DAY) });
    await rt.sandbox.fetchWhatChanged();
    rt.sandbox.setChangesInterval(7); await flush();
    rt.sandbox.setChangesInterval(30); await flush();
    rt.sandbox.setChangesInterval(0); await flush();
    expect(server.puts).toEqual([]);
  });

  it("shouldMarkTheUntilOfTheWindowShownNotTheTimeOfTheClick", async () => {
    const shown = iso(2 * 60_000); // the response the user is looking at ends two minutes before the click
    const { rt, server } = setup({ anchor: iso(3 * DAY), shownUntil: shown });
    await rt.sandbox.fetchWhatChanged();
    await rt.sandbox.markChangesAsSeen();
    expect(server.puts).toEqual([shown]);
    expect(server.anchor).toBe(shown);
  });

  it("shouldReloadFromTheNewAnchorAfterMarking", async () => {
    const shown = iso(60_000);
    const { rt, server, header } = setup({ anchor: iso(3 * DAY), shownUntil: shown });
    await rt.sandbox.fetchWhatChanged();
    await rt.sandbox.markChangesAsSeen();
    expect(server.whatChanged.at(-1)!.since).toBe(shown);
    expect(header()).toContain("Desde tu última visita (");
  });

  it("shouldOfferMarkingOnlyWhenTheWindowCoversEverythingNotYetSeen", async () => {
    const { rt, header } = setup({ anchor: iso(10 * DAY) });
    await rt.sandbox.fetchWhatChanged();
    expect(header()).toContain("Marcar como visto");
    await rt.sandbox.fetchWhatChanged(iso(7 * DAY)); // starts after the anchor: 3 unseen days fall outside it
    expect(header()).not.toContain("btnMarkSeen");
    expect(header()).toContain("esta ventana no cubre todo lo que no has visto");
    await rt.sandbox.fetchWhatChanged(iso(30 * DAY)); // starts before the anchor: covers it all
    expect(header()).toContain("btnMarkSeen");
  });

  it("shouldNotOfferMarkingInAFixedWindowWhenThereIsNoAnchor", async () => {
    const { rt, header } = setup();
    await rt.sandbox.fetchWhatChanged(iso(7 * DAY));
    expect(header()).not.toContain("btnMarkSeen");
  });

  it("shouldSayItWhenTheAnchorCannotBeRead", async () => {
    const { rt, header } = setup({ getStatus: 404 });
    await rt.sandbox.fetchWhatChanged();
    expect(header()).toContain("No se pudo leer tu última visita");
  });

  it("shouldShowAFailureAndKeepTheAnchorWhenSavingFails", async () => {
    const { rt, server } = setup({ anchor: iso(3 * DAY), putStatus: 500 });
    await rt.sandbox.fetchWhatChanged();
    await rt.sandbox.markChangesAsSeen();
    expect(server.anchor).not.toBeNull();
    expect(rt.getEl("#btnMarkSeen").textContent).toBe("No se pudo guardar; reintenta");
  });

  describe("one-time migration of the old browser value", () => {
    it("shouldUploadTheLocalValueOnceWhenTheServerHasNoAnchorAndDropTheKey", async () => {
      const legacy = iso(4 * DAY);
      const { rt, server } = setup();
      rt.sandbox.localStorage.setItem("lastVisitedAt", legacy);
      await rt.sandbox.fetchWhatChanged();
      expect(server.puts).toEqual([legacy]);
      expect(rt.sandbox.localStorage.getItem("lastVisitedAt")).toBeNull();
      expect(server.whatChanged[0]!.since).toBe(legacy);
    });

    it("shouldIgnoreTheLocalValueAndDropTheKeyWhenTheServerAlreadyHasAnAnchor", async () => {
      const anchor = iso(1 * DAY);
      const { rt, server } = setup({ anchor });
      rt.sandbox.localStorage.setItem("lastVisitedAt", iso(9 * DAY));
      await rt.sandbox.fetchWhatChanged();
      expect(server.puts).toEqual([]);
      expect(rt.sandbox.localStorage.getItem("lastVisitedAt")).toBeNull();
      expect(server.whatChanged[0]!.since).toBe(anchor);
    });

    it("shouldKeepTheLocalValueWhenTheUploadFailsForAnotherReasonThanTheValue", async () => {
      const { rt } = setup({ putStatus: 500 });
      rt.sandbox.localStorage.setItem("lastVisitedAt", iso(4 * DAY));
      await rt.sandbox.fetchWhatChanged();
      expect(rt.sandbox.localStorage.getItem("lastVisitedAt")).not.toBeNull();
    });

    it("shouldDropAnInvalidLocalValueWhenTheServerRejectsIt", async () => {
      const { rt } = setup({ putStatus: 400 });
      rt.sandbox.localStorage.setItem("lastVisitedAt", "garbage");
      await rt.sandbox.fetchWhatChanged();
      expect(rt.sandbox.localStorage.getItem("lastVisitedAt")).toBeNull();
    });

    it("shouldNotTouchTheLocalValueWhenTheServerCannotBeRead", async () => {
      const { rt, server } = setup({ getStatus: 500 });
      rt.sandbox.localStorage.setItem("lastVisitedAt", iso(4 * DAY));
      await rt.sandbox.fetchWhatChanged();
      expect(server.puts).toEqual([]);
      expect(rt.sandbox.localStorage.getItem("lastVisitedAt")).not.toBeNull();
    });
  });
});

describe("script order", () => {
  // initTab() opens the What Changed tab on load and runs fetchWhatChanged before later top-level code: a `let` declared after that
  // call is still in its temporal dead zone ("Cannot access 'changesShownUntil' before initialization") and the tab stays blank.
  it("shouldDeclareTheAnchorStateBeforeTheTabIsInitialised", async () => {
    const { DASHBOARD_HTML } = await import("../src/frontend.ts");
    const script = DASHBOARD_HTML.slice(DASHBOARD_HTML.indexOf("<script>"));
    const boot = script.indexOf("\ninitTab();");
    expect(boot).toBeGreaterThan(0);
    for (const name of ["changesAnchor", "changesShownUntil", "activeChangesInterval"]) {
      const decl = script.search(new RegExp("\\blet\\b[^;\\n]*\\b" + name + "\\b"));
      expect(decl, name).toBeGreaterThan(-1);
      expect(decl, name + " declared after initTab()").toBeLessThan(boot);
    }
  });
});
