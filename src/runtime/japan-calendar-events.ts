/** Japanese game calendar: no timers, RNG, or device time.
 * Official 2025-2027 dates: https://www8.cao.go.jp/chosei/shukujitsu/gaiyou.html
 * https://eco.mtk.nao.ac.jp/koyomi/yoko/2025/rekiyou251.html
 * https://eco.mtk.nao.ac.jp/koyomi/yoko/2027/rekiyou271.html
 * Later years are game-only projections, not published government dates. */
import lore from '../worldbook/majo-residents.json' with { type: 'json' };
import bandLore from '../worldbook/bang-dream-canon.json' with { type: 'json' };
import { gameCalendar, GAME_DAY_LIMIT } from './game-calendar';

export type OccasionKind = 'national-holiday' | 'substitute-holiday' | 'citizens-holiday' | 'festival' | 'birthday';
export interface CalendarOccasion {
  id: string; iso: string; name: string; kind: OccasionKind;
  dayOff: boolean; projected: boolean; personId?: string;
}
export interface ResidentBirthday { personId: string; name: string; month: number; date: number }
/** Derive birthdays from authored character records; never assign one to Yuki implicitly. */
export const residentBirthdays: readonly ResidentBirthday[] = Object.freeze(lore.entries.flatMap(entry => {
  const personId = entry.extensions.personId;
  const match = /生日\s*(\d{1,2})月(\d{1,2})日/.exec(entry.content);
  if (!personId || !match) return [];
  const month = Number(match[1]), date = Number(match[2]);
  const checked = new Date(Date.UTC(2024, month - 1, date));
  if (checked.getUTCMonth() !== month - 1 || checked.getUTCDate() !== date) return [];
  return [{ personId, name: entry.name, month, date }];
}));
/** Calendar identities; playable characters reuse their existing protagonist IDs. */
const BANG_DREAM_BIRTHDAY_IDS = {
  "长崎素世": "soyo",
  "丰川祥子": "sakiko",
  "高松灯": "bang-tomori",
  "千早爱音": "bang-anon",
  "椎名立希": "bang-taki",
  "要乐奈": "bang-rana",
  "若叶睦": "bang-mutsumi",
  "三角初华": "bang-uika",
  "八幡海铃": "bang-umiri",
  "祐天寺若麦": "bang-nyamu"
} as const;
/** MyGO!!!!! and Ave Mujica dates are read from the character worldbook, not duplicated here. */
export const bangDreamBirthdays: readonly ResidentBirthday[] = Object.freeze(bandLore.entries.flatMap(entry => {
  const personId = BANG_DREAM_BIRTHDAY_IDS[entry.name as keyof typeof BANG_DREAM_BIRTHDAY_IDS];
  if (!personId) return [];
  const match = /生日\s*(\d{1,2})月(\d{1,2})日/.exec(entry.content);
  if (!match) return [];
  const month = Number(match[1]), date = Number(match[2]);
  const checked = new Date(Date.UTC(2024, month - 1, date));
  if (checked.getUTCMonth() !== month - 1 || checked.getUTCDate() !== date) return [];
  return [{ personId, name: entry.name, month, date }];
}));
/** All known character birthdays, without altering the 13 existing Majo identities. */
export const characterBirthdays: readonly ResidentBirthday[] = Object.freeze([...residentBirthdays, ...bangDreamBirthdays]);
const pad = (n: number) => String(n).padStart(2, '0');
const isoDate = (y: number, m: number, d: number) => String(y) + '-' + pad(m) + '-' + pad(d);
const weekday = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d)).getUTCDay();
const nthMonday = (y: number, m: number, ordinal: number) =>
  1 + (8 - weekday(y, m, 1)) % 7 + (ordinal - 1) * 7;
