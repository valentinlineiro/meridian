// Seeds a locally running dev worker with the demo dataset:
//   npx wrangler d1 migrations apply meridian --local
//   npx wrangler dev src/dev.ts --port 8787 --var IMPORT_TOKEN:dev-token
//   npm run demo:seed
// All snapshots are stamped with the current time: the seed shows the dashboards, while the historical
// comparison (two observations weeks apart) is exercised with a fake clock in tests/demoJourney.test.ts.
import { execFileSync } from "node:child_process";
import { DEMO_USER, demoChessSnapshot, demoLanguageSnapshots } from "./demoData.ts";

const base = process.env.WORKER ?? "http://localhost:8787";
const token = process.env.IMPORT_TOKEN ?? "dev-token";
const post = async (body: unknown) => {
  const res = await fetch(`${base}/api/snapshot`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
};

for (const s of demoLanguageSnapshots()) await post(s.payload);
await post(demoChessSnapshot());
// The dev entry authenticates as dev@localhost (or ADMIN_EMAIL). /api/me/* resolves that email to the provider account through
// user_identities + user_provider_accounts, which snapshots never create: without this, /api/me/settings and /api/me/changes-anchor answer 404.
// Local D1 only (`--local`); idempotent.
const owner = (process.env.DEMO_OWNER_EMAIL ?? "dev@localhost").toLowerCase();
const sql = [
  `INSERT OR IGNORE INTO users (id, created_at) VALUES ('demo-owner', datetime('now'))`,
  `INSERT OR IGNORE INTO user_identities (user_id, provider, subject, created_at) VALUES ('demo-owner', 'cloudflare_access', '${owner}', datetime('now'))`,
  `INSERT OR IGNORE INTO user_provider_accounts (user_id, provider, provider_user_id, created_at) VALUES ('demo-owner', 'duolingo', '${DEMO_USER}', datetime('now'))`,
].join("; ");
execFileSync("npx", ["wrangler", "d1", "execute", "meridian", "--local", "--command", sql], { stdio: "ignore" });
console.log(`seeded demo data into ${base} (owner ${owner})`);
