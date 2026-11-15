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

interface OutdoorSlot {
  from: number;
  until: number;
  anchorId: string;
  activity: string;
}

const ANCHOR_TO_LOCATION: readonly [string, string][] = [
  ['avenue-', 'promenade'],
  ['library-', 'library'],
  ['teaching-', 'teaching'],
  ['dorm-', 'dorm'],
  ['sports-', 'sports'],
  ['cafe-', 'cafe'],
  ['gate-', 'gate'],
  ['junction-', 'junction'],
  ['construction-', 'construction-site'],
  ['bookshop-', 'bookshop'],
  ['convenience-', 'convenience'],
  ['street-cafe', 'street-cafe'],
  ['bus-', 'bus-stop'],
  ['park-', 'pocket-park'],
  ['courthouse-', 'courthouse'],
  ['home-', 'home'],
  ['downtown-', 'downtown'],
  ['commercial-', 'commercial'],
  ['city-park-', 'city-park'],
  ['grand-', 'grand-commercial'],
  ['takao-', 'takao-mountain'],
  ['circle-', 'circle'],
];

function anchorLocationId(anchorId: string): string {
  for (const [prefix, locationId] of ANCHOR_TO_LOCATION) {
    if (anchorId === prefix || anchorId.startsWith(prefix)) return locationId;
  }
  return anchorId;
}

