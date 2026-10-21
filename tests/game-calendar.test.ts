import { describe, expect, it } from 'vitest';
import {
  FRESHMAN_REGISTRATION_DATE, FRESHMAN_REGISTRATION_DAY, GAME_START_DATE,
  formatGameDate, formatGameStamp, gameCalendar, gameDateISO, gameDayFromISO,
  gameWeekday, hasStartedAcademicWeek, registrationNotice,
} from '../src/runtime/game-calendar';
import { createInitialState, parseState, reduceState } from '../src/runtime/model';
import { enableProtagonists } from '../src/runtime/protagonist-world';

describe('canonical game calendar from the freshman reporting prologue', () => {
  it('anchors day 1 on Thu Aug 28, 2025 and freshman reporting on Monday Sep 1', () => {
    expect(GAME_START_DATE).toBe('2025-08-28');
    expect(FRESHMAN_REGISTRATION_DATE).toBe('2025-09-01');
    expect(FRESHMAN_REGISTRATION_DAY).toBe(5);
    expect(gameCalendar(1)).toEqual({
      iso: '2025-08-28', year: 2025, month: 8, date: 28, weekday: 4, weekdayLabel: '周四',
    });
    expect(gameWeekday(4)).toBe(7);
    expect(gameCalendar(5).weekdayLabel).toBe('周一');
    expect(formatGameDate(5)).toBe('2025年9月1日');
    expect(registrationNotice(1)).toContain('还有 4 天');
    expect(registrationNotice(5)).toContain('本人决定');
    expect(registrationNotice(6)).toBe('');
    expect(hasStartedAcademicWeek(4)).toBe(false);
    expect(hasStartedAcademicWeek(5)).toBe(false);
    expect(hasStartedAcademicWeek(6)).toBe(true);
  });

  it('crosses calendar months, years and leap days using UTC rather than local time', () => {
    for (const iso of ['2025-08-28', '2025-08-31', '2025-09-01', '2025-12-31', '2026-01-01', '2028-02-29', '2028-03-01']) {
      expect(gameDateISO(gameDayFromISO(iso))).toBe(iso);
    }
    expect(gameCalendar(gameDayFromISO('2026-01-01')).weekdayLabel).toBe('周四');
    expect(gameDayFromISO('2028-03-01') - gameDayFromISO('2028-02-29')).toBe(1);
  });

  it('rejects invalid or out-of-range dates instead of silently normalizing them', () => {
    for (const iso of ['2025-08-27', '2025-02-30', '2025-09-31', '2025-00-01', '2026/01/01', 'bad']) {
      expect(() => gameDayFromISO(iso)).toThrow();
    }
    for (const day of [0, -1, 2.5, Number.NaN, 365001]) expect(() => gameCalendar(day)).toThrow();
  });

  it('preserves old day-count saves and shows real dates without rewriting receipts', () => {
    const state = createInitialState();
    expect(state.clock).toEqual({ day: 1, hour: 17, minute: 20 });
    expect(gameDateISO(state.clock.day)).toBe('2025-08-28');
    expect(formatGameStamp(state.journal[0].at)).toBe('2025年8月28日 周四 17:20');
    expect(state.journal[0].at).toBe('第 1 天 17:20');
    const restored = parseState(JSON.parse(JSON.stringify(state)));
    expect(restored).toEqual(state);
    const dual = enableProtagonists(state);
    expect(gameDateISO(reduceState(dual, { type: 'switch_protagonist', target: 'sakiko' }).clock.day)).toBe('2025-08-28');
    const nearMidnight = parseState({ ...state, clock: { day: 4, hour: 23, minute: 50 } });
    const advanced = reduceState(nearMidnight, { type: 'wait', minutes: 20 });
    expect(advanced.clock).toEqual({ day: 5, hour: 0, minute: 10 });
    expect(gameDateISO(advanced.clock.day)).toBe('2025-09-01');
    expect(formatGameStamp('某个无法识别的旧时间')).toBe('某个无法识别的旧时间');
  });
});
