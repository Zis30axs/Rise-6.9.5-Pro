/**
 * Canonical fictional civil calendar. One shared game day is exactly 1440 game
 * minutes; UTC arithmetic prevents browser timezone and DST from rewriting it.
 * Day 1 remains the existing save's day 1 (no save-schema migration needed).
 */
export const GAME_START_DATE = '2025-08-28';
export const FRESHMAN_REGISTRATION_DATE = '2025-09-01';
export const GAME_DAY_LIMIT = 365_000;
const DAY_MS = 86_400_000;
const START_UTC = Date.UTC(2025, 7, 28);
const WEEKDAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'] as const;

export interface GameCalendarDate {
  iso: string;
  year: number;
  month: number;
  date: number;
  /** ISO weekday: Monday=1, Sunday=7. */
  weekday: number;
  weekdayLabel: (typeof WEEKDAYS)[number];
}

export function gameCalendar(day: number): GameCalendarDate {
  if (!Number.isSafeInteger(day) || day < 1 || day > GAME_DAY_LIMIT) throw new Error('游戏日期超出允许范围');
  const date = new Date(START_UTC + (day - 1) * DAY_MS);
  const weekday = (date.getUTCDay() + 6) % 7 + 1;
  return {
    iso: date.toISOString().slice(0, 10),
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    date: date.getUTCDate(),
    weekday,
    weekdayLabel: WEEKDAYS[weekday - 1],
  };
}

export function gameDateISO(day: number): string { return gameCalendar(day).iso; }
export function gameWeekday(day: number): number { return gameCalendar(day).weekday; }
export function formatGameDate(day: number): string {
  const { year, month, date } = gameCalendar(day);
  return `${year}年${month}月${date}日`;
}

/** Reject nonexistent civil dates and dates outside the game's save bounds. */
export function gameDayFromISO(iso: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) throw new Error('日期格式必须为 YYYY-MM-DD');
  const milliseconds = Date.parse(`${iso}T00:00:00.000Z`);
  if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString().slice(0, 10) !== iso) throw new Error('日期无效');
  const day = (milliseconds - START_UTC) / DAY_MS + 1;
  if (!Number.isSafeInteger(day) || day < 1 || day > GAME_DAY_LIMIT) throw new Error('日期不在游戏时间范围内');
  return day;
}

export const FRESHMAN_REGISTRATION_DAY = gameDayFromISO(FRESHMAN_REGISTRATION_DATE);

/** Reporting is a plot milestone, not a silently completed player action. */
export function registrationNotice(day: number): string {
  if (day < FRESHMAN_REGISTRATION_DAY) return `距离大一报到还有 ${FRESHMAN_REGISTRATION_DAY - day} 天 · ${formatGameDate(FRESHMAN_REGISTRATION_DAY)}`;
  if (day === FRESHMAN_REGISTRATION_DAY) return `今天是大一报到日 · ${formatGameDate(day)}。报到是否完成由本人决定。`;
  return '';
}

/** No recurring lectures before or on the freshman reporting day. */
export function hasStartedAcademicWeek(day: number): boolean { return day > FRESHMAN_REGISTRATION_DAY; }

/** Historical receipts remain in their old save representation, only UI changes. */
export function formatGameStamp(stamp: string): string {
  const match = /^第 (\d+) 天 ([01]\d|2[0-3]):([0-5]\d)$/.exec(stamp);
  if (!match) return stamp;
  const day = Number(match[1]);
  if (!Number.isSafeInteger(day) || day < 1 || day > GAME_DAY_LIMIT) return stamp;
  return `${formatGameDate(day)} ${gameCalendar(day).weekdayLabel} ${match[2]}:${match[3]}`;
}
