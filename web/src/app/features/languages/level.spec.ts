import { levelView } from './level';

const sec = (i: number, level: string | null, completed: number, total: number) => ({ sectionId: 's' + i, sectionIndex: i, cefrLevel: level, completedUnits: completed, totalUnits: total });
// A1 20/20, A2 20/20, B1 18/40, B2 0/30, C1 0/10: 58 of 120 units
const course = () => ({ sections: [sec(1, 'A1', 20, 20), sec(2, 'A2', 20, 20), sec(3, 'B1', 18, 40), sec(4, 'B2', 0, 30), sec(5, 'C1', 0, 10)] });
const delta = (o: Record<string, unknown> = {}) => ({ courseId: 'EN', status: 'comparable', deltaTotalUnits: 0, deltaCompletedUnits: 7, previousObservedAt: '2026-10-15T10:00:00Z', ...o });

describe('levelView: the level a course has reached', () => {
  it('shouldCallTheCurrentLevelTheFirstOneNotCompleted', () => {
    const v = levelView(course(), undefined)!;
    expect(v.level).toBe('B1');
    expect(v.levels.map((l) => [l.name, l.units, l.current])).toEqual([['A1', 20, false], ['A2', 20, false], ['B1', 40, true], ['B2', 30, false], ['C1', 10, false]]);
  });

  it('shouldGiveTheUnitsAndTheShareOfTheCurrentLevelAndOfTheCourse', () => {
    const v = levelView(course(), undefined)!;
    expect(v.levelText).toBe('18 de 40 unidades · 45,0 %');
    expect(v.levelPct).toBe(45);
    expect(v.dividers.map((d) => Math.round(d * 10) / 10)).toEqual([16.7, 33.3, 66.7, 91.7]); // where each level ends along the course bar
  });

  it('shouldSayHowManyUnitsAreLeftToStartTheNextLevel', () => {
    expect(levelView(course(), undefined)!.sentence).toBe('Te faltan 22 unidades para empezar B2.');
  });

  it('shouldSayHowManyAreLeftToFinishTheCourseWhenItIsTheLastLevel', () => {
    const c = { sections: [sec(1, 'A1', 20, 20), sec(2, 'A2', 5, 20)] };
    const v = levelView(c, undefined)!;
    expect(v.level).toBe('A2');
    expect(v.sentence).toBe('Te faltan 15 unidades para terminar el curso.');
  });

  it('shouldKeepTheLastLevelAndCongratulateWhenEverythingIsDone', () => {
    const v = levelView({ sections: [sec(1, 'A1', 20, 20), sec(2, 'A2', 20, 20)] }, undefined)!;
    expect(v.level).toBe('A2');
    expect(v.sentence).toBe('Has completado todos los niveles del curso.');
  });

  it('shouldAddTheSectionsOfTheSameLevelInOneStep', () => {
    const v = levelView({ sections: [sec(1, 'A1', 10, 10), sec(2, 'A1', 5, 10), sec(3, 'A2', 0, 10)] }, undefined)!;
    expect(v.levels.map((l) => [l.name, l.units])).toEqual([['A1', 20], ['A2', 10]]);
    expect(v.levelText).toBe('15 de 20 unidades · 75,0 %');
  });

  it('shouldGiveNothingWhenASectionHasNoLevelBecauseTheLevelsWouldNotCoverTheCourse', () => {
    expect(levelView({ sections: [sec(1, 'A1', 5, 10), sec(2, null, 1, 4)] }, undefined)).toBeNull();
  });

  it('shouldGiveNothingWithoutSectionsOrUnits', () => {
    expect(levelView(undefined, undefined)).toBeNull();
    expect(levelView({ sections: [] }, undefined)).toBeNull();
    expect(levelView({ sections: [sec(1, 'A1', 0, 0)] }, undefined)).toBeNull();
  });

  it('shouldSayWhatChangedSinceTheComparableObservation', () => {
    expect(levelView(course(), delta())!.change).toBe('+7 unidades desde el 15 oct 2026');
    expect(levelView(course(), delta({ deltaCompletedUnits: 1 }))!.change).toBe('+1 unidad desde el 15 oct 2026');
    expect(levelView(course(), delta({ deltaCompletedUnits: 0 }))!.change).toBe('Sin avance desde el 15 oct 2026');
  });

  it('shouldNotInventAChangeWhenTheCourseChangedSizeOrThereIsNoObservation', () => {
    expect(levelView(course(), delta({ deltaTotalUnits: 4 }))!.change).toBe('');
    expect(levelView(course(), delta({ status: 'insufficient_observation' }))!.change).toBe('');
    expect(levelView(course(), undefined)!.change).toBe('');
  });
});
