import { residentById } from './npc-cast';

/**
 * Existing housing art now belongs to Tokyo neighborhood residences.
 *
 * These are game-authored living arrangements, not claims about canonical
 * layouts. Only the six recovered generic interiors are registered; residents
 * whose dedicated artwork is still missing keep their existing authored home
 * marker and are pointed at the closest generic shell.
 */
export type MajoHousingType =
  | 'riverfront-highrise'
  | 'traditional-courtyard'
  | 'old-family-house'
  | 'modern-open-plan'
  | 'shared-apartment'
  | 'studio-apartment';

export type MajoDistrictType =
  | 'riverfront-highrise-district'
  | 'old-town-lowrise'
  | 'older-apartment-courtyard'
  | 'traditional-downtown'
  | 'lakeside-apartment'
  | 'student-shared';

export interface MajoHousing {
  readonly id: string;
  readonly type: MajoHousingType;
  readonly label: string;
  readonly description: string;
  readonly interiorId: string;
  readonly district: MajoDistrictType;
  readonly parentLocationId: string;
  /** Recovered runtime art exists for this district; false means authored fallback. */
  readonly districtArt: boolean;
}

export const majoHousings: readonly MajoHousing[] = Object.freeze([
  {
    id: 'emma-yuki-home', type: 'modern-open-plan', label: '艾玛与月代雪的家',
    description: '杂司谷住宅街中两人共同居住的现代公寓客餐厅；料理台、沙发与阅读角在同一空间。',
    interiorId: 'emma-yuki-home', district: 'riverfront-highrise-district', parentLocationId: 'home', districtArt: false,
  },
  {
    id: 'koko-old-house', type: 'old-family-house', label: '泽渡家老宅',
    description: '杂司谷旧街区的老式住宅客厅，保留着旧家具与直播设备旁的生活痕迹；是否与爷爷同住由实际剧情决定。',
    interiorId: 'koko-old-house', district: 'old-town-lowrise', parentLocationId: 'home', districtArt: true,
  },
  {
    id: 'nikaido-house', type: 'traditional-courtyard', label: '二阶堂家',
    description: '目白台的传统日式宅邸：榻榻米和室、可望见庭院的缘侧、入鞘武士刀刀架与练剑空间。',
    interiorId: 'nikaido-house', district: 'traditional-downtown', parentLocationId: 'downtown', districtArt: false,
  },
  {
    id: 'anan-noa-milia-home', type: 'shared-apartment', label: '安安、诺亚与米莉亚的住处',
    description: '高田／西早稻田一带三人合住的普通客餐厅，留有画笔、画纸与可以各自安静待着的角落。',
    interiorId: 'anan-noa-milia-home', district: 'older-apartment-courtyard', parentLocationId: 'junction', districtArt: true,
  },
  {
    id: 'nanoka-honoka-home', type: 'shared-apartment', label: '黑部姐妹的家',
    description: '杂司谷住宅区的黑部家公寓，奈叶香与已大学毕业的姐姐穗奈香共同生活；两人各有卧室，共用客厅、厨房与书架。',
    interiorId: 'nanoka-honoka-home', district: 'old-town-lowrise', parentLocationId: 'home', districtArt: true,
  },
  {
    id: 'sherry-hanna-home', type: 'riverfront-highrise', label: '雪莉与汉娜的住处',
    description: '神田川沿岸高层住宅的客餐厅，落地窗外是河岸步道。',
    interiorId: 'majo-highrise-home', district: 'riverfront-highrise-district', parentLocationId: 'commercial', districtArt: true,
  },
  {
    id: 'residential-prototype', type: 'studio-apartment', label: '单身公寓',
    description: '目白台一带床、厨房与一张小桌组成的单身公寓室内。',
    interiorId: 'majo-studio', district: 'lakeside-apartment', parentLocationId: 'city-park', districtArt: false,
  },
]);

