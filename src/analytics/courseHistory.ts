// ponytail: Path history + XP-at-observation (XP only when that course was currentCourse).
// Full per-course XP-in-every-snapshot would be a separate projection — out of scope for PR #2.
import { parseCourseProgress, summarizeCourseProgress, CourseProgressFormatError } from "./courseProgress.ts";
export type CourseHistoryPoint = { capturedAt: string; courseId: string; title: string | null; learningLanguage: string | null; xp: number | null; path: import("./courseProgress.ts").CourseProgressSummary | null; formatError: string | null };
const num = (v: unknown) => typeof v === "number" && Number.isFinite(v) ? v : null;
const str = (v: unknown) => typeof v === "string" ? v : null;
const isObj = (v: unknown): v is Record<string, any> => typeof v === "object" && v !== null && !Array.isArray(v);
export function buildCourseProgressHistory(snapshots: Array<{ rawJson: string; createdAt: string }>, latestCourses: unknown): CourseHistoryPoint[] {
  const coursesArr = Array.isArray(latestCourses) ? latestCourses : [];
  const titleOf = (id: string) => { const c = coursesArr.find((x: any) => isObj(x) && x.id === id); return str((c as any)?.title); };
  const langOf = (id: string) => { const c = coursesArr.find((x: any) => isObj(x) && x.id === id); return str((c as any)?.learningLanguage); };
  const pts: CourseHistoryPoint[] = [];
  for (const row of snapshots) {
    let data: any; try { data = JSON.parse(row.rawJson); } catch { continue; }
    const cc = data?.currentCourse; if (!isObj(cc) || typeof cc.id !== "string") continue;
    const courseId = cc.id;
    let xp: number | null = null; try { const snapCourses = Array.isArray(data?.courses) ? data.courses : coursesArr; const m = snapCourses.find((c: any) => isObj(c) && c.id === courseId); xp = num((m as any)?.xp); } catch { xp = null; }
    try {
      const cp = parseCourseProgress(cc, Array.isArray(data?.courses) ? data.courses : coursesArr);
      const summary = summarizeCourseProgress(cp);
      pts.push({ capturedAt: row.createdAt, courseId, title: titleOf(courseId), learningLanguage: langOf(courseId), xp, path: summary, formatError: null });
    } catch (e) { if (!(e instanceof CourseProgressFormatError)) throw e; pts.push({ capturedAt: row.createdAt, courseId, title: titleOf(courseId), learningLanguage: langOf(courseId), xp, path: null, formatError: e.message }); }
  }
  return pts.sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));
}
