/** CiRCLE live-house venue facts. Hours are authored for this city, not a published source schedule. */
export const CIRCLE_LOCATION_ID = 'circle';
export const CIRCLE_CAFE_ROOM_ID = 'circle-cafe';
export const CIRCLE_STUDIO_ROOM_ID = 'circle-studio';
export const CIRCLE_HOURS_LABEL = '11:00–22:00';
export const CIRCLE_OPENS = 11 * 60;
export const CIRCLE_CLOSES = 22 * 60;
export const CIRCLE_STAFF_NAME = '月之森真里';
/** Same settlement rows as the existing cafe menu; this counter only lists three of them. */
export const CIRCLE_CAFE_MENU_IDS = ['drink-coffee', 'drink-latte', 'eat-dessert'] as const;
export const CIRCLE_MENU_LOCATION_IDS = [CIRCLE_LOCATION_ID, CIRCLE_CAFE_ROOM_ID] as const;
/** Extra yen on a borrowed live-house ticket or studio rental. Not a source price. */
export const CIRCLE_TICKET_PREMIUM_YEN = 200;

const BORROWED_LIVEHOUSE_TEXT = /看演出|租练团|租用练团|演出票/;

export function isCircleVenueRoom(roomId: string | null | undefined): boolean {
  return roomId === CIRCLE_CAFE_ROOM_ID || roomId === CIRCLE_STUDIO_ROOM_ID;
}

export function isBorrowedLivehouseText(id: string, label: string): boolean {
  return BORROWED_LIVEHOUSE_TEXT.test(id) || BORROWED_LIVEHOUSE_TEXT.test(label);
}

export function circleVisitServiceId(serviceId: string): string | null {
  if (serviceId.startsWith('livehouse-watch-') || serviceId.startsWith('livehouse-practice-')) {
    return serviceId.replace('livehouse-', 'circle-');
  }
  return null;
}

export function isBorrowedLivehouseService(service: { id: string; label: string; locationIds: readonly string[] }): boolean {
  return service.locationIds.includes('livehouse') && (circleVisitServiceId(service.id) !== null || isBorrowedLivehouseText(service.id, service.label));
}

/** A positive menu price grows by the premium. A negative interior balance delta becomes more expensive. */
export function circleBorrowedPrice(amount: number): number {
  if (amount === 0) return 0;
  return amount > 0 ? amount + CIRCLE_TICKET_PREMIUM_YEN : amount - CIRCLE_TICKET_PREMIUM_YEN;
}

interface BorrowedInteraction {
  id: string;
  label: string;
  description: string;
  x: number;
  z: number;
  minutes: number;
  energyDelta: number;
  balanceDelta?: number;
  healthDelta?: number;
  stressDelta?: number;
  moraleDelta?: number;
  result: string;
  prompt: string;
}

/** Copy an already-authored live-house counter into the studio. Absent offers add nothing. */
export function attachCircleBorrowedInteractions<T extends { id: string; interactions: readonly BorrowedInteraction[] }>(rooms: readonly T[]): T[] {
  const livehouse = rooms.find(room => room.id === 'livehouse');
  const extras = (livehouse?.interactions ?? []).filter(item => isBorrowedLivehouseText(item.id, item.label));
  if (!extras.length) return [...rooms];
  const borrowed = extras.map((item, index) => ({
    ...item,
    id: `circle-borrow-${item.id}`,
    x: index % 2 === 0 ? -1.2 : 1.4,
    z: 2.2,
    ...(item.balanceDelta === undefined ? {} : { balanceDelta: circleBorrowedPrice(item.balanceDelta) }),
  }));
  return rooms.map(room => room.id === CIRCLE_STUDIO_ROOM_ID
    ? { ...room, interactions: [...room.interactions, ...borrowed] }
    : room);
}
