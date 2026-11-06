// Course and XP helpers shared by Hoy and Idiomas (src/dashboard.client.js: flag, xpText, activeDaysText,
// getCourseProgress :136, resolveSelectedCourseId :388).

export interface Course { courseId: string; title?: string | null; xp?: number | null; fromLanguage?: string | null; learningLanguage?: string | null }
export interface Langs {
  totalXp?: number | null; streak?: number | null; currentCourseId?: string | null; updatedAt?: string | null; createdAt?: string | null;
  totalXpObservedAt?: string | null; streakObservedAt?: string | null; courses?: Course[];
}
export interface XpDay { date: string | number; gainedXp?: number | null; numSessions?: number | null; totalSessionTime?: number | null }
export interface Section {
  sectionId?: string | null; sectionIndex?: number | string | null; type?: string | null; cefrLevel?: string | null; cefrSublevel?: string | number | null;
  completedUnits?: number | null; totalUnits?: number | null; lastSeenAt?: string | null;
}
/** GET /api/languages/courses/:id */
export interface CourseDetail { course?: Course; sections?: Section[]; completedUnits?: number | null; totalUnits?: number | null }

export const SELECTED_COURSE_KEY = 'longitudinal_selected_course';
const FLAGS: Record<string, string> = { es: '🇪🇸', fr: '🇫🇷', en: '🇬🇧', ja: '🇯🇵', zh: '🇨🇳', it: '🇮🇹', de: '🇩🇪', ru: '🇷🇺', pt: '🇵🇹', ko: '🇰🇷', ar: '🇸🇦', hi: '🇮🇳' };

export const flag = (code?: string | null) => FLAGS[String(code || '').toLowerCase()] ?? '🌐';
export const es = (n: number) => n.toLocaleString('es-ES');
export const xpText = (v: number | null | undefined) => v == null ? '—' : es(Number(v));
/** An XP summary date (epoch seconds, epoch ms or ISO) as 'YYYY-MM-DD' (UTC). */
export const toDay = (v: string | number) => typeof v === 'string' ? v.slice(0, 10) : new Date(v > 1e11 ? v : v * 1000).toISOString().slice(0, 10);

// P7: "90/90" says nothing when every day has XP; what matters is how far back the record goes.
export const activeDaysText = (active: number, total: number, firstSec: number | null | undefined) =>
  `${active} de ${total} días con XP` + (firstSec && isFinite(firstSec) ? ` (registro desde ${new Date(firstSec * 1000).toISOString().slice(0, 10)})` : '');

/** The last seven UTC days, oldest first, with the Spanish day letter. */
export const lastSevenDays = () => {
  const now = new Date();
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 6 + i));
    return { date: d.toISOString().slice(0, 10), letter: 'DLMXJVS'[d.getUTCDay()] };
  });
};

/** Units of a course detail: the sum of its sections, else its own totals. */
export function courseProgress(detail: CourseDetail | null | undefined): { completed: number; total: number } {
  let completed = 0, total = 0;
  if (detail?.sections) for (const s of detail.sections) { completed += s.completedUnits || 0; total += s.totalUnits || 0; }
  else if (detail?.totalUnits != null) { completed = detail.completedUnits || 0; total = detail.totalUnits || 0; }
  return { completed, total };
}

/** Requested id (the URL) if it is in the catalogue, else the saved selection if still there, else courses[0] (the API sorts by XP desc). */
export function resolveSelectedCourseId(courses: Course[], requested?: string | null): string | null {
  if (!courses.length) return null;
  if (requested && courses.some((c) => c.courseId === requested)) return requested;
  let stored: string | null = null;
  try { stored = localStorage.getItem(SELECTED_COURSE_KEY); } catch { /* storage blocked: fall through */ }
  return stored && courses.some((c) => c.courseId === stored) ? stored : courses[0].courseId;
}
