import { describe, it, expect } from "vitest";
import vm from "node:vm";
import { createDashboardRuntime, fetchOnly } from "./helpers/dom.ts";

// The matches table and its filters, driven through the real dashboard script. What matters is which request the page
// sends to the server and what it shows, not how the script is written.
const settle = async () => { for (let i = 0; i < 200; i++) await Promise.resolve(); };
const row = (n: number) => ({ match_id: `m${n}`, opponent_name: `rival${n}`, opponent_type: "bot", user_color: "white", result: "win", end_condition: "checkmate" });

async function openPage(total = 120, rows = [row(1), row(2)]) {
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

describe("chess dashboard on load", () => {
  it("shouldShowTheChessStatisticsAndRequestTheFirstTenMatchesWhenThePageOpens", async () => {
    const { rt, requests } = await openPage(0, []);
    expect(rt.getEl("#kpis").innerHTML).toContain("Partidas");
    expect(requests[0]!.get("limit")).toBe("10");
    expect(requests[0]!.get("offset")).toBe("0");
  });
});
