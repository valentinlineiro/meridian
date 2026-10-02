import { json } from "./import.ts";
import { createD1LanguageAdapter } from "../infrastructure/d1/d1LanguageAdapter.ts";
import { getLanguages } from "../application/getLanguages.ts";
import { getLanguageCourse } from "../application/getLanguageCourse.ts";
import { getLanguageXp } from "../application/getLanguageXp.ts";

export async function resolveUserId(db: D1Database, explicitUserId?: string | null): Promise<string | null> {
  const adapter = createD1LanguageAdapter(db);
  return adapter.resolveUserId(explicitUserId);
}

export async function handleGetLanguages(db: D1Database, url: URL): Promise<Response> {
  const explicitUserId = url.searchParams.get("userId");
  const adapter = createD1LanguageAdapter(db);
  const result = await getLanguages(adapter, explicitUserId);
  if (!result) {
    return json({ ok: false, error: "no user state found" }, 404);
  }
  return json(result);
}

export async function handleGetLanguageCourse(db: D1Database, courseId: string, url: URL): Promise<Response> {
  const explicitUserId = url.searchParams.get("userId");
  const adapter = createD1LanguageAdapter(db);
  const result = await getLanguageCourse(adapter, courseId, explicitUserId);
  if (result.kind === "no_user") return json({ ok: false, error: "no user state found" }, 404);
  if (result.kind === "no_course") return json({ ok: false, error: "course not found" }, 404);
  return json({ userId: result.userId, course: result.course, sections: result.sections });
}

export async function handleGetLanguageXp(db: D1Database, url: URL): Promise<Response> {
  const explicitUserId = url.searchParams.get("userId");
  const adapter = createD1LanguageAdapter(db);

  const rawDays = url.searchParams.get("days");
  let days = 90;
  if (rawDays !== null) {
    const parsed = parseInt(rawDays, 10);
    if (!isNaN(parsed) && parsed > 0) {
      days = Math.min(parsed, 365);
    }
  }

  const orderParam = (url.searchParams.get("order") ?? "asc").toLowerCase();
  const isAsc = orderParam === "asc";

  const result = await getLanguageXp(adapter, days, isAsc, explicitUserId);
  if (!result) {
    return json({ ok: false, error: "no user state found" }, 404);
  }
  return json(result);
}
