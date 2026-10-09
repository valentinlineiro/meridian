import { describe, it, expect } from "vitest";
import vm from "node:vm";
import { createDashboardRuntime, fetchOnly } from "./helpers/dom.ts";

// The matches table and its filters, driven through the real dashboard script. What matters is which request the page
// sends to the server and what it shows, not how the script is written.
const settle = async () => { for (let i = 0; i < 200; i++) await Promise.resolve(); };
const row = (n: number) => ({ match_id: `m${n}`, opponent_name: `rival${n}`, opponent_type: "bot", user_color: "white", result: "win", end_condition: "checkmate" });

async function openPage(total = 120, rows: any[] = [row(1), row(2)]) {
  const rt = createDashboardRuntime("/chess");
  const requests: URLSearchParams[] = [];
  rt.sandbox.fetch = fetchOnly("/api/matches", async (url: string) => {
    requests.push(new URL(url, "http://x").searchParams);
    return { ok: true, status: 200, json: async () => ({ rows, total }) };
  });
  rt.sandbox.setTimeout = (fn: () => void) => { fn(); return 0; }; // the search debounce fires at once
  await settle();
  const call = async (expr: string) => { vm.runInContext(expr, rt.sandbox); await settle(); };
  return { rt, requests, call, last: () => requests[requests.length - 1]! };
}

describe("matches table paging", () => {
  it("shouldAskForTenRowsFirstAndFiftyOnceExpanded", async () => {
    const { rt, call, last } = await openPage();
    await call("loadM(0)");
    expect(last().get("limit")).toBe("10");
    expect(rt.getEl("#btnAllMatches").style.display).not.toBe("none");

    await call("showAllMatches()");
    expect(last().get("limit")).toBe("50");
    expect(last().get("offset")).toBe("0");
    expect(rt.getEl("#btnAllMatches").style.display).toBe("none");
    expect(rt.getEl("#matchFilters").style.display).toBe("flex");
    expect(rt.getEl("#matchPager").style.display).toBe("flex");
  });

  it("shouldStepThePagerByTheCurrentPageSizeAndDisableNextOnTheLastPage", async () => {
    const { rt, call, last } = await openPage(25);
    await call("loadM(0)");
    await call("nextPage()");
    expect(last().get("offset")).toBe("10");
    await call("nextPage()");
    expect(last().get("offset")).toBe("20");
    expect((rt.getEl("#next") as any).disabled).toBe(true); // 20 + 10 >= 25

    await call("showAllMatches()"); // the step follows the page size
    await call("nextPage()");
    expect(last().get("offset")).toBe("50"); // the step is now 50
    await call("prevPage()");
    expect(last().get("offset")).toBe("0");
  });
});

describe("rival search", () => {
  it("shouldSendTheQueryToTheServerFromTheFirstPageWhenTyping", async () => {
    const { rt, call, last } = await openPage();
    await call("loadM(0)");
    await call("nextPage()");
    rt.getEl("#q").value = "magnus";
    await call("onSearch()");
    expect(last().get("q")).toBe("magnus");
    expect(last().get("offset")).toBe("0");
  });

  it("shouldShowEveryRowTheServerReturnsWithoutFilteringOnTheClient", async () => {
    const { rt, call } = await openPage(2, [row(1), row(2)]);
    rt.getEl("#q").value = "zzz-matches-nobody-loaded";
    await call("onSearch()");
    const html = rt.getEl("#mb").innerHTML;
    expect(html).toContain("rival1");
    expect(html).toContain("rival2");
  });
});

describe("match chips", () => {
  it("shouldSendTheChipsToTheServerAndReloadTheFirstPageWhenToggled", async () => {
    const { call, last } = await openPage();
    await call("loadM(0)");
    await call("nextPage()");
    await call("setChip('result','win')");
    expect(last().get("result")).toBe("win");
    expect(last().get("offset")).toBe("0");
    await call("setChip('type','bot')");
    expect(last().get("opponentType")).toBe("bot");
    expect(last().get("result")).toBe("win"); // chips combine
    await call("setChip('color','black')");
    expect(last().get("color")).toBe("black");
  });

  it("shouldClearEveryChipWithASingleRequestWhenClearingFilters", async () => {
    const { rt, requests, call, last } = await openPage();
    await call("setChip('result','win')");
    await call("setChip('type','bot')");
    await call("setChip('color','black')");
    rt.getEl("#q").value = "x";
    const before = requests.length;

    await call("clearF()");
    expect(requests.length - before).toBe(1);
    for (const p of ["result", "opponentType", "color", "q"]) expect(last().has(p)).toBe(false);
  });
});

