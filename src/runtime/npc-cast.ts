import lore from '../worldbook/majo-residents.json' with { type: 'json' };
import watanareLore from '../worldbook/watanare-residents.json' with { type: 'json' };
import bandLore from '../worldbook/bang-dream-canon.json' with { type: 'json' };
import circleLore from '../worldbook/circle-livehouse.json' with { type: 'json' };
import { housingForPerson, residentOutfit } from './majo-housing';
import { cafeVisitForPerson, isMargoCafeOpen, MARGO_CAFE_OWNER_ID, MARGO_CAFE_ROOM_ID } from './margo-cafe-venue';
import { CIRCLE_CAFE_ROOM_ID, CIRCLE_CLOSES, CIRCLE_OPENS, CIRCLE_STAFF_ID } from './circle-venue';

function mapWorldbookResidents(entries: typeof lore.entries) {
  return entries.filter(entry => entry.extensions.personId).map(entry => {
    const profession = entry.extensions as typeof entry.extensions & {
      majorId?: string | null; careerId?: string | null; qualification?: string | null;
    };
    const aliases = entry.extensions.personId === 'majo-meruru'
      ? ['冰上梅露露', '梅露露', '\u6c37\u4e0a\u30e1\u30eb\u30eb', '\u30e1\u30eb\u30eb', 'Meruru']
      : entry.keys;
    return {
      id: entry.extensions.personId!, name: entry.name, aliases,
      profile: entry.content, publicProfile: entry.extensions.publicProfile!,
      anchor: entry.extensions.anchor!, home: entry.extensions.home!,
      /** Every NPC has a professional slot; null is an actual undecided choice. */
      majorId: profession.majorId ?? null,
      careerId: profession.careerId ?? null,
      qualification: profession.qualification ?? null,
    };
  });
}

/** Person IDs outlive phone ownership and playable-character assignments. */
export const residentCast = mapWorldbookResidents(lore.entries);
export const watanareResidentCast = mapWorldbookResidents(watanareLore.entries as typeof lore.entries);
/** MyGO!!!!! and Ave Mujica members registered on the existing canon worldbook. Soyo and Sakiko stay protagonists. */
export const bangResidentCast = mapWorldbookResidents(bandLore.entries.filter(entry => entry.extensions?.personId?.startsWith('bang-')) as typeof lore.entries);
export const bangFamilyCast = mapWorldbookResidents(bandLore.entries.filter(entry => entry.extensions?.personId && !entry.extensions.personId.startsWith('bang-')) as typeof lore.entries);
export const circleStaffCast = mapWorldbookResidents(circleLore.entries.filter(entry => entry.extensions?.personId) as typeof lore.entries);
export const allResidentCast = Object.freeze([...residentCast, ...watanareResidentCast, ...bangResidentCast, ...bangFamilyCast, ...circleStaffCast]);

export const MAJO_GROUP_ID = 'majo-circle';
export const MAJO_GROUP_NAME = '大家的日常';
export const WATANARE_GROUP_ID = 'watanare-quintet';
export const WATANARE_GROUP_NAME = '芦谷五人组';
export const WATANARE_QUINTET_IDS = ['watanare-renako', 'watanare-mai', 'watanare-ajisai', 'watanare-satsuki', 'watanare-kaho'] as const;
export const MYGO_GROUP_ID = 'mygo-band';
export const MYGO_GROUP_NAME = 'MyGO!!!!!';
export const MYGO_MEMBER_IDS = ['bang-tomori', 'bang-anon', 'bang-taki', 'bang-rana'] as const;
export const AVE_MUJICA_GROUP_ID = 'ave-mujica';
export const AVE_MUJICA_GROUP_NAME = 'Ave Mujica';
export const AVE_MUJICA_MEMBER_IDS = ['bang-mutsumi', 'bang-uika', 'bang-umiri', 'bang-nyamu'] as const;

export const residentGroups = Object.freeze({
  [MAJO_GROUP_ID]: { id: MAJO_GROUP_ID, name: MAJO_GROUP_NAME, memberIds: residentCast.map(r => r.id) },
  [WATANARE_GROUP_ID]: { id: WATANARE_GROUP_ID, name: WATANARE_GROUP_NAME, memberIds: [...WATANARE_QUINTET_IDS] },
  [MYGO_GROUP_ID]: { id: MYGO_GROUP_ID, name: MYGO_GROUP_NAME, memberIds: [...MYGO_MEMBER_IDS] },
  [AVE_MUJICA_GROUP_ID]: { id: AVE_MUJICA_GROUP_ID, name: AVE_MUJICA_GROUP_NAME, memberIds: [...AVE_MUJICA_MEMBER_IDS] },
});
export const residentGroupById = (id: string) =>
  (residentGroups as Record<string, { id: string; name: string; memberIds: string[] } | undefined>)[id] ?? null;
