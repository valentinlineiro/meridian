import { parseCourseProgress, CourseProgressFormatError } from "../analytics/courseProgress.ts";
import { treeRows, violatesUnitKey, type Tree } from "../domain/pathTree.ts";

/** Tree of the snapshot's currentCourse via the one shared parser (§3.2.5). null: no currentCourse, or a format error (K5 then writes nothing). */
export function extractPathTree(data: any): { courseId: string; tree: Tree } | null {
  if (data?.currentCourse == null) return null;
  const courses = Array.isArray(data.courses) ? data.courses : Array.isArray(data.user?.courses) ? data.user.courses : [];
  try {
    const cp = parseCourseProgress(data.currentCourse, courses);
    if (!cp) return null;
    if (violatesUnitKey(cp)) { console.warn(`K5: course ${cp.courseId} has duplicate or unordered unit indexes; tree state left untouched`); return null; } // loud, never a silent drop
    return { courseId: cp.courseId, tree: treeRows(cp) };
  } catch (e) {
    if (e instanceof CourseProgressFormatError) return null;
    throw e;
  }
}
