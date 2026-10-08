// Shape of the observation rows of the frozen P2 contract (§3.1). Pure data: the extractor produces them, the db layer stores them.

export const EXTRACTOR_VERSION = 1;

// `isAuxiliary` is the ingestion flag of the snapshot (ingestion contract v0.2: an auxiliary snapshot never speaks for
// the account). The extractor applies that existing rule; it does not reinterpret the snapshot. Backfill must pass the
// stored `snapshots.is_auxiliary`, so ingest and backfill extract the same rows.
export type ObservationMeta = { snapshotId: string; userId: string; observedAt: string; isAuxiliary?: boolean };

export type AccountObservation = { totalXp: number | null; streak: number | null; declaredCourseId: string | null };
export type CourseObservation = { courseId: string; subject: string | null; learningLanguage: string | null; fromLanguage: string | null; title: string | null; xp: number | null };
export type PathObservation = { courseId: string | null; activeSectionId: string | null; formatError: string | null };
export type SectionObservation = { sectionIndex: number; sectionId: string; type: string | null; cefrLevel: string | null; cefrSublevel: number | null; completedUnits: number | null; totalUnits: number | null };

export type Observations = {
  account: AccountObservation | null;
  courses: CourseObservation[];
  path: PathObservation | null;
  sections: SectionObservation[];
  elo: number | null;
};

export type Extraction = { ok: true; meta: ObservationMeta; observations: Observations } | { ok: false; reason: string };
