import { describe, it, expect } from "vitest";
import { summarize } from "../src/domain/result.ts";
import { DASHBOARD_HTML } from "../src/frontend.ts";

const fn = (name: string) => DASHBOARD_HTML.match(new RegExp(`function ${name}\\([^)]*\\)\\{[\\s\\S]*?\\n\\}`))![0];
const renderCompare = new Function(`${fn("esc")}; ${fn("pctCi")}; ${fn("renderCompare")}; return renderCompare;`)() as (g: any[], total: number) => string;
function renderForm(r: any) {
  const el = { innerHTML: "" };
  new Function("q", `${fn("pctCi")}; ${fn("renderForm")}; return renderForm;`)(() => el)(r);
  return el.innerHTML;
}
const group = (o: any) => ({ key: "white", games: 0, wins: 0, losses: 0, draws: 0, unknown: 0, decided: 0, winRate: null, scoreRate: null, winRateCi: null, ...o });
const widths = (html: string) => ["win", "loss", "draw"].map((k) => Number(html.match(new RegExp(`bar-${k}" style="width:([\\d.]+)%`))![1]));

describe("renderCompare", () => {
  it("shouldShowIntervalNextToWinRateWhenPresent", () => {
    const html = renderCompare([group({ games: 20, wins: 13, losses: 7, decided: 20, winRate: 0.65, winRateCi: { lower: 0.4327, upper: 0.8188 } })], 20);
    expect(html).toContain("65.0%");
    expect(html).toContain("[43–82]");
  });

  it("shouldShowDashWhenThereIsNoInterval", () => {
    const html = renderCompare([group({ games: 3, unknown: 3 })], 3);
    expect(html).not.toMatch(/\[\d/);
    expect(html).toContain("Win —");
  });

  it("shouldSizeBarsOverDecidedGamesAndLeaveUnknownsOut", () => {
    const html = renderCompare([group({ games: 10, wins: 2, losses: 2, draws: 1, unknown: 5, decided: 5, winRate: 0.4 })], 10);
    expect(widths(html)).toEqual([40, 40, 20]); // over 5 decided, not 10 games
    expect(html).toMatch(/barra sobre 5 decididas/);
    expect(html).toMatch(/5 sin resultado/);
  });

  it("shouldStateDecidedBasisForRealSummarizeOutput", () => {
    const s = summarize("wwldu".split("").map((c) => ({ result: { w: "win", l: "loss", d: "draw", u: "garbage" }[c] })).concat(Array(5).fill({ result: null })));
    const html = renderCompare([{ key: "white", ...s }], s.games);
    expect(widths(html)).toEqual([50, 25, 25]);
    expect(html).toMatch(/barra sobre 4 decididas/);
    expect(html).toContain("[");
  });

  it("shouldDrawEmptyBarsWhenNothingDecided", () => {
    expect(widths(renderCompare([group({ games: 2, unknown: 2 })], 2))).toEqual([0, 0, 0]);
  });
});

describe("renderForm", () => {
  const side = (o: any) => group({ games: 20, wins: 13, losses: 7, decided: 20, winRate: 0.65, scoreRate: 0.65, ...o });

  it("shouldShowIntervalForWindowAndBaseline", () => {
    const html = renderForm({ ...side({ limit: 20, winRateCi: { lower: 0.4327, upper: 0.8188 } }), before: side({ games: 40, winRateCi: { lower: 0.4, upper: 0.7 } }) });
    expect(html).toContain("[43–82]");
    expect(html).toContain("[40–70]");
  });

  it("shouldShowDashWhenWindowHasNoDecidedGames", () => {
    const html = renderForm({ ...side({ limit: 20, winRate: null, scoreRate: null, winRateCi: null }), before: side({ winRateCi: { lower: 0.4, upper: 0.7 } }) });
    expect(html).not.toContain("[43");
    expect(html).toContain("—");
  });
});
