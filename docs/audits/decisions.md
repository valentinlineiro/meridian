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
