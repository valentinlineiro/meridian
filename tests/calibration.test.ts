import { describe, it, expect } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { CALIBRATION, parseCalibration, eloVerdict, xpVerdict } from "../src/domain/calibration.ts";
import artefact from "../src/domain/calibration-elo-xp.json";
import { ADMITTED } from "./fixtures/calibration.ts";

describe("calibration artefact (A7)", () => {
  it("shouldAdmitNoEdgeAndNoXpWindowWithTheShippedArtefact", () => {
    // the state of the design (PR #106): no ELO edge passes the stability criteria, XP is uncalibrated
    expect(CALIBRATION.elo.bounds).toEqual({});
    expect(CALIBRATION.xp).toEqual({});
    for (const k of [5, 10, 15, 20]) for (const d of [-200, 0, 200]) expect(eloVerdict(d, k)).toEqual({ available: false });
    for (const w of [7, 14, 28]) expect(xpVerdict(5, w)).toEqual({ available: false });
  });

  it("shouldCarryTheUncertaintyOfEveryEdgeEvenWhenNotAdmitted", () => {
    const a = artefact as any;
    for (const e of ["upper95", "upper99", "lower95", "lower99"]) for (const k of ["5", "10", "15", "20"]) {
      expect(typeof a.elo.edges[e][k].bound).toBe("number");
      expect(a.elo.edges[e][k].uncertainty).toBeGreaterThan(0);
    }
    expect(a.elo.kMax).toBe(20);
  });

  it("shouldUseOnlyAdmittedEdgesWhenParsing", () => {
    const a = JSON.parse(JSON.stringify(artefact));
    a.elo.admitted.upper95 = [10];
    const c = parseCalibration(a);
    expect(c.elo.bounds).toEqual({ upper95: { 10: a.elo.edges.upper95["10"].bound } });
    expect(eloVerdict(a.elo.edges.upper95["10"].bound + 1, 10, c)).toMatchObject({ available: true, relevant: true });
    expect(eloVerdict(-500, 10, c)).toEqual({ available: false }); // the lower edge is not admitted
  });

  it("shouldFailLoudlyWhenTheArtefactIsMalformed", () => {
    expect(() => parseCalibration({})).toThrow(/malformed/);
    const a = JSON.parse(JSON.stringify(artefact));
    a.elo.admitted.upper95 = [7];
    expect(() => parseCalibration(a)).toThrow(/no bound/);
  });

  it("shouldNeverCalibrateBeyondKMax", () => {
    expect(eloVerdict(500, 21, ADMITTED)).toEqual({ available: false });
    expect(eloVerdict(500, 15, ADMITTED)).toMatchObject({ available: true, relevant: true, level: "exceptional" });
  });

  it("shouldMatchWhatTheGeneratorProducesFromTheVersionedExplorationOutput", () => {
    if (spawnSync("python3", ["--version"]).status !== 0) return; // no interpreter: the CI step runs the check as well
    expect(execFileSync("python3", ["-I", "docs/audits/calibration-elo-xp/make_artifact.py", "--check"]).toString()).toContain("OK");
  });
});
