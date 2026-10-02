import type {
  ComparabilityStatus,
  CurriculumObservationDelta,
  CurriculumSnapshotInput,
} from "./types.ts";

export function compareCurriculumSnapshots(
  previous?: CurriculumSnapshotInput | null,
  current?: CurriculumSnapshotInput | null
): CurriculumObservationDelta {
  if (!previous || !current) {
    return {
      courseId: current?.courseId ?? previous?.courseId ?? "unknown",
      previousObservedAt: previous?.observedAt ?? "",
      latestObservedAt: current?.observedAt ?? "",
      previousTotalUnits: previous?.sections.reduce((a, s) => a + (s.totalUnits || 0), 0) ?? 0,
      latestTotalUnits: current?.sections.reduce((a, s) => a + (s.totalUnits || 0), 0) ?? 0,
      deltaCompletedUnits: null,
      status: "insufficient_observation" as ComparabilityStatus,
    };
  }

  const prevTotal = previous.sections.reduce((acc, s) => acc + (s.totalUnits || 0), 0);
  const currTotal = current.sections.reduce((acc, s) => acc + (s.totalUnits || 0), 0);
  const prevCompleted = previous.sections.reduce((acc, s) => acc + (s.completedUnits || 0), 0);
  const currCompleted = current.sections.reduce((acc, s) => acc + (s.completedUnits || 0), 0);

  // Core epistemological rule:
  // If denominator changed across snapshots, the tree was restructured by the source.
  // We MUST NOT calculate a deltaCompletedUnits as "progress".
  if (prevTotal === currTotal && previous.sections.length === current.sections.length) {
    return {
      courseId: current.courseId,
      previousObservedAt: previous.observedAt,
      latestObservedAt: current.observedAt,
      previousTotalUnits: prevTotal,
      latestTotalUnits: currTotal,
      deltaCompletedUnits: currCompleted - prevCompleted,
      status: "comparable" as ComparabilityStatus,
    };
  }

  return {
    courseId: current.courseId,
    previousObservedAt: previous.observedAt,
    latestObservedAt: current.observedAt,
    previousTotalUnits: prevTotal,
    latestTotalUnits: currTotal,
    deltaCompletedUnits: null, // Strictly null: denominator shifted
    status: "structural_change" as ComparabilityStatus,
  };
}
