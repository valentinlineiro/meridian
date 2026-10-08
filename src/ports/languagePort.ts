export interface UserStateRow {
  user_id: string;
  total_xp: number | null;
  streak: number | null;
  current_course_id: string | null;
  updated_at: string; // last time a snapshot was applied, NOT when the fields below were observed
  total_xp_observed_at: string | null;
  streak_observed_at: string | null;
  current_course_observed_at: string | null;
}

export interface CourseRow {
  course_id: string;
  title: string | null;
  learning_language: string | null;
  from_language: string | null;
  subject: string | null;
  topic: string | null;
  xp: number | null;
  last_seen_at: string;
}

export interface SectionRow {
  section_id: string;
  section_index: number;
  type: string | null;
  cefr_level: string | null;
  cefr_sublevel: string | number | null;
  completed_units: number;
  total_units: number;
  last_seen_at: string;
}

export interface XpSummaryRow {
  user_id: string;
  date: string | number;
  gained_xp: number;
  num_sessions: number;
  total_session_time: number;
  streak_extended: number | boolean;
  frozen: number | boolean;
  repaired: number | boolean;
  updated_at: string;
}

export interface LanguagePort {
  resolveUserId(explicitUserId?: string | null): Promise<string | null>;
  getUserState(userId: string): Promise<UserStateRow | null>;
  getUserCourses(userId: string): Promise<CourseRow[]>;
  getCourse(userId: string, courseId: string): Promise<CourseRow | null>;
  getCourseSections(userId: string, courseId: string): Promise<SectionRow[]>;
  getXpSummaries(userId: string, days: number): Promise<XpSummaryRow[]>;
}
