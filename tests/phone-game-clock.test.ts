import { describe, expect, it, vi } from 'vitest';
import { gameCalendar } from '../src/runtime/game-calendar';
import { gamePhoneClockFromSnapshot, readGamePhoneClock } from '../src/frontend/phone-game-clock';

type Owner = 'soyo' | 'sakiko' | 'emma' | 'renako';
function snapshot(owner: Owner, day: number, hour: number, minute: number) {
  return {
    active: owner,
    deviceId: `unread-city-phone-${owner}`,
    clock: { day, hour, minute },
    calendarDate: gameCalendar(day),
  };
}

describe('embedded phone fictional time source', () => {
  it('shows the canonical first day and precise in-game minute, not the device date', () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2035-12-31T23:59:00.000Z'));
      const result = gamePhoneClockFromSnapshot(snapshot('soyo', 1, 17, 20));
      expect(result).toMatchObject({ time: '17:20', label: '8月28日星期四' });
      expect(result?.date.toISOString()).toBe('2025-08-28T17:20:00.000Z');
    } finally {
      vi.useRealTimers();
    }
  });

  it('shares one advancing world clock across all four protagonists', () => {
    for (const owner of ['soyo', 'sakiko', 'emma', 'renako'] as const) {
      expect(gamePhoneClockFromSnapshot(snapshot(owner, 5, 10, 5))).toMatchObject({
        time: '10:05', label: '9月1日星期一',
      });
    }
    expect(gamePhoneClockFromSnapshot(snapshot('emma', 1, 23, 59))?.time).toBe('23:59');
    expect(gamePhoneClockFromSnapshot(snapshot('renako', 2, 0, 0))).toMatchObject({
      time: '00:00', label: '8月29日星期五',
    });
  });

  it('derives calendar day and weekday from UTC, never the local device timezone', () => {
    const atMidnight = gamePhoneClockFromSnapshot(snapshot('sakiko', 5, 0, 1));
    expect(atMidnight?.date.getUTCHours()).toBe(0);
    expect(atMidnight?.date.getUTCDate()).toBe(1);
    expect(atMidnight?.date.getUTCDay()).toBe(1);
    expect(atMidnight?.date.getUTCMonth()).toBe(8);
  });

  it('rejects stale, cross-device and invalid snapshots rather than showing real time', () => {
    const valid = snapshot('renako', 5, 9, 30);
    expect(gamePhoneClockFromSnapshot({ ...valid, deviceId: 'unread-city-phone-soyo' })).toBeNull();
    expect(gamePhoneClockFromSnapshot({ ...valid, calendarDate: gameCalendar(4) })).toBeNull();
    expect(gamePhoneClockFromSnapshot({ ...valid, clock: { ...valid.clock, minute: 60 } })).toBeNull();
    expect(gamePhoneClockFromSnapshot({ ...valid, clock: { ...valid.clock, hour: 24 } })).toBeNull();
    expect(gamePhoneClockFromSnapshot({ ...valid, clock: { ...valid.clock, day: 1.5 } })).toBeNull();
    expect(gamePhoneClockFromSnapshot({ ...valid, calendarDate: { iso: '2025-09-31' } })).toBeNull();
    expect(gamePhoneClockFromSnapshot(null)).toBeNull();
  });

  it('reads the current world-phone state anew after a protagonist switch or game-time advance', () => {
    let active = snapshot('soyo', 1, 17, 20);
    const read = vi.fn(() => active);
    const child = { parent: { __unreadCityWorldPhone: { read } } } as unknown as Window;
    expect(readGamePhoneClock(child)?.time).toBe('17:20');
    active = snapshot('emma', 2, 0, 5);
    expect(readGamePhoneClock(child)).toMatchObject({ time: '00:05', label: '8月29日星期五' });
    active = { ...snapshot('emma', 2, 0, 5), weather: { id: 'sunny', label: '晴', icon: '☀️' } } as ReturnType<typeof snapshot> & { weather: { id: string; label: string; icon: string } };
    expect(readGamePhoneClock(child)?.label).toBe('8月29日星期五 ☀️晴');
    expect(read).toHaveBeenCalledTimes(3);
  });

  it('does not expose host device time when disconnected or blocked by a chat switch', () => {
    const absent = { parent: {} } as unknown as Window;
    const inactive = { parent: { __unreadCityWorldPhone: { read() { throw new Error('session ended'); } } } } as unknown as Window;
    const crossOrigin = Object.defineProperty({}, 'parent', { get() { throw new Error('origin denied'); } }) as Window;
    expect(readGamePhoneClock(absent)).toBeNull();
    expect(readGamePhoneClock(inactive)).toBeNull();
    expect(readGamePhoneClock(crossOrigin)).toBeNull();
  });
});
