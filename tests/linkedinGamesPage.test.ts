import { describe, it, expect } from "vitest";
import { createDashboardRuntime } from "./helpers/dom.ts";
import { LINKEDIN_GAMES_HTML } from "../src/linkedinGamesPage.ts";

const reply = (body: unknown, ok = true, status = 200) => ({ ok, status, json: async () => body });

function setup(respond: (url: string, init?: RequestInit) => ReturnType<typeof reply>) {
  const rt = createDashboardRuntime("/linkedin-games", LINKEDIN_GAMES_HTML);
  const calls: { url: string; init?: RequestInit }[] = [];
  rt.sandbox.fetch = async (url: string, init?: RequestInit) => { calls.push({ url, init }); return respond(url, init); };
  rt.sandbox.window.fetch = rt.sandbox.fetch;
  const puts = () => calls.filter((c) => c.init?.method === "PUT");
  return { rt, calls, puts, status: rt.getEl("#status") };
}

describe("linkedin games page", () => {
  it("shouldPutTheResultWithTheChosenDateGameAndTimesWhenSaved", async () => {
    const { rt, puts, status } = setup(() => reply({ ok: true, day: { games: { zip: { score: "0:08" } } } }));
    rt.getEl("#game").value = "zip";
    rt.getEl("#date").value = "2026-10-12";
    rt.getEl("#score").value = " 0:08 ";
    rt.getEl("#avg").value = "";
    rt.getEl("#number").value = "449";
    await rt.sandbox.saveResult();
    expect(puts()).toHaveLength(1);
    expect(puts()[0]!.url).toBe("/api/me/linkedin-games");
    expect(JSON.parse(String(puts()[0]!.init?.body))).toMatchObject({ date: "2026-10-12", game: "zip", score: "0:08", avg: null, number: 449 });
    expect(status.textContent).toBe("Guardado.");
  });

  it("shouldShowTheServerErrorWhenTheSaveIsRefused", async () => {
    const { rt, status } = setup(() => reply({ ok: false, error: "fast is not a time as M:SS" }, false, 400));
    rt.getEl("#score").value = "fast";
    await rt.sandbox.saveResult();
    expect(status.textContent).toMatch(/No se pudo guardar: .*not a time/);
  });

  it("shouldDefaultTheDateToTodayAndOfferOnlyTheSixGames", () => {
    const { rt } = setup(() => reply({ ok: true, day: { games: {} } }));
    expect(rt.getEl("#date").value).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(LINKEDIN_GAMES_HTML.match(/<option value="/g)).toHaveLength(6);
    expect(LINKEDIN_GAMES_HTML).not.toMatch(/pinpoint|crossclimb/i);
  });
});

describe("linkedin games page: a failed load is not an empty day", () => {
  it("shouldSayTheDayCouldNotBeLoadedWhenTheRequestFails", async () => {
    const { rt, status } = setup(() => reply({ ok: false, error: "internal error" }, false, 500));
    await rt.sandbox.loadDay();
    expect(status.textContent).toBe("No se pudo cargar el día.");
  });
});
