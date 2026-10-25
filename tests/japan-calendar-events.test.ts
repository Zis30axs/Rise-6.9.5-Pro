import { describe, expect, it } from 'vitest';
import { gameDayFromISO } from '../src/runtime/game-calendar';
import { gameCalendarOccasions, isJapanesePublicHoliday, japanPublicHoliday,
  bangDreamBirthdays, characterBirthdays, residentBirthdays, upcomingGameCalendarOccasions, watanareBirthdays } from '../src/runtime/japan-calendar-events';
const at = (date: string) => gameDayFromISO(date);
describe('Japanese civil holidays and documented Majo birthdays', () => {
  it('uses 2025 announced dates including substitute rest days', () => {
    expect(japanPublicHoliday(at('2025-09-15'))?.name).toBe('敬老之日');
    expect(japanPublicHoliday(at('2025-11-24'))?.kind).toBe('substitute-holiday');
    expect(japanPublicHoliday(at('2025-10-12'))).toBeNull();
    expect(japanPublicHoliday(at('2025-10-13'))?.name).toBe('体育之日');
  });
  it('applies 2026 Golden Week transfer and bridge holiday', () => {
    expect(japanPublicHoliday(at('2026-05-06'))?.kind).toBe('substitute-holiday');
    expect(japanPublicHoliday(at('2026-09-21'))?.name).toBe('敬老之日');
    expect(japanPublicHoliday(at('2026-09-22'))?.kind).toBe('citizens-holiday');
    expect(japanPublicHoliday(at('2026-09-23'))?.name).toBe('秋分之日');
    expect(isJapanesePublicHoliday(at('2026-09-22'))).toBe(true);
  });
  it('uses 2027 officially published equinox', () => {
    expect(japanPublicHoliday(at('2027-03-21'))?.name).toBe('春分之日');
    expect(japanPublicHoliday(at('2027-03-22'))?.kind).toBe('substitute-holiday');
  });
  it('does not treat cultural celebrations or birthdays as national vacations', () => {
    expect(gameCalendarOccasions(at('2025-10-31'))).toMatchObject([{ kind: 'festival', dayOff: false }]);
    expect(gameCalendarOccasions(at('2025-12-25')).map(e => e.name))
      .toEqual(['圣诞节', '冰上梅露露的生日']);
    expect(gameCalendarOccasions(at('2025-10-15'))[0])
      .toMatchObject({ kind: 'birthday', personId: 'majo-margo', dayOff: false });
  });
  it('takes 13 known birthdays directly from worldbook and keeps annual stable IDs', () => {
    expect(residentBirthdays).toHaveLength(13);
    expect(residentBirthdays.some(e => e.personId === 'majo-yuki')).toBe(false);
    const events = upcomingGameCalendarOccasions(at('2025-10-10'), 10);
    expect(events.some(e => e.personId === 'majo-margo')).toBe(true);
    expect(upcomingGameCalendarOccasions(at('2025-10-10'), 10)).toEqual(events);
    expect(gameCalendarOccasions(at('2025-08-28'))).toEqual([]);
  });
  it('reads all ten MyGO!!!!! / Ave Mujica birthdays and five Watanare Quintet birthdays from canon profiles', () => {
    expect(bangDreamBirthdays).toHaveLength(10);
    expect(bangDreamBirthdays.map(({ personId, month, date }) => [personId, month, date])).toEqual([
      ['soyo', 5, 27], ['sakiko', 2, 14], ['bang-tomori', 11, 22],
      ['bang-anon', 9, 8], ['bang-taki', 8, 9], ['bang-rana', 2, 22],
      ['bang-mutsumi', 1, 14], ['bang-uika', 6, 26],
      ['bang-umiri', 4, 7], ['bang-nyamu', 6, 1],
    ]);
    expect(watanareBirthdays).toHaveLength(5);
    expect(watanareBirthdays.map(({ personId, month, date }) => [personId, month, date])).toEqual([
      ['watanare-renako', 3, 3],
      ['watanare-mai', 9, 1],
      ['watanare-ajisai', 6, 24],
      ['watanare-satsuki', 5, 15],
      ['watanare-kaho', 11, 11],
    ]);
    expect(characterBirthdays).toHaveLength(28);
    expect(new Set(characterBirthdays.map(e => e.personId)).size).toBe(28);
    expect(residentBirthdays).toHaveLength(13);
  });
  it('shows both Valentine and Sakiko birthday, without gifts or duplicated annual events', () => {
    const valentine = gameCalendarOccasions(at('2026-02-14'));
    expect(valentine.map(e => e.name)).toEqual(['情人节', '丰川祥子的生日']);
    expect(valentine[1]).toMatchObject({ kind: 'birthday', personId: 'sakiko', dayOff: false });
    const soyo = gameCalendarOccasions(at('2026-05-27'));
    expect(soyo).toMatchObject([{ name: '长崎素世的生日', personId: 'soyo', dayOff: false }]);
    const renako = gameCalendarOccasions(at('2026-03-03'));
    expect(renako).toMatchObject([{ name: '甘织玲奈子的生日', personId: 'watanare-renako', dayOff: false }]);
    const next = upcomingGameCalendarOccasions(at('2025-09-01'), 14);
    expect(next.filter(e => e.personId === 'bang-anon')).toHaveLength(1);
    expect(gameCalendarOccasions(at('2026-02-14'))).toEqual(valentine);
    expect(gameCalendarOccasions(at('2027-02-14')).filter(e => e.personId === 'sakiko')).toHaveLength(1);
    expect(gameCalendarOccasions(at('2027-02-14')).find(e => e.personId === 'sakiko')?.id).not.toBe(valentine[1].id);
  });
  it('labels future holiday projections and bounds upcoming lookahead', () => {
    expect(japanPublicHoliday(at('2028-03-20'))?.projected).toBe(true);
    expect(() => upcomingGameCalendarOccasions(at('2025-08-28'), 367)).toThrow();
  });
});
