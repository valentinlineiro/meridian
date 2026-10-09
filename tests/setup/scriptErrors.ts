import { afterEach } from "vitest";
import { takeScriptErrors } from "../helpers/dom.ts";

// A dashboard page booted by a test must not log errors of its own: the page's catch blocks swallow a failing render and
// would leave the test green. If a test ever has to provoke one on purpose, give it its own explicit console stub and say why.
afterEach(async () => {
  for (let i = 0; i < 50; i++) await Promise.resolve(); // the boot chain is microtasks only; setImmediate would hang under fake timers
  const errors = takeScriptErrors();
  if (errors.length) throw new Error(`the dashboard script logged errors during the test:\n${errors.join("\n")}`);
});
