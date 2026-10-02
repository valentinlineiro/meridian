import type { LoginThrottle } from "../../ports/authPort.ts";

export const MAX_FAILURES = 10;
export const WINDOW_MS = 15 * 60 * 1000;

export function createD1LoginThrottle(db: D1Database): LoginThrottle {
  return {
    async tryAcquire(nowMs) {
      await db.prepare("DELETE FROM login_failures WHERE at <= ?").bind(nowMs - WINDOW_MS).run();
      // one statement = atomic: insert only while fewer than MAX attempts are inside the window
      const res = await db
        .prepare("INSERT INTO login_failures (at) SELECT ? WHERE (SELECT COUNT(*) FROM login_failures WHERE at > ?) < ?")
        .bind(nowMs, nowMs - WINDOW_MS, MAX_FAILURES)
        .run();
      return Number(res.meta.changes) === 1;
    },
    async reset() {
      await db.prepare("DELETE FROM login_failures").run();
    },
  };
}