export const residentGroupForNpc = (npcId: string) =>
  npcId.startsWith('majo-') ? residentGroups[MAJO_GROUP_ID]
    : npcId.startsWith('watanare-') ? residentGroups[WATANARE_GROUP_ID]
      : Object.values(residentGroups).find(group => (group.memberIds as readonly string[]).includes(npcId)) ?? null;

export const residentById = (id: string) => allResidentCast.find(row => row.id === id);

/** Small authored schedules, not agents or claims about canonical itineraries. */
export function marinaOnDuty(clock: { hour: number; minute: number; day?: number }): boolean {
  const presence = residentPresence(CIRCLE_STAFF_ID, clock);
  return !!presence?.available && presence.locationId === CIRCLE_CAFE_ROOM_ID;
}

export function residentPresence(id: string, clock: { hour: number; minute: number; day?: number }) {
  const person = residentById(id);
  if (!person) return null;
  const minute = clock.hour * 60 + clock.minute;
  const housing = housingForPerson(id);
  // Sherry's legal track is fixed. During office hours she is available to
  // investigate cases with Emma, rather than disappearing into a generic NPC shift.
  // Canon places Taki's job at the live house. The existing interior is that workplace.
  if (id === 'nagasaki-mother') {
    const morningHome = minute >= 7 * 60 && minute < 9 * 60 + 30;
    const eveningHome = minute >= 17 * 60 + 30 && minute < 23 * 60 + 30;
    const afternoonOut = minute >= 14 * 60 && minute < 17 * 60 + 30;
    if (morningHome || eveningHome) {
      return {
        anchorId: null, locationId: 'soyo-house',
        activity: morningHome
          ? '在开放式厨房冲泡晨间咖啡、确认今日行程，并在餐桌上为素世留好便签'
          : '下班归家后在客餐厅小憩饮茶，温和地关心素世的日常生活',
        available: true,
        housing: housing?.id ?? 'soyo-house', district: housing?.district ?? 'traditional-downtown', outfit: residentOutfit(id),
      };
    }
    if (afternoonOut) {
      return {
        anchorId: person.anchor, locationId: person.anchor,
        activity: '在街区处理商务会面与日常采买',
        available: true,
        housing: housing?.id ?? 'soyo-house', district: housing?.district ?? 'traditional-downtown', outfit: residentOutfit(id),
      };
    }
    return {
      anchorId: null, locationId: 'soyo-house',
      activity: minute >= 9 * 60 + 30 && minute < 14 * 60 ? '在公司处理繁忙的商务工作' : '在卧室休息',
      available: false,
      housing: housing?.id ?? 'soyo-house', district: housing?.district ?? 'traditional-downtown', outfit: residentOutfit(id),
    };
  }
  if (id === CIRCLE_STAFF_ID) {
    const day = clock.day ?? 1;
    const rest = day % 7 === 0;
    const assistRing = !rest && day % 7 === 4 && minute >= 15 * 60 && minute < 18 * 60;
    const atCircle = !rest && !assistRing && minute >= CIRCLE_OPENS && minute < CIRCLE_CLOSES;
    if (assistRing) return {
      anchorId: null, locationId: 'livehouse',
      activity: '到 RiNG 协助处理预约和店务', available: true,
      housing: housing?.id ?? null, district: 'grand-commercial', outfit: residentOutfit(id),
    };
    if (atCircle) return {
      anchorId: null, locationId: CIRCLE_CAFE_ROOM_ID,
      activity: '在 CiRCLE 咖啡厅接待客人', available: true,
      housing: housing?.id ?? null, district: 'circle', outfit: residentOutfit(id),
    };
    if (rest) return {
      anchorId: null, locationId: person.home,
      activity: '休息日留在住处', available: false,
      housing: housing?.id ?? null, district: null, outfit: residentOutfit(id),
    };
  }
  if (id === 'bang-taki' && minute >= 16 * 60 && minute < 22 * 60) return {
    anchorId: null, locationId: 'livehouse',
    activity: '在 Live House 打工并整理鼓组', available: true,
    housing: housing?.id ?? null, district: 'grand-commercial', outfit: residentOutfit(id),
  };
  if (id === 'majo-sherry' && minute >= 9 * 60 && minute < 18 * 60) return {
    anchorId: null, locationId: 'legal-office',
    activity: '在律师事务所整理卷宗并协助艾玛调查', available: true,
    housing: housing?.id ?? null, district: 'grand-commercial', outfit: residentOutfit(id),
  };
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
