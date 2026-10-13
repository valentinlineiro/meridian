import { repairCompactXpEvents } from "../db/storeCompactXpEvents.ts";

export async function handleCompactXpRepair(db: D1Database, body: unknown): Promise<Response> {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return new Response(JSON.stringify({ ok: false, error: "invalid repair payload" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }
  const value = body as Record<string, unknown>;
  const userId = typeof value.userId === "string" ? value.userId.trim() : "";
  const source = typeof value.source === "string" ? value.source : "duolingo-lang";
  const chunkSize = value.chunkSize === undefined ? 10 : Number(value.chunkSize);
  if (!userId || source !== "duolingo-lang" || !Number.isInteger(chunkSize) || chunkSize < 1 || chunkSize > 25) {
    return new Response(JSON.stringify({ ok: false, error: "userId, source=duolingo-lang and chunkSize 1..25 are required" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }
  const result = await repairCompactXpEvents(db, userId, source, chunkSize);
  return new Response(JSON.stringify({ ok: true, ...result }), {
    status: result.status === "conflict" ? 409 : 200,
    headers: { "content-type": "application/json" },
  });
}
