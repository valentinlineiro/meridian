// The observed shape of a course's Path (from `currentCourse`). Domain types: the pure Path-tree model depends on them,
// the parser in src/analytics/courseProgress.ts produces them.

export type Cefr = { level: string; sublevel: number | null }; // currentCourse.pathSectioned[].cefr, e.g. {level:"A1",sublevel:2}

export type CourseLevel = {
  state: string; // observed: legendary | passed | active | locked | unit_test
  finishedSessions: number | null;
  totalSessions: number | null;
  skillId: string | null; // pathLevelMetadata
  crownLevelIndex: number | null;
  treeId: string | null;
  reachedScore: number | null; // levelScoreInfo
  learningScore: number | null;
  reachedProgress: number | null;
  completedProgress: number | null;
};

export type CourseUnit = {
  index: number; // unitIndex: position in the whole course, not within the section
  teachingObjective: string | null;
  cefrLevel: string | null; // coarse unit label as sent by the source ("Intro", "A1", "B1"...)
  isUnlocked: boolean | null; // raw flag; observed false even for completed units, do not read as progress
  levels: CourseLevel[] | null; // null = not captured in the snapshot (only the active section keeps levels)
};

export type CourseSection = {
  index: number;
  id: string;
  type: string | null; // observed: learning | daily_refresh
  cefr: Cefr | null;
  completedUnits: number | null;
  totalUnits: number | null;
  units: CourseUnit[];
};

export type CourseProgress = {
  courseId: string; // currentCourse.id
  activeSectionId: string | null; // currentCourse.activePathSectionId
  sections: CourseSection[];
  // From the matching courses[] entry (null when no entry matches currentCourse.id)
  title: string | null;
  xp: number | null;
  fromLanguage: string | null;
  learningLanguage: string | null;
};