const officialEquinoxes: Record<number, readonly [number, number]> = { 2025: [20, 23], 2026: [20, 23], 2027: [21, 23] };
function equinoxes(year: number): readonly [number, number] | null {
  if (officialEquinoxes[year]) return officialEquinoxes[year];
  if (year < 2028 || year > 2099) return null;
  // Standard Japan-date astronomical approximation; marked projected.
  return [
    Math.floor(20.8431 + .242194 * (year - 1980) - Math.floor((year - 1980) / 4)),
    Math.floor(23.2488 + .242194 * (year - 1980) - Math.floor((year - 1980) / 4)),
  ];
}
const holidayCache = new Map<number, ReadonlyMap<string, CalendarOccasion>>();
function holidaysForYear(year: number): ReadonlyMap<string, CalendarOccasion> {
  const cached = holidayCache.get(year);
  if (cached) return cached;
  const primary = new Map<string, CalendarOccasion>(), projected = year > 2027;
  const holiday = (key: string, name: string, month: number, date: number) => {
    const iso = isoDate(year, month, date);
    primary.set(iso, { id: 'jp-holiday:' + iso + ':' + key, iso, name,
      kind: 'national-holiday', dayOff: true, projected });
  };
  holiday('newyear', '元旦', 1, 1);
  holiday('coming-of-age', '成人之日', 1, nthMonday(year, 1, 2));
  holiday('foundation', '建国纪念日', 2, 11);
  holiday('emperor', '天皇诞生日', 2, 23);
  const eq = equinoxes(year);
  if (eq) holiday('spring', '春分之日', 3, eq[0]);
  holiday('showa', '昭和之日', 4, 29);
  holiday('constitution', '宪法纪念日', 5, 3);
  holiday('green', '绿之日', 5, 4);
  holiday('children', '儿童节', 5, 5);
  holiday('marine', '海之日', 7, nthMonday(year, 7, 3));
  holiday('mountain', '山之日', 8, 11);
  holiday('elders', '敬老之日', 9, nthMonday(year, 9, 3));
  if (eq) holiday('autumn', '秋分之日', 9, eq[1]);
  holiday('sports', '体育之日', 10, nthMonday(year, 10, 2));
  holiday('culture', '文化之日', 11, 3);
  holiday('labor', '勤劳感谢日', 11, 23);
  const holidays = new Map(primary);
  for (let day = Date.UTC(year, 0, 2), end = Date.UTC(year, 11, 31); day < end; day += 86400000) {
    const iso = new Date(day).toISOString().slice(0, 10);
    if (primary.has(iso)
      || !primary.has(new Date(day - 86400000).toISOString().slice(0, 10))
      || !primary.has(new Date(day + 86400000).toISOString().slice(0, 10))) continue;
    holidays.set(iso, { id: 'jp-holiday:' + iso + ':citizens', iso, name: '国民休息日',
      kind: 'citizens-holiday', dayOff: true, projected });
  }
  // Sunday holiday -> next day that is not already an official holiday/holiday substitute.
  for (const occasion of primary.values()) {
    const month = Number(occasion.iso.slice(5, 7)), date = Number(occasion.iso.slice(-2));
    if (weekday(year, month, date) !== 0) continue;
    let time = Date.UTC(year, month - 1, date) + 86400000;
    while (holidays.has(new Date(time).toISOString().slice(0, 10))) time += 86400000;
    const iso = new Date(time).toISOString().slice(0, 10);
    holidays.set(iso, { id: 'jp-holiday:' + iso + ':substitute', iso,
      name: '补休日（' + occasion.name + '）',
      kind: 'substitute-holiday', dayOff: true, projected });
  }
  holidayCache.set(year, holidays);
  return holidays;
}
export function japanPublicHoliday(day: number): CalendarOccasion | null {
  const civil = gameCalendar(day);
  return holidaysForYear(civil.year).get(civil.iso) ?? null;
}
export const isJapanesePublicHoliday = (day: number): boolean => !!japanPublicHoliday(day);
const festivals = [
  { id: 'valentine', month: 2, date: 14, name: '情人节' },
  { id: 'white-day', month: 3, date: 14, name: '白色情人节' },
  { id: 'tanabata', month: 7, date: 7, name: '七夕' },
  { id: 'halloween', month: 10, date: 31, name: '万圣节' },
  { id: 'christmas-eve', month: 12, date: 24, name: '平安夜' },
  { id: 'christmas', month: 12, date: 25, name: '圣诞节' },
] as const;
/** Read-only: no event is considered attended, gifted, or paid for by looking at a date. */
export function gameCalendarOccasions(day: number): CalendarOccasion[] {
  const date = gameCalendar(day), national = japanPublicHoliday(day);
  const events: CalendarOccasion[] = national ? [national] : [];
  for (const e of festivals) if (date.month === e.month && date.date === e.date) {
    events.push({ id: 'jp-festival:' + date.year + ':' + e.id, iso: date.iso, name: e.name,
      kind: 'festival', dayOff: false, projected: false });
  }
  for (const e of characterBirthdays) if (date.month === e.month && date.date === e.date) {
    events.push({ id: 'birthday:' + date.year + ':' + e.personId, iso: date.iso, name: e.name + '的生日',
      personId: e.personId, kind: 'birthday', dayOff: false, projected: false });
  }
  return events;
}
export function upcomingGameCalendarOccasions(day: number, windowDays = 30): CalendarOccasion[] {
  if (!Number.isSafeInteger(windowDays) || windowDays < 1 || windowDays > 366)
    throw new Error('日历查询范围无效');
  const result: CalendarOccasion[] = [];
  for (let offset = 1; offset <= windowDays && day + offset <= GAME_DAY_LIMIT; offset++)
    result.push(...gameCalendarOccasions(day + offset));
  return result;
}
