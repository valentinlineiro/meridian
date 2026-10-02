import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("Frontend Trajectory Tab", () => {
  const html = readFileSync(resolve(__dirname, "../src/frontend.ts"), "utf-8");

  it("shouldIncludeTrajectoryTabButtonAndSectionInMarkup", () => {
    expect(html).toContain('id="tabBtnTrajectory"');
    expect(html).toContain("Trayectoria");
    expect(html).toContain('id="trajectoryTab"');
    expect(html).toContain('id="trajectoryFindings"');
    expect(html).toContain('id="trajectoryEmpty"');
  });

  it("shouldSupportTrajectoryTabInRouteParsing", () => {
    expect(html).toContain('seg === "trajectory"');
  });

  it("shouldProjectChessAsymmetryMetricsIntoFactualCopy", () => {
    expect(html).toContain("Asimetría por color");
    expect(html).toContain("consistentemente superior");
  });

  it("shouldProjectLanguageShiftMetricsIntoFactualCopy", () => {
    expect(html).toContain("Desplazamiento de foco");
    expect(html).toContain("Tu foco principal de aprendizaje se ha desplazado de");
  });

  it("shouldDisplayQuietEmptyMessageWhenNoFindingsArePresent", () => {
    expect(html).toContain("No hay patrones longitudinales suficientemente estables registrados en tu historial.");
  });

  it("shouldTranslateCourseIdsToHumanNamesInLanguageShiftCopy", () => {
    expect(html).toContain("trajectoryCourseName(m.previousCourseId)");
    expect(html).toContain("RU:'Ruso'");
  });
});
