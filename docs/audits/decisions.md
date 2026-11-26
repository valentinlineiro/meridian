## 2026-11-17 · The stale-tab navigation failure is rated major, from code alone
- Decided by: Claude, default (the owner has not answered)
- Why: a silent failed navigation is Missing Feedback, the context treats it as a defect, and continuous deploy makes it recur; not rated critical because a reload recovers every task.
- Rejected: minor, because the owner cannot tell the app needs a reload; critical, because no task is blocked for good.
- Rests on: `web/src/app/app.routes.ts` (lazy `loadComponent`), `web/src/app/app.config.ts` (no navigation error handler), `web/public/sw.js` (previous build's cache dropped on a new index). Not reproduced in a browser.

## 2026-11-17 · The app audit covers code and styles, not live screens or production data
- Decided by: Claude, default
- Why: the audit of the same day already walked the screens at 320 and 375 px; this one re-read the code for what that walk could not see (deploys, offline, session, input sizing). No production read was granted.
- Rejected: a new browser walk of every screen, which would repeat the earlier one.
- Rests on: [evaluation-meridian-2026-11-17], [context-meridian].
## 2026-11-26 · Usage window is 2026-11-27 to 2026-12-14, and days are counted, not hits
- Decided by: measure (default)
- Why: 11-24 to 11-26 were build and check days, and one person tapping repeatedly inflates hit counts.
- Rejected: starting 11-24 (contaminated); hit counts.
- Rests on: merge dates of #261, #262, #263, #267.

## 2026-11-26 · Keep at 3 or more days, cut at 0, owner decides at 1 or 2
- Decided by: measure (default), written before any Umami data was read
- Why: 3 days in 18 is about once a week; with one user there is no sample to test, so the rule is a count.
- Rejected: percentages or significance tests; deciding after seeing the numbers.
- Rests on: web/PRODUCT.md, "once or a few times a day".

## 2026-11-26 · No data is deleted by a cut, and exports and settings are exempt
- Decided by: measure (default)
- Why: snapshots and day records are the product's memory, and rare use is expected for exports and the goal.
- Rejected: applying the frequency rule to every control.
- Rests on: web/PRODUCT.md, Product Purpose and Capabilities.

## 2026-11-26 · Folded blocks, game opening and register saves are tagged before the window
- Decided by: the designer
- Why: without events the folded blocks could not be judged.
- Rejected: leaving them unjudged.
- Rests on: web/src/app, `data-umami-event` attributes checked by tests/usageEvents.test.ts.
