// Seeds a locally running dev worker with the demo dataset:
//   npx wrangler d1 migrations apply longitudinal-analytics --local
//   npx wrangler dev src/dev.ts --port 8787 --var IMPORT_TOKEN:dev-token
//   npm run demo:seed
// All snapshots are stamped with the current time: the seed shows the dashboards, while the historical
// comparison (two observations weeks apart) is exercised with a fake clock in tests/demoJourney.test.ts.
import { demoChessSnapshot, demoLanguageSnapshots } from "./demoData.ts";

const base = process.env.WORKER ?? "http://localhost:8787";
const token = process.env.IMPORT_TOKEN ?? "dev-token";
const post = async (body: unknown) => {
  const res = await fetch(`${base}/api/snapshot`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
};

for (const s of demoLanguageSnapshots()) await post(s.payload);
await post(demoChessSnapshot());
console.log(`seeded demo data into ${base}`);
