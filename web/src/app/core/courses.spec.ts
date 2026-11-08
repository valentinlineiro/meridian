import { activeDaysSub, activeDaysText, courseProgress, flag, resolveSelectedCourseId, SELECTED_COURSE_KEY, toDay, xpText } from './courses';

describe('courses', () => {
  const courses = [{ courseId: 'A' }, { courseId: 'B' }, { courseId: 'C' }];
  beforeEach(() => localStorage.clear());

  it('shouldPreferTheRequestedCourseWhenItIsInTheCatalogue', () => {
    localStorage.setItem(SELECTED_COURSE_KEY, 'B');
    expect(resolveSelectedCourseId(courses, 'C')).toBe('C');
  });
  it('shouldFallBackToTheSavedCourseThenTheFirstWhenTheRequestIsUnknown', () => {
    expect(resolveSelectedCourseId(courses, 'NOPE')).toBe('A');
    localStorage.setItem(SELECTED_COURSE_KEY, 'B');
    expect(resolveSelectedCourseId(courses, 'NOPE')).toBe('B');
    localStorage.setItem(SELECTED_COURSE_KEY, 'GONE');
    expect(resolveSelectedCourseId(courses)).toBe('A');
  });
  it('shouldResolveNothingWhenTheCatalogueIsEmpty', () => expect(resolveSelectedCourseId([], 'A')).toBeNull());

  it('shouldAddSectionUnitsOrUseTheTopLevelOnes', () => {
    expect(courseProgress({ sections: [{ completedUnits: 3, totalUnits: 10 }, { completedUnits: null, totalUnits: 5 }] })).toEqual({ completed: 3, total: 15 });
    expect(courseProgress({ completedUnits: 2, totalUnits: 4 })).toEqual({ completed: 2, total: 4 });
    expect(courseProgress(null)).toEqual({ completed: 0, total: 0 });
  });

  it('shouldFormatFlagsXpAndDays', () => {
    expect(flag('RU')).toBe('🇷🇺');
    expect(flag('xb')).toBe('🌐');
    expect(xpText(421500)).toBe('421.500');
    expect(xpText(null)).toBe('—');
    expect(toDay(1782345600)).toBe('2026-06-25');
    expect(toDay(1782345600000)).toBe('2026-06-25');
    expect(toDay('2026-06-25T10:00:00Z')).toBe('2026-06-25');
  });

  // port of frontendDeltas shouldSayHowFarBackTheXpRecordGoesInsteadOfASaturatedRatio
  it('shouldSayHowFarBackTheXpRecordGoesInsteadOfASaturatedRatio', () => {
    expect(activeDaysText(90, 90)).toBe('90 de 90 días');
    expect(activeDaysSub(1782345600)).toBe('con XP · registro desde 25 jun 2026');
    expect(activeDaysSub(null)).toBe('con XP');
    expect(activeDaysSub(NaN)).toBe('con XP');
  });
});
