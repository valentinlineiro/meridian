import { describe, it, expect } from "vitest";
import vm from "node:vm";
import { createDashboardRuntime, fetchOnly } from "./helpers/dom.ts";

// Opponent names come from other Duolingo users and course fields from the source: none of them may become markup.
const HOSTILE = `<img src=x onerror=alert(1)>`;
const QUOTE = `X'),alert(1),('`;

describe("dashboard HTML escaping of third-party strings", () => {
  it("shouldEscapeTheOpponentNameWhenRenderingTheMatchesTable", () => {
    const rt = createDashboardRuntime("/chess");
    vm.runInContext(
      `lastRows=${JSON.stringify([{ match_id: "m1", opponent_name: HOSTILE, opponent_type: HOSTILE, opening_key: HOSTILE, phase_key: HOSTILE, user_color: HOSTILE, result: HOSTILE, end_condition: HOSTILE, opponent_segment: HOSTILE, first_seen_at: "2026-10-05T00:00:00Z" }])};lastTotal=1;renderRows();`,
      rt.sandbox,
    );
    const html = rt.getEl("#mb").innerHTML;
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
  });

  it("shouldEscapeCourseTitlesAndIdsWhenRenderingTheCourseList", () => {
    const rt = createDashboardRuntime("/languages");
    const course = { courseId: QUOTE, title: HOSTILE, xp: 10, fromLanguage: "en", learningLanguage: "xb" };
    rt.renderLanguagesView({ totalXp: 1, streak: 1, currentCourseId: QUOTE, courses: [course] }, null, { summaries: [] }, null);
    const html = rt.getEl("#langCoursesList").innerHTML + rt.getEl("#langCourseSelect").innerHTML;
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
  });

  it("shouldPassTheCourseIdAsAJsonStringLiteralWhenBuildingInlineHandlers", () => {
    const rt = createDashboardRuntime("/languages");
    const course = { courseId: QUOTE, title: "T", xp: 10, fromLanguage: "en", learningLanguage: "xb" };
    rt.renderLanguagesView({ totalXp: 1, streak: 1, currentCourseId: QUOTE, courses: [course] }, null, { summaries: [] }, null);
    const html = rt.getEl("#langCoursesList").innerHTML;
    // the attribute is HTML-decoded before the JS runs: it must decode to a single, well-formed string literal
    const handlers = [...html.matchAll(/onclick="(selectCourse|showCourseDetail)\(([^"]*)\)"/g)].map((m) => m[2]!.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&"));
    expect(handlers.length).toBeGreaterThan(0);
    for (const arg of handlers) expect(JSON.parse(arg)).toBe(QUOTE);
  });

  it("shouldEscapeSectionFieldsWhenRenderingTheCourseDetail", async () => {
    const rt = createDashboardRuntime("/languages");
    const section = { sectionIndex: 1, sectionId: HOSTILE, type: HOSTILE, cefrLevel: HOSTILE, cefrSublevel: null, completedUnits: 1, totalUnits: 2, lastSeenAt: `${HOSTILE}2026-10-01` };
    const course = { courseId: "XB_EN", title: "T", xp: 10, fromLanguage: "en", learningLanguage: "xb" };
    rt.sandbox.fetch = fetchOnly("/api/languages/courses/", async () => ({ ok: true, status: 200, json: async () => ({ course, sections: [section, { ...section, cefrLevel: null }] }) }));
    await vm.runInContext(`showCourseDetail("XB_EN")`, rt.sandbox);
    const html = rt.getEl("#langCefrBody").innerHTML + rt.getEl("#langSectionsList").innerHTML;
    expect(html).not.toContain("<img");
    expect(html).toContain("Nivel &lt;img src=x onerror=alert(1)&gt;");
    expect(html).toContain("Section ID: &lt;img src=x onerror=alert(1)&gt; · Tipo: &lt;img src=x onerror=alert(1)&gt;");
  });
});
