import { dirtyGames, isTime, maskTime, plan } from './games-register.model';

const ALL = ['zip', 'tango'];

describe('maskTime', () => {
  it.each([['4', '0:04'], ['48', '0:48'], ['106', '1:06'], ['1234', '12:34'], ['12345', '12:34'], ['1:06', '1:06'], ['0:48', '0:48'], ['0:04', '0:04']])('shouldRead %s as %s', (raw, shown) => expect(maskTime(raw)).toBe(shown));
  it('shouldEmptyWhenOnlyZerosOrNothingIsLeft', () => {
    for (const raw of ['', '0', '0:0', '0:00', 'x']) expect(maskTime(raw)).toBe('');
  });
  it('shouldRemoveADigitNotTheColonOnBackspace', () => {
    expect(maskTime('1:0')).toBe('0:10'); // 1:06 minus its last digit
    expect(maskTime('0:4')).toBe('0:04');
  });
});

describe('plan', () => {
  it('shouldSetFilledRowsAndOmitTheEmptyAverage', () => {
    const p = plan({ zip: { score: '0:48', avg: '' } }, new Set(), {}, ALL);
    expect(p).toEqual({ set: [{ game: 'zip', score: '0:48' }], remove: [], errors: {} });
  });
  it('shouldClearAStoredAverageThatWasEmptied', () => {
    const p = plan({ zip: { score: '0:48', avg: '' } }, new Set(), { zip: { score: '0:48', avg: '0:53' } }, ALL);
    expect(p.set).toEqual([{ game: 'zip', score: '0:48', avg: null }]);
  });
  it('shouldRemoveOnlyStoredGamesMarkedForRemoval', () => {
    const p = plan({}, new Set(['zip', 'tango']), { zip: { score: '0:48' } }, ALL);
    expect(p.remove).toEqual(['zip']);
  });
  it('shouldRefuseAnAverageWithoutATimeAndAnUnreadableTime', () => {
    const p = plan({ zip: { score: '', avg: '0:53' }, tango: { score: '0:75', avg: '' } }, new Set(), {}, ALL);
    expect(p.set).toEqual([]);
    expect(p.errors['zip']!.text).toBe('Falta tu tiempo. La media sola no se guarda.');
    expect(p.errors['tango']).toMatchObject({ field: 'score', text: '«0:75» no es un tiempo. Escríbelo como m:ss, por ejemplo 1:06.' });
  });
  it('shouldAcceptOnlyTimesTheServerAccepts', () => {
    expect(['1:06', '12:34', '0:59'].every(isTime)).toBe(true);
    expect(['106', '1:6', '0:60', ''].some(isTime)).toBe(false);
  });
});

describe('dirtyGames', () => {
  it('shouldNameTheGamesThatDifferFromWhatIsStoredInRowOrder', () => {
    const stored = { zip: { score: '0:48', avg: null } };
    expect(dirtyGames({ zip: { score: '0:48', avg: '' }, tango: { score: '', avg: '' } }, new Set(), stored, ALL)).toEqual([]);
    expect(dirtyGames({ zip: { score: '0:40', avg: '' }, tango: { score: '1:02', avg: '' } }, new Set(), stored, ALL)).toEqual(['zip', 'tango']);
    expect(dirtyGames({}, new Set(['zip']), stored, ALL)).toEqual(['zip']);
  });
});
