import { describe, it, expect } from "vitest";
import { createDashboardRuntime, currentTestOwner, lateScriptErrors, settleScriptErrors } from "./helpers/dom.ts";

describe("script error tracking", () => {
  it("shouldReportAnErrorToTheTestThatCreatedThePageAndToNoOtherWhenItIsLoggedLate", () => {
    const rt = createDashboardRuntime("/overview");
    const owner = currentTestOwner();
    expect(settleScriptErrors(owner)).toEqual([]);

    rt.sandbox.console.error("late failure"); // the page logs after its test was settled
    expect(settleScriptErrors("some other test")).toEqual([]);
    expect(lateScriptErrors()).toEqual([`[${owner}] late failure`]);
    expect(lateScriptErrors()).toEqual([]); // reported once
  });

  it("shouldKeepAnErrorForItsOwnerWhenAnotherTestSettlesFirst", () => {
    const rt = createDashboardRuntime("/overview");
    rt.sandbox.console.error("mine");
    expect(settleScriptErrors("a different test")).toEqual([]);
    expect(settleScriptErrors(currentTestOwner())).toEqual(["mine"]);
  });
});
