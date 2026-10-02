// Deterministic, fully invented language-course snapshot used by the progress/history tests.
// Nothing here is derived from a real account or a real upstream response.
const level = (state: string, i: number, tag: string) => {
  const meta = { skillId: `skill-${tag}-${i}`, crownLevelIndex: i, treeId: `tree-${tag}` };
  switch (state) {
    case "legendary": return { state, finishedSessions: 4, totalSessions: 4, pathLevelMetadata: meta, levelScoreInfo: { reachedScore: 5, learningScore: 6, reachedProgress: 0, completedProgress: 0.125 } };
    case "passed": return { state, finishedSessions: 4, totalSessions: 4, pathLevelMetadata: meta, levelScoreInfo: { reachedScore: 9, learningScore: 10, reachedProgress: 0, completedProgress: 0.25 } };
    case "active": return { state, finishedSessions: 0, totalSessions: 6, pathLevelMetadata: meta, levelScoreInfo: { reachedScore: 7, learningScore: 8, reachedProgress: 0, completedProgress: 1 / 12 } };
    case "locked": return { state, finishedSessions: 0, totalSessions: 4, pathLevelMetadata: { treeId: meta.treeId } };
    default: return { state: "unit_test", finishedSessions: 0, totalSessions: 1, pathLevelMetadata: {} };
  }
};

// Per unit: three levels followed by a unit test.
const unitLevels = (tag: string, states: [string, string, string]) => [...states.map((s, i) => level(s, i, tag)), level("unit_test", 3, tag)];

type Spec = { id: string; type: string; cefr?: { level: string; sublevel?: number }; units: number; completed: number; objective?: string; cefrLevel?: string };
const SPECS: Spec[] = [
  { id: "demo-sec-0", type: "learning", cefr: { level: "INTRO" }, units: 4, completed: 4, objective: "Demo objective", cefrLevel: "Intro" },
  { id: "demo-sec-1", type: "learning", cefr: { level: "A1", sublevel: 1 }, units: 6, completed: 6, objective: "Demo objective", cefrLevel: "A1" },
  { id: "demo-sec-2", type: "learning", cefr: { level: "A1", sublevel: 2 }, units: 6, completed: 2, objective: "Demo objective", cefrLevel: "A1" },
  { id: "demo-sec-3", type: "learning", cefr: { level: "A2", sublevel: 1 }, units: 8, completed: 0, objective: "Demo objective", cefrLevel: "A2" },
  { id: "demo-sec-4", type: "daily_refresh", units: 1, completed: 0 },
];
export const ACTIVE_SECTION_INDEX = 2;

export type SnapshotOptions = {
  activeCompleted?: number; // units completed in the active section
  courseXp?: number;
  totalXp?: number;
  streak?: number;
  xpSummaries?: { date: number; gainedXp: number; numSessions: number; totalSessionTime: number }[];
};

export function syntheticSnapshot(opts: SnapshotOptions = {}): any { // any: tests mutate it freely
  const { activeCompleted = 2, courseXp = 12345, totalXp = 50000, streak = 100 } = opts;
  const specs = SPECS.map((s, i) => (i === ACTIVE_SECTION_INDEX ? { ...s, completed: activeCompleted } : s));
  let next = 0;
  const pathSectioned = specs.map((s, index) => {
    const units = Array.from({ length: s.units }, (_, k) => {
      const unitIndex = next++;
      const keepLevels = index === 0 || index === ACTIVE_SECTION_INDEX; // only the active section (and section 0) keep levels
      let levels: unknown = null;
      if (keepLevels) {
        const tag = `${index}-${k}`;
        const states: [string, string, string] = k < s.completed ? ["passed", "passed", "passed"]
          : k === s.completed && index === ACTIVE_SECTION_INDEX ? ["passed", "active", "locked"] : ["locked", "locked", "locked"];
        levels = unitLevels(tag, states);
        if (index === 0 && k === 0) (levels as any[])[0] = level("legendary", 0, tag);
      }
      return { unitIndex, teachingObjective: s.objective, cefrLevel: s.cefrLevel, isUnlocked: false, levels };
    });
    return { index, id: s.id, type: s.type, cefr: s.cefr, completedUnits: s.completed, totalUnits: s.units, units };
  });
  return {
    user: { id: 1000001, totalXp, streak, currentCourseId: "DUOLINGO_XA_EN" },
    courses: [
      { id: "DUOLINGO_XA_EN", title: "Demo Alpha", xp: courseXp, learningLanguage: "xa", fromLanguage: "en", subject: "language", topic: "xa" },
      { id: "DUOLINGO_XB_EN", title: "Demo Beta", xp: 4321, learningLanguage: "xb", fromLanguage: "en", subject: "language", topic: "xb" },
      { id: "DUOLINGO_XC_ES", title: "Demo Gamma", xp: 987, learningLanguage: "xc", fromLanguage: "es", subject: "language", topic: "xc" }, // XP-only: no path ever captured
      { id: "CHESS_CH", xp: 2000, fromLanguage: "en", subject: "chess", topic: "ch" },
    ],
    currentCourse: { id: "DUOLINGO_XA_EN", activePathSectionId: SPECS[ACTIVE_SECTION_INDEX]!.id, pathSectioned },
    xp_summaries: opts.xpSummaries ?? [
      { date: 1790121600, gainedXp: 40, numSessions: 2, totalSessionTime: 300 },
      { date: 1790208000, gainedXp: 25, numSessions: 1, totalSessionTime: 120 },
    ],
  };
}
