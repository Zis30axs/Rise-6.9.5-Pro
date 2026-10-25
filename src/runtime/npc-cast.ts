import lore from '../worldbook/majo-residents.json' with { type: 'json' };
import watanareLore from '../worldbook/watanare-residents.json' with { type: 'json' };
import { housingForPerson, residentOutfit } from './majo-housing';
import { cafeVisitForPerson, isMargoCafeOpen, MARGO_CAFE_OWNER_ID, MARGO_CAFE_ROOM_ID } from './margo-cafe-venue';

function mapWorldbookResidents(entries: typeof lore.entries) {
  return entries.filter(entry => entry.extensions.personId).map(entry => ({
    id: entry.extensions.personId!, name: entry.name, aliases: entry.keys,
    profile: entry.content, publicProfile: entry.extensions.publicProfile!,
    anchor: entry.extensions.anchor!, home: entry.extensions.home!,
  }));
}

/** Person IDs outlive phone ownership and playable-character assignments. */
export const residentCast = mapWorldbookResidents(lore.entries);
export const watanareResidentCast = mapWorldbookResidents(watanareLore.entries as typeof lore.entries);
export const allResidentCast = Object.freeze([...residentCast, ...watanareResidentCast]);

export const MAJO_GROUP_ID = 'majo-circle';
export const MAJO_GROUP_NAME = '大家的日常';
export const WATANARE_GROUP_ID = 'watanare-quintet';
export const WATANARE_GROUP_NAME = '芦谷五人组';
export const WATANARE_QUINTET_IDS = ['watanare-renako', 'watanare-mai', 'watanare-ajisai', 'watanare-satsuki', 'watanare-kaho'] as const;

export const residentGroups = Object.freeze({
  [MAJO_GROUP_ID]: { id: MAJO_GROUP_ID, name: MAJO_GROUP_NAME, memberIds: residentCast.map(r => r.id) },
  [WATANARE_GROUP_ID]: { id: WATANARE_GROUP_ID, name: WATANARE_GROUP_NAME, memberIds: [...WATANARE_QUINTET_IDS] },
});
export const residentGroupById = (id: string) =>
  (residentGroups as Record<string, { id: string; name: string; memberIds: string[] } | undefined>)[id] ?? null;
export const residentGroupForNpc = (npcId: string) =>
  npcId.startsWith('majo-') ? residentGroups[MAJO_GROUP_ID] : npcId.startsWith('watanare-') ? residentGroups[WATANARE_GROUP_ID] : null;

export const residentById = (id: string) => allResidentCast.find(row => row.id === id);

/** Small authored schedules, not agents or claims about canonical itineraries. */
export function residentPresence(id: string, clock: { hour: number; minute: number }) {
  const person = residentById(id);
  if (!person) return null;
  const minute = clock.hour * 60 + clock.minute;
  const housing = housingForPerson(id);
  const cafeVisit = cafeVisitForPerson(id, clock);
  if (id === MARGO_CAFE_OWNER_ID || cafeVisit) {
    const atCafe = isMargoCafeOpen(clock) && (id === MARGO_CAFE_OWNER_ID || !!cafeVisit);
    return {
      anchorId: null,
      locationId: atCafe ? MARGO_CAFE_ROOM_ID : housing?.interiorId ?? person.home,
      activity: atCafe ? cafeVisit?.activity ?? (minute < 2 * 60 || minute >= 22 * 60
        ? '经营咖啡馆，收拾杯盘并照看晚间客人'
        : minute < 14 * 60 ? '经营咖啡馆，准备咖啡与当日甜点' : '经营咖啡馆，接待来客并照看柜台') : '闭店后在住处休息',
      available: atCafe,
      housing: housing?.id ?? null,
      district: housing?.district ?? null,
      outfit: residentOutfit(id),
    };
  }
  const sleeping = minute < 8 * 60 || minute >= 23 * 60;
  const streaming = id === 'majo-koko' && minute >= 20 * 60;
  const working = minute >= 9 * 60 && minute < 12 * 60;
  const outside = minute >= 14 * 60 && minute < 20 * 60;
  return {
    anchorId: outside ? person.anchor : null,
    // At home the authored housing interior is a real map location; the older
    // home marker string remains authoritative only when no interior exists.
    locationId: outside ? person.anchor : housing?.interiorId ?? person.home,
    activity: sleeping ? '休息' : streaming ? '直播中' : working ? '处理自己的日常事务' : outside ? '外出与休闲' : '在住处休息',
    available: !sleeping && !streaming && !working,
    housing: housing?.id ?? null,
    district: housing?.district ?? null,
    outfit: residentOutfit(id),
  };
}
