import type { CefrProgressEntry, CourseCurriculumState, SectionInput } from "./types.ts";

export function calculateCurriculumState(sections: SectionInput[]): CourseCurriculumState[] {
  const byCourse = new Map<string, SectionInput[]>();

  for (const s of sections) {
    if (!byCourse.has(s.courseId)) {
      byCourse.set(s.courseId, []);
    }
    byCourse.get(s.courseId)!.push(s);
  }

  const result: CourseCurriculumState[] = [];

  for (const [courseId, courseSections] of byCourse.entries()) {
    courseSections.sort((a, b) => a.sectionIndex - b.sectionIndex);

    const completedUnits = courseSections.reduce((acc, s) => acc + (s.completedUnits || 0), 0);
    const totalUnits = courseSections.reduce((acc, s) => acc + (s.totalUnits || 0), 0);
    const ratio = totalUnits > 0 ? Number((completedUnits / totalUnits).toFixed(4)) : 0;

    // CEFR Breakdown
    const cefrGroups = new Map<string | null, { sectionsCount: number; completedUnits: number; totalUnits: number }>();

    for (const s of courseSections) {
      const level = s.cefrLevel ?? null;
      if (!cefrGroups.has(level)) {
        cefrGroups.set(level, { sectionsCount: 0, completedUnits: 0, totalUnits: 0 });
      }
      const g = cefrGroups.get(level)!;
      g.sectionsCount += 1;
      g.completedUnits += s.completedUnits || 0;
      g.totalUnits += s.totalUnits || 0;
    }

    const cefrBreakdown: CefrProgressEntry[] = Array.from(cefrGroups.entries()).map(([cefrLevel, data]) => ({
      cefrLevel,
      sectionsCount: data.sectionsCount,
      completedUnits: data.completedUnits,
      totalUnits: data.totalUnits,
      ratio: data.totalUnits > 0 ? Number((data.completedUnits / data.totalUnits).toFixed(4)) : 0,
    }));

    result.push({
      courseId,
      completedUnits,
      totalUnits,
      ratio,
      sectionsCount: courseSections.length,
      cefrBreakdown,
    });
  }

  return result.sort((a, b) => b.completedUnits - a.completedUnits);
}