/** Staggered daytime/evening outdoor routines keep every street spacious and realistic. */
const RESIDENT_OUTDOOR_SLOTS: Readonly<Record<string, readonly OutdoorSlot[]>> = {
  // Playable residents' legacy NPC fallback anchors (hidden when multi-protagonist save is active).
  'majo-emma': [{ from: 17 * 60, until: 19 * 60, anchorId: 'cafe-terrace', activity: '刚从咖啡馆出来，在校园咖啡露台边稍作停留' }],
  'watanare-renako': [{ from: 15 * 60, until: 18 * 60 + 30, anchorId: 'home-lane', activity: '趁着不用出门多走动，在杂司谷家门口附近的安静小道透口气' }],

  // Majo cast
  'majo-hiro': [{ from: 19 * 60, until: 21 * 60, anchorId: 'downtown-fountain', activity: '晚上在目白台喷泉广场附近散步整理思绪' }],
  'majo-anan': [{ from: 12 * 60 + 30, until: 14 * 60 + 30, anchorId: 'library-west', activity: '抱着用以笔谈的速写本，在图书馆前庭静静看人来人往' }],
  'majo-noa': [{ from: 14 * 60 + 30, until: 17 * 60 + 30, anchorId: 'city-park-trail', activity: '在神田川沿岸公园寻找夕照与河景的颜色搭配' }],
  'majo-leia': [{ from: 15 * 60, until: 18 * 60, anchorId: 'teaching-west', activity: '在教学楼前庭停步，留意校园公告栏并和熟人打招呼' }],
  'majo-milia': [{ from: 15 * 60 + 30, until: 18 * 60 + 30, anchorId: 'library-east', activity: '抱着资料站在图书馆东侧台阶边休息放松' }],
  'majo-nanoka': [{ from: 15 * 60 + 30, until: 18 * 60 + 30, anchorId: 'avenue-west', activity: '沿着高田校园林荫步道独自走过' }],
  'majo-honoka': [{ from: 15 * 60, until: 17 * 60 + 30, anchorId: 'bookshop-west', activity: '在街角书店橱窗前停步，仔细翻看文学与小说新刊' }],
  'majo-arisa': [{ from: 16 * 60, until: 18 * 60 + 30, anchorId: 'sports-west', activity: '站在运动场西侧看台附近舒展筋骨、顺便观察练习节奏' }],
  'majo-sherry': [{ from: 18 * 60 + 30, until: 20 * 60 + 30, anchorId: 'courthouse-plaza', activity: '结束事务所工作后经过审判法庭前广场稍作散步' }],
  'majo-hanna': [
    { from: 13 * 60, until: 15 * 60 + 30, anchorId: 'dorm-east', activity: '趁午后阳光在宿舍院落附近整理随身小物' },
    { from: 17 * 60, until: 19 * 60, anchorId: 'commercial-arcade', activity: '在池袋商业街橱窗前挑着感兴趣的小甜点与饰品' },
  ],
  'majo-koko': [{ from: 15 * 60, until: 18 * 60, anchorId: 'bus-east', activity: '趁还没开播，在高田接驳站东侧顺路买晚上的饮料和点心' }],
  'majo-meruru': [{ from: 16 * 60 + 30, until: 19 * 60, anchorId: 'dorm-west', activity: '提着简单购物袋回到宿舍院落门口' }],
  'majo-yuki': [
    { from: 12 * 60 + 30, until: 15 * 60, anchorId: 'gate-west', activity: '午后从校园南门走过，神色从容' },
    { from: 16 * 60 + 30, until: 19 * 60, anchorId: 'home-plaza', activity: '傍晚回到杂司谷街区外散步，买些晚饭用的小菜' },
  ],

  // Watanare cast
  'watanare-mai': [{ from: 16 * 60 + 30, until: 18 * 60 + 30, anchorId: 'gate-west', activity: '放学后从校园南门附近路过，吸引着周围几道目光' }],
  'watanare-ajisai': [
    { from: 12 * 60, until: 14 * 60, anchorId: 'park-west', activity: '在口袋公园长椅附近晒会儿午后太阳' },
    { from: 16 * 60 + 30, until: 19 * 60, anchorId: 'street-cafe', activity: '在街边咖啡馆外稍作停留，温和地张望街区晚景' },
  ],
  'watanare-satsuki': [{ from: 16 * 60 + 30, until: 19 * 60, anchorId: 'library-west', activity: '抱着刚刚借出的参考书从图书馆前庭走出来' }],
  'watanare-kaho': [{ from: 16 * 60 + 30, until: 19 * 60, anchorId: 'home-lane', activity: '傍晚在杂司谷住宅区小道轻快地散步顺便放松肩膀' }],
  'watanare-haruna': [{ from: 16 * 60 + 30, until: 18 * 60 + 30, anchorId: 'sports-east', activity: '和同好结束轻度活动，站在运动场边沿聊着回家路' }],
  'watanare-miyoko': [{ from: 16 * 60, until: 18 * 60 + 30, anchorId: 'convenience-west', activity: '拎着便利店购物袋在街口看今晚采购清单' }],
  'watanare-hiroki': [{ from: 16 * 60, until: 18 * 60, anchorId: 'park-east', activity: '在口袋公园一边绕圈跑步一边留意时间' }],
  'watanare-kippei': [
    { from: 13 * 60, until: 15 * 60 + 30, anchorId: 'park-west', activity: '午后在口袋公园附近活动筋骨' },
    { from: 18 * 60 + 30, until: 20 * 60, anchorId: 'city-park-bank', activity: '傍晚沿神田川步道慢跑吹风' },
  ],
  'watanare-koto-mother': [{ from: 16 * 60, until: 18 * 60 + 30, anchorId: 'junction-east', activity: '顺道在南门十字路口附近的商铺前留意晚间蔬果' }],
  'watanare-hitoe': [{ from: 16 * 60 + 30, until: 19 * 60, anchorId: 'bus-west', activity: '在接驳站西侧等候前往宅邸方向的班车' }],
  'watanare-rene': [
    { from: 13 * 60 + 30, until: 16 * 60, anchorId: 'junction-west', activity: '午后从南门十字路口西侧路过看看街头新鲜小物' },
    { from: 16 * 60 + 30, until: 19 * 60, anchorId: 'downtown-fountain', activity: '傍晚回到目白台喷泉广场附近稍作散步' },
  ],
  'watanare-lucie': [
    { from: 13 * 60, until: 15 * 60 + 30, anchorId: 'street-cafe', activity: '在街边咖啡馆外带着随和的笑容歇脚' },
    { from: 18 * 60 + 30, until: 20 * 60 + 30, anchorId: 'downtown-fountain', activity: '晚饭后在目白台安静大道上闲步' },
  ],
  'watanare-seira': [
    { from: 13 * 60, until: 15 * 60 + 30, anchorId: 'bookshop-east', activity: '午后路过街角书店外顺手打量新到杂志' },
    { from: 18 * 60 + 30, until: 20 * 60 + 30, anchorId: 'home-lane', activity: '傍晚送完店里衣物后走回杂司谷一带' },
  ],
  'watanare-youko': [
    { from: 12 * 60 + 30, until: 15 * 60 + 30, anchorId: 'library-west', activity: '在图书馆前庭核对下午读书会用的书目笔记' },
    { from: 19 * 60, until: 21 * 60, anchorId: 'courthouse-plaza', activity: '夜色初降时沿着审判法庭前广场外环大道静步' },
  ],
  'watanare-michiru': [{ from: 15 * 60 + 30, until: 18 * 60, anchorId: 'cafe-terrace', activity: '课后在校园咖啡露台喝杯冷饮喘口气' }],
  'watanare-himiko': [
    { from: 12 * 60 + 30, until: 15 * 60, anchorId: 'sports-west', activity: '在运动场侧畔整理社团器材清单' },
    { from: 18 * 60 + 30, until: 20 * 60 + 30, anchorId: 'takao-trail', activity: '趁暮色登上高尾山山麓步道看一次夜景视野' },
  ],
  'watanare-suzuran': [{ from: 15 * 60 + 30, until: 17 * 60 + 30, anchorId: 'avenue-east', activity: '走在高田校园林荫步道上和熟人寒暄几句' }],
  'watanare-chizuru': [
    { from: 12 * 60 + 30, until: 15 * 60, anchorId: 'teaching-east', activity: '在教学楼广场外翻看着笔记整理下周安排' },
    { from: 18 * 60 + 30, until: 20 * 60 + 30, anchorId: 'bus-east', activity: '晚些时候到高田接驳站候车归家' },
  ],
  'watanare-miki': [
    { from: 13 * 60 + 30, until: 16 * 60, anchorId: 'convenience-east', activity: '在便利店门前拆开刚买的冰饮慢慢喝着' },
    { from: 18 * 60, until: 20 * 60 + 30, anchorId: 'commercial-plaza', activity: '晚上顺路去池袋商业广场逛逛新潮店面' },
  ],

  // BanG Dream! cast
  'bang-tomori': [
    { from: 12 * 60 + 30, until: 14 * 60 + 30, anchorId: 'circle-plaza', activity: '蹲在 CiRCLE 门外砖阶旁认真拾起并端详光滑的小石子' },
    { from: 16 * 60 + 30, until: 19 * 60, anchorId: 'bookshop-east', activity: '抱着笔记本从街角书店出来，不时望着路面上的落叶' },
  ],
  'bang-anon': [
    { from: 13 * 60 + 30, until: 15 * 60 + 30, anchorId: 'avenue-east', activity: '在高田校园林荫步道拿着手机看看附近时尚打卡店' },
    { from: 16 * 60 + 30, until: 19 * 60 + 30, anchorId: 'commercial-plaza', activity: '在池袋商业广场门口挑选乐队穿搭与发饰' },
  ],
  'bang-taki': [{ from: 14 * 60, until: 16 * 60, anchorId: 'bus-west', activity: '去 Live House 上班前在高田接驳站候车，顺手整理鼓棒与歌单' }],
  'bang-rana': [{ from: 16 * 60, until: 19 * 60, anchorId: 'park-west', activity: '晃悠到口袋公园长椅边和野猫打招呼，顺便找抹茶甜点' }],
  'bang-mutsumi': [{ from: 15 * 60, until: 18 * 60 + 30, anchorId: 'city-park-bank', activity: '安静站在神田川沿岸绿荫下看着水面发会儿呆' }],
  'bang-uika': [
    { from: 13 * 60, until: 15 * 60 + 30, anchorId: 'commercial-plaza', activity: '趁行程空档戴着帽子在池袋街区稍作买物' },
    { from: 16 * 60 + 30, until: 19 * 60, anchorId: 'circle-plaza', activity: '工作前后路过 CiRCLE 门前广场抬头望向傍晚天空' },
  ],
  'bang-umiri': [
    { from: 12 * 60 + 30, until: 14 * 60 + 30, anchorId: 'bus-east', activity: '背着贝斯包在高田接驳站换乘赶往午后排练' },
    { from: 16 * 60 + 30, until: 19 * 60, anchorId: 'grand-promenade', activity: '离开录音棚后走在新宿大型商业区大道上，脚步干脆利落' },
  ],
  'bang-nyamu': [{ from: 16 * 60 + 30, until: 19 * 60 + 30, anchorId: 'grand-plaza', activity: '在新宿商业娱乐区霓虹店招前拿着手机构思新视频话题' }],
};

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
        anchorId: 'downtown-avenue', locationId: anchorLocationId('downtown-avenue'),
        activity: '在目白台街区处理商务会面与日常采买',
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
  const outdoorSlot = !sleeping && !streaming && !working
    ? RESIDENT_OUTDOOR_SLOTS[id]?.find(slot => minute >= slot.from && minute < slot.until) ?? null
    : null;
  const anchorId = outdoorSlot?.anchorId ?? null;
  return {
    anchorId,
    // At home the authored housing interior is a real map location; the older
    // home marker string remains authoritative only when no interior exists.
    locationId: anchorId ? anchorLocationId(anchorId) : housing?.interiorId ?? person.home,
    activity: sleeping ? '休息' : streaming ? '直播中' : working ? '处理自己的日常事务' : outdoorSlot ? outdoorSlot.activity : '在住处休息',
    available: !sleeping && !streaming && !working,
    housing: housing?.id ?? null,
    district: housing?.district ?? null,
    outfit: residentOutfit(id),
  };
}