describe("match filters", () => {
  it("shouldSendEachFilterToTheServerFromTheFirstPage", async () => {
    const { rt, call, last } = await openPage();
    await call("loadM(0)");
    await call("nextPage()");
    rt.getEl("#fEnd").value = "checkmate";
    rt.getEl("#fPhase").value = "endgame";
    rt.getEl("#fOpening").value = "sicilian";
    rt.getEl("#fMin").value = "800";
    await call("loadM(0)");
    expect(Object.fromEntries(last())).toMatchObject({ endCondition: "checkmate", phase: "endgame", opening: "sicilian", minOpponentElo: "800", offset: "0" });
  });

  it("shouldFilterByOpponentSegmentWhenTheOptionIsASegmentAndByTypeOtherwise", async () => {
    const { rt, call, last } = await openPage();
    rt.getEl("#fOpp").value = "seg:noisy_neural";
    await call("loadM(0)");
    expect(last().get("opponentSegment")).toBe("noisy_neural");
    expect(last().has("opponentType")).toBe(false);

    rt.getEl("#fOpp").value = "bot";
    await call("loadM(0)");
    expect(last().get("opponentType")).toBe("bot");
    expect(last().has("opponentSegment")).toBe(false);
  });

  it("shouldDropEveryFilterWhenClearingThem", async () => {
    const { rt, call, last } = await openPage();
    for (const [sel, v] of [["#fEnd", "checkmate"], ["#fOpp", "bot"], ["#fPhase", "endgame"], ["#fOpening", "sicilian"], ["#fMin", "800"], ["#fMax", "1500"]] as const) rt.getEl(sel).value = v;
    await call("clearF()");
    for (const p of ["endCondition", "opponentType", "opponentSegment", "phase", "opening", "minOpponentElo", "maxOpponentElo"]) expect(last().has(p)).toBe(false);
    for (const sel of ["#fEnd", "#fOpp", "#fPhase", "#fOpening"]) expect(rt.getEl(sel).value).toBe("");
  });
});

describe("match rows", () => {
  const played = 1790000000;
  const full = { ...row(1), played_at: played, opponent_segment: "noisy_neural", opening_key: "sicilian", phase_key: "middlegame", end_condition: "checkmate" };

  it("shouldShowWhenHowAndAgainstWhomEachGameWasPlayed", async () => {
    const { rt } = await openPage(1, [full]);
    const html = rt.getEl("#mb").innerHTML;
    expect(html).toContain(`title="${new Date(played * 1000).toLocaleString("es-ES")}"`); // the full date on hover
    expect(html).toContain("Noisy Neural"); // opponent family
    expect(html).toMatch(/data-l="Fin"><span class="pill">Mate<\/span>/); // how it ended
    expect(html).toContain("sicilian"); // opening
    expect(html).toContain("Medio"); // phase
  });

  it("shouldOmitTheOpeningAndPhaseBadgesWhenTheyAreUnknown", async () => {
    const { rt } = await openPage(1, [{ ...full, opening_key: "unclassified", phase_key: "unknown", opponent_segment: "unknown" }]);
    const html = rt.getEl("#mb").innerHTML;
    expect(html).not.toContain("unclassified");
    expect(html).not.toContain("Medio");
    expect(html).not.toContain("Noisy Neural");
  });

  it("shouldFallBackToTheFirstSeenDateWithoutAPlayedAt", async () => {
    const seen = "2026-09-20T14:13:20.000Z";
    const { rt } = await openPage(1, [{ ...row(1), first_seen_at: seen }]);
    const html = rt.getEl("#mb").innerHTML;
    expect(html).toContain(`title="${new Date(seen).toLocaleString("es-ES")}"`);
    expect(html).toMatch(/data-l="Fecha"[^>]*>\d{1,2} \S+<\/td>/); // a day and month, no clock time
  });
});

describe("chess dashboard on load", () => {
  it("shouldShowTheChessStatisticsAndRequestTheFirstTenMatchesWhenThePageOpens", async () => {
    const { rt, requests } = await openPage(0, []);
    expect(rt.getEl("#kpis").innerHTML).toContain("Partidas");
    expect(requests[0]!.get("limit")).toBe("10");
    expect(requests[0]!.get("offset")).toBe("0");
  });
});
