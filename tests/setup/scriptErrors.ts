import { afterAll, afterEach } from "vitest";
import { currentTestOwner, lateScriptErrors, settleScriptErrors } from "../helpers/dom.ts";

// A dashboard page booted by a test must not log errors of its own: the page's catch blocks swallow a failing render and
// would leave the test green. Errors go to the test that created the page; one logged after that test ended (or by a page
// created outside any test) fails the file instead, naming its owner.
afterEach(async () => {
  for (let i = 0; i < 50; i++) await Promise.resolve(); // the boot chain is microtasks only; setImmediate would hang under fake timers
  const errors = settleScriptErrors(currentTestOwner());
  if (errors.length) throw new Error(`the dashboard script logged errors during the test:\n${errors.join("\n")}`);
});

afterAll(() => {
  const late = lateScriptErrors();
  if (late.length) throw new Error(`the dashboard script logged errors after its test had finished:\n${late.join("\n")}`);
});
