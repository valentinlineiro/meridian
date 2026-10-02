import type { ConcentrationMetrics, CourseInput, CourseShareEntry } from "./types.ts";

export function calculateCourseConcentration(courses: CourseInput[]): ConcentrationMetrics {
  const validCourses = courses
    .filter((c) => (c.xp || 0) > 0)
    .map((c) => ({
      courseId: c.courseId,
      title: c.title ?? null,
      learningLanguage: c.learningLanguage ?? null,
      fromLanguage: c.fromLanguage ?? null,
      lifetimeXp: c.xp || 0,
    }))
    .sort((a, b) => b.lifetimeXp - a.lifetimeXp);

  const totalLinguisticXp = validCourses.reduce((acc, c) => acc + c.lifetimeXp, 0);

  if (totalLinguisticXp === 0) {
    return {
      totalLinguisticXp: 0,
      hhi: 0,
      effectiveCourseCount: 0,
      top3SharePercentage: 0,
      courses: [],
    };
  }

  let sumSquares = 0;
  const courseShares: CourseShareEntry[] = validCourses.map((c) => {
    const shareFraction = c.lifetimeXp / totalLinguisticXp;
    sumSquares += shareFraction * shareFraction;
    return {
      courseId: c.courseId,
      title: c.title,
      learningLanguage: c.learningLanguage,
      fromLanguage: c.fromLanguage,
      lifetimeXp: c.lifetimeXp,
      sharePercentage: Number((shareFraction * 100).toFixed(2)),
    };
  });

  const hhi = Number(sumSquares.toFixed(4));
  const effectiveCourseCount = hhi > 0 ? Number((1 / hhi).toFixed(2)) : 0;
  const top3SharePercentage = Number(
    courseShares.slice(0, 3).reduce((acc, c) => acc + c.sharePercentage, 0).toFixed(2)
  );

  return {
    totalLinguisticXp,
    hhi,
    effectiveCourseCount,
    top3SharePercentage,
    courses: courseShares,
  };
}
