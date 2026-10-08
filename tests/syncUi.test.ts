import { describe, it, expect } from "vitest";
import { createDashboardRuntime } from "./helpers/dom.ts";

// The Sync now button as a small state machine, driven against the real dashboard script with scripted responses.
type Reply = { ok?: boolean; status?: number; body: unknown };
const reply = ({ ok = true, status = 200, body }: Reply) => ({ ok, status, json: async () => body });

function setup(script: (url: string, init?: RequestInit) => Reply, storedRun?: number) {
  const rt = createDashboardRuntime("/");
  const btn = rt.getEl("#syncBtn");
  const note = rt.getEl("#syncNote");
  const calls: string[] = [];
  const states: string[] = [];
  const texts: string[] = []; // every label the button ever showed
  let label = btn.textContent;
  Object.defineProperty(btn, "textContent", { get: () => label, set: (v: string) => { label = v; texts.push(v); }, configurable: true });
  let clock = 1_000_000;
  const advance = (ms: number) => { clock += ms; };
  class FakeDate extends Date { static override now() { return clock; } }
  rt.sandbox.Date = FakeDate;
  rt.sandbox.console = { error() {}, log() {} };
  rt.sandbox.location.reload = () => {};
  rt.sandbox.setTimeout = (fn: () => void, ms: number) => { advance(ms); Promise.resolve().then(fn); return 0; };
  rt.sandbox.fetch = async (url: string, init?: RequestInit) => {
    calls.push(`${init?.method ?? "GET"} ${url}`);
    states.push(`${btn.textContent}|${(btn as any).disabled ? "disabled" : "enabled"}|${note.textContent}`);
    return reply(script(url, init));
  };
  rt.sandbox.window.fetch = rt.sandbox.fetch;
  rt.sandbox.localStorage.clear();
  if (storedRun) rt.sandbox.localStorage.setItem("meridian.syncRun", String(storedRun));
  const stored = () => rt.sandbox.localStorage.getItem("meridian.syncRun");
  return { rt, btn, note, calls, states, texts, stored };
}

describe("sync now button", () => {
  it("shouldWalkStartingQueuedRunningThenSucceed", async () => {
    const seq = ["queued", "in_progress", "completed"];
    const { rt, btn, note, states, texts, stored } = setup((url, init) =>
      init?.method === "POST" ? { body: { ok: true, runId: 7 } }
        : url.includes("/api/me/sync/status") ? { body: { status: seq.shift(), conclusion: "success", runId: 7 } }
        : { body: {} });
    await rt.sandbox.doSync();
    expect(states[0]).toMatch(/^Iniciando…\|disabled/); // disabled the moment it is pressed
    expect(states.some((s) => s.startsWith("En cola…|disabled"))).toBe(true);
    expect(states.some((s) => s.startsWith("Sincronizando…|disabled|El collector está en marcha"))).toBe(true);
    expect(texts).toEqual(["Iniciando…", "En cola…", "Sincronizando…", "✓ Sincronizado"]); // the page reloads right after
    expect(btn.textContent).toBe("✓ Sincronizado");
    expect((btn as any).disabled).toBe(false);
    expect(note.textContent).toBe("Sincronización completada.");
    expect(stored()).toBeNull();
  });

  it("shouldReloadThePageWhenTheSyncSucceedsSoNewMatchesShowUp", async () => {
    let reloads = 0;
    const { rt } = setup((url, init) =>
      init?.method === "POST" ? { body: { ok: true, runId: 7 } } : { body: { status: "completed", conclusion: "success", runId: 7 } });
    rt.sandbox.location.reload = () => { reloads++; };
    await rt.sandbox.doSync();
    expect(reloads).toBe(1);
  });

  it("shouldNotReloadThePageWhenTheSyncFails", async () => {
    let reloads = 0;
    const { rt } = setup((url, init) =>
      init?.method === "POST" ? { body: { ok: true, runId: 7 } } : { body: { status: "completed", conclusion: "failure", runId: 7 } });
    rt.sandbox.location.reload = () => { reloads++; };
    await rt.sandbox.doSync();
    expect(reloads).toBe(0);
  });

  it("shouldStoreTheRunIdAsSoonAsTheSyncStarts", async () => {
    const seen: (string | null)[] = [];
    const { rt } = setup((url, init) => {
      if (url.startsWith("/api/me/sync/status")) seen.push(rt.sandbox.localStorage.getItem("meridian.syncRun"));
      return init?.method === "POST" ? { body: { ok: true, runId: 7 } } : { body: { status: "completed", conclusion: "success" } };
    });
    await rt.sandbox.doSync();
    expect(seen[0]).toBe("7");
  });

  it("shouldResumeAnInProgressRunAfterAReload", async () => {
    const { rt, calls, texts } = setup(() => ({ body: { status: "completed", conclusion: "success", runId: 12 } }), 12);
    rt.sandbox.resumeSync();
    await new Promise((r) => globalThis.setTimeout(r, 20));
    expect(calls[0]).toBe("GET /api/me/sync/status?runId=12");
    expect(texts).toContain("✓ Sincronizado");
  });

  it("shouldDoNothingOnLoadWhenNoRunIsStored", () => {
    const { rt, calls } = setup(() => ({ body: {} }));
    rt.sandbox.resumeSync();
    expect(calls).toEqual([]);
  });

  it("shouldFollowTheRunThatIsAlreadyActiveWhenTheServerAnswers409", async () => {
    const { rt, calls, stored } = setup((url, init) =>
      init?.method === "POST" ? { ok: false, status: 409, body: { ok: false, code: "SYNC_IN_PROGRESS", runId: 99 } }
        : { body: { status: "completed", conclusion: "success", runId: 99 } });
    await rt.sandbox.doSync();
    expect(calls).toContain("GET /api/me/sync/status?runId=99");
    expect(stored()).toBeNull(); // finished
  });

  it("shouldShowAGenericFailureAndAllowRetryWhenTheRunFails", async () => {
    const { rt, btn, note, stored } = setup((url, init) =>
      init?.method === "POST" ? { body: { ok: true, runId: 7 } } : { body: { status: "completed", conclusion: "failure" } });
    await rt.sandbox.doSync();
    expect(btn.textContent).toBe("Sincronizar");
    expect((btn as any).disabled).toBe(false);
    expect(note.textContent).toBe("Sincronización fallida. Inténtalo de nuevo.");
    expect(stored()).toBeNull();
  });

  it("shouldNeverShowInternalErrorDetailsWhenTheServerRejectsTheRequest", async () => {
    const { rt, note } = setup(() => ({ ok: false, status: 500, body: { ok: false, error: "GITHUB_ACTIONS_TOKEN not set" } }));
    await rt.sandbox.doSync();
    expect(note.textContent).toBe("Sincronización fallida. Inténtalo de nuevo.");
    expect(note.textContent).not.toMatch(/TOKEN|GITHUB/i);
  });

  it("shouldNotTreatALongRunAsAFailure", async () => {
    let polls = 0;
    const { rt, states } = setup((url, init) => {
      if (init?.method === "POST") return { body: { ok: true, runId: 7 } };
      return { body: { status: ++polls < 30 ? "in_progress" : "completed", conclusion: "success" } };
    });
    await rt.sandbox.doSync();
    expect(states.some((s) => s.includes("Sigue en marcha. Puedes salir de esta página; la sincronización continuará."))).toBe(true);
    expect(states.some((s) => /fallida/.test(s))).toBe(false);
  });
});
