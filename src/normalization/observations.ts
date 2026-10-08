// Pure extractor of observation rows from a snapshot payload (contract §4.7). Ingest and backfill both call this,
// so their parity holds by construction. It stores what was observed, never what it means (D4): no inference.
import { parseCourseProgress, CourseProgressFormatError } from "../analytics/courseProgress.ts";

import { EXTRACTOR_VERSION, type ObservationMeta, type Observations, type Extraction } from "../domain/observationRows.ts";
export { EXTRACTOR_VERSION };
export type { ObservationMeta, Observations, Extraction };

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
const isObj = (v: unknown): v is Record<string, any> => typeof v === "object" && v !== null && !Array.isArray(v);

const empty = (): Observations => ({ account: null, courses: [], path: null, sections: [], elo: null });

export function extractObservations(source: string, rawJson: string, meta: ObservationMeta): Extraction {
  let data: unknown;
  try { data = JSON.parse(rawJson); } catch { return { ok: false, reason: "unparseable_json" }; }
  if (!isObj(data)) return { ok: false, reason: "payload_not_an_object" };

  const observations = empty();
  if (source === "duolingo-chess") {
    observations.elo = num(data.eloRating);
  } else if (source === "duolingo-lang") {
    extractLanguages(data, meta, observations);
  } // any other source observes nothing
  return { ok: true, meta, observations };
}

function extractLanguages(data: Record<string, any>, meta: ObservationMeta, out: Observations) {
  const user = isObj(data.user) ? data.user : {};

  // D-a: account fields come from user.* only. D-b: no account fields, no row (absent is not null).
  // A snapshot flagged auxiliary never speaks for the account (ingestion contract v0.2), even if it carried them.
  const account = { totalXp: num(user.totalXp), streak: num(user.streak), declaredCourseId: str(user.currentCourseId) };
  if (!meta.isAuxiliary && (account.totalXp !== null || account.streak !== null || account.declaredCourseId !== null)) out.account = account;

  const rawCourses: any[] = Array.isArray(data.courses) ? data.courses : Array.isArray(user.courses) ? user.courses : [];
  const seen = new Set<string>();
  for (const c of rawCourses) {
    if (!isObj(c)) continue;
    const courseId = str(c.id) ?? str(c.courseId);
    if (!courseId || seen.has(courseId)) continue; // first entry wins, as the primary key would
    seen.add(courseId);
    out.courses.push({ courseId, subject: str(c.subject), learningLanguage: str(c.learningLanguage), fromLanguage: str(c.fromLanguage), title: str(c.title), xp: num(c.xp) });
  }

  if (data.currentCourse == null) return;
  // K4 goes through the same parser as the dashboard (§3.2.5), so "required" and the format errors are identical.
  try {
    const cp = parseCourseProgress(data.currentCourse, rawCourses);
    if (!cp) return;
    out.path = { courseId: cp.courseId, activeSectionId: cp.activeSectionId, formatError: null };
    const index = new Set<number>();
    for (const s of cp.sections) {
      if (index.has(s.index)) continue;
      index.add(s.index);
      out.sections.push({ sectionIndex: s.index, sectionId: s.id, type: s.type, cefrLevel: s.cefr?.level ?? null, cefrSublevel: s.cefr?.sublevel ?? null, completedUnits: s.completedUnits, totalUnits: s.totalUnits });
    }
  } catch (e) {
    if (!(e instanceof CourseProgressFormatError)) throw e;
    out.path = { courseId: isObj(data.currentCourse) ? str(data.currentCourse.id) : null, activeSectionId: null, formatError: e.message };
    out.sections = [];
  }
}
