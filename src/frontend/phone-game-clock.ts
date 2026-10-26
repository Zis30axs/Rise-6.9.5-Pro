/**
 * Only the character card's shared world clock may drive the embedded phone's
 * status bar, home/lock screen and Today clock/calendar widgets.
 * All dates use UTC civil fields; the viewer's timezone and Date.now() are
 * deliberately excluded. The standalone ST-iPhonie extension is unchanged.
 */
const GAME_DAY_ONE_UTC = Date.UTC(2025, 7, 28);
const GAME_DAY_MS = 86_400_000;
const GAME_DAY_LIMIT = 365_000;
const PROTAGONISTS = new Set(['soyo', 'sakiko', 'emma', 'renako']);
const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'] as const;

export interface GamePhoneClockReading {
  time: string;
  label: string;
  /** UTC components represent the fictional local date and time. */
  date: Date;
}

/** A narrow, validated projection of the world-phone API, not a system clock. */
export function gamePhoneClockFromSnapshot(raw: unknown): GamePhoneClockReading | null {
  if (!raw || typeof raw !== 'object') return null;
  const { active, deviceId, clock, calendarDate } = raw as Record<string, unknown>;
  if (typeof active !== 'string' || !PROTAGONISTS.has(active) || deviceId !== `unread-city-phone-${active}`) return null;
  if (!clock || typeof clock !== 'object' || !calendarDate || typeof calendarDate !== 'object') return null;
  const { day, hour, minute } = clock as Record<string, unknown>;
  const { iso } = calendarDate as Record<string, unknown>;
  if (typeof day !== 'number' || !Number.isSafeInteger(day) || day < 1 || day > GAME_DAY_LIMIT ||
      typeof hour !== 'number' || !Number.isInteger(hour) || hour < 0 || hour > 23 ||
      typeof minute !== 'number' || !Number.isInteger(minute) || minute < 0 || minute > 59 ||
      typeof iso !== 'string') return null;
  const matched = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!matched) return null;
  // Keep the shared game-calendar.ts day-one invariant; a stale/mixed snapshot
  // must never silently fall back to the viewer's real-world system date.
  const expectedDay = new Date(GAME_DAY_ONE_UTC + (day - 1) * GAME_DAY_MS);
  if (expectedDay.toISOString().slice(0, 10) !== iso) return null;
  const date = new Date(Date.UTC(Number(matched[1]), Number(matched[2]) - 1, Number(matched[3]), hour, minute));
  if (date.toISOString().slice(0, 10) !== iso || date.getUTCHours() !== hour || date.getUTCMinutes() !== minute) return null;
  return {
    time: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
    label: `${date.getUTCMonth() + 1}月${date.getUTCDate()}日星期${WEEKDAYS[date.getUTCDay()]}`,
    date,
  };
}

/** Read the current chat's authoritative clock; absent/mismatched sessions are blank. */
export function readGamePhoneClock(win: Window): GamePhoneClockReading | null {
  try {
    const host = win.parent as Window & { __unreadCityWorldPhone?: { read(): unknown } };
    return gamePhoneClockFromSnapshot(host.__unreadCityWorldPhone?.read());
  } catch {
    // Chat switches, teardown and inaccessible parent frames must not expose
    // the local device clock or a previous protagonist's stale time.
    return null;
  }
}
