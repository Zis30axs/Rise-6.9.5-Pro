/** Shared venue facts; these authored city routines are not claims about canon. */
export const MARGO_CAFE_LOCATION_ID = 'street-cafe';
export const MARGO_CAFE_ROOM_ID = 'margo-cafe-room';
export const MARGO_CAFE_OWNER_ID = 'majo-margo';
export const MARGO_CAFE_HOURS = '10:00–次日 02:00';

type Clock = { hour: number; minute: number };
export function isMargoCafeOpen(clock: Clock): boolean {
  const minute = clock.hour * 60 + clock.minute;
  return minute >= 10 * 60 || minute < 2 * 60;
}

/** Each visitor has a purpose and a bounded visit, independent of player entry. */
export const cafeVisitorSchedule = [
  { id: 'majo-emma', from: 14 * 60, until: 17 * 60, activity: '在咖啡馆挑选点心，和在场的旧识打招呼', x: -3, z: 0 },
  { id: 'majo-hiro', from: 15 * 60, until: 18 * 60, activity: '在咖啡馆喝茶、整理读书笔记', x: 3, z: 0 },
  { id: 'majo-anan', from: 16 * 60, until: 19 * 60, activity: '在咖啡馆安静画速写，用本子与熟人笔谈', x: -3, z: 2 },
  { id: 'majo-noa', from: 18 * 60, until: 20 * 60, activity: '在咖啡馆观察饮品与街景的颜色，随手记录配色', x: 3, z: 2 },
] as const;

export function cafeVisitForPerson(id: string, clock: Clock) {
  const minute = clock.hour * 60 + clock.minute;
  return cafeVisitorSchedule.find(visit => visit.id === id && minute >= visit.from && minute < visit.until) ?? null;
}

/** Services share the original outdoor venue and its existing menu and hours. */
export const cafeServiceLocation = (locationId: string) =>
  locationId === MARGO_CAFE_ROOM_ID ? MARGO_CAFE_LOCATION_ID : locationId;
