import { describe, expect, it } from 'vitest';
import { gameDayFromISO } from '../src/runtime/game-calendar';
import { gameCalendarOccasions, isJapanesePublicHoliday, japanPublicHoliday,
  residentBirthdays, upcomingGameCalendarOccasions } from '../src/runtime/japan-calendar-events';
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
  it('labels future holiday projections and bounds upcoming lookahead', () => {
    expect(japanPublicHoliday(at('2028-03-20'))?.projected).toBe(true);
    expect(() => upcomingGameCalendarOccasions(at('2025-08-28'), 367)).toThrow();
  });
});