export const watanareHousings: readonly MajoHousing[] = Object.freeze([
  {
    id: 'amaori-family-home', type: 'old-family-house', label: '甘织家住宅',
    description: '杂司谷住宅街充满生活气息的甘织家一户建；玲奈子、妹妹遥奈与母亲美代子、父亲同住于此，二楼有玲奈子与遥奈各自的房间，客厅摆着全家共用的沙发与电视游戏机。',
    interiorId: 'amaori-family-home', district: 'old-town-lowrise', parentLocationId: 'home', districtArt: true,
  },
  {
    id: 'ouzuka-residence', type: 'traditional-courtyard', label: '王冢家宅邸',
    description: '目白台高地的王冢家豪宅，配有宽敞的西式会客室、私人庭院与试衣间；王冢真唯、母亲王冢露涅、专职管家花取单衣居住于此，露西来日期间亦下榻于宅邸客房。',
    interiorId: 'ouzuka-residence', district: 'traditional-downtown', parentLocationId: 'downtown', districtArt: false,
  },
  {
    id: 'sena-family-home', type: 'modern-open-plan', label: '濑名家住宅',
    description: '杂司谷安静街区的家庭公寓；濑名紫阳花与双职工父母及两个年幼弟弟（濑名广树、濑名桔平）同住，厨房与客厅总是飘着紫阳花手作料理的香气。',
    interiorId: 'sena-family-home', district: 'older-apartment-courtyard', parentLocationId: 'home', districtArt: true,
  },
  {
    id: 'koto-apartment', type: 'riverfront-highrise', label: '琴家公寓',
    description: '高田至池袋方向的普通单元公寓；琴纱月与单亲母亲（琴之母）同住，纱月的房间里整齐排列着满墙的文学文库本。',
    interiorId: 'koto-apartment', district: 'riverfront-highrise-district', parentLocationId: 'commercial', districtArt: true,
  },
  {
    id: 'koyanagi-home', type: 'shared-apartment', label: '小柳家住宅',
    description: '西早稻田／高田一带的住宅；小柳香穗的房间内设有专业的Cosplay缝纫工作台、假发架与环形补光灯。',
    interiorId: 'koyanagi-home', district: 'older-apartment-courtyard', parentLocationId: 'junction', districtArt: true,
  },
  {
    id: 'onigawara-laundry-home', type: 'old-family-house', label: '鬼瓦洗衣店住宅',
    description: '杂司谷商店街旁「鬼瓦洗衣店」一楼店面与二楼起居室合一的住宅，鬼瓦星来与家人同住于此。',
    interiorId: 'onigawara-laundry-home', district: 'old-town-lowrise', parentLocationId: 'home', districtArt: true,
  },
  {
    id: 'terazawa-flat', type: 'studio-apartment', label: '照泽家公寓',
    description: '护国寺／城市公园附近的安静公寓，照泽耀子整理校园情报与休息的住处。',
    interiorId: 'terazawa-flat', district: 'lakeside-apartment', parentLocationId: 'city-park', districtArt: false,
  },
  {
    id: 'hirosaki-staff-flat', type: 'studio-apartment', label: '广崎教员公寓',
    description: '靠近高田校区的教员单身公寓，1年A组班主任广崎美智留的住处。',
    interiorId: 'hirosaki-staff-flat', district: 'lakeside-apartment', parentLocationId: 'city-park', districtArt: false,
  },
  {
    id: 'takada-residence', type: 'riverfront-highrise', label: '高田家宅邸',
    description: '目白台的高级住宅，1年B组「5déesse」领袖高田卑弥呼的住处。',
    interiorId: 'takada-residence', district: 'traditional-downtown', parentLocationId: 'downtown', districtArt: false,
  },
  {
    id: 'haga-residence', type: 'modern-open-plan', label: '羽贺家住宅',
    description: '杂司谷一带的安静住宅，羽贺铃兰的住处。',
    interiorId: 'haga-residence', district: 'old-town-lowrise', parentLocationId: 'home', districtArt: true,
  },
  {
    id: 'kamezaki-residence', type: 'riverfront-highrise', label: '龟崎家公寓',
    description: '神田川沿岸的现代公寓，龟崎千鹤的住处。',
    interiorId: 'kamezaki-residence', district: 'riverfront-highrise-district', parentLocationId: 'commercial', districtArt: true,
  },
  {
    id: 'nemoto-residence', type: 'shared-apartment', label: '根本家公寓',
    description: '高田街区附近的公寓，根本美纪的住处。',
    interiorId: 'nemoto-residence', district: 'older-apartment-courtyard', parentLocationId: 'junction', districtArt: true,
  },
]);

export const allHousings: readonly MajoHousing[] = Object.freeze([...majoHousings, ...watanareHousings]);

const housingByPerson: Readonly<Record<string, string>> = Object.freeze({
  'majo-emma': 'emma-yuki-home',
  'majo-yuki': 'emma-yuki-home',
  'majo-nanoka': 'nanoka-honoka-home',
  'majo-honoka': 'nanoka-honoka-home',
  'majo-koko': 'koko-old-house',
  'majo-hiro': 'nikaido-house',
  'majo-anan': 'anan-noa-milia-home',
  'majo-noa': 'anan-noa-milia-home',
  'majo-milia': 'anan-noa-milia-home',
  'majo-sherry': 'sherry-hanna-home',
  'majo-hanna': 'sherry-hanna-home',
  'watanare-renako': 'amaori-family-home',
  'watanare-haruna': 'amaori-family-home',
  'watanare-miyoko': 'amaori-family-home',
  'watanare-mai': 'ouzuka-residence',
  'watanare-rene': 'ouzuka-residence',
  'watanare-hitoe': 'ouzuka-residence',
  'watanare-lucie': 'ouzuka-residence',
  'watanare-ajisai': 'sena-family-home',
  'watanare-hiroki': 'sena-family-home',
  'watanare-kippei': 'sena-family-home',
  'watanare-satsuki': 'koto-apartment',
  'watanare-koto-mother': 'koto-apartment',
  'watanare-kaho': 'koyanagi-home',
  'watanare-seira': 'onigawara-laundry-home',
  'watanare-youko': 'terazawa-flat',
  'watanare-michiru': 'hirosaki-staff-flat',
  'watanare-himiko': 'takada-residence',
  'watanare-suzuran': 'haga-residence',
  'watanare-chizuru': 'kamezaki-residence',
  'watanare-miki': 'nemoto-residence',
});

/** Stable outfit descriptors used by schedules and prompts; not a claim of complete art. */
const residentOutfits: Readonly<Record<string, string>> = Object.freeze({
  'majo-hiro': '和服',
});

export function housingForPerson(personId: string): MajoHousing | null {
  const housingId = housingByPerson[personId];
  return housingId ? allHousings.find(housing => housing.id === housingId) ?? null : null;
}

export function housingForHomeMarker(home: string): MajoHousing | null {
  return allHousings.find(housing => housing.id === home) ?? null;
}

export function housingForInterior(interiorId: string): MajoHousing | null {
  return allHousings.find(housing => housing.interiorId === interiorId) ?? null;
}

export function residentOutfit(personId: string): string | null {
  return residentOutfits[personId] ?? null;
}

/** Game-prototype district assignment for existing map locations. */
export const residentDistrictByLocation: Readonly<Record<string, MajoDistrictType>> = Object.freeze({
  home: 'old-town-lowrise',
  commercial: 'riverfront-highrise-district',
  downtown: 'traditional-downtown',
  neighborhood: 'older-apartment-courtyard',
  'city-park': 'lakeside-apartment',
  residences: 'student-shared',
});

export function districtForLocation(locationId: string): MajoDistrictType | null {
  return residentDistrictByLocation[locationId] ?? null;
}

/** A resident's current authored home marker, with a safe fallback for older data. */
export function residentHomeMarker(personId: string): string | null {
  return residentById(personId)?.home ?? null;
}
